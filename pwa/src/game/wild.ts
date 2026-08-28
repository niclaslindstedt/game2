// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The WILD: the living landscape beyond the band of scenery each road
// chunk carries — the nature an exploring car actually drives through.
//
// It streams in cells on the terrain's tile grid around the CAR (wherever
// it is, road or not), and it is drawn from POOLS: one instanced mesh per
// plant variant and one for the stone, across every cell standing. A cell
// is a couple of hundred metres square holding a handful each of two dozen
// variants, so a mesh per cell per variant would come out as a draw call
// for every two or three plants — and there is nothing to be gained by
// keeping them apart, because the wild only ever reaches as far as the fog
// does.

import * as THREE from "three";
import { createRng, hash2, inStream, type Season, type Track, type WildObstacle } from "@engine";

import { buildFloraField, type FloraPlacement } from "./flora.ts";
import type { Biome, Community } from "./biome.ts";
import {
  RIPARIAN_BAND,
  communityByGrove,
  mixAt,
  pickFlora,
  propPlacement,
  samePlace,
  softMix,
  treePlacement,
  understoryAround,
} from "./planting.ts";
import { LAKE_Y, type Terrain } from "./terrain.ts";

const UP = new THREE.Vector3(0, 1, 0);

/** Cell edge for the wild's scenery, m (the terrain's tile grid). */
const WILD_CELL = 224;
/** Wild cells dressed within this range of the car, m. */
const WILD_FAR = 430;
/** The prop kinds drawn as instanced rock — everything the ground made of
 * stone. The wooden ones (fallen trunks, cut stumps) go through flora. */
const STONE_KINDS = new Set<WildObstacle["kind"]>(["boulder", "rock", "slab"]);

/** The share of the wild's loose stone that has gone over to moss, and the
 * green it wears. Nothing in a boreal forest stays bare for long: a stone
 * lying in the shade for fifty years is a green stone with grey sides, and
 * the difference between rock that has been there and rock that was PUT
 * there is most of what makes a hillside read as old. */
const MOSSY_SHARE = 0.45;
const MOSS_COLOR = 0x86a84e;

/** The lump every wild stone is drawn from, with moss laid over the faces
 * that look at the sky. The colours are absolute, so the material carries
 * none of its own and the per-instance tint still varies the grey under the
 * green. Facets are flat at this detail, so each one is either a top, an
 * upper flank or a side, and the moss line falls where the rock turns over:
 * the caps go fully over, the flanks most of the way, the sides not at all.
 * A cap alone is not enough — it is a few pixels of a stone seen from a car,
 * and what has to read is the whole UPPER HALF being green. */
