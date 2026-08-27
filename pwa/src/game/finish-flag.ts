// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FINISH FLAGS on the attract screen — checkered cloth on a marshal's
// pole, flapping behind the game's name.
//
// Drawn as SVG rather than in the world, because of WHEN it has to appear:
// the card is what stands in front of the player while three.js and the world
// builder are still loading, so anything on it that needed the render stack
// would arrive at the one moment it cannot. SVG also scales to any viewport
// off one viewBox, which a card that has to hold on a phone in portrait and a
// desktop in landscape gets for free.
//
// The cloth is a MESH, not a texture with a filter over it: a grid of flat
// quads, each one filled with a single shaded colour, which is the same
// fullbright low-poly language the rest of the game is drawn in. A smooth
// displacement-mapped ripple would be the odd one out on screen.
//
// It runs only while the card is on the ready beat — never during the load,
// where every frame belongs to the world builder.

import { PALETTE } from "../identity.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;

/** Rows of checks down the drop. The columns are DERIVED from them and from
 * the cloth's own shape, so that a check comes out square on a long flag and
 * on a stubby one alike — an oblong check reads as a stretched texture, which
 * is the one thing a flag made of flat quads must never look like. */
const ROWS = 5;
/** …and the range that derived count is held inside. Under seven columns the
 * ripple is a zigzag rather than a curve; over fourteen the checks are
 * confetti at the size this card draws them. */
const MIN_COLS = 7;
const MAX_COLS = 14;

/** Ripples travelling the cloth at once, per unit of its aspect ratio — a
 * long flag carries more of them, which is what a long flag does. */
const WAVE_PER_ASPECT = 0.62;
/** Flaps per second — a flag being WAVED at a finish line, not a pennant
 * hanging in a breeze. */
const FLAP_HZ = 0.85;
/** How far the fly end swings out of the plane, as a fraction of the cloth's
 * span. Stated as a fraction so one set of numbers drives every size of flag
 * the card hangs. */
const AMPLITUDE = 0.2;
/** How much of that swing comes back as horizontal bunching. This is the
 * whole illusion: a cloth that only moved up and down reads as a wobbling
 * sheet, and one whose columns crowd where it turns away reads as depth. */
const DEPTH_X = 0.5;
/** How much the fly end also rides up and down on the same wave. */
const BOB = 0.65;
/** The ripple's lean, radians across the drop: the fold reaches the bottom
 * edge a little after the top, the way cloth actually creases. */
const ROW_SKEW = 0.6;
/** Gravity on the unsupported fly end, as a fraction of the cloth's span. */
const DROOP = 0.05;
/** Shade steps in the colour table. Enough for the roll to look continuous,
 * few enough that every fill written is an existing string. */
const SHADES = 14;
/** How dark the fold turning away from the light goes, as a fraction of the
 * square's full colour. Kept high enough that a white check in shadow still
 * reads as WHITE: past about half, the flag stops being black-and-white and
 * turns into a grey one, which is a different flag entirely. */
const SHADE_FLOOR = 0.68;
/** Where in the wave the light lands, radians. Offsetting it off the crest is
 * what puts the highlight on the SLOPE facing the sun rather than on the top
 * of every fold, which is what a rounded ripple would do. */
const LIGHT_PHASE = -0.9;

/** The finish flag's two squares. The light one is the game's own white — the
 * rumble strips at every gate are painted in it — and the dark one is a navy
 * black rather than `#000`, so the flag sits inside the same saturated
 * palette as the sky behind it instead of punching a hole in it. */
const CLOTH_LIGHT = PALETTE.rumbleWhite;
const CLOTH_DARK = "#1b2233";
/** The pole: a bare aluminium marshal's staff, lit from the same side as the
 * cloth. */
const POLE_LIT = "#d5e0ec";
const POLE_SHADE = "#8194aa";

/** One flag: where it is planted, how it leans, and how big its cloth is. */
interface ClothSpec {
  /** The pole's butt, in viewBox units. */
  x: number;
  y: number;
  /** Pole length, and its lean in degrees — positive tips the top to the
   * right, before any mirroring. */
  pole: number;
  lean: number;
  /** The cloth's span from hoist to fly, and its drop. */
  w: number;
  h: number;
  /** How far off level the cloth sits where it meets the pole, degrees —
   * positive falls away from the hoist. Set to MATCH the pole's lean, so the
   * cloth carries the staff's angle on outward and the flag and its pole read
   * as one line rather than two: a cloth held level under a leaned staff is
   * the join the eye picks out first. */
  tilt: number;
  /** Planted facing the other way: pole leaning left, cloth flying left. */
  mirror: boolean;
  /** Where in the flap this cloth starts, radians. Two flags moving in
   * lockstep read as one hinged object rather than two pieces of cloth. */
  phase: number;
}

