// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HOUSE (R37) — a Nordic timber house, built from its plan. The plan is
// the engine's (`HousePlan`: footprint, storeys, roof, paint, porch, wing);
// this module is what turns those seven decisions into boards, panes and
// tiles. Everything is one merged, vertex-coloured geometry through the
// flora's own `GeoBuilder`, so a house is one draw call lit by the same
// hemisphere and sun as the spruce beside it, with the same per-facet
// jitter that keeps a flat colour field from reading as plastic.
//
// The vocabulary is the real one, because the silhouette is what reads at
// stage speed: a plinth of grey stone, boards in falu red, ochre or white
// with white corner boards and window frames ("knutar" and "foder"), a
// pitched roof with its ridge along the front — clay tile, black sheet
// metal or slate — a chimney, and on half of them a porch on two posts over
// the door. The windows are dark panes with a white cross, proud of the wall
// by a few centimetres, which is all a window needs to be from thirty metres.
//
// Local frame: the house stands on y = 0 with its footprint centred on the
// origin; +z is the FRONT (the wall that faces the yard), +x its right as
// you look at it from the yard. `rotation.y = heading` then turns +z onto
// the engine's heading (`sin h, cos h`), the way every other placed thing
// in the world is turned.

import * as THREE from "three";
import type { HousePlan, RoofKind, WallPaint } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture } from "./textures.ts";

/** The paint box. Falu red is the iron-oxide red every second house in the
 * country is painted; the ochre is the manor's yellow; the white is a warm
 * white, never a printer's. The trims are a shade off pure so the jitter
 * has somewhere to go. */
const PAINT = {
  red: new THREE.Color(0x8c2f24),
  yellow: new THREE.Color(0xd8b25a),
  white: new THREE.Color(0xe9e4d6),
  trim: new THREE.Color(0xf1ede2),
  /** White walls get trim a shade greyer, or there is no trim to see. */
  trimOnWhite: new THREE.Color(0xd2cdbf),
  plinth: new THREE.Color(0x8b8b84),
  glass: new THREE.Color(0x2a3540),
  frame: new THREE.Color(0xf4f1e8),
  door: [new THREE.Color(0x2f4a3a), new THREE.Color(0x4a3222), new THREE.Color(0x2b3b5c)],
  chimney: new THREE.Color(0x7a5a4c),
  step: new THREE.Color(0x9a9791),
  post: new THREE.Color(0xf1ede2),
};

const ROOF: Record<RoofKind, { face: THREE.Color; ridge: THREE.Color }> = {
  tile: { face: new THREE.Color(0xb35b34), ridge: new THREE.Color(0x8f452a) },
  metal: { face: new THREE.Color(0x2b2d30), ridge: new THREE.Color(0x1f2124) },
  slate: { face: new THREE.Color(0x4e5865), ridge: new THREE.Color(0x3a424c) },
};

/** Dimensions a plan does not carry, m — the same on every house because
 * they are what a house IS, not what distinguishes one from another. */
const HOUSE = {
  /** The stone plinth the timber stands on. */
  plinth: 0.4,
  storey: 2.7,
  /** How far the eaves and the gables overhang the walls. */
  eave: 0.45,
  gable: 0.3,
  /** Roof pitch, radians — steep enough to shed snow, which every roof in
   * this country is. */
  pitch: 0.62,
  roofThick: 0.14,
  cornerBoard: 0.16,
  /** A window: its pane and the frame round it; how high its sill sits. */
  window: { w: 0.95, h: 1.15, sill: 0.95, frame: 0.08 },
  door: { w: 1.0, h: 2.05 },
  porch: { w: 2.3, d: 1.6, h: 2.35, post: 0.13 },
  chimney: { w: 0.6, h: 0.9 },
} as const;

/** One material for every house: vertex colours under the world's speckle,
 * lit by the scene. */
const houseMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);

/** A box by its centre and size — the one shape a house is mostly made of. */
function box(
  b: GeoBuilder,
  color: THREE.Color,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  geo.translate(cx, cy, cz);
  b.add(geo, color);
}

/** A pitched roof over a block: two slopes with their ridge along X, over a
 * footprint `w` (along X) by `d` (along Z) centred at (cx, cz), eaves at
 * height `eaveY`. The gable ends are the wall's own colour, filled as a
 * triangular prism so the attic is closed. Returns the ridge height. */
