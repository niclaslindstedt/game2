// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VILLAGE BUILDINGS (R39) — what a town has that a farm has not, built
// from the same plans and the same primitives as the house (`house.ts`): a
// block of flats, a grocery, the post office, the workshop. Each is one
// merged vertex-coloured geometry through the flora's `GeoBuilder` like the
// house, plus — on the ones that have one — a SIGN over the door, which is
// the one part of a building that is a texture rather than a colour, and so
// the one part that is a mesh of its own.
//
// The vocabulary stays the house's, because the buildings are the house's
// neighbours: a plinth, boards or render, white frames, dark panes. What
// separates them is the SHAPE — a shop is one tall storey with glass along
// the whole front, a block of flats is three storeys of the same window
// over and over with a balcony hung under every other one, a workshop is a
// long shed with the roller doors in the gable — because the shape is what
// reads at stage speed, and the sign confirms it for anyone who slows down.
//
// Local frame as the house's: y = 0 is the ground, +z the FRONT (toward
// the street), +x its right as seen from the street.

import * as THREE from "three";
import type { HousePlan } from "@engine";
import { buildBarn } from "./barn.ts";
import { GeoBuilder } from "./flora-build.ts";
import {
  box,
  buildHouse,
  gableRoof,
  HOUSE,
  houseMaterial,
  PAINT,
  pitched,
  walls,
  windowOn,
} from "./house.ts";
import { shareOne } from "../lib/shared-gpu.ts";

/** What the village's buildings are made of that a house is not. */
const TINT = {
  felt: new THREE.Color(0x2e2f31),
  parapet: new THREE.Color(0xb9b7ae),
  glass: new THREE.Color(0x2a3540),
  rail: new THREE.Color(0xdcd8cc),
  slab: new THREE.Color(0x9c9a93),
  shutter: new THREE.Color(0x5a5d61),
  canopy: new THREE.Color(0x3a3d41),
  postbox: new THREE.Color(0xe8c22c),
  drum: new THREE.Color(0x2c4e8a),
};

/** A shop's storey is taller than a house's: room for the sign over the
 * glass. A workshop's is taller again, for the doors. */
const SHOP_STOREY = 3.6;
const SHED_STOREY = 4.2;

/** What each kind's sign says — plain Swedish, because the country is. */
const SIGN_TEXT: Partial<Record<HousePlan["kind"], string[]>> = {
  grocery: ["LIVS", "LANTHANDEL", "HANDEL"],
  post: ["POST", "POSTEN"],
  workshop: ["VERKSTAD", "BILVERKSTAD", "DÄCK & SERVICE"],
};

/** The board's colours per kind: the grocer's is red on white, the post's
 * is the postal yellow with blue letters, the workshop's is white on blue. */
const SIGN_LOOK: Partial<Record<HousePlan["kind"], { ground: string; ink: string }>> = {
  grocery: { ground: "#f2ede2", ink: "#b3231b" },
  post: { ground: "#f2c318", ink: "#1e3e8a" },
  workshop: { ground: "#2c4e8a", ink: "#f2ede2" },
};

/** A sign: chunky caps on a plain ground, nearest-filtered so the lettering
 * is as blocky as the rest of the world. One texture per wording, shared. */
const signTextures = new Map<string, () => THREE.CanvasTexture>();
function signTexture(text: string, look: { ground: string; ink: string }): THREE.CanvasTexture {
  const key = `${text}|${look.ground}|${look.ink}`;
  let make = signTextures.get(key);
  if (!make) {
    make = shareOne(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 96;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      ctx.fillStyle = look.ground;
      ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = look.ink;
      ctx.font = "bold 64px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 256, 50, 470);
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    });
    signTextures.set(key, make);
  }
  return make();
}

/** The sign board as a mesh: a thin lit box with the wording on its face,
 * proud of the wall at `z`, `w` wide and `h` tall, its centre at (x, y). */
