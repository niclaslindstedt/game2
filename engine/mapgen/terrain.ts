// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The landscape the road runs through — and, since the world opened up,
// the ground the car actually rides the moment it leaves the road. One
// seeded heightfield serves both the physics and the renderer: a flat
// verge shelf at road grade, per-side embankments rising into hillsides or
// falling toward valleys, a rolling far field with ridged mountain chains
// and broad sea basins sunk under the water table, and stream valleys
// carved through wherever a ford crosses the road. The same field also
// seeds the wild's solid props — boulders and fallen trunks scattered off
// the corridor — so the renderer draws exactly what the physics can crash
// into. Everything is deterministic in the track seed; heights are smooth
// analytic noise, so the ground under the car never stairsteps.

import { createRng } from "../lib/prng.ts";
import { hash2, smooth, valueNoise } from "../lib/noise.ts";
import type { Track } from "./compile.ts";

/** The water table: ground below this floods into lakes and seas, m. */
export const LAKE_Y = -11;
/** Edge length of the ground lattice the physics rides and the renderer
 * triangulates its ground tiles on, m. The two must agree — see groundAt. */
export const GROUND_CELL = 14;
/** Plain dirt road extrapolated straight past each stage end, m — the
 * rally start's run-up before the gate, and run-off past the flying
 * finish. The terrain keeps its shelf flat under the same corridor so the
 * apron never floats or drowns. */
export const APRON = 30;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// ── Streams ───────────────────────────────────────────────────────────────

export type Stream = {
  /** Water surface centerline, world space, source first. */
  points: { x: number; z: number; y: number }[];
  /** Water surface half-width, meters. */
  halfWidth: number;
  /** Arc position of the ford it crosses (chunk association / pruning). */
  centerS: number;
  /** Loose bounding box (bed + banks), for cheap carve rejection. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/** How far the stream runs out from the road on each side, meters. */
const REACH = 130;
/** Polyline spacing along the stream, meters. */
const STEP = 12;
/** How far below the water surface the bed is carved, meters. */
const BED_DEPTH = 0.45;
/** Bank blend distance from the water's edge back to the landscape, m. */
const BANK = 9;
/** Water grade away from the ford: up toward the source, down the outflow. */
const SOURCE_RISE = 0.035;
const OUTFLOW_FALL = 0.03;

/** Build stream descriptors for every complete water run in
 * `samples[fromIndex..)`. `farHeight` samples the landscape's far field so
 * the stream can tell its uphill side from its downhill side — water comes
 * FROM the high ground, never out of nowhere. Deterministic in the track
 * seed and the ford's position. */
export function computeStreams(
  track: Track,
  fromIndex: number,
  farHeight: (x: number, z: number) => number,
): Stream[] {
  const samples = track.samples;
  const streams: Stream[] = [];
  let i = Math.max(0, fromIndex);
  // Never split a run: back up to its start if we landed inside one.
  while (i > 0 && samples[i - 1].surface === "water") i--;
  for (; i < samples.length; i++) {
    if (samples[i].surface !== "water") continue;
    let j = i;
    while (j < samples.length && samples[j].surface === "water") j++;
    const mid = samples[Math.floor((i + j - 1) / 2)];
    const runLength = samples[j - 1].s - samples[i].s + track.step;
    const rng = createRng((track.seed ^ (Math.round(mid.s) * 2654435761)) >>> 0);

    // The road's right axis is the stream's line of travel.
    const rx = Math.cos(mid.heading);
    const rz = -Math.sin(mid.heading);
    // Uphill side = the side whose far field stands higher.
    const highRight =
      farHeight(mid.x + rx * REACH * 0.7, mid.z + rz * REACH * 0.7) >=
      farHeight(mid.x - rx * REACH * 0.7, mid.z - rz * REACH * 0.7);
    const sourceSign = highRight ? 1 : -1;

    const meander = rng.range(6, 14);
    const phase = rng.range(0, Math.PI * 2);
    const wave = rng.range(0.35, 0.6);
    const points: Stream["points"] = [];
    const n = Math.round(REACH / STEP);
    // Walk source → outflow so `points` always descends.
    for (let k = n; k >= -n; k--) {
      const dist = k * STEP; // positive toward the source
      const abs = Math.abs(dist);
      // The meander sways along the ROAD direction and dies out at the
      // crossing, so under the road the stream runs straight at the ford.
      const sway = meander * Math.sin(k * wave + phase) * smooth((abs - 14) / 40);
      const fx = mid.x + rx * dist * sourceSign + Math.sin(mid.heading) * sway;
      const fz = mid.z + rz * dist * sourceSign + Math.cos(mid.heading) * sway;
      let y = mid.elevation + (dist > 0 ? dist * SOURCE_RISE : dist * OUTFLOW_FALL);
      // The far ends duck under the landscape, so the water is born from
      // the ground and sinks back into it instead of stopping mid-air.
      if (abs > REACH - STEP * 1.5) y -= 2.2;
      points.push({ x: fx, z: fz, y });
    }

    const halfWidth = Math.min(8, Math.max(3.5, runLength / 2.6));
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const pad = halfWidth + BANK;
    streams.push({
      points,
      halfWidth,
      centerS: mid.s,
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
    });
    i = j;
  }
  return streams;
}

/** Distance from a point to the stream's centerline, plus the water height
 * at the closest spot. */
function nearestOnStream(s: Stream, x: number, z: number): { d: number; waterY: number } {
  let bestD2 = Infinity;
  let waterY = 0;
  for (let i = 0; i < s.points.length - 1; i++) {
    const a = s.points[i];
    const b = s.points[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)),
    );
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < bestD2) {
      bestD2 = d2;
      waterY = a.y + (b.y - a.y) * t;
    }
  }
  return { d: Math.sqrt(bestD2), waterY };
}

