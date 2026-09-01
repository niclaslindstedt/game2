// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PARKED CAR — a car as scenery. Not the catalog's: those are thousands
// of triangles with working wheels, glass, an interior and a crew, built
// part by part over tens of milliseconds, and a car standing in a farmyard
// is passed at forty metres a second and never looked at twice. This is a
// dozen boxes and four cylinders, one merged vertex-coloured geometry, lit
// by the scene like everything else that stands still — and it is what a
// car park of a hundred will be made of when there is a car park.
//
// The variety is in the SILHOUETTE, which is the only thing that reads at
// that distance: a hatchback, a saloon, an estate, a van and a pickup, each
// a different arrangement of the same three boxes (lower body, cabin,
// deck), in a paint pulled from the field's own palette so it sits in the
// same colour world as the rivals. Everything about one car comes out of a
// single roll, so the engine can place "a car" and this module decides
// which without either side rolling twice.
//
// Local frame: the car stands on y = 0 with its wheels on the ground, +z is
// the NOSE, and `rotation.y = heading` turns it the way every placed thing
// in the world is turned.

import * as THREE from "three";
import { GeoBuilder } from "./flora-build.ts";
import { LIVERY_COUNT, liveryFor } from "./car-livery.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture } from "./textures.ts";

export type ParkedBody = "hatch" | "saloon" | "estate" | "van" | "pickup";

/** Everything one parked car is: which body, how big, what colour. */
export type ParkedCarSpec = {
  body: ParkedBody;
  /** Overall length, m, and the body's width and its roofline height. */
  length: number;
  width: number;
  height: number;
  paint: number;
  /** A shade or two of dirt over the paint, 0..1 — a yard car is never
   * clean. */
  grime: number;
};

/** How each body is proportioned: where the cabin sits along the length
 * (as shares of it, from the tail), how tall the lower body is relative to
 * the roofline, and what stands behind the cabin. */
const BODIES: Record<
  ParkedBody,
  { length: [number, number]; height: [number, number]; cabin: [number, number]; sill: number }
> = {
  hatch: { length: [3.7, 4.1], height: [1.42, 1.52], cabin: [0.08, 0.72], sill: 0.5 },
  saloon: { length: [4.4, 4.8], height: [1.4, 1.48], cabin: [0.22, 0.72], sill: 0.52 },
  estate: { length: [4.5, 4.8], height: [1.46, 1.54], cabin: [0.04, 0.74], sill: 0.52 },
  van: { length: [4.6, 5.1], height: [1.9, 2.1], cabin: [0.02, 0.82], sill: 0.42 },
  pickup: { length: [4.9, 5.3], height: [1.7, 1.82], cabin: [0.42, 0.78], sill: 0.6 },
};

/** How often each body turns up in a yard. Vans and pickups are what a
 * place out here actually runs; the saloon is the rarity. */
const BODY_WEIGHTS: [ParkedBody, number][] = [
  ["hatch", 0.3],
  ["estate", 0.25],
  ["pickup", 0.2],
  ["van", 0.15],
  ["saloon", 0.1],
];

const TINT = {
  glass: new THREE.Color(0x232c36),
  tyre: new THREE.Color(0x1a1b1d),
  hub: new THREE.Color(0x9a9ea3),
  trim: new THREE.Color(0x2a2c2f),
  lamp: new THREE.Color(0xe9e2c4),
  tail: new THREE.Color(0xb0281f),
  plate: new THREE.Color(0xf0eee6),
  bed: new THREE.Color(0x3a3a3a),
};

const carMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);

/** Successive rolls off one seed, so a single number can decide a whole
 * car without the decisions being correlated. */
function rolls(seed: number): () => number {
  let s = Math.floor(seed * 4294967296) >>> 0 || 0x9e3779b9;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return ((s >>> 8) & 0xffffff) / 0x1000000;
  };
}

/** Decide a car from one roll in [0, 1): body, size and paint. The same
 * roll is the same car, wherever it is placed. */
export function parkedCarSpec(roll: number): ParkedCarSpec {
  const r = rolls(roll);
  let pick = r();
  let body: ParkedBody = "hatch";
  for (const [kind, weight] of BODY_WEIGHTS) {
    if (pick < weight) {
      body = kind;
      break;
    }
    pick -= weight;
  }
  const b = BODIES[body];
  const livery = liveryFor(Math.floor(r() * LIVERY_COUNT) % LIVERY_COUNT);
  // Most cars are not liveried: the field's paint half the time, and a
  // plain white, grey, black or dark blue the rest — what a real yard holds.
  const plain = [0xe8e6df, 0x8e9196, 0x2a2c30, 0x263a5e, 0x6b1f1b, 0x3f5a3a];
  const paint = r() < 0.55 ? livery.paint : plain[Math.floor(r() * plain.length) % plain.length];
  return {
    body,
    length: b.length[0] + (b.length[1] - b.length[0]) * r(),
    width: 1.7 + 0.16 * r(),
    height: b.height[0] + (b.height[1] - b.height[0]) * r(),
    paint,
    grime: r() * 0.5,
  };
}

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

