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
  ROAD_CROSS,
  biomeRules,
  createRng,
  createTerrain,
  inStream,
  type Season,
  type TerrainField,
  type Track,
} from "@engine";

import { hash2, valueNoise } from "../lib/noise.ts";
import type { Biome, RegionGround } from "./biome.ts";
// R16 — the ground beside a road takes the ROAD's own edge tone and the
// SPILL's own noise field, so the ribbon's dissolve, the scattered stones
// and this wash all hand over along one boundary.
import { ROAD_PAINT } from "./road-mesh.ts";
import { DISSOLVE } from "./road-spill.ts";
import { detailTexture } from "./textures.ts";
import { driftWater, waterMaterial } from "./water-look.ts";

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

/** …and what that radius actually is right now, m. `CAR_FAR` unless a tool
 * has asked for more ground (`?air=`, `setGroundReach`).
 *
 * THE GROUND IS THE LIMIT ON HOW FAR A PICTURE CAN SEE, and it is the one
 * nothing else can buy round: opening the fog and the far plane only reveals
 * that the country stops, because past this radius no tile has been built —
 * what fills the gap is the camera-locked ridge backdrop, which reads as a
 * pale haze where the land should be.
 *
 * It is the CAR's radius that moves rather than the corridor's, because a
 * preview stands its camera over the car: the corridor's reach would build
 * this much ground along every metre of the stage, which is quadratic in the
 * wrong variable, while the car's is one disc. Bounded on purpose — a tile is
 * 224 m, so two kilometres is a 19x19 block, and the shutter has to wait for
 * all of it (`BUILD_TILES` a frame). */
let carFar = CAR_FAR;

/** Tiles a still may raise per sync, whatever budget the caller passed.
 *
 * The radius alone does nothing without this. Ground is streamed a few tiles
 * a frame, and the budget the world passes is scaled by how far the CAR has
 * travelled — which under god mode is nowhere, so the rate is zero and the
 * country never grows past the handful raised when the stage was built. A
 * run wants that; it is what keeps a stage from stopping the music while it
 * builds. A preview holds still on purpose and can afford the wait. */
let eager = 0;

/** Build ground this far around the car, m — for a STILL that is looking at
 * kilometres. Anything at or under the driving radius restores both this and
 * the streaming rate to what a run uses. */
export function setGroundReach(m: number): void {
  carFar = m > CAR_FAR ? m : CAR_FAR;
  eager = m > CAR_FAR ? 48 : 0;
}
/** Freshly needed tiles built per sync at most — an excursion, and a whole
 * stage's corridor, stream the ground in over a few frames instead of
 * hitching on one. The caller can raise it (see `sync`). */
const BUILD_BUDGET = 3;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** R16 — how far the road's dust reaches into the country beside it, how
 * much of the shoulder's colour the ground takes at the lip, and how far
 * the noise field is allowed to push the boundary either way (0 is a band
 * of fixed width, which is the ruled line the whole hand-over exists to
 * avoid; 1 is the whole reach).
 *
 * `reach` is generous on purpose. The ribbon's own dissolve is spent by the
 * corridor's lip, so this is the ONLY thing softening the far side of the
 * boundary, and a wash that died out in a metre would simply move the step
 * a metre further out. `mix` is well under half: this is dust on grass, and
 * grass it still has to look like. */
const DUST = { reach: 9, mix: 0.4, wander: 0.8 };

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
  /** WHAT SCENERY STANDS ON: the drawn ground at a world position — the
   * tile lattice with the road ribbon over it where there is one, which is
   * the same surface the car rides (`TerrainField.groundAt`).
   *
   * NOT the analytic field. The two are the same thing only at the lattice
   * corners: between them the tiles are flat triangles 14 m across and the
   * analytic height keeps curving, so on a rounded shoulder it stands
   * proud of the mesh and in a hollow it sinks under it. Beside this
   * stage's roads that gap runs to nine metres, and a boulder placed on the
   * analytic height is a boulder hanging in the air over the hillside it is
   * supposed to be sitting on. Whatever is drawn has to stand on what is
   * drawn. */
  standOn: (x: number, z: number) => number;
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

