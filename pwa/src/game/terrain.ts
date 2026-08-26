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

import { hash2, smooth, valueNoise } from "../lib/noise.ts";
import type { Biome } from "./biome.ts";
import { detailTexture } from "./textures.ts";

/** How far the landscape extends past the track bounds, m. */
const MARGIN = 700;
/** Target ground-mesh cell size, m (capped so huge stages stay light). */
const CELL = 14;
const MAX_SEGMENTS = 190;
/** The water table: far-field ground below this floods into lakes, m. */
export const LAKE_Y = -11;
/** Plain dirt road extrapolated straight past each stage end, m — the
 * rally start's run-up before the gate, and run-off past the flying
 * finish. world.ts draws the ribbon; the terrain keeps its shelf flat
 * under the same corridor so the apron never floats or drowns. */
export const APRON = 30;

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

export function buildTerrain(track: Track, biome: Biome, waterTexture: THREE.Texture): Terrain {
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
    let d = Math.sqrt(bestD2);
    // Past either stage end, distance to the end sample would swing the
    // shelf away under the road apron — measure from the apron's spine
    // instead while within its reach.
    if (best === 0 || best === samples.length - 1) {
      const lon = (x - s.x) * Math.sin(s.heading) + (z - s.z) * Math.cos(s.heading);
      const out = best === 0 ? -lon : lon;
      if (out > 0) d = Math.hypot(lateral, Math.max(0, out - APRON));
    }
    return { d, index: best, lateral };
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

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + centerX;
    const z = pos.getZ(i) + centerZ;
    pos.setXYZ(i, x - centerX, heightAt(x, z), z - centerZ);
  }
  // Normals before colors: the color pass reads slope off them, so steep
  // embankments and road cuts paint themselves as bare bedrock.
  geo.computeVertexNormals();
  const nor = geo.getAttribute("normal");

  const grass = new THREE.Color(biome.ground.grass);
  const grassDark = new THREE.Color(biome.ground.grassDark);
  const moss = new THREE.Color(biome.ground.moss);
  const heath = new THREE.Color(biome.ground.heath);
  const floor = new THREE.Color(biome.ground.forestFloor);
  const rock = new THREE.Color(biome.ground.bedrock);
  const rockDark = new THREE.Color(biome.ground.bedrockDark);
  const shore = new THREE.Color(biome.ground.shore);
  const bed = new THREE.Color(biome.ground.lakeBed);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + centerX;
    const z = pos.getZ(i) + centerZ;
    const y = pos.getY(i);

    // Color by altitude band with a per-vertex speckle — the same chunky
    // grain the road textures carry, on top of the tiling detail map.
    const speck = 0.88 + hash2(Math.round(x * 2), Math.round(z * 2), noiseSeed + 29) * 0.24;
    if (y < LAKE_Y + 0.6) c.copy(bed);
    else if (y < LAKE_Y + 3) c.copy(shore);
    else {
      // The meadow base, broken by big soft patches of moss, heath and
      // bare forest floor so no two hillsides read the same.
      const blend = valueNoise(x, z, 27, noiseSeed + 31);
      c.copy(grass).lerp(grassDark, blend);
      const m = valueNoise(x, z, 90, noiseSeed + 37);
      if (m > 0.6) c.lerp(moss, clamp01((m - 0.6) / 0.4) * 0.85);
      const h = valueNoise(x, z, 130, noiseSeed + 41);
      if (h > 0.64) c.lerp(heath, clamp01((h - 0.64) / 0.36) * 0.8);
      const f = valueNoise(x, z, 55, noiseSeed + 43);
      if (f > 0.68) c.lerp(floor, clamp01((f - 0.68) / 0.32) * 0.6);
      c.lerp(rock, clamp01((y - 26) / 26));
    }
    // Bedrock breaks through wherever the ground is steep — mountain
    // flanks, and the cut walls where the road runs between high rock.
    const ny = nor.getY(i);
    const steep = clamp01((0.88 - ny) / 0.18);
    if (steep > 0) {
      const band = valueNoise(x, z, 18, noiseSeed + 47);
      c.lerp(band > 0.5 ? rock : rockDark, steep);
    }
    c.multiplyScalar(speck);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  // The detail map multiplies the vertex colors — fine grain between the
  // 14 m vertices, where per-vertex speckle can't reach.
  const groundTex = detailTexture();
  groundTex.repeat.set(spanX / 16, spanZ / 16);
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex });
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
    groundTex.dispose();
    groundMat.dispose();
    water.geometry.dispose();
    waterMat.dispose();
  };

  return { group, heightAt, update, dispose };
}
