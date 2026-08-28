// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the 3D world for one stage: the road ribbon with its red/white
// edge strips and dirt skirts, the fords and the streams that feed them,
// the biome's forest and ground cover (flora.ts), the stone litter under
// the wheels, jump cones, and the start/finish gates. Everything the car
// can HIT — trunks, boulders, rocks, stumps, bedrock outcrops — is placed
// by the engine and only DRAWN here (see buildWild). Everything is low-poly,
// vertex-colored, and Lambert-lit — the environment module's hemisphere +
// sun set the mood, the chunky speckle textures keep the arcade grain — and
// everything derives from the same compiled track samples the physics
// reads. The world is built in CHUNKS of road: a finite stage is one chunk
// built up front; an endless stage keeps building chunks ahead of the car
// and dropping them behind it.

import * as THREE from "three";
import {
  GROVES,
  STAGE_RULES,
  createRng,
  inStream,
  junctionPlatformY,
  type GameState,
  type Spur,
  type Track,
  type WildObstacle,
  SOLID_PROP_HEIGHT,
} from "@engine";

import { biomeFor, type Biome, type Community, type FloraMix } from "./biome.ts";
import { buildFlora, type Flora, type FloraPlacement } from "./flora.ts";
import { buildTerrain, LAKE_Y, type Terrain } from "./terrain.ts";
import { buildStreamMeshes } from "./streams.ts";
import { chevronTexture, gravelTexture, waterTexture } from "./textures.ts";
import { buildFinishGate, buildStartGate, type FinishGate, type Muzzle } from "./finish-gate.ts";
import { buildKerbing } from "./kerbs.ts";
import { buildCrowd, type Crowd } from "./crowd.ts";
import { rightOf } from "./ribbon.ts";
import {
  ROAD_PAINT,
  buildChippings,
  buildFords,
  buildMarkings,
  buildRoad,
  buildSkirts,
  chunkSamples,
} from "./road-mesh.ts";

const UP = new THREE.Vector3(0, 1, 0);

/** The stone litter the renderer is allowed to scatter for itself: lumps
 * squashed flat and sunk a third in, so a lump of scale `s` tops out at
 * 1.05 s. The biggest of them stays a hair under the engine's solid bar —
 * nothing drawn app-side is ever something the car should have hit. */
const PEBBLE_MAX = (SOLID_PROP_HEIGHT / 1.05) * 0.95;
const PEBBLE_MIN = PEBBLE_MAX * 0.35;

/** Endless: unbuilt samples accumulate to this count before a chunk is cut
 * (2 m samples → 200 m of road), and chunks fully this far behind the car
 * are dropped. The engine's stream horizon minus the batch keeps the built
 * road comfortably past the fog ceiling. */
const CHUNK_SAMPLES = 100;
const PRUNE_BEHIND = 450;
/** Road raised in one go at most, samples (2 m each → 300 m). A whole
 * stage's road, its markings and everything planted along it is the best
 * part of a second of work: raised in one hit it freezes the app — the
 * music stalls, the map stops turning, and a dial the player only nudged
 * costs them a beat. Raised a slice a frame it costs a frame each, and the
 * stage GROWS IN instead. */
const BUILD_SLICE = 150;
/** ...and how much of that a single frame gets through at 60 fps: three
 * terrain tiles and one slice of road. Both scale with the frame's own
 * length (see `pace`), so a machine drawing at 6 fps works through six
 * times as much per frame rather than taking ten times as long. */
const BUILD_TILES = 3;
const BUILD_SLICES = 1;
/** How many frames' worth of building this frame is allowed, from how long
 * it took. Capped, so one long stall (a tab coming back) does not cash in
 * a whole stage's build on the frame after it. */
function pace(dt: number): number {
  return Math.min(8, Math.max(1, Math.round(dt * 60)));
}

/** The community a grove-quilt index names — the quilt itself lives in the
 * ENGINE's terrain field now (terrain.field.groveAt), because the trunks it
 * places are solid; the biome only supplies what grows in each patch. */
function communityByGrove(biome: Biome, grove: number): Community {
  const id = GROVES[grove]?.id;
  return biome.communities.find((c) => c.id === id) ?? biome.communities[0];
}

/** Brush the car drives THROUGH: the only flora still planted app-side,
 * because nothing about it stands over the middle of the hood. Everything
 * else that reads as solid — trunks, stumps, fallen logs — comes from the
 * engine's prop fields, where the physics can collide with it. */
const SOFT_FLORA = new Set(["heathShrub", "juniper", "willowShrub"]);

/** ...and what a solid TRUNK may never be dressed as: the brush above plus
 * the dead wood the engine plants as props of its own. */
const NOT_A_TRUNK = new Set([...SOFT_FLORA, "stump", "fallenLog"]);

