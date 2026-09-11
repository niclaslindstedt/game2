// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The landscape the road runs through — and, since the world opened up,
// the ground the car actually rides the moment it leaves the road. One
// seeded heightfield serves both the physics and the renderer: a flat
// verge shelf at road grade, per-side embankments rising into hillsides or
// falling toward valleys, a rolling far field with ridged mountain chains
// and broad sea basins sunk under the water table, and stream valleys
// carved through wherever a ford crosses the road. Everything SOLID that
// stands on that ground — the forest's trunks, the boulders, the fallen
// timber, the quilt of regions and groves that decides where each belongs
// — is props.ts's, hung off this field and re-exported here so callers ask
// one object about the landscape. Everything is deterministic in the track
// seed; heights are smooth analytic noise, so the ground under the car
// never stairsteps.

import { cellKey } from "../lib/math.ts";
import type { Surface, Track } from "./compile.ts";
import { createGuardField, type CornerGuard, type GuardField } from "./guards.ts";
import { createStandField, type Stand, type StandField } from "./stands.ts";
import { carParkSolids, createCarParkField, type CarPark, type CarParkField } from "./carparks.ts";
import { traceRivers, type River } from "./river.ts";
import { arenaTerrain } from "./arena-field.ts";
import { TILE_SINK } from "./lattice.ts";
import type { WaterField } from "./water.ts";
import type { GeologyField } from "./geology.ts";
import { STAGE_RULES as R, knobScale } from "./rules.ts";
import { createSpurIndex, type SpurIndex } from "./spur-index.ts";
import { createSampleIndex } from "./terrain-index.ts";
import { createCone } from "./terrain-cone.ts";
import { createPadField } from "./terrain-pads.ts";
import { createShaping } from "./terrain-shape.ts";
import { createGround } from "./terrain-ground.ts";
import { createPropField } from "./props.ts";
import { bridgeParapets, tunnelWalls, type WildObstacle } from "./solids.ts";
import { farmClearings } from "./farms.ts";
import { homesteadSolids } from "./homesteads.ts";
import { townSolids } from "./towns.ts";
import { solarFarmClearings, solarFarmSolids, windFarmPads, windFarmSolids } from "./energy.ts";
import { powerLineFootprints, powerLineSolids, underWayleave } from "./powerline.ts";

export { LAKE_Y } from "./land.ts";
export { GROVE_SCALE, REGION_SCALE, type GroveCommunity, type Region } from "./biomes.ts";
export { GROUND_CELL, TILE_SINK } from "./lattice.ts";
import { collectAnchors, inStream, sliceRiver, type Stream } from "./terrain-streams.ts";

export * from "./terrain-streams.ts";

// ── The field ─────────────────────────────────────────────────────────────

