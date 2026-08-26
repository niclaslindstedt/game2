// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The landscape the road runs through — as important as the road itself.
// A seeded heightfield hugs the corridor: a flat verge shelf at road grade,
// then per-side embankment profiles that rise into hillsides (the Sega
// Rally cut-into-the-hill look) or fall away toward valleys, blending into
// a rolling far field with lakes wherever the ground dips under the water
// table. Everything is deterministic in the track seed; the physics never
// reads any of it — the engine's road samples stay the only truth the car
// touches.

import * as THREE from "three";
import { createRng, type Track } from "@engine";

/** How far the landscape extends past the track bounds, m. */
const MARGIN = 700;
/** Target ground-mesh cell size, m (capped so huge stages stay light). */
const CELL = 14;
const MAX_SEGMENTS = 190;
/** The water table: far-field ground below this floods into lakes, m. */
export const LAKE_Y = -11;

/** Deterministic lattice hash in [0, 1). */
function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise over a lattice of `hash2` values, period `scale` m. */
function valueNoise(x: number, z: number, scale: number, seed: number): number {
  const gx = x / scale;
  const gz = z / scale;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = smooth(gx - ix);
  const fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export type Terrain = {
  group: THREE.Group;
  /** Landscape height at a world position (what scenery stands on). */
  heightAt: (x: number, z: number) => number;
  update: (dt: number) => void;
  dispose: () => void;
};

export function buildTerrain(track: Track, waterTexture: THREE.Texture): Terrain {
  const seed = (track.seed ^ 0x1b873593) >>> 0;
  const rng = createRng(seed);
  const noiseSeed = rng.int(1, 1 << 30);
  const sideSeed = rng.int(1, 1 << 30);

  // Spatial hash over the road samples for nearest-sample queries.
  const samples = track.samples;
  const GRID = 48;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < samples.length; i++) {
    const key = `${Math.floor(samples[i].x / GRID)},${Math.floor(samples[i].z / GRID)}`;
    let cell = grid.get(key);
    if (!cell) grid.set(key, (cell = []));
    cell.push(i);
  }

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
    return { d: Math.sqrt(bestD2), index: best, lateral };
  };

  // The rolling far field, m: broad rises, medium hills, close texture.
  const farField = (x: number, z: number): number =>
    (valueNoise(x, z, 430, noiseSeed) - 0.5) * 52 +
    (valueNoise(x, z, 150, noiseSeed + 7) - 0.5) * 16 +
    (valueNoise(x, z, 46, noiseSeed + 13) - 0.5) * 4;

  // Per-side embankment grade along the stage, m per m of distance from the
  // shoulder: positive climbs into a hillside wall, negative drops toward a
  // valley (or the sea the lakes make). Varies slowly with arc position.
  const sideGrade = (s: number, side: number): number => {
    const raw = valueNoise(s, side * 97.3, 210, sideSeed);
    return -0.34 + raw * 1.1;
  };

  const half = track.width / 2;
  const shelfEnd = half + 7; // flat-ish shoulder past the rumble strips

  const heightAt = (x: number, z: number): number => {
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

  // ── The ground mesh ──────────────────────────────────────────────────────
  const minX = track.bounds.minX - MARGIN;
  const maxX = track.bounds.maxX + MARGIN;
  const minZ = track.bounds.minZ - MARGIN;
  const maxZ = track.bounds.maxZ + MARGIN;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const segX = Math.min(MAX_SEGMENTS, Math.max(40, Math.round(spanX / CELL)));
  const segZ = Math.min(MAX_SEGMENTS, Math.max(40, Math.round(spanZ / CELL)));

  const geo = new THREE.PlaneGeometry(spanX, spanZ, segX, segZ);
  geo.rotateX(-Math.PI / 2); // lie flat, +y up
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);

  const grass = new THREE.Color(0x74b23c);
  const grassDark = new THREE.Color(0x578f2b);
  const rock = new THREE.Color(0x8d8f94);
  const shore = new THREE.Color(0xc2a878);
  const bed = new THREE.Color(0x3f6c8e);
  const c = new THREE.Color();

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + centerX;
    const z = pos.getZ(i) + centerZ;
    const y = heightAt(x, z);
    pos.setXYZ(i, x - centerX, y, z - centerZ);

    // Color by altitude band with a per-vertex speckle — the same chunky
    // grain the road textures carry, without a tiling texture.
    const speck = 0.88 + hash2(Math.round(x * 2), Math.round(z * 2), noiseSeed + 29) * 0.24;
    if (y < LAKE_Y + 0.6) c.copy(bed);
    else if (y < LAKE_Y + 3) c.copy(shore);
    else {
      const blend = valueNoise(x, z, 27, noiseSeed + 31);
      c.copy(grass).lerp(grassDark, blend);
      const rockiness = clamp01((y - 26) / 26);
      c.lerp(rock, rockiness);
    }
    c.multiplyScalar(speck);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.position.set(centerX, 0, centerZ);

  // ── The water table: lakes (and seas) wherever the land dips under it.
  // Phong so the sun drags a glittering highlight across it; the speckle
  // map scrolls slowly to keep the surface alive.
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x2f86e0,
    map: waterTexture,
    specular: 0xcfe4ff,
    shininess: 130,
    transparent: true,
    opacity: 0.92,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(spanX, spanZ, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(centerX, LAKE_Y, centerZ);
  waterTexture.repeat.set(spanX / 40, spanZ / 40);

  const group = new THREE.Group();
  group.add(ground, water);

  const update = (dt: number): void => {
    waterTexture.offset.x += dt * 0.008;
    waterTexture.offset.y += dt * 0.005;
  };

  const dispose = (): void => {
    geo.dispose();
    groundMat.dispose();
    water.geometry.dispose();
    waterMat.dispose();
  };

  return { group, heightAt, update, dispose };
}