function gableRoof(
  b: GeoBuilder,
  roof: RoofKind,
  wall: THREE.Color,
  cx: number,
  cz: number,
  w: number,
  d: number,
  eaveY: number,
  /** Turn the whole roof a quarter: ridge along Z instead. */
  across = false,
): number {
  // Built with the ridge along X and centred on the origin, then placed:
  // `GeoBuilder.add` composes translate · rotate, so a quarter turn about
  // Y turns the ridge onto Z before the roof is carried to (cx, cz).
  const place = { x: cx, z: cz, ry: across ? Math.PI / 2 : 0 };
  const half = d / 2;
  const rise = half * Math.tan(HOUSE.pitch);
  const ridgeY = eaveY + rise;
  // The attic: a triangular prism in the wall colour, extruded along the
  // ridge, its slopes just under the roofing so only the gables show.
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const attic = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  // Extrude runs along +z; the ridge wants X, so the profile (drawn in
  // x-y) is turned to lie in z-y and the depth becomes the ridge's length.
  attic.rotateY(-Math.PI / 2);
  attic.translate(w / 2, eaveY, 0);
  attic.computeVertexNormals();
  b.add(attic, wall, place);
  // The two slopes: slabs laid on the pitch, overhanging the eaves and the
  // gables, meeting under a ridge cap. Each slab is laid flat from the
  // ridge outward along its own side of Z, then tilted down about X — a
  // rotation about X by +pitch carries +z downward, so each side tilts by
  // its own sign.
  const over = half + HOUSE.eave;
  const slope = Math.hypot(over, over * Math.tan(HOUSE.pitch));
  const length = w + HOUSE.gable * 2;
  const face = ROOF[roof].face;
  for (const side of [-1, 1]) {
    const slab = new THREE.BoxGeometry(length, HOUSE.roofThick, slope);
    slab.translate(0, -HOUSE.roofThick / 2, (side * slope) / 2);
    slab.rotateX(side * HOUSE.pitch);
    slab.translate(0, ridgeY + HOUSE.roofThick * 0.9, 0);
    b.add(slab, face, place);
  }
  const cap = new THREE.BoxGeometry(length, 0.16, 0.34);
  cap.translate(0, ridgeY + 0.1, 0);
  b.add(cap, ROOF[roof].ridge, place);
  return ridgeY;
}

/** A window proud of a wall: the frame first, the pane on it, a cross of
 * glazing bar over the pane. `face` is the outward normal's axis and sign:
 * the wall's plane is at `at` along it, and (u, v) place the window across
 * the wall and up it. */
function windowOn(
  b: GeoBuilder,
  face: { axis: "x" | "z"; sign: 1 | -1 },
  at: number,
  u: number,
  sillY: number,
  w: number = HOUSE.window.w,
  h: number = HOUSE.window.h,
): void {
  const f = HOUSE.window.frame;
  const put = (
    color: THREE.Color,
    du: number,
    dy: number,
    sw: number,
    sh: number,
    proud: number,
  ) => {
    const depth = 0.05;
    const along = at + face.sign * (proud + depth / 2);
    if (face.axis === "z") box(b, color, u + du, sillY + h / 2 + dy, along, sw, sh, depth);
    else box(b, color, along, sillY + h / 2 + dy, u + du, depth, sh, sw);
  };
  put(PAINT.frame, 0, 0, w + f * 2, h + f * 2, 0.03);
  put(PAINT.glass, 0, 0, w, h, 0.07);
  put(PAINT.frame, 0, 0, 0.06, h, 0.09);
  put(PAINT.frame, 0, h * 0.12, w, 0.06, 0.09);
}

/** The block's walls, plinth and corner boards: a box `w` by `d` centred at
 * (cx, cz), `storeys` high. Returns the eaves' height. */
function walls(
  b: GeoBuilder,
  plan: HousePlan,
  cx: number,
  cz: number,
  w: number,
  d: number,
  storeys: number,
): number {
  const wall = PAINT[plan.walls];
  const trim = plan.walls === "white" ? PAINT.trimOnWhite : PAINT.trim;
  const height = storeys * HOUSE.storey;
  box(b, PAINT.plinth, cx, HOUSE.plinth / 2, cz, w + 0.12, HOUSE.plinth, d + 0.12);
  box(b, wall, cx, HOUSE.plinth + height / 2, cz, w, height, d);
  const c = HOUSE.cornerBoard;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(b, trim, cx + sx * (w / 2), HOUSE.plinth + height / 2, cz + sz * (d / 2), c, height, c);
    }
  }
  return HOUSE.plinth + height;
}

/** Build a house from its plan. `rand` is the facet jitter's, not the
 * plan's — every choice about the house was made in the engine, and the
 * same plan comes out the same house at any seed. */