/** Carve the stream valley into a landscape height: inside the water line
 * the ground drops to the bed; across the bank it blends back to `base`.
 * Only ever lowers — a stream never builds a levee. */
export function carveGround(streams: Stream[], x: number, z: number, base: number): number {
  let ground = base;
  for (const s of streams) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const { d, waterY } = nearestOnStream(s, x, z);
    if (d > s.halfWidth + BANK) continue;
    const bed = waterY - BED_DEPTH;
    const target = bed + smooth((d - s.halfWidth) / BANK) * Math.max(0, base - bed);
    if (target < ground) ground = target;
  }
  return ground;
}

/** True when a point stands in a stream's bed or on its banks — nothing
 * should grow there. */
export function inStream(streams: Stream[], x: number, z: number, margin: number): boolean {
  for (const s of streams) {
    if (x < s.minX - margin || x > s.maxX + margin || z < s.minZ - margin || z > s.maxZ + margin) {
      continue;
    }
    if (nearestOnStream(s, x, z).d < s.halfWidth + BANK + margin) return true;
  }
  return false;
}

/** Water surface height of a stream at a point, or null when the point is
 * not over stream water. */
function streamWaterAt(streams: Stream[], x: number, z: number): number | null {
  for (const s of streams) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const { d, waterY } = nearestOnStream(s, x, z);
    if (d < s.halfWidth) return waterY;
  }
  return null;
}

// ── Wild props ────────────────────────────────────────────────────────────

/** A solid thing standing in the wild: the physics collides with it and the
 * renderer draws it — the SAME seeded placement on both sides. */
export type WildObstacle = {
  x: number;
  z: number;
  /** Ground height under it (terrain.heightAt at its foot). */
  y: number;
  kind: "boulder" | "log";
  /** Visual scale factor, ~0.8–1.8. */
  size: number;
  spin: number;
  /** Collision radius in the ground plane, m. */
  radius: number;
  /** Height above its foot — a car flying higher clears it. */
  height: number;
};

/** One obstacle candidate per grid cell of this edge, m. */
const OB_CELL = 56;
/** Fraction of cells that actually hold one. */
const OB_DENSITY = 0.45;
/** Obstacles keep this far from the road centerline beyond the half-width. */
const OB_ROAD_CLEAR = 10;

// ── The field ─────────────────────────────────────────────────────────────

