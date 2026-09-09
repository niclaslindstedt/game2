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
  createKerbField,
  createRng,
  markersBetween,
  type GameState,
  type Season,
  type Track,
  type WildObstacle,
} from "@engine";

import { isShared } from "../lib/shared-gpu.ts";
import { biomeFor } from "./biome.ts";
import { createBreakage } from "./breakage.ts";
import { createConeField, plantJumpCones } from "./cones.ts";
import { TRUNK_COLOR, swayFlora } from "./flora.ts";
import type { FloraCasterSource } from "./flora-shadow.ts";
import { buildWild } from "./wild.ts";
import { setSnowCap } from "./snow-cap.ts";
import { createArena } from "./arena.ts";
import { buildTerrain } from "./terrain.ts";
import { buildStreamMeshes } from "./streams.ts";
import { buildCulverts } from "./culvert.ts";
import { detailTexture } from "./textures.ts";
import { buildTunnelLining } from "./tunnel.ts";
import type { LidGround } from "./tunnel-lid.ts";
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
import {
  buildChippings,
  buildFords,
  buildMarkings,
  buildRoad,
  buildSkirts,
  chunkSamples,
  type GroundBeside,
} from "./road-mesh.ts";

import {
  buildBridges,
  buildPublicRoad,
  buildScenery,
  buildSpur,
  CHUNK_SAMPLES,
  PRUNE_BEHIND,
  pace,
  BUILD_SLICE,
  BUILD_SLICES,
  BUILD_TILES,
  type SceneryChunk,
} from "./world-scenery.ts";

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
  /** Every live chunk's flora, as the shadow pool's source (flora-shadow.ts).
   * Walks the chunks and allocates, so it is read when `floraAge` says the
   * set has changed and not per frame. */
  floraCasters: () => readonly FloraCasterSource[];
  /** How many times the chunk set has changed — the cheap check that says
   * whether `floraCasters()` is worth calling again. */
  floraAge: () => number;
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
  // R47 — how cold this stage is, for everything standing in it: the load
  // on the trees, the stone and the roofs is one uniform read by every
  // material that wears it, and it is set HERE because it belongs to the
  // stage rather than to any one thing in it (snow-cap.ts).
  setSnowCap(track.knobs, track.climate);
  // R40 — the country the stage's dials name. The engine placed every
  // solid thing from the same id; this is what dresses it.
  const biome = biomeFor(track.knobs.biome);
  const terrain = buildTerrain(track, biome, season);
  // Named for the benchmark's breakdown (renderer.ts's `sceneTally`): the
  // world is most of what a frame draws, and "world" as one row says
  // nothing about which half of it to go after.
  terrain.group.name = "terrain";
  group.add(terrain.group);
  terrain.sync(track, 0, track.samples[0].x, track.samples[0].z);
  // R16 — what the road's outer band hands over TO. The ribbon reads the
  // ground's height so the two meshes meet at the corridor's lip, and its
  // colour so they meet in the same green as well as at the same height.
  const beside: GroundBeside = { heightAt: terrain.latticeAt, paintAt: terrain.paintAt };
  /** R47 — what a tunnel's lid is laid on: the ground with the trench
   * filled back in, the drawn lattice it has to meet, and the tiles' paint. */
  const overBore: LidGround = {
    lidAt: terrain.field.lidAt,
    farHeightAt: terrain.field.farHeightAt,
    latticeAt: terrain.latticeAt,
    paintLand: terrain.paintLand,
    grain: detailTexture,
  };
  // A finite stage's road is known in full before the first tree is planted,
  // so every slice keeps its scenery off ALL of it. An endless one cannot:
  // the road ahead is unwritten when the props beside it go in, and
  // `clearNear` is what retires the ones it later claims.
  const fullGuard = track.endless ? null : chunkSamples(track, 0, track.samples.length);
  const wild = buildWild(track, biome, terrain, density, season);
  wild.group.name = "wild";
  group.add(wild.group);
  wild.sync(track.samples[0].x, track.samples[0].z);
  // The cones live OUTSIDE the road chunks: a chunk drops the moment the car
  // is far enough past it, and one that took a cone still in the air with it
  // would leave it hanging.
  const cones = createConeField();
  cones.group.name = "cones";
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
  breakage.group.name = "breakage";
  group.add(breakage.group);
  // R41 — the trains: one consist per railway crossing, posed each frame
  // off the engine's timetable. Their facet jitter is the seed's, so a
  // stage's train is the same train every run.
  const trainRng = createRng((track.seed ^ 0x2c9f1b57) >>> 0);
  const trains = createTrains(() => trainRng.next());
  trains.group.name = "trains";
  group.add(trains.group);
  // R37 — the livestock: every farm's herd, wandering its paddock on the
  // renderer's own clock. Herds arrive with the chunk their farm is in.
  const livestock = createLivestock();
  livestock.group.name = "livestock";
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
  /** Bumped whenever the chunk set changes, so a reader can tell that the
   * flora it is holding is stale without walking the chunks to find out. */
  let floraAge = 0;
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
    // R47 — the lining of any bore on this stretch, the portal where one
    // begins or ends here, and the mountain drawn back over it.
    const lining = buildTunnelLining(track, from, to, overBore);
    if (lining) chunkGroup.add(lining);
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
    if (from === 0 && !track.circuit && raced) {
      chunkGroup.add(buildStartGate(track, 2, terrain.standOn));
    }
    // R25 — the finish GATE, which on a sprint is no longer the last thing
    // on the road: the run-out carries on past it, and this chunk draws
    // both. The cannons stand beside it either way.
    if (!track.endless && raced && to === track.samples.length) {
      finish = buildFinishGate(track, track.circuit ? "START/FINISH" : "FINISH", terrain.standOn);
      chunkGroup.add(finish.group);
    }
    chunkGroup.name = "road chunks";
    group.add(chunkGroup);
    chunks.push({ toS, group: chunkGroup, scenery, trace: chunkTrace(ribbon) });
    floraAge++;
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
      floraAge++;
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

  return {
    group,
    update,
    sync,
    cull,
    fell,
    dispose,
    muzzles: () => finish?.muzzles ?? [],
    /** Every live chunk's flora, for the shadow pool to pick from. Read
     * after a chunk is built or dropped rather than every frame: on an
     * endless run the set changes only when the road does. */
    floraCasters: () => chunks.flatMap((chunk) => chunk.scenery.casters),
    /** How many times the chunk set has changed. Compared per frame instead
     * of rebuilding the list above, which allocates. */
    floraAge: () => floraAge,
  };
}
