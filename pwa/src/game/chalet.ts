// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CHALET (R37/R40) — the alpine house, built from the same plan the
// Nordic house is (`HousePlan`, with `style: "chalet"`). The plan says how
// big, how many storeys, what roof, whether there is a wing; this module
// says what a house in the mountains is made of, because at thirty metres
// that is what tells one country from another.
//
// The vocabulary is the real one. A GROUND FLOOR of stone or white render,
// where the byre and the cellar were; STOREYS OF DARK TIMBER above it,
// boards laid flat with their shadow lines, the log ends showing at the
// corners; a LOW ROOF with its ridge running front to back so the GABLE
// faces the yard, overhanging deep on every side on purlins that show
// under it — a roof built to hold a metre of snow rather than shed it,
// weighted with stone slabs or shingled dark; a BALCONY across the front at
// every floor, its rail a row of balusters with the flower boxes on it;
// small windows with dark shutters. Half of them keep a woodpile under the
// eave.
//
// Everything is one merged, vertex-coloured geometry through the house's
// own primitives and the flora's `GeoBuilder`, so a chalet is one draw call
// like the house it stands in for. Local frame as the house's: y = 0 on the
// yard, +z the FRONT (the gable with the balconies), +x its right as seen
// from the yard; `rotation.y = heading` turns +z onto the engine's heading.

import * as THREE from "three";
import type { HousePlan } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { box, buildHouse, HOUSE, houseMaterial, PAINT, windowOn } from "./house.ts";

/** The chalet's paint box. The timber is larch gone near-black in the sun
 * and the weather, which is the colour every old chalet is; the boards'
 * shadow lines and the log ends are a shade either side of it so the wall
 * reads as boards rather than as a brown slab. */
export const CHALET_PAINT = {
  timber: new THREE.Color(0x4a3527),
  board: new THREE.Color(0x33241a),
  logEnd: new THREE.Color(0x6a4d36),
  stone: new THREE.Color(0x8f8c84),
  stoneDark: new THREE.Color(0x6f6d67),
  render: new THREE.Color(0xe6e1d3),
  shutter: new THREE.Color(0x2f3f2c),
  shingle: new THREE.Color(0x3a322b),
  shingleRidge: new THREE.Color(0x2a241f),
  slab: new THREE.Color(0x6a6b66),
  slabRidge: new THREE.Color(0x55564f),
  rail: new THREE.Color(0x3d2c1f),
  flower: [new THREE.Color(0xc8262e), new THREE.Color(0xd9558a), new THREE.Color(0xe8e2d0)],
  leaf: new THREE.Color(0x3f6a2c),
  log: new THREE.Color(0x8a6a45),
  door: new THREE.Color(0x2b1e14),
};

/** Dimensions a plan does not carry, m — what a chalet IS. */
export const CHALET = {
  /** The stone ground floor when the plan has a storey to spare for it, and
   * the stone SOCKEL — the base the timber sits on — when it has not. */
  stoneStorey: 2.6,
  sockel: 1.2,
  storey: HOUSE.storey,
  /** The roof: low, because snow is left to lie on it — a third of the
   * Nordic pitch — and deep at the eaves and the gables. */
  pitch: 0.38,
  eave: 1.2,
  gable: 1.5,
  roofThick: 0.16,
  purlin: 0.18,
  /** How many purlins carry each slope, counted out from the ridge. */
  purlins: 3,
  boardPitch: 0.3,
  logEnd: 0.22,
  balcony: { depth: 1.4, rail: 1.0, baluster: 0.06, pitch: 0.27, flowerPitch: 0.36 },
  window: { w: 0.8, h: 0.9, sill: 1.0, shutter: 0.3 },
  door: { w: 0.95, h: 2.0 },
  chimney: { w: 0.7, h: 1.1 },
} as const;

/** Which roof colours a plan's roof gets: stone slabs where the plan asked
 * for slate, dark shingles for anything else. */
