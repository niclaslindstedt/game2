// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WEB IN THE GLASS. A pane does not go from clear to gone: the engine
// crazes it toward the crush that finishes it (`glassCrack`), and the whole
// of the way there is a screen the driver is still looking through. This
// module is what they are looking through — a spider's web of bright
// hairlines laid on each pane, revealed a branch at a time as the ledger
// climbs.
//
// It is authored in METRES on the pane, not in its (u, v): a cabin flank is
// a warped patch whose sill is longer than its header, and a star drawn in
// fractions of that comes out as a fan leaning downhill. So each crack is
// walked out from an impact point in real distances, mapped back through
// the rect's own lean and the patch's bilinear sample, and lifted along the
// patch normal so it sits on the glass rather than in it.
//
// Each segment carries the crack level it APPEARS at, and the reveal is
// alpha alone — the geometry is built once and never rebuilt, because the
// ledger can move dozens of times a second while a car grinds along a
// hillside on one flank. The mesh is double-sided for the one view that
// matters most: from the driver's own seat, where a crack across the screen
// is the thing standing between them and the next corner.

import * as THREE from "three";

import { patchAt, patchNormal, rectAt, type V3 } from "./builder.ts";
import { GLASS_LIFT, screenPanes, type GlassPane, type ScreenPane } from "./greenhouse.ts";
import type { CarBodySpec } from "./spec.ts";

/** How far proud of the glass the cracks sit, m — clear of the pane and of
 * the grime film the wipers keep over it (`wipers.ts`'s `FILM_LIFT`), so a
 * dirty screen is a cracked screen and not a clean one. */
const CRACK_LIFT = GLASS_LIFT + 0.006;
/** How wide a hairline is drawn, m. A real crack is a hair across; a hair
 * across is invisible at the distance a car is seen from, and glass that
 * cracks and reads as nothing is glass that did not crack. This is the
 * width at which the line survives the chase camera and still reads as a
 * line rather than as a stripe of tape. */
const CRACK_WIDTH = 0.008;
/** What a crack is: the white of glass that has stopped being transparent,
 * with the sky's own blue left in it so it does not read as paint. */
const CRACK_COLOR = 0xe4eef6;
/** ...and how solid the line is where it has fully opened. Under 1 so the
 * cabin still shows through the web rather than the web becoming a wall. */
const CRACK_ALPHA = 0.85;
/** How long a crack's first, second and third reach are, m — a chip opens
 * a short leg, and each leg it throws after that runs further than the one
 * before it, which is what makes the web read as spreading rather than as
 * a drawn asterisk. */
const LEGS = [0.09, 0.15, 0.24];
/** How far a leg wanders off the one before it, rad — a crack in glass
 * follows the stress and never runs straight. */
const WANDER = 0.34;
/** How many radial branches a full-sized pane's web has... */
const RAYS = 9;
/** ...and how small a pane has to be, m across its shorter side, before it
 * is given fewer: a quarter light with nine branches in it is a white
 * patch rather than a cracked window. */
const SMALL_PANE = 0.35;
const SMALL_RAYS = 5;
/** The crack level the FIRST hairline shows at, and the spread over which
 * the rest of the branches join it. A pane that has taken a fifth of what
 * will finish it is a pane with a mark in the corner of it; one at nine
 * tenths is a pane the driver is peering around. */
const FIRST_AT = 0.07;
const RAYS_OVER = 0.68;
/** ...and how much further up the ledger each leg of a branch is. */
const LEG_STEP = 0.13;
/** The two rings that tie the branches together, as the levels they close
 * at. A web without them is a starburst; the rings are what turn it into
 * broken glass. */
const RINGS = [0.6, 0.85];

/** The panes' cracks, one mesh over the lot of them. */
export type GlassCracks = {
  mesh: THREE.Mesh;
  /** Draw `pane` cracked this far, 0 (clear) .. 1 (a full web). Cheap
   * enough to call every frame; it does nothing when nothing moved. */
  set: (pane: GlassPane, level: number) => void;
  /** The pane has left its frame — its cracks left with it. */
  clear: (pane: GlassPane) => void;
  /** The web that was showing on `pane` at `level`, as loose triangles in
   * the body's own space: what the PLATE that flies off carries away with
   * it, so a screen that popped out crazed is crazed where it lands. */
  webOf: (pane: GlassPane, level: number) => { position: number[]; color: number[] };
  dispose: () => void;
};

