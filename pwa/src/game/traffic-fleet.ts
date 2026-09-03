// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAFFIC'S VEHICLES (R44), drawn. The engine's roster
// (`engine/game/defs/traffic.ts`) says what each one IS — a body, a size, a
// mass — and this module says what it looks like: a dozen boxes and its
// wheels, one merged vertex-coloured geometry, lit and speckled like the
// parked cars and the train and everything else that is passed at forty
// metres a second. Nothing here has a working wheel or a crew: a lorry on
// a public road is a silhouette and a colour, and the twenty silhouettes
// are the variety.
//
// Every body kind is an ARRANGEMENT of the same few parts — a cabin, a
// cab, a load — built to the row's own length, width and height, so the
// box the player hits (the engine's capsule, cut from the same row) is the
// box they can see.
//
// Local frame: wheels on y = 0, +z is the NOSE, `rotation.y = heading`.

import * as THREE from "three";
import type { TrafficModel } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { LIVERY_COUNT, liveryFor } from "./car-livery.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture } from "./textures.ts";

const TINT = {
  glass: new THREE.Color(0x232c36),
  tyre: new THREE.Color(0x1a1b1d),
  hub: new THREE.Color(0x9a9ea3),
  trim: new THREE.Color(0x2a2c2f),
  lamp: new THREE.Color(0xe9e2c4),
  tail: new THREE.Color(0xb0281f),
  plate: new THREE.Color(0xf0eee6),
  bed: new THREE.Color(0x3a3a3a),
  chassis: new THREE.Color(0x2c2c2e),
  boxWhite: new THREE.Color(0xe4e2dc),
  boxGrey: new THREE.Color(0x9a9c9e),
  tank: new THREE.Color(0xc9cccf),
  tankBand: new THREE.Color(0x6a6d70),
  log: new THREE.Color(0x8a6a48),
  logEnd: new THREE.Color(0xc9b892),
  stanchion: new THREE.Color(0x3d3a36),
  load: new THREE.Color(0x6b5a44),
  camper: new THREE.Color(0xf1efe8),
  camperStripe: new THREE.Color(0xb8722f),
  roof: new THREE.Color(0xdedcd6),
};

/** The paints a body kind is sold in. Cars take the field's palette half
 * the time, like a yard car; working vehicles take fleet colours. */
const PLAIN = [0xe8e6df, 0x8e9196, 0x2a2c30, 0x263a5e, 0x6b1f1b, 0x3f5a3a, 0xb8b4a8];
const WORK = [0xd8352a, 0x2b4f9e, 0xf0eee6, 0x3c6b3a, 0xe0a626, 0x6a6d70, 0xf0eee6];
const BUS = [0xe3b22f, 0xd8352a, 0x2b4f9e, 0xe9e2c4];

const fleetMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);

/** Successive rolls off one number, so a vehicle's id can decide its paint
 * without the decisions being correlated. */
function rolls(seed: number): () => number {
  let s = Math.floor(seed * 2654435761) >>> 0 || 0x9e3779b9;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return ((s >>> 8) & 0xffffff) / 0x1000000;
  };
}

/** What a vehicle is painted, from one roll: an index into its body's own
 * palette, so the cache below can share one geometry per model and paint. */
export function trafficPaint(model: TrafficModel, roll: number): number {
  const r = rolls(roll);
  const car = ["hatch", "saloon", "estate", "suv", "pickup"].includes(model.body);
  if (car) {
    // Half the cars in the field's paint, the rest plain — a yard's mix.
    return r() < 0.5
      ? 100 + (Math.floor(r() * LIVERY_COUNT) % LIVERY_COUNT)
      : Math.floor(r() * PLAIN.length);
  }
  const palette = model.body === "bus" ? BUS : WORK;
  return Math.floor(r() * palette.length);
}

