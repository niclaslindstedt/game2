// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The drawn landscape. The landscape's SHAPE — corridor shelf, embankments,
// mountains, sea basins, stream valleys — lives in the engine's terrain
// field, because the car can drive on all of it; this module samples that
// field into ground TILES on a fixed world grid and paints them from the
// biome's palette. Tiles live around the road corridor (so a stage always
// sits in scenery) AND around the car itself, streaming in as an
// exploring run leaves the road and dropping again behind it — the world
// never visibly ends, on the road or a kilometer from it. Anywhere a tile
// dips under the water table, a lake — or the open sea — floods it.

import * as THREE from "three";
import {
  APRON,
  GROUND_CELL,
  LAKE_Y,
  REGIONS,
  createRng,
  createTerrain,
  inStream,
  type Season,
  type TerrainField,
  type Track,
} from "@engine";

import { hash2, valueNoise } from "../lib/noise.ts";
import type { Biome, RegionGround } from "./biome.ts";
import { detailTexture } from "./textures.ts";

export { APRON, LAKE_Y };

/** The tile lattice is the engine's ground lattice: the physics rides
 * exactly the triangles drawn here (TerrainField.groundAt), so the cell
 * size comes from the engine — 16 cells of 14 m per tile. */
const CELL = GROUND_CELL;
const CELLS = 16;
const TILE = CELL * CELLS;
/** Tiles exist within this range of the road, m — past the fog ceiling
 * (520 m), so the world never visibly ends for a driver, and far enough out
 * that someone who abandons the road entirely still finds ground under the
 * wheels. The map view never shows this much: it cuts the world to a
 * tighter island (map-island.ts), because a corridor of square tiles seen
 * from above is a staircase. */
const GROUND_REACH = 640;
const FAR = GROUND_REACH;
/** Tiles kept alive around the CAR when it roams off the corridor, m. */
const CAR_FAR = 560;
/** Freshly needed tiles built per sync at most — an excursion, and a whole
 * stage's corridor, stream the ground in over a few frames instead of
 * hitching on one. The caller can raise it (see `sync`). */
const BUILD_BUDGET = 3;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Where the meadow gives out and the mountain starts, m of altitude: the
 * ground goes over to bedrock across this band. */
const ROCK_LINE = { from: 26, to: 52 };
/** The normal's Y where a slope starts showing bare rock, and the width of
 * that band — a flank steeper than about 45° is rock all the way. */
const ROCK_SLOPE = { from: 0.88, band: 0.18 };

/** How much bare rock the ground shows, 0..1: steep flanks first (mountain
 * sides, the cut walls beside the road), then sheer altitude. The tile paint
 * lays the biome's bedrock over the meadow by exactly this much, and the
 * renderer asks the same question of the ground under the wheels — what a
 * tire throws has to be what it is standing on. */
function bareRock(y: number, normalY: number): number {
  const steep = clamp01((ROCK_SLOPE.from - normalY) / ROCK_SLOPE.band);
  return steep + (1 - steep) * clamp01((y - ROCK_LINE.from) / (ROCK_LINE.to - ROCK_LINE.from));
}

/** The paint rule above, asked at a world position off the RIDDEN ground
 * lattice (the surface the physics uses), so anything reading the ground the
 * car is on agrees with what is drawn under it. */
export function rockAt(groundAt: (x: number, z: number) => number, x: number, z: number): number {
  const dx = (groundAt(x - CELL, z) - groundAt(x + CELL, z)) / (2 * CELL);
  const dz = (groundAt(x, z - CELL) - groundAt(x, z + CELL)) / (2 * CELL);
  return bareRock(groundAt(x, z), 1 / Math.hypot(dx, 1, dz));
}