/** A mix stripped to the species that read as solid trees (falls back to
 * the whole mix if nothing tall grows there). */
function solidMix(mix: FloraMix): FloraMix {
  const out: FloraMix = {};
  for (const id in mix) if (!NOT_A_TRUNK.has(id)) out[id] = mix[id];
  return Object.keys(out).length > 0 ? out : mix;
}

/** ...and the complement: the low soft stuff of a community's tree mix. */
function softMix(mix: FloraMix): FloraMix | null {
  const out: FloraMix = {};
  for (const id in mix) if (SOFT_FLORA.has(id)) out[id] = mix[id];
  return Object.keys(out).length > 0 ? out : null;
}

/** Dress one engine trunk as the tree the biome grows there. The engine
 * owns WHERE a solid tree stands and how thick its trunk is; which species
 * it IS stays the biome's call — with the same overrides as ever: willow
 * and birch crowd the shores, only the tough survive the high bedrock. */
function treePlacement(tree: WildObstacle, biome: Biome): FloraPlacement {
  let mix: FloraMix;
  if (tree.y < LAKE_Y + 4) mix = biome.lakeshoreTrees;
  else if (tree.y > 26) mix = biome.highlandTrees;
  else mix = communityByGrove(biome, tree.grove ?? 0).trees;
  return {
    id: pickFlora(solidMix(mix), tree.roll ?? 0),
    x: tree.x,
    y: tree.y,
    z: tree.z,
    scale: tree.size,
    spin: tree.spin,
  };
}

/** Draw one flora variant id from a weighted mix. */
function pickFlora(mix: FloraMix, roll: number): string {
  let total = 0;
  for (const id in mix) total += mix[id];
  let t = roll * total;
  let last = "";
  for (const id in mix) {
    last = id;
    t -= mix[id];
    if (t <= 0) return id;
  }
  return last;
}

type SceneryChunk = {
  group: THREE.Group;
  update: (dt: number) => void;
  /** Zero out any prop the newly built road now runs through. */
  clearNear: (track: Track, from: number, to: number) => void;
  /** The engine trunks this chunk drew — released when the chunk drops so
   * the ownership set stays bounded on an endless run. */
  treeKeys: string[];
};

/** The living landscape for one chunk of road: the biome's forest scattered
 * over the hills, a ground-cover band hugging the verge, and the loose
 * stone litter the wheels ride over. Placement is
 * seeded by the track seed and chunk, validated against the road built so
 * far (aprons included) and the stream valleys, and everything stands on
 * the terrain height under it. On an endless run the road ahead is still
 * unwritten — `clearNear` retires props that later road claims. */