export type TerrainField = {
  /** Final ground height at a world position — corridor shelf, hills,
   * mountains, sea floor, stream beds and all. The ANALYTIC field: it is
   * what the ground mesh's corners are sampled from, and between two of
   * those corners it is not the ground at all. Nothing STANDS on it — see
   * `groundAt` and `latticeAt`, which are the surfaces that get drawn. */
  heightAt: (x: number, z: number) => number;
  /** The ground the car RIDES: `heightAt` sampled on the GROUND_CELL
   * lattice and interpolated across the same triangles the renderer draws,
   * so the physics ground IS the drawn ground. The analytic field between
   * lattice points disagrees with the mesh by up to a meter on curved
   * slopes — riding it buries the car in every concave hillside. */
  groundAt: (x: number, z: number) => number;
  /** The GROUND TILES on their own — `heightAt` at the GROUND_CELL corners,
   * interpolated across the same two triangles the renderer draws, with no
   * road ribbon laid over it. This is the surface the road's outer band
   * hands over TO (R16's `handoverAt`), so the road mesh reads it to put
   * its outermost vertices exactly where the ground beside them is; the
   * analysis reads it to measure whatever is left at the seam. */
  latticeAt: (x: number, z: number) => number;
  /** The BARE country under the snow, m — the drawn surface with the
   * winter's blanket taken off it. The ground tiles are built from this and
   * the snow is laid over them as a mantle of its own (`snow-mantle.ts`),
   * because a coat with a four-metre bank at its edge cannot exist on a
   * lattice with fourteen metres between corners. Identical to `latticeAt`
   * on every green stage. */
  bareLatticeAt: (x: number, z: number) => number;
  /** The landscape far from any road (mountains and sea included) — what
   * tooling can preview, and the country a road's earthworks are measured
   * against. */
  farHeightAt: (x: number, z: number) => number;
  /** R18 — THE GROUND THE WATER HAS: the bare country held down under
   * whatever the road CUT out of it. Stated once, here, because a
   * watercourse is TRACED against it and then JUDGED against it, and two
   * copies of that rule is a river in the air the day one of them moves.
   *
   * Neither half alone will do. The bare land ignores a cutting — a
   * corridor takes seven metres off a hillside over a hundred metres of
   * it, and a course that keeps the level the land had before the road
   * was built ends up a sheet standing five metres over the ground the
   * world draws. The shaped ground is wrong the other way: a road crosses
   * its water on FILL, and a course reading the embankment either runs
   * down its flank or refuses the reach at the ford altogether. Fill is
   * ground the road PUT there and the water takes no notice of it; a cut
   * is ground the road TOOK, and water cannot stand where there is none.
   * So the cut binds and the fill does not.
   *
   * The stream's own carve is not in it — this is the ground the channel
   * is cut INTO, so a course would otherwise be measured against the hole
   * it dug. */
  waterGroundAt: (x: number, z: number) => number;
  /** R47 — the ground over a BORE as if the bore were not there: the
   * lattice with its trench filled back in. Inside the trench (a tunnel
   * sample nearest, within the corridor's lip) it is the bare mountain;
   * everywhere else it is `heightAt`, so where another arm of the stage
   * cuts past within a cell of the bore the lid meets THAT arm's cutting
   * rather than floating over it. The lining draws it (tunnel.ts). */
  lidAt: (x: number, z: number) => number;
  /** R32 — what the ground is MADE of: the rock, the soil on it and the
   * groundwater in it. The road shapes the SURFACE and nothing under it,
   * so this is the bare country's own layering wherever it is asked —
   * which is what everything that plants, paints or judges wants. */
  geology: GeologyField;
  /** Water surface height over this point — lake/sea table or a stream's
   * local level — or null on dry ground. */
  waterAt: (x: number, z: number) => number | null;
  /** R35 — the standing water poured onto the bare country: levels,
   * depths, bodies, and where the nearest of them is.
   *
   * Where `waterAt` answers "is this point under water", this answers "and
   * at what height would it be if it were" — which is what anything
   * DRAWING a shoreline needs, because the waterline runs BETWEEN the
   * points it is asked about. A renderer that can only ask the first
   * question has to guess the edge, and the guess it can afford is the
   * tile it is drawing: hence a lake with straight sides, hanging over the
   * ground wherever the tile reached further than the water did. */
  water: WaterField;
  /** Distance to the road centerline, m — Infinity out of corridor range
   * (beyond ~240 m). What placement code asks before planting near road. */
  roadDistanceAt: (x: number, z: number) => number;
  /** R34 — how much the ground here is a FACE THE ROAD WAS CUT THROUGH, 0
   * (open country, or a bank a car could climb) to 1 (blasted rock over the
   * verge). Nothing roots on a cutting, so the prop field reads it off the
   * soil; the analysis reads it to count how much of a stage runs through
   * rock rather than over it. */
  cutAt: (x: number, z: number) => number;
  /** R31 — the highest the ground may stand at a point for the route's
   * sake: the lowest nearby corridor's own underside, opening upward past
   * the bench at the grade it was cut at. Infinity where no road reaches.
   * What a pad placed beside the road checks its plane against, because a
   * pad is the floor on this cone and a pad over it is the wall the cone
   * exists to take down. */
  ceilingAt: (x: number, z: number) => number;
  /** R31 — the ceiling the ground here was actually held under: every
   * cone in reach, the route's and the branches', with the floors a road's
   * own shelf and a pad put on it. Where `heightAt` meets it the ground IS
   * the cut, and a fold there is a cutting's edge; where it does not the
   * ground is the country's own. The analysis reads it to tell the two
   * apart; nothing in the game asks. */
  coneAt: (x: number, z: number) => number;
  /** The surface of any road OTHER than the stage at a point: the mat of
   * an abandoned asphalt branch (R17), or null on open ground. The stage's
   * own surface comes from the track samples — this is what tells the
   * physics that a car exploring a spur is on tarmac, not in a field. */
  spurSurfaceAt: (x: number, z: number) => Surface | null;
  /** Whether this country carries a winter's blanket ANYWHERE its ground
   * stands (`snowyCountry`, climate.ts) — what everything that would
   * otherwise have to probe the field to find out asks instead. False on
   * every green stage and on the training ground, and a cheap no for the
   * whole snow model there. */
  snowy: boolean;
  /** THE WINTER'S BLANKET at a point, m (climate.ts): how deep the snow
   * the open country lies under is here — zero on and beside a road, on
   * the water, and everywhere the climate leaves the ground bare. The
   * lattice and everything drawn on it stand on TOP of it (`heightAt`
   * carries it); the car rides `CLIMATE.blanket.ride` of the way down
   * into it (`groundAt`), and the physics calls what it is standing on
   * there a `snowfield`. */
  blanketAt: (x: number, z: number) => number;
  /** R48 — THE ICE over a point, m: the flat surface of a body the cold
   * has frozen solid, or null on dry ground and on open water. Where
   * `waterAt` says "there is water here to drown in", this says "there is
   * a floor here to drive on" — the two are never both an answer. The
   * physics stands the car on it and calls it an `ice` surface; the
   * renderer draws the sheet as ice rather than as water. */
  iceAt: (x: number, z: number) => number | null;
  /** R48 — whether a body standing at this LEVEL is frozen under the
   * stage's climate. What anything holding a level rather than a point
   * asks: the drawn sheet is cut per tile against the pour's own level,
   * and that is the reading that decides which of two materials it takes. */
  frozenWater: (level: number) => boolean;
  /** Distance from a point to the nearest BUILT road that is not the stage
   * — an abandoned branch's mat edge (R17), a homestead's drive or the rim
   * of its yard (R37) — or Infinity when there is none near. Negative on
   * the thing itself. Nothing is planted or scattered where it is small:
   * the engine's forest reads it, and so does the renderer's ground cover. */
  spurClearance: (x: number, z: number) => number;
  /** The stream valleys cut so far (the renderer draws their water). */
  streams: Stream[];
  /** ...and the whole watercourses they were sliced from, source point
   * first (R18). Nothing in the game needs a river end to end — every
   * query is local, which is what the slices are for — but judging one
   * does: whether it climbs, gathers, and arrives anywhere are all
   * questions about the whole course. */
  rivers: River[];
  /** The corner guards placed so far (R14) — the renderer reads them to
   * dress the mounds, the tooling to draw them on a preview. */
  guards: CornerGuard[];
  /** R27 — the spectator stands placed so far, in stage order. The
   * renderer builds the people; the run reads the order to know which
   * crowd the car has just gone past. */
  stands: Stand[];
  /** How many times that list has CHANGED. A stand is not only added — R42
   * takes one off again where the crowd could never have reached it — so a
   * reader that rebuilds on the length alone misses a sync that placed two
   * and dropped two. */
  standRevision: number;
  /** R42 — the car parks placed so far, in stage order: where the crowd
   * left its cars, the road each is reached by and the trails in from it.
   * The renderer draws them; the pad is a pad and the road a road to this
   * field, and the cars on it are solids. */
  carParks: CarPark[];
  /** Solid wild props near a point (within `r` of it), collision-checked
   * by the physics and drawn by the renderer. */
  obstaclesNear: (x: number, z: number, r: number) => WildObstacle[];
  /** The forest's solid trunks near a point (within `r`) — same contract
   * as obstaclesNear, kept separate because trees are far denser and the
   * renderer draws them through the flora system rather than as props. */
  treesNear: (x: number, z: number, r: number) => WildObstacle[];
  /** The BUILT solids near a point (within `r`): the bays of a concrete
   * bridge's parapet (R13), and a homestead's walls, parked cars and lane
   * trees (R37). Its own query rather than part of `obstaclesNear`: these
   * are not wild props scattered on the ground, they are things standing
   * on or beside a road, the renderer draws them as part of what they
   * belong to rather than as scenery — and the physics asks for them
   * whether or not the car is off the stage, because a car on a bridge or
   * up a drive is on a road and still has to stop against them. */
  fixturesNear: (x: number, z: number, r: number) => WildObstacle[];
  /** Take a solid OUT of the world: a trunk the car snapped, a rock it
   * knocked flying. The field stops standing it, so nothing collides with
   * it again and nothing draws it — the piece that is left is a loose body
   * the renderer tumbles (`solidBreak`), not scenery either side still
   * agrees on. Felling is part of the run, not part of the seed: a fresh
   * game builds a fresh field with every trunk back up. */
  fell: (ob: WildObstacle) => void;
  /** Which grove community (index into GROVES) owns a patch of ground —
   * the one quilt both the trunk placement above and the renderer's
   * species/undergrowth choices read, so a meadow is open on both sides. */
  groveAt: (x: number, z: number) => number;
  /** ...and which sub-region (index into REGIONS) the patch sits in — the
   * scale above the groves. The renderer paints the ground from it, so a
   * bog is dark underfoot wherever the quilt says bog. */
  regionAt: (x: number, z: number) => number;
  /** Catch the field up with the track: index new samples and cut new
   * stream valleys (endless stages stream road in); prune far behind
   * `carS` so an endless run's memory stays bounded. */
  sync: (carS: number) => void;
};