export type Terrain = {
  group: THREE.Group;
  /** The engine's terrain field this ground is drawn from — heights,
   * streams, water, road distance, wild props. */
  field: TerrainField;
  /** Landscape height at a world position (what scenery stands on). */
  heightAt: (x: number, z: number) => number;
  /** The GROUND TILES' own surface at a point, m — the drawn lattice, with
   * no road ribbon over it. R16's hand-over gives the road's outer band
   * this height, so the two meshes meet instead of one stopping in the air
   * over the other. */
  latticeAt: (x: number, z: number) => number;
  /** The ground's own COLOUR at a point, into `out` — the same paint the
   * tiles carry. The road's outer band fades into it, so the corridor ends
   * in the country rather than at a line ruled against it. */
  paintAt: (x: number, z: number, out: THREE.Color) => void;
  /** Catch the ground up with the track and the car: index new samples,
   * cut new stream valleys, build the tiles the road and the car now
   * need, and drop the ones both have left behind. `budget` caps how many
   * tiles one call may raise; the rest come on later calls, nearest first. */
  sync: (track: Track, carS: number, carX: number, carZ: number, budget?: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export function buildTerrain(
  track: Track,
  biome: Biome,
  waterTexture: THREE.Texture,
  season: Season,
): Terrain {
  const field = createTerrain(track);
  const heightAt = field.heightAt;
  const samples = track.samples;

  // Paint-only noise seeds (the shape's seeds live inside the field).
  const rng = createRng((track.seed ^ 0x513ac1b7) >>> 0);
  const noiseSeed = rng.int(1, 1 << 30);

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

  // The year moves the living half of the palette and leaves the rock and
  // the water where they are.
  const palette = { ...biome.ground, ...biome.seasons[season] };
  const grass = new THREE.Color(palette.grass);
  const grassDark = new THREE.Color(palette.grassDark);
  const moss = new THREE.Color(palette.moss);
  const heath = new THREE.Color(palette.heath);
  const floor = new THREE.Color(palette.forestFloor);
  const rock = new THREE.Color(palette.bedrock);
  const rockDark = new THREE.Color(palette.bedrockDark);
  const dryGrass = new THREE.Color(palette.dryGrass);
  const soil = new THREE.Color(palette.soil);
  const shore = new THREE.Color(palette.shore);
  const bed = new THREE.Color(palette.lakeBed);
  const c = new THREE.Color();

  /** Each sub-region's ground, resolved once against the engine's REGIONS
   * order so a vertex costs an array index rather than a record lookup and
   * a Color allocation. A region the biome has no row for paints the plain
   * palette — the zeroed row below. */
  const PLAIN: RegionGround = { soil: palette.grass, soilMix: 0, moss: 0, dry: 0, bare: 0 };
  const regionGround = REGIONS.map((region) => {
    const look = biome.regions[region.id] ?? PLAIN;
    return { look, ground: new THREE.Color(look.soil) };
  });

  // The water is ONE mesh for the whole ground: a pane per flooded tile,
  // all at the same height and never overlapping, so instancing them costs
  // nothing and saves a draw call per hollow. That needs every pane to
  // share a geometry, which means the grain has to be anchored to the TILE
  // rather than to the world — and it only reads as one continuous sheet
  // if the repeat lands on a whole number of tiles, which is what
  // WATER_REPEATS is for.
  const WATER_REPEATS = 6;
  const lakeGeo = new THREE.PlaneGeometry(TILE, TILE, 1, 1);
  lakeGeo.rotateX(-Math.PI / 2);
  {
    const uv = lakeGeo.getAttribute("uv");
    const pos = lakeGeo.getAttribute("position");
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        ((pos.getX(i) + TILE / 2) / TILE) * WATER_REPEATS,
        ((pos.getZ(i) + TILE / 2) / TILE) * WATER_REPEATS,
      );
    }
  }
  let lakes: THREE.InstancedMesh | null = null;
  const lakeAt = new THREE.Matrix4();

  type Tile = { ground: THREE.Mesh; lake: boolean };
  const tiles = new Map<string, Tile>();

  /** THE GROUND'S OWN COLOUR at a point, into `out`: the altitude band, the
   * soft patches of moss, heath, dry grass and forest floor that break it
   * up, this sub-region's soil, the bedrock breaking through where the
   * ground is steep, and the per-vertex speckle over all of it.
   *
   * A function rather than a block inside `buildTile` because the ROAD asks
   * it too. R16's hand-over gives the ribbon's outer band the ground's own
   * height; giving it a colour of its own would put the seam straight back
   * where the geometry just took it out of — a ruled line of one green
   * against another, which is the boundary you can see from a kilometre
   * away in every screenshot of the road. Two callers, one palette.
   *
   * `y` and `normalY` are passed in rather than sampled here: the tile has
   * both already, off a lattice it built for the purpose, and the road has
   * its own answers. `carved` is a stream bed. */
  const paintGround = (
    x: number,
    z: number,
    y: number,
    normalY: number,
    carved: boolean,
    out: THREE.Color,
  ): void => {
    const speck = 0.88 + hash2(Math.round(x * 2), Math.round(z * 2), noiseSeed + 29) * 0.24;
    if (y < LAKE_Y + 0.6) out.copy(bed);
    else if (y < LAKE_Y + 3) out.copy(shore);
    else if (carved) out.copy(shore).lerp(bed, 0.35);
    else {
      // The meadow base, broken by big soft patches of moss, heath, dry
      // grass and bare forest floor so no two hillsides read the same —
      // and then leaned toward whatever SOIL this sub-region stands on,
      // which is what makes a bog dark, a logging block churned and an
      // old burn ashy without any of them needing a palette of its own.
      const { look, ground } = regionGround[field.regionAt(x, z)];
      const blend = valueNoise(x, z, 27, noiseSeed + 31);
      out.copy(grass).lerp(grassDark, blend);
      if (look.soilMix > 0) out.lerp(ground, look.soilMix);
      const m = valueNoise(x, z, 90, noiseSeed + 37);
      if (m > 0.6 - look.moss) out.lerp(moss, clamp01((m - 0.6 + look.moss) / 0.4) * 0.85);
      const h = valueNoise(x, z, 130, noiseSeed + 41);
      if (h > 0.64) out.lerp(heath, clamp01((h - 0.64) / 0.36) * 0.8);
      const d = valueNoise(x, z, 68, noiseSeed + 53);
      if (d > 0.72 - look.dry) out.lerp(dryGrass, clamp01((d - 0.72 + look.dry) / 0.28) * 0.7);
      const f = valueNoise(x, z, 55, noiseSeed + 43);
      if (f > 0.66) out.lerp(floor, clamp01((f - 0.66) / 0.34) * 0.75);
      // ...and the bare earth under all of it, which is what a region
      // that has been churned, felled or burnt over actually shows.
      const e = valueNoise(x, z, 38, noiseSeed + 59);
      if (e > 0.82 - look.bare) out.lerp(soil, clamp01((e - 0.82 + look.bare) / 0.18) * 0.8);
      out.lerp(rock, clamp01((y - ROCK_LINE.from) / (ROCK_LINE.to - ROCK_LINE.from)));
    }
    // Bedrock breaks through wherever the ground is steep — mountain
    // flanks, and the cut walls where the road runs between high rock.
    const steep = clamp01((ROCK_SLOPE.from - normalY) / ROCK_SLOPE.band);
    if (steep > 0) {
      const band = valueNoise(x, z, 18, noiseSeed + 47);
      out.lerp(band > 0.5 ? rock : rockDark, steep);
    }
    out.multiplyScalar(speck);
  };

  /** Rewrite the water from every tile standing. Grown in blocks so a tile
   * arriving does not reallocate the buffer each time. */
  const flushLakes = (): void => {
    const flooded: string[] = [];
    for (const [key, tile] of tiles) if (tile.lake) flooded.push(key);
    if (!lakes || lakes.instanceMatrix.count < flooded.length) {
      if (lakes) {
        group.remove(lakes);
        lakes.dispose();
      }
      lakes = new THREE.InstancedMesh(lakeGeo, waterMat, Math.ceil((flooded.length + 1) / 32) * 32);
      group.add(lakes);
    }
    flooded.forEach((key, i) => {
      const [tx, tz] = key.split(",").map(Number);
      lakeAt.makeTranslation((tx + 0.5) * TILE, LAKE_Y, (tz + 0.5) * TILE);
      lakes?.setMatrixAt(i, lakeAt);
    });
    // Only what was written is drawn: an instance nobody sets keeps the
    // identity matrix, which floods the start line.
    lakes.count = flooded.length;
    // A ground with no hollow in it draws no water at all: an instanced
    // mesh with a count of zero is still a draw call.
    lakes.visible = flooded.length > 0;
    lakes.instanceMatrix.needsUpdate = true;
    lakes.computeBoundingSphere();
  };

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
        const y = heightAt(x, z);
        H[j * n + i] = y;
        if (inStream(field.streams, x, z, 0)) carved[j * n + i] = 1;
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
        paintGround(x, z, y, normals[v * 3 + 1], carved[hi] === 1, c);
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

    // Anywhere the tile dips under the water table, water floods it — a
    // lake in a hollow, the open sea across a basin. The pane itself is an
    // instance in the shared sheet above; this only says whether there is
    // one here.
    return { ground, lake: minH < LAKE_Y + 0.5 };
  };

  const dropTile = (key: string): void => {
    const tile = tiles.get(key);
    if (!tile) return;
    tiles.delete(key);
    group.remove(tile.ground);
    tile.ground.geometry.dispose();
  };

  /** Tiles the window of road [fromS, end) needs on screen right now. */
  const corridorTiles = (fromS: number): Set<string> => {
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

  /** Tiles the car's own surroundings need — how the wild materializes. */
  const carTiles = (carX: number, carZ: number): Set<string> => {
    const needed = new Set<string>();
    const reach = Math.ceil(CAR_FAR / TILE);
    const cx = Math.floor(carX / TILE);
    const cz = Math.floor(carZ / TILE);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const centerX = (cx + dx + 0.5) * TILE;
        const centerZ = (cz + dz + 0.5) * TILE;
        if (Math.hypot(centerX - carX, centerZ - carZ) < CAR_FAR + TILE * 0.75) {
          needed.add(`${cx + dx},${cz + dz}`);
        }
      }
    }
    return needed;
  };

  /** The corridor tiles the road wants — never dropped on a finite stage. */
  let corridor = new Set<string>();
  let lastSyncedS = -Infinity;
  let lastCarX = Infinity;
  let lastCarZ = Infinity;
  let indexed = 0;

  const sync = (
    t: Track,
    carS: number,
    carX: number,
    carZ: number,
    budget = BUILD_BUDGET,
  ): void => {
    const grew = samples.length > indexed;
    indexed = samples.length;
    // The renderer's own field instance follows the streamed road the same
    // way the engine's does — same rules, same prune, same landscape.
    field.sync(carS);
    const moved = Math.hypot(carX - lastCarX, carZ - lastCarZ);
    if (!grew && carS - lastSyncedS < 250 && moved < 100) return;
    lastSyncedS = carS;
    lastCarX = carX;
    lastCarZ = carZ;

    // WHICH tiles are wanted: a finite stage's corridor is settled once and
    // for all, an endless one's follows the streaming frontier, and the car's
    // own window rides along with it wherever it wanders off the road.
    if (corridor.size === 0 || (t.endless && grew)) {
      corridor = corridorTiles(t.endless ? Math.max(0, carS - 450) : 0);
    }
    const around = carTiles(carX, carZ);

    // ...and how many of them are RAISED now: the nearest missing ground
    // first, a few tiles a call, so a stage arrives over a handful of frames.
    // A whole corridor is a hundred-odd tiles and half a second of work, and
    // spending it in one go stops the music as surely as it stops the map.
    const missing = [...new Set([...corridor, ...around])]
      .filter((key) => !tiles.has(key))
      .map((key) => {
        const [tx, tz] = parseKey(key);
        return { key, d: Math.hypot((tx + 0.5) * TILE - carX, (tz + 0.5) * TILE - carZ) };
      })
      .sort((a, b) => a.d - b.d);
    let flooding = false;
    for (const { key } of missing.slice(0, budget)) {
      tiles.set(key, buildTile(...parseKey(key)));
      flooding = true;
    }
    if (missing.length > budget) lastSyncedS = -Infinity; // come back next frame

    // Drop what neither the corridor nor the car can see anymore.
    for (const key of [...tiles.keys()]) {
      if (corridor.has(key) || around.has(key)) continue;
      dropTile(key);
      flooding = true;
    }
    if (flooding) flushLakes();
  };

  const update = (dt: number): void => {
    waterTexture.offset.x += dt * 0.008;
    waterTexture.offset.y += dt * 0.005;
  };

  const dispose = (): void => {
    for (const key of [...tiles.keys()]) dropTile(key);
    lakes?.dispose();
    lakeGeo.dispose();
    groundMat.dispose();
    waterMat.dispose();
  };

  /** The ground's colour where the ROAD asks for it — at the corridor's own
   * edge, where there is no tile lattice built yet and no normal to hand.
   * The slope is taken off the drawn lattice with the same central
   * difference the tiles use, so a road running along a rock face ends in
   * rock and one across a meadow ends in grass. */
  const paintAt = (x: number, z: number, out: THREE.Color): void => {
    const lattice = field.latticeAt;
    const y = lattice(x, z);
    const dx = (lattice(x - CELL, z) - lattice(x + CELL, z)) / (2 * CELL);
    const dz = (lattice(x, z - CELL) - lattice(x, z + CELL)) / (2 * CELL);
    paintGround(x, z, y, 1 / Math.hypot(dx, 1, dz), inStream(field.streams, x, z, 0), out);
  };

  return { group, field, heightAt, latticeAt: field.latticeAt, paintAt, sync, update, dispose };
}

function parseKey(key: string): [number, number] {
  const [tx, tz] = key.split(",").map(Number);
  return [tx, tz];
}