function signBoard(
  plan: HousePlan,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
): THREE.Mesh | null {
  const words = SIGN_TEXT[plan.kind];
  const look = SIGN_LOOK[plan.kind];
  if (!words || !look) return null;
  const text = words[Math.floor(plan.detail * 1000) % words.length];
  const geo = new THREE.BoxGeometry(w, h, 0.08);
  const face = new THREE.MeshLambertMaterial({ map: signTexture(text, look) });
  const edge = new THREE.MeshLambertMaterial({ color: new THREE.Color(look.ground) });
  const mesh = new THREE.Mesh(geo, [edge, edge, edge, edge, face, edge]);
  mesh.position.set(x, y, z + 0.04);
  return mesh;
}

/** A flat roof: a parapet round the top of the walls and the felt inside
 * it, a hand's width lower. */
function flatRoof(b: GeoBuilder, cx: number, cz: number, w: number, d: number, top: number): void {
  const p = 0.3;
  box(b, TINT.felt, cx, top + 0.06, cz, w - 0.1, 0.12, d - 0.1);
  box(b, TINT.parapet, cx, top + p / 2, cz + d / 2 - 0.1, w, p, 0.2);
  box(b, TINT.parapet, cx, top + p / 2, cz - d / 2 + 0.1, w, p, 0.2);
  box(b, TINT.parapet, cx + w / 2 - 0.1, top + p / 2, cz, 0.2, p, d);
  box(b, TINT.parapet, cx - w / 2 + 0.1, top + p / 2, cz, 0.2, p, d);
}

/** A door in the front wall at `u`: frame, leaf, and a step below. */
function doorOn(b: GeoBuilder, plan: HousePlan, u: number, front: number, w: number, h: number) {
  const leaf = PAINT.door[Math.floor(plan.detail * 7) % PAINT.door.length];
  box(b, PAINT.frame, u, HOUSE.plinth + h / 2, front + 0.03, w + 0.16, h + 0.1, 0.06);
  box(b, leaf, u, HOUSE.plinth + h / 2, front + 0.07, w, h, 0.06);
  box(b, PAINT.step, u, HOUSE.plinth * 0.5, front + 0.45, w + 0.6, HOUSE.plinth, 0.9);
}

/** A row of windows across a wall between `-half..half`, `n` of them with
 * their sills at `sill`, leaving out column `skip`. */
function windowRow(
  b: GeoBuilder,
  face: { axis: "x" | "z"; sign: 1 | -1 },
  at: number,
  half: number,
  n: number,
  sill: number,
  skip = -1,
): void {
  const pitch = (half * 2) / n;
  for (let k = 0; k < n; k++) {
    if (k === skip) continue;
    windowOn(b, face, at, -half + pitch * (k + 0.5), sill);
  }
}

/** THE BLOCK OF FLATS: three storeys of the same window, an entrance in
 * the middle under a concrete canopy, and a balcony hung under every other
 * window on the upper floors — a slab, a railing, and the dark of the door
 * behind it. Flat felt roof or a shallow sheet-metal one. */
function apartmentsGeometry(b: GeoBuilder, plan: HousePlan): void {
  const w = plan.width;
  const d = plan.depth;
  const top = walls(b, plan, 0, 0, w, d, plan.storeys);
  if (plan.roof === "flat") flatRoof(b, 0, 0, w, d, top);
  else gableRoof(b, pitched(plan.roof), PAINT[plan.walls], 0, 0, w, d, top);
  const cols = Math.max(3, Math.round(w / 3.2));
  const doorCol = Math.floor(cols / 2);
  const pitch = w / cols;
  for (let storey = 0; storey < plan.storeys; storey++) {
    const sill = HOUSE.plinth + storey * HOUSE.storey + HOUSE.window.sill;
    windowRow(b, { axis: "z", sign: 1 }, d / 2, w / 2, cols, sill, storey === 0 ? doorCol : -1);
    windowRow(b, { axis: "z", sign: -1 }, -d / 2, w / 2, cols, sill);
    windowRow(b, { axis: "x", sign: 1 }, w / 2, d / 2, 2, sill);
    windowRow(b, { axis: "x", sign: -1 }, -w / 2, d / 2, 2, sill);
    if (storey === 0) continue;
    // The balconies: under every other window, offset a column each
    // storey so the front is a chequer of them and not a grid.
    for (let k = (storey + Math.floor(plan.detail * 2)) % 2; k < cols; k += 2) {
      if (k === doorCol) continue;
      const u = -w / 2 + pitch * (k + 0.5);
      const floor = HOUSE.plinth + storey * HOUSE.storey + 0.08;
      box(b, TINT.slab, u, floor, d / 2 + 0.7, 2.4, 0.16, 1.4);
      box(b, TINT.rail, u, floor + 0.55, d / 2 + 1.36, 2.4, 1.0, 0.06);
      box(b, TINT.rail, u - 1.17, floor + 0.55, d / 2 + 0.7, 0.06, 1.0, 1.3);
      box(b, TINT.rail, u + 1.17, floor + 0.55, d / 2 + 0.7, 0.06, 1.0, 1.3);
    }
  }
  const doorU = -w / 2 + pitch * (doorCol + 0.5);
  doorOn(b, plan, doorU, d / 2, 1.4, 2.2);
  box(b, TINT.canopy, doorU, HOUSE.plinth + 2.5, d / 2 + 0.6, 2.8, 0.14, 1.2);
}