function buildScenery(
  track: Track,
  biome: Biome,
  terrain: Terrain,
  from: number,
  to: number,
  guard: Track["samples"],
  drawnTrees: Set<string>,
  density: number,
): SceneryChunk {
  const group = new THREE.Group();
  const rng = createRng((track.seed ^ 0x5f356495 ^ Math.imul(from, 2246822519)) >>> 0);
  const samples = track.samples;
  const half = track.width / 2;
  const clearance = half + 3.5;
  const heightAt = terrain.heightAt;
  const field = terrain.field;

  const communityAt = (x: number, z: number): Community =>
    communityByGrove(biome, field.groveAt(x, z));

  // Clearance checks walk the guard samples — the chunk's own road with
  // its aprons plus a margin of neighbours — so nothing grows on the road,
  // the start run-up, or the finish run-off.
  const clearOfRoad = (x: number, z: number, r: number): boolean => {
    for (let i = 0; i < guard.length; i += 4) {
      const dx = x - guard[i].x;
      const dz = z - guard[i].z;
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  };

  const flora: FloraPlacement[] = [];
  const treeKeys: string[] = [];

  // ── The forest: the ENGINE's trunk field, drawn exactly where the
  // physics collides — the band within 150 m of the road belongs to the
  // road chunks, the deeper wild to the wild cells. Ownership over chunk
  // seams is settled by the shared `drawnTrees` set.
  const collectTrees = (x: number, z: number): void => {
    for (const tree of field.treesNear(x, z, 190)) {
      if (field.roadDistanceAt(tree.x, tree.z) >= 150) continue;
      const key = `${tree.x.toFixed(1)},${tree.z.toFixed(1)}`;
      if (drawnTrees.has(key)) continue;
      drawnTrees.add(key);
      treeKeys.push(key);
      flora.push(treePlacement(tree, biome));
    }
  };
  for (let i = Math.max(0, from); i < to; i += 50) collectTrees(samples[i].x, samples[i].z);
  collectTrees(samples[to - 1].x, samples[to - 1].z);

  // ── The soft small stuff between the trunks — stumps, junipers, willow
  // shrubs: driven over, not into, so it stays an app-side scatter.
  for (let i = Math.max(4, from); i < to; i += 6) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const side = rng.chance(0.5) ? 1 : -1;
    const offset = rng.range(clearance + 1, 44);
    const jitter = rng.range(-3, 3);
    const x = s.x + r.x * offset * side + jitter;
    const z = s.z + r.z * offset * side + jitter;
    const roll = rng.next();
    const scale = rng.range(0.75, 1.35);
    const spin = rng.range(0, Math.PI * 2);
    if (!rng.chance(0.4 * density)) continue;
    if (!clearOfRoad(x, z, clearance)) continue;
    if (inStream(field.streams, x, z, 1.5)) continue;
    const y = heightAt(x, z);
    if (y < LAKE_Y + 1.2) continue;
    const soft = softMix(
      y < LAKE_Y + 4
        ? biome.lakeshoreTrees
        : y > 26
          ? biome.highlandTrees
          : communityAt(x, z).trees,
    );
    if (!soft) continue;
    flora.push({ id: pickFlora(soft, roll), x, y, z, scale, spin });
  }

  // ── Ground cover: a dense strip just past the shoulder (what the car
  // actually sees at speed), and a sparser scatter under the treeline —
  // each clump drawn from its community's mix, so meadows fill with tall
  // grass and spruce woods with ferns.
  for (let i = Math.max(4, from); i < to; i += 2) {
    const s = samples[i];
    const r = rightOf(s.heading);
    for (const band of [0, 1]) {
      const side = rng.chance(0.5) ? 1 : -1;
      const offset =
        band === 0 ? rng.range(half + 1.6, clearance + 5) : rng.range(clearance + 5, 34);
      const x = s.x + r.x * offset * side + rng.range(-2, 2);
      const z = s.z + r.z * offset * side + rng.range(-2, 2);
      const roll = rng.next();
      const scale = rng.range(0.7, 1.3);
      const spin = rng.range(0, Math.PI * 2);
      const community = communityAt(x, z);
      const chance = (biome.undergrowthDensity / 2) * (community.groundCover ?? 1) * density;
      if (!rng.chance(chance)) continue;
      if (!clearOfRoad(x, z, half + 1.2)) continue;
      if (inStream(terrain.field.streams, x, z, 0.5)) continue;
      const y = heightAt(x, z);
      if (y < LAKE_Y + 1.2) continue;
      flora.push({
        id: pickFlora(community.undergrowth ?? biome.undergrowth, roll),
        x,
        y,
        z,
        scale,
        spin,
      });
    }
  }

  const planted = buildFlora(flora, () => rng.next());
  group.add(planted.group);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  // ── Stone litter: the pebbles and cobbles the ground sheds, scattered
  // right up to the shoulder. Every one of them stays UNDER the middle of
  // the hood (SOLID_PROP_HEIGHT), which is what makes them safe to plant
  // app-side — the car rides straight over them. Anything a driver could
  // hit is a prop the engine placed, drawn by the wild cells.
  type Rock = { x: number; y: number; z: number; s: number };
  const rocks: Rock[] = [];
  for (let i = Math.max(4, from); i < to; i += 5) {
    const s = samples[i];
    const r = rightOf(s.heading);
    const side = rng.chance(0.5) ? 1 : -1;
    const offset = rng.range(half + 1.5, 60);
    const x = s.x + r.x * offset * side + rng.range(-3, 3);
    const z = s.z + r.z * offset * side + rng.range(-3, 3);
    const drop = rng.next();
    if (!clearOfRoad(x, z, half + 1.2)) continue;
    if (inStream(terrain.field.streams, x, z, 0.5)) continue;
    const y = heightAt(x, z);
    if (y < LAKE_Y + 1.2) continue;
    rocks.push({ x, y, z, s: drop });
  }
  const rockGeo = new THREE.DodecahedronGeometry(1);
  const rockMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(biome.ground.bedrock) });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, rocks.length));
  rockMesh.count = rocks.length;
  const tint = new THREE.Color();
  const mossy = new THREE.Color(0x87a05a);
  rocks.forEach((p, i) => {
    // A squashed lump sunk a third in: its top sits at 1.05 × scale, so
    // the biggest of them still passes under the bumper.
    const scale = PEBBLE_MIN + p.s * (PEBBLE_MAX - PEBBLE_MIN);
    q.setFromAxisAngle(UP, p.s * 20);
    m.compose(v.set(p.x, p.y + scale * 0.35, p.z), q, sc.set(scale, scale * 0.7, scale));
    rockMesh.setMatrixAt(i, m);
    // Every third stone carries a mossy cast; the rest vary in grey.
    tint.setScalar(0.8 + p.s * 0.35);
    if (i % 3 === 0) tint.lerp(mossy, 0.5);
    rockMesh.setColorAt(i, tint);
  });
  group.add(rockMesh);

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const clearNear = (t: Track, nFrom: number, nTo: number): void => {
    const reach = (clearance + 2) * (clearance + 2);
    const hits = (x: number, z: number): boolean => {
      for (let i = nFrom; i < nTo; i += 2) {
        const dx = x - t.samples[i].x;
        const dz = z - t.samples[i].z;
        if (dx * dx + dz * dz < reach) return true;
      }
      return false;
    };
    planted.retire(hits);
    let touched = false;
    rocks.forEach((p, i) => {
      if (!hits(p.x, p.z)) return;
      rockMesh.setMatrixAt(i, zero);
      touched = true;
    });
    if (touched) rockMesh.instanceMatrix.needsUpdate = true;
  };

  return { group, update: planted.update, clearNear, treeKeys };
}