/** A wheel: a short fat cylinder on its side, axle along X. */
function wheel(b: GeoBuilder, x: number, z: number, radius: number, width: number): void {
  const tyre = new THREE.CylinderGeometry(radius, radius, width, 8);
  tyre.rotateZ(Math.PI / 2);
  tyre.translate(x, radius, z);
  b.add(tyre, TINT.tyre);
  const hub = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 8);
  hub.rotateZ(Math.PI / 2);
  hub.translate(x, radius, z);
  b.add(hub, TINT.hub);
}

/** Build the car's geometry. `rand` is the facet jitter's only. */
export function parkedCarGeometry(spec: ParkedCarSpec, rand: () => number): THREE.BufferGeometry {
  const b = new GeoBuilder(rand);
  const body = BODIES[spec.body];
  const paint = new THREE.Color(spec.paint).lerp(new THREE.Color(0x5a4d3c), spec.grime * 0.35);
  const L = spec.length;
  const W = spec.width;
  const H = spec.height;
  const wheelR = 0.32;
  const clearance = 0.2;
  const sillTop = clearance + (H - clearance) * body.sill;
  // The lower body, tail to nose, on its wheels; the wheel arches are the
  // wheels showing under it rather than cuts, which at this size is the
  // same picture.
  box(b, paint, 0, clearance + (sillTop - clearance) / 2, 0, W, sillTop - clearance, L);
  const track = W / 2 - 0.08;
  const axleZ = L / 2 - 0.75;
  for (const side of [-1, 1]) {
    wheel(b, side * track, axleZ, wheelR, 0.22);
    wheel(b, side * track, -axleZ, wheelR, 0.22);
  }
  // The cabin: a narrower box on the body between its two stations, with a
  // dark band of glass round it. On a van the cabin IS the body; on a
  // pickup the bed behind it is open.
  const cabinFrom = -L / 2 + L * body.cabin[0];
  const cabinTo = -L / 2 + L * body.cabin[1];
  const cabinL = cabinTo - cabinFrom;
  const cabinZ = (cabinFrom + cabinTo) / 2;
  const cabinW = W - 0.16;
  const cabinH = H - sillTop;
  box(b, paint, 0, sillTop + cabinH / 2, cabinZ, cabinW, cabinH, cabinL);
  // Glass: a band just proud of the cabin's flanks, screen and backlight.
  const glassY = sillTop + cabinH * 0.55;
  const glassH = cabinH * 0.5;
  box(b, TINT.glass, 0, glassY, cabinZ, cabinW + 0.04, glassH, cabinL * 0.86);
  box(b, TINT.glass, 0, glassY, cabinZ + cabinL / 2, cabinW * 0.86, glassH, 0.06);
  if (spec.body !== "van")
    box(b, TINT.glass, 0, glassY, cabinZ - cabinL / 2, cabinW * 0.86, glassH, 0.06);
  if (spec.body === "pickup") {
    // The bed: low sides and a dark floor behind the cab.
    const bedL = cabinFrom + L / 2 - 0.2;
    const bedZ = -L / 2 + bedL / 2;
    box(b, TINT.bed, 0, sillTop + 0.02, bedZ, W - 0.2, 0.04, bedL);
    for (const side of [-1, 1])
      box(b, paint, side * (W / 2 - 0.05), sillTop + 0.18, bedZ, 0.1, 0.36, bedL);
    box(b, paint, 0, sillTop + 0.18, -L / 2 + 0.05, W - 0.2, 0.36, 0.1);
  }
  // Bumpers, lamps and plates: the dark bar at each end, two pale lamps on
  // the nose, two red on the tail, and the plate between them.
  for (const end of [-1, 1]) {
    const z = end * (L / 2 + 0.03);
    box(b, TINT.trim, 0, clearance + 0.22, z, W, 0.22, 0.1);
    const lamp = end > 0 ? TINT.lamp : TINT.tail;
    for (const side of [-1, 1])
      box(b, lamp, side * (W / 2 - 0.25), sillTop - 0.14, z, 0.3, 0.14, 0.05);
    box(b, TINT.plate, 0, clearance + 0.42, z, 0.5, 0.12, 0.04);
  }
  // Mirrors: two nubs at the screen's foot.
  for (const side of [-1, 1])
    box(
      b,
      TINT.trim,
      side * (cabinW / 2 + 0.1),
      sillTop + 0.32,
      cabinZ + cabinL / 2 - 0.2,
      0.2,
      0.1,
      0.12,
    );
  return b.build();
}

/** A parked car as a mesh, wheels on local y = 0, nose along +z. */
export function buildParkedCar(spec: ParkedCarSpec, rand: () => number): THREE.Mesh {
  return new THREE.Mesh(parkedCarGeometry(spec, rand), carMaterial());
}

export const PARKED_BODIES: readonly ParkedBody[] = BODY_WEIGHTS.map(([kind]) => kind);