/** Build the terrain field for a track. Deterministic in the track seed —
 * the engine and the renderer each build one and always agree. */
/** Every field this module actually built.
 *
 * It exists so a reader can tell a REAL terrain from a stub, which matters
 * to anything that wants to cache an answer against the TRACK rather than
 * against the field it asked: `createTerrain` takes nothing but the track,
 * so two genuine fields off one track answer identically and may share the
 * work — while a test that spreads its own `waterAt` over a field
 * (`{ ...state.terrain, waterAt: () => null }`) must not be handed the real
 * country's answers. A spread makes a NEW object, which is not in here, so
 * the distinction survives exactly the thing that would defeat a flag or a
 * property on the field itself. */
const BUILT = new WeakSet<TerrainField>();

/** Whether `field` is one this module built, rather than a stub over one. */
export function builtTerrain(field: TerrainField): boolean {
  return BUILT.has(field);
}

export function createTerrain(track: Track): TerrainField {
  const samples = track.samples;
  const cone = createCone(track);
  const {
    land,
    farField,
    biome,
    half,
    shelfEnd,
    SHELF_END2,
    lipAt,
    CORRIDOR_RANGE,
    BENCH,
    TRENCH,
    BENCH2,
    VERGE_CLIMB,
    coneRise,
    fadeWeight,
    CONE_REACH2,
    FADE_FROM2,
    keepFade,
    LOCAL_CONE,
    ceilingOf,
    resetFade,
    shape,
  } = cone;
  /** R14 — the mounds and groves that shut the inside of a sharp corner.
   * Built here, from the corner geometry, because the ground they raise
   * and the trunks they stand are both this field's to report. */
  const guards: GuardField = createGuardField(track);
  const stands: StandField = createStandField(track);
  /** R42 — where the crowd parked, and the trails in: placed from the
   * stands once they stand, for the same reason the stands are placed
   * here rather than in the compiler. */
  const carParks: CarParkField = createCarParkField(track);

  const index = createSampleIndex(track, {
    land,
    biome,
    shelfEnd,
    SHELF_END2,
    BENCH,
    BENCH2,
    VERGE_CLIMB,
    CORRIDOR_RANGE,
    CONE_REACH2,
    FADE_FROM2,
    LOCAL_CONE,
    ceilingOf,
    coneRise,
    fadeWeight,
    keepFade,
    resetFade,
  });
  const { GRID, nearestRoad, nearestSample } = index;

  const streams: Stream[] = [];
  const rivers: River[] = [];
  const spurs: SpurIndex = createSpurIndex();
  /** How many of `track.spurs` are in the index — an ingest cursor, so it
   * never rewinds when an endless run prunes the branches behind it. */
  let spurCount = 0;
  /** ...and the same for the public roads the route never met (R17), which
   * are road in every sense the terrain cares about: a shelf under them, the
   * forest off them, gravel grip on them. Never pruned — a finite stage is
   * the only kind that carries them. */
  /** ...and the same for the public roads the route never met (R17), which
   * are road in every sense the terrain cares about: a shelf under them, the
   * forest off them, gravel grip on them. Never pruned — a finite stage is
   * the only kind that carries them. */
  let publicCount = 0;
  const padField = createPadField(track, cone);
  const { pads, platforms, clearings, RIM_MAX } = padField;
  let homesteadCount = 0;
  let townCount = 0;
  let windFarmCount = 0;
  let solarFarmCount = 0;
  let powerLineCount = 0;
  const shaping = createShaping(track, cone, index, padField, { spurs, guards });
  const { shapeAt } = shaping;
  const groundField = createGround(track, cone, index, padField, shaping, {
    streams,
    spurs,
    carParks,
  });
  const {
    waterGround,
    cutAt,
    latticeAt,
    bareLatticeAt,
    blanketAt,
    groundAt,
    iceAt,
    waterAt,
    overWater,
    builtClearance,
    spurClearance,
    climate,
    heightAt,
    waterClear,
    spurSurfaceAt,
    snowy,
    clearCornerCache,
  } = groundField;
  const props = createPropField({
    seed: track.seed,
    biome,
    half,
    forestScale: knobScale(track.knobs.trees, R.forest.density),
    groundAt,
    roadNear: nearestRoad,
    sampleAt: (index) => samples[index],
    spurClearance,
    // R45 — the wayleave under the grid, or nothing at all on the seeds
    // that carry no line, which is most of them.
    underWire: (x, z) => {
      for (const line of track.powerLines) {
        if (underWayleave(line, x, z)) return true;
      }
      return false;
    },
    inAnyStream: (x, z, margin) => inStream(streams, x, z, margin),
    // R34 — the cover, MINUS whatever the road blasted off. The geology's
    // own soil is the bare country's, and the bare country never heard of
    // the cutting: read it raw and a spruce wood grows down a rock face,
    // which is the same mistake R32's rooting rule exists to stop one
    // layer further down.
    soilAt: (x, z) => land.geology.soilAt(x, z) * (1 - cutAt(x, z)),
    wetAt: land.geology.wetAt,
    guards,
    blanketAt,
  });

  // R13 — the parapets, built once off the deck runs the track already
  // carries and bucketed for the contact model to ask about. An endless
  // stage streams road in, so the build has a cursor of its own; a whole
  // stage's bridges are a few hundred bays, which is a rounding error
  // beside the forest.
  const fixtures: WildObstacle[] = [];
  const fixtureGrid = new Map<number, WildObstacle[]>();
  const FIXTURE_CELL = 24;
  let parapetScan = 0;
  const fix = (solid: WildObstacle): void => {
    fixtures.push(solid);
    const key = cellKey(Math.floor(solid.x / FIXTURE_CELL), Math.floor(solid.z / FIXTURE_CELL));
    const bucket = fixtureGrid.get(key);
    if (bucket) bucket.push(solid);
    else fixtureGrid.set(key, [solid]);
  };
  const indexParapets = (): void => {
    for (const bay of bridgeParapets(samples, track.width, parapetScan, samples.length)) fix(bay);
    // R47 — and a bore's walls, which are the same kind of thing: the one
    // other wall a stage builds on purpose.
    for (const bay of tunnelWalls(samples, track.width, parapetScan, samples.length)) fix(bay);
    parapetScan = samples.length;
  };

  const fixturesNear = (x: number, z: number, r: number): WildObstacle[] => {
    if (fixtures.length === 0) return [];
    const found: WildObstacle[] = [];
    // The fattest fixture is a parked car's half; anything further off than
    // that past `r` cannot touch.
    const reach = Math.ceil((r + 1.2) / FIXTURE_CELL);
    const cx = Math.floor(x / FIXTURE_CELL);
    const cz = Math.floor(z / FIXTURE_CELL);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        for (const bay of fixtureGrid.get(cellKey(cx + dx, cz + dz)) ?? []) {
          const ddx = bay.x - x;
          const ddz = bay.z - z;
          const hit = r + bay.radius;
          if (ddx * ddx + ddz * ddz <= hit * hit) found.push(bay);
        }
      }
    }
    return found;
  };

  let streamScan = 0;

  const sync = (carS: number): void => {
    if (
      index.pending() ||
      spurCount < track.spurs.length ||
      publicCount < track.publicRoads.length ||
      homesteadCount < track.homesteads.length ||
      townCount < track.towns.length ||
      windFarmCount < track.windFarms.length ||
      solarFarmCount < track.solarFarms.length
    ) {
      index.indexPending();
      indexParapets();
      // R37 — the homesteads, before the water is traced: a yard and a
      // drive are places a stream is not allowed to run, and they are only
      // that if the trace can see them. The drive is a road to everything
      // below (shelf, keep-off, grip); the yard is a pad; and the walls,
      // the parked cars and the lane trees are solids — footed on the
      // ground as the yard and the drive have just made it.
      for (; homesteadCount < track.homesteads.length; homesteadCount++) {
        const h = track.homesteads[homesteadCount];
        spurs.add(h.drive);
        pads.push({
          ...h.yard,
          blend: R.homestead.yard.blend,
          grade: { x: 0, z: 0 },
          sink: TILE_SINK,
          atS: h.atS,
        });
        // R37 — a farm's paddock and field keep the forest off and, when
        // ploughed, give the wheels turned soil.
        if (h.farm) {
          for (const c of farmClearings(h.farm)) clearings.push({ ...c, atS: h.atS });
        }
        for (const solid of homesteadSolids(h, heightAt)) fix(solid);
      }
      // R39 — the towns: the whole village is one graded band, every lot a
      // patch of gravel painted on it, and the walls and the cars on a lot
      // are solids footed on the ground the band has just made. The street
      // itself is road the field already has — the route, or a branch.
      for (; townCount < track.towns.length; townCount++) {
        const town = track.towns[townCount];
        const reach = Math.max(town.platform.right, town.platform.left) + RIM_MAX;
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const point of town.platform.spine) {
          if (point.x < minX) minX = point.x;
          if (point.x > maxX) maxX = point.x;
          if (point.z < minZ) minZ = point.z;
          if (point.z > maxZ) maxZ = point.z;
        }
        platforms.push({
          ...town.platform,
          minX: minX - reach,
          maxX: maxX + reach,
          minZ: minZ - reach,
          maxZ: maxZ + reach,
          routeSpan: town.street.kind === "route" ? town.street : null,
          streetSpur:
            track.spurs.find((s) => s.atS === town.atS && s.end === town.street.end) ?? null,
          atS: town.atS,
        });
        for (const lot of town.lots) {
          pads.push({ ...lot.pad, blend: R.town.lot.blend, sink: 0, atS: town.atS });
        }
        for (const solid of townSolids(town, heightAt)) fix(solid);
      }
      // R43 — the energy: every tower's crane pad is a pad, and the tower a
      // ring of solids footed on it; a solar farm is a clearing with its
      // fence, its tables and its cabin standing in it.
      for (; windFarmCount < track.windFarms.length; windFarmCount++) {
        const farm = track.windFarms[windFarmCount];
        for (const pad of windFarmPads(farm)) {
          pads.push({
            ...pad,
            blend: R.energy.wind.pad.blend,
            sink: TILE_SINK,
            grade: { x: 0, z: 0 },
            atS: farm.atS,
          });
        }
        for (const solid of windFarmSolids(farm, heightAt)) fix(solid);
      }
      for (; solarFarmCount < track.solarFarms.length; solarFarmCount++) {
        const farm = track.solarFarms[solarFarmCount];
        for (const c of solarFarmClearings(farm)) clearings.push({ ...c, atS: farm.atS });
        for (const solid of solarFarmSolids(farm, heightAt)) fix(solid);
      }
      // R45 — the grid: each tower's legs are solid to their full height,
      // and its base is a clearing so nothing grows between the legs and
      // no car park is graded round them. No PAD: a real tower stands on
      // the hillside it was cut to fit, and flattening a disc under every
      // one would put a step in the country every three hundred metres.
      // `atS: 0` because a line is not decided from the stage arc at all,
      // and only an endless stage prunes by it — which carries no grid.
      for (; powerLineCount < track.powerLines.length; powerLineCount++) {
        const line = track.powerLines[powerLineCount];
        for (const rect of powerLineFootprints(line)) {
          clearings.push({ rect, surface: null, atS: 0 });
        }
        for (const solid of powerLineSolids(line, heightAt)) fix(solid);
      }
      // The water: every crossing this stretch of road added, traced as
      // one river through them (R18) — born on the high ground, gathering
      // as it runs, ending in the lowest water it can find.
      //
      // The river reads `waterGround` — the bare country held under the
      // road's cut, and the one field a course is both traced and judged
      // against (`waterGroundAt` states why). Read the bare land alone,
      // as this did, and a cutting is invisible to the water: seed 19 ran
      // a course down a flank the corridor had taken seven metres off,
      // and the sheet stood five metres over the ground the world draws —
      // a river through the air, forty metres off the road.
      // Traced, then sliced: the field queries the slices, and the whole
      // watercourses are kept beside them because a river is only judgeable
      // end to end — the analysis walks one from its source to its mouth to
      // ask whether it ever climbs, whether it gathers, and whether it ends
      // in anything.
      for (const river of traceRivers(
        track.seed,
        collectAnchors(track, streamScan, land.surfaceAt),
        waterGround,
        // R35 — the water the courses are looking for is the water the
        // pour put on the bare country, at its own levels. Asked of the
        // BARE land and not the shaped terrain: a river ends in a lake,
        // and whether a lake is there is not a thing the road decides.
        //
        // The SHORE and not the submerged part, which is what a mouth
        // actually is: a river ends where it meets the lake, not at the
        // point it would be under it. Asking whether the water has closed
        // over the course's own last step makes a river walk past the very
        // body it was running into and go looking for the coast.
        { levelAt: land.water.shoreLevelAt, nearestAt: land.water.nearestAt },
        waterClear,
        // The country the stage occupies: a mouth that gets clear of it has
        // left the map, which is one of the two ways a river is allowed to
        // end. Without it every course that would have run off the frame
        // pools instead, and the map fills with tarns nothing feeds.
        track.bounds,
      )) {
        rivers.push(river);
        streams.push(...sliceRiver(river, climate));
      }
      streamScan = samples.length;
      // The branches the compiler forked off at the paving junctions (R17),
      // and the guards that shut the corners the road has now committed
      // (R14) — placed against the road as it stands, so a guard never
      // lands on the stage and never on a stream or a branch.
      for (; spurCount < track.spurs.length; spurCount++) spurs.add(track.spurs[spurCount]);
      // R17 — and the public roads the route never met, which the compiler
      // built along their own lines. Nothing distinguishes one from a branch
      // once it is here: same shelf, same keep-off, same grip.
      for (; publicCount < track.publicRoads.length; publicCount++) {
        spurs.add(track.publicRoads[publicCount]);
      }
      const committedS = samples[samples.length - 1].s - (track.endless ? 250 : 0);
      const roadAt = (x: number, z: number): number => nearestRoad(x, z)?.d ?? Infinity;
      guards.extend(
        committedS,
        roadAt,
        (x, z) => inStream(streams, x, z, 4) || spurClearance(x, z) < R.guard.moundClear,
      );
      // R27 — and the crowd, placed last of the three so it can refuse the
      // ground a guard's mound has just taken: spectators stand on flat
      // ground beside a corner, not up the side of the hill shutting it.
      stands.extend(
        committedS,
        roadAt,
        (x, z) =>
          overWater(x, z) ||
          inStream(streams, x, z, 4) ||
          spurClearance(x, z) < R.guard.groveClear ||
          guards.riseAt(x, z) > 0.5,
      );
      // R42 — and where that crowd parked, last of all: a car park is
      // planned from the stands, and its pad, its road and its cars go
      // into the field the moment it is placed so the next one keeps off.
      // ...and the stands it could not serve go with it: a corner with no
      // country behind it for a car park, or none a lane could reach a road
      // from, is a corner nobody could have walked to (R42).
      const refused = carParks.extend(committedS, stands.stands, {
        loose: biome.loose,
        land,
        // Clamped to the road grid's own reach — three rings of cells, the
        // `BLOCK` above: past it the answer is "nothing this near", which a
        // road being driven out reads as a promise about its next steps,
        // and a promise has to be one the grid can keep.
        routeDistance: (x, z) => Math.min(nearestRoad(x, z)?.d ?? Infinity, 3 * GRID),
        builtClearance,
        ceilingAt: (x, z) => nearestSample(x, z)?.ceiling ?? Infinity,
        blocked: (x, z) =>
          overWater(x, z) || inStream(streams, x, z, 3) || guards.riseAt(x, z) > 0.5,
        heightAt,
        commit: (park) => {
          spurs.add(park.road);
          pads.push({ ...park.pad, blend: R.carPark.pad.blend, sink: TILE_SINK, atS: park.atS });
          for (const solid of carParkSolids(park, heightAt)) fix(solid);
        },
      });
      stands.drop(refused);
      // New road may have arrived where a prop stood — revalidate; fresh
      // stream valleys reshape the ground, so the lattice re-samples too.
      props.invalidate();
      clearCornerCache();
    }
    if (!track.endless) return;
    // Forget road the run has left behind: the sample grid re-anchors to
    // the live window so fresh queries never shape themselves around it,
    // and spent stream descriptors stop taxing the carve.
    const floorS = carS - 700;
    if ((index.windowFrom() ?? Infinity) < floorS - 400) {
      index.reanchor(floorS);
      while (streams.length > 0 && streams[0].centerS < floorS) streams.shift();
      guards.pruneBefore(floorS);
      stands.pruneBefore(floorS);
      carParks.pruneBefore(floorS);
      spurs.pruneBefore(floorS);
      // Not in stage order: a town's lots and a homestead's yard are
      // ingested list by list, so the whole set is sifted.
      for (let i = pads.length - 1; i >= 0; i--) if (pads[i].atS < floorS) pads.splice(i, 1);
      for (let i = platforms.length - 1; i >= 0; i--) {
        if (platforms[i].atS < floorS) platforms.splice(i, 1);
      }
      for (let i = clearings.length - 1; i >= 0; i--) {
        if (clearings[i].atS < floorS) clearings.splice(i, 1);
      }
      props.invalidate();
      clearCornerCache();
    }
  };

  sync(0);

  const roadDistanceAt = (x: number, z: number): number => nearestRoad(x, z)?.d ?? Infinity;
  const lidAt = (x: number, z: number): number => {
    const near = nearestRoad(x, z);
    if (
      near &&
      near.d <= CORRIDOR_RANGE &&
      samples[near.index].tunnel &&
      near.d < lipAt(near.index) + TRENCH
    )
      return farField(x, z);
    return heightAt(x, z);
  };
  const ceilingAt = (x: number, z: number): number => nearestSample(x, z)?.ceiling ?? Infinity;
  const coneAt = (x: number, z: number): number => {
    shapeAt(x, z);
    return shape.ceiling;
  };

  const field: TerrainField = {
    heightAt,
    groundAt,
    latticeAt,
    bareLatticeAt,
    farHeightAt: farField,
    waterGroundAt: waterGround,
    lidAt,
    geology: land.geology,
    waterAt,
    water: land.water,
    roadDistanceAt,
    cutAt,
    ceilingAt,
    coneAt,
    spurSurfaceAt,
    snowy,
    blanketAt,
    iceAt,
    frozenWater: land.frozen,
    streams,
    rivers,
    guards: guards.guards,
    stands: stands.stands,
    // A getter: the field's own counter moves as the sync places and drops
    // stands, and a number copied out here would be the count at the moment
    // the terrain was built, forever.
    get standRevision(): number {
      return stands.revision;
    },
    carParks: carParks.carParks,
    obstaclesNear: props.obstaclesNear,
    fixturesNear,
    spurClearance,
    treesNear: props.treesNear,
    fell: props.fell,
    groveAt: props.groveAt,
    regionAt: props.regionAt,
    sync,
  };
  BUILT.add(field);
  // The training ground is the one place in this game that was not
  // generated: where a track carries one, it owns the ground inside its own
  // berm and the country the seed built keeps everything outside it. Done
  // HERE, on the way out of the only constructor there is, so the engine,
  // the renderer, the tests and the tooling all get the same field off the
  // same track without any of them being told to ask for it.
  if (track.arena === null) return field;
  const ground = arenaTerrain(field, track.arena);
  BUILT.add(ground);
  return ground;
}
