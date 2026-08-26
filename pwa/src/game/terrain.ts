// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The landscape the road runs through — as important as the road itself.
// A seeded heightfield hugs the corridor: a flat verge shelf at road grade,
// then per-side embankment profiles that rise into hillsides (the Sega
// Rally cut-into-the-hill look) or fall away toward valleys, blending into
// a rolling far field with lakes wherever the ground dips under the water
// table, and stream valleys carved through wherever a ford crosses the
// road. The ground is built as TILES on a fixed world grid, so a finite
// stage materializes its whole corridor up front while an endless one
// streams tiles in around the car and drops them again behind it — the same
// landscape either way, painted from the biome's palette. Everything is
// deterministic in the track seed; the physics never reads any of it — the
// engine's road samples stay the only truth the car touches.

import * as THREE from "three";
import { createRng, type Track } from "@engine";

import { hash2, smooth, valueNoise } from "../lib/noise.ts";
import type { Biome } from "./biome.ts";
import { carveGround, computeStreams, type Stream } from "./streams.ts";
import { detailTexture } from "./textures.ts";

/** Tile edge length, m — 16 cells of 14 m. */
const TILE = 224;
const CELLS = 16;
const CELL = TILE / CELLS;
/** Tiles exist within this range of the road, m — past the fog ceiling
 * (520 m), so the world never visibly ends. */