/** How much of the ledger a hairline takes to open once it has been
 * reached. Without a ramp a branch appears whole between two frames, which
 * reads as a flicker rather than as glass giving. */
const OPEN_OVER = 0.1;

/** One hairline: where its quad sits in the mesh, the crack level it opens
 * at, and the line itself — kept so the PLATE that flies off can be handed
 * the same web without re-deriving it. */
type Hairline = {
  start: number;
  count: number;
  at: number;
  sheet: Sheet;
  a: [number, number];
  b: [number, number];
};

/** A deterministic wander, so one car's screen cracks the same way every
 * time it is built and two cars do not craze identically. */
function noise(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** The pane as a plane to draw on: where a point `x` metres across and `y`
 * metres up from the pane's own bottom-left lands in the world, and how big
 * the pane is. Both go through the rect's lean, so a crack on a raked
 * quarter light stays inside the glass. */
type Sheet = {
  w: number;
  h: number;
  at: (x: number, y: number) => V3;
};

function sheetOf(pane: ScreenPane): Sheet {
  const w = pane.span.u * Math.abs(pane.rect.u1 - pane.rect.u0);
  const h = pane.span.v * Math.abs(pane.rect.v1 - pane.rect.v0);
  const n = patchNormal(pane.patch);
  // A mirrored patch hands back a normal pointing INTO the cabin, exactly
  // as it does for the glass itself — lift the other way or the web is
  // drawn behind the window it belongs to.
  const lift = pane.mirrored ? -CRACK_LIFT : CRACK_LIFT;
  return {
    w,
    h,
    at: (x, y) => {
      const [u, v] = rectAt(pane.rect, w > 0 ? x / w : 0, h > 0 ? y / h : 0);
      const p = patchAt(pane.patch, u, v);
      return [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
    },
  };
}

/** Where each pane's web starts: off centre, and low, because that is where
 * a stone off the car in front lands and because a crack through the middle
 * of the driver's own sightline is a screen nobody can play behind. */
const ORIGIN = { x: 0.62, y: 0.36 };

/** The hairlines one pane's web is made of, in the pane's own metres. */
function webOn(
  sheet: Sheet,
  seed: number,
): { a: [number, number]; b: [number, number]; at: number }[] {
  const rnd = noise(seed);
  const lines: { a: [number, number]; b: [number, number]; at: number }[] = [];
  const rays = Math.min(sheet.w, sheet.h) < SMALL_PANE ? SMALL_RAYS : RAYS;
  const ox = sheet.w * (ORIGIN.x + (rnd() - 0.5) * 0.16);
  const oy = sheet.h * (ORIGIN.y + (rnd() - 0.5) * 0.16);
  const inside = (x: number, y: number): boolean =>
    x > 0.012 && y > 0.012 && x < sheet.w - 0.012 && y < sheet.h - 0.012;
  // The joints, ray by ray and leg by leg — kept so the rings can be strung
  // between the branches rather than drawn as circles nothing is attached
  // to. A ray stopped by the pane's edge leaves a shorter list, and the
  // ring simply skips the gap.
  const joints: [number, number][][] = [];
  for (let ray = 0; ray < rays; ray++) {
    const at = FIRST_AT + (RAYS_OVER * ray) / rays;
    let angle = ((ray + rnd() * 0.6) / rays) * Math.PI * 2;
    let x = ox;
    let y = oy;
    const mine: [number, number][] = [];
    for (let leg = 0; leg < LEGS.length; leg++) {
      angle += (rnd() - 0.5) * WANDER;
      const nx = x + Math.cos(angle) * LEGS[leg];
      const ny = y + Math.sin(angle) * LEGS[leg];
      if (!inside(nx, ny)) break;
      lines.push({ a: [x, y], b: [nx, ny], at: Math.min(0.97, at + leg * LEG_STEP) });
      x = nx;
      y = ny;
      mine.push([x, y]);
    }
    joints.push(mine);
  }
  for (let ring = 0; ring < RINGS.length; ring++) {
    for (let ray = 0; ray < rays; ray++) {
      const a = joints[ray][ring];
      const b = joints[(ray + 1) % rays][ring];
      if (a && b) lines.push({ a, b, at: RINGS[ring] });
    }
  }
  return lines;
}

const CRACK_RGB = new THREE.Color(CRACK_COLOR);

/** One hairline as a quad on the sheet — a strip `CRACK_WIDTH` wide, laid
 * along the line and squared off at both ends. */
function hairline(
  sheet: Sheet,
  a: [number, number],
  b: [number, number],
  into: { position: number[]; color: number[] },
  alpha: number,
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return 0;
  const hx = (-dy / len) * (CRACK_WIDTH / 2);
  const hy = (dx / len) * (CRACK_WIDTH / 2);
  const corners = [
    sheet.at(a[0] - hx, a[1] - hy),
    sheet.at(b[0] - hx, b[1] - hy),
    sheet.at(b[0] + hx, b[1] + hy),
    sheet.at(a[0] + hx, a[1] + hy),
  ];
  for (const [i, j, k] of [
    [0, 1, 2],
    [0, 2, 3],
  ]) {
    for (const at of [corners[i], corners[j], corners[k]]) {
      into.position.push(at[0], at[1], at[2]);
      into.color.push(CRACK_RGB.r, CRACK_RGB.g, CRACK_RGB.b, alpha);
    }
  }
  return 6;
}

/** The pane a cabin panel's windows belong to, in `screenPanes` order: the
 * screen, the backlight, then the right flank's windows and the left's. */
function paneOf(index: number, sides: number): GlassPane {
  if (index === 0) return "glassF";
  if (index === 1) return "glassB";
  return index - 2 < sides / 2 ? "glassR" : "glassL";
}

/** Every pane's web on one car. Null on a spec with no glass in it. */
export function buildGlassCracks(spec: CarBodySpec): GlassCracks | null {
  const panes = screenPanes(spec);
  const all = [panes.front, panes.rear, ...panes.sides];
  const sheets = all.map(sheetOf);
  const position: number[] = [];
  const color: number[] = [];
  const slices: Record<GlassPane, Hairline[]> = {
    glassF: [],
    glassB: [],
    glassL: [],
    glassR: [],
  };
  for (let i = 0; i < all.length; i++) {
    const sheet = sheets[i];
    const pane = paneOf(i, panes.sides.length);
    for (const line of webOn(sheet, i + 1)) {
      const start = position.length / 3;
      // Built at zero alpha: a car rolls onto the grid with its glass clear,
      // and every hairline on it is opened by the ledger or not at all.
      const count = hairline(sheet, line.a, line.b, { position, color }, 0);
      if (count === 0) continue;
      slices[pane].push({ start, count, sheet, ...line });
    }
  }
  if (position.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  const colors = new THREE.Float32BufferAttribute(color, 4);
  geometry.setAttribute("color", colors);
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  // Over the glass and over the film on it: a crack is IN the pane, and one
  // drawn under the grime is a crack in the car behind the window.
  mesh.renderOrder = 3;
  // ...and not drawn at all until something has cracked. Most cars on most
  // stages never take a mark, and a mesh of invisible triangles is still a
  // draw call and a sort per car per frame (`make profile` counts it).
  mesh.visible = false;

  const shown: Record<GlassPane, number> = { glassF: -1, glassB: -1, glassL: -1, glassR: -1 };

  /** How far open one hairline is at this level: shut until the level
   * reaches it, then opening over `OPEN_OVER` of the ledger. */
  const openness = (line: Hairline, level: number): number =>
    Math.max(0, Math.min(1, (level - line.at) / OPEN_OVER)) * CRACK_ALPHA;

  /** Whether ANY pane has something across it — what the mesh is drawn on
   * at all. Recomputed off `shown` rather than counted, so a pane whose
   * cracks were cleared with it cannot leave the mesh switched on. */
  const anyShowing = (): boolean => Object.values(shown).some((level) => level > FIRST_AT);

  const paint = (pane: GlassPane, level: number): void => {
    for (const line of slices[pane]) {
      const a = level < 0 ? 0 : openness(line, level);
      for (let i = line.start; i < line.start + line.count; i++) colors.setW(i, a);
    }
    colors.needsUpdate = true;
    mesh.visible = anyShowing();
  };

  const set = (pane: GlassPane, level: number): void => {
    if (Math.abs(shown[pane] - level) < 0.004) return;
    shown[pane] = level;
    paint(pane, level);
  };

  const clear = (pane: GlassPane): void => {
    shown[pane] = -1;
    paint(pane, -1);
  };

  const webOf = (pane: GlassPane, level: number): { position: number[]; color: number[] } => {
    const out = { position: [] as number[], color: [] as number[] };
    for (const line of slices[pane]) {
      const alpha = openness(line, level);
      if (alpha > 0) hairline(line.sheet, line.a, line.b, out, alpha);
    }
    return out;
  };

  return {
    mesh,
    set,
    clear,
    webOf,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
