// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FARM'S MACHINERY (R37), drawn: the tractor, the trailer it pulls, the
// plough, the harrow and the round baler, and the round bales the baler
// left across the hay field. The engine placed each one (`FarmGear`); this
// dresses the roll. Built the parked car's way — a dozen boxes and some
// cylinders, one merged vertex-coloured geometry per machine, lit by the
// scene — because a tractor in a yard is passed at forty metres a second.
//
// The vocabulary is a Swedish farm's: the tractor is the red Volvo BM /
// green Valmet / blue Ford shape every yard has one of — a tall cab over
// big rear wheels and small front ones, an exhaust stack up the bonnet —
// the trailer a tipping two-axle box, the plough a beam of three or four
// mouldboards on two wheels, the harrow a frame of discs, the baler a box
// with a big drum in it and a pickup at the front.
//
// Local frame as the parked car's: wheels on y = 0, +z is the NOSE (or,
// for an implement, the end that is hitched), `rotation.y = heading`.

import * as THREE from "three";
import type { FarmGear } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { box } from "./house.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture } from "./textures.ts";

/** Tractor paints: Volvo BM red, Valmet yellow-green, Ford blue, the
 * Massey red, and a grey one nobody has washed since 1974. */
const TRACTOR_PAINT = [0xb8261c, 0x6f8a2a, 0x2c56a8, 0xa6221f, 0x8a8c88];

const TINT = {
  tyre: new THREE.Color(0x1c1d1f),
  hub: new THREE.Color(0xc9c2a8),
  glass: new THREE.Color(0x2b3640),
  cab: new THREE.Color(0x2d2f32),
  steel: new THREE.Color(0x4a4c50),
  rust: new THREE.Color(0x7a4a2c),
  trailer: new THREE.Color(0x5f7e33),
  trailerRed: new THREE.Color(0x9a3226),
  bed: new THREE.Color(0x4a4238),
  mouldboard: new THREE.Color(0x8d9298),
  disc: new THREE.Color(0x6f7378),
  baler: new THREE.Color(0xb8261c),
  bale: new THREE.Color(0xcaa85e),
  baleEnd: new THREE.Color(0xb08f47),
  wrap: new THREE.Color(0xe8e6df),
  lamp: new THREE.Color(0xe9e2c4),
};

const gearMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);

/** Successive rolls off one seed, the parked car's trick. */
function rolls(seed: number): () => number {
  let s = Math.floor(seed * 4294967296) >>> 0 || 0x9e3779b9;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return ((s >>> 8) & 0xffffff) / 0x1000000;
  };
}

/** A wheel on an axle along X: the tyre and its hub. */
function wheel(b: GeoBuilder, x: number, z: number, r: number, w: number, lugs = false): void {
  const tyre = new THREE.CylinderGeometry(r, r, w, lugs ? 12 : 8);
  tyre.rotateZ(Math.PI / 2);
  tyre.translate(x, r, z);
  b.add(tyre, TINT.tyre);
  const hub = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.03, 8);
  hub.rotateZ(Math.PI / 2);
  hub.translate(x, r, z);
  b.add(hub, TINT.hub);
  if (lugs) {
    // The tread bars of an agricultural tyre, a few of them proud.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const lug = new THREE.BoxGeometry(w + 0.04, 0.08, 0.16);
      lug.translate(0, r, 0);
      lug.rotateX(a);
      lug.translate(x, r, z);
      b.add(lug, TINT.tyre);
    }
  }
}

