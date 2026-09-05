// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SEVEN-SEGMENT FIGURES — the numerals on the dial faces, and the LED
// readouts that MOVE: the gear digit in the binnacle and the rally
// tripmeter on the fascia.
//
// A figure is seven bars and a point, the way every period instrument that
// had to show a number it could not print did it — and at arm's length
// through a steering wheel that is also the most legible thing a low-poly
// cabin can carry: a bar is a quad, a digit is at most sixteen triangles,
// and the eye reads the SHAPE of the lit bars before it reads any edge.
//
// Two uses of the same bars, and they are kept apart on purpose. The
// numerals round a dial are STATIC and go into the instrument mesh with the
// ticks, baked once. The readouts are LIVE and are a mesh of their own whose
// vertex colours are rewritten when the figure changes: every bar of every
// digit is always there, lit or ghosted, so a new reading is a colour write
// on a fixed buffer rather than geometry coming and going — one draw call
// per readout, and no allocation when the trip ticks over.
//
// Everything is laid out in a flat xy plane, +x right and +y up, facing +z;
// whoever places a display carries it onto the dash with the same
// rotate-then-translate the dials use (`onDial` in cockpit-dials.ts), so a
// readout and the dial beside it can never lean differently.

import * as THREE from "three";

/** The bars, as bits: the classic a..g clockwise from the top, then the
 * decimal point. A figure is the OR of its bars. */
const A = 1;
const B = 2;
const C = 4;
const D = 8;
const E = 16;
const F = 32;
const G = 64;
export const POINT = 128;

/** What lights for each character the readouts can be asked for: the ten
 * digits, the two gears that are not a number, a dash for a reading that
 * is not there yet, and a blank. Anything else is drawn blank rather than
 * thrown on — an instrument with a bad reading shows nothing, it does not
 * take the dashboard down. */
export const FIGURES: Readonly<Record<string, number>> = {
  "0": A | B | C | D | E | F,
  "1": B | C,
  "2": A | B | D | E | G,
  "3": A | B | C | D | G,
  "4": B | C | F | G,
  "5": A | C | D | F | G,
  "6": A | C | D | E | F | G,
  "7": A | B | C,
  "8": A | B | C | D | E | F | G,
  "9": A | B | C | D | F | G,
  n: C | E | G,
  r: E | G,
  "-": G,
  " ": 0,
};

export function figureBits(ch: string): number {
  return FIGURES[ch] ?? 0;
}

/** A bar's box in the digit's own plane, metres, with the corner order the
 * quad is wound in. */
export type Bar = { x0: number; y0: number; x1: number; y1: number };

/** The proportions of a figure, as fractions of its HEIGHT: how wide it is,
 * how thick a bar is, and how far the point stands off its bottom right. A
 * tall narrow figure with thin bars is the period LED; a squat one with
 * fat bars is a calculator. */
const SHAPE = { width: 0.56, bar: 0.13, point: 0.22, pitch: 0.82 };

/** The eight bars of one figure, at `height` metres tall, centred on `cx`.
 * Horizontal bars are shortened by a bar's width at each end and the
 * verticals by half of one at each, so the corners meet in the chamfer a
 * real segment display has instead of overlapping into a blob. */
export function figureBars(height: number, cx = 0): Bar[] {
  const h = height;
  const w = h * SHAPE.width;
  const t = h * SHAPE.bar;
  const hx = w / 2 - t; // half-length of a horizontal bar
  const vy = h / 4 - t * 0.55; // half-length of a vertical bar
  const box = (x: number, y: number, hw: number, hh: number): Bar => ({
    x0: cx + x - hw,
    y0: y - hh,
    x1: cx + x + hw,
    y1: y + hh,
  });
  return [
    box(0, h / 2 - t / 2, hx, t / 2), // a
    box(w / 2 - t / 2, h / 4, t / 2, vy), // b
    box(w / 2 - t / 2, -h / 4, t / 2, vy), // c
    box(0, -h / 2 + t / 2, hx, t / 2), // d
    box(-w / 2 + t / 2, -h / 4, t / 2, vy), // e
    box(-w / 2 + t / 2, h / 4, t / 2, vy), // f
    box(0, 0, hx, t / 2), // g
    box(w / 2 + h * SHAPE.point - t / 2, -h / 2 + t / 2, t / 2, t / 2), // point
  ];
}

/** How far apart figure centres stand in a run of `digits`, m. */
export function figurePitch(height: number): number {
  return height * SHAPE.pitch;
}

/** The bars a string lights, laid out left to right and centred on x = 0,
 * for the STATIC case: what goes round a dial. A point in the text lights
 * the point of the figure before it and takes no room of its own.
 *
 * `mirror` reverses x, for a face that is going to be seen from behind. The
 * dial faces are NOT that case: their half-turn about y (cockpit-dials.ts)
 * lands the plane's +x on the driver's right, so what reads here reads in
 * the car. */