/**
 * The crest: two flags crossed, planted apart so the staffs make an X a little
 * over halfway up rather than a V, with the cloths flying outward off the top
 * of it. The pair is drawn ABOVE the title rather than behind it — a
 * checkerboard under lettering is a checkerboard you cannot read lettering
 * off.
 *
 * The numbers fill {@link VIEW_BOX} deliberately: the box is the drawn extent
 * of the pair mid-flap, and the clear strip left under the butts at y=118 is
 * what holds the crest off the game's name at every viewport. The cloths fall
 * away at the staffs' own angle, which keeps them inside the poles' vertical
 * span — so the box is only as tall as the staffs, and as wide as the cloths
 * reach.
 *
 * `.splash-flags` in `styles.css` restates this ratio to reserve the space
 * before a flag is hung: change one, change both.
 */
const VIEW_BOX = "46 0 208 128";

const CLOTHS: ClothSpec[] = [
  { x: 118, y: 118, pole: 122, lean: 26, w: 83, h: 48, tilt: 26, mirror: false, phase: 0 },
  { x: 182, y: 118, pole: 122, lean: 26, w: 83, h: 48, tilt: 26, mirror: true, phase: 2.3 },
];

/** A cloth's live drawing state: its cells, the numbers derived from its
 * shape, its reusable node buffers, and the shade each cell is currently
 * wearing so an unchanged fill is not rewritten every frame. */
interface Cloth {
  spec: ClothSpec;
  /** Checks across, derived so they come out square. */
  cols: number;
  /** Ripples on the cloth at once, derived from its aspect. */
  turns: number;
  /** {@link AMPLITUDE} and {@link DROOP} resolved to viewBox units. */
  amp: number;
  droop: number;
  cells: SVGPolygonElement[];
  shade: Int8Array;
  xs: Float32Array;
  ys: Float32Array;
}

/** `hex` stepped down to {@link SHADE_FLOOR} in {@link SHADES} steps, as CSS
 * colour strings — built once so the frame loop allocates nothing. */
function ramp(hex: string): string[] {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return Array.from({ length: SHADES }, (_, i) => {
    const mul = SHADE_FLOOR + ((1 - SHADE_FLOOR) * i) / (SHADES - 1);
    return `rgb(${Math.round(r * mul)} ${Math.round(g * mul)} ${Math.round(b * mul)})`;
  });
}

const RAMP_LIGHT = ramp(CLOTH_LIGHT);
const RAMP_DARK = ramp(CLOTH_DARK);

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** The pole, its shaded side, and the finial — everything that does not move. */
function buildPole(spec: ClothSpec): SVGGElement {
  const group = el("g", { transform: `rotate(${spec.lean})` });
  const top = -spec.pole;
  group.append(
    el("rect", { x: -2.2, y: top, width: 4.4, height: spec.pole + 2, rx: 1.6, fill: POLE_LIT }),
    el("rect", { x: 0.4, y: top, width: 1.8, height: spec.pole + 2, fill: POLE_SHADE }),
    el("circle", { cx: 0, cy: top, r: 3.4, fill: POLE_LIT }),
  );
  return group;
}

/** One flag's whole group: pole, then the cloth's cells hung off its top. */
function buildCloth(spec: ClothSpec): { group: SVGGElement; cloth: Cloth } {
  const lean = (spec.lean * Math.PI) / 180;
  const aspect = spec.w / spec.h;
  const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, Math.round(ROWS * aspect)));
  const group = el("g", {
    transform: `translate(${spec.x} ${spec.y})${spec.mirror ? " scale(-1 1)" : ""}`,
  });
  group.append(buildPole(spec));

  // The cloth hangs off the pole's top, level-ish rather than square to the
  // staff — hence `tilt` instead of `lean` here.
  const tipX = Math.sin(lean) * spec.pole;
  const tipY = -Math.cos(lean) * spec.pole;
  const sheet = el("g", { transform: `translate(${tipX} ${tipY}) rotate(${spec.tilt})` });
  const cells: SVGPolygonElement[] = [];
  for (let i = 0; i < cols * ROWS; i++) {
    const cell = el("polygon", { points: "" });
    cells.push(cell);
    sheet.append(cell);
  }
  group.append(sheet);

  const nodes = (cols + 1) * (ROWS + 1);
  return {
    group,
    cloth: {
      spec,
      cols,
      turns: Math.max(1, aspect * WAVE_PER_ASPECT),
      amp: spec.w * AMPLITUDE,
      droop: spec.w * DROOP,
      cells,
      shade: new Int8Array(cols * ROWS).fill(-1),
      xs: new Float32Array(nodes),
      ys: new Float32Array(nodes),
    },
  };
}

