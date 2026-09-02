// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Progressive dirt on the car: the run is written onto the paint. Driving
// gravel dusts the car slowly, drifting throws more up, the grass verge is
// muddier still, and a ford splashes the heaviest coat. Dirt only ever
// accumulates — a stage ends with the car looking driven — and resets with
// the next stage's fresh meshes.
//
// What lays a coat on is GROUND COVERED, not time passed: the wheels are
// the sprayers, so a car parked on the gravel with the engine running is a
// car nothing is being thrown at, and it stays exactly as clean as it
// arrived. Every rate here is therefore per METRE driven (`groundTravel`).
//
// It is SPATTER, not a wash. Every face either takes a fleck or keeps its
// paint, and a fleck is one of several dirt tones rather than a single
// tan: real filth is a thousand separate hits in a dozen shades of brown,
// and a smooth even coat reads as a car that has been repainted rather
// than one that has been driven. What decides whether a face is hit is
// WHERE it is — how close to the ground, and how close to a wheel. The
// tires are the sprayers, so they and their rims get it worst, then the
// sills and the panels behind each arch, and the roof barely at all.
//
// The whole car is baked vertex colors on fullbright material, so the coat
// is applied the same way: each mesh's colors are re-lerped toward a dirt
// tone, per FACE, from a pristine copy.

import * as THREE from "three";
import { clamp } from "../lib/util.ts";
import type { CarState, GameState } from "@engine";

/** `userData` flag for a mesh the painter must not write. Two kinds carry
 * it. The screens' grime film (car/wipers.ts) paints its own vertex colours
 * frame to frame, and the painter bakes from a pristine copy of the whole
 * buffer — two writers on one attribute is a flicker, not a coat. The CABIN
 * (car/interior.ts) simply is not out in the weather: gravel does not reach
 * a headliner, and a brown-flecked seat reads as a modelling mistake. */
export const NO_DIRT = "noDirt";

/** A point in car space that throws dirt — one per wheel. */
export type SprayPoint = { x: number; y: number; z: number };

type DirtTarget = {
  geo: THREE.BufferGeometry;
  /** Pristine copy of the mesh's baked colors. */
  orig: Float32Array;
  /** Floats per vertex in that buffer. The glass carries alpha and the paint
   * does not, and a coat written at the wrong stride walks the fourth
   * channel — a window that turns solid as the car gets dirty, in bands. */
  stride: number;
  /** Mesh origin in car space, m. Wheel geometry is authored about its own
   * axle, so without this the tires would be tested for dirt as though
   * they sat on the car's centerline. */
  base: THREE.Vector3;
};

export type CarDirt = {
  update: (state: GameState, dt: number) => void;
  /** How filthy the car is, 0..1 — read by anything that has to answer to
   * the state of the paint rather than just draw it (the lamps dim under a
   * caked lens). */
  level: () => number;
};

/** How much of each coat is on the car, 0 (clean) .. 1 (as filthy as it
 * gets). Dust is the dry film, mud the wet cake thrown up off the wheels. */
export type DirtCoat = { dust: number; mud: number };

/** The dirt palette, dry to wet. A fleck picks one by hash, weighted
 * toward the wet end as the mud coat builds, so a car that has forded a
 * river goes brown while a car that has only driven gravel goes pale. */
const TONES = [0xbca886, 0x9d8760, 0x7d6a45, 0x5d4d33, 0x3f3423].map((hex) => new THREE.Color(hex));

/** Most of the paint a fleck can take, 0..1. Short of 1 so the livery
 * survives the stage — it is how a player tells the three cars apart. */
const FLECK_MAX = 0.88;
/** Coat below which a face keeps its paint entirely. This threshold is
 * what makes the coat read as separate specks instead of a wash. */
const FLECK_FLOOR = 0.14;
/** How far from a wheel dirt is still being thrown, m. */
const SPRAY_REACH = 0.85;

function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Value noise in 0..1, trilinear over unit cells with a smoothstep fade —
 * the patchiness UNDER the specks, so flecks gather into streaks and
 * clumps instead of scattering evenly over the whole panel. */
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number): number => hash(xi + dx, yi + dy, zi + dz);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/** Bakes a coat onto every mesh under `root`, from its pristine colors.
 * Split out from the accumulator so the car-preview tool can render a
 * filthy car without inventing a GameState to drive it there.
 *
 * `spray` is where the dirt comes FROM — the wheel centers in car space.
 * Everything near one gets hammered, which is what puts the filth on the
 * tires, the rims, the arch liners and the sills instead of spreading it
 * evenly over a car that only ever gets dirty from the ground up. */