/** Everything that carries a bridge deck over its water (R13): the parapet
 * you must not go over, and — since the whole point of a bridge is that
 * there is a hole under it — the structure that holds it up. A timber
 * crossing is two trunks and a plank floor on pile bents; a concrete one
 * is a slab on piers. Which you get was decided by the span back in the
 * generator; this only builds what that decision implies. */
function buildBridges(track: Track, from: number, to: number): THREE.Group {
  const group = new THREE.Group();
  const samples = track.samples;
  const half = track.width / 2;
  const timber = new THREE.MeshLambertMaterial({ color: "#6b4f33" });
  const timberDark = new THREE.MeshLambertMaterial({ color: "#523c26" });
  const concrete = new THREE.MeshLambertMaterial({ color: "#b3b0a6" });
  const concreteDark = new THREE.MeshLambertMaterial({ color: "#8f8c83" });

  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    spin: number,
    mat: THREE.Material,
  ): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = spin;
    group.add(mesh);
  };

  let i = Math.max(1, from);
  while (i < to) {
    if (samples[i].deck == null) {
      i++;
      continue;
    }
    let j = i;
    while (j < samples.length && samples[j].deck !== null) j++;
    if (j >= to && to < samples.length) break; // straddles the frontier — defer
    const kind = samples[i].deck;
    const rail = kind === "concrete" ? concrete : timber;
    const under = kind === "concrete" ? concreteDark : timberDark;
    const deckY = samples[Math.floor((i + j) / 2)].elevation;
    const waterY = deckY - STAGE_RULES.bridge.clearance[kind ?? "timber"];
    // The parapet: a solid concrete wall, or a timber rail on posts.
    for (const side of [-1, 1]) {
      for (let k = i; k < j; k++) {
        const s = samples[k];
        const r = rightOf(s.heading);
        const lat = (half + 0.35) * side;
        const x = s.x + r.x * lat;
        const z = s.z + r.z * lat;
        if (kind === "concrete") {
          if (k % 2 !== 0) continue;
          box(0.4, 0.9, 4.2, x, s.elevation + 0.45, z, s.heading, rail);
        } else {
          if (k % 3 === 0) box(0.22, 1.1, 0.22, x, s.elevation + 0.55, z, s.heading, under);
          if (k % 2 === 0) box(0.16, 0.16, 4.2, x, s.elevation + 0.95, z, s.heading, rail);
        }
      }
    }
    // What holds it up. The deck itself is the road ribbon; this is the
    // beam under it, the piers down into the water, and the abutments the
    // banks carry.
    const mid = samples[Math.floor((i + j) / 2)];
    const span = samples[j - 1].s - samples[i].s;
    for (const end of [i, j - 1]) {
      const s = samples[end];
      box(track.width + 1.6, 1.6, 3, s.x, s.elevation - 0.9, s.z, s.heading, under);
    }
    if (kind === "concrete") {
      for (let k = i; k < j; k += 2) {
        const s = samples[k];
        box(track.width + 0.6, 0.55, 4.2, s.x, s.elevation - 0.3, s.z, s.heading, under);
      }
      const piers = Math.max(1, Math.round(span / 22));
      for (let p = 1; p <= piers; p++) {
        const s = samples[Math.round(i + ((j - i) * p) / (piers + 1))];
        const drop = s.elevation - waterY + 1.6;
        box(2.4, drop, 1.4, s.x, s.elevation - drop / 2 - 0.5, s.z, s.heading, concreteDark);
      }
    } else {
      // Two trunks the length of the span, and a pile bent under the middle.
      for (const side of [-1, 1]) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, span, 7), under);
        const r = rightOf(mid.heading);
        beam.position.set(
          mid.x + r.x * half * 0.55 * side,
          mid.elevation - 0.55,
          mid.z + r.z * half * 0.55 * side,
        );
        // A cylinder stands on +Y; tip it onto +Z, then swing it round to
        // the road's heading (YXZ applies the swing last).
        beam.rotation.order = "YXZ";
        beam.rotation.set(Math.PI / 2, mid.heading, 0);
        group.add(beam);
      }
      const drop = mid.elevation - waterY + 1.4;
      for (const side of [-1, 1]) {
        const r = rightOf(mid.heading);
        box(
          0.4,
          drop,
          0.4,
          mid.x + r.x * half * 0.5 * side,
          mid.elevation - drop / 2 - 0.7,
          mid.z + r.z * half * 0.5 * side,
          mid.heading,
          under,
        );
      }
    }
    i = j;
  }
  return group;
}