function paintColor(model: TrafficModel, paint: number): THREE.Color {
  if (paint >= 100) return new THREE.Color(liveryFor(paint - 100).paint);
  const palette =
    model.body === "bus"
      ? BUS
      : ["hatch", "saloon", "estate", "suv", "pickup"].includes(model.body)
        ? PLAIN
        : WORK;
  return new THREE.Color(palette[paint % palette.length]);
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

/** An axle: a wheel each side at `z`, `twin` for a lorry's paired rears. */
function axle(b: GeoBuilder, W: number, z: number, radius: number, twin = false): void {
  const track = W / 2 - 0.1;
  for (const side of [-1, 1]) {
    wheel(b, side * track, z, radius, twin ? 0.5 : 0.24);
  }
}

/** The dark bar at each end with its lamps and plate. */
function ends(b: GeoBuilder, W: number, L: number, y: number, lampY: number): void {
  for (const end of [-1, 1]) {
    const z = end * (L / 2 + 0.03);
    box(b, TINT.trim, 0, y, z, W, 0.22, 0.1);
    const lamp = end > 0 ? TINT.lamp : TINT.tail;
    for (const side of [-1, 1]) box(b, lamp, side * (W / 2 - 0.25), lampY, z, 0.3, 0.14, 0.05);
    box(b, TINT.plate, 0, y + 0.2, z, 0.5, 0.12, 0.04);
  }
}

/** A row of side windows along a body, plus the screen at its front. */
function glazing(
  b: GeoBuilder,
  W: number,
  y: number,
  h: number,
  from: number,
  to: number,
  screen: boolean,
  backlight: boolean,
): void {
  const len = to - from;
  const z = (from + to) / 2;
  box(b, TINT.glass, 0, y, z, W + 0.04, h, len * 0.9);
  if (screen) box(b, TINT.glass, 0, y, to, W * 0.86, h, 0.06);
  if (backlight) box(b, TINT.glass, 0, y, from, W * 0.86, h, 0.06);
}

/** How each of the passenger bodies is proportioned: where the cabin sits
 * along the length (shares of it, from the tail), the lower body's share
 * of the height, the wheel. */
const CARS = {
  hatch: { cabin: [0.08, 0.72], sill: 0.5, wheel: 0.32 },
  saloon: { cabin: [0.22, 0.72], sill: 0.52, wheel: 0.33 },
  estate: { cabin: [0.04, 0.74], sill: 0.52, wheel: 0.33 },
  suv: { cabin: [0.06, 0.74], sill: 0.5, wheel: 0.4 },
  pickup: { cabin: [0.42, 0.78], sill: 0.6, wheel: 0.4 },
  van: { cabin: [0.02, 0.82], sill: 0.42, wheel: 0.36 },
  minibus: { cabin: [0.02, 0.84], sill: 0.4, wheel: 0.36 },
} as const;

/** A passenger car, a van or a minibus: the three-box arrangement. */
function passenger(
  b: GeoBuilder,
  m: TrafficModel,
  paint: THREE.Color,
  kind: keyof typeof CARS,
): void {
  const p = CARS[kind];
  const L = m.length;
  const W = m.width;
  const H = m.height;
  const clearance = kind === "suv" || kind === "pickup" ? 0.28 : 0.2;
  const sillTop = clearance + (H - clearance) * p.sill;
  box(b, paint, 0, clearance + (sillTop - clearance) / 2, 0, W, sillTop - clearance, L);
  const axleZ = L / 2 - 0.75;
  axle(b, W, axleZ, p.wheel);
  axle(b, W, -axleZ, p.wheel);
  const cabinFrom = -L / 2 + L * p.cabin[0];
  const cabinTo = -L / 2 + L * p.cabin[1];
  const cabinL = cabinTo - cabinFrom;
  const cabinZ = (cabinFrom + cabinTo) / 2;
  const cabinW = W - 0.16;
  const cabinH = H - sillTop;
  box(b, paint, 0, sillTop + cabinH / 2, cabinZ, cabinW, cabinH, cabinL);
  const glassY = sillTop + cabinH * 0.55;
  const glassH = cabinH * 0.5;
  if (kind === "minibus") {
    // A minibus is windows all the way back.
    glazing(b, cabinW, glassY, glassH, cabinFrom + 0.3, cabinTo - 0.1, true, true);
  } else {
    box(b, TINT.glass, 0, glassY, cabinZ, cabinW + 0.04, glassH, cabinL * 0.86);
    box(b, TINT.glass, 0, glassY, cabinTo, cabinW * 0.86, glassH, 0.06);
    if (kind !== "van") box(b, TINT.glass, 0, glassY, cabinFrom, cabinW * 0.86, glassH, 0.06);
  }
  if (kind === "van") {
    // A panel van's flank is panel: the glass band stops at the cab.
    box(b, paint, 0, glassY, cabinZ - cabinL * 0.15, cabinW + 0.06, glassH + 0.02, cabinL * 0.62);
  }
  if (kind === "suv") {
    for (const side of [-1, 1])
      box(b, TINT.trim, side * (cabinW / 2 - 0.12), H + 0.05, cabinZ, 0.06, 0.08, cabinL * 0.7);
  }
  if (kind === "pickup") {
    const bedL = cabinFrom + L / 2 - 0.2;
    const bedZ = -L / 2 + bedL / 2;
    box(b, TINT.bed, 0, sillTop + 0.02, bedZ, W - 0.2, 0.04, bedL);
    for (const side of [-1, 1])
      box(b, paint, side * (W / 2 - 0.05), sillTop + 0.18, bedZ, 0.1, 0.36, bedL);
    box(b, paint, 0, sillTop + 0.18, -L / 2 + 0.05, W - 0.2, 0.36, 0.1);
  }
  ends(b, W, L, clearance + 0.22, sillTop - 0.14);
  for (const side of [-1, 1]) {
    box(b, TINT.trim, side * (cabinW / 2 + 0.1), sillTop + 0.32, cabinTo - 0.2, 0.2, 0.1, 0.12);
  }
}

/** A lorry's cab: a tall short box on the chassis at the nose, with its
 * screen, its grille and a step. Returns where the cab ends. */
function cab(
  b: GeoBuilder,
  m: TrafficModel,
  paint: THREE.Color,
  cabL: number,
  cabH: number,
  sleeper = false,
): number {
  const L = m.length;
  const W = m.width;
  const front = L / 2;
  const cabZ = front - cabL / 2;
  const floor = 0.55;
  box(b, paint, 0, floor + (cabH - floor) / 2, cabZ, W - 0.1, cabH - floor, cabL);
  const glassY = floor + (cabH - floor) * 0.66;
  const glassH = (cabH - floor) * 0.42;
  box(b, TINT.glass, 0, glassY, front - 0.02, W * 0.86, glassH, 0.06);
  box(b, TINT.glass, 0, glassY, cabZ + cabL * 0.1, W - 0.04, glassH, cabL * 0.6);
  // The grille and the bumper.
  box(b, TINT.trim, 0, floor + 0.3, front + 0.02, W * 0.8, 0.5, 0.06);
  box(b, TINT.trim, 0, 0.5, front + 0.04, W, 0.3, 0.12);
  for (const side of [-1, 1])
    box(b, TINT.lamp, side * (W / 2 - 0.3), 0.75, front + 0.06, 0.32, 0.18, 0.05);
  if (sleeper) box(b, paint, 0, cabH + 0.25, cabZ - cabL * 0.15, W - 0.3, 0.5, cabL * 0.7);
  // Mirrors, the big square ones.
  for (const side of [-1, 1])
    box(b, TINT.trim, side * (W / 2 + 0.15), glassY, front - 0.3, 0.06, 0.4, 0.2);
  return front - cabL;
}

/** A chassis rail under a load, tail to `to`, with its axles. */
function chassis(
  b: GeoBuilder,
  m: TrafficModel,
  to: number,
  axles: number[],
  wheelR: number,
): void {
  const L = m.length;
  const W = m.width;
  box(b, TINT.chassis, 0, 0.45, (to - L / 2) / 2, W - 0.5, 0.25, to + L / 2);
  for (const z of axles) axle(b, W, z, wheelR, true);
}

function boxTruck(b: GeoBuilder, m: TrafficModel, paint: THREE.Color): void {
  const L = m.length;
  const W = m.width;
  const H = m.height;
  const cabEnd = cab(b, m, paint, Math.min(2.2, L * 0.3), H * 0.78);
  chassis(b, m, cabEnd, [L / 2 - 1.2, -L / 2 + 1.4], 0.48);
  const bodyL = cabEnd + L / 2 - 0.25;
  box(b, TINT.boxWhite, 0, 0.6 + (H - 0.6) / 2, -L / 2 + bodyL / 2, W, H - 0.6, bodyL);
  box(b, TINT.roof, 0, H + 0.02, -L / 2 + bodyL / 2, W - 0.1, 0.04, bodyL - 0.1);
  box(b, TINT.trim, 0, 0.5, -L / 2 - 0.03, W, 0.22, 0.1);
  for (const side of [-1, 1])
    box(b, TINT.tail, side * (W / 2 - 0.25), 0.8, -L / 2 - 0.03, 0.3, 0.14, 0.05);
}

function tipper(b: GeoBuilder, m: TrafficModel, paint: THREE.Color): void {
  const L = m.length;
  const W = m.width;
  const H = m.height;
  const cabEnd = cab(b, m, paint, 2.2, H * 0.85);
  chassis(b, m, cabEnd, [L / 2 - 1.3, -L / 2 + 1.0, -L / 2 + 2.3], 0.5);
  const bodyL = cabEnd + L / 2 - 0.3;
  const bodyZ = -L / 2 + bodyL / 2;
  const floor = 1.1;
  const top = H * 0.8;
  box(b, paint, 0, floor + (top - floor) / 2, bodyZ, W, top - floor, bodyL);
  // The load, heaped over the sides.
  box(b, TINT.load, 0, top + 0.15, bodyZ, W - 0.4, 0.3, bodyL - 0.5);
  box(b, TINT.load, 0, top + 0.35, bodyZ, W - 1.0, 0.2, bodyL - 1.2);
  box(b, TINT.trim, 0, 0.5, -L / 2 - 0.03, W, 0.22, 0.1);
}

function timber(b: GeoBuilder, m: TrafficModel, paint: THREE.Color): void {
  const L = m.length;
  const W = m.width;
  const H = m.height;
  const cabEnd = cab(b, m, paint, 2.3, H * 0.82);
  chassis(b, m, cabEnd, [L / 2 - 1.3, -L / 2 + 1.0, -L / 2 + 2.3], 0.5);
  const bedL = cabEnd + L / 2 - 0.4;
  const bedZ = -L / 2 + bedL / 2;
  box(b, TINT.bed, 0, 1.0, bedZ, W - 0.2, 0.15, bedL);
  // Stanchions, then the logs stacked between them.
  for (const zShare of [0.1, 0.4, 0.7, 0.95]) {
    const z = -L / 2 + bedL * zShare;
    for (const side of [-1, 1])
      box(b, TINT.stanchion, side * (W / 2 - 0.1), 1.0 + (H - 1.0) / 2, z, 0.1, H - 1.0, 0.12);
  }
  const rows = 3;
  const r = 0.25;
  for (let row = 0; row < rows; row++) {
    const count = 4 - row;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * r * 2.05;
      const y = 1.08 + r + row * r * 1.75;
      const log = new THREE.CylinderGeometry(r, r, bedL - 0.3, 7);
      log.rotateX(Math.PI / 2);
      log.translate(x, y, bedZ);
      b.add(log, TINT.log);
    }
  }
}