export type TerrainField = {
  /** Final ground height at a world position — corridor shelf, hills,
   * mountains, sea floor, stream beds and all. The analytic field scenery
   * stands on and the renderer samples its ground meshes from. */
  heightAt: (x: number, z: number) => number;
  /** The ground the car RIDES: `heightAt` sampled on the GROUND_CELL
   * lattice and interpolated across the same triangles the renderer draws,
   * so the physics ground IS the drawn ground. The analytic field between
   * lattice points disagrees with the mesh by up to a meter on curved
   * slopes — riding it buries the car in every concave hillside. */
  groundAt: (x: number, z: number) => number;
  /** The landscape far from any road (mountains and sea included) — what
   * streams read to find their downhill side, and tooling can preview. */
  farHeightAt: (x: number, z: number) => number;
  /** Water surface height over this point — lake/sea table or a stream's
   * local level — or null on dry ground. */
  waterAt: (x: number, z: number) => number | null;
  /** Distance to the road centerline, m — Infinity out of corridor range
   * (beyond ~240 m). What placement code asks before planting near road. */
  roadDistanceAt: (x: number, z: number) => number;
  /** The stream valleys cut so far (the renderer draws their water). */
  streams: Stream[];
  /** Solid wild props near a point (within `r` of it), collision-checked
   * by the physics and drawn by the renderer. */
  obstaclesNear: (x: number, z: number, r: number) => WildObstacle[];
  /** Catch the field up with the track: index new samples and cut new
   * stream valleys (endless stages stream road in); prune far behind
   * `carS` so an endless run's memory stays bounded. */
  sync: (carS: number) => void;
};

/** Build the terrain field for a track. Deterministic in the track seed —
 * the engine and the renderer each build one and always agree. */