/** An abandoned branch (R17), drawn like any other road — and the junction
 * dressing that says the stage does not go this way: a line of cones, tape
 * between two posts, and a chevron board facing whoever arrives. Nothing
 * here is solid. A player who wants to see where the road goes is allowed
 * to find out; the tape is a statement, not a wall. */
function buildSpur(track: Track, spur: Spur): THREE.Group {
  const group = new THREE.Group();
  group.add(buildSkirts(spur.samples, spur.width));
  // A hair under the stage's own mat: inside a junction the two are warped
  // onto the SAME plane (R17), and two coplanar meshes tear each other
  // apart in the depth buffer.
  group.add(buildRoad(track, spur.samples, spur.width, 0.012));
  group.add(buildMarkings(track, spur.samples, spur.width));
  const chippings = buildChippings(track, spur.samples, spur.width);
  if (chippings) group.add(chippings);

  // The block, standing just clear of the junction's own platform — where
  // a marshal would put it, and where it is not buried under the crossing.
  const at =
    spur.samples.find((sample) => sample.flat <= 0) ?? spur.samples[spur.samples.length - 1];
  const r = rightOf(at.heading);
  const half = spur.width / 2;
  const coneGeo = new THREE.ConeGeometry(0.42, 1, 6);
  const coneMat = new THREE.MeshLambertMaterial({ color: "#ff7d1f" });
  for (let k = -2; k <= 2; k++) {
    const lat = (k / 2.4) * half;
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(at.x + r.x * lat, at.elevation + 0.5, at.z + r.z * lat);
    group.add(cone);
  }
  const postMat = new THREE.MeshLambertMaterial({ color: "#f6f3ea" });
  const tapeMat = new THREE.MeshLambertMaterial({ color: "#e23c2c" });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), postMat);
    post.position.set(at.x + r.x * half * side, at.elevation + 0.8, at.z + r.z * half * side);
    group.add(post);
  }
  const tape = new THREE.Mesh(new THREE.BoxGeometry(spur.width, 0.18, 0.06), tapeMat);
  tape.position.set(at.x, at.elevation + 1.25, at.z);
  tape.rotation.y = at.heading;
  group.add(tape);
  // The board: chevrons pointing back the way the stage actually goes.
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.12), [
    postMat,
    postMat,
    postMat,
    postMat,
    new THREE.MeshLambertMaterial({ map: chevronTexture(), color: "#ffffff" }),
    new THREE.MeshLambertMaterial({ map: chevronTexture(), color: "#ffffff" }),
  ]);
  board.position.set(at.x, at.elevation + 1.9, at.z);
  board.rotation.y = at.heading;
  group.add(board);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), postMat);
    leg.position.set(at.x + r.x * side, at.elevation + 0.95, at.z + r.z * side);
    group.add(leg);
  }
  return group;
}

/** R17 — the junction paving. The two carriageways already cover the
 * ground where they overlap; what they cannot cover is the wedge between
 * them where the corner has just pulled them apart, and a junction that
 * ends in a knife edge of grass driven to a point is the tell that nobody
 * planned it. So this lays the gore nose: pavement carried out to where
 * the gap has opened enough to be an island, on the junction's own graded
 * plane, and no further. */
function buildJunctions(track: Track, from: number, to: number): THREE.Group {
  const group = new THREE.Group();
  const fromS = from === 0 ? -Infinity : track.samples[from].s;
  const toS = track.samples[to - 1].s;
  const mat = new THREE.MeshLambertMaterial({
    map: gravelTexture(),
    color: new THREE.Color(ROAD_PAINT.asphalt.worn),
    side: THREE.DoubleSide,
  });
  for (const junction of track.junctions) {
    if (junction.s < fromS || junction.s > toS) continue;
    for (const quad of junction.gore) {
      const positions: number[] = [];
      const uvs: number[] = [];
      for (const [x, z] of quad) {
        positions.push(x, junctionPlatformY(junction, x, z) + 0.03, z);
        uvs.push(x / 3.5, z / 3.5);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      group.add(new THREE.Mesh(geo, mat));
    }
  }
  return group;
}

/** Warning cones flanking each jump lip in the range. */
function buildCones(track: Track, from: number, to: number): THREE.Group {
  const group = new THREE.Group();
  const half = track.width / 2;
  const coneGeo = new THREE.ConeGeometry(0.45, 1.1, 6);
  const coneMat = new THREE.MeshLambertMaterial({ color: "#ff7d1f" });
  for (let i = from; i < to; i++) {
    const s = track.samples[i];
    if (!s.jump) continue;
    const r = rightOf(s.heading);
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(
        s.x + r.x * (half + 0.8) * side,
        s.elevation + 0.55,
        s.z + r.z * (half + 0.8) * side,
      );
      group.add(cone);
    }
  }
  return group;
}