export function buildTerrain(track: Track, biome: Biome, season: Season): Terrain {
  const field = createTerrain(track);
  // THE TRAINING GROUND draws itself at its own resolution. Its ramp, its
  // graded roads and the bank round it are all shapes a 14 m lattice would
  // smooth away before anyone saw them — and the physics rides exactly the
  // triangles drawn here, so smoothing them away would take them out of the
  // driving too, not merely out of the picture. Where a tile reaches the
  // arena it is cut four times finer (`ARENA_CELL`), which nests inside the
  // country's own lattice so the two meet without a crack.
  const arena = track.arena;
  // The analytic field, and the one place in the app that may read it: the
  // tile CORNERS are where the mesh and the field agree by construction, so
  // sampling it here is what DEFINES the drawn lattice. Anything asking
  // where the ground is between two corners wants `standOn`.
  const heightAt = field.heightAt;
  const samples = track.samples;
  /** Where the road's corridor ends, m from its centerline — the lip the
   * ribbon hands over at, and so where the ground's own paint starts being
   * the only thing left softening the edge. The nominal width rather than
   * R33's per-sample one: `roadDistanceAt` answers with a distance and not
   * a sample, and this is a colour wash nine metres wide, not a boundary. */
  const LIP = track.width / 2 + ROAD_CROSS.reach;

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
  // The app's one water look, shared with the fords and the streams — never
  // disposed here, because it is not this module's to free.
  const waterMat = waterMaterial();

  // The year moves the living half of the palette and leaves the rock and
  // the water where they are.
  const palette = { ...biome.ground, ...biome.seasons[season] };
  const grass = new THREE.Color(palette.base);
  const grassDark = new THREE.Color(palette.baseDark);
  const moss = new THREE.Color(palette.damp);
  const heath = new THREE.Color(palette.scrub);
  const floor = new THREE.Color(palette.litter);
  const rock = new THREE.Color(palette.bedrock);
  const rockDark = new THREE.Color(palette.bedrockDark);
  const dryGrass = new THREE.Color(palette.straw);
  const soil = new THREE.Color(palette.soil);
  const shore = new THREE.Color(palette.shore);
  const bed = new THREE.Color(palette.bed);
  // R40 — the country's own rules: which regions quilt it, and what its
  // unsealed road is made of.
  const rules = biomeRules(track.knobs.biome);
  // R16 — what the road leaves on the country beside it. The road's own
  // shoulder colour rather than a brown of its own: the wash has to arrive
  // at exactly the tone the ribbon's outer band is already dissolving into,
  // or the two hand-overs disagree and there are two boundaries instead of
  // none. A sand road's shoulder is sand, so its wash is the packed sand
  // of its own wheel tracks rather than a gravel road's earth.
  const dust = new THREE.Color(rules.loose === "sand" ? ROAD_PAINT.sand.worn : ROAD_PAINT.shoulder);
  // The training ground's own two surfaces, in the road's palette — one
  // pair, built once, because the pad is tens of thousands of vertices and
  // a colour per vertex is a colour per vertex.
  const padSeal = new THREE.Color(ROAD_PAINT.asphalt.loose);
  const padSealWorn = new THREE.Color(ROAD_PAINT.asphalt.worn);
  const padStone = new THREE.Color(ROAD_PAINT.gravel.loose);
  const padStoneWorn = new THREE.Color(ROAD_PAINT.gravel.worn);
  const c = new THREE.Color();

  /** Each sub-region's ground, resolved once against the engine's region
   * order for this country, so a vertex costs an array index rather than a
   * record lookup and a Color allocation. A region the biome has no row
   * for paints the plain palette — the zeroed row below. */
  const PLAIN: RegionGround = { soil: palette.base, soilMix: 0, moss: 0, dry: 0, bare: 0 };
  const regionGround = rules.regions.map((region) => {
    const look = biome.regions[region.id] ?? PLAIN;
    return { look, ground: new THREE.Color(look.soil) };
  });

  // R35 — THE WATER, CUT TO ITS OWN SHORE.
  //
  // It used to be a pane per flooded TILE: one square, tile-sized, at one
  // height for the whole world, drawn whenever any corner of the tile dipped
  // under the table. Which meant a lake's edge was the tile grid — straight
  // sides, right angles, and a sheet lying over every metre of ground inside
  // that tile that stood above the water. That is the water hanging in the
  // air, and no amount of shading fixes a shoreline that is in the wrong
  // place.
  //
  // Now each tile cuts its water against the ground it actually drew:
  // marching squares over the same height lattice, at the level the pour
  // gave the body here. Where a cell is entirely under water it contributes
  // its whole square; where the shore crosses it, the polygon is clipped on
  // the waterline itself, interpolated along the cell's edges. The sheet
  // therefore ENDS exactly where the ground rises through it — every
  // headland, every inlet — and it is flat, because a body's level is.
  //
  // It stays ONE mesh: the tiles' triangles are concatenated into a single
  // buffer in `flushLakes`, so a stage with nine lakes on it still costs
  // one draw call, exactly as the instanced panes did.
  //
  // The grain is anchored to the WORLD rather than to a tile — the geometry
  // is no longer a repeated unit square, so there is nothing to repeat
  // against, and world UVs make the surface continuous across every seam by
  // construction.
  const WATER_GRAIN = TILE / 6;
  /** A cell's four corners as (di, dj) steps, in the order the waterline is
   * walked round them — the winding that comes out facing UP (see
   * `cutWater`). */
  const CORNERS = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ] as const;
  /** The level of the water standing at a point, whether or not the point
   * itself is under it — the shore's own reading, so a cell that straddles
   * the waterline still knows which surface it is being cut against. */
  const lakeLevelAt = field.water.shoreLevelAt;
  let lakes: THREE.Mesh | null = null;
  const lakeGeo = new THREE.BufferGeometry();

  /** One tile's water: triangles in world space, flat at their body's
   * level, or null where the tile has no standing water on it. */
  type TileWater = { positions: number[]; uvs: number[] };
  type Tile = { ground: THREE.Mesh; water: TileWater | null };
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
    // THE TRAINING GROUND is not country. Its pad was graded and then
    // either sealed or bladed, so it takes the ROAD's own palette — the
    // same two colours a stage's tarmac and gravel are drawn in, so a
    // surface change on the arena reads as the surface change it is.
    // Everything below (the meadow bands, the bedrock, the road dust) is
    // about ground that grew rather than ground that was laid.
    const laid = arena?.surfaceAt(x, z);
    if (laid !== null && laid !== undefined) {
      const sealed = laid === "asphalt";
      const worn = sealed ? padSealWorn : padStoneWorn;
      // Bladed stone and worn seal both mottle: the wear is where the cars
      // have been, and on a practice ground the cars have been everywhere.
      out.copy(sealed ? padSeal : padStone).lerp(worn, valueNoise(x, z, 21, noiseSeed + 61));
      // ...and every FACE on the pad is darker than the flat it stands on.
      // The pad is level and the sun over a training ground at noon is
      // nearly overhead, so Lambert alone gives a three-metre ramp almost
      // no shading at all and the one shape a driver most needs to see
      // coming reads as a stain. This is what makes the ramp, the
      // table-top, the banked corner and the bank round the lot legible as
      // SHAPES from the far side of the ground.
      out.lerp(worn, clamp01((1 - normalY) * 2.4));
      out.multiplyScalar(speck);
      return;
    }
    // R35 — bed and beach are painted against the level of the water
    // STANDING HERE, not against the sea. A tarn on a shoulder has a
    // lakebed and a shore of its own, and keying the two bands to one
    // global height paints them at that height right across the map:
    // a ring of beach round every hill that happens to pass through it,
    // and a lake three hundred metres up with meadow running under it.
    const level = lakeLevelAt(x, z) ?? -Infinity;
    if (y < level + 0.6) out.copy(bed);
    else if (y < level + 3) out.copy(shore);
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
    // R16 — THE DUST. The grass beside a gravel road is not grass: it is
    // grass with a road's worth of dust on it, thrown there by every car
    // that has been past and never washed off. Without it the transition
    // has a LAST STEP in it — the ribbon dissolves honestly across its own
    // band and then, at the corridor's lip, the country goes back to full
    // meadow green in one vertex. That step is the line still visible in a
    // screenshot after the geometry seam is gone, and no amount of scatter
    // hides it, because it is a change of hue and the scatter is texture.
    //
    // So the wash carries on PAST the lip, over ground the road mesh does
    // not reach, dying out over `DUST.reach`. It is driven by the same
    // noise field the ribbon's paint and the spilled stones use, so the
    // three interlock along one wandering boundary rather than each drawing
    // an edge of its own — and because `paintGround` is the one palette
    // BOTH the tiles and the road's outer band read (see the header above),
    // the wash is continuous across the seam by construction.
    const past = field.roadDistanceAt(x, z) - LIP;
    if (past < DUST.reach) {
      const fade = 1 - clamp01(past / DUST.reach);
      const wander = valueNoise(x, z, DISSOLVE.patch, DISSOLVE.seed);
      out.lerp(dust, clamp01(fade * (1 + DUST.wander) - wander * DUST.wander) * DUST.mix);
    }
    out.multiplyScalar(speck);
  };

  /** Rewrite the water from every tile standing: one buffer holding every
   * standing tile's clipped triangles, so the whole of a stage's water is
   * a single draw however many separate lakes it is. */
  const flushLakes = (): void => {
    let count = 0;
    for (const tile of tiles.values()) if (tile.water) count += tile.water.positions.length;
    // A ground with no hollow in it draws no water at all: a mesh with an
    // empty buffer is still a draw call.
    if (count === 0) {
      if (lakes) lakes.visible = false;
      return;
    }
    const positions = new Float32Array(count);
    const uvs = new Float32Array((count / 3) * 2);
    let p = 0;
    let u = 0;
    for (const tile of tiles.values()) {
      if (!tile.water) continue;
      positions.set(tile.water.positions, p);
      uvs.set(tile.water.uvs, u);
      p += tile.water.positions.length;
      u += tile.water.uvs.length;
    }
    lakeGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    lakeGeo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    // The sheet is flat and lit from above wherever it is, so the normal is
    // straight up at every vertex — written out rather than derived from the
    // triangles. Deriving it is not just slower: on the SHORE it is wrong.
    // A cell the waterline clips exactly through a corner fans a zero-area
    // triangle, whose face normal is the zero vector, and a vertex that
    // takes that on is lit by nothing at all.
    const normals = new Float32Array(count);
    for (let i = 1; i < count; i += 3) normals[i] = 1;
    lakeGeo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    lakeGeo.computeBoundingSphere();
    if (!lakes) {
      lakes = new THREE.Mesh(lakeGeo, waterMat);
      // A car standing in a lake still throws its shadow onto it
      // (car-shadow.ts).
      lakes.receiveShadow = true;
      // The water never moves and the camera is always outside it; culling
      // it per tile is what the single mesh gave up, and the bounding
      // sphere below is what it gets back.
      group.add(lakes);
    }
    lakes.visible = true;
  };

  /** Does this tile reach the training ground? Measured against the arena's
   * whole reach — the pad, its bank, and the band the bank is letting the
   * country back over — because the boundary of the fine region has to sit
   * where the arena is asserting nothing, or the coarse tile beside it
   * would draw a different surface from the fine one. */
  const tileIsFine = (originX: number, originZ: number): boolean => {
    if (arena === null) return false;
    const nx = Math.max(originX, Math.min(arena.frame.x, originX + TILE));
    const nz = Math.max(originZ, Math.min(arena.frame.z, originZ + TILE));
    return Math.hypot(nx - arena.frame.x, nz - arena.frame.z) <= arena.reach;
  };

  const buildTile = (tx: number, tz: number): Tile => {
    const originX = tx * TILE;
    const originZ = tz * TILE;
    // On the arena, the SAMPLED surface is the ridden lattice rather than
    // the analytic field: sampling the country's own lattice four times
    // finer reproduces it exactly (a nested grid re-interpolates a
    // piecewise-linear surface into itself), while sampling the analytic
    // field would draw a curve the physics is not standing on.
    const fine = tileIsFine(originX, originZ);
    const cells = fine ? CELLS * 4 : CELLS;
    const cell = fine ? CELL / 4 : CELL;
    const sample = fine ? field.latticeAt : heightAt;
    // Heights on a (cells+3)² lattice — one ring beyond the tile — so the
    // normals at tile edges are finite differences of the SAME function on
    // both sides of the seam, and the lighting never shows the grid.
    const n = cells + 3;
    const H = new Float32Array(n * n);
    const carved = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = originX + (i - 1) * cell;
        const z = originZ + (j - 1) * cell;
        const y = sample(x, z);
        H[j * n + i] = y;
        if (inStream(field.streams, x, z, 0)) carved[j * n + i] = 1;
      }
    }

    const verts = cells + 1;
    const positions = new Float32Array(verts * verts * 3);
    const normals = new Float32Array(verts * verts * 3);
    const uvs = new Float32Array(verts * verts * 2);
    const colors = new Float32Array(verts * verts * 3);
    const indices: number[] = [];
    for (let j = 0; j < verts; j++) {
      for (let i = 0; i < verts; i++) {
        const v = j * verts + i;
        const hi = (j + 1) * n + (i + 1);
        const x = originX + i * cell;
        const z = originZ + j * cell;
        const y = H[hi];
        positions[v * 3] = x;
        positions[v * 3 + 1] = y;
        positions[v * 3 + 2] = z;
        uvs[v * 2] = x / 16;
        uvs[v * 2 + 1] = z / 16;
        // Normal from the height lattice (central difference). Normals
        // before colors: the paint below reads slope off them.
        const dx = (H[hi - 1] - H[hi + 1]) / (2 * cell);
        const dz = (H[hi - n] - H[hi + n]) / (2 * cell);
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
        if (i < cells && j < cells) {
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
    // The ground reads the cars' shadow map (car-shadow.ts); nothing that
    // stands on it does, so the lookup is paid for the ground alone.
    ground.receiveShadow = true;
    group.add(ground);

    return { ground, water: cutWater(originX, originZ, H, n, cell, cells) };
  };

  /** Cut this tile's standing water against the ground it just drew.
   *
   * Marching squares over the drawn lattice: each cell's four corners are
   * either under their water level or not, and the polygon that survives is
   * the part that is. A corner under water contributes itself; an edge with
   * one corner each side contributes the point where the depth crosses
   * zero — which IS the waterline, to the accuracy of the ground the tile
   * is showing. Fan-triangulated, so a cell contributes anywhere from
   * nothing to three triangles.
   *
   * The level comes from the pour and the ground from the lattice, and that
   * split is the whole reason this reads right: the level is flat over a
   * body no matter how coarsely it was worked out, and the SHORE is as fine
   * as whatever the tile drew. */
  const cutWater = (
    originX: number,
    originZ: number,
    H: Float32Array,
    n: number,
    cell: number,
    cells: number,
  ): TileWater | null => {
    // Walked in +z-then-+x order rather than the other way round, because
    // THAT is the winding that faces UP. Get it backwards and every triangle
    // the fan emits is back-facing, the whole sheet is culled by a material
    // that draws front faces, and what is left standing where a lake should
    // be is its BED — ground painted lake-bottom blue, which is exactly
    // enough like water to be reported as water that flickers rather than as
    // water that is missing. The ground tiles above wind the same way.
    let positions: number[] | null = null;
    let uvs: number[] | null = null;
    // Corner scratch, reused per cell: x, z, ground, level, depth.
    const cx = [0, 0, 0, 0];
    const cz = [0, 0, 0, 0];
    const cd = [0, 0, 0, 0];
    const poly: number[] = [];
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        let level = -Infinity;
        let wet = 0;
        for (let c = 0; c < 4; c++) {
          const [di, dj] = CORNERS[c];
          const x = originX + (i + di) * cell;
          const z = originZ + (j + dj) * cell;
          const ground = H[(j + dj + 1) * n + (i + di + 1)];
          const here = lakeLevelAt(x, z);
          cx[c] = x;
          cz[c] = z;
          cd[c] = here === null ? -Infinity : here - ground;
          if (here !== null && here > level) level = here;
          if (cd[c] > 0) wet++;
        }
        if (wet === 0) continue;
        poly.length = 0;
        for (let c = 0; c < 4; c++) {
          const d0 = cd[c];
          const d1 = cd[(c + 1) % 4];
          if (d0 > 0) poly.push(cx[c], cz[c]);
          // The crossing, wherever one corner is under and the next is not.
          // `-Infinity` on a corner with no water near it still gives the
          // right SIDE, and the interpolation is clamped to the edge, so a
          // shore against dry country lands on the corner rather than
          // somewhere off in the next field.
          if (d0 > 0 !== d1 > 0) {
            const span = d0 - d1;
            const t = Number.isFinite(span) && span !== 0 ? d0 / span : d0 > 0 ? 1 : 0;
            const k = t < 0 ? 0 : t > 1 ? 1 : t;
            poly.push(cx[c] + (cx[(c + 1) % 4] - cx[c]) * k, cz[c] + (cz[(c + 1) % 4] - cz[c]) * k);
          }
        }
        if (poly.length < 6) continue;
        if (!positions) {
          positions = [];
          uvs = [];
        }
        // Fan from the first vertex: the polygon is convex (it is a square
        // cut by one line) so a fan is a correct triangulation.
        for (let v = 1; v + 1 < poly.length / 2; v++) {
          for (const at of [0, v, v + 1]) {
            const px = poly[at * 2];
            const pz = poly[at * 2 + 1];
            positions.push(px, level, pz);
            (uvs as number[]).push(px / WATER_GRAIN, pz / WATER_GRAIN);
          }
        }
      }
    }
    return positions && uvs ? { positions, uvs } : null;
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
    const reach = Math.ceil(carFar / TILE);
    const cx = Math.floor(carX / TILE);
    const cz = Math.floor(carZ / TILE);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const centerX = (cx + dx + 0.5) * TILE;
        const centerZ = (cz + dz + 0.5) * TILE;
        if (Math.hypot(centerX - carX, centerZ - carZ) < carFar + TILE * 0.75) {
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
    // A still asks for more ground than the caller's rate would ever raise,
    // and asks from a camera that is not moving — so neither the distance
    // gate below nor the budget above it can be left to decide.
    const raise = Math.max(budget, eager);
    if (eager === 0 && !grew && carS - lastSyncedS < 250 && moved < 100) return;
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
    for (const { key } of missing.slice(0, raise)) {
      tiles.set(key, buildTile(...parseKey(key)));
      flooding = true;
    }
    if (missing.length > raise) lastSyncedS = -Infinity; // come back next frame

    // Drop what neither the corridor nor the car can see anymore.
    for (const key of [...tiles.keys()]) {
      if (corridor.has(key) || around.has(key)) continue;
      dropTile(key);
      flooding = true;
    }
    if (flooding) flushLakes();
  };

  const update = (dt: number): void => {
    driftWater(dt);
  };

  const dispose = (): void => {
    for (const key of [...tiles.keys()]) dropTile(key);
    lakeGeo.dispose();
    groundMat.dispose();
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

  return {
    group,
    field,
    standOn: field.groundAt,
    latticeAt: field.latticeAt,
    paintAt,
    sync,
    update,
    dispose,
  };
}

function parseKey(key: string): [number, number] {
  const [tx, tz] = key.split(",").map(Number);
  return [tx, tz];
}