function mossyStone(rock: number): THREE.BufferGeometry {
  const geo = new THREE.DodecahedronGeometry(1);
  const normal = geo.getAttribute("normal");
  const base = new THREE.Color(rock);
  const moss = new THREE.Color(MOSS_COLOR);
  const c = new THREE.Color();
  const colors: number[] = [];
  for (let i = 0; i < normal.count; i++) {
    const up = normal.getY(i);
    c.copy(base).lerp(moss, Math.min(1, Math.max(0, (up - 0.1) * 1.6)));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

/** Whether this stone is one of the mossy ones — from where it lies, so it
 * keeps its coat across a cell being dropped and rebuilt. An outcrop's face
 * is freshly broken bedrock and never takes one. */
function mossGrows(ob: WildObstacle): boolean {
  if (ob.kind === "slab") return false;
  return hash2(Math.round(ob.x * 4), Math.round(ob.z * 4), 0x5eaf1a55) < MOSSY_SHARE;
}

/** How one stone prop sits in the ground. Each kind has its own seat, and
 * each formula is the one the engine wrote its collision circle and its
 * height from — what is drawn IS what the car hits. */
function stoneMatrix(
  ob: WildObstacle,
  m: THREE.Matrix4,
  q: THREE.Quaternion,
  v: THREE.Vector3,
  sc: THREE.Vector3,
): THREE.Matrix4 {
  if (ob.kind === "slab") {
    // An outcrop: sunk near half its depth and stretched tall, a face of
    // rock rather than a pebble.
    return m.compose(
      v.set(ob.x, ob.y + ob.size * 0.5, ob.z),
      q,
      sc.set(ob.size, ob.size * 1.3, ob.size * 0.8),
    );
  }
  if (ob.kind === "rock") {
    // Loose stone: a squashed lump a third of itself in the ground.
    return m.compose(
      v.set(ob.x, ob.y + ob.size * 0.35, ob.z),
      q,
      sc.set(ob.size, ob.size * 0.7, ob.size),
    );
  }
  // A deep-wild boulder, sunk near half in and matched to its circle.
  return m.compose(
    v.set(ob.x, ob.y + ob.height * 0.42, ob.z),
    q,
    sc.set(ob.radius * 0.95, ob.height * 0.85, ob.radius * 0.8),
  );
}

/** Cells dressed per sync at most — the forest streams in, never hitches. */
const WILD_BUDGET = 2;

/** What a wild cell CONTRIBUTES, rather than what it draws: the meshes
 * belong to the pools that hold the whole wild, so a cell is the list it
 * put in them and nothing else. */
type WildCell = {
  plants: FloraPlacement[];
  stones: WildObstacle[];
  /** Which of this cell's plants are ENGINE props rather than app-side
   * dressing, by position — they are retired on the engine's word, not on
   * a radius of our own. */
  props: Set<string>;
};

/** A prop's position as a key both sides agree on. */
function propKey(x: number, z: number): string {
  return `${x.toFixed(2)},${z.toFixed(2)}`;
}

export type Wild = {
  group: THREE.Group;
  sync: (carX: number, carZ: number) => void;
  /** Draw only the cells a camera is pointed at. The wild is pooled into
   * one mesh per variant, so this is the only frustum culling it gets —
   * and it needs some: half the country a car stands in is behind it. A
   * cell wanted by ANY of the frame's views is kept, which is how the
   * rear-view mirror gets to see the half the forward camera does not. */
  cull: (frustums: readonly THREE.Frustum[]) => void;
  /** Retire wild props that newly built road now runs through. */
  clearNear: (t: Track, from: number, to: number) => void;
  /** Stop drawing the one thing standing at a world point — the engine has
   * taken it out of the field and the piece is flying (breakage.ts). */
  retireAt: (x: number, z: number) => void;
  dispose: () => void;
};

/** The wild: the living landscape beyond the road bands' 150 m — the
 * nature an exploring car actually drives through. Cells on the terrain's
 * tile grid stream in around the CAR (wherever it is, road or not), each
 * planting the same biome quilt the road bands plant, thinner — plus the
 * engine terrain's solid props, drawn exactly where the physics collides
 * with them: the wooden ones (fallen trunks, cut stumps) join the flora
 * instancing, the stone ones (boulders, rocks, outcrops) share one
 * instanced rock. Deterministic per seed and cell.
 *
 * The whole wild is drawn from POOLS — one instanced mesh per plant
 * variant and one for the stone, across every cell standing. A cell is a
 * couple of hundred metres square holding a handful each of two dozen
 * variants, so a mesh per cell per variant comes out as a draw call for
 * every two or three plants; and there is nothing to be gained by keeping
 * them apart, because the wild only ever reaches as far as the fog does. */
export function buildWild(
  track: Track,
  biome: Biome,
  terrain: Terrain,
  density: number,
  season: Season,
): Wild {
  const group = new THREE.Group();
  const communityAt = (x: number, z: number): Community =>
    communityByGrove(biome, terrain.field.groveAt(x, z));
  const cells = new Map<string, WildCell>();
  const heightAt = terrain.heightAt;
  const field = terrain.field;

  const plants = buildFloraField(season);
  group.add(plants.group);
  const stoneGeo = new THREE.DodecahedronGeometry(1);
  const stoneMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(biome.ground.bedrock) });
  const mossGeo = mossyStone(biome.ground.bedrock);
  const mossMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  let stoneMesh: THREE.InstancedMesh | null = null;
  let mossMesh: THREE.InstancedMesh | null = null;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();
  const dark = new THREE.Color(biome.ground.bedrockDark);

  /** Rewrite one stone pool from a list. Grown in blocks so a cell arriving
   * does not reallocate the buffer each time. */
  const writeStones = (
    mesh: THREE.InstancedMesh | null,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    all: WildObstacle[],
  ): THREE.InstancedMesh => {
    let pool = mesh;
    if (!pool || pool.instanceMatrix.count < all.length) {
      if (pool) {
        group.remove(pool);
        pool.dispose();
      }
      pool = new THREE.InstancedMesh(geo, mat, Math.ceil((all.length + 1) / 64) * 64);
      group.add(pool);
    }
    all.forEach((ob, i) => {
      q.setFromAxisAngle(UP, ob.spin);
      stoneMatrix(ob, m, q, v, sc);
      pool.setMatrixAt(i, m);
      tint.setScalar(0.75 + (ob.spin % 1) * 0.35);
      // An outcrop is the bedrock itself showing through, not a stone that
      // rolled here: it takes the darker face.
      if (ob.kind === "slab") tint.lerp(dark, 0.6);
      pool.setColorAt(i, tint);
    });
    // Only what was written is drawn: an instance nobody sets keeps the
    // identity matrix, which puts a boulder on the start line.
    pool.count = all.length;
    pool.visible = all.length > 0;
    pool.instanceMatrix.needsUpdate = true;
    if (pool.instanceColor) pool.instanceColor.needsUpdate = true;
    pool.computeBoundingSphere();
    return pool;
  };

  /** Rewrite both stone pools from every cell standing — the bare rock and
   * the mossed-over rock are two meshes because the moss is baked into the
   * geometry, which is what lets it sit on the TOP of a stone rather than
   * washing the whole thing green. */
  const flushStones = (): void => {
    const bare: WildObstacle[] = [];
    const mossed: WildObstacle[] = [];
    for (const cell of cells.values()) {
      for (const ob of cell.stones) (mossGrows(ob) ? mossed : bare).push(ob);
    }
    stoneMesh = writeStones(stoneMesh, stoneGeo, stoneMat, bare);
    mossMesh = writeStones(mossMesh, mossGeo, mossMat, mossed);
  };

  const buildCell = (cx: number, cz: number): WildCell => {
    const rng = createRng(
      (track.seed ^ 0x2ce1a373 ^ (Math.imul(cx, 2246822519) + Math.imul(cz, 668265263))) >>> 0,
    );
    const originX = cx * WILD_CELL;
    const originZ = cz * WILD_CELL;
    const placements: FloraPlacement[] = [];

    // The wild forest — the same engine trunk field the physics collides
    // with, each trunk drawn by the cell that OWNS its position. The road
    // bands' scenery chunks own everything within 150 m of the road.
    const treesHere = field
      .treesNear(originX + WILD_CELL / 2, originZ + WILD_CELL / 2, WILD_CELL * 0.71)
      .filter(
        (t) =>
          Math.floor(t.x / WILD_CELL) === cx &&
          Math.floor(t.z / WILD_CELL) === cz &&
          field.roadDistanceAt(t.x, t.z) >= 150,
      );
    const riparian = (x: number, z: number): boolean =>
      inStream(field.streams, x, z, RIPARIAN_BAND);
    // Out here every trunk is already 150 m from the nearest road, so the
    // only ground its skirt has to keep off is the water.
    const understory = {
      biome,
      rng: () => rng.next(),
      groundAt: heightAt,
      blocked: (x: number, z: number): boolean => inStream(field.streams, x, z, 1),
    };
    for (const tree of treesHere) {
      const rip = riparian(tree.x, tree.z);
      placements.push(treePlacement(tree, biome, rip));
      for (const plant of understoryAround(tree, rip, understory)) placements.push(plant);
    }

    // The soft small stuff between the trunks — a light app-side scatter.
    for (let i = 0; i < 45; i++) {
      const x = originX + rng.range(0, WILD_CELL);
      const z = originZ + rng.range(0, WILD_CELL);
      const roll = rng.next();
      const scale = rng.range(0.75, 1.35);
      const spin = rng.range(0, Math.PI * 2);
      if (!rng.chance(0.5 * density)) continue;
      if (field.roadDistanceAt(x, z) < 150) continue;
      if (inStream(field.streams, x, z, 1.5)) continue;
      const y = heightAt(x, z);
      if (y < LAKE_Y + 1.2) continue;
      const soft = softMix(
        mixAt(biome, { y, riparian: riparian(x, z), grove: field.groveAt(x, z) }),
      );
      if (!soft) continue;
      placements.push({ id: pickFlora(soft, roll), x, y, z, scale, spin });
    }
    // Ground cover out in the country. Thinner per square metre than the
    // road bands — nobody is doing 140 km/h past it — but not absent: a
    // wood with nothing on its floor reads as trees standing on a lawn
    // from any distance at all.
    for (let i = 0; i < 150; i++) {
      const x = originX + rng.range(0, WILD_CELL);
      const z = originZ + rng.range(0, WILD_CELL);
      const roll = rng.next();
      const scale = rng.range(0.7, 1.3);
      const spin = rng.range(0, Math.PI * 2);
      const community = communityAt(x, z);
      if (!rng.chance((biome.undergrowthDensity / 3) * (community.groundCover ?? 1) * density)) {
        continue;
      }
      if (field.roadDistanceAt(x, z) < 150) continue;
      if (inStream(field.streams, x, z, 0.5)) continue;
      const y = heightAt(x, z);
      if (y < LAKE_Y + 1.2) continue;
      placements.push({
        id: pickFlora(community.undergrowth ?? biome.undergrowth, roll),
        x,
        y,
        z,
        scale,
        spin,
      });
    }

    // The solid props. Each obstacle is drawn by the cell that OWNS its
    // position, so neighbouring cells never draw it twice.
    const obstacles = field
      .obstaclesNear(originX + WILD_CELL / 2, originZ + WILD_CELL / 2, WILD_CELL * 0.71)
      .filter((ob) => Math.floor(ob.x / WILD_CELL) === cx && Math.floor(ob.z / WILD_CELL) === cz);
    // The wooden ones are flora variants; the stone ones go into the
    // stone pool.
    const props = new Set<string>();
    for (const ob of obstacles) {
      const wooden = propPlacement(ob);
      if (!wooden) continue;
      props.add(propKey(ob.x, ob.z));
      placements.push(wooden);
    }
    return {
      plants: placements,
      stones: obstacles.filter((ob) => STONE_KINDS.has(ob.kind)),
      props,
    };
  };

  /** The circle a cell's contents fit inside — half a tile diagonal out
   * from its middle, with room for the trees standing on it. */
  const CELL_BOUND = WILD_CELL * 0.71 + 12;
  /** ...and how much wider that circle is for a cell ALREADY on screen, m.
   * The chase camera shakes, so a cell sitting exactly on the frustum edge
   * would otherwise cross it and back every frame — and every crossing
   * rewrites the whole pool. A cell has to leave by more than it came in
   * by. */
  const CELL_HOLD = 60;
  const seen = new THREE.Sphere(new THREE.Vector3(), CELL_BOUND);
  /** What the cull last handed the pool. The set is only pushed when it
   * CHANGES: rewriting every instance for a camera that has turned two
   * degrees is the cost this culling is meant to save. */
  let shown = "";
  /** The cells that answered yes last time — which ones get the wider
   * circle above. */
  let onScreen: ReadonlySet<string> = new Set();

  const sync = (carX: number, carZ: number): void => {
    const reach = Math.ceil(WILD_FAR / WILD_CELL);
    const ccx = Math.floor(carX / WILD_CELL);
    const ccz = Math.floor(carZ / WILD_CELL);
    const missing: { key: string; d: number }[] = [];
    const needed = new Set<string>();
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const centerX = (ccx + dx + 0.5) * WILD_CELL;
        const centerZ = (ccz + dz + 0.5) * WILD_CELL;
        const d = Math.hypot(centerX - carX, centerZ - carZ);
        if (d > WILD_FAR + WILD_CELL * 0.71) continue;
        const key = `${ccx + dx},${ccz + dz}`;
        needed.add(key);
        if (!cells.has(key)) missing.push({ key, d });
      }
    }
    missing.sort((a, b) => a.d - b.d);
    let moved = false;
    for (const { key } of missing.slice(0, WILD_BUDGET)) {
      const [cx, cz] = key.split(",").map(Number);
      const cell = buildCell(cx, cz);
      cells.set(key, cell);
      plants.plant(key, cell.plants);
      moved = true;
    }
    for (const key of [...cells.keys()]) {
      if (needed.has(key)) continue;
      cells.delete(key);
      plants.clear(key);
      moved = true;
    }
    if (!moved) return;
    flushStones();
    // The cells have changed under it, so whatever the cull last decided
    // no longer describes the ground: make it decide again.
    shown = "";
    onScreen = new Set();
  };

  /** Draw only the cells the camera is pointed at. */
  const cull = (frustums: readonly THREE.Frustum[]): void => {
    const visible = new Set<string>();
    for (const key of cells.keys()) {
      const [cx, cz] = key.split(",").map(Number);
      // Centred at treetop height so a cell just under the horizon keeps
      // the forest on it rather than being cut off at the ground.
      seen.center.set((cx + 0.5) * WILD_CELL, 8, (cz + 0.5) * WILD_CELL);
      seen.radius = onScreen.has(key) ? CELL_BOUND + CELL_HOLD : CELL_BOUND;
      if (frustums.some((frustum) => frustum.intersectsSphere(seen))) visible.add(key);
    }
    const signature = [...visible].sort().join(";");
    if (signature === shown) return;
    shown = signature;
    onScreen = visible;
    plants.show(visible);
  };

  const clearNear = (t: Track, from: number, to: number): void => {
    const hits = (x: number, z: number): boolean => {
      for (let i = from; i < to; i += 2) {
        const dx = x - t.samples[i].x;
        const dz = z - t.samples[i].z;
        if (dx * dx + dz * dz < 12 * 12) return true;
      }
      return false;
    };
    // An engine prop goes when the ENGINE drops it — road built later has
    // claimed the ground it stood on and its field stopped placing it.
    // Asking the field beats guessing at a radius: a stone still solid but
    // no longer drawn is exactly the bug the props were moved to fix.
    const gone = (x: number, z: number): boolean =>
      !field.obstaclesNear(x, z, 0.5).some((ob) => ob.x === x && ob.z === z);
    let movedStones = false;
    for (const [key, cell] of cells) {
      const retire = (x: number, z: number): boolean =>
        cell.props.has(propKey(x, z)) ? gone(x, z) : hits(x, z);
      const kept = cell.plants.filter((p) => !retire(p.x, p.z));
      if (kept.length !== cell.plants.length) {
        cell.plants = kept;
        plants.plant(key, kept);
      }
      const standing = cell.stones.filter((ob) => !gone(ob.x, ob.z));
      if (standing.length === cell.stones.length) continue;
      cell.stones = standing;
      movedStones = true;
    }
    if (movedStones) flushStones();
  };

  /** The engine felled the prop standing here: drop it out of whichever
   * cell drew it, in both pools. A cell is only re-planted if it actually
   * held the thing, so driving through a forest costs one rewrite per
   * trunk that went down, not one per trunk in sight. */
  const retireAt = (x: number, z: number): void => {
    for (const [key, cell] of cells) {
      const kept = cell.plants.filter((p) => !samePlace(p.x, p.z, x, z));
      if (kept.length !== cell.plants.length) {
        cell.plants = kept;
        plants.plant(key, kept);
      }
      const standing = cell.stones.filter((ob) => !samePlace(ob.x, ob.z, x, z));
      if (standing.length === cell.stones.length) continue;
      cell.stones = standing;
      flushStones();
    }
  };

  const dispose = (): void => {
    plants.dispose();
    stoneMesh?.dispose();
    mossMesh?.dispose();
    stoneGeo.dispose();
    mossGeo.dispose();
    stoneMat.dispose();
    mossMat.dispose();
  };

  return { group, sync, cull, clearNear, retireAt, dispose };
}