/** The wave's phase at (u, v) on the cloth at time `t` seconds. */
function wavePhase(cloth: Cloth, u: number, v: number, t: number): number {
  return u * cloth.turns * TAU + v * ROW_SKEW - t * FLAP_HZ * TAU + cloth.spec.phase;
}

/** Move every node, then re-point and re-shade every cell. */
function updateCloth(cloth: Cloth, t: number): void {
  const { w, h } = cloth.spec;
  const { cols, xs, ys } = cloth;
  for (let i = 0; i <= cols; i++) {
    const u = i / cols;
    // Quadratic growth: the hoist is pinned to a rigid staff and barely
    // moves, and everything the wave has to give ends up in the fly.
    const amp = cloth.amp * u * u;
    for (let j = 0; j <= ROWS; j++) {
      const v = j / ROWS;
      const ph = wavePhase(cloth, u, v, t);
      const z = Math.sin(ph) * amp;
      const k = i * (ROWS + 1) + j;
      xs[k] = u * w + z * DEPTH_X;
      // The bottom edge swings wider than the top: the top is held taut along
      // the whole hoist, the bottom is held at one corner.
      ys[k] = v * h + Math.sin(ph + 0.8) * amp * BOB * (0.55 + 0.45 * v) + cloth.droop * u * u;
    }
  }

  const stride = ROWS + 1;
  for (let i = 0; i < cols; i++) {
    const a = i * stride;
    const b = (i + 1) * stride;
    // Shading is per COLUMN — the fold runs down the cloth, so every cell in
    // one column faces the light the same way. Flattened toward the hoist,
    // where there is no fold to catch anything.
    const uc = (i + 0.5) / cols;
    const roll = Math.cos(wavePhase(cloth, uc, 0.5, t) + LIGHT_PHASE) * Math.min(1, uc * 1.7);
    const shade = Math.round((0.5 + 0.5 * roll) * (SHADES - 1));
    for (let j = 0; j < ROWS; j++) {
      const key = i * ROWS + j;
      const cell = cloth.cells[key];
      cell.setAttribute(
        "points",
        `${xs[a + j].toFixed(1)},${ys[a + j].toFixed(1)} ` +
          `${xs[b + j].toFixed(1)},${ys[b + j].toFixed(1)} ` +
          `${xs[b + j + 1].toFixed(1)},${ys[b + j + 1].toFixed(1)} ` +
          `${xs[a + j + 1].toFixed(1)},${ys[a + j + 1].toFixed(1)}`,
      );
      if (cloth.shade[key] === shade) continue;
      cloth.shade[key] = shade;
      cell.setAttribute("fill", ((i + j) % 2 === 0 ? RAMP_LIGHT : RAMP_DARK)[shade]);
    }
  }
}

/**
 * Hang the crest inside `host` and start it flapping. Returns the
 * teardown — call it when the card leaves, or the frame loop outlives the
 * screen it was drawn for.
 *
 * A player who has asked for reduced motion gets the same flags, drawn once
 * at rest: the flag is the picture, and the flapping is the flourish.
 */
export function mountFinishFlags(host: Element): () => void {
  const svg = el("svg", {
    class: "splash-flag-svg",
    viewBox: VIEW_BOX,
    // The card is the title, not the flags; a screen reader reading out a
    // decorative crest is noise between the house's name and the prompt.
    "aria-hidden": "true",
    focusable: "false",
  });
  const cloths = CLOTHS.map((spec) => {
    const { group, cloth } = buildCloth(spec);
    svg.append(group);
    return cloth;
  });
  host.append(svg);

  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (still) {
    for (const cloth of cloths) updateCloth(cloth, 0);
    return () => svg.remove();
  }

  let raf = 0;
  const started = performance.now();
  const frame = (now: number): void => {
    const t = (now - started) / 1000;
    for (const cloth of cloths) updateCloth(cloth, t);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    svg.remove();
  };
}