export type World = {
  group: THREE.Group;
  /** Advance everything that moves on its own. The focus point is the car:
   * R26's crowd only animates the stands near it. */
  update: (dt: number, focusX: number, focusZ: number) => void;
  /** Catch the world up with the track and the car, one frame's worth at a
   * time: raise the road still owed, build the ground the car and the
   * corridor now need, and — on an endless stage — drop what is behind.
   * `dt` is the frame's own length, which is how much of the outstanding
   * work this call takes on. */
  sync: (state: GameState, dt: number) => void;
  /** R22 — where the finish's cannons point, for the renderer to fire.
   * Empty until the chunk carrying the finish gate is built, and on an
   * endless stage forever: nothing there ever finishes. */
  muzzles: () => Muzzle[];
  dispose: () => void;
};

/** Cell edge for the wild's scenery, m (the terrain's tile grid). */
const WILD_CELL = 224;
/** Wild cells dressed within this range of the car, m. */
const WILD_FAR = 430;
/** The prop kinds drawn as instanced rock — everything the ground made of
 * stone. The wooden ones (fallen trunks, cut stumps) go through flora. */
const STONE_KINDS = new Set<WildObstacle["kind"]>(["boulder", "rock", "slab"]);

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

type WildCell = {
  group: THREE.Group;
  flora: Flora;
  stones: { mesh: THREE.InstancedMesh; list: WildObstacle[] } | null;
  /** Which of this cell's plants are ENGINE props rather than app-side
   * dressing, by position — they are retired on the engine's word, not on
   * a radius of our own. */
  props: Set<string>;
};

/** A prop's position as a key both sides agree on. */
function propKey(x: number, z: number): string {
  return `${x.toFixed(2)},${z.toFixed(2)}`;
}

type Wild = {
  group: THREE.Group;
  sync: (carX: number, carZ: number) => void;
  update: (dt: number) => void;
  /** Retire wild props that newly built road now runs through. */
  clearNear: (t: Track, from: number, to: number) => void;
};

/** The wild: the living landscape beyond the road bands' 150 m — the
 * nature an exploring car actually drives through. Cells on the terrain's
 * tile grid stream in around the CAR (wherever it is, road or not), each
 * planting the same biome quilt the road bands plant, thinner — plus the
 * engine terrain's solid props, drawn exactly where the physics collides
 * with them: the wooden ones (fallen trunks, cut stumps) join the flora
 * instancing, the stone ones (boulders, rocks, outcrops) share one
 * instanced rock. Deterministic per seed and cell. */