/** THE GROCERY: one tall storey with the glass running the whole front,
 * the door in the middle of it, the sign over the top, and a flat roof.
 * The side and back walls are blank but for a door at the back where the
 * deliveries come in. */
function groceryGeometry(b: GeoBuilder, plan: HousePlan): THREE.Mesh | null {
  const w = plan.width;
  const d = plan.depth;
  const top = walls(b, plan, 0, 0, w, d, 1, SHOP_STOREY);
  flatRoof(b, 0, 0, w, d, top);
  // The shop front: a band of glass from knee height to the sign, in
  // panes divided by white mullions, with the door where the middle pane
  // would be.
  const sill = HOUSE.plinth + 0.7;
  const glassH = 1.9;
  const panes = Math.max(3, Math.round(w / 2.4));
  const pitch = (w - 0.8) / panes;
  const doorPane = Math.floor(panes / 2);
  for (let k = 0; k < panes; k++) {
    const u = -(w - 0.8) / 2 + pitch * (k + 0.5);
    if (k === doorPane) {
      doorOn(b, plan, u, d / 2, 1.6, 2.3);
      continue;
    }
    windowOn(b, { axis: "z", sign: 1 }, d / 2, u, sill, pitch - 0.24, glassH);
  }
  box(b, PAINT.frame, 0, HOUSE.plinth + 2.3 + 0.7 / 2, d / 2 + 0.05, w - 0.8, 0.08, 0.08);
  doorOn(b, plan, -w / 4, -d / 2 - 0.1, 1.4, 2.2);
  windowOn(b, { axis: "x", sign: 1 }, w / 2, -d / 4, HOUSE.plinth + 1.2);
  return signBoard(plan, 0, HOUSE.plinth + SHOP_STOREY - 0.55, d / 2, w * 0.7, 0.8);
}

/** THE POST OFFICE: a house's shape — a pitched roof, two storeys or one —
 * done in the postal yellow or in brick, with a wide door in the middle of
 * the front, the sign over it, and the yellow postbox by the step. */
function postGeometry(b: GeoBuilder, plan: HousePlan): THREE.Mesh | null {
  const w = plan.width;
  const d = plan.depth;
  const wall = PAINT[plan.walls];
  const roof = pitched(plan.roof);
  const eave = walls(b, plan, 0, 0, w, d, plan.storeys);
  gableRoof(b, roof, wall, 0, 0, w, d, eave);
  const cols = Math.max(3, Math.round(w / 2.6));
  const doorCol = Math.floor(cols / 2);
  for (let storey = 0; storey < plan.storeys; storey++) {
    const sill = HOUSE.plinth + storey * HOUSE.storey + HOUSE.window.sill;
    windowRow(b, { axis: "z", sign: 1 }, d / 2, w / 2, cols, sill, storey === 0 ? doorCol : -1);
    windowRow(b, { axis: "z", sign: -1 }, -d / 2, w / 2, cols, sill);
    windowOn(b, { axis: "x", sign: 1 }, w / 2, 0, sill);
    windowOn(b, { axis: "x", sign: -1 }, -w / 2, 0, sill);
  }
  doorOn(b, plan, 0, d / 2, 1.6, 2.2);
  box(b, TINT.canopy, 0, HOUSE.plinth + 2.45, d / 2 + 0.5, 2.6, 0.12, 1.0);
  // The postbox: on a post beside the step.
  box(b, TINT.shutter, w / 2 - 1.2, 0.5, d / 2 + 1.4, 0.1, 1.0, 0.1);
  box(b, TINT.postbox, w / 2 - 1.2, 1.25, d / 2 + 1.4, 0.5, 0.55, 0.4);
  return signBoard(plan, 0, HOUSE.plinth + 2.75, d / 2, Math.min(w * 0.6, 5.5), 0.7);
}