function roofing(plan: HousePlan): { face: THREE.Color; ridge: THREE.Color } {
  return plan.roof === "slate"
    ? { face: CHALET_PAINT.slab, ridge: CHALET_PAINT.slabRidge }
    : { face: CHALET_PAINT.shingle, ridge: CHALET_PAINT.shingleRidge };
}

/** A block of timber wall: the slab, the shadow line of every board across
 * its long faces, and the log ends stacked at each corner. */
function timberBlock(
  b: GeoBuilder,
  cx: number,
  cz: number,
  w: number,
  d: number,
  y0: number,
  height: number,
): void {
  box(b, CHALET_PAINT.timber, cx, y0 + height / 2, cz, w, height, d);
  const P = CHALET;
  for (let y = y0 + P.boardPitch; y < y0 + height - 0.05; y += P.boardPitch) {
    box(b, CHALET_PAINT.board, cx, y, cz, w + 0.02, 0.035, d + 0.02);
  }
  const e = P.logEnd;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let y = y0 + P.boardPitch / 2; y < y0 + height; y += P.boardPitch * 2) {
        box(b, CHALET_PAINT.logEnd, cx + sx * (w / 2), y, cz + sz * (d / 2), e, e * 0.8, e);
      }
    }
  }
}

/** The stone or rendered base: a box with darker courses across it when it
 * is stone. */
function stoneBlock(
  b: GeoBuilder,
  plan: HousePlan,
  cx: number,
  cz: number,
  w: number,
  d: number,
  height: number,
): void {
  const rendered = plan.walls === "white";
  box(b, PAINT.plinth, cx, HOUSE.plinth / 2, cz, w + 0.14, HOUSE.plinth, d + 0.14);
  box(
    b,
    rendered ? CHALET_PAINT.render : CHALET_PAINT.stone,
    cx,
    HOUSE.plinth + height / 2,
    cz,
    w + 0.06,
    height,
    d + 0.06,
  );
  if (!rendered) {
    for (let y = HOUSE.plinth + 0.55; y < HOUSE.plinth + height - 0.25; y += 0.62) {
      box(b, CHALET_PAINT.stoneDark, cx, y, cz, w + 0.08, 0.06, d + 0.08);
    }
  }
}

/** A small window with a shutter each side of it. */
function shutteredWindow(
  b: GeoBuilder,
  face: { axis: "x" | "z"; sign: 1 | -1 },
  at: number,
  u: number,
  sillY: number,
): void {
  const W = CHALET.window;
  windowOn(b, face, at, u, sillY, W.w, W.h);
  const proud = 0.04;
  for (const side of [-1, 1]) {
    const du = side * (W.w / 2 + HOUSE.window.frame + W.shutter / 2 + 0.02);
    const cy = sillY + W.h / 2;
    if (face.axis === "z") {
      box(b, CHALET_PAINT.shutter, u + du, cy, at + face.sign * proud, W.shutter, W.h + 0.1, 0.05);
    } else {
      box(b, CHALET_PAINT.shutter, at + face.sign * proud, cy, u + du, 0.05, W.h + 0.1, W.shutter);
    }
  }
}

/** The low roof with its ridge along Z over a block `w` (X) by `d` (Z),
 * eaves at `eaveY`: the timber gable prism, the two slopes overhanging deep
 * on every side, the purlins under them, and the ridge. Built about the
 * origin and PLACED — `GeoBuilder.add` composes translate · rotate, so a
 * quarter turn in `place` turns the ridge onto X for the wing. Returns the
 * ridge height. */