function buildWild(track: Track, biome: Biome, terrain: Terrain, density: number): Wild {
  const group = new THREE.Group();
  const communityAt = (x: number, z: number): Community =>
    communityByGrove(biome, terrain.field.groveAt(x, z));
  const cells = new Map<string, WildCell>();
  const heightAt = terrain.heightAt;
  const field = terrain.field;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();

  const buildCell = (cx: number, cz: number): WildCell => {
    const cellGroup = new THREE.Group();
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
    for (const tree of treesHere) placements.push(treePlacement(tree, biome));

    // The soft small stuff between the trunks — a light app-side scatter.
    for (let i = 0; i < 14; i++) {
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
        y < LAKE_Y + 4
          ? biome.lakeshoreTrees
          : y > 26
            ? biome.highlandTrees
            : communityAt(x, z).trees,
      );
      if (!soft) continue;
      placements.push({ id: pickFlora(soft, roll), x, y, z, scale, spin });
    }
    // Ground cover barely reads at exploring pace — a light scatter.
    for (let i = 0; i < 20; i++) {
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
    // The wooden ones are flora variants; the stone ones share one
    // instanced rock below.
    const props = new Set<string>();
    for (const ob of obstacles) {
      const id = ob.kind === "log" ? "fallenLog" : ob.kind === "stump" ? "stump" : null;
      if (!id) continue;
      props.add(propKey(ob.x, ob.z));
      placements.push({ id, x: ob.x, y: ob.y, z: ob.z, scale: ob.size, spin: ob.spin });
    }
    const flora = buildFlora(placements, () => rng.next());
    cellGroup.add(flora.group);

    const stoneList = obstacles.filter((ob) => STONE_KINDS.has(ob.kind));
    let stones: WildCell["stones"] = null;
    if (stoneList.length > 0) {
      const geo = new THREE.DodecahedronGeometry(1);
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(biome.ground.bedrock) });
      const mesh = new THREE.InstancedMesh(geo, mat, stoneList.length);
      const dark = new THREE.Color(biome.ground.bedrockDark);
      stoneList.forEach((ob, i) => {
        q.setFromAxisAngle(UP, ob.spin);
        stoneMatrix(ob, m, q, v, sc);
        mesh.setMatrixAt(i, m);
        tint.setScalar(0.75 + (ob.spin % 1) * 0.35);
        // An outcrop is the bedrock itself showing through, not a stone
        // that rolled here: it takes the darker face.
        if (ob.kind === "slab") tint.lerp(dark, 0.6);
        mesh.setColorAt(i, tint);
      });
      cellGroup.add(mesh);
      stones = { mesh, list: stoneList };
    }
    group.add(cellGroup);
    return { group: cellGroup, flora, stones, props };
  };

  const dropCell = (key: string): void => {
    const cell = cells.get(key);
    if (!cell) return;
    cells.delete(key);
    group.remove(cell.group);
    disposeGroup(cell.group);
  };

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
    for (const { key } of missing.slice(0, WILD_BUDGET)) {
      const [cx, cz] = key.split(",").map(Number);
      cells.set(key, buildCell(cx, cz));
    }
    for (const key of [...cells.keys()]) {
      if (!needed.has(key)) dropCell(key);
    }
  };

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
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
    for (const cell of cells.values()) {
      cell.flora.retire((x, z) => (cell.props.has(propKey(x, z)) ? gone(x, z) : hits(x, z)));
      if (!cell.stones) continue;
      let touched = false;
      cell.stones.list.forEach((ob, i) => {
        if (!gone(ob.x, ob.z)) return;
        cell.stones?.mesh.setMatrixAt(i, zero);
        touched = true;
      });
      if (touched) cell.stones.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const update = (dt: number): void => {
    for (const cell of cells.values()) cell.flora.update(dt);
  };

  return { group, sync, update, clearNear };
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshLambertMaterial || mat instanceof THREE.MeshPhongMaterial) {
          mat.map?.dispose();
        }
        mat.dispose();
      }
    }
  });
}

/** How thickly the world is planted, as a multiple of the biome's own
 * scatter chances. The video options set it; the ENGINE's trunk field is
 * never thinned by it, because those trees are solid and one you can hit
 * but cannot see is worse than any frame it would buy. */