function tractor(b: GeoBuilder, r: () => number): void {
  const paint = new THREE.Color(TRACTOR_PAINT[Math.floor(r() * TRACTOR_PAINT.length)]);
  const grime = new THREE.Color(0x5a4d3c);
  const body = paint.clone().lerp(grime, r() * 0.3);
  const rearR = 0.85;
  const frontR = 0.48;
  const track = 0.95;
  // The rear wheels, big and lugged; the front ones small and set in.
  for (const side of [-1, 1]) {
    wheel(b, side * track, -0.7, rearR, 0.5, true);
    wheel(b, side * (track - 0.2), 1.55, frontR, 0.28);
  }
  // The chassis and the bonnet running forward from the cab.
  box(b, TINT.steel, 0, 0.75, 0.4, 0.9, 0.5, 3.2);
  box(b, body, 0, 1.25, 1.0, 1.05, 0.7, 2.1);
  box(b, body, 0, 1.15, 2.05, 0.95, 0.5, 0.3);
  // The grille and lamps on the nose.
  box(b, TINT.cab, 0, 1.15, 2.22, 0.7, 0.5, 0.04);
  for (const side of [-1, 1]) box(b, TINT.lamp, side * 0.36, 1.35, 2.22, 0.16, 0.14, 0.04);
  // The exhaust stack and the air intake up the bonnet.
  const stack = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6);
  stack.translate(0.35, 2.0, 1.4);
  b.add(stack, TINT.cab);
  const intake = new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6);
  intake.translate(-0.35, 1.9, 1.3);
  b.add(intake, TINT.cab);
  // The cab: a tall glass box on a dark frame, over the rear axle.
  const cabZ = -0.5;
  box(b, TINT.cab, 0, 1.75, cabZ, 1.35, 0.3, 1.6);
  box(b, TINT.glass, 0, 2.35, cabZ, 1.3, 0.95, 1.55);
  for (const side of [-1, 1]) {
    box(b, TINT.cab, side * 0.66, 2.35, cabZ + 0.78, 0.08, 1.0, 0.08);
    box(b, TINT.cab, side * 0.66, 2.35, cabZ - 0.78, 0.08, 1.0, 0.08);
  }
  box(b, body, 0, 2.9, cabZ, 1.45, 0.16, 1.7);
  // Mudguards over the rear wheels.
  for (const side of [-1, 1]) {
    box(b, body, side * track, rearR + 0.55, -0.7, 0.55, 0.12, 1.5);
  }
  // The three-point hitch at the back.
  box(b, TINT.steel, 0, 0.6, -1.85, 0.6, 0.2, 0.4);
}

function trailer(b: GeoBuilder, r: () => number): void {
  const paint = r() < 0.5 ? TINT.trailer : TINT.trailerRed;
  const L = 4.6;
  const W = 2.2;
  for (const side of [-1, 1]) {
    for (const z of [-0.9, 0.3]) wheel(b, side * (W / 2 - 0.15), z, 0.45, 0.3);
  }
  box(b, TINT.steel, 0, 0.7, 0, 0.5, 0.2, L + 1.0);
  // The tipping box: a floor, four sides, a red-and-white board at the back.
  box(b, TINT.bed, 0, 0.98, 0, W, 0.08, L);
  const h = 0.9;
  for (const side of [-1, 1]) box(b, paint, side * (W / 2 - 0.04), 0.98 + h / 2, 0, 0.08, h, L);
  box(b, paint, 0, 0.98 + h / 2, L / 2 - 0.04, W, h, 0.08);
  box(b, paint, 0, 0.98 + h / 2, -L / 2 + 0.04, W, h, 0.08);
  // The drawbar forward to the hitch.
  box(b, TINT.steel, 0, 0.65, L / 2 + 0.7, 0.16, 0.12, 1.4);
}

function plough(b: GeoBuilder): void {
  // A beam on two depth wheels with four mouldboards hanging off it in a
  // stagger, the way a reversible plough stands when it is unhitched.
  box(b, TINT.rust, 0, 0.9, 0, 0.18, 0.18, 3.2);
  box(b, TINT.rust, 0, 0.8, 1.7, 0.5, 0.14, 0.8);
  for (const side of [-1, 1]) wheel(b, side * 0.9, -0.6, 0.3, 0.14);
  for (let k = 0; k < 4; k++) {
    const z = 1.1 - k * 0.75;
    const x = -0.5 + k * 0.3;
    box(b, TINT.rust, x, 0.55, z, 0.08, 0.7, 0.08);
    const board = new THREE.BoxGeometry(0.5, 0.36, 0.06);
    board.rotateY(0.6);
    board.rotateX(-0.4);
    board.translate(x + 0.18, 0.22, z);
    b.add(board, TINT.mouldboard);
  }
}