export function createDirtPainter(
  root: THREE.Group,
  spray: readonly SprayPoint[] = [],
): (coat: DirtCoat) => void {
  // One target per GEOMETRY, not per mesh: the four wheels share a single
  // buffer, and painting it four times over is four whole-buffer writes
  // and four uploads for one result. The last mesh to claim a geometry is
  // the one whose place on the car decides its filth — the rearmost wheel,
  // which is the dirtiest corner and so the honest one to bake.
  const byGeo = new Map<THREE.BufferGeometry, DirtTarget>();
  root.updateMatrixWorld(true);
  const origin = new THREE.Vector3();
  root.getWorldPosition(origin);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj.userData[NO_DIRT]) return;
    const geo = obj.geometry as THREE.BufferGeometry;
    const color = geo.getAttribute("color");
    if (!color) return;
    const base = new THREE.Vector3();
    obj.getWorldPosition(base);
    byGeo.set(geo, {
      geo,
      orig: byGeo.get(geo)?.orig ?? new Float32Array(color.array as Float32Array),
      stride: color.itemSize,
      base: base.sub(origin),
    });
  });
  const targets: DirtTarget[] = [...byGeo.values()];

  const tone = new THREE.Color();
  return ({ dust, mud }: DirtCoat): void => {
    const level = Math.max(dust, mud);
    // The wetter the run, the further down the palette a fleck lands.
    const wet = clamp(mud * 1.15, 0, 1);
    for (const t of targets) {
      const color = t.geo.getAttribute("color") as THREE.BufferAttribute;
      const arr = color.array as Float32Array;
      const p = t.geo.getAttribute("position") as THREE.BufferAttribute;
      // Per FACE: the geometry is de-indexed, so every three vertices are
      // one flat triangle and share a centroid, a normal and a fleck.
      for (let f = 0; f < p.count; f += 3) {
        const cx = t.base.x + (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
        const cy = t.base.y + (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
        const cz = t.base.z + (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;

        // How much this face faces UP — the dry dust that settles rather
        // than being thrown lands on horizontal panels.
        const ax = p.getX(f + 1) - p.getX(f);
        const ay = p.getY(f + 1) - p.getY(f);
        const az = p.getZ(f + 1) - p.getZ(f);
        const bx = p.getX(f + 2) - p.getX(f);
        const by = p.getY(f + 2) - p.getY(f);
        const bz = p.getZ(f + 2) - p.getZ(f);
        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        const up = clamp(ny / len, 0, 1);

        // Close to a wheel is the single biggest term: that is where the
        // dirt is coming from.
        let near = 0;
        for (const s of spray) {
          const d = Math.hypot(cx - s.x, cy - s.y, cz - s.z);
          near = Math.max(near, clamp(1 - d / SPRAY_REACH, 0, 1));
        }
        // Then how close to the ground, and how far back along the car —
        // whatever a tire picks up is thrown backwards.
        const ground = clamp(1.4 - 1.05 * cy, 0, 1);
        const aft = clamp(0.78 - cz * 0.14, 0.6, 1.08);

        // A small baseline so nothing on the car stays showroom-clean at
        // the end of a filthy stage, then the terms that actually decide
        // where the filth is: how low, how near a wheel, how horizontal.
        const exposure =
          (0.2 + ground * ground * 1.1 + near * near * 2.4 + up * 0.55 * (0.35 + 0.65 * ground)) *
          aft;

        // Patches of grime, and the per-face draw that decides whether
        // THIS face is one of the specks inside a patch.
        const patch = 0.45 + 0.9 * noise3(cx / 0.38, cy / 0.38, cz / 0.38);
        const draw = hash(Math.round(cx * 41), Math.round(cy * 41), Math.round(cz * 41));

        const hit = level * exposure * patch * (0.3 + 1.35 * draw) - FLECK_FLOOR;
        if (hit <= 0) continue;
        const amount = Math.min(FLECK_MAX, hit);

        // Which shade of brown this fleck is. Wet runs bias dark, and a
        // fleck low on the car is wetter than one on the shoulder.
        const shade = clamp(
          wet * 0.55 + ground * 0.3 + draw * 0.45 + noise3(cx * 7, cy * 7, cz * 7) * 0.3 - 0.25,
          0,
          0.999,
        );
        tone.copy(TONES[Math.floor(shade * TONES.length)]);

        for (let v = 0; v < 3; v++) {
          const i = (f + v) * t.stride;
          arr[i] = t.orig[i] + (tone.r - t.orig[i]) * amount;
          arr[i + 1] = t.orig[i + 1] + (tone.g - t.orig[i + 1]) * amount;
          arr[i + 2] = t.orig[i + 2] + (tone.b - t.orig[i + 2]) * amount;
        }
      }
      color.needsUpdate = true;
    }
  };
}

/** How far the car covered over the ground this step, m — the measure both
 * the paint and the glass soil by, and the whole of what stops a stationary
 * car getting dirty. Sideways counts: a car crossing a ford broadside is
 * still travelling through it. Airborne is no distance on any surface —
 * nothing is under the wheels to be thrown — and a wheel spinning under a
 * car held on the brakes moves the car nowhere, so it dirties nothing. */
export function groundTravel(car: CarState, dt: number): number {
  return car.airborne ? 0 : Math.hypot(car.u, car.w) * dt;
}

/** What the ground under the car is throwing at it, as coat per METRE
 * driven. Water and the verge are WET — they throw mud; gravel and a slide
 * on it only raise dust, and sealed road throws nothing at all: a car that
 * spends a stage on asphalt finishes it in the paint it started in.
 *
 * Exported because these four cases ARE the rule the module exists to
 * state, and a pure function of the state is the only half of the coat a
 * test can read without a GPU. */
export function dirtRate(state: GameState): DirtCoat {
  if (state.offRoad) return { dust: 0.004, mud: 0.0055 };
  const surface = state.track.samples[state.nearIndex]?.surface;
  if (surface === "water") return { dust: 0.01, mud: 0.055 };
  if (surface !== "gravel") return { dust: 0, mud: 0 };
  // A slide drags the tires sideways across the loose stuff, so the same
  // metre of gravel throws several times as much.
  return { dust: state.car.slide > 0.15 ? 0.0036 : 0.0006, mud: 0 };
}

/** What a slide is worth to the glass, against a gripped metre of the same
 * gravel. Well under what it is worth to the PAINT (six times, above): the
 * paint takes what the tire throws sideways at it, and the screens take what
 * is left hanging in the air a car length later, which is a far smaller
 * multiple of the same event. */
const SLIDE_SPRAY = 1.8;

/** What the ground under the wheels is throwing UP AT THE GLASS, as a
 * multiplier on the per-metre rates the screens carry (`SOIL` in
 * car/wipers.ts). A separate question from `dirtRate`, and the reason it is
 * a second function rather than a reading of the first: what films a screen
 * is a raised CLOUD, and only a loose dry surface makes one.
 *
 * Sealed road throws nothing — there is nothing on it to raise — and
 * NEITHER DOES THE VERGE, which is the one that is not obvious. Turf holds
 * its soil down: what a wheel takes off grass it flings low and wet at the
 * sills and the arches, which is exactly where `dirtRate` puts it and
 * nowhere near the windows. So a car that spends a stage between the tarmac
 * and the grass finishes it looking out of the glass it started with, however
 * filthy the rest of it has got.
 *
 * GRAVEL IS THE CALIBRATION POINT AT 1: the screens' rates are authored
 * against a loose road being driven, and everything else here is a multiple
 * of that. Which is also why the reading cannot be taken off HOW FILTHY THE
 * CAR IS — a dirty car is dirty everywhere it goes, including the sealed
 * miles where nothing at all is arriving at it. A ford is the same cloud
 * with water in it. */
export function glassSpray(state: GameState): number {
  if (state.offRoad) return 0;
  const surface = state.track.samples[state.nearIndex]?.surface;
  if (surface === "water") return 1;
  if (surface !== "gravel") return 0;
  return state.car.slide > 0.15 ? SLIDE_SPRAY : 1;
}

export function createCarDirt(root: THREE.Group, spray: readonly SprayPoint[] = []): CarDirt {
  const paint = createDirtPainter(root, spray);
  let dust = 0;
  let mud = 0;
  let applied = -1;

  const update = (state: GameState, dt: number): void => {
    if (state.phase !== "racing") return;
    const travel = groundTravel(state.car, dt);
    if (travel <= 0) return;
    const rate = dirtRate(state);
    if (rate.dust === 0 && rate.mud === 0) return;
    dust = Math.min(1, dust + rate.dust * travel);
    mud = Math.min(1, mud + rate.mud * travel);
    // Re-baking colors is a whole-buffer write — only do it per visible
    // step of grime, not per frame.
    const quantized = Math.round(dust * 18) * 32 + Math.round(mud * 18);
    if (quantized !== applied) {
      applied = quantized;
      paint({ dust, mud });
    }
  };

  // Both coats sit on the glass as well as the paint, and the thicker of
  // the two is what a lens is looking through — the same reading the
  // painter takes of how filthy the car is.
  return { update, level: () => Math.max(dust, mud) };
}

/** The wheel centers of a built car, in car space — what the painter wants
 * for `spray`. Kept here so every caller derives them the same way. */
export function wheelSpray(spec: {
  wheelbase: number;
  axleShift?: number;
  trackHalf: number;
  wheelRadius: number;
}): SprayPoint[] {
  const shift = spec.axleShift ?? 0;
  const points: SprayPoint[] = [];
  for (const z of [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift]) {
    for (const side of [-1, 1]) {
      points.push({ x: side * spec.trackHalf, y: spec.wheelRadius, z });
    }
  }
  return points;
}