function chaletRoof(
  b: GeoBuilder,
  plan: HousePlan,
  place: { x: number; z: number; ry: number },
  w: number,
  d: number,
  eaveY: number,
): number {
  const P = CHALET;
  const half = w / 2;
  const rise = half * Math.tan(P.pitch);
  const ridgeY = eaveY + rise;
  const part = (geo: THREE.BufferGeometry, color: THREE.Color): void => b.add(geo, color, place);
  const bar = (
    color: THREE.Color,
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
  ): void => {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    geo.translate(cx, cy, cz);
    part(geo, color);
  };
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const attic = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  attic.translate(0, eaveY, -d / 2);
  attic.computeVertexNormals();
  part(attic, CHALET_PAINT.timber);
  // The boards across the gable, front and back, so the attic reads as the
  // same timber the storeys under it are.
  for (let y = eaveY + P.boardPitch; y < ridgeY - 0.3; y += P.boardPitch) {
    const across = (w * (ridgeY - y)) / rise;
    for (const sz of [-1, 1])
      bar(CHALET_PAINT.board, 0, y, sz * (d / 2), across - 0.04, 0.035, 0.03);
  }
  const over = half + P.eave;
  const slope = Math.hypot(over, over * Math.tan(P.pitch));
  const length = d + P.gable * 2;
  const paint = roofing(plan);
  for (const side of [-1, 1]) {
    const slab = new THREE.BoxGeometry(slope, P.roofThick, length);
    slab.translate((side * slope) / 2, -P.roofThick / 2, 0);
    // About Z: a positive turn carries +x upward, so the slope on the +x
    // side tilts by -pitch to come down off the ridge.
    slab.rotateZ(-side * P.pitch);
    slab.translate(0, ridgeY + P.roofThick, 0);
    part(slab, paint.face);
    // The purlins: beams along the ridge's line under the slab, whose ends
    // show under the gable overhang — the one detail a chalet roof is
    // known by from below.
    for (let k = 1; k <= P.purlins; k++) {
      const t = k / (P.purlins + 0.5);
      const px = side * over * t;
      const py = ridgeY - rise * t * (over / half) - P.purlin / 2 - 0.02;
      bar(CHALET_PAINT.timber, px, py, 0, P.purlin, P.purlin, length - 0.1);
    }
    // The stone slabs are weighted with a course of rocks along the eave.
    if (plan.roof === "slate") {
      for (let z = -length / 2 + 0.6; z < length / 2 - 0.3; z += 0.75) {
        const rock = new THREE.IcosahedronGeometry(0.16, 0);
        rock.translate(side * (over - 0.3), ridgeY - rise * (over / half) + 0.22, z);
        part(rock, CHALET_PAINT.stoneDark);
      }
    }
  }
  bar(paint.ridge, 0, ridgeY + 0.12, 0, 0.34, 0.16, length);
  return ridgeY;
}

/** A balcony across the front at floor height `y`: the deck, the brackets
 * under it, the rail of balusters, and the flower boxes along the rail. */
function balcony(b: GeoBuilder, w: number, d: number, y: number, detail: number): void {
  const B = CHALET.balcony;
  const span = w - 0.5;
  const front = d / 2 + B.depth;
  box(b, CHALET_PAINT.timber, 0, y + 0.05, d / 2 + B.depth / 2, span, 0.1, B.depth);
  for (const u of [-span / 2 + 0.3, 0, span / 2 - 0.3]) {
    box(b, CHALET_PAINT.timber, u, y - 0.3, d / 2 + B.depth * 0.45, 0.14, 0.5, B.depth * 0.9);
  }
  // The rail: a top rail and a bottom rail along the front and the two
  // ends, balusters between them.
  const top = y + 0.1 + B.rail;
  box(b, CHALET_PAINT.rail, 0, top, front - 0.05, span, 0.08, 0.08);
  box(b, CHALET_PAINT.rail, 0, y + 0.22, front - 0.05, span, 0.06, 0.06);
  for (const side of [-1, 1]) {
    box(
      b,
      CHALET_PAINT.rail,
      side * (span / 2 - 0.04),
      top,
      d / 2 + B.depth / 2,
      0.08,
      0.08,
      B.depth,
    );
    box(
      b,
      CHALET_PAINT.rail,
      side * (span / 2 - 0.04),
      y + 0.22,
      d / 2 + B.depth / 2,
      0.06,
      0.06,
      B.depth,
    );
  }
  const n = Math.max(2, Math.floor(span / B.pitch));
  for (let k = 0; k <= n; k++) {
    const u = -span / 2 + (span * k) / n;
    box(
      b,
      CHALET_PAINT.rail,
      u,
      y + 0.1 + B.rail / 2,
      front - 0.05,
      B.baluster,
      B.rail,
      B.baluster,
    );
  }
  // The flower boxes: a trough on the rail and the flowers standing out of
  // it, red more often than pink, a white one here and there.
  box(b, CHALET_PAINT.timber, 0, top + 0.12, front + 0.06, span - 0.2, 0.22, 0.26);
  const flowers = Math.max(3, Math.floor((span - 0.4) / B.flowerPitch));
  for (let k = 0; k < flowers; k++) {
    const u = -span / 2 + 0.3 + ((span - 0.6) * k) / Math.max(1, flowers - 1);
    const roll = (detail * 13.7 + k * 0.618) % 1;
    const tint = CHALET_PAINT.flower[roll < 0.55 ? 0 : roll < 0.85 ? 1 : 2];
    b.blob(CHALET_PAINT.leaf, 0.15, u, top + 0.26, front + 0.1, { sy: 0.7 });
    b.blob(tint, 0.13, u + 0.05, top + 0.36, front + 0.14);
  }
}