function tanker(b: GeoBuilder, m: TrafficModel, paint: THREE.Color): void {
  const L = m.length;
  const W = m.width;
  const H = m.height;
  const cabEnd = cab(b, m, paint, 2.2, H * 0.85);
  chassis(b, m, cabEnd, [L / 2 - 1.3, -L / 2 + 1.0, -L / 2 + 2.3], 0.5);
  const tankL = cabEnd + L / 2 - 0.5;
  const tankZ = -L / 2 + tankL / 2 + 0.1;
  const r = (H - 1.0) / 2;
  const tank = new THREE.CylinderGeometry(r, r, tankL, 12);
  tank.rotateX(Math.PI / 2);
  tank.translate(0, 1.0 + r, tankZ);
  b.add(tank, TINT.tank);
  for (const zShare of [0.25, 0.5, 0.75]) {
    const band = new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.12, 12);
    band.rotateX(Math.PI / 2);
    band.translate(0, 1.0 + r, -L / 2 + 0.1 + tankL * zShare);
    b.add(band, TINT.tankBand);
  }
  box(b, TINT.chassis, 0, 1.0, tankZ, W - 0.6, 0.2, tankL);
}

function artic(b: GeoBuilder, m: TrafficModel, paint: THREE.Color): void {
  const L = m.length;
  const W = m.width;
  const H = m.height;
  // The tractor: a sleeper cab over its own two axles, the fifth wheel
  // behind it; the trailer's box rides over that on its own triple.
  const tractorL = 5.6;
  const cabEnd = cab(b, m, paint, 2.4, H * 0.85, true);
  box(b, TINT.chassis, 0, 0.45, L / 2 - tractorL / 2, W - 0.5, 0.25, tractorL);
  axle(b, W, L / 2 - 1.4, 0.5, true);
  axle(b, W, L / 2 - tractorL + 1.2, 0.5, true);
  box(b, TINT.trim, 0, 0.62, L / 2 - tractorL + 1.4, 1.0, 0.1, 1.0);
  const trailerL = L - tractorL + 2.2;
  const trailerZ = -L / 2 + trailerL / 2;
  const floor = 1.15;
  box(b, TINT.boxWhite, 0, floor + (H - floor) / 2, trailerZ, W, H - floor, trailerL);
  box(b, TINT.roof, 0, H + 0.02, trailerZ, W - 0.1, 0.04, trailerL - 0.1);
  box(b, TINT.chassis, 0, 0.95, trailerZ - 0.5, W - 0.5, 0.25, trailerL * 0.55);
  for (const z of [-L / 2 + 1.0, -L / 2 + 2.3, -L / 2 + 3.6]) axle(b, W, z, 0.5, true);
  box(b, TINT.trim, 0, 0.7, -L / 2 - 0.03, W, 0.22, 0.1);
  for (const side of [-1, 1])
    box(b, TINT.tail, side * (W / 2 - 0.25), 0.95, -L / 2 - 0.03, 0.3, 0.14, 0.05);
  void cabEnd;
}