const FAR = 640;
/** The water table: ground below this floods into lakes, m. */
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
  /** The stream valleys cut so far (world.ts draws their water). */
  streams: Stream[];
  /** Catch the ground up with the track: index new samples, cut new stream
   * valleys, build the tiles the road now needs, and (endless only) drop
   * the ones the car has left behind. */
  sync: (track: Track, carS: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export function buildTerrain(track: Track, biome: Biome, waterTexture: THREE.Texture): Terrain {
  const seed = (track.seed ^ 0x1b873593) >>> 0;
  const rng = createRng(seed);
  const noiseSeed = rng.int(1, 1 << 30);
  const sideSeed = rng.int(1, 1 << 30);

  // ── Corridor queries: a spatial hash over the road samples ─────────────
  // Rebuilt from the live window as an endless run moves on, so a fresh
  // tile never snaps to road the world has already forgotten.
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

  // ── Tiles ───────────────────────────────────────────────────────────────
  const group = new THREE.Group();
  // The detail map multiplies the vertex colors — fine grain between the
  // 14 m vertices, where per-vertex speckle can't reach. UVs are world
  // meters / 16, so the grain runs continuous across tile seams.
  const groundTex = detailTexture();
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex });
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x2f86e0,
    map: waterTexture,
    specular: 0xcfe4ff,
    shininess: 130,
    transparent: true,
    opacity: 0.92,
  });

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

  type Tile = { ground: THREE.Mesh; lake: THREE.Mesh | null };
  const tiles = new Map<string, Tile>();

  const buildTile = (tx: number, tz: number): Tile => {
    const originX = tx * TILE;
    const originZ = tz * TILE;
    // Heights on a (CELLS+3)² lattice — one ring beyond the tile — so the
    // normals at tile edges are finite differences of the SAME function on
    // both sides of the seam, and the lighting never shows the grid.
    const n = CELLS + 3;
    const H = new Float32Array(n * n);
    const carved = new Uint8Array(n * n);
    let minH = Infinity;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = originX + (i - 1) * CELL;
        const z = originZ + (j - 1) * CELL;
        const raw = rawHeight(x, z);
        const y = carveGround(streams, x, z, raw);
        H[j * n + i] = y;
        if (raw - y > 0.25) carved[j * n + i] = 1;
        if (y < minH) minH = y;
      }
    }

    const verts = CELLS + 1;
    const positions = new Float32Array(verts * verts * 3);
    const normals = new Float32Array(verts * verts * 3);
    const uvs = new Float32Array(verts * verts * 2);
    const colors = new Float32Array(verts * verts * 3);
    const indices: number[] = [];
    for (let j = 0; j < verts; j++) {
      for (let i = 0; i < verts; i++) {
        const v = j * verts + i;
        const hi = (j + 1) * n + (i + 1);
        const x = originX + i * CELL;
        const z = originZ + j * CELL;
        const y = H[hi];
        positions[v * 3] = x;
        positions[v * 3 + 1] = y;
        positions[v * 3 + 2] = z;
        uvs[v * 2] = x / 16;
        uvs[v * 2 + 1] = z / 16;
        // Normal from the height lattice (central difference). Normals
        // before colors: the paint below reads slope off them.
        const dx = (H[hi - 1] - H[hi + 1]) / (2 * CELL);
        const dz = (H[hi - n] - H[hi + n]) / (2 * CELL);
        const inv = 1 / Math.hypot(dx, 1, dz);
        normals[v * 3] = dx * inv;
        normals[v * 3 + 1] = inv;
        normals[v * 3 + 2] = dz * inv;
        // Color by altitude band with a per-vertex speckle — the same
        // chunky grain the road textures carry, on top of the detail map.
        const speck = 0.88 + hash2(Math.round(x * 2), Math.round(z * 2), noiseSeed + 29) * 0.24;
        if (y < LAKE_Y + 0.6) c.copy(bed);
        else if (y < LAKE_Y + 3) c.copy(shore);
        else if (carved[hi]) c.copy(shore).lerp(bed, 0.35);
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
        const steep = clamp01((0.88 - normals[v * 3 + 1]) / 0.18);
        if (steep > 0) {
          const band = valueNoise(x, z, 18, noiseSeed + 47);
          c.lerp(band > 0.5 ? rock : rockDark, steep);
        }
        c.multiplyScalar(speck);
        colors[v * 3] = c.r;
        colors[v * 3 + 1] = c.g;
        colors[v * 3 + 2] = c.b;
        if (i < CELLS && j < CELLS) {
          indices.push(v, v + verts, v + 1, v + 1, v + verts, v + verts + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    const ground = new THREE.Mesh(geo, groundMat);
    group.add(ground);

    // Anywhere the tile dips under the water table, a lake pane floods it.
    // UVs are world-anchored so the sheet reads as one continuous water.
    let lake: THREE.Mesh | null = null;
    if (minH < LAKE_Y + 0.5) {
      const lakeGeo = new THREE.PlaneGeometry(TILE, TILE, 1, 1);
      lakeGeo.rotateX(-Math.PI / 2);
      const uv = lakeGeo.getAttribute("uv");
      const pos = lakeGeo.getAttribute("position");
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(
          i,
          (originX + TILE / 2 + pos.getX(i)) / 40,
          (originZ + TILE / 2 + pos.getZ(i)) / 40,
        );
      }
      lake = new THREE.Mesh(lakeGeo, waterMat);
      lake.position.set(originX + TILE / 2, LAKE_Y, originZ + TILE / 2);
      group.add(lake);
    }
    return { ground, lake };
  };

  const dropTile = (key: string): void => {
    const tile = tiles.get(key);
    if (!tile) return;
    tiles.delete(key);
    group.remove(tile.ground);
    tile.ground.geometry.dispose();
    if (tile.lake) {
      group.remove(tile.lake);
      tile.lake.geometry.dispose();
    }
  };

  /** Tiles the window of road [fromS, end) needs on screen right now. */
  const neededTiles = (fromS: number): Set<string> => {
    const needed = new Set<string>();
    const reach = Math.ceil(FAR / TILE);
    for (let i = 0; i < samples.length; i += 4) {
      const s = samples[i];
      if (s.s < fromS) continue;
      const cx = Math.floor(s.x / TILE);
      const cz = Math.floor(s.z / TILE);
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dz = -reach; dz <= reach; dz++) {
          const centerX = (cx + dx + 0.5) * TILE;
          const centerZ = (cz + dz + 0.5) * TILE;
          if (Math.hypot(centerX - s.x, centerZ - s.z) < FAR + TILE * 0.75) {
            needed.add(`${cx + dx},${cz + dz}`);
          }
        }
      }
    }
    return needed;
  };

  let lastSyncedS = -Infinity;
  let streamScan = 0;

  const sync = (t: Track, carS: number): void => {
    const grew = samples.length > indexed;
    if (grew) {
      indexSamples(indexed, samples.length);
      indexed = samples.length;
      streams.push(...computeStreams(t, streamScan, farField));
      streamScan = samples.length;
    }
    if (!t.endless) {
      // A finite stage is built once, in full.
      if (tiles.size === 0) {
        for (const key of neededTiles(0)) tiles.set(key, buildTile(...parseKey(key)));
      }
      return;
    }
    if (!grew && carS - lastSyncedS < 250) return;
    lastSyncedS = carS;
    // Forget road the run has left behind: the sample grid re-anchors to
    // the live window so new tiles never shape themselves around it, and
    // spent stream descriptors stop taxing the carve.
    const floorS = carS - 700;
    if (samples[firstIndexed]?.s < floorS - 400) {
      while (firstIndexed < samples.length - 1 && samples[firstIndexed].s < floorS) firstIndexed++;
      grid = new Map();
      indexSamples(firstIndexed, samples.length);
      while (streams.length > 0 && streams[0].centerS < floorS) streams.shift();
    }
    const needed = neededTiles(Math.max(0, carS - 450));
    for (const key of needed) {
      if (!tiles.has(key)) tiles.set(key, buildTile(...parseKey(key)));
    }
    for (const key of [...tiles.keys()]) {
      if (!needed.has(key)) dropTile(key);
    }
  };

  const update = (dt: number): void => {
    waterTexture.offset.x += dt * 0.008;
    waterTexture.offset.y += dt * 0.005;
  };

  const dispose = (): void => {
    for (const key of [...tiles.keys()]) dropTile(key);
    groundTex.dispose();
    groundMat.dispose();
    waterMat.dispose();
  };

  return { group, heightAt, streams, sync, update, dispose };
}

function parseKey(key: string): [number, number] {
  const [tx, tz] = key.split(",").map(Number);
  return [tx, tz];
}