export function createTerrain(track: Track): TerrainField {
  const seed = (track.seed ^ 0x1b873593) >>> 0;
  const rng = createRng(seed);
  const noiseSeed = rng.int(1, 1 << 30);
  const sideSeed = rng.int(1, 1 << 30);

  // ── Corridor queries: a spatial hash over the road samples ─────────────
  // Rebuilt from the live window as an endless run moves on, so a fresh
  // query never snaps to road the world has already forgotten.
  const samples = track.samples;
  const GRID = 48;
  let grid = new Map<string, number[]>();
  let firstIndexed = 0;
  let indexed = 0;

  const indexSamples = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      const key = `${Math.floor(samples[i].x / GRID)},${Math.floor(samples[i].z / GRID)}`;
      let cell = grid.get(key);
      if (!cell) grid.set(key, (cell = []));
      cell.push(i);
    }
  };

  type Near = { d: number; index: number; lateral: number };
  const nearestSample = (x: number, z: number): Near | null => {
    const cx = Math.floor(x / GRID);
    const cz = Math.floor(z / GRID);
    let best = -1;
    let bestD2 = Infinity;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const cell = grid.get(`${cx + dx},${cz + dz}`);
        if (!cell) continue;
        for (const i of cell) {
          const ddx = x - samples[i].x;
          const ddz = z - samples[i].z;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = i;
          }
        }
      }
    }
    if (best < 0) return null;
    const s = samples[best];
    const lateral = (x - s.x) * Math.cos(s.heading) - (z - s.z) * Math.sin(s.heading);
    let d = Math.sqrt(bestD2);
    // Past either stage end, distance to the end sample would swing the
    // shelf away under the road apron — measure from the apron's spine
    // instead while within its reach.
    if (best === firstIndexed || best === samples.length - 1) {
      const lon = (x - s.x) * Math.sin(s.heading) + (z - s.z) * Math.cos(s.heading);
      const out = best === firstIndexed ? -lon : lon;
      if (out > 0) d = Math.hypot(lateral, Math.max(0, out - APRON));
    }
    return { d, index: best, lateral };
  };

  // The rolling far field, m: broad rises, medium hills, close texture —
  // then the drama the open world is for. Mountain chains: a slow mask
  // picks where they stand, ridged noise gives them spines and saddles.
  // Sea basins: another slow mask sinks whole regions far under the water
  // table, so the rolling coast runs out into open water.
  const farField = (x: number, z: number): number => {
    const rolling =
      (valueNoise(x, z, 430, noiseSeed) - 0.5) * 52 +
      (valueNoise(x, z, 150, noiseSeed + 7) - 0.5) * 16 +
      (valueNoise(x, z, 46, noiseSeed + 13) - 0.5) * 4;
    const mountainMask = smooth(clamp01((valueNoise(x, z, 1150, noiseSeed + 17) - 0.58) / 0.42));
    const ridge = 1 - Math.abs(2 * valueNoise(x, z, 300, noiseSeed + 19) - 1);
    const seaMask = smooth(clamp01((valueNoise(x, z, 1600, noiseSeed + 23) - 0.6) / 0.4));
    // Escarpments: a wandering fault line where the ground steps down a
    // dozen meters over a few — the cliff edges the wild's spontaneous
    // jumps launch off. Recentered so the water table stays put.
    const esc = smooth(clamp01((valueNoise(x, z, 520, noiseSeed + 29) - 0.52) / 0.05));
    return rolling + mountainMask * ridge * ridge * 70 - seaMask * 48 + esc * 13 - 6;
  };

  // Per-side embankment grade along the stage, m per m of distance from the
  // shoulder: positive climbs into a hillside wall, negative drops toward a
  // valley (or the sea the lakes make). Varies slowly with arc position.
  const sideGrade = (s: number, side: number): number => {
    const raw = valueNoise(s, side * 97.3, 210, sideSeed);
    return -0.34 + raw * 1.1;
  };

  const half = track.width / 2;
  const shelfEnd = half + 7; // flat-ish shoulder past the rumble strips

  const streams: Stream[] = [];

  /** The landscape before any stream is cut through it. */
  const rawHeight = (x: number, z: number): number => {
    const far = farField(x, z);
    const near = nearestSample(x, z);
    if (!near || near.d > 240) return far;
    const s = samples[near.index];
    if (near.d < shelfEnd) {
      // Under and beside the road: a shelf pinned just below road grade so
      // the ribbon and its skirts always sit proud of the landscape — the
      // shoulder's texture noise stays below grade too.
      return s.elevation - 0.35 + (near.d > half ? valueNoise(x, z, 9, noiseSeed + 3) * 0.25 : 0);
    }
    const grade = sideGrade(s.s, near.lateral >= 0 ? 1 : -1);
    const embankment = s.elevation + (near.d - shelfEnd) * grade;
    const toFar = smooth(clamp01((near.d - shelfEnd) / 150));
    const shaped = embankment * (1 - toFar) + far * toFar;
    const off = smooth(clamp01((near.d - shelfEnd) / 26));
    return (s.elevation - 0.35) * (1 - off) + shaped * off;
  };

  const heightAt = (x: number, z: number): number => carveGround(streams, x, z, rawHeight(x, z));

  // Lattice corners are hot (every off-road step reads several), so they
  // are cached; the cache clears whenever the field itself changes shape
  // (new streams carved, the endless prune re-anchoring the corridor).
  let cornerCache = new Map<string, number>();
  const cornerHeight = (i: number, j: number): number => {
    const key = `${i},${j}`;
    const hit = cornerCache.get(key);
    if (hit !== undefined) return hit;
    if (cornerCache.size > 8192) cornerCache = new Map();
    const y = heightAt(i * GROUND_CELL, j * GROUND_CELL);
    cornerCache.set(key, y);
    return y;
  };

  // Each lattice cell splits into two triangles along the same diagonal the
  // renderer's tile indexing uses — (i+1,j) to (i,j+1) — so this is the
  // exact drawn surface, not an approximation of it.
  const groundAt = (x: number, z: number): number => {
    const gx = x / GROUND_CELL;
    const gz = z / GROUND_CELL;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    if (fx + fz <= 1) {
      const h00 = cornerHeight(i, j);
      return h00 + fx * (cornerHeight(i + 1, j) - h00) + fz * (cornerHeight(i, j + 1) - h00);
    }
    const h11 = cornerHeight(i + 1, j + 1);
    return (
      h11 + (1 - fx) * (cornerHeight(i, j + 1) - h11) + (1 - fz) * (cornerHeight(i + 1, j) - h11)
    );
  };

  const waterAt = (x: number, z: number): number | null => {
    const ground = heightAt(x, z);
    if (ground < LAKE_Y) return LAKE_Y;
    const stream = streamWaterAt(streams, x, z);
    if (stream !== null && ground < stream - 0.02) return stream;
    return null;
  };

  // ── Wild props: one seeded candidate per cell, validated on demand ─────
  // Validity depends on the corridor (nothing solid on or near the road),
  // so the cache clears whenever new road streams in.
  const obSeed = rng.int(1, 1 << 30);
  let obCache = new Map<string, WildObstacle | null>();

  const obstacleInCell = (cx: number, cz: number): WildObstacle | null => {
    const key = `${cx},${cz}`;
    const hit = obCache.get(key);
    if (hit !== undefined) return hit;
    if (obCache.size > 4096) obCache = new Map();
    let ob: WildObstacle | null = null;
    if (hash2(cx, cz, obSeed) < OB_DENSITY) {
      const x = (cx + 0.12 + hash2(cx, cz, obSeed + 1) * 0.76) * OB_CELL;
      const z = (cz + 0.12 + hash2(cx, cz, obSeed + 2) * 0.76) * OB_CELL;
      const near = nearestSample(x, z);
      const clear = !near || near.d > half + OB_ROAD_CLEAR;
      if (clear && !inStream(streams, x, z, 1)) {
        // Feet on the RIDDEN ground: the car collides against `y`, so a
        // prop planted on the analytic field could hover a step above the
        // surface the car actually drives on.
        const y = groundAt(x, z);
        if (y > LAKE_Y + 1) {
          const boulder = hash2(cx, cz, obSeed + 3) < 0.55;
          const size = 0.8 + hash2(cx, cz, obSeed + 4);
          ob = {
            x,
            z,
            y,
            kind: boulder ? "boulder" : "log",
            size,
            spin: hash2(cx, cz, obSeed + 5) * Math.PI * 2,
            // A trunk lies low enough to jump; a boulder takes real air.
            radius: boulder ? 1.9 * size : 2.6 * size,
            height: boulder ? 2.1 * size : 0.75 * size,
          };
        }
      }
    }
    obCache.set(key, ob);
    return ob;
  };

  const obstaclesNear = (x: number, z: number, r: number): WildObstacle[] => {
    const found: WildObstacle[] = [];
    const lo = OB_CELL;
    for (let cx = Math.floor((x - r - 3) / lo); cx <= Math.floor((x + r + 3) / lo); cx++) {
      for (let cz = Math.floor((z - r - 3) / lo); cz <= Math.floor((z + r + 3) / lo); cz++) {
        const ob = obstacleInCell(cx, cz);
        if (!ob) continue;
        const dx = ob.x - x;
        const dz = ob.z - z;
        if (dx * dx + dz * dz <= (r + ob.radius) * (r + ob.radius)) found.push(ob);
      }
    }
    return found;
  };

  let streamScan = 0;

  const sync = (carS: number): void => {
    if (samples.length > indexed) {
      indexSamples(indexed, samples.length);
      indexed = samples.length;
      streams.push(...computeStreams(track, streamScan, farField));
      streamScan = samples.length;
      // New road may have arrived where a prop stood — revalidate; fresh
      // stream valleys reshape the ground, so the lattice re-samples too.
      obCache = new Map();
      cornerCache = new Map();
    }
    if (!track.endless) return;
    // Forget road the run has left behind: the sample grid re-anchors to
    // the live window so fresh queries never shape themselves around it,
    // and spent stream descriptors stop taxing the carve.
    const floorS = carS - 700;
    if (samples[firstIndexed]?.s < floorS - 400) {
      while (firstIndexed < samples.length - 1 && samples[firstIndexed].s < floorS) firstIndexed++;
      grid = new Map();
      indexSamples(firstIndexed, samples.length);
      while (streams.length > 0 && streams[0].centerS < floorS) streams.shift();
      obCache = new Map();
      cornerCache = new Map();
    }
  };

  sync(0);

  const roadDistanceAt = (x: number, z: number): number => nearestSample(x, z)?.d ?? Infinity;

  return {
    heightAt,
    groundAt,
    farHeightAt: farField,
    waterAt,
    roadDistanceAt,
    streams,
    obstaclesNear,
    sync,
  };
}