function bus(b: GeoBuilder, m: TrafficModel, paint: THREE.Color): void {
  const L = m.length;
  const W = m.width;
  const H = m.height;
  const floor = 0.45;
  box(b, paint, 0, floor + (H - floor) / 2, 0, W, H - floor, L);
  box(b, TINT.roof, 0, H + 0.02, 0, W - 0.2, 0.04, L - 0.3);
  const glassY = floor + (H - floor) * 0.62;
  const glassH = (H - floor) * 0.34;
  glazing(b, W, glassY, glassH, -L / 2 + 0.4, L / 2 - 0.1, true, true);
  // The door, a taller pane behind the front axle on the kerb side.
  box(
    b,
    TINT.glass,
    W / 2 + 0.02,
    floor + (H - floor) * 0.45,
    L / 2 - 1.5,
    0.04,
    (H - floor) * 0.8,
    1.0,
  );
  axle(b, W, L / 2 - 2.4, 0.5, true);
  axle(b, W, -L / 2 + 2.6, 0.5, true);
  // The destination board over the screen.
  box(b, TINT.lamp, 0, H - 0.25, L / 2 + 0.02, W * 0.7, 0.28, 0.04);
  ends(b, W, L, 0.55, 0.9);
}

function camper(b: GeoBuilder, m: TrafficModel, paint: THREE.Color): void {
  const L = m.length;
  const W = m.width;
  const H = m.height;
  const cabL = 1.9;
  const cabH = H * 0.66;
  const cabEnd = cab(b, m, paint, cabL, cabH);
  // The living box behind the cab, with its bed over the cab roof.
  const bodyL = cabEnd + L / 2 - 0.2;
  const bodyZ = -L / 2 + bodyL / 2;
  box(b, TINT.camper, 0, 0.5 + (H - 0.5) / 2, bodyZ, W, H - 0.5, bodyL);
  box(
    b,
    TINT.camper,
    0,
    cabH + (H - cabH) / 2 - 0.05,
    cabEnd + cabL * 0.45,
    W - 0.3,
    H - cabH - 0.1,
    cabL * 0.9,
  );
  box(b, TINT.camperStripe, 0, H * 0.5, bodyZ, W + 0.02, 0.18, bodyL - 0.2);
  for (const side of [-1, 1])
    box(b, TINT.glass, side * (W / 2 + 0.01), H * 0.68, bodyZ + 0.3, 0.04, 0.6, bodyL * 0.35);
  box(b, TINT.roof, 0, H + 0.02, bodyZ, W - 0.2, 0.04, bodyL - 0.2);
  axle(b, W, L / 2 - 1.2, 0.36);
  axle(b, W, -L / 2 + 1.4, 0.36, true);
  box(b, TINT.trim, 0, 0.45, -L / 2 - 0.03, W, 0.22, 0.1);
  for (const side of [-1, 1])
    box(b, TINT.tail, side * (W / 2 - 0.25), 0.75, -L / 2 - 0.03, 0.3, 0.14, 0.05);
}

/** Build one vehicle's geometry. `rand` is the facet jitter's only. */
export function trafficVehicleGeometry(
  m: TrafficModel,
  paint: number,
  rand: () => number,
): THREE.BufferGeometry {
  const b = new GeoBuilder(rand);
  const color = paintColor(m, paint);
  switch (m.body) {
    case "hatch":
    case "saloon":
    case "estate":
    case "suv":
    case "pickup":
    case "van":
    case "minibus":
      passenger(b, m, color, m.body);
      break;
    case "camper":
      camper(b, m, color);
      break;
    case "bus":
      bus(b, m, color);
      break;
    case "boxTruck":
      boxTruck(b, m, color);
      break;
    case "timber":
      timber(b, m, color);
      break;
    case "tanker":
      tanker(b, m, color);
      break;
    case "artic":
      artic(b, m, color);
      break;
    case "tipper":
      tipper(b, m, color);
      break;
  }
  return b.build();
}

/** A vehicle as a mesh, wheels on local y = 0, nose along +z. */
export function buildTrafficVehicle(
  m: TrafficModel,
  paint: number,
  rand: () => number,
): THREE.Mesh {
  return new THREE.Mesh(trafficVehicleGeometry(m, paint, rand), fleetMaterial());
}