/** THE WORKSHOP: a long low shed with its ridge running back from the
 * street, so the front is a gable with two roller doors in it, a small
 * window between them, and the sign in the peak. A stack of drums at the
 * corner says what goes on inside. */
function workshopGeometry(b: GeoBuilder, plan: HousePlan): THREE.Mesh | null {
  const w = plan.width;
  const d = plan.depth;
  const wall = PAINT[plan.walls];
  const top = walls(b, plan, 0, 0, w, d, 1, SHED_STOREY);
  if (plan.roof === "flat") flatRoof(b, 0, 0, w, d, top);
  else gableRoof(b, pitched(plan.roof), wall, 0, 0, d, w, top, true);
  // The roller doors: two, wide and tall, a slatted grey, set either side
  // of the centre.
  const doorW = Math.min(3.6, w * 0.3);
  const doorH = 3.3;
  for (const side of [-1, 1]) {
    const u = side * (w / 4);
    box(b, PAINT.frame, u, HOUSE.plinth + doorH / 2, d / 2 + 0.03, doorW + 0.2, doorH + 0.15, 0.06);
    box(b, TINT.shutter, u, HOUSE.plinth + doorH / 2, d / 2 + 0.07, doorW, doorH, 0.06);
    for (let k = 1; k < 6; k++) {
      box(b, PAINT.frame, u, HOUSE.plinth + (doorH * k) / 6, d / 2 + 0.11, doorW, 0.04, 0.02);
    }
  }
  windowOn(b, { axis: "z", sign: 1 }, d / 2, 0, HOUSE.plinth + 1.5, 0.8, 0.8);
  windowRow(b, { axis: "x", sign: 1 }, w / 2, d / 2, 3, HOUSE.plinth + 1.8);
  windowRow(b, { axis: "x", sign: -1 }, -w / 2, d / 2, 3, HOUSE.plinth + 1.8);
  // The drums, by the front corner.
  for (let k = 0; k < 3; k++) {
    const drum = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8);
    drum.translate(-w / 2 + 0.6 + (k % 2) * 0.7, 0.45, d / 2 + 0.8 + Math.floor(k / 2) * 0.7);
    b.add(drum, TINT.drum);
  }
  const signY = plan.roof === "flat" ? HOUSE.plinth + SHED_STOREY - 0.5 : top + 0.6;
  return signBoard(plan, 0, signY, d / 2, Math.min(w * 0.55, 6), 0.75);
}

/** Build any building from its plan, standing on local y = 0 facing +z.
 * A house or a villa is the house builder's; the rest are this module's,
 * as a group when they carry a sign. `rand` is the facet jitter's only. */
export function buildBuilding(plan: HousePlan, rand: () => number): THREE.Object3D {
  if (plan.kind === "house" || plan.kind === "villa") return buildHouse(plan, rand);
  if (plan.kind === "barn") return buildBarn(plan, rand);
  const b = new GeoBuilder(rand);
  let sign: THREE.Mesh | null = null;
  switch (plan.kind) {
    case "apartments":
      apartmentsGeometry(b, plan);
      break;
    case "grocery":
      sign = groceryGeometry(b, plan);
      break;
    case "post":
      sign = postGeometry(b, plan);
      break;
    case "workshop":
      sign = workshopGeometry(b, plan);
      break;
  }
  const mesh = new THREE.Mesh(b.build(), houseMaterial());
  mesh.frustumCulled = true;
  if (!sign) return mesh;
  const group = new THREE.Group();
  group.add(mesh);
  group.add(sign);
  return group;
}