/** Build a chalet from its plan. `rand` is the facet jitter's only. */
export function chaletGeometry(plan: HousePlan, rand: () => number): THREE.BufferGeometry {
  const b = new GeoBuilder(rand);
  const P = CHALET;
  const w = plan.width;
  const d = plan.depth;
  // The stone below and the timber above: a full stone storey where the
  // plan has two or more, a sockel where it has one — a chalet is timber
  // over stone whatever its size, and a single storey of stone alone is a
  // byre.
  const stoneH = plan.storeys >= 2 ? P.stoneStorey : P.sockel;
  const total = plan.storeys * P.storey;
  const timberY = HOUSE.plinth + stoneH;
  const eaveY = HOUSE.plinth + total;
  stoneBlock(b, plan, 0, 0, w, d, stoneH);
  timberBlock(b, 0, 0, w, d, timberY, eaveY - timberY);
  const ridgeY = chaletRoof(b, plan, { x: 0, z: 0, ry: 0 }, w, d, eaveY);

  // The windows: small, shuttered, in a row across the front and the back
  // of every timber storey and the stone floor, one or two on each side.
  const cols = Math.max(2, Math.round(w / 2.4));
  const pitch = w / cols;
  const doorCol = plan.detail < 0.5 ? Math.floor(cols / 2) - 1 : Math.floor(cols / 2);
  const doorU = -w / 2 + pitch * (doorCol + 0.5);
  const floors: number[] = [];
  for (let k = 0; k < plan.storeys; k++) floors.push(HOUSE.plinth + k * P.storey);
  floors.forEach((floorY, k) => {
    const sill = floorY + P.window.sill;
    const ground = k === 0;
    for (let c = 0; c < cols; c++) {
      const u = -w / 2 + pitch * (c + 0.5);
      // The ground floor's door, and the balcony door over it.
      if (c === doorCol) continue;
      shutteredWindow(b, { axis: "z", sign: 1 }, d / 2, u, sill);
      shutteredWindow(b, { axis: "z", sign: -1 }, -d / 2, u, sill);
    }
    for (const s of [-1, 1] as const) {
      if (plan.wing && plan.wing.side === s && ground) continue;
      shutteredWindow(b, { axis: "x", sign: s }, s * (w / 2), -d * 0.2, sill);
      if (d > 7) shutteredWindow(b, { axis: "x", sign: s }, s * (w / 2), d * 0.22, sill);
    }
    if (ground) {
      box(
        b,
        PAINT.frame,
        doorU,
        HOUSE.plinth + P.door.h / 2,
        d / 2 + 0.04,
        P.door.w + 0.16,
        P.door.h + 0.1,
        0.06,
      );
      box(
        b,
        CHALET_PAINT.door,
        doorU,
        HOUSE.plinth + P.door.h / 2,
        d / 2 + 0.08,
        P.door.w,
        P.door.h,
        0.06,
      );
      box(b, PAINT.step, doorU, HOUSE.plinth * 0.5, d / 2 + 0.4, P.door.w + 0.6, HOUSE.plinth, 0.8);
    } else {
      balcony(b, w, d, floorY, plan.detail + k);
      box(
        b,
        CHALET_PAINT.door,
        doorU,
        floorY + P.door.h / 2,
        d / 2 + 0.05,
        P.door.w,
        P.door.h,
        0.06,
      );
    }
  });
  // The attic under the gable: a balcony at the eave when there is head
  // room behind it, and a window under the ridge either way.
  const rise = ridgeY - eaveY;
  if (rise > 1.7) {
    balcony(b, w * 0.7, d, eaveY, plan.detail + 7);
    box(b, CHALET_PAINT.door, 0, eaveY + 0.9, d / 2 + 0.05, 0.8, 1.7, 0.06);
  } else {
    windowOn(b, { axis: "z", sign: 1 }, d / 2, 0, eaveY + rise * 0.2, 0.6, 0.6);
  }
  windowOn(b, { axis: "z", sign: -1 }, -d / 2, 0, eaveY + rise * 0.25, 0.6, 0.6);

  // The chimney: stone, short, just behind the ridge's middle.
  if (plan.detail > 0.15) {
    const c = P.chimney;
    const along = (plan.detail < 0.6 ? -1 : 1) * d * 0.18;
    box(b, CHALET_PAINT.stone, 0.3, ridgeY + c.h / 2 - 0.3, along, c.w, c.h + 0.6, c.w);
  }
  // The woodpile under the eave on the gable side away from the wing.
  if (plan.porch) {
    const s = plan.wing ? -plan.wing.side : 1;
    const x = s * (w / 2 + 0.45);
    box(b, CHALET_PAINT.log, x, HOUSE.plinth + 0.65, -d * 0.1, 0.7, 1.3, Math.min(3.2, d * 0.5));
    for (
      let z = -d * 0.1 - Math.min(1.4, d * 0.22);
      z < -d * 0.1 + Math.min(1.4, d * 0.22);
      z += 0.28
    ) {
      box(b, CHALET_PAINT.board, x + s * 0.36, HOUSE.plinth + 0.4, z, 0.04, 0.22, 0.2);
      box(b, CHALET_PAINT.board, x + s * 0.36, HOUSE.plinth + 0.95, z + 0.14, 0.04, 0.22, 0.2);
    }
  }
  // The wing: a lower stone-and-timber block off the back at one end, under
  // its own low roof turned across the main one.
  if (plan.wing) {
    const g = plan.wing;
    const cx = g.side * (w / 2 - g.width / 2);
    const cz = -d / 2 - g.depth / 2;
    const depth = g.depth + 0.3;
    stoneBlock(b, plan, cx, cz, g.width, depth, P.sockel);
    const top = HOUSE.plinth + P.storey;
    timberBlock(b, cx, cz, g.width, depth, HOUSE.plinth + P.sockel, top - HOUSE.plinth - P.sockel);
    // The wing's ridge runs along X: the roof is placed turned a quarter,
    // which swaps its span and its length.
    chaletRoof(b, plan, { x: cx, z: cz, ry: Math.PI / 2 }, depth, g.width, top);
    shutteredWindow(b, { axis: "z", sign: -1 }, cz - depth / 2, cx, HOUSE.plinth + P.window.sill);
    shutteredWindow(
      b,
      { axis: "x", sign: g.side },
      g.side * (w / 2),
      cz,
      HOUSE.plinth + P.window.sill,
    );
  }
  return b.build();
}

/** The chalet as a mesh, standing on local y = 0 facing +z. */
export function buildChalet(plan: HousePlan, rand: () => number): THREE.Mesh {
  const mesh = new THREE.Mesh(chaletGeometry(plan, rand), houseMaterial());
  mesh.frustumCulled = true;
  return mesh;
}

/** A house in the country's own style: the plan's `style` decides, so the
 * yards and the streets ask this rather than either builder. */
export function buildDwelling(plan: HousePlan, rand: () => number): THREE.Mesh {
  return plan.style === "chalet" ? buildChalet(plan, rand) : buildHouse(plan, rand);
}
