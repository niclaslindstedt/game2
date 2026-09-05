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

import { createRng } from "../lib/prng.ts";
import { blockOffsets, cellKey } from "../lib/math.ts";
import { smooth, valueNoise } from "../lib/noise.ts";
import type { Surface, Track, TrackSample } from "./compile.ts";
import { createGuardField, type CornerGuard, type GuardField } from "./guards.ts";
import { createStandField, type Stand, type StandField } from "./stands.ts";
import { carParkSolids, createCarParkField, type CarPark, type CarParkField } from "./carparks.ts";
import {
  BANK,
  traceRivers,
  type River,
  type RiverAnchor,
  type RoadClear,
  type StandingWater,
} from "./river.ts";
import {
  corridorOffset,
  handoverAt,
  junctionFlat,
  junctionPlatformY,
  ROAD_CROSS,
  vergeOffset,
  type RoadShape,
} from "./road.ts";
import { createLandField } from "./land.ts";
import { arenaTerrain } from "./arena-field.ts";
import { GROUND_CELL, TILE_SINK } from "./lattice.ts";
import type { WaterField } from "./water.ts";
import type { GeologyField } from "./geology.ts";
import { STAGE_RULES as R, knobScale } from "./rules.ts";
import {
  createSpurIndex,
  SPUR_INDEX_REACH,
  spurReach,
  type SpurIndex,
  type SpurLine,
} from "./spurs.ts";
import { biomeRules } from "./biomes.ts";
import { createPropField } from "./props.ts";
import { bridgeParapets, type WildObstacle } from "./solids.ts";
import { farmClearings, rectDistance, type FarmRect } from "./farms.ts";
import { homesteadSolids } from "./homesteads.ts";
import { townSolids, type TownPlatform } from "./towns.ts";
import { solarFarmClearings, solarFarmSolids, windFarmPads, windFarmSolids } from "./energy.ts";
import { powerLineFootprints, powerLineSolids, underWayleave } from "./powerline.ts";

export { LAKE_Y } from "./land.ts";
export { GROVE_SCALE, REGION_SCALE, type GroveCommunity, type Region } from "./biomes.ts";
export { GROUND_CELL, TILE_SINK } from "./lattice.ts";
/** Plain dirt road extrapolated straight past each stage end, m — the
 * rally start's run-up before the gate, and run-off past the flying
 * finish. The terrain keeps its shelf flat under the same corridor so the
 * apron never floats or drowns, the physics rides it, and R26 keeps every
 * other road off it. One number, stated in the rule book. */
export const APRON = R.startZone.apron;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// ── Streams ───────────────────────────────────────────────────────────────

export type Stream = {
  /** Water surface centerline, world space, source first — each point
   * carrying the half-width of the water there, because a river is not the
   * same size along its length (R18). */
  points: { x: number; z: number; y: number; w: number }[];
  /** Widest half-width in this piece, meters — what the bounding box is
   * padded by and what a cheap rejection tests against. */
  halfWidth: number;
  /** How far below its surface the bed is cut, m — a ford's is ankle-deep
   * and a bridged river's is over the roof (R13). */
  depth: number;
  /** True when the road crosses this water on a DECK rather than through
   * it: the renderer spans it, and the water runs well below the road. */
  bridged: boolean;
  /** Arc position of the crossing this piece belongs to (chunk
   * association / pruning). */
  centerS: number;
  /** Loose bounding box (bed + the widest bank), for cheap carve rejection. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** The lowest the bed gets along this piece, m — what bounds the widest
   * bank any point could owe it, so a query over flat country is rejected
   * on the nine-metre bank and not the fifty-metre one. */
  bedMin: number;
};

/** How far below the water surface a ford's bed is carved, meters. */
const BED_DEPTH = 0.45;
/** R31 — a BANK IS A SLOPE A CAR CAN CLIMB OUT OF. The channel blends from
 * its bed back onto the country over `BANK` metres at least, and further
 * wherever the country stands high enough over the bed that nine metres
 * would make a wall of it: the blend is a smoothstep, whose steepest point
 * is one and a half times its mean, so the run a drop needs is that over
 * `verge.climbable`. A brook in flat country keeps its nine-metre banks; a
 * river ten metres down in a valley gets a bank twenty-five metres wide,
 * which is what a river bank is. `BANK_MAX` bounds it, and sizes the box a
 * stream's carve is rejected by. */
const BANK_RUN = 1.5 / R.verge.climbable;
const BANK_MAX = 50;
/** How far a surface may stand over water and still be IN it, m — a ford's
 * crown sheds the water it wades, and a road's camber is not a bank. */
const WADE_LIP = 0.2;
/** Points per sliced piece of river — enough that a bounding box is worth
 * testing, few enough that a test which passes has little left to walk. */
const RIVER_CHUNK = 8;

/** Cut one traced river into the pieces every consumer actually queries:
 * a short polyline with its own bounding box. Consecutive pieces overlap
 * by a point, so the water is continuous across the seam. */
function sliceRiver(river: River): Stream[] {
  const out: Stream[] = [];
  const points = river.points;
  for (let i = 0; i + 1 < points.length; i += RIVER_CHUNK - 1) {
    const slice = points.slice(i, i + RIVER_CHUNK);
    if (slice.length < 2) break;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let halfWidth = 0;
    let bestAnchor = river.anchors[0];
    let bestD = Infinity;
    for (const p of slice) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      if (p.halfWidth > halfWidth) halfWidth = p.halfWidth;
      for (const anchor of river.anchors) {
        const d = Math.hypot(anchor.x - p.x, anchor.z - p.z);
        if (d < bestD) {
          bestD = d;
          bestAnchor = anchor;
        }
      }
    }
    const pad = halfWidth + BANK_MAX;
    let bedMin = Infinity;
    for (const p of slice) if (p.y - river.depth < bedMin) bedMin = p.y - river.depth;
    out.push({
      points: slice.map((p) => ({ x: p.x, z: p.z, y: p.y, w: p.halfWidth })),
      halfWidth,
      depth: river.depth,
      bridged: river.bridged,
      centerS: bestAnchor.s,
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
      bedMin,
    });
  }
  return out;
}

/** R12 — the valley floor under a crossing: the lowest ground the
 * crossing's POOL touches. A ford is a pool the road wades, and a pool has
 * one level: the water on the road and the water beside it are the same
 * water. Laid at the road's own ground on a hillside, the sheet on the
 * road stood a metre over the river running off it on the downhill side —
 * a step in a water surface, which is the one thing water never does.
 *
 * Read at the places the pool actually lies: the road's centerline; the
 * river's BANKS there, which run ALONG the road (`water.bankReach` either
 * way, the higher of the two — a crossing on a rise along the road would
 * lay its water over both), and the ground the water leaves the crossing
 * over, a step and two steps out across the road on the lower side,
 * where the course holds the crossing's level before it falls
 * (`river.ts`'s `POOL_REACH`). Not the higher side: the water comes DOWN
 * into the pool from there, in its own gully, and reading it would dig
 * every hillside crossing to the level of the ground below it. */
export function valleyUnder(
  at: { x: number; z: number; heading: number },
  landAt: (x: number, z: number) => number,
): number {
  const ax = Math.sin(at.heading);
  const az = Math.cos(at.heading);
  const lx = Math.cos(at.heading);
  const lz = -Math.sin(at.heading);
  const reach = R.water.bankReach;
  const banks = Math.max(
    landAt(at.x + ax * reach, at.z + az * reach),
    landAt(at.x - ax * reach, at.z - az * reach),
  );
  const right = landAt(at.x + lx * POOL_STEP * 2, at.z + lz * POOL_STEP * 2);
  const left = landAt(at.x - lx * POOL_STEP * 2, at.z - lz * POOL_STEP * 2);
  const side = right < left ? 1 : -1;
  const near = landAt(at.x + lx * POOL_STEP * side, at.z + lz * POOL_STEP * side);
  return Math.min(landAt(at.x, at.z), banks, Math.min(right, left), near);
}

/** How far the river walks in one step, m — `river.ts`'s stride, read
 * here so the crossing's valley is read where the course will stand. */
const POOL_STEP = 14;

/** Collect the road's water crossings in `samples[fromIndex..)` as river
 * anchors (R18): where the road meets water, at what level, how wide, and
 * whether it wades or spans. The WATER itself is then traced through them
 * — the road says where it crosses, the landscape says where the river
 * runs. */
export function collectAnchors(
  track: Track,
  fromIndex: number,
  /** The bare land's height at a point, m — where the water under a DECK
   * is laid (R13). A ford's water is the road's own dip and needs nothing;
   * a bridge's is the stream the deck spans, and a stream lies in its
   * valley whatever the road was doing: a road crossing the valley on an
   * embankment stands that much higher over it, the way a viaduct does.
   * Held at the deck's own clearance instead, a bridge on fill anchored
   * its river fifteen metres over the country and R18 drew it floating
   * above both banks. Optional, for tooling that only wants the crossings;
   * without it the water sits at the clearance. */
  valleyAt?: (x: number, z: number) => number,
): RiverAnchor[] {
  const samples = track.samples;
  const anchors: RiverAnchor[] = [];
  const wet = (s: TrackSample): boolean => s.surface === "water" || s.deck !== null;
  let i = Math.max(0, fromIndex);
  // Never split a run: back up to its start if we landed inside one.
  while (i > 0 && wet(samples[i - 1])) i--;
  for (; i < samples.length; i++) {
    if (!wet(samples[i])) continue;
    let j = i;
    while (j < samples.length && wet(samples[j])) j++;
    const mid = samples[Math.floor((i + j - 1) / 2)];
    const runLength = samples[j - 1].s - samples[i].s + track.step;
    const deck = mid.deck;
    anchors.push({
      x: mid.x,
      z: mid.z,
      // A ford's water lies at the road; a deck stands AT LEAST its
      // clearance above it — more where the road crosses the valley on
      // fill — and the channel below is cut deep enough to drown a car.
      waterY: deck
        ? Math.min(
            mid.elevation - R.bridge.clearance[deck],
            valleyAt ? valleyUnder(mid, valleyAt) - BED_DEPTH : Infinity,
          )
        : mid.elevation,
      heading: mid.heading,
      // A ford's water is as wide as the ford is long, and a little more
      // (`fordOutside`): the course leaves the crossing ACROSS the road
      // (R18's `acrossRoad`), so the sheet the anchor draws lies along
      // the road for its half-width — and the aprons start climbing where
      // the flat ends. Sized to the road's own width instead, the sheet
      // stood two metres deep on the apron of every ford.
      halfWidth: deck
        ? Math.max(6, runLength / 2 - 1.5)
        : Math.max(3.5, runLength / 2 + R.water.fordOutside),
      depth: deck ? R.bridge.depth : BED_DEPTH,
      bridged: deck !== null,
      edge: mid.width / 2 + R.water.fordOutside,
      s: mid.s,
    });
    i = j;
  }
  // R12 — and the culverts: the road stands on its fill and the stream
  // goes under it. Not a run of samples — the surface is road the whole
  // way over one — so the compiler wrote each down (`track.culverts`), at
  // the valley's own level. Each is a crossing like any other to the water:
  // the course arrives at it, passes under the road, and leaves across it.
  const fromS = fromIndex < samples.length ? samples[Math.max(0, fromIndex)].s : Infinity;
  for (const culvert of track.culverts) {
    if (culvert.s < fromS) continue;
    anchors.push({
      x: culvert.x,
      z: culvert.z,
      waterY: culvert.waterY,
      halfWidth: culvert.halfWidth,
      depth: BED_DEPTH,
      bridged: false,
      culvert: true,
      edge: culvert.edge,
      s: culvert.s,
      heading: culvert.heading,
    });
  }
  anchors.sort((a, b) => a.s - b.s);
  return anchors;
}

/** Trace the watercourses a batch of crossings implies and cut them into
 * queryable pieces. The field itself keeps the traced courses as well as
 * the pieces, so it does the two steps separately; this is the one-call
 * version for tooling that only wants water it can query. */
export function computeStreams(
  seed: number,
  anchors: RiverAnchor[],
  farHeight: (x: number, z: number) => number,
  standingAt: StandingWater,
  roadClear?: RoadClear,
): Stream[] {
  return traceRivers(seed, anchors, farHeight, standingAt, roadClear).flatMap(sliceRiver);
}

/** Distance from a point to the water's centerline, plus the surface
 * height and the half-width THERE — a river narrows and widens along its
 * length, so every query has to answer with the local size. */
function nearestOnStream(
  s: Stream,
  x: number,
  z: number,
): { d: number; waterY: number; width: number } {
  let bestD2 = Infinity;
  let waterY = 0;
  let width = s.halfWidth;
  for (let i = 0; i < s.points.length - 1; i++) {
    const a = s.points[i];
    const b = s.points[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)),
    );
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < bestD2) {
      bestD2 = d2;
      waterY = a.y + (b.y - a.y) * t;
      width = a.w + (b.w - a.w) * t;
    }
  }
  return { d: Math.sqrt(bestD2), waterY, width };
}

/** Carve the stream valley into a landscape height: inside the water line
 * the ground drops to the bed; across the bank it blends back to `base`.
 * Only ever lowers — a stream never builds a levee. */
export function carveGround(streams: Stream[], x: number, z: number, base: number): number {
  let ground = base;
  for (const s of streams) {
    // The widest bank this piece could owe a point at this height, and the
    // box shrunk to it: the walk down the piece's points is the whole cost
    // of the carve, and over flat country almost every piece in the box is
    // thrown away here on its nine-metre bank.
    const widest = Math.min(BANK_MAX, Math.max(BANK, (base - s.bedMin) * BANK_RUN));
    const slack = BANK_MAX - widest;
    if (x < s.minX + slack || x > s.maxX - slack || z < s.minZ + slack || z > s.maxZ - slack) {
      continue;
    }
    const { d, waterY, width } = nearestOnStream(s, x, z);
    if (d > width + widest) continue;
    const bed = waterY - s.depth;
    const drop = Math.max(0, base - bed);
    const bank = Math.min(BANK_MAX, Math.max(BANK, drop * BANK_RUN));
    if (d > width + bank) continue;
    const target = bed + smooth(clamp01((d - width) / bank)) * drop;
    if (target < ground) ground = target;
  }
  return ground;
}

