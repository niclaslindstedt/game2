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
  PARAPET_BAY,
  PARAPET_INSET,
  PARAPET_THICK,
  ROAD_CROSS,
  bridgeParapets,
  createKerbField,
  createRng,
  inStream,
  markersBetween,
  type GameState,
  type Season,
  type Spur,
  type SpurLine,
  type Track,
  SOLID_PROP_HEIGHT,
  type WildObstacle,
} from "@engine";

import { isShared } from "../lib/shared-gpu.ts";
import { biomeFor, type Biome, type Community } from "./biome.ts";
import { buildBlockade } from "./blockade.ts";
import { createBreakage } from "./breakage.ts";
import { createConeField, plantJumpCones, type ConeField } from "./cones.ts";
import { TRUNK_COLOR, buildFlora, swayFlora, type FloraPlacement } from "./flora.ts";
import {
  RIPARIAN_BAND,
  communityByGrove,
  mixAt,
  pickFlora,
  samePlace,
  softMix,
  treePlacement,
  understoryAround,
} from "./planting.ts";
import { buildRoadSpill } from "./road-spill.ts";
import { buildWild } from "./wild.ts";
import { createArena } from "./arena.ts";
import { buildTerrain, LAKE_Y, type Terrain } from "./terrain.ts";
import { buildStreamMeshes } from "./streams.ts";
import { buildCulverts } from "./culvert.ts";
import { buildFinishGate, buildStartGate, type FinishGate, type Muzzle } from "./finish-gate.ts";
import { buildCarPark } from "./carpark.ts";
import { buildHomestead } from "./homestead.ts";
import { buildSolarFarm } from "./solar-farm.ts";
import { buildTown } from "./town.ts";
import { createWindFarms } from "./wind-farm.ts";
import { buildPowerLine } from "./powerline.ts";
import { createTraffic } from "./traffic.ts";
import { buildRailArm, buildRailCrossing } from "./railway.ts";
import { createTrains } from "./train.ts";
import { createLivestock } from "./livestock.ts";
import { buildKerbing, createPostField } from "./kerbs.ts";
import { plantSplitBoard } from "./split-board.ts";
import { buildCrowd, type Crowd } from "./crowd.ts";
import { rightOf } from "./ribbon.ts";
import {
  buildChippings,
  buildFords,
  buildMarkings,
  buildRoad,
  buildSkirts,
  chunkSamples,
  type GroundBeside,
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

type SceneryChunk = {
  group: THREE.Group;
  /** Zero out any prop the newly built road now runs through. */
  clearNear: (track: Track, from: number, to: number) => void;
  /** Stop drawing the one prop standing at a world point — the engine has
   * taken it out of the field and the piece is flying (breakage.ts). */
  retireAt: (x: number, z: number) => void;
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
  /** OPTIONS ▸ VIDEO ▸ GROUND DETAIL, as a multiplier on the loose stone:
   * the road's spill and the cobbles beyond it. Separate from `density`
   * because the two thin different things and a player sets them apart. */
  stone: number,
  season: Season,
): SceneryChunk {
  const group = new THREE.Group();
  const rng = createRng((track.seed ^ 0x5f356495 ^ Math.imul(from, 2246822519)) >>> 0);
  const samples = track.samples;
  const half = track.width / 2;
  /** Room past the road's own edge that nothing grows in, m. */
  const clearance = 3.5;
  const heightAt = terrain.standOn;
  const field = terrain.field;

  const communityAt = (x: number, z: number): Community =>
    communityByGrove(biome, field.groveAt(x, z));
  /** Inside the green seam a watercourse draws through whatever the quilt
   * says grows here (R18). */
  const riparian = (x: number, z: number): boolean => inStream(field.streams, x, z, RIPARIAN_BAND);
  /** The band between the waterline and dry land — reeds and sedge, the
   * only things the placement rules let stand below the usual floor. */
  const onShore = (y: number): boolean => y > LAKE_Y - 0.6 && y < LAKE_Y + 1.5;

  // Clearance checks walk the guard samples — the chunk's own road with
  // its aprons plus a margin of neighbours — so nothing grows on the road,
  // the start run-up, or the finish run-off.
  //
  // `margin` is room past the road's EDGE, and the edge is the one this
  // sample actually has: a junction's mouth flares half as wide again as
  // the road it opens off (R17) and a gravel road wanders either side of
  // nominal down the whole stage (R33). Measured against the nominal
  // instead, every crossing on the map gets shrubs planted in the middle
  // of its paving.
  const clearOfRoad = (x: number, z: number, margin: number): boolean => {
    for (let i = 0; i < guard.length; i += 4) {
      const dx = x - guard[i].x;
      const dz = z - guard[i].z;
      const r = guard[i].width / 2 + margin;
      if (dx * dx + dz * dz < r * r) return false;
    }
    // ...and off every OTHER road: an abandoned branch (R17), a homestead's
    // drive and its yard (R37). One cell lookup, cached by the field.
    return field.spurClearance(x, z) >= margin;
  };

  const flora: FloraPlacement[] = [];
  const treeKeys: string[] = [];

  // ── The forest: the ENGINE's trunk field, drawn exactly where the
  // physics collides — the band within 150 m of the road belongs to the
  // road chunks, the deeper wild to the wild cells. Ownership over chunk
  // seams is settled by the shared `drawnTrees` set.
  // ...and the skirt of saplings, junipers and moss each mature trunk keeps
  // around its own foot. The road walk is the expensive half of `blocked`,
  // so it is only asked where a skirt could actually reach the ribbon.
  const understory = {
    biome,
    rng: () => rng.next(),
    groundAt: heightAt,
    blocked: (x: number, z: number): boolean =>
      (field.roadDistanceAt(x, z) < clearance + 6 && !clearOfRoad(x, z, clearance)) ||
      inStream(field.streams, x, z, 1),
  };
  const collectTrees = (x: number, z: number): void => {
    for (const tree of field.treesNear(x, z, 190)) {
      if (field.roadDistanceAt(tree.x, tree.z) >= 150) continue;
      const key = `${tree.x.toFixed(1)},${tree.z.toFixed(1)}`;
      if (drawnTrees.has(key)) continue;
      drawnTrees.add(key);
      treeKeys.push(key);
      const rip = riparian(tree.x, tree.z);
      flora.push(treePlacement(tree, biome, rip));
      for (const plant of understoryAround(tree, rip, understory)) flora.push(plant);
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
    const soft = softMix(mixAt(biome, { y, riparian: riparian(x, z), grove: field.groveAt(x, z) }));
    if (!soft) continue;
    flora.push({ id: pickFlora(soft, roll), x, y, z, scale, spin });
  }

  // ── Ground cover, in three bands out from the road, each clump drawn
  // from its community's mix so meadows fill with tall grass and spruce
  // woods with ferns.
  //
  // The FLOOR band is the one that matters most and is the easiest to
  // forget: the trunk field reaches 150 m from the road, so a scatter that
  // stops at 34 m leaves the middle distance as trees standing in a bare
  // colour field — which is precisely what a forest never looks like. It
  // is thinner per square metre than the near bands (it covers eight times
  // the ground, and at that distance a clump is a few pixels), but it has
  // to be there.
  const BANDS: { from: number; to: number; share: number }[] = [
    { from: half + 1.6, to: clearance + 5, share: 1 },
    { from: clearance + 5, to: 34, share: 1 },
    { from: 34, to: 95, share: 0.62 },
  ];
  for (let i = Math.max(4, from); i < to; i += 2) {
    const s = samples[i];
    const r = rightOf(s.heading);
    for (const band of BANDS) {
      const side = rng.chance(0.5) ? 1 : -1;
      const offset = rng.range(band.from, band.to);
      const x = s.x + r.x * offset * side + rng.range(-2, 2);
      const z = s.z + r.z * offset * side + rng.range(-2, 2);
      const roll = rng.next();
      const scale = rng.range(0.7, 1.3);
      const spin = rng.range(0, Math.PI * 2);
      const community = communityAt(x, z);
      const chance =
        (biome.undergrowthDensity / 2) * (community.groundCover ?? 1) * density * band.share;
      if (!rng.chance(chance)) continue;
      if (!clearOfRoad(x, z, 1.2)) continue;
      if (inStream(terrain.field.streams, x, z, 0.5)) continue;
      const y = heightAt(x, z);
      // A lake that stops on a line is the tell that it was drawn on. In
      // the band between the waterline and dry land the reeds take over —
      // the one place anything is allowed to stand below the usual floor,
      // because standing in the shallows is what a reed does.
      const shore = onShore(y);
      if (!shore && y < LAKE_Y + 1.2) continue;
      flora.push({
        id: pickFlora(
          shore ? biome.shoreCover : (community.undergrowth ?? biome.undergrowth),
          roll,
        ),
        x,
        y,
        z,
        scale,
        spin,
      });
    }
  }

  // ── The road's own edge. A ribbon that ends on a ruled line reads as
  // laid on top of the country whatever its colours do; what breaks the
  // line is stuff STANDING across it. Two passes do it: grass coming back
  // into the bare shoulder from the field side, and the loose gravel the
  // blade and the traffic push off the mat. Both are small on purpose —
  // this is the strip a car running wide actually drives over, and
  // anything big enough to notice hitting has to be a solid prop instead.
  for (let i = Math.max(4, from); i < to; i += 3) {
    const s = samples[i];
    const r = rightOf(s.heading);
    for (const side of [-1, 1]) {
      if (!rng.chance(0.42 * density)) continue;
      const offset = half + rng.range(0.25, ROAD_CROSS.verge.bareTo + 0.6);
      const x = s.x + r.x * offset * side + rng.range(-0.6, 0.6);
      const z = s.z + r.z * offset * side + rng.range(-0.6, 0.6);
      if (!clearOfRoad(x, z, 0.15)) continue;
      if (inStream(field.streams, x, z, 0.5)) continue;
      const y = heightAt(x, z);
      if (y < LAKE_Y + 1.2) continue;
      // Scrappy: what survives on a graded shoulder is half the size of
      // what grows a metre further out.
      flora.push({
        id: pickFlora(biome.vergeCover, rng.next()),
        x,
        y,
        z,
        scale: rng.range(0.35, 0.7),
        spin: rng.range(0, Math.PI * 2),
      });
    }
  }

  const planted = buildFlora(flora, () => rng.next(), season);
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
  // R16 — THE SPILL: the loose stone on the mat itself, the chippings that
  // ran off it thinning out across the hand-over band and away into open
  // grass, and the tufts of grass growing back the other way. Its own
  // module, because it is the half of the road's edge a player actually
  // reads (see road-spill.ts) and because it is thousands of stones rather
  // than the handful of cobbles below.
  const spill = buildRoadSpill(
    track,
    Math.max(4, from),
    to,
    rng,
    stone,
    field.groundAt,
    terrain.paintAt,
    (x, z) => inStream(field.streams, x, z, 0.5) || field.groundAt(x, z) < LAKE_Y + 1.2,
  );
  for (const mesh of spill.meshes) group.add(mesh);
  for (let i = Math.max(4, from); i < to; i += 5) {
    const s = samples[i];
    if (stone < 1 && !rng.chance(stone)) continue;
    const r = rightOf(s.heading);
    const side = rng.chance(0.5) ? 1 : -1;
    const offset = rng.range(half + 1.5, 60);
    const x = s.x + r.x * offset * side + rng.range(-3, 3);
    const z = s.z + r.z * offset * side + rng.range(-3, 3);
    const drop = rng.next();
    if (!clearOfRoad(x, z, 1.2)) continue;
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
    // Every third stone carries a mossy cast where the country grows
    // moss at all; the rest vary in grey.
    tint.setScalar(0.8 + p.s * 0.35);
    if (biome.mossyStone > 0 && i % 3 === 0) tint.lerp(mossy, 0.5);
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
    spill.retire(hits);
    let touched = false;
    rocks.forEach((p, i) => {
      if (!hits(p.x, p.z)) return;
      rockMesh.setMatrixAt(i, zero);
      touched = true;
    });
    if (touched) rockMesh.instanceMatrix.needsUpdate = true;
  };

  const retireAt = (x: number, z: number): void => {
    planted.retire((px, pz) => samePlace(px, pz, x, z));
  };

  return { group, clearNear, retireAt, treeKeys };
}

/** Everything that carries a bridge deck over its water (R13): the parapet
 * you must not go over, and — since the whole point of a bridge is that
 * there is a hole under it — the structure that holds it up. A timber
 * crossing is two trunks and a plank floor on pile bents; a concrete one
 * is a slab on piers. Which you get was decided by the span back in the
 * generator; this only builds what that decision implies. */
/** How far apart a bridge's legs stand, m. Short enough that no span of
 * open deck reads as unsupported from the bank — which is the whole tell of
 * a bridge that was drawn rather than built. */
const PIER_SPACING = 14;

function buildBridges(
  track: Track,
  from: number,
  to: number,
  groundAt: (x: number, z: number) => number,
): THREE.Group {
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
    // The parapet. A concrete deck's wall is DRAWN WHERE THE ENGINE PUTS
    // IT: `bridgeParapets` is the one statement of where the bays stand,
    // and the car stops against them, so a wall drawn anywhere else would
    // be a wall the car hits a metre before it looks like it should. A
    // timber deck's rail is posts and a rail, and a car goes through it.
    if (kind === "concrete") {
      // One bay per metre is a lot of boxes for a wall nobody looks at
      // twice, so the whole run is ONE instanced mesh: a bridge's parapet
      // costs a single draw call, which is fewer than the four-metre
      // sections it replaced.
      const bays = bridgeParapets(samples, track.width, i, j);
      if (bays.length > 0) {
        const wall = new THREE.InstancedMesh(
          new THREE.BoxGeometry(PARAPET_THICK, bays[0].height, PARAPET_BAY * 1.04),
          rail,
          bays.length,
        );
        const at = new THREE.Matrix4();
        const spin = new THREE.Quaternion();
        const where = new THREE.Vector3();
        const one = new THREE.Vector3(1, 1, 1);
        for (let b = 0; b < bays.length; b++) {
          const bay = bays[b];
          // Drawn against the bay's INNER face rather than on its centre:
          // the collision circle is fatter than the concrete so the run
          // leaves no gap, and lining the two up on that face is what makes
          // the car stop exactly where the wall looks like it is. A bay's
          // own spin faces OUT of the road (solids.ts), so inward is one
          // subtraction wherever it stands.
          const r = rightOf(bay.spin);
          where.set(
            bay.x - r.x * PARAPET_INSET,
            bay.y + bay.height / 2,
            bay.z - r.z * PARAPET_INSET,
          );
          spin.setFromAxisAngle(UP, bay.spin);
          wall.setMatrixAt(b, at.compose(where, spin, one));
        }
        wall.instanceMatrix.needsUpdate = true;
        wall.computeBoundingSphere();
        group.add(wall);
      }
    } else {
      for (const side of [-1, 1]) {
        for (let k = i; k < j; k++) {
          const s = samples[k];
          const r = rightOf(s.heading);
          const lat = (half + 0.35) * side;
          const x = s.x + r.x * lat;
          const z = s.z + r.z * lat;
          if (k % 3 === 0) box(0.22, 1.1, 0.22, x, s.elevation + 0.55, z, s.heading, under);
          if (k % 2 === 0) box(0.16, 0.16, 4.2, x, s.elevation + 0.95, z, s.heading, rail);
        }
      }
    }
    // What holds it up. The deck itself is the road ribbon; this is the
    // beam under it, the piers, and the abutments the banks carry.
    //
    // Every leg of it is founded on the GROUND under its own foot, read off
    // the terrain field — the same ravine the water runs in. Standing them
    // on a nominal water level instead leaves them short of the bed by
    // however deep the channel was cut, which reads from the bank as a
    // bridge held up by nothing: brown ground, then a gap, then a pier
    // hanging in the air a third of the way across.
    const mid = samples[Math.floor((i + j) / 2)];
    const span = samples[j - 1].s - samples[i].s;
    /** Stand a leg from the deck down to whatever is under it, m. */
    const footing = (s: (typeof samples)[number], top: number): number =>
      Math.max(1.2, s.elevation - top - groundAt(s.x, s.z));
    for (const end of [i, j - 1]) {
      const s = samples[end];
      box(track.width + 1.6, 1.6, 3, s.x, s.elevation - 0.9, s.z, s.heading, under);
      // The abutment WALL: what the bank actually carries the deck on,
      // down to the ground rather than a beam floating over the cut.
      const drop = footing(s, 1.7);
      box(
        track.width + 1.2,
        drop,
        1.8,
        s.x,
        s.elevation - 1.7 - drop / 2,
        s.z,
        s.heading,
        kind === "concrete" ? concreteDark : timberDark,
      );
    }
    if (kind === "concrete") {
      for (let k = i; k < j; k += 2) {
        const s = samples[k];
        box(track.width + 0.6, 0.55, 4.2, s.x, s.elevation - 0.3, s.z, s.heading, under);
      }
      // A pier every PIER_SPACING or so, and never a span of open deck
      // longer than that: the eye counts them, and a slab bridge with one
      // leg under the middle reads as a plank.
      const piers = Math.max(1, Math.round(span / PIER_SPACING) - 1);
      for (let p = 1; p <= piers; p++) {
        const s = samples[Math.round(i + ((j - i) * p) / (piers + 1))];
        const drop = footing(s, 0.6);
        // A pier is a WALL across the deck standing on a spread footing,
        // not a post: it is holding a concrete slab up.
        box(
          track.width * 0.62,
          drop,
          1.6,
          s.x,
          s.elevation - 0.6 - drop / 2,
          s.z,
          s.heading,
          concreteDark,
        );
        box(
          track.width * 0.62 + 1.4,
          0.7,
          3,
          s.x,
          s.elevation - 0.6 - drop + 0.35,
          s.z,
          s.heading,
          concreteDark,
        );
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
      // Pile bents down to the bed, as many as the span asks for.
      const bents = Math.max(1, Math.round(span / PIER_SPACING) - 1);
      for (let p = 1; p <= bents; p++) {
        const s = samples[Math.round(i + ((j - i) * p) / (bents + 1))];
        const drop = footing(s, 0.7);
        for (const side of [-1, 1]) {
          const r = rightOf(s.heading);
          box(
            0.4,
            drop,
            0.4,
            s.x + r.x * half * 0.5 * side,
            s.elevation - 0.7 - drop / 2,
            s.z + r.z * half * 0.5 * side,
            s.heading,
            under,
          );
        }
      }
    }
    i = j;
  }
  return group;
}

/** An abandoned branch (R17), drawn like any other road — and the barrier
 * that says the stage does not go this way, wherever the generator stood it
 * (`spur.block`, and see blockade.ts). Nothing about it is solid. A player
 * who wants to see where the road goes is allowed to find out; the tape is a
 * statement, not a wall. */
function buildSpur(track: Track, spur: Spur, cones: ConeField, beside: GroundBeside): THREE.Group {
  const group = new THREE.Group();
  // A hair under the stage's own mat: inside a junction the two are warped
  // onto the SAME plane (R17), and two coplanar meshes tear each other
  // apart in the depth buffer. The skirt takes the same lift, so it hangs
  // from the branch's own lip rather than through it.
  group.add(buildSkirts(track, spur.samples, spur.width, 0.012, beside));
  group.add(buildRoad(track, spur.samples, spur.width, 0.012, beside));
  group.add(buildMarkings(track, spur.samples, spur.width, true));
  const chippings = buildChippings(track, spur.samples, spur.width);
  if (chippings) group.add(chippings);
  // A branch too short, or too closely folded against the route, to take a
  // barrier that clears the road the stage takes is left open on purpose:
  // nothing in the way beats something in the way (spurs.ts, `placeBlock`).
  if (spur.block) group.add(buildBlockade(spur.block, cones));
  return group;
}

/** R17 — a public road the route never met (`publicroad.ts`), drawn like an
 * abandoned branch minus the one thing that makes a branch a branch: there
 * is no barrier, because nobody shut it. It is tarmac, it runs rim to rim,
 * and it is the road the crowd drove in on. */
function buildPublicRoad(track: Track, road: SpurLine, beside: GroundBeside): THREE.Group {
  const group = new THREE.Group();
  group.add(buildSkirts(track, road.samples, road.width, 0.012, beside));
  group.add(buildRoad(track, road.samples, road.width, 0.012, beside));
  group.add(buildMarkings(track, road.samples, road.width, true));
  const chippings = buildChippings(track, road.samples, road.width);
  if (chippings) group.add(chippings);
  return group;
}

export type World = {
  group: THREE.Group;
  /** Advance everything that moves on its own, and let the car knock over
   * whatever it is driving through. The car is also the focus point: R26's
   * crowd only animates the stands near it. `knocked` is raised once per
   * cone or marker post put over, with the speed it left at — neither is an
   * engine prop, so this is the only place their noise can come from. */
  update: (state: GameState, dt: number, knocked?: (speed: number) => void) => void;
  /** Catch the world up with the track and the car, one frame's worth at a
   * time: raise the road still owed, build the ground the car and the
   * corridor now need, and — on an endless stage — drop what is behind.
   * `dt` is the frame's own length, which is how much of the outstanding
   * work this call takes on. */
  sync: (state: GameState, dt: number) => void;
  /** Hide everything the frame cannot show. A finite stage builds its
   * whole road — kilometres of it — and the camera's far plane stands well
   * past where the air goes solid, so without this the frame pays for five
   * kilometres of forest to draw a few hundred metres of it. `range` is the
   * fog's far distance: past it every fragment is pure fog color, so what
   * is dropped could not have been seen. The frustum does the other half,
   * for the open country, which is pooled into meshes three cannot cull
   * because the camera stands inside every one of them. */
  cull: (camera: THREE.Camera, range: number, also?: THREE.Camera | null) => void;
  /** A solid the engine has taken OUT of the world (`solidBreak`): stop
   * drawing it standing wherever it was drawn, and throw the piece it left
   * along the velocity the contact gave it. */
  fell: (solid: WildObstacle, vx: number, vy: number, vz: number) => void;
  /** R22 — where the finish's cannons point, for the renderer to fire.
   * Empty until the chunk carrying the finish gate is built, and on an
   * endless stage forever: nothing there ever finishes. */
  muzzles: () => Muzzle[];
  dispose: () => void;
};

/** How far from the road a chunk's own scenery reaches, m — the band the
 * road chunks plant, beyond which the wild cells take over. The fog cull
 * has to allow for it, or a chunk goes dark while its outermost trees are
 * still inside the fog. */
const SCENERY_REACH = 175;

/** How far apart the points the fog cull measures a chunk by are, samples.
 * A chunk is a few hundred metres of road that can bend right back on
 * itself, so the honest question is how close its NEAREST point is, not
 * how close the circle around the whole thing is: a bounding sphere over
 * 300 m of road is 150 m of slack, and 150 m of slack against a 400 m fog
 * keeps half a stage alive that nobody can see. Every fourth sample is
 * eight metres of road — far finer than the tolerance the reach already
 * carries. */
const CULL_STRIDE = 4;

/** The points the fog cull measures a chunk by. */
function chunkTrace(ribbon: Track["samples"]): Float64Array {
  const points = new Float64Array(Math.ceil(ribbon.length / CULL_STRIDE) * 2);
  let at = 0;
  for (let i = 0; i < ribbon.length; i += CULL_STRIDE) {
    points[at++] = ribbon[i].x;
    points[at++] = ribbon[i].z;
  }
  return points;
}

/** True while any point of `trace` is within `reach` of (x, z). */
function traceWithin(trace: Float64Array, x: number, z: number, reach: number): boolean {
  const limit = reach * reach;
  for (let i = 0; i < trace.length; i += 2) {
    const dx = trace[i] - x;
    const dz = trace[i + 1] - z;
    if (dx * dx + dz * dz <= limit) return true;
  }
  return false;
}

/** Tear down everything a group OWNS. The flora library's shapes, the two
 * materials it plants them with and every procedural texture in the app
 * are shared by the whole world, so they are marked and skipped — freeing
 * them with the chunk that happened to be dropped first would blank the
 * forest still standing. */
function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (!isShared(obj.geometry)) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (isShared(mat)) continue;
        if (mat instanceof THREE.MeshLambertMaterial || mat instanceof THREE.MeshPhongMaterial) {
          if (!isShared(mat.map)) mat.map?.dispose();
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
export function buildWorld(track: Track, density = 1, season: Season = "summer", stone = 1): World {
  const group = new THREE.Group();
  // R40 — the country the stage's dials name. The engine placed every
  // solid thing from the same id; this is what dresses it.
  const biome = biomeFor(track.knobs.biome);
  const terrain = buildTerrain(track, biome, season);
  group.add(terrain.group);
  terrain.sync(track, 0, track.samples[0].x, track.samples[0].z);
  // R16 — what the road's outer band hands over TO. The ribbon reads the
  // ground's height so the two meshes meet at the corridor's lip, and its
  // colour so they meet in the same green as well as at the same height.
  const beside: GroundBeside = { heightAt: terrain.latticeAt, paintAt: terrain.paintAt };
  // A finite stage's road is known in full before the first tree is planted,
  // so every slice keeps its scenery off ALL of it. An endless one cannot:
  // the road ahead is unwritten when the props beside it go in, and
  // `clearNear` is what retires the ones it later claims.
  const fullGuard = track.endless ? null : chunkSamples(track, 0, track.samples.length);
  const wild = buildWild(track, biome, terrain, density, season);
  group.add(wild.group);
  wild.sync(track.samples[0].x, track.samples[0].z);
  // The cones live OUTSIDE the road chunks: a chunk drops the moment the car
  // is far enough past it, and one that took a cone still in the air with it
  // would leave it hanging.
  const cones = createConeField();
  group.add(cones.group);
  // R26 — the marker posts. Their instanced batches live in the road
  // chunks that draw them; the field only holds the references, so the car
  // can knock one flat wherever it stands.
  const posts = createPostField();
  // The engine's own marker list: the physics collides the anti-cut blocks
  // in it, so nothing here may decide for itself where one stands.
  const kerbs = createKerbField(track);
  // ...and, beside them, whatever the car breaks OFF the landscape. Same
  // reason they live outside the road chunks: a chunk dropped behind an
  // endless run would take a trunk still in the air with it.
  const breakage = createBreakage(TRUNK_COLOR, biome.ground.bedrock);
  group.add(breakage.group);
  // R41 — the trains: one consist per railway crossing, posed each frame
  // off the engine's timetable. Their facet jitter is the seed's, so a
  // stage's train is the same train every run.
  const trainRng = createRng((track.seed ^ 0x2c9f1b57) >>> 0);
  const trains = createTrains(() => trainRng.next());
  group.add(trains.group);
  // R37 — the livestock: every farm's herd, wandering its paddock on the
  // renderer's own clock. Herds arrive with the chunk their farm is in.
  const livestock = createLivestock();
  group.add(livestock.group);

  type Chunk = {
    toS: number;
    group: THREE.Group;
    scenery: SceneryChunk;
    /** Points along this slice of road, the cursor the fog cull measures
     * it by. */
    trace: Float64Array;
  };
  const chunks: Chunk[] = [];
  /** Engine trunks already drawn by some scenery chunk — chunk queries
   * overlap at the seams, and a tree drawn twice z-fights itself. */
  const drawnTrees = new Set<string>();
  let builtIndex = 0;
  let fordScan = 0;
  let streamScanS = 0;
  let spurScan = 0;
  let publicScan = 0;
  let homesteadScan = 0;
  let townScan = 0;
  let solarScan = 0;
  let windScan = 0;
  let boardScan = 0;
  /** R43 — the wind farms: their own manager outside the chunks, because a
   * string of two-hundred-metre machines is in view from far outside the
   * chunk the road placed it from, and because its rotors turn every frame. */
  const windFarms = createWindFarms();
  group.add(windFarms.group);
  /** R45 — the transmission line, if the country carries one. Outside the
   * chunks and never pruned, for the wind farms' reason and more so: it
   * crosses the whole map, so the tower on the skyline belongs to no chunk
   * and the wayleave belongs to all of them. Built on the first chunk,
   * once — an endless stage carries no grid, and a finite one's line is
   * the same line from the start line to the finish. */
  let powerLineCount = 0;
  /** R44 — the traffic on the public roads: every vehicle posed off the
   * engine's fleet each frame, and the speed limit signs it stood. Outside
   * the chunks for the wind farms' reason — a lorry two kilometres up an
   * arm is near no chunk, and it moves. */
  const trafficRng = createRng((track.seed ^ 0x7a4f1c2b) >>> 0);
  const traffic = createTraffic(() => trafficRng.next(), terrain.latticeAt);
  group.add(traffic.group);
  // THE TRAINING GROUND's paint and furniture, on the tracks that are one.
  // Its own manager outside the road chunks, for the wind farms' reason and
  // more so: the arena is two hundred metres across and the road it hangs
  // off is a hundred metres long, so it belongs to no slice of it. The
  // ground it all stands on is drawn by the terrain (at the arena's own
  // finer lattice) and is not this module's business; the cones go into the
  // same field a stage's do, so the car scatters them the same way.
  const arena = track.arena === null ? null : createArena(track.arena, terrain.standOn, cones);
  if (arena) group.add(arena.group);
  let finish: FinishGate | null = null;
  /** R26 — the crowd, rebuilt whenever the stage grows a new stand. The
   * whole crowd is a handful of instanced meshes, so it is cheaper to
   * rebuild it than to grow one. */
  let crowd: Crowd | null = null;
  let standCount = 0;
  /** R42 — the car parks, built as the terrain field places them: each is
   * its own group, kept with the arc position it belongs to so an endless
   * run can drop it with the road behind. */
  const parkGroups: { atS: number; group: THREE.Group }[] = [];
  let parkCount = 0;

  const buildChunk = (from: number, to: number): void => {
    const chunkGroup = new THREE.Group();
    const ribbon = chunkSamples(track, from, to);
    const bare = track.samples.slice(Math.max(0, from - 1), to);
    chunkGroup.add(buildSkirts(track, ribbon, track.width, undefined, beside));
    chunkGroup.add(buildRoad(track, ribbon, track.width, undefined, beside));
    chunkGroup.add(buildMarkings(track, bare, track.width));
    // R25 — the rally's own striped marking, at the corners that earn it.
    // The window is half-open at the top and starts at this chunk's FIRST
    // sample rather than the strip's overlapping one, so every marker the
    // engine placed is drawn by exactly one chunk.
    kerbs.extend(to);
    chunkGroup.add(
      buildKerbing(
        track,
        bare,
        track.width,
        markersBetween(
          kerbs,
          track.samples[from].s,
          to < track.samples.length ? track.samples[to].s : Infinity,
        ),
        posts,
      ),
    );
    const chippings = buildChippings(track, bare, track.width);
    if (chippings) chunkGroup.add(chippings);
    // The tiles and not `standOn`: a pier stands in the riverbed, and the
    // ribbon `standOn` blends in over a crossing is the DECK the pier is
    // holding up.
    chunkGroup.add(buildBridges(track, from, to, terrain.latticeAt));
    // R12 — and the pipes the road carries its streams under.
    chunkGroup.add(buildCulverts(track, from, to));
    // The branches this stretch of road forks off at its paving junctions.
    for (; spurScan < track.spurs.length; spurScan++) {
      const spur = track.spurs[spurScan];
      if (spur.atS > track.samples[to - 1].s) break;
      // R41 — a railway's arm is ballast and rails, not a mat, and the
      // crossing's deck and boards come with its first arm.
      if (spur.rail) {
        chunkGroup.add(buildRailArm(spur));
        if (spur.end === "entry") {
          const crossing = track.rails.find((r) => r.s === spur.atS);
          if (crossing) {
            const jitter = createRng((track.seed ^ 0x2c9f1b57 ^ Math.round(spur.atS)) >>> 0);
            chunkGroup.add(buildRailCrossing(track, crossing, () => jitter.next()));
          }
        }
        continue;
      }
      chunkGroup.add(buildSpur(track, spur, cones, beside));
    }
    // R17 — the public roads the route never met, ordered by the arc of the
    // route they run nearest. Whole roads rather than per-chunk pieces: one
    // crosses the country the stage folds through, so there is no stretch of
    // stage it belongs to more than another.
    for (; publicScan < track.publicRoads.length; publicScan++) {
      const road = track.publicRoads[publicScan];
      if (road.atS > track.samples[to - 1].s) break;
      chunkGroup.add(buildPublicRoad(track, road, beside));
    }
    // R37 — the homesteads whose drives leave this stretch of road.
    for (; homesteadScan < track.homesteads.length; homesteadScan++) {
      const homestead = track.homesteads[homesteadScan];
      if (homestead.atS > track.samples[to - 1].s) break;
      chunkGroup.add(buildHomestead(track, homestead, cones, beside, season));
      if (homestead.farm?.paddock) {
        livestock.add(homestead.farm.paddock, terrain.field.groundAt, track.seed);
      }
    }
    // R39 — the towns met on this stretch of road: the one the route drives
    // through, or the one down the arm at a junction it passes.
    for (; townScan < track.towns.length; townScan++) {
      const town = track.towns[townScan];
      if (town.atS > track.samples[to - 1].s) break;
      chunkGroup.add(buildTown(track, town));
    }
    // R43 — the solar farms beside this stretch of road, in the chunk with
    // it; and the wind farms placed from it, handed to their own manager.
    for (; solarScan < track.solarFarms.length; solarScan++) {
      const farm = track.solarFarms[solarScan];
      if (farm.atS > track.samples[to - 1].s) break;
      chunkGroup.add(buildSolarFarm(track, farm, beside));
    }
    for (; windScan < track.windFarms.length; windScan++) {
      const farm = track.windFarms[windScan];
      if (farm.atS > track.samples[to - 1].s) break;
      windFarms.add(track, farm, beside);
    }
    // R45 — the grid. Into the scene's own group rather than the chunk's,
    // because a chunk is disposed with the road it was built for.
    for (; powerLineCount < track.powerLines.length; powerLineCount++) {
      group.add(buildPowerLine(track, track.powerLines[powerLineCount], beside));
    }
    const fords = buildFords(track, fordScan, to);
    fordScan = fords.next;
    chunkGroup.add(fords.group);
    const toS = track.samples[to - 1].s;
    const fresh = terrain.field.streams.filter((s) => s.centerS >= streamScanS && s.centerS < toS);
    if (fresh.length > 0) chunkGroup.add(buildStreamMeshes(fresh, terrain.field.waterAt));
    streamScanS = toS;
    // The clearance guard: the whole road where it is known, and otherwise
    // this chunk's aproned ribbon plus a margin of neighbouring road so
    // props keep off the seams too.
    const guard = fullGuard ?? [
      ...ribbon,
      ...track.samples.slice(Math.max(0, from - 120), Math.max(0, from - 1)),
      ...track.samples.slice(to, Math.min(track.samples.length, to + 120)),
    ];
    const scenery = buildScenery(
      track,
      biome,
      terrain,
      from,
      to,
      guard,
      drawnTrees,
      density,
      stone,
      season,
    );
    chunkGroup.add(scenery.group);
    plantJumpCones(cones, track, from, to);
    // R28 — the flags at the split boards this stretch of road carries, so
    // the line the clock is watching is a thing on the stage and not only a
    // ring on the map. They go into the cone field, which is what owns every
    // loose thing beside this road.
    for (; boardScan < track.checkpoints.length; boardScan++) {
      const board = track.checkpoints[boardScan];
      if (board.s > track.samples[to - 1].s) break;
      plantSplitBoard(cones, track, board);
    }
    // A circuit's start line IS its finish line (R22), so it gets one gate
    // saying so rather than two ten metres apart. THE TRAINING GROUND gets
    // neither, and neither a finish: its ribbon is the approach road to a
    // place, and a gantry over it saying START would be the game claiming a
    // race is on when the whole point of the level is that none is.
    const raced = track.arena === null;
    if (from === 0 && !track.circuit && raced) chunkGroup.add(buildStartGate(track, 2));
    // R25 — the finish GATE, which on a sprint is no longer the last thing
    // on the road: the run-out carries on past it, and this chunk draws
    // both. The cannons stand beside it either way.
    if (!track.endless && raced && to === track.samples.length) {
      finish = buildFinishGate(track, track.circuit ? "START/FINISH" : "FINISH");
      chunkGroup.add(finish.group);
    }
    group.add(chunkGroup);
    chunks.push({ toS, group: chunkGroup, scenery, trace: chunkTrace(ribbon) });
  };

  /** R26 — (re)build the people. The stands come from the terrain field,
   * which places them against the world as the road commits, so this runs
   * whenever that list has grown. */
  const buildPeople = (): void => {
    const stands = terrain.field.stands;
    // The field's REVISION, not its length: R42 takes stands off the stage
    // as well as putting them on (a corner nobody could have parked within
    // a walk of), and a sync that places two and drops two leaves the
    // length exactly where it was with a different crowd underneath it.
    if (terrain.field.standRevision === standCount) return;
    standCount = terrain.field.standRevision;
    if (crowd) {
      group.remove(crowd.group);
      disposeGroup(crowd.group);
      crowd.dispose();
    }
    crowd = buildCrowd(stands, terrain.field.groundAt, density);
    group.add(crowd.group);
  };

  /** R42 — (re)build where the crowd parked, for the same reason and at
   * the same moment: the car parks come off the terrain field with the
   * stands they serve. */
  const buildParks = (): void => {
    const parks = terrain.field.carParks;
    for (; parkCount < parks.length; parkCount++) {
      const park = parks[parkCount];
      const built = buildCarPark(track, park, cones, beside);
      group.add(built);
      parkGroups.push({ atS: park.atS, group: built });
    }
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
  buildParks();

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
    buildParks();
    if (!track.endless) return;
    while (chunks.length > 1 && chunks[0].toS < state.progressS - PRUNE_BEHIND) {
      const old = chunks.shift() as Chunk;
      for (const key of old.scenery.treeKeys) drawnTrees.delete(key);
      group.remove(old.group);
      disposeGroup(old.group);
      cones.retireBefore(old.toS);
      posts.retireBefore(old.toS);
      kerbs.pruneBefore(old.toS);
      windFarms.pruneBefore(old.toS);
      // R42 — the car parks behind go with the road they served. The
      // field's own list is pruned by the same arc, so the counter into it
      // is re-anchored to what the field still holds.
      while (parkGroups.length > 0 && parkGroups[0].atS < old.toS) {
        const gone = parkGroups.shift() as { atS: number; group: THREE.Group };
        group.remove(gone.group);
        disposeGroup(gone.group);
      }
      parkCount = Math.min(parkCount, terrain.field.carParks.length);
    }
  };

  const frustums = [new THREE.Frustum(), new THREE.Frustum()];
  const seen: THREE.Frustum[] = [];
  const view = new THREE.Matrix4();
  const frustumOf = (camera: THREE.Camera, into: THREE.Frustum): THREE.Frustum => {
    camera.updateMatrixWorld();
    return into.setFromProjectionMatrix(
      view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
  };
  /** `also` is a second view of the same frame — the rear-view mirror's.
   * The chunk pass does not care about it: both cameras stand on the car,
   * so they agree about what is within reach. The frustum pass does, and
   * missing it is what leaves the mirror looking at bare ground where the
   * open country's trees should be. */
  const cull = (camera: THREE.Camera, range: number, also?: THREE.Camera | null): void => {
    const at = camera.position;
    const reach = range + SCENERY_REACH;
    for (const chunk of chunks) {
      chunk.group.visible = traceWithin(chunk.trace, at.x, at.z, reach);
    }
    seen.length = 0;
    seen.push(frustumOf(camera, frustums[0]));
    if (also) seen.push(frustumOf(also, frustums[1]));
    wild.cull(seen);
  };

  /** A solid the engine took out of the world: stop drawing it standing,
   * wherever it was drawn — the road chunk that owns its patch of ground,
   * or the wild cell out past them — and send the piece on its way. */
  const fell = (solid: WildObstacle, vx: number, vy: number, vz: number): void => {
    // The renderer keeps its own field instance, and it has to be told
    // too: the wild streams cells in around the car for as long as the run
    // lasts, and a field that still places a felled trunk stands it back up
    // the moment the player drives away and comes back.
    terrain.field.fell(solid);
    for (const chunk of chunks) chunk.scenery.retireAt(solid.x, solid.z);
    wild.retireAt(solid.x, solid.z);
    breakage.spawn(solid, vx, vy, vz);
  };

  const update = (state: GameState, dt: number, knocked?: (speed: number) => void): void => {
    terrain.update(dt);
    // R41 — the trains, posed off the stage clock the engine times them on.
    if (state.track.rails.length > 0) trains.update(state.track, state.t);
    // The breeze is ONE uniform over the world's shared leafy material, so
    // it is advanced once here rather than per patch of planted ground.
    swayFlora(dt);
    cones.update(state, dt, knocked);
    posts.update(state, dt, knocked);
    breakage.update(dt, terrain.standOn);
    crowd?.update(dt, state.car.x, state.car.z);
    livestock.update(dt, state.car.x, state.car.z);
    // R43 — the rotors, in the same wind the rain leans in.
    windFarms.update(state, dt);
    // R44 — the traffic, wherever the engine's step left it.
    traffic.update(state);
  };

  const dispose = (): void => {
    crowd?.dispose();
    trains.dispose();
    traffic.dispose();
    livestock.dispose();
    windFarms.dispose();
    arena?.dispose();
    wild.dispose();
    cones.dispose();
    posts.dispose();
    breakage.dispose();
    disposeGroup(group);
    terrain.dispose();
  };

  return { group, update, sync, cull, fell, dispose, muzzles: () => finish?.muzzles ?? [] };
}