export function houseGeometry(plan: HousePlan, rand: () => number): THREE.BufferGeometry {
  const b = new GeoBuilder(rand);
  const wall = PAINT[plan.walls];
  const w = plan.width;
  const d = plan.depth;
  const eave = walls(b, plan, 0, 0, w, d, plan.storeys);
  const ridge = gableRoof(b, plan.roof, wall, 0, 0, w, d, eave);

  // The windows: an even row across the front and the back on every
  // storey, one on each gable end, and the door where the plan's roll puts
  // it — off centre one way or the other, never dead in the middle, which
  // is the one place a farmhouse door never is.
  const cols = Math.max(2, Math.round(w / 2.6));
  const pitch = w / cols;
  const doorCol = plan.detail < 0.5 ? Math.floor(cols / 2) - 1 : Math.floor(cols / 2);
  const doorU = -w / 2 + pitch * (doorCol + 0.5);
  for (let storey = 0; storey < plan.storeys; storey++) {
    const sill = HOUSE.plinth + storey * HOUSE.storey + HOUSE.window.sill;
    for (let k = 0; k < cols; k++) {
      const u = -w / 2 + pitch * (k + 0.5);
      if (storey === 0 && k === doorCol) continue;
      windowOn(b, { axis: "z", sign: 1 }, d / 2, u, sill);
      windowOn(b, { axis: "z", sign: -1 }, -d / 2, u, sill);
    }
    for (const side of [-1, 1] as const) {
      // The wing takes one gable end's ground floor.
      if (plan.wing && plan.wing.side === side && storey === 0) continue;
      windowOn(b, { axis: "x", sign: side }, side * (w / 2), 0, sill);
    }
  }
  // A small attic window in each gable, under the ridge.
  const atticSill = eave + (ridge - eave) * 0.25;
  for (const side of [-1, 1] as const) {
    windowOn(b, { axis: "x", sign: side }, side * (w / 2), 0, atticSill, 0.6, 0.6);
  }

  // The door, its step, and the porch over it when the plan has one.
  const door = PAINT.door[Math.floor(plan.detail * 7) % PAINT.door.length];
  box(
    b,
    PAINT.frame,
    doorU,
    HOUSE.plinth + HOUSE.door.h / 2,
    d / 2 + 0.03,
    HOUSE.door.w + 0.16,
    HOUSE.door.h + 0.1,
    0.06,
  );
  box(
    b,
    door,
    doorU,
    HOUSE.plinth + HOUSE.door.h / 2,
    d / 2 + 0.07,
    HOUSE.door.w,
    HOUSE.door.h,
    0.06,
  );
  box(
    b,
    PAINT.step,
    doorU,
    HOUSE.plinth * 0.5,
    d / 2 + 0.45,
    HOUSE.door.w + 0.6,
    HOUSE.plinth,
    0.9,
  );
  box(
    b,
    PAINT.step,
    doorU,
    HOUSE.plinth * 0.2,
    d / 2 + 0.85,
    HOUSE.door.w + 0.6,
    HOUSE.plinth * 0.4,
    0.5,
  );
  if (plan.porch) {
    const p = HOUSE.porch;
    const front = d / 2 + p.d;
    for (const side of [-1, 1]) {
      box(
        b,
        PAINT.post,
        doorU + side * (p.w / 2 - p.post),
        HOUSE.plinth + p.h / 2,
        front - p.post,
        p.post,
        p.h,
        p.post,
      );
    }
    // A little pitched roof with its ridge running out from the wall.
    gableRoof(b, plan.roof, wall, doorU, d / 2 + p.d / 2, p.d + 0.2, p.w, HOUSE.plinth + p.h, true);
  }

  // The chimney, on the ridge, a third of the way along it.
  if (plan.detail > 0.15) {
    const along = (plan.detail < 0.6 ? -1 : 1) * w * 0.22;
    const c = HOUSE.chimney;
    box(b, PAINT.chimney, along, ridge + c.h / 2 - 0.25, 0, c.w, c.h + 0.5, c.w);
  }

  // The wing: a lower block off the back wall, flush with one end, under
  // its own roof turned across the main one so the two ridges meet in a
  // valley the way an L-shaped house's do.
  if (plan.wing) {
    const g = plan.wing;
    const cx = g.side * (w / 2 - g.width / 2);
    const cz = -d / 2 - g.depth / 2;
    const wingEave = walls(b, plan, cx, cz, g.width, g.depth + 0.3, 1);
    gableRoof(b, plan.roof, wall, cx, cz, g.depth + 0.3, g.width, wingEave, true);
    const sill = HOUSE.plinth + HOUSE.window.sill;
    windowOn(b, { axis: "z", sign: -1 }, cz - g.depth / 2 - 0.15, cx, sill);
    windowOn(b, { axis: "x", sign: g.side }, g.side * (w / 2), cz, sill);
  }
  return b.build();
}

/** The house as a mesh, standing on local y = 0 facing +z. */
export function buildHouse(plan: HousePlan, rand: () => number): THREE.Mesh {
  const mesh = new THREE.Mesh(houseGeometry(plan, rand), houseMaterial());
  mesh.frustumCulled = true;
  return mesh;
}

export type { HousePlan, RoofKind, WallPaint };