/** True when a point stands in a stream's bed or on its banks — nothing
 * should grow there. */
export function inStream(streams: Stream[], x: number, z: number, margin: number): boolean {
  for (const s of streams) {
    if (x < s.minX - margin || x > s.maxX + margin || z < s.minZ - margin || z > s.maxZ + margin) {
      continue;
    }
    const near = nearestOnStream(s, x, z);
    if (near.d < near.width + BANK + margin) return true;
  }
  return false;
}

/** Water surface height of a stream at a point, or null when the point is
 * not over stream water. */
function streamWaterAt(streams: Stream[], x: number, z: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const s of streams) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const { d, waterY, width } = nearestOnStream(s, x, z);
    // The NEAREST water wins, not the first found: two reaches of the same
    // course (or two courses) can both cover a point, and answering with
    // whichever happened to be indexed first puts the surface at the wrong
    // height — under a bridge, that is metres of clearance out.
    if (d < width && d < bestD) {
      bestD = d;
      best = waterY;
    }
  }
  return best;
}

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
  /** The landscape far from any road (mountains and sea included) — what
   * streams read to find their downhill side, and tooling can preview. */
  farHeightAt: (x: number, z: number) => number;
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
  const seed = (track.seed ^ 0x1b873593) >>> 0;
  const rng = createRng(seed);
  // The bare landscape draws the first of these for itself (land.ts); it
  // is still taken from the stream here so everything after it keeps the
  // seed it has always had.
  rng.int(1, 1 << 30);
  const sideSeed = rng.int(1, 1 << 30);

  // ── Corridor queries: a spatial hash over the road samples ─────────────
  // Rebuilt from the live window as an endless run moves on, so a fresh
  // query never snaps to road the world has already forgotten.
  const samples = track.samples;
  const GRID = 48;
  /** A grid cell's road: the sample indices in it, with their positions
   * alongside. The search below walks a hundred-odd of these per query and
   * only ever wants the two coordinates, so they are kept out here rather
   * than fetched through a sample object each time. */
  /** R31 — a cell's road, and the ceiling each sample of it imposes. The
   * ceiling is a PLANE, not a height: the corridor's own underside at the
   * sample (`top`), tilting away on the surface the road is actually built
   * on — its longitudinal grade AND its bank, together in `px`/`pz`. Both
   * halves matter. Without the grade, a road descending a hillside drags
   * the ground beside it down to the lowest point it reaches within a
   * bench; without the bank, a banked corner's high side is cut to the
   * height of its low one, which is a metre of trench along every fast
   * turn. `floor` is the lowest value the plane can hand back inside the
   * bench — the rejection that keeps the root and the dot product off most
   * of the candidates. */
  type Cell = {
    index: number[];
    x: number[];
    z: number[];
    top: number[];
    px: number[];
    pz: number[];
    floor: number[];
    /** R34 — the grade this sample's cone opens at past the bench, m per m.
     * `verge.climb` where the ground is till and the road was scraped in;
     * up to `verge.cut.face` where it is rock and the road was blasted
     * through it. Per sample rather than one constant, because it is a
     * property of what the road is and what it is cut through, and both
     * change along a stage. Never BELOW `VERGE_CLIMB`, which is what keeps
     * `cellFloor`'s rejection bound valid. */
    climb: number[];
    /** The box the cell's samples actually occupy, and the lowest `floor`
     * among them. Together they let a query REJECT a whole cell without
     * touching a sample — see `nearestSample`, where they are most of the
     * work the search does not do. A cell holds only the road that runs
     * through it, so its box is usually a ribbon across a corner of the
     * 48 m square rather than the square. */
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    minFloor: number;
    /** ...and the span of ARC the cell's samples cover, as indices, so a
     * search for the OTHER arm of the stage can skip a cell holding only
     * the arm it already has. */
    minIndex: number;
    maxIndex: number;
  };
  const emptyCell = (): Cell => ({
    index: [],
    x: [],
    z: [],
    top: [],
    px: [],
    pz: [],
    floor: [],
    climb: [],
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
    minFloor: Infinity,
    minIndex: Infinity,
    maxIndex: -Infinity,
  });
  let grid = new Map<number, Cell>();
  let firstIndexed = 0;
  let indexed = 0;

  /** R34 — the grade the country beside one piece of road is allowed to
   * stand at, m per m past the bench.
   *
   * Four things decide it, and all four are the rule in one line each:
   * whether the road is CUT IN here at all, what it is cut through (rock
   * stands, till slumps), what the road is worth (a blasted tarmac cutting
   * or a scraped gravel one), and how hard the country is
   * (`knobs.steepness`). Multiplied rather than taken as a max, because a
   * cutting needs all four: a sealed road running down a valley on its own
   * embankment gets the same soft bank a farm track does, and so does a
   * sealed road cut deep into a hillside of till.
   *
   * The FIRST of them is the one that decides where cuttings are, and it
   * only means anything because the road follows the country
   * (`elevation.follow`): most of a stage runs along the low ground at or
   * over natural grade, and the answer there is R31's own climb with soil
   * beside it. A road at a height of its own invention is arbitrarily cut
   * in everywhere, and then so are its rock faces.
   *
   * A bridge has no cut. It stands in the air over a channel, and giving
   * its cone a face would wall in the ravine underneath it. */
  const cutClimb = (s: TrackSample): number => {
    if (s.deck != null) return VERGE_CLIMB;
    const C = R.verge.cut;
    // How far the road's grade runs UNDER the ground it is crossing: what
    // a cutting is, measured where it is.
    const depth = land.heightAt(s.x, s.z) - s.elevation;
    const into = clamp01((depth - C.depth.from) / (C.depth.full - C.depth.from));
    if (into <= 0) return VERGE_CLIMB;
    const worth = s.surface === "asphalt" ? C.sealed : C.loose;
    // R32 — the cover, read out on the FLANKS rather than under the
    // centerline. A cutting is not on the road, it is up the side of it,
    // and those are different ground: the road lies along the valley where
    // the till is deep, and the shoulder it had to force is scoured. Read
    // at the road's own position instead and almost no stage ever gets a
    // cutting, because almost no road runs over bare rock.
    //
    // The THINNER of the two, because the two sides are not symmetric and
    // the cone is: one side of a road is nearly always the high one, that
    // is the side with something to cut, and steep ground is the ground
    // with no cover left on it. The low side has nothing standing on it for
    // a grade to bind.
    const cos = Math.cos(s.heading);
    const sin = Math.sin(s.heading);
    const soil = Math.min(
      land.geology.soilAt(s.x + BENCH * cos, s.z - BENCH * sin),
      land.geology.soilAt(s.x - BENCH * cos, s.z + BENCH * sin),
    );
    const rock = 1 - clamp01(soil / C.soil);
    const face = knobScale(track.knobs.steepness, C.face);
    return VERGE_CLIMB + (face - VERGE_CLIMB) * into * worth * rock;
  };

  const indexSamples = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      const s = samples[i];
      const key = cellKey(Math.floor(s.x / GRID), Math.floor(s.z / GRID));
      let cell = grid.get(key);
      if (!cell) grid.set(key, (cell = emptyCell()));
      const top = ceilingOf(s);
      // The road's own grade here, from its neighbours: one sample step
      // either side, which is the finest the compiled centerline holds.
      const back = samples[i > 0 ? i - 1 : i];
      const fwd = samples[i + 1 < samples.length ? i + 1 : i];
      const run = fwd.s - back.s;
      const slope = run > 1e-6 ? (fwd.elevation - back.elevation) / run : 0;
      // Forward is (sin h, cos h) and the lateral axis (cos h, -sin h), so
      // the surface `elevation + slope * along - bank * lateral` has this
      // gradient. One vector, and the query is a dot product.
      const sinH = Math.sin(s.heading);
      const cosH = Math.cos(s.heading);
      const bank = s.bank ?? 0;
      const px = slope * sinH - bank * cosH;
      const pz = slope * cosH + bank * sinH;
      const floor = top - Math.hypot(px, pz) * BENCH;
      cell.index.push(i);
      cell.x.push(s.x);
      cell.z.push(s.z);
      cell.top.push(top);
      cell.px.push(px);
      cell.pz.push(pz);
      cell.floor.push(floor);
      cell.climb.push(cutClimb(s));
      if (s.x < cell.minX) cell.minX = s.x;
      if (s.x > cell.maxX) cell.maxX = s.x;
      if (s.z < cell.minZ) cell.minZ = s.z;
      if (s.z > cell.maxZ) cell.maxZ = s.z;
      if (floor < cell.minFloor) cell.minFloor = floor;
      if (i < cell.minIndex) cell.minIndex = i;
      if (i > cell.maxIndex) cell.maxIndex = i;
    }
    nearCx = NaN;
  };

  // The neighbourhood a query last looked at. Everything that asks where the
  // road is asks about points a few meters apart — the four lattice corners
  // under a wheel, the six probes a ground reading takes around itself, the
  // candidate props in a cell — and at 48 m to a cell those keep landing in
  // the same 7x7 block. Holding that block's non-empty buckets turns a
  // repeat query from forty-nine map lookups into a walk of the two or three
  // that actually hold road. Invalidated whenever the index changes shape.
  //
  // Held in RING ORDER, nearest ring first, and that ordering is what makes
  // the rejection below work: the block reaches 140 m and the road within a
  // few metres is what sets the ceiling, so walking the middle first arrives
  // at the outer rings with a bound low enough to throw them away whole.
  let nearCx = NaN;
  let nearCz = NaN;
  const nearCells: Cell[] = [];
  const BLOCK = blockOffsets(3);

  /** Squared distance from a point to a cell's SAMPLE box — zero inside it.
   * The rejection bound: nothing in the cell is nearer than this, and
   * nothing in it can hold a cone lower than `minFloor` lifted by the climb
   * over that distance. */
  const boxDistance2 = (cell: Cell, x: number, z: number): number => {
    const dx = x < cell.minX ? cell.minX - x : x > cell.maxX ? x - cell.maxX : 0;
    const dz = z < cell.minZ ? cell.minZ - z : z > cell.maxZ ? z - cell.maxZ : 0;
    return dx * dx + dz * dz;
  };

  /** The LOWEST ceiling any sample in `cell` could impose on a point that
   * far from its box. Inside the bench a sample's plane cannot fall below
   * its own `floor`; past it the cone lifts that by the verge grade, which
   * at a hundred metres is forty-odd metres of clearance and is why almost
   * every outer-ring cell is thrown away without being read.
   *
   * `VERGE_CLIMB` and not the sample's own R34 grade on purpose: this is a
   * LOWER bound on what the cell could impose, and a cut only ever opens
   * the cone FASTER. Reading a cell's steepest grade here would reject
   * cells that still had something to say. */
  const cellFloor = (cell: Cell, d2: number): number =>
    d2 <= BENCH2 ? cell.minFloor : cell.minFloor + (Math.sqrt(d2) - BENCH) * VERGE_CLIMB;

  /** WHERE THE ROAD IS, and nothing about how high the ground beside it may
   * stand. Every caller but one wants only this. */
  type RoadNear = { d: number; index: number; lateral: number };

  type Near = RoadNear & {
    /** R31 — the highest the ground may stand here for this road's sake:
     * the lowest nearby corridor's own underside, opening upward at
     * `verge.climb` once past the bench. Infinity where no road reaches.
     * FINAL only over the cones outside their fade: the ones letting go are
     * left in `fadeCone` for `fadeCeiling` to finish once the ground they
     * rise toward is known. */
    ceiling: number;
    /** ...and the same cone over the road this point is BESIDE alone. A cone
     * may cut the country between two arms of a stage; it may not cut the
     * ground out from under one of them, and this is the floor that says so
     * — see `rawHeight`. */
    own: number;
    /** R34 — the grade `own` was opened at, so `rawHeight` can take exactly
     * that rise back off again. Reading `verge.climb` there instead leaves
     * the difference standing as a lip right at the corridor's lip, which
     * on a blasted cutting is metres of it. */
    ownClimb: number;
    /** THE OTHER ARMS: of every sample of a different stretch of the stage
     * — more than `ARM_WINDOW` samples of arc from the nearest — the one
     * whose FILL stands highest here (`other`, run out from its shelf at
     * the verge grade) and the one whose CUT holds the country lowest
     * (`deep`, its bench climbing back at the same grade), each with its
     * distance, or -1 where the corridor's blend reach holds only the one
     * arm. `shapeAt` carries that fill and that cut across the line where
     * this arm becomes nearer: the country between two arms at two heights
     * belongs to the higher one's embankment until that has come down to
     * the ground, and to the lower one's bench until that has climbed
     * back, not to whichever happens to be closer. Picked by what they
     * STAND at rather than by distance, because the nearest sample outside
     * the window is as often the same road fifty metres further along —
     * whose fill and cut are this road's own — as it is another arm, and
     * the real arm behind it was then hidden (seed 11). */
    other: number;
    otherD: number;
    deep: number;
    deepD: number;
  };
  /** How far apart along the stage two samples have to be before they are
   * two ARMS rather than one road, in samples: fifty metres of arc. Short
   * enough that a hairpin's two legs count — a hairpin CLIMBING ten metres
   * between its legs is two roads at two heights, and the lower leg's
   * ground took a ten metre step where the upper leg's fill was dropped —
   * and long enough that the next few samples of the same straight never
   * do (their fill line is this road's own, further off, and lower). */
  const ARM_WINDOW = 25;

  /** Pick up the non-empty cells of the block around `(cx, cz)` into
   * `nearCells`, if the last query was not already standing in it. */
  const block = (cx: number, cz: number): void => {
    if (cx === nearCx && cz === nearCz) return;
    nearCx = cx;
    nearCz = cz;
    nearCells.length = 0;
    for (let i = 0; i < BLOCK.length; i += 2) {
      const cell = grid.get(cellKey(cx + BLOCK[i], cz + BLOCK[i + 1]));
      if (cell) nearCells.push(cell);
    }
  };

  /** The stage's END APRONS (R24): the dirt extrapolated straight past each
   * end sample, which is road the terrain shelves like road. A point past
   * an end is as far from the road as it is from the apron's SPINE — the
   * end sample's line, out to `APRON` — and the sample it belongs to is
   * that end sample. Asked on EVERY query, not only when the end sample
   * happens to be the nearest: past a curved end an earlier sample of the
   * route can be nearer than the end one, and a distance that switched
   * from the spine's to that sample's — sixty metres, across one lattice
   * cell — took the corridor's whole cross-section with it, a wall beside
   * the apron at either end of the stage. Writes the nearer end into
   * `apron` and says whether there was one. Both searches end here. */
  const apron = { index: -1, d: 0, lateral: 0 };
  const nearerApron = (x: number, z: number, d: number): boolean => {
    apron.index = -1;
    for (let end = 0; end < 2; end++) {
      const i = end === 0 ? firstIndexed : samples.length - 1;
      const s = samples[i];
      const sinH = Math.sin(s.heading);
      const cosH = Math.cos(s.heading);
      const lon = (x - s.x) * sinH + (z - s.z) * cosH;
      const out = end === 0 ? -lon : lon;
      if (out <= 0) continue;
      const lateral = (x - s.x) * cosH - (z - s.z) * sinH;
      const spine = Math.hypot(lateral, Math.max(0, out - APRON));
      if (spine >= d) continue;
      d = spine;
      apron.index = i;
      apron.d = spine;
      apron.lateral = lateral;
    }
    return apron.index >= 0;
  };

  /** The nearest road sample and nothing else — no verge cone, and so no
   * reason to read a candidate the box test has already put further off than
   * the answer in hand.
   *
   * That is the whole point of it being its own search. The cone is a MIN
   * over every corridor in reach, so `nearestSample` has to keep reading
   * cells it can never win the distance with; the corridor surface, the
   * road-clearance field and the prop placement want none of that, and they
   * are between them most of the queries the field ever answers. */
  const nearestRoad = (x: number, z: number): RoadNear | null => {
    block(Math.floor(x / GRID), Math.floor(z / GRID));
    let best = -1;
    let bestD2 = Infinity;
    for (let c = 0; c < nearCells.length; c++) {
      const cell = nearCells[c];
      const bx = x < cell.minX ? cell.minX - x : x > cell.maxX ? x - cell.maxX : 0;
      const bz = z < cell.minZ ? cell.minZ - z : z > cell.maxZ ? z - cell.maxZ : 0;
      if (bx * bx + bz * bz >= bestD2) continue;
      const cellX = cell.x;
      const cellZ = cell.z;
      for (let k = 0; k < cellX.length; k++) {
        const ddx = x - cellX[k];
        const ddz = z - cellZ[k];
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= bestD2) continue;
        bestD2 = d2;
        best = cell.index[k];
      }
    }
    if (best < 0) return null;
    const d = Math.sqrt(bestD2);
    if (nearerApron(x, z, d)) return { d: apron.d, index: apron.index, lateral: apron.lateral };
    const s = samples[best];
    const lateral = (x - s.x) * Math.cos(s.heading) - (z - s.z) * Math.sin(s.heading);
    return { d, index: best, lateral };
  };

  const nearestSample = (x: number, z: number): Near | null => {
    block(Math.floor(x / GRID), Math.floor(z / GRID));
    let best = -1;
    let bestD2 = Infinity;
    fadeCount = 0;
    // R31 — the verge cone, taken over every sample in reach rather than
    // over the nearest one alone. At a hairpin the two arms are a road's
    // width apart and it is the LOWER one that says how high the ground
    // between them may stand; answering off whichever happened to be
    // nearer leaves the other arm walled in.
    let ceiling = Infinity;
    // The winning sample's own cell and slot, so its own cone can be taken
    // after the walk: the loop skips the arithmetic for most candidates on
    // purpose, and the nearest one is often among them.
    let bestCell: Cell | null = null;
    let bestSlot = -1;
    for (let c = 0; c < nearCells.length; c++) {
      const cell = nearCells[c];
      // Two questions a cell can answer, and a cell that can answer NEITHER
      // is skipped whole. It holds no nearer sample if its box is already
      // further off than the best, and it can lower no ceiling if the
      // lowest cone it could possibly hold is already above the one in
      // hand. Both bounds are exact, so this changes only the work.
      const boxD2 = boxDistance2(cell, x, z);
      if (boxD2 >= bestD2 && (boxD2 >= CONE_REACH2 || cellFloor(cell, boxD2) >= ceiling)) continue;
      const cellX = cell.x;
      const cellZ = cell.z;
      for (let k = 0; k < cellX.length; k++) {
        const ddx = x - cellX[k];
        const ddz = z - cellZ[k];
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = cell.index[k];
          bestCell = cell;
          bestSlot = k;
        }
        // Nothing this sample could say is lower than what has already been
        // said — which is most of them, and what keeps the square root and
        // the dot product off the hot loop.
        if (cell.floor[k] >= ceiling) continue;
        if (d2 <= BENCH2) {
          const flat = cell.top[k] + ddx * cell.px[k] + ddz * cell.pz[k];
          if (flat < ceiling) ceiling = flat;
        } else if (d2 < CONE_REACH2) {
          // Past the bench the plane is held at the bench's own rim and the
          // cone opens above it. Holding it matters: a road on a 1-in-2 dip
          // extrapolated over the query's whole reach would carve a trench
          // a hundred metres out of a hillside it never touches.
          const d = Math.sqrt(d2);
          const hold = BENCH / d;
          const rise =
            cell.top[k] + (ddx * cell.px[k] + ddz * cell.pz[k]) * hold + coneRise(d, cell.climb[k]);
          if (rise >= ceiling) continue;
          // In the fade the cone is not final — it rises toward ground the
          // walk has not built yet — so it is kept, not taken. Only ever
          // below the running min, which is a bound on it either way.
          if (d2 >= FADE_FROM2) keepFade(rise, fadeWeight(d, CORRIDOR_RANGE), cell.climb[k]);
          else ceiling = rise;
        }
      }
    }
    if (best < 0) return null;
    /** The distance to the nearest SAMPLE, which is what its own cone is
     * opened at whether or not the apron's spine stands nearer. */
    const rawD = Math.sqrt(bestD2);
    let d = rawD;
    const s = samples[best];
    let lateral = (x - s.x) * Math.cos(s.heading) - (z - s.z) * Math.sin(s.heading);
    let index = best;
    if (nearerApron(x, z, d)) {
      index = apron.index;
      d = apron.d;
      lateral = apron.lateral;
    }
    // The other arm, where there is one in reach. Only asked once the point
    // is past the nearest arm's own shelf — inside it that arm owns the
    // ground outright — and rejected cell by cell on the box AND on the arc
    // the cell holds, so a stage with one arm here costs a few comparisons.
    // The end aprons are arms too, measured from their spine: a stage that
    // finishes beside its own start has the start's apron cut into the
    // hillside thirty metres from the finish stretch, and dropping that
    // cut where the finish becomes nearer was a step across the line.
    let other = -1;
    let otherD2 = CONE_REACH2;
    let otherStand = -Infinity;
    let deep = -1;
    let deepD2 = CONE_REACH2;
    let deepHold = Infinity;
    if (bestD2 > SHELF_END2) {
      const lo = index - ARM_WINDOW;
      const hi = index + ARM_WINDOW;
      /** Take a sample of another arm as the fill and the cut candidate,
       * by what each stands at here. A fill stands no higher than its
       * road and a cut holds no lower, so the road's own height throws a
       * sample out before its distance is taken. */
      const consider = (at: number, d2: number): void => {
        const e = samples[at].elevation;
        if (e > otherStand) {
          const stand = e - Math.max(0, Math.sqrt(d2) - shelfEnd) * VERGE_CLIMB;
          if (stand > otherStand) {
            otherStand = stand;
            other = at;
            otherD2 = d2;
          }
        }
        if (e < deepHold) {
          const hold = e + Math.max(0, Math.sqrt(d2) - shelfEnd) * VERGE_CLIMB;
          if (hold < deepHold) {
            deepHold = hold;
            deep = at;
            deepD2 = d2;
          }
        }
      };
      for (let c = 0; c < nearCells.length; c++) {
        const cell = nearCells[c];
        if (cell.minIndex >= lo && cell.maxIndex <= hi) continue;
        if (boxDistance2(cell, x, z) >= CONE_REACH2) continue;
        const cellX = cell.x;
        const cellZ = cell.z;
        for (let k = 0; k < cellX.length; k++) {
          const at = cell.index[k];
          if (at >= lo && at <= hi) continue;
          const ddx = x - cellX[k];
          const ddz = z - cellZ[k];
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 >= CONE_REACH2) continue;
          consider(at, d2);
        }
      }
      if (nearerApron(x, z, CORRIDOR_RANGE) && (apron.index < lo || apron.index > hi)) {
        consider(apron.index, apron.d * apron.d);
      }
    }
    // The NEARBY cone: the same min, over the road this point is actually
    // beside rather than over every corridor in reach. `rawHeight` uses it
    // as a floor, so that a road sixty metres off and twenty metres down
    // cannot take the hillside out from under this one.
    //
    // A min and not the nearest SAMPLE's plane alone: samples are 2 m apart
    // and the point at a corner's outer lip is nearest to a neighbour whose
    // plane extrapolates a few centimetres over the verge here. Smoothing
    // that is half of what the full min was doing, and a floor that undid
    // it would put a lip back along the outside of every corner.
    //
    // Only computed where a distant cone is actually cutting below the
    // nearest road's own plane, which is rare: everywhere else the answer is
    // the ceiling itself and the second walk never happens.
    let own = Infinity;
    let ownClimb = VERGE_CLIMB;
    if (bestCell && bestSlot >= 0) {
      const ddx = x - bestCell.x[bestSlot];
      const ddz = z - bestCell.z[bestSlot];
      const tilt = ddx * bestCell.px[bestSlot] + ddz * bestCell.pz[bestSlot];
      ownClimb = bestCell.climb[bestSlot];
      own =
        bestD2 <= BENCH2
          ? bestCell.top[bestSlot] + tilt
          : bestCell.top[bestSlot] +
            (tilt * BENCH) / rawD +
            coneRise(rawD, bestCell.climb[bestSlot]);
      if (ceiling < own) {
        const window = rawD + LOCAL_CONE;
        const window2 = window * window;
        for (let c = 0; c < nearCells.length; c++) {
          const cell = nearCells[c];
          // The same two rejections as the walk above, against this walk's
          // own bounds: a cell outside the window holds nothing to consider,
          // and one whose lowest possible cone is already above `own` cannot
          // lower it.
          const boxD2 = boxDistance2(cell, x, z);
          if (boxD2 > window2 || cellFloor(cell, boxD2) >= own) continue;
          for (let k = 0; k < cell.x.length; k++) {
            const ddx2 = x - cell.x[k];
            const ddz2 = z - cell.z[k];
            const d2 = ddx2 * ddx2 + ddz2 * ddz2;
            if (d2 > window2) continue;
            const t = ddx2 * cell.px[k] + ddz2 * cell.pz[k];
            let here: number;
            if (d2 <= BENCH2) here = cell.top[k] + t;
            else {
              const dk = Math.sqrt(d2);
              here = cell.top[k] + (t * BENCH) / dk + coneRise(dk, cell.climb[k]);
            }
            if (here < own) {
              own = here;
              ownClimb = cell.climb[k];
            }
          }
        }
      }
    }
    return {
      d,
      index,
      lateral,
      ceiling,
      own,
      ownClimb,
      other,
      otherD: Math.sqrt(otherD2),
      deep,
      deepD: Math.sqrt(deepD2),
    };
  };

  // The bare landscape the road was laid across (land.ts) — the same
  // country the branch builder steered by, so nothing here can disagree
  // with where the water is.
  const land = createLandField(track.seed, track.knobs);
  const farField = land.heightAt;
  // R40 — the country: its quilt, its loose surface, what its woods shed.
  const biome = biomeRules(track.knobs.biome);

  // Per-side embankment grade along the stage, m per m of distance from the
  // shoulder: positive climbs into a hillside wall, negative drops toward a
  // valley (or the sea the lakes make). Varies slowly with arc position.
  //
  // R34 — the two sides are ONE number read twice, with opposite signs, and
  // that is the whole rule. A road laid across a slope is BENCHED into it:
  // cut on the uphill side, filled on the downhill, because that is the
  // cheapest way to get a level road onto a hillside and it is what every
  // mountain road on earth looks like. Drawing the two sides independently
  // — which is what this did — puts them both uphill about half the time,
  // and at the top of the steepness dial half a stage came out walled in on
  // both sides for four hundred metres at a stretch. That is not a cutting,
  // it is a tunnel with the lid off.
  //
  // A THROUGH-CUT, rock standing up both sides at once, is still built: it
  // is what `tilt` is for, and it happens where the hillside is levelling
  // off and the country either side of the road is high anyway. It comes
  // out short, which is exactly what a through-cut is — you pass through
  // one, you do not drive down it.
  //
  // `steepness` scales the RISING half and only that half: how steep the
  // hillside the road is cut into stands is what the dial was asked about;
  // how far a car that goes over the other edge falls is not.
  const sideLean = knobScale(track.knobs.steepness, R.geology.steep.bank);
  const sideGrade = (s: number, side: number): number => {
    const lean = (valueNoise(s, 0, 210, sideSeed) - 0.5) * 2;
    const tilt = -0.28 + valueNoise(s, 37.1, 330, sideSeed + 3) * 0.55;
    const raw = tilt + side * lean * 0.62;
    // R31, read the other way round: the FALLING side is a fill's own
    // slope, and a road's edge may fall away no harder than a car could
    // drive back up it. Drawn from the noise alone it reached 0.9 m per m,
    // and on a road standing thirty metres over a hollow the lattice
    // corners just past the lip fell metres below it — a face along the
    // outside of the embankment on every high fill of a dozen seeds.
    return raw > 0 ? raw * sideLean : Math.max(raw, -VERGE_CLIMB);
  };

  const half = track.width / 2;
  const shelfEnd = half + ROAD_CROSS.reach; // the ribbon's own outer edge
  const SHELF_END2 = shelfEnd * shelfEnd;
  /** How far past the nominal edge a lip has to stand to be a junction
   * mouth's FLARE (R17) rather than R33's gravel wander, m — a quarter of
   * the road: the wander is under a fifth, the flare a whole one. */
  const FLARE_LIP = track.width * 0.25;
  /** How far out the corridor shapes the ground beside the sample at
   * `index`, m: the widest the mat gets within a few samples of it, plus
   * the verge.
   *
   * An ENVELOPE rather than the sample's own width, because the corridor is
   * found by the nearest CENTERLINE point while the lip is a question about
   * the mat: at a junction's mouth the road opens by half its width in one
   * two-metre step (R17), so a probe standing at a wide sample's lip is
   * often nearest to a narrow one alongside — and the ground then hands
   * over inside the ribbon, which is a face along the outside of the mouth.
   * Taking the widest can only ever level a little more ground than the mat
   * needs, and a little more flat ground beside a junction is what a
   * junction has. */
  const LIP_ENVELOPE = 4;
  const lipAt = (index: number): number => {
    let widest = 0;
    const lo = Math.max(0, index - LIP_ENVELOPE);
    const hi = Math.min(samples.length - 1, index + LIP_ENVELOPE);
    for (let i = lo; i <= hi; i++) {
      // R17 — how far the mat REACHES, not how wide it is: a mouth opens on
      // one side, so its far edge stands `shift + width / 2` out and the
      // shelf has to be under all of it.
      const reach = 2 * Math.abs(samples[i].shift ?? 0) + samples[i].width;
      if (reach > widest) widest = reach;
    }
    // Never NARROWER than the nominal corridor. A gravel road wanders
    // either side of nominal all the way down a stage (R33), and letting
    // the shelf breathe in and out with it would move the ground beside
    // every metre of every road to buy nothing — the wander is centimetres
    // and the verge already absorbs it. What this exists for is the mouth,
    // which is metres, so it only ever reaches further OUT.
    return Math.max(shelfEnd, widest / 2 + ROAD_CROSS.reach);
  };
  /** How far from the road the corridor still shapes the ground, m — see
   * rawHeight; inside the sample grid's own search reach on purpose. */
  const CORRIDOR_RANGE = 140;
  /** R14 — the mounds and groves that shut the inside of a sharp corner.
   * Built here, from the corner geometry, because the ground they raise
   * and the trunks they stand are both this field's to report. */
  const guards: GuardField = createGuardField(track);
  const stands: StandField = createStandField(track);
  /** R42 — where the crowd parked, and the trails in: placed from the
   * stands once they stand, for the same reason the stands are placed
   * here rather than in the compiler. */
  const carParks: CarParkField = createCarParkField(track);

  /** How far past a branch's own corridor its shelf is still the branch's,
   * m — the whole of the branch index's search reach less the widest
   * corridor a branch has and a cell of slack, because a shelf still
   * standing where the index stops finding the branch ends at a cell
   * boundary instead of where it means to. As long as it can be, so a
   * fill's run-out has landed on the country long before it is let go. */
  const SPUR_BLEND = SPUR_INDEX_REACH - R.roadWidth.max / 2 - ROAD_CROSS.reach - GROUND_CELL / 2;
  /** Where a fill's side has LANDED on the country by, m off the route's
   * centerline: the road's reach, so nothing is left for `letGo` to bring
   * down. */
  const LAND_BY = CORRIDOR_RANGE;
  /** The country under the route's centerline at each sample, m — read
   * once per sample and kept, because a fill's side is sized off it under
   * every height beside the road (`fillGrade`). Grown as the samples are
   * (endless), so a plain array rather than a typed one. */
  const groundUnder: number[] = [];
  const groundUnderAt = (index: number): number => {
    let g = groundUnder[index];
    if (g === undefined) {
      const s = samples[index];
      g = farField(s.x, s.z);
      groundUnder[index] = g;
    }
    return g;
  };
  /** THE GRADE A FILL'S SIDE FALLS AT, m per m, for the sample at `index`
   * seen from `d` metres off where the country stands at `far`: the verge
   * grade (R31 the other way round — a car could drive back up it), and
   * steeper only where the country itself falls away from under the road
   * so fast that a side at the verge grade would never land on it.
   *
   * An embankment's side has to MEET the ground: seed 10's road stood
   * twenty-two metres over a hillside falling at half a metre per metre,
   * and a side falling at the verge's 0.45 ran parallel to that hillside
   * for as far as the road could be found, then dropped the whole twenty
   * metres at the seam where it could not — the analysis's 55° wall. So
   * the side is sized to land by `LAND_BY`: the country's own fall from the
   * road to here (`hill`, read off the ground under the centerline and the
   * ground at this point) plus what it takes to close the fill's height
   * over that run. On level country that is the verge grade for any fill
   * under forty metres; on a hillside it is the hillside's grade and a
   * little, which is what a fill laid on a hillside stands at. */
  const fillGrade = (index: number, d: number, lip: number, far: number): number => {
    const s = samples[index];
    const g0 = groundUnderAt(index);
    const hill = Math.max(0, (g0 - far) / Math.max(d, R.verge.bench));
    const land = (s.elevation - g0 + hill * LAND_BY) / (LAND_BY - lip);
    return Math.max(VERGE_CLIMB, land);
  };
  /** A branch's own corridor edge, m off its centerline — the ribbon and
   * the verge. A branch is never banked, so its cross-section is symmetric
   * and the unsigned distance is the whole story. */
  const spurEdge = (spur: SpurLine): number => spur.width / 2 + ROAD_CROSS.reach;
  /** THE END OF A ROAD'S REACH, where the road stops being found and its
   * earthworks stop with it: whatever still stands over or under the
   * country there is brought back onto it at `verge.climbable`, the
   * steepest a road may build. `room` is how far off the country the
   * earthworks may still stand this far short of the reach — nothing at
   * the reach itself, so there is no seam to find — and inside it the
   * run-out is the run-out, untouched.
   *
   * A fill lands on the country at its own grade and a cut climbs back onto
   * it at its own: the line is the run-out, and it needs no easing. Eased
   * toward the country from the lip, as every run-out here once was, the
   * easing ADDED its grade to the line's: a smoothstep over a hundred and
   * ten metres releases up to one and a half per cent of the height it is
   * still holding per metre, which on a thirty-metre fill is another 0.4 on
   * top of the verge grade — and with the corridor's own ease onto the
   * line on top of that, seed 9's embankment fell at 48° for twenty metres.
   * Every one of the three was a climbable grade on its own. A smoothstep
   * over the LAST forty metres only was the next answer, and it did the
   * same to whatever had not landed by then — a branch on a sixty metre
   * fill over a basin (seed 9 again). A bound has no grade of its own. */
  const letGo = (shaped: number, far: number, d: number, reach: number): number => {
    const room = Math.max(0, reach - d) * CLIMBABLE;
    return Math.min(far + room, Math.max(far - room, shaped));
  };

  // ── R31: the rideable verge ───────────────────────────────────────────
  // A rally car spends half a stage off the road, and the one thing it must
  // always be able to do is come back. So the landscape does not get the
  // last word next to a road: whatever the country was doing there, the
  // ground is CUT to a cone opening upward off the road's own underside.
  // Inside the BENCH the cone is flat, which is what pins the ground
  // lattice under the tarmac; outside it the ground may climb, but only at
  // a grade the wheels can take.
  /** Radius of the flat bench, m, measured from a road's centerline. */
  const BENCH = Math.max(shelfEnd, R.verge.bench);
  const BENCH2 = BENCH * BENCH;
  const VERGE_CLIMB: number = R.verge.climb;
  const CLIMBABLE: number = R.verge.climbable;
  /** R34 — how far out a CUT FACE may begin, m from the centerline. The
   * bench is one lattice cell diagonal, sized so every corner of a cell the
   * road crosses is pinned under it; the face has to start a whole cell
   * OUTSIDE that, because a corner just past the bench is still a corner
   * the bilinear ground under the corridor's own lip is interpolated from.
   * Start the face at the bench itself and a fourteen-metre rock wall lifts
   * the outermost vertex of the road mesh with it — R16's hand-over opens
   * back up into the vertical face down the side of the road it exists to
   * close. What it buys, besides being correct, is a car's worth of runoff
   * between the tarmac and the rock. */
  const CUT_FROM = BENCH + GROUND_CELL;

  /** How far a cone opens above its road's own underside at distance `d`,
   * m — R31's runoff out to `CUT_FROM`, then R34's face beyond it. Zero
   * inside the bench. One function, four callers (the ceiling walk, the
   * two `own` walks and the floor that takes the rise back off), because
   * a cone measured one way and undone another is a lip along the road. */
  const coneRise = (d: number, climb: number): number =>
    d <= BENCH
      ? 0
      : (Math.min(d, CUT_FROM) - BENCH) * VERGE_CLIMB + Math.max(0, d - CUT_FROM) * climb;
  /** R31 — where a cone LETS GO: how much of the ground it was cutting it
   * has given back at distance `d`, 0 at the start of the last `verge.fade`
   * metres of its reach and 1 at the reach. A cone is a min, and a min that
   * is simply not asked past its reach ends in a WALL — the country
   * standing however high it stands one query cell further out, ruled
   * dead straight along the lattice. Beside a mountain that was fifty
   * metres of vertical rock, two hundred metres from any road, on ground
   * no rule had touched. So over the fade the cone RISES TO MEET the
   * ground it is cutting, by this much of the excess that ground stands
   * over it: at the reach it stands exactly on the ground and there is no
   * seam to find, however high the mountain. A shoulder a few metres over
   * the cone is given back as a shoulder; a mountain is given back as a
   * face — and `cutAt` reads that face's grade off `fadeGrade` and calls it
   * rock where it is steeper than a car can climb (`verge.climbable`), so
   * the one thing this never builds is a grass hillside the car stops
   * against. A smoothstep, so the cone's own grade is C1 into the fade and
   * the fade's steepest point is one and a half times its mean. */
  const FADE = R.verge.fade;
  const fadeFrom = (reach: number): number => Math.max(BENCH, reach - FADE);
  const fadeWeight = (d: number, reach: number): number => {
    const from = fadeFrom(reach);
    return d <= from ? 0 : smooth(clamp01((d - from) / (reach - from)));
  };
  /** The grade a cone letting go stands the ground at, m per m, for an
   * excess of `over` metres at distance `d`: what is left of its own climb,
   * plus the fade's STEEPEST point — its mean over the fade, times the
   * smoothstep's peak — rather than the slope at this one point. The
   * point's own slope is exact for the analytic field and wrong for the
   * ground: a lattice cell spans a seventh of the fade, and a triangle
   * whose middle reads a gentle start has a corner on the steep part. The
   * peak is the face the whole band is, and the band is what gets called
   * rock. */
  const fadeGrade = (w: number, reach: number, climb: number, over: number): number =>
    (1 - w) * climb + (1.5 * over) / (reach - fadeFrom(reach));
  /** How far out the cone is still worth asking about, m. By here it stands
   * tens of metres over the road and binds on nothing but a cliff — and
   * where it does not bind, dropping it costs the query nothing. */
  const CONE_REACH2 = CORRIDOR_RANGE * CORRIDOR_RANGE;
  const FADE_FROM2 = fadeFrom(CORRIDOR_RANGE) ** 2;
  /** ...and how far a BRANCH's cone reaches, m: the distance its index is
   * guaranteed to find it within, so the cone has let go before the branch
   * can stop being found. */
  const SPUR_CONE_REACH = SPUR_INDEX_REACH;
  /** The route's cones caught LETTING GO on the last walk: each one's
   * height without the fade, how far it has let go (`fadeWeight`), and the
   * sample's own grade. The fade rises toward the ground the roads have
   * SHAPED at this point — a branch's shelf, a guard's mound — and that
   * ground is not known until `shapeAt` has built it, after the walk; so
   * the walk keeps the cones it cannot yet resolve and `fadeCeiling`
   * finishes them. Scratch, rewritten per query, and kept as a PARETO
   * FRONT: a cone standing no lower than another that has let go no
   * further can never end up under it, whatever the ground turns out to
   * be, so it is dropped on arrival. A road passing a hundred metres off
   * puts a couple of hundred samples in the fade, and the walk meets the
   * near ones first, so what survives is a handful — the lowest road at
   * each distance. */
  const fadeCone: number[] = [];
  const fadeW: number[] = [];
  const fadeClimb: number[] = [];
  let fadeCount = 0;
  const keepFade = (cone: number, w: number, climb: number): void => {
    let n = 0;
    for (let i = 0; i < fadeCount; i++) {
      if (fadeCone[i] <= cone && fadeW[i] <= w) return;
      if (fadeCone[i] >= cone && fadeW[i] >= w) continue;
      fadeCone[n] = fadeCone[i];
      fadeW[n] = fadeW[i];
      fadeClimb[n] = fadeClimb[i];
      n++;
    }
    fadeCone[n] = cone;
    fadeW[n] = w;
    fadeClimb[n] = climb;
    fadeCount = n + 1;
  };
  /** R31 — the fade resolved: the lowest the route's cones stand once each
   * has risen toward `ground` by its own fade. `ceiling` is the min over
   * the cones NOT in the fade (already final). Writes the grade the winning
   * fade stands the ground at into `shape.fadeGrade` — zero when a cone
   * outside the fade wins, or when nothing stands over the fade. */
  const fadeCeiling = (ceiling: number, ground: number): number => {
    let grade = 0;
    for (let i = 0; i < fadeCount; i++) {
      const cone = fadeCone[i];
      const over = ground - cone;
      const w = fadeW[i];
      const here = over > 0 ? cone + w * over : cone;
      if (here < ceiling) {
        ceiling = here;
        grade = over > 0 ? fadeGrade(w, CORRIDOR_RANGE, fadeClimb[i], over) : 0;
      }
    }
    shape.fadeGrade = grade;
    return ceiling;
  };
  /** How much further than the nearest road a corridor may be and still
   * count as the road this point is BESIDE, m — see `Near.own`. Comfortably
   * over the sample spacing, so a corner's whole neighbourhood is in; well
   * under R23's `roadClear`, so a second road never is. */
  const LOCAL_CONE = 8;

  /** The underside of a road's corridor at one sample: where the OUTER
   * VERGE sits — the lowest line anything drawn there stands on — sunk by
   * the tile clearance. Measured level, because the bank that tilts it is
   * carried by the plane the cone is evaluated on; taking the low side's
   * height as a flat ceiling instead would cut a metre of trench along the
   * high side of every banked corner. A bridge DECK stands over a ravine on
   * purpose and pins nothing. */
  const ceilingOf = (shape: RibbonSample): number =>
    shape.deck != null
      ? Infinity
      : shape.elevation + vergeOffset(ROAD_CROSS.reach, shape.lift, 0) - TILE_SINK;

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
  let publicCount = 0;
  /** R37 + R39 — the PADS: discs of graded ground the landscape is
   * flattened to. A homestead's yard (its DRIVE goes into the branch index
   * above — it is a road, and gets a road's shelf) and every lot of a
   * town. Each carries its own `blend`: a yard out in a field is eased back
   * onto the country over a long rim, a lot on a village street over a
   * short one, because the next lot is a few metres away. Same ingest
   * cursor discipline as the branches. */
  const pads: {
    x: number;
    z: number;
    y: number;
    radius: number;
    blend: number;
    /** The plane the pad is graded to, m per m: level for a yard, the
     * street's own fall for a lot on one. */
    grade: { x: number; z: number };
    /** How far the TILES duck under `y` here, m. A yard, a car park and a
     * crane pad are drawn as their own disc over the tiles the way a road
     * is drawn over them, and duck by the tile clearance; a town's lot is
     * a patch of gravel PAINTED on ground its whole village is graded
     * level with (R39's platform), so its tiles are the surface and there
     * is nothing to duck under. */
    sink: number;
    /** Where on the stage it belongs, for the endless prune. */
    atS: number;
  }[] = [];
  let homesteadCount = 0;
  let townCount = 0;
  let windFarmCount = 0;
  let solarFarmCount = 0;
  let powerLineCount = 0;
  /** R31 — A RIM IS A SLOPE A CAR CAN CLIMB. A pad or a village's band is
   * eased back onto the country over its `blend` at least, and over more
   * wherever the country stands far enough over or under it that the
   * blend would make a wall of the rim: a smoothstep's steepest point is
   * one and a half times its mean, so the run a drop needs is that over
   * `verge.climbable`. A yard on a flat keeps its eleven metres; a village
   * graded into a hillside twenty metres below the ground behind its back
   * gardens gets a bank fifty metres wide instead of a cliff — which is
   * what the back of a hillside village is. `RIM_MAX` bounds it, and is
   * the reach a pad is rejected by. */
  const RIM_RUN = 1.5 / CLIMBABLE;
  const RIM_MAX = 120;
  const rimOf = (blend: number, drop: number): number =>
    Math.min(RIM_MAX, Math.max(blend, Math.abs(drop) * RIM_RUN));

  /** How much of a pad's level applies at a point — 1 on the pad, fading
   * to 0 over its rim past its radius — and the level itself. `ground` is
   * what the rim eases onto, which is what sizes it. Where two
   * pads reach the same point (a street's lots overlap at their rims) the
   * nearest pad's level holds on the pad itself and gives way to the
   * others' only through its rim, so a row of lots on a grade is a row of
   * level pads with a shallow step in each gap, and never a face where two
   * discs meet — nor a lot that leans toward its neighbour. Null anywhere
   * no pad reaches. */
  const padAt = (x: number, z: number, ground: number): { y: number; weight: number } | null => {
    let weight = 0;
    let level = 0;
    let othersSum = 0;
    let othersWeight = 0;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      const reach = pad.radius + RIM_MAX;
      const dx = x - pad.x;
      const dz = z - pad.z;
      if (dx * dx + dz * dz >= reach * reach) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      const here = pad.y - pad.sink + pad.grade.x * dx + pad.grade.z * dz;
      const w = 1 - smooth(clamp01((d - pad.radius) / rimOf(pad.blend, here - ground)));
      if (w <= 0) continue;
      if (w > weight) {
        if (weight > 0) {
          othersSum += level * weight;
          othersWeight += weight;
        }
        weight = w;
        level = here;
      } else {
        othersSum += here * w;
        othersWeight += w;
      }
    }
    if (weight <= 0) return null;
    if (othersWeight <= 0) return { y: level, weight };
    return { y: level * weight + (othersSum / othersWeight) * (1 - weight), weight };
  };
  /** R39 — THE VILLAGE PLATFORMS: one band of graded ground per town, laid
   * along its street and reaching past the back of its deepest lot on each
   * side (`towns.ts` sizes it). Not a pad, and not a wider pad either: a
   * pad is a disc narrower than the ground lattice, and the whole point of
   * a band hundreds of metres long is that the lattice's corners actually
   * fall inside it, so the flattening reaches the surface the houses stand
   * on instead of falling between the corners. */
  type Platform = TownPlatform & {
    /** The band's bounding box with its rim, for a cheap rejection. */
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    /** WHICH ROAD the street is — the route's own arc where the town stands
     * on the run the rally borrows, the branch where it stands along an
     * abandoned arm. The band owns the ground under its own street (that is
     * what stops the lattice under the mat pulling the ground beside a
     * front wall about) and yields it under every other road. */
    routeSpan: { fromS: number; toS: number } | null;
    streetSpur: SpurLine | null;
    /** Where on the stage it belongs, for the endless prune. */
    atS: number;
  };
  const platforms: Platform[] = [];
  /** The nearest piece of any village's band to a point: the two spine
   * points it lies between and how far along, how far out it is, on which
   * side, and how far the band reaches THERE. Null where no band is near.
   *
   * The nearest by DISTANCE, and that matters: a band forty metres wide is
   * at full weight against a hundred metres of its own spine at once, so
   * picking the strongest claim instead picks whichever piece of street the
   * walk reached first — and grades the ground behind one house to the level
   * of the street three hundred metres back, which is a metre of the
   * street's own fall taken as a step in the middle of the village. */
  const nearestBand = (
    x: number,
    z: number,
  ): {
    band: Platform;
    a: Platform["spine"][number];
    b: Platform["spine"][number];
    /** How far along the segment, 0..1. */
    t: number;
    /** Distance to the segment, m — to the SEGMENT and not across it, so a
     * band ends in a rounded cap past its last point instead of running on
     * down the street's own bearing for ever. */
    d: number;
    /** Signed offset across the street, m: positive on its own right. */
    lat: number;
    /** How far the band reaches on that side here, m. */
    out: number;
  } | null => {
    let best = Infinity;
    let hit = null as {
      band: Platform;
      a: Platform["spine"][number];
      b: Platform["spine"][number];
      t: number;
      d: number;
      lat: number;
      out: number;
    } | null;
    for (let i = 0; i < platforms.length; i++) {
      const band = platforms[i];
      if (x < band.minX || x > band.maxX || z < band.minZ || z > band.maxZ) continue;
      for (let k = 0; k + 1 < band.spine.length; k++) {
        const a = band.spine[k];
        const b = band.spine[k + 1];
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const len2 = ex * ex + ez * ez;
        if (len2 <= 0) continue;
        let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const dx = x - (a.x + ex * t);
        const dz = z - (a.z + ez * t);
        const d = Math.hypot(dx, dz);
        if (d >= best) continue;
        best = d;
        // Which side of the street: the street's own right is (ez, -ex) —
        // the same turn `towns.ts` takes to put a lot on a side, so `right`
        // here is the side the record calls right.
        const lat = (dx * ez - dz * ex) / Math.sqrt(len2);
        const out =
          lat >= 0
            ? a.outRight + (b.outRight - a.outRight) * t
            : a.outLeft + (b.outLeft - a.outLeft) * t;
        hit = { band, a, b, t, d, lat, out };
      }
    }
    return hit;
  };

  /** The level a town's band grades the ground to at a point and how much
   * of it applies there — 1 inside the band, fading to 0 over its rim
   * (sized against `ground`, what the rim eases onto — see `rimOf`), and
   * null where no band reaches. */
  const platformAt = (
    x: number,
    z: number,
    ground: number,
  ): { y: number; weight: number; band: Platform } | null => {
    const hit = nearestBand(x, z);
    if (hit === null) return null;
    const { band, a, b, t, d, lat, out } = hit;
    if (d - out >= RIM_MAX) return null;
    // The two verges' levels, crossed over between them, so the band is one
    // continuous plane from one side of the street to the other.
    const toRight = smooth(clamp01((lat + band.lip) / (2 * band.lip)));
    const right = a.right + (b.right - a.right) * t;
    const left = a.left + (b.left - a.left) * t;
    const y = left + (right - left) * toRight;
    const weight = 1 - smooth(clamp01((d - out) / rimOf(band.blend, y - ground)));
    if (weight <= 0) return null;
    return { y, weight, band };
  };

  /** R23 + R31 — how much of a point inside a village's band the band is
   * still allowed to shape: all of it out in the country and on its own
   * street, none of it inside any OTHER road's drawn corridor, handed back
   * over the same lattice cell the corridor hands over across.
   *
   * A road stands on its own shelf, and a village's level laid across one
   * walls its edge in at over a metre per metre — which is exactly what
   * R31's cone exists to take down. The placer keeps the band off the roads
   * it can see (`bandOut`), and this is what covers the ones it cannot: a
   * town is stood the moment its piece of tarmac closes, and the route it
   * is graded beside may not be built for another three hundred metres. */
  const bandHold = (
    band: Platform,
    near: { d: number; index: number } | null,
    spur: { d: number; spur: SpurLine } | null,
  ): number => {
    let hold = 1;
    if (near !== null) {
      const s = samples[near.index].s;
      const own = band.routeSpan !== null && s >= band.routeSpan.fromS && s <= band.routeSpan.toS;
      if (!own) hold *= 1 - holdOf(near.d, lipAt(near.index));
    }
    if (spur !== null && spur.spur !== band.streetSpur) {
      hold *= 1 - holdOf(spur.d, spurReach(spur.spur));
    }
    return hold;
  };

  /** R39 — distance from a point to the nearest village's graded ground, m,
   * negative inside it; Infinity when there is no town near. What the
   * watercourses steer by, for the reason they steer round a road: a stream
   * through a village street is a village street standing in a stream, and
   * a channel cut through the band leaves the houses beside it hanging over
   * a gully. */
  const platformClearance = (x: number, z: number): number => {
    const hit = nearestBand(x, z);
    return hit === null ? Infinity : hit.d - hit.out;
  };

  /** Distance from a point to the nearest yard's rim, m — negative on the
   * pad, Infinity when there is none near. */
  const padClearance = (x: number, z: number): number => {
    let best = Infinity;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      const d = Math.hypot(x - pad.x, z - pad.z) - pad.radius;
      if (d < best) best = d;
    }
    return best;
  };
  /** R37 — the CLEARINGS: a farm's paddock and its field. Not pads — the
   * ground under them is the country's own, a meadow lies on a slope — but
   * ground the forest and the scatter keep off, and (a ploughed field)
   * ground with a surface of its own. Read through `spurClearance` like
   * everything else that is not forest, so one function still answers
   * "may anything stand here". */
  const clearings: { rect: FarmRect; surface: Surface | null; atS: number }[] = [];
  const clearingAt = (x: number, z: number): { d: number; surface: Surface | null } => {
    let best = Infinity;
    let surface: Surface | null = null;
    for (let i = 0; i < clearings.length; i++) {
      const c = clearings[i];
      // A cheap box first: a rect's reach is its half-diagonal.
      const reach = Math.hypot(c.rect.width, c.rect.depth) / 2 + 1;
      if (Math.abs(x - c.rect.x) > reach || Math.abs(z - c.rect.z) > reach) continue;
      const d = rectDistance(c.rect, x, z);
      if (d < best) {
        best = d;
        surface = c.surface;
      }
    }
    return { d: best, surface };
  };

  /** Anything with a road's cross-section: a stage sample or a branch's
   * (the branch has no bridges, so its deck is simply absent). */
  type RibbonSample = RoadShape & { elevation: number };

  /** The corridor's own cross-section at a SIGNED lateral offset from a
   * road's center: the mat's crown and wheel tracks inside the edge, its
   * shoulder and the ground leaning away outside it (road.ts). One function
   * for the stage road and for an abandoned branch — they are the same kind
   * of thing.
   *
   * The offset is signed because the corridor is not symmetric: a banked
   * corner (R19) tilts the whole cross-section by `-bank * lateral`, so the
   * outside of the turn rides metres proud of the inside. Handing this an
   * unsigned DISTANCE banks both verges the same way, and then one side of
   * every corner is drawn a metre away from where the physics rides it —
   * which is a car that sinks into the ground beside the road. */
  const ribbonY = (s: RibbonSample, lateral: number, width: number): number =>
    s.elevation + corridorOffset(s, lateral, width);

  /** Which side of a road a point is on, never 0 — `Math.sign` would
   * collapse a dead-centre point's offset to zero along with its sign. */
  const sideOf = (lateral: number): number => (lateral < 0 ? -1 : 1);

  /** R17 — the junction platforms, as ground: inside one the corridor is a
   * single graded plane on the MAIN road's own slope, whichever road's
   * verge would otherwise have run through it. Returns the plane's height
   * there and how much of it applies (1 in the middle, fading over the
   * platform's rim), or null. Both carriageways were warped onto this same
   * plane when they were compiled, so nothing has to be reconciled here —
   * the ground simply agrees with the roads standing on it. */
  const apronAt = (x: number, z: number): { y: number; weight: number } | null => {
    let best: { y: number; weight: number } | null = null;
    for (const junction of track.junctions) {
      const weight = junctionFlat(junction, x, z);
      if (weight <= 0) continue;
      if (best && best.weight >= weight) continue;
      best = { y: junctionPlatformY(junction, x, z), weight };
    }
    return best;
  };

  /** How much of a point is a ROAD's ground rather than the country's: 1
   * inside a corridor, spent one ground cell past its lip. That reach is
   * the same argument R31's bench is built on — a lattice triangle spans a
   * cell, so a corner within a cell of the corridor is one a triangle can
   * carry straight across the road, and a corner the far cone hollowed out
   * takes the road's own edge down with it. */
  const holdOf = (d: number, edge: number): number => 1 - smooth(clamp01((d - edge) / GROUND_CELL));

  /** The corridor's cross-section BEYOND ITS LIP, for the sample at `index`
   * seen from `d` metres off on the side `lateral` says: the embankment or
   * the cutting the road imposes, bounded by the country and eased back
   * onto it.
   *
   * `sideGrade` is a shape the road imposes — a cutting on the uphill
   * side, an embankment on the downhill one, drawn from noise rather than
   * measured off the land. Run out unbounded it is a hillside the road
   * invents — at seventy metres a third of a grade is twenty metres of
   * ground that is not there, and because it is keyed to whichever sample
   * happens to be NEAREST, two arms of a stage passing each other hand
   * adjacent lattice corners two different inventions: seed 19's junction
   * had 38.6 m of it beside 11.1 m, a twenty-eight metre cliff between two
   * corners fourteen metres apart, on ground whose real height was
   * seventeen. That is a wall the car falls off.
   *
   * A real cutting's face climbs until it reaches the natural ground and
   * then it is the natural ground; a real embankment's side falls until it
   * lands on it. So the bench is bounded BY the country on whichever side
   * it is working (R34): it can cut into it or stand out from it, but it
   * cannot carry on past it and keep going. */
  const shelfBeyond = (index: number, d: number, lateral: number, lip: number, far: number) => {
    const s = samples[index];
    let grade = sideGrade(s.s, lateral >= 0 ? 1 : -1);
    // R34 — a cut is only a cut where there is country to cut INTO. On a
    // side where the land stands BELOW the road there is nothing above it
    // to climb, and a rising grade drawn there is bounded by the far field
    // — fifty metres down on a high fill, the whole drop taken over the
    // blend below: a face along the outside of every embankment the noise
    // happened to draw as a cutting. Such a side is a fill's side whatever
    // the dice said, and falls at the fill's own slope until it lands on
    // the country — at LEAST that slope, not only where the dice drew a
    // rise: a side the noise drew level stands the bench out over a forty
    // metre drop for as long as the blend below lets it, and where the
    // noise crosses zero the line drops eighteen metres between two
    // samples.
    // ...and the other way round on the side the country stands OVER the
    // road: a side the noise drew as falling is no embankment there — a
    // fall bounded by the far field is the country itself from the lip,
    // and beside the next sample the noise draws a rise, so the ground
    // alternated between the cone and the cutting's bench, fifteen metres
    // apart, as the dice changed sign along the road. The land says which
    // side is the cut; the dice only say how steep.
    if (far < s.elevation) {
      // The fill: its side falls at its own grade (`fillGrade`) until it
      // lands, and the toe is the crease where it does — let go only at
      // the reach's end (`letGo`), never eased from the lip.
      grade = Math.min(grade, -fillGrade(index, d, lip, far));
      const embankment = s.elevation + (d - lip) * grade;
      return letGo(Math.max(embankment, far), far, d, CORRIDOR_RANGE);
    }
    // The cut: its bench climbs at the dice's grade until it meets the
    // country, and is eased up onto it from there. The cone is the ceiling
    // over all of this (R31/R34), so the ease's own grade is the cone's
    // business, and a face the cone binds on is a declared cutting.
    grade = Math.max(grade, 0);
    const embankment = s.elevation + (d - lip) * grade;
    const bounded = Math.min(embankment, far);
    const toFar = smooth(clamp01((d - lip) / 110));
    return bounded * (1 - toFar) + far * toFar;
  };

  /** The FILL the sample at `index` stands out over the country by, seen
   * from `d` metres off, eased back onto it the way `shelfBeyond` eases an
   * embankment — and `far` where the road stands at or under the country.
   * The one grade a fill has, whichever side it is read from: this is
   * asked of the OTHER arm, whose nearest sample can jump from one leg of
   * a bend to the other as the point moves, and a side read off that
   * sample (`sideGrade`) jumps with it, from a cutting's rise to an
   * embankment's fall — thirty metres of ground between two lattice
   * corners. */
  const fillBeyond = (index: number, d: number, lip: number, far: number): number => {
    const s = samples[index];
    if (far >= s.elevation) return far;
    const grade = fillGrade(index, d, lip, far);
    const embankment = Math.max(far, s.elevation - Math.max(0, d - lip) * grade);
    return letGo(embankment, far, d, CORRIDOR_RANGE);
  };

  /** The CUT the sample at `index` takes out of the country, seen from `d`
   * metres off — its bench, level at the road, eased back up onto the
   * country the way `shelfBeyond` eases a cutting's side — and `far`
   * where the road stands at or over the country. Level rather than at the
   * other arm's own dice for the reason `fillBeyond` has one grade: the
   * arm's nearest sample, and the side it is read from, jump as the point
   * moves. */
  const cutBeyond = (index: number, d: number, lip: number, far: number): number => {
    const s = samples[index];
    if (far <= s.elevation) return far;
    const toFar = smooth(clamp01((d - lip) / 110));
    return s.elevation * (1 - toFar) + far * toFar;
  };

  /** What `shapeAt` answered last: the country as the roads shaped it, the
   * ceiling R31 holds it under, and what the cone was doing where it binds
   * — the grade the road it is beside was cut at (R34), and the grade a
   * cone letting go stands the ground at (`fadeGrade`, zero where none
   * binds) — which is what `cutAt` reads rock off. One record rewritten
   * per query rather than one allocated, because this is under every
   * height the field answers. */
  const shape = { raised: 0, ceiling: 0, cone: Infinity, ownClimb: 0, fadeGrade: 0 };
  /** The landscape before any stream is cut through it, in its two halves
   * — the ground as everything above the cone shaped it, and the cone —
   * into `shape`. The min of the two is the height; the analysis wants
   * them apart, because a fold where the cone binds is a cutting's edge
   * and a fold where it does not is the country's own. */
  const shapeAt = (x: number, z: number): void => {
    const far = farField(x, z);
    const near = nearestSample(x, z);
    let base: number;
    /** The route's own shelf under this point, where the point is inside a
     * FLARED lip — the floor no cone may cut below there. `near.own` is the
     * corridor's OUTER VERGE, and at a junction's mouth the mat flares a
     * road's width past the verge line it was measured at, so the verge is
     * a metre under the mat the car is riding; an arm's cone reaching in
     * under the flare was cutting the shelf down to it. Only under a flare:
     * the mouth lies on the platform's one plane, where the ribbon sunk by
     * the tile clearance is a plane too. Under an ordinary mat the ribbon
     * is crowned, banked and twisting through the corner, and a lattice
     * held a tile's sink under THAT pokes through it between the corners —
     * there the verge's own level, carried on the bank's plane, is the
     * shelf, as it always was. */
    let ownShelf = -Infinity;
    /** Whether the point is under the route's own mat — inside its lip —
     * where the route owns the ground outright and no branch may raise it. */
    let onMat = false;
    // Past CORRIDOR_RANGE the road has no say. It is set to where the
    // sample grid's own search actually reaches: a range beyond the search
    // does not extend the road's influence, it just moves the point where
    // the influence stops being found — and a blend that has not finished
    // by then leaves a seam ruled along the search grid, which a shaded
    // relief render shows up as a hairline running across the country.
    if (!near || near.d > CORRIDOR_RANGE) {
      base = far;
    } else {
      const s = samples[near.index];
      // R16 — the ribbon's own outer edge HERE, not the stage's nominal
      // one. A junction's mouth flares the mat well past nominal (R17) and
      // gravel wanders either side of it down the whole stage (R33); pin
      // the shelf at the nominal and the ground hands over while the ribbon
      // is still going, which is a vertical face along the outside of every
      // mouth on the map.
      const lip = lipAt(near.index);
      const corridorY =
        ribbonY(s, sideOf(near.lateral) * Math.min(near.d, lip), s.width) - TILE_SINK;
      if (near.d < lip) {
        base = corridorY;
        onMat = true;
        // A mouth's flare is a road's width; R33's gravel wander is under
        // a fifth of one, and is not a flare.
        if (lip > shelfEnd + FLARE_LIP) ownShelf = corridorY;
      } else {
        // The corridor's edge is the ribbon's — crowned, banked, sunk by
        // the tile — and the run-out starts from the sample's own level, so
        // the ease over the first few metres carries only the DIFFERENCE
        // between the two. Easing the whole level held the corridor's
        // height out over a line already falling at the verge grade and
        // then released it on top: the second of the three grades that
        // added up to seed 9's 48° (`letGo`).
        const shaped = shelfBeyond(near.index, near.d, near.lateral, lip, far);
        const off = smooth(clamp01((near.d - lip) / 26));
        base = shaped + (corridorY - s.elevation) * (1 - off);
      }
      // THE OTHER ARM'S FILL. The ground between two arms of the stage at
      // two heights is the nearer arm's out to the line where the other
      // becomes nearer — and there the higher arm's embankment, still a
      // dozen metres over the country, was simply dropped for the lower
      // arm's own cross-section: a step along that line, beside every
      // place the stage passes itself. So an embankment is carried until
      // it has come down to the ground, whichever arm is nearer: only its
      // FILL — what stands over the country — because a cut is the cone's
      // business and the cone is already a min over every arm in reach.
      if ((near.other >= 0 || near.deep >= 0) && near.d >= lip) {
        // The other arm's FILL and CUT, folded in as EARTHWORKS rather than
        // picked: what stands over the country is the larger of the two
        // arms' fills, what is taken out of it the deeper of their cuts,
        // and a fill built across a cutting stands on the cut ground. So
        // a road cut thirty metres into a hillside keeps its bench across
        // the line where a higher arm becomes nearer, instead of the
        // ground stepping up fifteen metres onto that arm's bench there,
        // and a higher arm's embankment is carried until it has come
        // down. Bounded by THIS road's own run-out — its verge falling
        // away at the grade a car could come back up (R31 the other way
        // round), which at the lip IS the corridor — so nothing reaches
        // in under the ground this road stands on, and the mat's edge is
        // never a step.
        const fillOther =
          near.other >= 0 ? fillBeyond(near.other, near.otherD, lipAt(near.other), far) - far : 0;
        const cutOther =
          near.deep >= 0 ? far - cutBeyond(near.deep, near.deepD, lipAt(near.deep), far) : 0;
        if (fillOther > 0 || cutOther > 0) {
          const fill = Math.max(base - far, fillOther, 0);
          const cut = Math.max(far - base, cutOther, 0);
          const runout = corridorY - (near.d - lip) * fillGrade(near.index, near.d, lip, far);
          base = Math.max(far + fill - cut, Math.min(runout, base));
        }
      }
    }
    // A branch is a road, and roads are built, not draped: its mat and the
    // bench climbing back onto the country past it are the CONE's business
    // below (R31 — the branch's own cone cuts the ground down to its shelf
    // and lets go toward the country at a declared grade), and what it
    // stands OVER the country on is the fill carried here. The nearest
    // branch used to cut the ground here as well, out to the midline with
    // the next road and then handed over in twelve metres: a route's bench
    // still twenty metres up dropped onto the branch's line across those
    // twelve metres (seed 3), and a branch cut deep into a hillside stood
    // a wall where its bench was let go before it had climbed back (seed
    // 22). The cone is a min over every branch in reach and declares the
    // face it cannot take up at a climbable grade (`cutAt`), which the
    // hand-over never did.
    //
    // THE TALLEST BRANCH'S FILL, carried whichever road is nearer — the
    // same earthworks the route's other arm gets above. The nearest branch
    // shapes the ground out to the midline with the next road and there
    // hands over, and where it stands on a fill the fill was simply
    // dropped: a branch twenty metres over a basin met a lower branch's
    // run-out at their midline as a twenty metre step (seed 10), and met
    // the route's ground the same way where the route was nearer. So what
    // stands over the country here is the highest fill of every branch in
    // reach, each run out from its own edge at a fill's grade (the verge
    // grade, or what it takes to land on a hillside falling away under it
    // — `fillGrade`'s rule, read off the country under the branch) — never
    // under the route's own mat, which owns its corridor outright, and let
    // go only at the reach's end. The cone is the ceiling over it, as over
    // everything.
    const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
    if (spur && !onMat) {
      const tall = spurs.highest(x, z, VERGE_CLIMB, spurEdge);
      if (tall) {
        const edge = spurEdge(tall.spur);
        const past = tall.d - edge;
        const shelf = ribbonY(tall.sample, Math.min(tall.d, edge), tall.spur.width) - TILE_SINK;
        if (shelf > base && past < SPUR_BLEND) {
          const g0 = farField(tall.sample.x, tall.sample.z);
          const hill = Math.max(0, (g0 - far) / Math.max(tall.d, BENCH));
          const grade = Math.max(VERGE_CLIMB, (shelf - g0 + hill * SPUR_BLEND) / SPUR_BLEND);
          const fill = letGo(shelf - Math.max(0, past) * grade, far, past, SPUR_BLEND);
          if (fill > base) base = fill;
        }
      }
    }
    // R39 — and a whole VILLAGE is graded level with its street, from under
    // the street's own mat out past the back gardens. Ahead of the lots'
    // own pads because it is the ground they are painted on: the band
    // decides the level, and a pad graded to the same street only agrees
    // with it.
    const platform = platforms.length > 0 ? platformAt(x, z, base) : null;
    /** The band's level here, weighted — a floor on the cone below, for the
     * reason a pad's is. */
    let platformFlat = -Infinity;
    let platformWeight = 0;
    if (platform) {
      platformFlat = platform.y;
      platformWeight = platform.weight * bandHold(platform.band, near, spur);
      base = platformFlat * platformWeight + base * (1 - platformWeight);
    }
    // R37 — a yard is graded flat, and the drive that runs onto it was
    // already eased onto its level, so the two agree where they overlap.
    const pad = pads.length > 0 ? padAt(x, z, base) : null;
    /** The pad's own level here, weighted — a floor on the cone below. */
    let padFlat = -Infinity;
    let padWeight = 0;
    if (pad) {
      padFlat = pad.y;
      padWeight = pad.weight;
      base = padFlat * pad.weight + base * (1 - pad.weight);
    }
    const apron = apronAt(x, z);
    if (apron) {
      const flat = apron.y - TILE_SINK;
      base = flat * apron.weight + base * (1 - apron.weight);
    }
    // R31 — and then the whole lot is CUT to the verge cone. Last, and
    // over the corner guards too, because it binds on everything above it:
    // the far field's mountains, the embankment's own grade, the blend
    // between them, a branch's shelf where the branch owns this ground, and
    // R14's mounds — a mound the car simply stops against is not a corner
    // that costs something to cut, it is a wall in the one place a car is
    // most likely to arrive sideways. Cut to the cone it is still a hill
    // worth going round. The cone is a min of continuous functions of
    // position, so this can only ever take ground AWAY: a valley, a ford's
    // dip and the ravine under a bridge are all still exactly as deep as
    // the landscape made them.
    // ...but a cone may not cut the ground out from under a road's OWN
    // CORRIDOR. The ceiling is a min over every corridor in reach, which is
    // right for the country between two arms of a stage — the lower one says
    // how high the ground between them may stand — and wrong for the ground
    // one of them is standing on. Where an abandoned branch ran sixty metres
    // away and twenty below, its cone reached in under the route and took
    // fourteen metres of hillside out from beneath it, leaving the ribbon in
    // the air with a skirt hanging off its edge: the dark face down the side
    // of the road in every screenshot of one.
    //
    // So inside a corridor the road standing there is the floor on the
    // ceiling, fading out over the same three metres the drawn corridor
    // fades over. Past its own lip the ground is free to fall away — that is
    // what an embankment is — and the min over every cone is right again.
    // Inside the corridor the nearest road IS this road: two roads keep
    // `roadClear` apart (R23), which is more than two corridors' width, so
    // nothing else can be nearer to a point on this one's shelf.
    let ceiling = near ? near.ceiling : Infinity;
    /** ...and the level it is held at: the road's own underside, FALLING
     * away past its lip at the grade the verge is allowed to climb. Falling,
     * not rising with the cone, because past its own edge a road stands on
     * an embankment and an embankment has a side — this only says the side
     * is a slope a car could come back up, which is R31 read the other way
     * round. `own` carries the cone's rise past the bench, so that is taken
     * back off — at the grade it was actually opened at (R34), not at the
     * verge's, or a cutting leaves the difference standing as a lip along
     * its own corridor. */
    const floorOf = (level: number, d: number, edge: number, climb: number): number =>
      level - coneRise(d, climb) - Math.max(0, d - edge) * VERGE_CLIMB;
    // It only ever RAISES the ceiling, so this takes no ground away and
    // fills nothing in: `raised` still bounds the result from above, and a
    // valley, a ford's dip and the ravine under a bridge are all exactly as
    // deep as the landscape made them.
    //
    // R31 — the ground every cone RISES TOWARD as it lets go is the ground
    // the roads have shaped here, mounds and shelves included, so a cone at
    // the end of its reach stands on whatever is there and clips nothing:
    // let go toward the bare country instead and every branch's embankment
    // crossing the route's reach gets a step cut across it along the
    // circle where the route stops being found.
    const raised = base + guards.riseAt(x, z);
    shape.fadeGrade = 0;
    if (near) ceiling = fadeCeiling(ceiling, raised);
    // A branch is never banked and the index carries no signed lateral, so
    // its cone is the plain one: its own underside, opening upward past the
    // bench. Nor is a branch ever CUT (R34): it is the road the stage did
    // not take, abandoned to the country, and nobody blasts a cutting for a
    // road nobody is going to drive. Every cone is in before any floor is
    // put on the result, or a floor a later cone undercuts was no floor.
    /** The branch's cone as opened — what its own floor below is undone
     * against — before it lets go toward the shaped ground the way the
     * route's does, inside the reach its index finds it within. */
    // ...and the branch it is asked of is the one whose cone holds the
    // country LOWEST here, not the nearest: the cone is a min over every
    // road in reach, and asked of the nearest alone it stopped at the
    // midline where a branch cut deep into a hillside handed over to a
    // higher one — a twenty metre step ruled along that line (seed 22).
    const low = spur ? spurs.lowest(x, z, VERGE_CLIMB, BENCH) : null;
    const branch = low ? ceilingOf(low.sample) + coneRise(low.d, VERGE_CLIMB) : Infinity;
    if (low) {
      const over = raised - branch;
      let gone = branch;
      let grade = 0;
      if (over > 0) {
        const w = fadeWeight(low.d, SPUR_CONE_REACH);
        gone += w * over;
        grade = fadeGrade(w, SPUR_CONE_REACH, VERGE_CLIMB, over);
      }
      if (gone < ceiling) {
        ceiling = gone;
        shape.fadeGrade = grade;
      }
    }
    if (near) {
      const hold = holdOf(near.d, shelfEnd);
      const floor = Math.max(ownShelf, floorOf(near.own, near.d, shelfEnd, near.ownClimb));
      if (hold > 0 && floor > ceiling) ceiling += (floor - ceiling) * hold;
    }
    if (spur) {
      // ...and where the point is on the BRANCH's ground, the branch's own
      // shelf is a floor on the ceiling too. BOTH roads' floors hold, each
      // by its own hand, never whichever is nearer: at a junction's mouth
      // the arm's mat lies across the stage's shoulder, and an arm that
      // leaves the mouth downhill has a lower cone than the stage's — pick
      // the arm's floor because the point is a hair nearer to it and the
      // stage's own shelf is cut down to the arm's cone, three quarters of
      // a metre under the mat the car is riding, which is the step at the
      // verge line across every mouth on the map.
      // Its OWN cone, undone under its own corridor — the lowest branch's
      // is another road's, and another road's cone is what the floor is
      // there to keep off this one's shelf.
      const edge = spurEdge(spur.spur);
      const own = ceilingOf(spur.sample) + coneRise(spur.d, VERGE_CLIMB);
      const hold = holdOf(spur.d, edge);
      const floor = floorOf(own, spur.d, edge, VERGE_CLIMB);
      if (hold > 0 && floor > ceiling) ceiling += (floor - ceiling) * hold;
    }
    // R37 — nor may a cone cut a PAD. A yard is graded level with the drive
    // that runs onto it, so it is never the wall beside a road that R31
    // exists to take down — but the drive's own cone, read from its
    // underside, sits under the pad's level along the drive and above it
    // out at the rim, and a farm's yard is wide enough for the difference
    // to show: cut along the drive and flat at the rim is a yard with a
    // trough down the middle. The pad's level is the floor on the ceiling,
    // by the pad's own weight — and R39's band is a floor on it the same
    // way, over the whole village at once.
    if (platformWeight > 0 && platformFlat > ceiling) {
      ceiling += (platformFlat - ceiling) * platformWeight;
    }
    if (padWeight > 0 && padFlat > ceiling) ceiling += (padFlat - ceiling) * padWeight;
    shape.raised = raised;
    shape.ceiling = ceiling;
    shape.cone = near ? near.ceiling : Infinity;
    shape.ownClimb = near ? near.ownClimb : VERGE_CLIMB;
  };
  const rawHeight = (x: number, z: number): number => {
    shapeAt(x, z);
    return shape.raised < shape.ceiling ? shape.raised : shape.ceiling;
  };

  /** R18 — a stream's channel keeps off the ground a road STANDS ON. The
   * carve is a bed cut `depth` under the water and blended out over
   * `BANK`, and beside a crossing the water is inside the corridor by
   * design: the sheet at the anchor, the first step of the course leaving
   * across the road, a mouth wandering a flat valley floor. Each of those
   * cut the corridor's outer band down to a bed metres below the ribbon —
   * the mouth's first point, fourteen metres out on a hillside, carved a
   * six-metre face along the apron beside every ford on the slope. So
   * the channel may go no deeper beside a road than the road's own
   * embankment: the corridor's underside less a ford's `BED_DEPTH` — which
   * is exactly the channel a ford has under its water — falling away past
   * the lip at the grade a fill's side falls at (R31's `climb`, read the
   * other way round). On flat country that is below every channel and
   * changes nothing; under a road on nineteen metres of fill it is the
   * fill's own slope, and a river at the toe of the fill has that slope
   * for its near bank instead of a bed cut into it. Not a fade over one
   * cell, as it first was: the lattice corners a cell past the lip are the
   * ones the band's triangles are interpolated from, and a corner in the
   * channel pulled the band down with it. A DECK stands over a ravine on
   * purpose and pins nothing (R13). */
  const heightAt = (x: number, z: number): number => {
    const raw = rawHeight(x, z);
    let carved = carveGround(streams, x, z, raw);
    if (carved >= raw) return raw;
    // R39 — and a channel keeps off the ground a VILLAGE stands on, for the
    // reason it keeps off the ground a road stands on. The courses are
    // traced round a town already (`waterClear`), so this only ever catches
    // a channel's BANK reaching in over the band's rim — but a bank is a
    // metre of hillside under a front wall, and the band is what the houses
    // are standing on.
    if (platforms.length > 0) {
      const platform = platformAt(x, z, raw);
      if (platform) carved = raw + (carved - raw) * (1 - platform.weight);
      if (carved >= raw) return raw;
    }
    const near = nearestRoad(x, z);
    if (!near) return carved;
    const s = samples[near.index];
    if (s.deck != null) return carved;
    const lip = lipAt(near.index);
    const floor =
      ribbonY(s, sideOf(near.lateral) * Math.min(near.d, lip), s.width) -
      TILE_SINK -
      BED_DEPTH -
      Math.max(0, near.d - lip) * VERGE_CLIMB;
    // A floor on the CARVE, never a lift of the ground: where the road's
    // underside stands over ground a pad or a platform graded lower, the
    // carve is simply refused.
    return Math.min(raw, carved > floor ? carved : floor);
  };

  /** R34 — how much the ground at a point is a FACE THE ROAD WAS CUT
   * THROUGH, 0 (open country, or a bank battered back to something a car
   * could climb) to 1 (blasted rock standing over the verge).
   *
   * Two faces, and the larger of them is the answer. The CUTTING: how hard
   * this piece of road was cut — the cone's own grade, already decided per
   * sample by `cutClimb` off the surface, the cover and the dial — times
   * how much country is actually standing on the cut here, because a
   * cutting is only a cutting where the land WANTED to be above the road,
   * and the same blasted tarmac running out across a flat has no face
   * beside it at all. And the JOIN (R31): where a cone lets go of a
   * mountain standing over it, the ground it stands up between the two is
   * as steep as the excess makes it, and past `verge.climbable` that is
   * rock too — the one face a road builds without blasting, and the reason
   * the car never meets a grass hillside it cannot climb.
   *
   * Cheap where it has to be. Almost every point the props ask about is
   * nowhere near a road, and that answer costs an index lookup or two —
   * the ground is only shaped once a road is close enough to have cut
   * it. */
  const cutAt = (x: number, z: number): number => {
    const C = R.verge.cut;
    const near = nearestRoad(x, z);
    if (!near || near.d > CORRIDOR_RANGE) {
      const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
      if (!spur || spur.d > SPUR_CONE_REACH) return 0;
    }
    shapeAt(x, z);
    // The join counts as rock from the RUNOFF's grade up, not from
    // `climbable`: the band the fade stands at a hair under climbable in
    // the field is a band the 14 m lattice reads back well over the car's
    // limit, and a declaration that began there left every such join a
    // grass slope to the analysis and to the props.
    const join = clamp01((shape.fadeGrade - VERGE_CLIMB) / (C.face.max - VERGE_CLIMB));
    const blast = clamp01(
      (shape.ownClimb - VERGE_CLIMB) / Math.max(1e-6, C.face.max - VERGE_CLIMB),
    );
    if (blast <= 0) return join;
    const over = farField(x, z) - shape.cone;
    if (over <= C.bare.over) return join;
    return Math.max(
      join,
      blast * smooth(clamp01((over - C.bare.over) / (C.bare.full - C.bare.over))),
    );
  };

  /** The DRAWN corridor surface at a point — the ribbon the road mesh
   * builds, with no tile sink under it — and two different weights on it.
   * Null when the point is nowhere near a road.
   *
   * `cover` is whether a road is DRAWN over this point at all: 1 anywhere
   * inside the corridor, fading out past its lip. It answers "is the thing
   * under the wheels here a road", which is what the water check wants.
   *
   * `hand` is R16's HAND-OVER — how much of the ribbon's own HEIGHT still
   * applies. It leaves 1 at the bare shoulder and is spent by the corridor's
   * outer lip, so the ribbon and the ground lattice meet there at a shared
   * height rather than one stopping in the air over the other
   * (`handoverAt`). The two are not the same question: one number for both
   * is a vertical face down each side of the road. */
  type Corridor = { y: number; cover: number; hand: number };
  const corridorGround = (x: number, z: number): Corridor | null => {
    let best: Corridor | null = null;
    /** Two roads covering one point — a drive's mat across the stage's
     * verge, a lane's across an arm's — are a CHAIN of hand-overs, in the
     * order they are considered: the stage's ribbon holds the ground by its
     * own `hand`, and what it hands over TO is not the bare lattice but the
     * next road's ribbon by that road's hand, and only then the lattice.
     * Inside the stage's shoulder the stage owns the ground outright (a
     * drive lies ON the stage's cross-section there — R37), and where the
     * stage's hand-over fades past its bare shoulder the drive's mat is what
     * it fades onto, instead of a ditch under the mat. Decided by a PICK
     * instead, the ground steps wherever the pick changes hands — the
     * stage's verge sagging into its ditch under the drive's mat, a
     * half-metre step across the mouth — and averaged by hand alone, the
     * drive's own crown is laid over the stage's shoulder. */
    let chainY = 0;
    let chainHand = 0;
    const consider = (d: number, width: number, y: number): void => {
      const edge = width / 2 + ROAD_CROSS.reach;
      if (d > edge + 3) return;
      const cover = 1 - smooth(clamp01((d - edge) / 3));
      const hand = handoverAt(d - width / 2);
      chainY += (1 - chainHand) * hand * y;
      chainHand += (1 - chainHand) * hand;
      const blended = chainHand > 0 ? chainY / chainHand : y;
      if (best && best.cover >= cover) {
        best.y = blended;
        best.hand = chainHand;
        return;
      }
      best = { y: blended, cover, hand: chainHand };
    };
    const near = nearestRoad(x, z);
    const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
    const considerRoute = (): void => {
      if (!(near && near.d < shelfEnd + 3)) return;
      // The stage's ribbon BETWEEN its samples, not the nearest one's. The
      // road mesh draws the ribbon interpolated along the stage and the car
      // on the mat rides that same interpolation (track.ts `locate`), so the
      // ground beside the road has to as well — elevation AND profile, since
      // the width, the bank and the lift all move from one sample to the
      // next. Read off the nearest sample alone, a graded road's shoulder is
      // a sawtooth of steps every two metres, and the seam between the mat
      // and its verge is a step the car drops down every time it crosses it.
      const s = samples[near.index];
      const along = (x - s.x) * Math.sin(s.heading) + (z - s.z) * Math.cos(s.heading);
      const next =
        samples[Math.max(0, Math.min(samples.length - 1, near.index + Math.sign(along)))];
      const f = Math.min(1, Math.abs(along) / track.step);
      const side = sideOf(near.lateral);
      const here = ribbonY(s, side * Math.min(near.d, s.width / 2 + ROAD_CROSS.reach), s.width);
      const there = ribbonY(
        next,
        side * Math.min(near.d, next.width / 2 + ROAD_CROSS.reach),
        next.width,
      );
      consider(near.d, s.width, here + (there - here) * f);
    };
    const considerSpur = (): void => {
      if (!spur) return;
      const w = spur.spur.width;
      consider(spur.d, w, ribbonY(spur.sample, Math.min(spur.d, w / 2 + ROAD_CROSS.reach), w));
    };
    // Where two ribbons cover one point the ground is the HIGHER of the
    // two chains — the stage's ribbon leading, and the arm's leading. Off
    // the stage's mat but on an arm's, the stage's hand-over is still
    // fading across the arm, and the stage's ribbon there is its shoulder
    // and verge: half a metre under the arm's mat where the arm climbs
    // away from the junction on the platform's plane, so led by the stage
    // the car on the arm rode a dip the arm's own drawn mat never had. Led
    // by whichever mat the point is ON instead, the ground STEPS at the
    // stage mat's edge, where the lead changes hands. Each chain is
    // continuous in position and the higher of two continuous surfaces is
    // too; and the higher ribbon is the one drawn on top, which is the one
    // the car should be standing on. Inside the stage's own shoulder its
    // hand is whole and the arm gets no say, as under a drive (R37).
    // (Read through a function: the considers assign `best` from inside
    // closures, which the type narrowing does not see.)
    const chained = (): Corridor | null => best;
    considerRoute();
    considerSpur();
    if (spur && near) {
      const led = chained();
      best = null;
      chainY = 0;
      chainHand = 0;
      considerSpur();
      considerRoute();
      const other = chained();
      if (!other || (led && led.y >= other.y)) best = led;
    }
    // The apron wins over both: at a junction the ground IS the junction —
    // one graded plane, right out to its rim, with no hand-over of its own
    // to make (R17).
    const apron = apronAt(x, z);
    if (apron && apron.weight > 0) {
      const under: Corridor = best ?? { y: apron.y, cover: apron.weight, hand: apron.weight };
      return {
        y: apron.y * apron.weight + under.y * (1 - apron.weight),
        cover: Math.max(apron.weight, under.cover),
        hand: Math.max(apron.weight, under.hand),
      };
    }
    return best;
  };

  // Lattice corners are hot (every off-road step reads several), so they
  // are cached; the cache clears whenever the field itself changes shape
  // (new streams carved, the endless prune re-anchoring the corridor).
  let cornerCache = new Map<number, number>();
  const cornerHeight = (i: number, j: number): number => {
    const key = cellKey(i, j);
    const hit = cornerCache.get(key);
    if (hit !== undefined) return hit;
    if (cornerCache.size > 8192) cornerCache = new Map();
    const y = heightAt(i * GROUND_CELL, j * GROUND_CELL);
    cornerCache.set(key, y);
    return y;
  };

  // Each lattice cell splits into two triangles along the same diagonal the
  // renderer's tile indexing uses — (i+1,j) to (i,j+1) — so this is the
  // exact drawn surface, not an approximation of it.
  const latticeAt = (x: number, z: number): number => {
    const gx = x / GROUND_CELL;
    const gz = z / GROUND_CELL;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    if (fx + fz <= 1) {
      const h00 = cornerHeight(i, j);
      return h00 + fx * (cornerHeight(i + 1, j) - h00) + fz * (cornerHeight(i, j + 1) - h00);
    }
    const h11 = cornerHeight(i + 1, j + 1);
    return (
      h11 + (1 - fx) * (cornerHeight(i, j + 1) - h11) + (1 - fz) * (cornerHeight(i + 1, j) - h11)
    );
  };

  const groundAt = (x: number, z: number): number => {
    const lattice = latticeAt(x, z);
    // Beside a road the DRAWN surface is the ribbon, not the tile under it
    // — its crown, its wheel tracks, its shoulder (R16). The lattice is 14 m
    // between corners and could not hold any of that, so out to the shoulder
    // the physics rides the ribbon; past it R16's hand-over leans onto the
    // tiles, and by the corridor's lip they have it.
    const corridor = corridorGround(x, z);
    if (!corridor) return lattice;
    return corridor.y * corridor.hand + lattice * (1 - corridor.hand);
  };

  /** The ROAD standing over a point: the height of the ribbon the car
   * drives there, or null where no road covers the point — and null on a
   * BRIDGE, because a deck is a road over the water rather than ground
   * over it, and what runs under one is still the river it spans (R13). */
  const roadTopAt = (x: number, z: number): number | null => {
    const near = nearestRoad(x, z);
    // Only the actual ribbon hides water. The wider corridor is the graded
    // ground beside the road; suppressing water there would trim a ford's
    // channel at the road edge and make it look painted onto the tarmac.
    if (near && near.d <= samples[near.index].width / 2 + 0.1 && samples[near.index].deck !== null)
      return null;
    const corridor = corridorGround(x, z);
    return near && near.d <= samples[near.index].width / 2 + 0.1 && corridor ? corridor.y : null;
  };

  const waterAt = (x: number, z: number): number | null => {
    // The ground the question is asked of is the one the world SHOWS: the
    // lattice the tiles are drawn on, not the analytic field between its
    // corners. A channel too narrow for the lattice to hold runs UNDER a
    // hillside the tiles never dip into, and a car up there is on the
    // hillside — there is nothing to drown in.
    const ground = latticeAt(x, z);
    // R35 — the standing water here is whatever the POUR left at this
    // point, at that body's own level, not one table for the whole world.
    // The level is asked of the bare country and the waterline is settled
    // against the drawn lattice, which is what keeps an embankment across
    // a lake dry on top and wet either side of it.
    const lake = land.water.shoreLevelAt(x, z);
    const surface = lake !== null && ground < lake ? lake : streamWaterAt(streams, x, z);
    if (surface === null || ground >= surface - 0.02) return null;
    // ...and a road over it is another layer again: an embankment across a
    // lake, or a shelf cut above a stream, is dry road with water below,
    // not water. Only a ford — whose ribbon lies AT the water it wades —
    // is still wet.
    const road = roadTopAt(x, z);
    if (road !== null && road > surface + WADE_LIP) return null;
    return surface;
  };

  /** Distance from a point to the nearest ABANDONED BRANCH's mat edge, or
   * Infinity when there is none near — nothing is planted on a road, and a
   * spur is as much a road as the stage is (R17). */
  const builtClearance = (x: number, z: number): number => {
    let yard = pads.length > 0 ? padClearance(x, z) : Infinity;
    if (clearings.length > 0) yard = Math.min(yard, clearingAt(x, z).d);
    if (spurs.spurs.length === 0) return yard;
    const spur = spurs.nearest(x, z);
    return Math.min(yard, spur ? spur.d - spur.spur.width / 2 : Infinity);
  };
  // R42 — a trodden path is not a road (a road may cross one), but nothing
  // grows on one either: the forest reads the paths, the placers do not.
  const spurClearance = (x: number, z: number): number => {
    const built = builtClearance(x, z);
    if (carParks.carParks.length === 0) return built;
    return Math.min(built, carParks.trailClearance(x, z));
  };

  /** Distance from a point to the nearest road's outer EDGE — stage or
   * abandoned branch, ribbon and verge included — negative on the road
   * itself. R18's water steers by it, and nothing is planted or stood
   * anywhere it comes back negative.
   *
   * Measured against the stage's NOMINAL corridor, deliberately: R18's
   * watercourses are traced against this, so a width that moves with the
   * road's own wander (R33) and its junction mouths (R17) would move every
   * river on every stage to buy a metre of accuracy the water cannot see.
   * What has to know the road's real width is the code that STANDS things
   * beside it — `props.ts` and the renderer's planting — and both ask the
   * sample rather than this. */
  const roadClear: RoadClear = (x, z) => {
    const near = nearestRoad(x, z);
    const stage = near ? near.d - shelfEnd : Infinity;
    const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
    const branch = spur ? spur.d - spur.spur.width / 2 - ROAD_CROSS.reach : Infinity;
    return Math.min(stage, branch);
  };

  /** R43 — distance from a point to the nearest energy plant's ground: a
   * solar farm's fence or a turbine's crane pad, negative inside. The
   * watercourses steer by it exactly as they steer by a road, because a
   * river through a field of panels is a field of panels standing in a
   * river; the country's paddocks and fields stay where the water finds
   * them, which is where a real field is. */
  const energyClear = (x: number, z: number): number => {
    let best = Infinity;
    for (const farm of track.solarFarms) {
      const { rect } = farm;
      const reach = Math.hypot(rect.width, rect.depth) / 2 + 1;
      if (Math.abs(x - rect.x) > reach || Math.abs(z - rect.z) > reach) continue;
      best = Math.min(best, rectDistance(rect, x, z));
    }
    for (const farm of track.windFarms) {
      for (const t of farm.turbines) {
        best = Math.min(best, Math.hypot(t.x - x, t.z - z) - R.energy.wind.pad.radius);
      }
    }
    return best;
  };
  const waterClear: RoadClear = (x, z) =>
    Math.min(
      roadClear(x, z),
      energyClear(x, z),
      platforms.length > 0 ? platformClearance(x, z) : Infinity,
    );

  const spurSurfaceAt = (x: number, z: number): Surface | null => {
    if (pads.length > 0 && padClearance(x, z) <= 0) return biome.loose;
    // R37 — a ploughed field is soft going: turned soil to the wheels.
    if (clearings.length > 0) {
      const clearing = clearingAt(x, z);
      if (clearing.d <= 0 && clearing.surface !== null) return clearing.surface;
    }
    if (spurs.spurs.length === 0) return null;
    const spur = spurs.nearest(x, z);
    if (!spur || spur.d > spur.spur.width / 2) return null;
    return spur.sample.surface;
  };

  // Everything solid that stands on this ground, and the region/grove quilt
  // that decides what kind of place it stands in (props.ts). It reads the
  // field through these functions rather than sharing its state, so the
  // engine's copy and the renderer's copy of the world always agree.
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
      samples.length > indexed ||
      spurCount < track.spurs.length ||
      publicCount < track.publicRoads.length ||
      homesteadCount < track.homesteads.length ||
      townCount < track.towns.length ||
      windFarmCount < track.windFarms.length ||
      solarFarmCount < track.solarFarms.length
    ) {
      indexSamples(indexed, samples.length);
      indexed = samples.length;
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
      // The river reads the BARE country, not the ground the road shaped.
      // A crossing's water lies in its valley (R12, R13), so the land is
      // the field the water obeys — reading the corridor-shaped field only
      // makes sense while a crossing's water is laid at the ROAD's height,
      // and then a course traced against the land the road stands over
      // refuses every reach. Read the shaped ground instead and
      // a course leaving a crossing beside an embankment follows the
      // embankment's flank down — real ground, and the analyzer (which
      // measures the water against the bare banks, as the world sees it)
      // reports it ten metres in the air. A stream lies at the toe of a
      // fill, not on its side.
      // Traced, then sliced: the field queries the slices, and the whole
      // watercourses are kept beside them because a river is only judgeable
      // end to end — the analysis walks one from its source to its mouth to
      // ask whether it ever climbs, whether it gathers, and whether it ends
      // in anything.
      for (const river of traceRivers(
        track.seed,
        collectAnchors(track, streamScan, land.surfaceAt),
        farField,
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
        streams.push(...sliceRiver(river));
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
          waterAt(x, z) !== null ||
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
          waterAt(x, z) !== null || inStream(streams, x, z, 3) || guards.riseAt(x, z) > 0.5,
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
      cornerCache = new Map();
    }
    if (!track.endless) return;
    // Forget road the run has left behind: the sample grid re-anchors to
    // the live window so fresh queries never shape themselves around it,
    // and spent stream descriptors stop taxing the carve.
    const floorS = carS - 700;
    if (samples[firstIndexed]?.s < floorS - 400) {
      while (firstIndexed < samples.length - 1 && samples[firstIndexed].s < floorS) firstIndexed++;
      grid = new Map();
      nearCx = NaN;
      indexSamples(firstIndexed, samples.length);
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
      cornerCache = new Map();
    }
  };

  sync(0);

  const roadDistanceAt = (x: number, z: number): number => nearestRoad(x, z)?.d ?? Infinity;
  const ceilingAt = (x: number, z: number): number => nearestSample(x, z)?.ceiling ?? Infinity;
  const coneAt = (x: number, z: number): number => {
    shapeAt(x, z);
    return shape.ceiling;
  };

  const field: TerrainField = {
    heightAt,
    groundAt,
    latticeAt,
    farHeightAt: farField,
    geology: land.geology,
    waterAt,
    water: land.water,
    roadDistanceAt,
    cutAt,
    ceilingAt,
    coneAt,
    spurSurfaceAt,
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