export function textBars(text: string, height: number, mirror = false): Bar[] {
  const glyphs = text.replace(/\./g, "");
  const pitch = figurePitch(height);
  const left = (-(glyphs.length - 1) * pitch) / 2;
  const out: Bar[] = [];
  let slot = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch === ".") continue;
    let bits = figureBits(ch);
    if (text[i + 1] === ".") bits |= POINT;
    const bars = figureBars(height, left + slot * pitch);
    for (let k = 0; k < 8; k++) if (bits & (1 << k)) out.push(bars[k] as Bar);
    slot++;
  }
  if (!mirror) return out;
  return out.map((b) => ({ x0: -b.x1, y0: b.y0, x1: -b.x0, y1: b.y1 }));
}

/** The bars as one geometry of quads facing +z at `z`, wound to be seen
 * from +z. Indexed, so `solid()` in car/builder.ts can bake it like any
 * other primitive. */
export function barsGeometry(bars: readonly Bar[], z = 0): THREE.BufferGeometry {
  const pos = new Float32Array(bars.length * 12);
  const idx: number[] = [];
  bars.forEach((b, i) => {
    const o = i * 12;
    pos.set([b.x0, b.y0, z, b.x1, b.y0, z, b.x1, b.y1, z, b.x0, b.y1, z], o);
    const v = i * 4;
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

/** A panel of lamps that can each be lit or ghosted by rewriting the
 * colour on its four corners — the primitive under both the readouts and
 * the tell-tales. `set` takes one entry per lamp, in the order the lamps
 * were given, nonzero for lit; the caller keeps the array and mutates it,
 * so a reading that has not changed costs a compare and no write. */
export type LampPanel = {
  mesh: THREE.Mesh;
  set: (lit: ArrayLike<number>) => void;
  dispose: () => void;
};

export type Lamp = Bar & { lit: number; dark: number };

/**
 * Build a lamp panel from its lamps. `place` carries the flat geometry onto
 * the dash — the readouts hand in the same transform the dials are built
 * with. `material` is the cockpit's INSTRUMENT material: it takes vertex
 * colour and is exempt from the world's light, which is what a lit LED is.
 */
export function buildLampPanel(
  lamps: readonly Lamp[],
  place: (geo: THREE.BufferGeometry) => THREE.BufferGeometry,
  material: THREE.Material,
): LampPanel {
  const geo = place(barsGeometry(lamps));
  // The attribute is built ON the array rather than from it — the typed
  // constructor copies whatever it is handed, and a panel writing into its
  // own copy is a panel whose lamps never come on.
  const colors = new Float32Array(lamps.length * 12);
  const attr = new THREE.BufferAttribute(colors, 3);
  geo.setAttribute("color", attr);
  const mesh = new THREE.Mesh(geo, material);
  const lit = lamps.map((l) => new THREE.Color(l.lit));
  const dark = lamps.map((l) => new THREE.Color(l.dark));
  const shown = new Uint8Array(lamps.length).fill(2);
  const set = (state: ArrayLike<number>): void => {
    let moved = false;
    for (let i = 0; i < lamps.length; i++) {
      const on = state[i] ? 1 : 0;
      if (shown[i] === on) continue;
      shown[i] = on;
      moved = true;
      const c = on ? (lit[i] as THREE.Color) : (dark[i] as THREE.Color);
      for (let k = 0; k < 4; k++) {
        const o = (i * 4 + k) * 3;
        colors[o] = c.r;
        colors[o + 1] = c.g;
        colors[o + 2] = c.b;
      }
    }
    if (moved) attr.needsUpdate = true;
  };
  set(shown.map(() => 0));
  return { mesh, set, dispose: () => geo.dispose() };
}

/** A live run of figures. `set` right-aligns the text into the digits — a
 * trip of 3.4 km on a five-figure meter reads `  3.40`, with the leading
 * figures ghosted the way an LED display leaves them. */
export type Readout = {
  mesh: THREE.Mesh;
  set: (text: string) => void;
  dispose: () => void;
};

/** The colours a readout lights in: the LED and the ghost of the bars that
 * are off, which a real display never quite hides. */
export type ReadoutTone = { lit: number; dark: number };

export function buildReadout(
  digits: number,
  height: number,
  tone: ReadoutTone,
  place: (geo: THREE.BufferGeometry) => THREE.BufferGeometry,
  material: THREE.Material,
): Readout {
  const pitch = figurePitch(height);
  const left = (-(digits - 1) * pitch) / 2;
  const lamps: Lamp[] = [];
  for (let d = 0; d < digits; d++) {
    for (const bar of figureBars(height, left + d * pitch)) lamps.push({ ...bar, ...tone });
  }
  const panel = buildLampPanel(lamps, place, material);
  const state = new Uint8Array(digits * 8);
  let shown = "";
  const set = (text: string): void => {
    if (text === shown) return;
    shown = text;
    // Figures right-aligned; a point rides the figure before it.
    state.fill(0);
    let slot = digits - 1;
    for (let i = text.length - 1; i >= 0 && slot >= 0; i--) {
      const ch = text[i] as string;
      if (ch === ".") continue;
      let figure = figureBits(ch);
      if (text[i + 1] === ".") figure |= POINT;
      for (let k = 0; k < 8; k++) state[slot * 8 + k] = figure & (1 << k) ? 1 : 0;
      slot--;
    }
    panel.set(state);
  };
  set(" ");
  return { mesh: panel.mesh, set, dispose: panel.dispose };
}