export function buildWorld(track: Track, density = 1): World {
  const group = new THREE.Group();
  const biome = biomeFor();
  const waterTex = waterTexture();
  const terrain = buildTerrain(track, biome, waterTex);
  group.add(terrain.group);
  terrain.sync(track, 0, track.samples[0].x, track.samples[0].z);
  // A finite stage's road is known in full before the first tree is planted,
  // so every slice keeps its scenery off ALL of it. An endless one cannot:
  // the road ahead is unwritten when the props beside it go in, and
  // `clearNear` is what retires the ones it later claims.
  const fullGuard = track.endless ? null : chunkSamples(track, 0, track.samples.length);
  const wild = buildWild(track, biome, terrain, density);
  group.add(wild.group);
  wild.sync(track.samples[0].x, track.samples[0].z);

  type Chunk = { toS: number; group: THREE.Group; scenery: SceneryChunk };
  const chunks: Chunk[] = [];
  /** Engine trunks already drawn by some scenery chunk — chunk queries
   * overlap at the seams, and a tree drawn twice z-fights itself. */
  const drawnTrees = new Set<string>();
  let builtIndex = 0;
  let fordScan = 0;
  let streamScanS = 0;
  let spurScan = 0;
  let finish: FinishGate | null = null;
  /** R26 — the crowd, rebuilt whenever the stage grows a new stand. The
   * whole crowd is a handful of instanced meshes, so it is cheaper to
   * rebuild it than to grow one. */
  let crowd: Crowd | null = null;
  let standCount = 0;

  const buildChunk = (from: number, to: number): void => {
    const chunkGroup = new THREE.Group();
    const ribbon = chunkSamples(track, from, to);
    const bare = track.samples.slice(Math.max(0, from - 1), to);
    chunkGroup.add(buildSkirts(ribbon, track.width));
    chunkGroup.add(buildRoad(track, ribbon, track.width));
    chunkGroup.add(buildMarkings(track, bare, track.width));
    // R25 — the rally's own red and white, at the corners that earn it.
    chunkGroup.add(buildKerbing(track, bare, track.width));
    const chippings = buildChippings(track, bare, track.width);
    if (chippings) chunkGroup.add(chippings);
    chunkGroup.add(buildBridges(track, from, to));
    chunkGroup.add(buildJunctions(track, from, to));
    // The branches this stretch of road forks off at its paving junctions.
    for (; spurScan < track.spurs.length; spurScan++) {
      const spur = track.spurs[spurScan];
      if (spur.atS > track.samples[to - 1].s) break;
      chunkGroup.add(buildSpur(track, spur));
    }
    const fords = buildFords(track, fordScan, to, waterTex);
    fordScan = fords.next;
    chunkGroup.add(fords.group);
    const toS = track.samples[to - 1].s;
    const fresh = terrain.field.streams.filter((s) => s.centerS >= streamScanS && s.centerS < toS);
    if (fresh.length > 0) chunkGroup.add(buildStreamMeshes(fresh, waterTex));
    streamScanS = toS;
    // The clearance guard: the whole road where it is known, and otherwise
    // this chunk's aproned ribbon plus a margin of neighbouring road so
    // props keep off the seams too.
    const guard = fullGuard ?? [
      ...ribbon,
      ...track.samples.slice(Math.max(0, from - 120), Math.max(0, from - 1)),
      ...track.samples.slice(to, Math.min(track.samples.length, to + 120)),
    ];
    const scenery = buildScenery(track, biome, terrain, from, to, guard, drawnTrees, density);
    chunkGroup.add(scenery.group);
    chunkGroup.add(buildCones(track, from, to));
    // A circuit's start line IS its finish line (R22), so it gets one gate
    // saying so rather than two ten metres apart.
    if (from === 0 && !track.circuit) chunkGroup.add(buildStartGate(track, 2));
    // R25 — the finish GATE, which on a sprint is no longer the last thing
    // on the road: the run-out carries on past it, and this chunk draws
    // both. The cannons stand beside it either way.
    if (!track.endless && to === track.samples.length) {
      finish = buildFinishGate(track, track.circuit ? "START/FINISH" : "FINISH");
      chunkGroup.add(finish.group);
    }
    group.add(chunkGroup);
    chunks.push({ toS, group: chunkGroup, scenery });
  };

  /** R26 — (re)build the people. The stands come from the terrain field,
   * which places them against the world as the road commits, so this runs
   * whenever that list has grown. */
  const buildPeople = (): void => {
    const stands = terrain.field.stands;
    if (stands.length === standCount) return;
    standCount = stands.length;
    if (crowd) {
      group.remove(crowd.group);
      disposeGroup(crowd.group);
      crowd.dispose();
    }
    crowd = buildCrowd(stands, terrain.field.groundAt, density);
    group.add(crowd.group);
  };

  /** Raise the next slice of road, if any is owed. The start line comes up
   * with the world so there is something to stand on; the rest arrives over
   * the frames after it. */
  const raiseSlice = (): boolean => {
    const len = track.samples.length;
    if (builtIndex >= len) return false;
    const from = builtIndex;
    const to = Math.min(len, from + BUILD_SLICE);
    buildChunk(from, to);
    builtIndex = to;
    // Road that has just come into being on an endless stage may run through
    // props planted when it did not exist yet — retire them before anyone
    // sees it. A finite stage's props were kept off it in the first place.
    if (track.endless) {
      for (const chunk of chunks) chunk.scenery.clearNear(track, from, to);
      wild.clearNear(track, from, to);
    }
    return true;
  };

  raiseSlice();
  buildPeople();

  const sync = (state: GameState, dt: number): void => {
    const rate = pace(dt);
    // The ground and the wild follow the CAR — on a finite stage too, so
    // an excursion far off the corridor still stands on drawn land.
    terrain.sync(track, state.progressS, state.car.x, state.car.z, BUILD_TILES * rate);
    wild.sync(state.car.x, state.car.z);
    // Road owed: the rest of a finite stage, or — on an endless one — only
    // once a chunk's worth of new samples has been streamed, so the slices
    // stay full-sized rather than a fresh group every frame.
    const owed =
      !track.endless || track.samples.length - builtIndex >= CHUNK_SAMPLES
        ? BUILD_SLICES * rate
        : 0;
    for (let i = 0; i < owed; i++) {
      if (!raiseSlice()) break;
    }
    // The stands come with the road that carries them (R26), so the people
    // arrive with each slice rather than all at the start.
    buildPeople();
    if (!track.endless) return;
    while (chunks.length > 1 && chunks[0].toS < state.progressS - PRUNE_BEHIND) {
      const old = chunks.shift() as Chunk;
      for (const key of old.scenery.treeKeys) drawnTrees.delete(key);
      group.remove(old.group);
      disposeGroup(old.group);
    }
  };

  const update = (dt: number, focusX = 0, focusZ = 0): void => {
    terrain.update(dt);
    wild.update(dt);
    crowd?.update(dt, focusX, focusZ);
    for (const chunk of chunks) chunk.scenery.update(dt);
  };

  const dispose = (): void => {
    crowd?.dispose();
    disposeGroup(group);
    terrain.dispose();
  };

  return { group, update, sync, dispose, muzzles: () => finish?.muzzles ?? [] };
}
