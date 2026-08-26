// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The streams that feed the fords. Every water crossing on the road is the
// point where a real watercourse crosses it: the stream comes down off the
// higher ground on one side, runs FLAT under the road at the ford's level,
// and falls away toward the lower ground on the other side. This module
// owns that shared geometry — the terrain carves its bed with `carveGround`
// and the world draws its surface with `buildStreamMeshes` from the same
// polylines, so the water always lies in the valley cut for it.

import * as THREE from "three";
import { createRng, type Track } from "@engine";

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

function smooth(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

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

/** The water surfaces: one ribbon per stream, tapering toward both ends,
 * lifted a hair above the carved bed. Shares the ford sheets' material
 * look (Phong — the sun glitters on it). */
export function buildStreamMeshes(streams: Stream[], texture: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  for (const s of streams) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const n = s.points.length;
    for (let i = 0; i < n; i++) {
      const p = s.points[i];
      const q = s.points[Math.min(n - 1, i + 1)];
      const o = s.points[Math.max(0, i - 1)];
      let dx = q.x - o.x;
      let dz = q.z - o.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // Taper: full width at the road, narrowing to a trickle at the ends.
      const end = Math.min(i, n - 1 - i) / (n / 3);
      const w = s.halfWidth * (0.45 + 0.55 * Math.min(1, end));
      positions.push(
        p.x - dz * w,
        p.y + 0.07,
        p.z + dx * w,
        p.x + dz * w,
        p.y + 0.07,
        p.z - dx * w,
      );
      uvs.push(0, i * 1.4, 1, i * 1.4);
      if (i > 0) {
        const a = (i - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhongMaterial({
      map: texture,
      specular: 0xcfe4ff,
      shininess: 120,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(geo, mat));
  }
  return group;
}