function harrow(b: GeoBuilder): void {
  // A wide frame carrying two gangs of discs, standing on its own wheels.
  const W = 3.0;
  box(b, TINT.rust, 0, 0.62, 0, W, 0.12, 0.14);
  box(b, TINT.rust, 0, 0.62, -1.1, W, 0.12, 0.14);
  for (const side of [-1, 1])
    box(b, TINT.rust, side * (W / 2 - 0.07), 0.62, -0.55, 0.14, 0.12, 1.2);
  box(b, TINT.rust, 0, 0.55, 0.9, 0.18, 0.1, 1.8);
  for (const z of [0, -1.1]) {
    for (let k = 0; k < 9; k++) {
      const x = -W / 2 + 0.3 + (k * (W - 0.6)) / 8;
      const disc = new THREE.CylinderGeometry(0.27, 0.27, 0.03, 10);
      disc.rotateZ(Math.PI / 2);
      disc.rotateY(z === 0 ? 0.35 : -0.35);
      disc.translate(x, 0.27, z);
      b.add(disc, TINT.disc);
    }
    box(b, TINT.steel, 0, 0.27, z, W - 0.5, 0.05, 0.05);
  }
}

function baler(b: GeoBuilder): void {
  // A red box the size of a small car on two wheels, the pickup reel at
  // the front, the drawbar out ahead of it.
  const W = 2.3;
  for (const side of [-1, 1]) wheel(b, side * (W / 2 + 0.05), -0.2, 0.5, 0.3);
  box(b, TINT.baler, 0, 1.35, -0.2, W, 1.6, 2.2);
  const drum = new THREE.CylinderGeometry(0.85, 0.85, W + 0.08, 12);
  drum.rotateZ(Math.PI / 2);
  drum.translate(0, 1.35, -0.2);
  b.add(drum, TINT.baler);
  box(b, TINT.cab, 0, 0.45, 1.05, W - 0.4, 0.4, 0.5);
  const reel = new THREE.CylinderGeometry(0.22, 0.22, W - 0.5, 8);
  reel.rotateZ(Math.PI / 2);
  reel.translate(0, 0.3, 1.1);
  b.add(reel, TINT.steel);
  box(b, TINT.steel, 0, 0.7, 2.0, 0.16, 0.12, 1.6);
}

/** One machine as a mesh, from the engine's record. */
export function buildFarmGear(gear: FarmGear, rand: () => number): THREE.Mesh {
  const b = new GeoBuilder(rand);
  const r = rolls(gear.roll);
  switch (gear.kind) {
    case "tractor":
      tractor(b, r);
      break;
    case "trailer":
      trailer(b, r);
      break;
    case "plough":
      plough(b);
      break;
    case "harrow":
      harrow(b);
      break;
    case "baler":
      baler(b);
      break;
  }
  const mesh = new THREE.Mesh(b.build(), gearMaterial());
  mesh.frustumCulled = true;
  return mesh;
}

/** A round bale: on its side in the field, a metre and a quarter across
 * and as long, in straw or the white plastic wrap of a silage bale. */
export const BALE = { radius: 0.62, length: 1.2 };

export function buildBale(wrapped: boolean, rand: () => number): THREE.Mesh {
  const b = new GeoBuilder(rand);
  const body = new THREE.CylinderGeometry(BALE.radius, BALE.radius, BALE.length, 10);
  body.rotateZ(Math.PI / 2);
  body.translate(0, BALE.radius, 0);
  b.add(body, wrapped ? TINT.wrap : TINT.bale);
  if (!wrapped) {
    for (const end of [-1, 1]) {
      const cap = new THREE.CylinderGeometry(BALE.radius * 0.92, BALE.radius * 0.92, 0.04, 10);
      cap.rotateZ(Math.PI / 2);
      cap.translate(end * (BALE.length / 2 + 0.01), BALE.radius, 0);
      b.add(cap, TINT.baleEnd);
    }
  }
  const mesh = new THREE.Mesh(b.build(), gearMaterial());
  mesh.frustumCulled = true;
  return mesh;
}
