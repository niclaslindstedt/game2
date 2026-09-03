// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R42 — THE CAR PARKS. The crowd (R27) did not walk to the stage from
// nowhere: it drove, left the car in a field somewhere off the course, and
// walked in from there. So every stand is served by a CAR PARK — a patch of
// bladed gravel in the grass with a handful of cars nosed onto it — and the
// pad is reached by a gravel LANE that runs to a road the cars could have
// arrived on: an abandoned arm past its barrier (R17, R36), a public road
// the route never met (`publicroad.ts`), or the lane out of an earlier car
// park, which reaches one of those itself. From the pad a TRAIL is trodden
// through the grass to the back of each stand, with arrow boards along it
// so the crowd finds the corner.
//
// Four things about it are rules rather than dressing, and all four are the
// same rule seen from different ends — THE CROWD GOT HERE SOMEHOW:
//
//   THE CARS HELD THE CROWD, AND THE CROWD FILLED THE CARS. A pad is sized
//   from the head count of the stands it serves (`standHeads`) at a
//   carful's worth of people each, so eight spectators at a corner is three
//   cars in the field behind it — never one car a head, and never more cars
//   than there are people to have driven them.
//
//   IT IS A FIELD OFF THE COURSE, NOT A LAY-BY BESIDE IT. The pad stands
//   `standOff` metres clear of the route at least, which is most of the way
//   to the walk a spectator will make. An unconstrained search finds the
//   NEAREST place the country will take, which is sixty metres off the
//   road, and twenty cars parked that close to a live stage is the one
//   thing a rally never has.
//
//   THE LANE GOES TO A ROAD WHERE THERE IS ONE. The search pays a detour to
//   end on tarmac — an arm, a public road, or a lane that reaches one —
//   rather than on the rim (`RIM_PENALTY`). It does not always find one, and
//   the reason is structural rather than a shortcoming to fix: a rally route
//   folded into its own box partitions the country it occupies, so the
//   pocket a given corner sits in often carries no road at all. There the
//   lane runs off the map the way a branch does, which is where the tarmac
//   it would have joined runs too.
//
//   AND A CORNER WITH NOWHERE TO PARK GETS NOBODY. Where no pad can be found
//   within a walk, or none with any way out at all, the car park is not
//   built and the stand it would have served is handed back and dropped
//   (`StandField.drop`) — a crowd that could not have got here does not
//   stand here.
//
// It is placed the way a marshal plans it, BACKWARDS: start at the stand,
// find a car park a walk away, and run a lane from the car park out to a
// public road. Which is why this module lives on the TERRAIN FIELD beside
// the stands and the guards rather than in the compiler: the stands are
// placed against the built world — the water, the streams, the mounds —
// and a car park can only be planned once they exist.
//
// And it is placed by SEARCH, not by steering. A stage is kilometres of
// road folded into a box a couple of kilometres across, and most of the
// country beside it is a pocket between two arms of it; a lane driven out
// of a pocket by looking a hundred metres ahead runs into the far arm and
// is cut there, which is what R23 demands and what happened to nine in ten
// of them. So the country is read as a coarse map first — which cells a
// road may be driven through, which a person may walk across — and a pad
// is put where the crowd can walk from and a lane can reach a road from,
// or it is not put at all.
//
// The engine places it, for the reason it places the homesteads (R37):
// the cars are things a car stops against, the road is a road the physics
// gives gravel grip and the terrain shelves, the pad is ground the terrain
// flattens, and the forest keeps off all three and off the trails. The
// renderer only DRAWS what is decided here.

import { cellKey } from "../lib/math.ts";
import { smooth } from "../lib/noise.ts";
import { createRng, type Rng } from "../lib/prng.ts";
import { parkedSolids, type ParkedCar } from "./buildings.ts";
import type { Surface, Track } from "./compile.ts";
import type { LandField } from "./land.ts";
import {
  CELL,
  createCountryMap,
  routeCorridor,
  walkFrom,
  wayOut,
  type CountryMap,
} from "./carpark-map.ts";
import {
  signTrail,
  standBack,
  trailClearance,
  walkTrail,
  type Trail,
  type TrailProbe,
} from "./carpark-trail.ts";
import { corridorOffset, ROAD_CROSS, roadClearance } from "./road.ts";
import { STAGE_RULES as R } from "./rules.ts";
import type { WildObstacle } from "./solids.ts";
import { SPUR, followStep, type ShelfBand, type SpurLine, type SpurSample } from "./spurs.ts";
import { standHeads, type Stand } from "./stands.ts";

const P = R.carPark;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function wrap(a: number): number {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

export type CarParkPad = {
  x: number;
  z: number;
  y: number;
  radius: number;
  grade: { x: number; z: number };
};

/** The pad's plane at a point: its level at the centre, falling with its
 * grade. What the cars stand on, what the road runs onto, and what the
 * terrain grades the ground to. */
export function padHeight(pad: CarParkPad, x: number, z: number): number {
  return pad.y + pad.grade.x * (x - pad.x) + pad.grade.z * (z - pad.z);
}

/** What the lane out of a car park reaches. `arm` is an abandoned branch
 * (R17), `road` a public road the route never met (`publicroad.ts`), `park`
 * the lane out of an earlier car park — which reaches one of those itself —
 * and `map` the edge of the world, which is the honest answer where the
 * pocket of country the corner sits in carries no road at all. The search
 * prefers the first three and pays a detour for them (`RIM_PENALTY`). */
export type CarParkAccess = "arm" | "road" | "park" | "map";

export type CarPark = {
  /** Arc position on the stage of the first stand it serves — what puts the
   * car parks in order, and what an endless run prunes them by. */
  atS: number;
  /** The pad: a disc of graded gravel the terrain grades to the plane
   * through `y` falling at `grade` (m per m, as a vector in the ground
   * plane) — a car park on a hillside is a hillside with the cars parked
   * across it, not a table cut into it. */
  pad: CarParkPad;
  /** The aisle's direction — the road arrives at the pad's centre along it,
   * and the two rows of bays stand either side of it. */
  heading: number;
  /** How many bays the blade left — the cars, plus a couple of spaces. */
  bays: number;
  cars: ParkedCar[];
  /** How many people the stands this pad serves hold, all told. What the
   * cars were counted from, and what the analysis holds them to. */
  heads: number;
  /** The lane in: from the public road it leaves to the pad's centre. */
  road: SpurLine;
  access: CarParkAccess;
  trails: Trail[];
  /** A roll for what the plan does not dictate. */
  roll: number;
};

/** Everything the placer has to ask about the world. Functions rather than
 * the terrain's own state, so the module can be driven from a test. */
export type CarParkContext = {
  /** R40 — what a bladed road in this country is made of. */
  loose: Surface;
  land: LandField;
  /** Distance from a point to the nearest piece of ROUTE, its start and
   * finish aprons included, m — or the caller's own reach where nothing is
   * nearer than that. */
  routeDistance: (x: number, z: number) => number;
  /** Distance from a point to the nearest OTHER built thing's edge — a
   * branch's or a drive's mat, a yard's or a lot's rim, a clearing — or
   * Infinity when nothing is near. Negative on the thing itself. */
  builtClearance: (x: number, z: number) => number;
  /** Ground nothing may stand on or walk across: water, a stream's bed and
   * banks, the flank of a guard's mound. */
  blocked: (x: number, z: number) => boolean;
  /** R31 — the highest the ground may stand at a point for the route's
   * sake (the terrain's own cone), Infinity where no road reaches. */
  ceilingAt: (x: number, z: number) => number;
  /** The ground as the terrain shapes it — what a sign is footed on. */
  heightAt: (x: number, z: number) => number;
  /** Called with each car park the moment it is placed, BEFORE the next is
   * tried: the terrain adds its road and its pad to its indexes here, so
   * `builtClearance` keeps the next car park off this one. */
  commit: (park: CarPark) => void;
  /** The tally: called with the reason every time a candidate is refused.
   * `carParkTally.note` when absent. */
  note?: (why: string) => void;
};

export type CarParkField = {
  carParks: CarPark[];
  /** Serve every stand whose road is settled up to `upToS`, and hand back
   * the ones the country refused — a stand with nowhere within a walk of it
   * to park, or no way to drive to that place. Nobody is standing at those
   * (R42), so the caller drops them. */
  extend: (upToS: number, stands: readonly Stand[], ctx: CarParkContext) => Stand[];
  /** Distance from a point to the nearest trail's edge, m — Infinity when
   * none is near. The forest and the scatter keep off a trodden path. */
  trailClearance: (x: number, z: number) => number;
  /** Endless: forget the car parks the run has left far behind. */
  pruneBefore: (s: number) => void;
};

/** How far a road out of a car park may run, m — a branch's own ceiling. */
const ROAD_MAX = SPUR.length.max;

/** How far outside the stage's own box a lane will go looking for a road to
 * join, m. The country map's lattice is grown to cover whichever roads
 * stand inside it; past this the road is somewhere the crowd drove FROM,
 * not somewhere a marshal ran a lane out to. */
const LANE_REACH = 1000;

/** Over how much of its last stretch a lane closes its height onto the
 * road it runs into, m — at least. A lane that meets the road standing
 * higher or lower than this can close at its own grade starts closing
 * further out (`layRoadOut`), because the alternative is arriving beside
 * the road and dropping onto it. */
const JOIN_EASE = 48;
/** How far the road that leaves a pad runs ON the pad's own plane before it
 * is allowed to bend away toward the country, m past the rim — so the
 * lane leaves the car park at the car park's own grade and the pad's
 * blend (`easeOntoPad`) has nothing to make up. */
const PLANE_RUN = 8;
/** One sample in this many of a road a lane may join goes into the coarse
 * picture the search steers by — a point every couple of dozen metres. */
const JOIN_STRIDE = 6;

/** How much of the joined road either side of the join a lane may close
 * on, m of that road's own arc.
 *
 * It is the R23 exemption for the road the lane is running INTO — inside it
 * the lane may come near that road, and near nothing else — so it has to be
 * long enough to cover the whole approach. A lane aiming at a public road
 * across open country runs at a shallow angle for the last few hundred
 * metres, and at a window of 120 m every one of the six approaches on seed 5
 * was refused for standing too close to the very road it was about to join. */
const JOIN_WINDOW = 400;

/** The TALLY: where a probe hangs its counter of refusals. A placement
 * that comes out sparse is refusing, not rolling low, and the terrain
 * field builds the context this module runs under, so a probe cannot hand
 * it one — it sets this instead. Null in the game, always. */
export const carParkTally: { note: ((why: string) => void) | null } = { note: null };

/** R42 — how many cars a crowd of `heads` arrived in, at `roll`'s carful
 * apiece. Both ends of `occupancy` bind: the answer is never fewer than the
 * cars it takes to carry them (`heads / max`) and never more than the cars
 * they could have filled (`heads / min`), so the count is always somewhere
 * a family-per-car reading of the crowd puts it. */
export function carsFor(heads: number, roll: number): number {
  const O = P.occupancy;
  const perCar = O.min + (O.max - O.min) * clamp01(roll);
  const cars = Math.ceil(heads / perCar);
  return Math.max(1, Math.min(P.bays.most, cars));
}

/** The layout of the bays on a pad, from the count: how many stand in each
 * of the two rows, and the pad's radius round the whole of it. */
export function bayLayout(bays: number): { perRow: number; length: number; width: number } {
  const perRow = Math.ceil(bays / 2);
  return {
    perRow,
    length: perRow * P.bays.pitch,
    width: 2 * P.bays.depth + P.bays.aisle,
  };
}

/** The bays of a car park, in row order: the row on the aisle's right first,
 * then the left, each from the back of the pad to the front. A bay is its
 * centre and the way a car nosed into it faces. The engine stands the cars
 * on these; the renderer paints the lines between them. */
export function parkBays(park: {
  pad: { x: number; z: number };
  heading: number;
  bays: number;
}): { x: number; z: number; heading: number; row: -1 | 1; index: number }[] {
  const { perRow } = bayLayout(park.bays);
  const fx = Math.sin(park.heading);
  const fz = Math.cos(park.heading);
  const rx = Math.cos(park.heading);
  const rz = -Math.sin(park.heading);
  const lateral = P.bays.aisle / 2 + P.bays.depth / 2;
  const out: { x: number; z: number; heading: number; row: -1 | 1; index: number }[] = [];
  for (const row of [1, -1] as const) {
    for (let i = 0; i < perRow; i++) {
      const along = (i - (perRow - 1) / 2) * P.bays.pitch;
      out.push({
        x: park.pad.x + fx * along + rx * lateral * row,
        z: park.pad.z + fz * along + rz * lateral * row,
        heading: park.heading + (row * Math.PI) / 2,
        row,
        index: i,
      });
    }
  }
  return out;
}

/** A stand's key: a stand has no id, and the two finish banks either side
 * of the line share an arc position, so the facing tells them apart. */
function standKey(stand: Stand): string {
  return `${stand.s.toFixed(2)}/${stand.facing.toFixed(4)}`;
}

/** A point on a public road a car park may leave from. */
type Access = { line: SpurLine; sample: SpurSample; kind: CarParkAccess; d: number };

/** How big a cell the stand-off field is drawn on, m. */
const NEAR_CELL = 64;

export function createCarParkField(track: Track): CarParkField {
  const carParks: CarPark[] = [];
  const seed = (track.seed ^ 0x2c7a9e51) >>> 0;
  const served = new Set<string>();
  // R42's stand-off, as a painted field rather than a distance query. The
  // terrain's own `routeDistance` is capped at three grid cells — 144 m,
  // which is a promise a road being driven can use and less than the
  // stand-off asks about — and widening that cap makes every probe in the
  // pad search walk twice the rings for an answer that is almost always
  // "nothing near". So the route is painted ONCE into the cells its
  // stand-off covers, and the question becomes a set lookup.
  //
  // A superset of the true disc, never a subset: a cell is painted when it
  // TOUCHES the disc, so a pad this refuses may stand a few metres further
  // off than the rule asks and one it passes never stands nearer.
  const nearCells = new Set<number>();
  let paintedTo = 0;
  const paintRoute = (): void => {
    const reach = P.standOff + NEAR_CELL * Math.SQRT1_2;
    const rings = Math.ceil(reach / NEAR_CELL);
    for (let i = paintedTo; i < track.samples.length; i += 8) {
      const sample = track.samples[i];
      const cx = Math.floor(sample.x / NEAR_CELL);
      const cz = Math.floor(sample.z / NEAR_CELL);
      for (let dx = -rings; dx <= rings; dx++) {
        for (let dz = -rings; dz <= rings; dz++) {
          const x = (cx + dx + 0.5) * NEAR_CELL - sample.x;
          const z = (cz + dz + 0.5) * NEAR_CELL - sample.z;
          if (x * x + z * z <= reach * reach) nearCells.add(cellKey(cx + dx, cz + dz));
        }
      }
    }
    paintedTo = track.samples.length;
  };
  /** True where the route runs inside the stand-off of a point. */
  const nearRoute = (x: number, z: number): boolean => {
    if (paintedTo < track.samples.length) paintRoute();
    return nearCells.has(cellKey(Math.floor(x / NEAR_CELL), Math.floor(z / NEAR_CELL)));
  };
  /** Every stand DECIDED — served, or refused and handed back. Keyed rather
   * than counted: the stand list is pruned from its front on an endless run
   * so an index would slip, and an arc cursor cannot tell the two finish
   * banks apart (they share an arc position), which left the second of each
   * pair neither served nor refused and so never taken off the stage. */
  const decided = new Set<string>();
  /** The route's corridor: mat, shoulder and verge. */
  const corridor = routeCorridor(track.width);
  /** R23 — the room a road keeps from any other, centerline to centerline. */
  const keepOut = roadClearance(P.road.width);

  // R23 + R31 — the band a road may stand in beside the stage without its
  // shelf becoming a wall in the stage's shoulder, and whether a given
  // height still has ground under it. The compiler's own two, restated
  // over the built samples: a road driven out of a car park is a branch
  // to the terrain, and it has to keep the same rules a branch keeps.
  const STRIDE = 8;
  const bench = Math.max(corridor, R.verge.bench);
  const slack = STRIDE * track.step * 0.5;
  const shelfBand = (x: number, z: number): ShelfBand => {
    const all = track.samples;
    let ceiling = Infinity;
    let floor = -Infinity;
    for (let k = 0; k < all.length; k += STRIDE) {
      const road = all[k];
      const dx = road.x - x;
      const dz = road.z - z;
      const d2 = dx * dx + dz * dz;
      const room = Math.max(
        ceiling < Infinity ? ceiling - road.elevation : Infinity,
        floor > -Infinity ? road.elevation - floor : Infinity,
      );
      const reach = bench + slack + Math.max(0, room) / R.verge.climb;
      if (room < Infinity && d2 > reach * reach) continue;
      const swing = Math.max(0, Math.sqrt(d2) - bench - slack) * R.verge.climb;
      if (road.elevation + swing < ceiling) ceiling = road.elevation + swing;
      if (road.elevation - swing > floor) floor = road.elevation - swing;
    }
    return { floor, ceiling };
  };
  const shelfHolds = (x: number, z: number, y: number): boolean => {
    const all = track.samples;
    for (let k = 0; k < all.length; k += STRIDE) {
      const road = all[k];
      const apart = Math.abs(y - road.elevation);
      if (apart <= 0) continue;
      const need = bench + apart / R.verge.climb + slack;
      const dx = road.x - x;
      const dz = road.z - z;
      if (dx * dx + dz * dz < need * need) return false;
    }
    return true;
  };

  /** The country map round a place. A finite stage's box is the stage's
   * own; an endless one has no box, so the map is the neighbourhood and a
   * road that leaves it has left. Rebuilt for every car park, because the
   * built things it keeps a road off change as each one is committed. */
  const countryMap = (ctx: CarParkContext, near: { x: number; z: number }): CountryMap => {
    const bounds = track.endless
      ? {
          minX: near.x - STREAMED_BOX,
          maxX: near.x + STREAMED_BOX,
          minZ: near.z - STREAMED_BOX,
          maxZ: near.z + STREAMED_BOX,
        }
      : track.bounds;
    // ...and how far past that box the LATTICE has to look. The tarmac a
    // lane wants to reach is laid across the whole world (R17), and the box
    // a rally folds itself into is a corner of it: measured over seeds 1-12
    // at medium, the public road on a stage comes between 175 m and 970 m
    // of the route, and a lattice that stopped at the escape covered none
    // of it on ten of the twelve. Extended to whichever roads stand within
    // `LANE_REACH` of the box, and no further — a lane is a lane, not a
    // second stage's worth of road.
    let nearest = Infinity;
    for (const road of [...track.publicRoads, ...track.spurs]) {
      for (let i = 0; i < road.samples.length; i += 8) {
        const s = road.samples[i];
        const out = Math.max(
          bounds.minX - s.x,
          s.x - bounds.maxX,
          bounds.minZ - s.z,
          s.z - bounds.maxZ,
          0,
        );
        if (out < nearest) nearest = out;
      }
    }
    const reach = nearest <= LANE_REACH ? nearest : 0;
    return createCountryMap(
      bounds,
      {
        routeDistance: ctx.routeDistance,
        builtClearance: ctx.builtClearance,
        blocked: ctx.blocked,
        flooded: ctx.land.flooded,
        corridor,
      },
      reach > 0 ? reach + 2 * CELL : undefined,
    );
  };

  /** Every road a car park's lane may leave from, and the stretch of each
   * that is open to it. Three kinds, and the walk over them is the same
   * walk — what differs is only where a road STARTS being open:
   *
   *   an ARM, past its barrier and off the junction's platform, because a
   *   car arrives from the outside world and never through the tape;
   *   a PUBLIC ROAD the route never met, open along the whole of it —
   *   nothing is shut on a road nobody closed;
   *   and an earlier car park's own LANE, short of its pad, because a lane
   *   that joins another at its far end is a lane that joins a car park.
   *
   * `each` is called with every open point; the two readers below want the
   * nearest per road and the coarse picture respectively. */
  const openRoads = (
    each: (line: SpurLine, kind: CarParkAccess, sample: SpurSample) => void,
  ): void => {
    const walk = (line: SpurLine, kind: CarParkAccess, fromS: number, toS: number): void => {
      for (let i = 0; i < line.samples.length; i += 2) {
        const sample = line.samples[i];
        if (sample.s < fromS || sample.s > toS) continue;
        each(line, kind, sample);
      }
    };
    for (const spur of track.spurs) {
      if (spur.rail) continue;
      walk(
        spur,
        "arm",
        Math.max(R.junction.parting, (spur.block?.s ?? SPUR.block.from) + 30),
        Infinity,
      );
    }
    for (const road of track.publicRoads) walk(road, "road", 0, Infinity);
    for (const park of carParks) {
      const end = park.road.samples[park.road.samples.length - 1].s;
      walk(park.road, "park", 30, end - park.pad.radius - 40);
    }
  };

  /** The nearest open point of each road within `P.reach` of a place, the
   * closest road first. */
  const accessPoints = (from: { x: number; z: number }): Access[] => {
    const best = new Map<SpurLine, Access>();
    openRoads((line, kind, sample) => {
      const d = Math.hypot(sample.x - from.x, sample.z - from.z);
      if (d >= P.reach) return;
      const had = best.get(line);
      if (!had || d < had.d) best.set(line, { line, sample, kind, d });
    });
    return [...best.values()].sort((a, b) => a.d - b.d);
  };

  /** The nearest point on a road a lane may RUN INTO — an arm past its
   * barrier, or an earlier car park's own road out — within `within`
   * metres, or null. Strided: the answer is compared against a clearance
   * in the tens of metres. */
  const nearestJoin = (x: number, z: number, within: number): Access | null => {
    let best: Access | null = null;
    openRoads((line, kind, sample) => {
      const d = Math.hypot(sample.x - x, sample.z - z);
      if (d < within && (!best || d < best.d)) best = { line, sample, kind, d };
    });
    return best;
  };

  /** The roads a lane may run into, as a flat list of points every few
   * samples — the coarse picture a search steers by. */
  const joinPoints = (): number[] => {
    const out: number[] = [];
    let n = 0;
    openRoads((_line, _kind, sample) => {
      if (n++ % (JOIN_STRIDE / 2) === 0) out.push(sample.x, sample.z);
    });
    return out;
  };

  /** The points a pad is judged at: its centre and two rings. Sixteen a
   * ring, because a stream is a few metres wide and eight would let one
   * through between two probes. */
  const padProbes = (x: number, z: number, radius: number): { x: number; z: number }[] => {
    const out: { x: number; z: number }[] = [{ x, z }];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const r of [radius * 0.35, radius * 0.7, radius]) {
        out.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
      }
    }
    return out;
  };

  /** Is this a place a pad could be graded: clear of the route by the pad's
   * margin, clear of every other built thing, dry, off the streams and the
   * mounds, and no more than `level` off one plane anywhere across it —
   * and not standing where the crowd already does. Returns the pad the
   * place would take, or null. */
  const padFits = (
    ctx: CarParkContext,
    x: number,
    z: number,
    radius: number,
    stands: readonly Stand[],
    /** The road the pad hangs off, exempt from the built-clearance test
     * where the road's own mouth runs onto the pad. */
    exempt: { x: number; z: number; heading: number } | null,
  ): CarParkPad | null => {
    const probes = padProbes(x, z, radius);
    const refuse = (why: string): null => {
      ctx.note?.(`pad:${why}`);
      return null;
    };
    // A field off the course, not a lay-by beside it: the pad stands clear
    // of the route by the walk in, and the crowd covers the rest on foot.
    if (nearRoute(x, z)) return refuse("standoff");
    const heights: number[] = [];
    for (const p of probes) {
      if (ctx.routeDistance(p.x, p.z) < corridor + P.pad.clear) return refuse("route");
      if (ctx.blocked(p.x, p.z)) return refuse("blocked");
      if (ctx.land.flooded(p.x, p.z, SPUR.shoreFreeboard)) return refuse("flooded");
      // The road the pad is reached by runs through its rim: the probes
      // on that road's own line are not standing on somebody else's.
      let onRoad = false;
      if (exempt) {
        const rx = Math.cos(exempt.heading);
        const rz = -Math.sin(exempt.heading);
        const lateral = Math.abs((p.x - exempt.x) * rx + (p.z - exempt.z) * rz);
        onRoad = lateral < P.road.width / 2 + ROAD_CROSS.reach + 1;
      }
      if (!onRoad && ctx.builtClearance(p.x, p.z) < 6) return refuse("built");
      // The ground as the terrain has already SHAPED it, not the bare
      // country: beside the road R31 has cut the hillside back to its cone,
      // and a pad fitted to the hill that was there before the cut is a pad
      // standing over the cone at its near rim, on every stage with any
      // relief in it.
      heights.push(ctx.heightAt(p.x, p.z));
    }
    // The plane the pad is graded to: the least-squares fit through the
    // probes, which on two symmetric rings round the centre is the mean
    // height and the moment of the heights about each axis. Held to a
    // grade a car park can be parked on; steeper country than that is a
    // hillside, and the residual says so.
    let sum = 0;
    let mx = 0;
    let mz = 0;
    let spread = 0;
    probes.forEach((p, i) => {
      sum += heights[i];
      mx += heights[i] * (p.x - x);
      mz += heights[i] * (p.z - z);
      spread += (p.x - x) * (p.x - x);
    });
    const y = sum / probes.length;
    const grade = { x: mx / spread, z: mz / spread };
    const steep = Math.hypot(grade.x, grade.z);
    if (steep > P.pad.maxGrade) {
      grade.x *= P.pad.maxGrade / steep;
      grade.z *= P.pad.maxGrade / steep;
    }
    const pad: CarParkPad = { x, z, y, radius, grade };
    // R31 — and nowhere above the terrain's OWN cone: a pad is the floor
    // on the cone (terrain.ts), so a plane standing over it is the wall
    // beside the road the cone exists to take down. The terrain's cone and
    // not a restatement of it at the verge's climb — the cut is made at
    // the grade R34 gives the road, and a gentler copy refused half the
    // country beside every road with relief in it.
    let wall = false;
    probes.forEach((p, i) => {
      const level = padHeight(pad, p.x, p.z);
      if (Math.abs(level - heights[i]) > P.pad.level) heights[i] = NaN;
      if (level > ctx.ceilingAt(p.x, p.z)) wall = true;
    });
    if (heights.some((h) => Number.isNaN(h))) return refuse("level");
    if (wall) return refuse("band");
    // Never under the crowd: a pad's blend would regrade the ground a stand
    // is standing on.
    for (const stand of stands) {
      const back = standBack(stand);
      for (const q of [stand, back]) {
        if (Math.hypot(q.x - x, q.z - z) < radius + 4) return refuse("stand");
      }
    }
    for (const other of carParks) {
      if (Math.hypot(other.pad.x - x, other.pad.z - z) < P.pad.apart) return refuse("apart");
    }
    return pad;
  };

  /** One step of a lane's height: the minor road's rule (`followStep`), at
   * a car park lane's own grade. */
  const profileStep = (y: number, slope: number, target: number): { y: number; slope: number } =>
    followStep(y, slope, target, P.road.maxGrade);

  /** The pad's plane's own slope along a heading, m per m — what a lane
   * that leaves the pad along it is already climbing. */
  const planeSlope = (pad: CarParkPad, heading: number): number =>
    pad.grade.x * Math.sin(heading) + pad.grade.z * Math.cos(heading);

  /** Is the lane, as it stands, a road end to end — no step in it steeper
   * than a lane or a pad is built to? The last word on a lane, asked
   * after the pad's blend: everything above lays the profile to arrive on
   * the plane, and where the country gave it too short a run to, the blend
   * turns what is left into a ramp. A lane that fails this is not built,
   * and the search tries another way in (R42: reject, never repair). */
  const gradesHold = (samples: SpurSample[]): boolean => {
    const most = Math.max(P.road.maxGrade, P.pad.maxGrade) + 0.02;
    for (let i = 1; i < samples.length; i++) {
      const run = samples[i].s - samples[i - 1].s;
      if (run <= 1e-6) return false;
      if (Math.abs(samples[i].elevation - samples[i - 1].elevation) > most * run) return false;
    }
    return true;
  };

  /** Ease a lane's FIRST stretch off the road it leaves, so a car turning
   * in rides that road's cross-section instead of dropping off it.
   *
   * A lane that is searched out over the country (`layRoadOut`) arrives at
   * the road it joins on that road's CROWN — which on tarmac stands
   * `asphaltLift` proud of the country and cambers away either side — and
   * then carries on at its own height. The terrain lays the joined road's
   * mat out to `ROAD_CROSS.reach` past its edge, so the lane's first few
   * metres run across ground that is the road's, not theirs: a quarter of a
   * metre of step at the mouth of every join, which the lane roller finds
   * one metre in. `tryAccess` never had it because a lane leaving a road
   * square is laid ON the cross-section from the start; this is the same
   * thing for a lane that arrives at an angle, blended out over the mat so
   * the lane's own profile takes over where the road's stops. */
  const easeOffJoin = (
    samples: SpurSample[],
    join: { sample: SpurSample; line: SpurLine },
  ): void => {
    const at = join.sample;
    const half = join.line.width / 2;
    const lip = half + ROAD_CROSS.reach;
    const shape = { surface: at.surface, lift: at.lift, flat: at.flat };
    const rx = Math.cos(at.heading);
    const rz = -Math.sin(at.heading);
    for (const sample of samples) {
      if (sample.s > lip) break;
      const lateral = (sample.x - at.x) * rx + (sample.z - at.z) * rz;
      const on =
        at.elevation +
        corridorOffset(shape, Math.max(-lip, Math.min(lip, lateral)), join.line.width);
      // The road's own surface while the lane is on its mat, then handed
      // back to the lane over the verge — the same hand-over R16 gives the
      // ground beside any road.
      const t = smooth(clamp01((Math.abs(lateral) - half) / ROAD_CROSS.reach));
      sample.elevation = on * (1 - t) + sample.elevation * t;
    }
  };

  /** Ease a road's last stretch onto the pad it runs onto, so the two are
   * one piece of ground rather than a ramp meeting a table. The lanes are
   * laid to arrive on the plane already (`profileStep` toward it on the
   * way in, `PLANE_RUN` of it on the way out), so what is blended here is
   * a residual, not a step. */
  const easeOntoPad = (samples: SpurSample[], pad: CarParkPad): void => {
    for (const sample of samples) {
      const d = Math.hypot(sample.x - pad.x, sample.z - pad.z);
      const level = padHeight(pad, sample.x, sample.z);
      if (d <= pad.radius) sample.elevation = level;
      else if (d < pad.radius + P.pad.blend) {
        const t = smooth(clamp01((d - pad.radius) / P.pad.blend));
        sample.elevation = level * (1 - t) + sample.elevation * t;
      }
    }
  };

  /** The world as a WALK sees it (`carpark-trail.ts`), which is the placer's
   * own context minus everything only a road asks about. */
  const trailProbe = (ctx: CarParkContext): TrailProbe => ({
    routeDistance: ctx.routeDistance,
    builtClearance: ctx.builtClearance,
    blocked: ctx.blocked,
    flooded: ctx.land.flooded,
    heightAt: ctx.heightAt,
    corridor,
    note: ctx.note,
  });

  /** The cars, nosed into the bays. `park.cars` many of them, which is the
   * crowd's own number (`carsFor`) — the spaces the blade left over stand
   * empty, and which ones do is a roll. */
  const fillBays = (
    rng: Rng,
    park: { pad: CarParkPad; heading: number; bays: number; count: number },
  ): ParkedCar[] => {
    const bays = parkBays(park);
    const empty = new Set<number>();
    while (empty.size < bays.length - park.count) empty.add(rng.int(0, bays.length - 1));
    const cars: ParkedCar[] = [];
    bays.forEach((bay, i) => {
      if (empty.has(i)) return;
      const fx = Math.sin(bay.heading);
      const fz = Math.cos(bay.heading);
      const rx = Math.cos(bay.heading);
      const rz = -Math.sin(bay.heading);
      const back = rng.range(-0.25, 0.25);
      const side = rng.range(-0.2, 0.2);
      const cx = bay.x + fx * back + rx * side;
      const cz = bay.z + fz * back + rz * side;
      cars.push({
        x: cx,
        z: cz,
        y: padHeight(park.pad, cx, cz),
        heading: bay.heading + rng.range(-0.08, 0.08),
        roll: rng.next(),
      });
    });
    return cars;
  };

  /** A car park off an existing public road: the pad `approach` metres
   * square off the road on the stand's side, and a straight lane between. */
  const tryAccess = (
    ctx: CarParkContext,
    rng: Rng,
    access: Access,
    stand: Stand,
    stands: readonly Stand[],
    plan: { bays: number; cars: number; heads: number; radius: number },
  ): CarPark | null => {
    const radius = plan.radius;
    const at = access.sample;
    const back = standBack(stand);
    const rx = Math.cos(at.heading);
    const rz = -Math.sin(at.heading);
    const side: 1 | -1 = (back.x - at.x) * rx + (back.z - at.z) * rz >= 0 ? 1 : -1;
    const heading = at.heading + (side * Math.PI) / 2;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const roadHalf = access.line.width / 2;
    const lip = roadHalf + ROAD_CROSS.reach;
    const approach = Math.max(
      rng.range(P.road.approach.min, P.road.approach.max),
      lip + radius + P.road.rim,
    );
    const cx = at.x + fx * approach;
    const cz = at.z + fz * approach;
    const fit = padFits(ctx, cx, cz, radius, stands, { x: at.x, z: at.z, heading });
    if (fit === null) return null;
    // The lane: on the public road's own cross-section while inside its
    // lip, then following the country at the road's grade and the route's
    // crest rule, held inside the stage's cone — and, from the pad's blend
    // in, climbing onto the pad's own plane, so that it arrives ON the pad
    // rather than beside it.
    const follow = 1 - Math.exp(-SPUR.step / R.elevation.follow.lag);
    const samples: SpurSample[] = [];
    const shape = { surface: at.surface, lift: at.lift, flat: at.flat };
    let y = at.elevation;
    let slope = 0;
    let pad: CarParkPad | null = null;
    for (let s = 0; s <= approach; s += SPUR.step) {
      const x = at.x + fx * s;
      const z = at.z + fz * s;
      const toCentre = approach - s;
      if (s <= lip) {
        // Across the road's mat the lane is the mat; across its shoulder
        // it HOLDS the mat's edge, the way a junction's mouth is graded
        // up to the road rather than dropped off it — the shoulder's fall
        // is half a metre, and taken in one step it is the first thing a
        // car turning in meets. The slope the lane leaves on is whatever
        // that last step was, so the profile bends away from it rather
        // than from level.
        const was = y;
        y = at.elevation + corridorOffset(shape, side * Math.min(s, roadHalf), access.line.width);
        if (s > 0) slope = (y - was) / SPUR.step;
      } else {
        if (!pad) {
          // The pad's LEVEL is settled where the lane steps off the road:
          // the country's own fit, moved no further toward the level that
          // puts the plane exactly under the lane here than the run to
          // the rim can make up at most of a road's grade. Settled from
          // the centre instead, the whole difference lands in the pad's
          // twelve-metre blend, which is a ramp steeper than any road on
          // the stage.
          const level = y - fit.grade.x * (x - cx) - fit.grade.z * (z - cz);
          // What the run to the rim can make up: the road's grade over the
          // run, less the stretch the crest rule spends winding that grade
          // on, and a share of that for the plane's own slope against it.
          const winding = P.road.maxGrade / R.elevation.follow.minorCrest / 2;
          const run = Math.max(0, toCentre - radius - winding);
          const reach = Math.min(2, P.road.maxGrade * run * 0.6);
          pad = { ...fit, y: Math.max(level - reach, Math.min(level + reach, fit.y)) };
        }
        const band = pad ? null : shelfBand(x, z);
        const want = pad ? padHeight(pad, x, z) : y + (ctx.land.heightAt(x, z) - y) * follow;
        const target = band ? Math.min(band.ceiling, Math.max(band.floor, want)) : want;
        // Onto the plane at the plane's own grade, which a pad may hold a
        // shade steeper than a lane: capped at the lane's, a lane falls
        // behind a plane at the pad's ceiling and meets the rim as a step.
        ({ y, slope } = pad
          ? followStep(y, slope, target, Math.max(P.road.maxGrade, P.pad.maxGrade))
          : profileStep(y, slope, target));
        if (pad && toCentre <= radius) {
          y = padHeight(pad, x, z);
          slope = planeSlope(pad, heading);
        } else if (band) {
          const bent = y;
          if (y > band.ceiling) y = band.ceiling;
          if (y < band.floor) y = Math.min(band.floor, band.ceiling);
          // R31's band is a hard clamp, and a clamp that moves the road by
          // more than a step's grade IS a step: the cone's floor standing
          // metres over a lane is a lane there is no laying here.
          if (Math.abs(y - bent) > P.road.maxGrade * SPUR.step * 1.5) return null;
        }
      }
      samples.push({ x, z, heading, elevation: y, s, surface: ctx.loose, lift: 0, flat: 0 });
      if (s > lip) {
        if (ctx.routeDistance(x, z) < corridor + P.road.width / 2 + ROAD_CROSS.reach) return null;
        if (ctx.blocked(x, z) || ctx.land.flooded(x, z, SPUR.shoreFreeboard)) return null;
        // Past the road it is leaving, it keeps its distance from every
        // other one.
        if (s > roadHalf + P.road.clear && ctx.builtClearance(x, z) < P.road.clear) return null;
      }
    }
    const end = samples[samples.length - 1];
    if (!pad) {
      // A lane too short to have reached the blend past the lip: the pad
      // takes the level its last stretch can make up.
      const reach = P.road.maxGrade * P.pad.blend;
      pad = { ...fit, y: Math.max(end.elevation - reach, Math.min(end.elevation + reach, fit.y)) };
    }
    // The centre is the lane's end exactly, on the pad's level — and its
    // arc position is where it now stands, or the last step reads as a
    // grade it is not.
    end.x = cx;
    end.z = cz;
    end.s = approach;
    easeOntoPad(samples, pad);
    if (!gradesHold(samples)) {
      ctx.note?.("road:ramp");
      return null;
    }
    const park: CarPark = {
      atS: stand.s,
      pad,
      heading,
      bays: plan.bays,
      cars: [],
      heads: plan.heads,
      road: { atS: stand.s, samples, width: P.road.width },
      access: access.kind,
      trails: [],
      roll: rng.next(),
    };
    park.cars = fillBays(rng, { ...park, count: plan.cars });
    return park;
  };

  /** Lay the lane out of a pad along the cells the search found, from the
   * pad's centre to `join` — a point on a road already there, which it runs
   * into at that road's own height — or, where the search found none, out
   * past the edge of the map: a walk that steers for the next cell at a
   * road's own radius, follows the country at a minor road's grade, and is
   * held inside the stage's cone (R31). Null where a step of it would stand
   * where a road may not (R23), which the search's slack makes rare. Samples
   * run OUTWARD, pad first. */
  const layRoadOut = (
    ctx: CarParkContext,
    map: CountryMap,
    pad: CarParkPad,
    heading0: number,
    path: number[],
    join: { sample: SpurSample; line: SpurLine } | null,
  ): SpurSample[] | null => {
    /** How near the joined road the lane may be before the R23 built test
     * stops applying to it, m, centerline to centerline.
     *
     * Derived from what that test actually asks rather than from the road
     * clearance, and the difference is not a nicety: `builtClearance`
     * measures to a road's EDGE, so on a sixteen-metre public road a lane
     * standing 32 m out reads as 24 m of clearance against a 26 m bar and
     * is refused — while the exemption, at a lane's own 31 m clearance,
     * has already stopped covering it. Three metres wide, and every
     * approach to the public road on seed 5 fell into it. */
    const joinExempt = join
      ? Math.max(roadClearance(P.road.width), P.road.clear + join.line.width / 2 + SPUR.step)
      : 0;
    /** Distance to the road being joined, near the join, m — inside its
     * clearance the lane is allowed to close on it, and on nothing else. */
    const toJoinedRoad = (qx: number, qz: number): number => {
      if (!join) return Infinity;
      let best = Infinity;
      for (const sample of join.line.samples) {
        if (Math.abs(sample.s - join.sample.s) > JOIN_WINDOW) continue;
        const d = Math.hypot(sample.x - qx, sample.z - qz);
        if (d < best) best = d;
      }
      return best;
    };
    // The waypoints: every cell centre past the pad's own, pulled straight
    // wherever the cells between two of them are all drivable — a road is
    // a line, not a walk along a lattice.
    const points: { x: number; z: number }[] = [pad];
    for (let k = 1; k < path.length; k++) points.push(map.centre(path[k]));
    const way: { x: number; z: number }[] = [points[0]];
    let i = 0;
    while (i < points.length - 1) {
      let j = points.length - 1;
      for (; j > i + 1; j--) {
        const a = points[i];
        const b = points[j];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        let open = true;
        for (let d = CELL / 2; d < len; d += CELL / 2) {
          const t = d / len;
          const cell = map.at(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
          if (cell < 0 || !map.drivable(cell)) {
            open = false;
            break;
          }
        }
        if (open) break;
      }
      way.push(points[j]);
      i = j;
    }
    const follow = 1 - Math.exp(-SPUR.step / R.elevation.follow.lag);
    const samples: SpurSample[] = [];
    let heading = heading0;
    let x = pad.x;
    let z = pad.z;
    let y = pad.y;
    let slope = planeSlope(pad, heading0);
    let next = 1;
    const b = map.bounds;
    const at = join?.sample ?? null;
    if (at) way.push({ x: at.x, z: at.z });
    for (let s = 0; s <= ROAD_MAX; s += SPUR.step) {
      samples.push({ x, z, heading, elevation: y, s, surface: ctx.loose, lift: 0, flat: 0 });
      if (at) {
        // Into the road it joins: the last sample IS the join, on that
        // road's own centerline at that road's own height.
        const d = Math.hypot(at.x - x, at.z - z);
        if (d <= SPUR.step * 1.2) {
          // A join under half a step away REPLACES the sample just laid
          // rather than following it: a metre of lane between the two is a
          // metre that whatever height is left between them is taken over.
          if (d < SPUR.step / 2 && samples.length > 1) samples.pop();
          const last = samples[samples.length - 1];
          const run = Math.hypot(at.x - last.x, at.z - last.z);
          // ...and the lane has to have got to the road's height. The
          // closing starts far enough out for a road's grade to make it
          // up, but the country between can refuse it — a band clamp, a
          // shelf — and a lane that arrives standing over the road it joins
          // would meet it as a wall. Refused instead, and the search tries
          // another cell.
          if (Math.abs(at.elevation - last.elevation) > (P.road.maxGrade + 0.02) * run) {
            ctx.note?.("road:join-height");
            return null;
          }
          samples.push({
            x: at.x,
            z: at.z,
            heading,
            elevation: at.elevation,
            s: last.s + run,
            surface: ctx.loose,
            lift: 0,
            flat: 0,
          });
          return samples;
        }
      } else {
        const left =
          x < b.minX - SPUR.escape ||
          x > b.maxX + SPUR.escape ||
          z < b.minZ - SPUR.escape ||
          z > b.maxZ + SPUR.escape;
        if (left && !ctx.land.flooded(x, z)) return samples;
      }
      while (next < way.length - 1 && Math.hypot(way[next].x - x, way[next].z - z) < CELL * 0.8) {
        next++;
      }
      const aim = way[next];
      const want = Math.atan2(aim.x - x, aim.z - z);
      const turn = wrap(want - heading);
      const most = SPUR.step / SPUR.minRadius;
      heading += Math.max(-most, Math.min(most, turn));
      x += Math.sin(heading) * SPUR.step;
      z += Math.cos(heading) * SPUR.step;
      const toJoin = at ? Math.hypot(at.x - x, at.z - z) : Infinity;
      // R23 — every step is a road's, or the road is not built.
      if (s > 0 && ctx.routeDistance(x, z) < keepOut) {
        ctx.note?.("road:route");
        return null;
      }
      if (s > 0 && toJoinedRoad(x, z) > joinExempt && ctx.builtClearance(x, z) < P.road.clear) {
        ctx.note?.("road:built");
        return null;
      }
      // On the pad, and for a short run past its rim, the lane IS the pad's
      // plane: it leaves the car park at the car park's own grade. Then
      // R34 — following the country at a minor road's grade and the
      // minor road's crest rule, off that plane; R31 — inside the stage's cone
      // while it is in it. On the way into a join the height closes on
      // the joined road's instead, so the two meet on one plane — from
      // however far out the gap between the two needs at a road's grade.
      if (Math.hypot(x - pad.x, z - pad.z) <= pad.radius + PLANE_RUN) {
        y = padHeight(pad, x, z);
        slope = planeSlope(pad, heading);
        continue;
      }
      const gap = at ? at.elevation - y : 0;
      const ease = Math.max(JOIN_EASE, Math.abs(gap) / P.road.maxGrade + JOIN_EASE / 2);
      const wantY =
        at && toJoin < ease
          ? y + gap * Math.min(1, SPUR.step / Math.max(SPUR.step, toJoin))
          : y + (ctx.land.heightAt(x, z) - y) * follow;
      // Aimed at the band and then clamped to it (`buildSpur` says why).
      const band = shelfBand(x, z);
      ({ y, slope } = profileStep(y, slope, Math.min(band.ceiling, Math.max(band.floor, wantY))));
      const bent = y;
      if (y > band.ceiling) y = band.ceiling;
      if (y < band.floor) y = Math.min(band.floor, band.ceiling);
      // R31's band is a hard clamp, and a clamp that moves the road by more
      // than a step's grade IS a step — the cone's floor standing metres
      // over the pad's rim can throw a lane thirty metres up in four. A
      // road is not laid there.
      if (Math.abs(y - bent) > P.road.maxGrade * SPUR.step * 1.5) {
        ctx.note?.("road:band");
        return null;
      }
      if (!shelfHolds(x, z, y)) {
        ctx.note?.("road:shelf");
        return null;
      }
    }
    ctx.note?.("road:long");
    return null;
  };

  /** A car park with a road of its own: a pad found by WALKING out from the
   * stand over the country map, and a lane from it out to the edge of the
   * map found by driving over the same map. */
  const tryBuiltOut = (
    ctx: CarParkContext,
    rng: Rng,
    stand: Stand,
    stands: readonly Stand[],
    plan: { bays: number; cars: number; heads: number; radius: number },
  ): { park: CarPark; map: CountryMap } | null => {
    const radius = plan.radius;
    const back = standBack(stand);
    const map = countryMap(ctx, back);
    const start = map.at(back.x, back.z);
    if (start < 0) return null;
    // Everywhere the crowd could walk to from the stand, nearest first —
    // the pad goes on the first of them the country will take, and that
    // has a way out for a road.
    const { dist } = walkFrom(map, start, P.walk);
    const cells: number[] = [];
    for (let c = 0; c < dist.length; c++) if (dist[c] < Infinity && dist[c] > 0) cells.push(c);
    cells.sort((a, b) => dist[a] - dist[b]);
    let tried = 0;
    let roads = 0;
    for (const cell of cells) {
      const c = map.centre(cell);
      // The cheap questions first, at the centre alone: the rim has to
      // clear the route and every built thing, so the centre has to clear
      // them by the radius as well; and a centre the stage's cone would
      // not let stand at its own ground's height is a pad the cone would
      // cut, whatever the rings say.
      // The stand-off FIRST, and before the try counter: the cells come
      // nearest-first, most of a stage's country is inside the stand-off,
      // and counting those against the budget spends the whole of it a
      // hundred metres from the stand without ever reaching the field the
      // pad belongs in.
      if (nearRoute(c.x, c.z)) continue;
      // ...and inside the country the stage occupies. A cell past the rim
      // is a cell a lane has already "left" the map from, so the pad gets
      // no lane at all — a car park standing in a field beyond the fog with
      // nothing leading to it, which is what five of the fifty-odd pads on
      // a twelve-seed sweep were.
      if (map.out(cell)) continue;
      const toRoute = ctx.routeDistance(c.x, c.z);
      if (toRoute < corridor + P.pad.clear + radius) continue;
      if (ctx.builtClearance(c.x, c.z) < radius + 6) continue;
      if (ctx.land.flooded(c.x, c.z, SPUR.shoreFreeboard)) continue;
      if (Math.hypot(c.x - back.x, c.z - back.z) < radius + 8) continue;
      if (++tried > 80) break;
      // A little off the lattice, so a sweep of car parks is not a grid.
      const x = c.x + rng.range(-6, 6);
      const z = c.z + rng.range(-6, 6);
      const pad = padFits(ctx, x, z, radius, stands, null);
      if (pad === null) continue;
      // The way out: into a road already there — an arm, a public road, or
      // an earlier car park's lane — and never to the edge of the map. The
      // cars arrived on a road, so a lane that reaches no road is a car
      // park nobody could have driven to. The search steers by a coarse
      // picture of where those roads are (a point every few samples) and
      // asks the roads themselves only where the picture says one is close.
      // How near a road a cell has to be to count as REACHING it. It has to
      // outreach the map's own drivable bar by more than a cell, or the
      // band of cells that are both drivable and near enough is narrower
      // than the lattice and the search walks straight through it: with a
      // cell's slack either side there was a twelve-metre window for a
      // twenty-four-metre cell, and nothing on the far side of it was ever
      // reached. What is left over is the lane's own to close, which is
      // what `layRoadOut` does from `keepOut` in.
      const joinReach = P.road.clear + CELL * 2.5;
      const coarse = joinPoints();
      const roughly = (qx: number, qz: number): number => {
        let best = Infinity;
        for (let k = 0; k < coarse.length; k += 2) {
          const dx = coarse[k] - qx;
          const dz = coarse[k + 1] - qz;
          const d2 = dx * dx + dz * dz;
          if (d2 < best) best = d2;
        }
        return Math.sqrt(best);
      };
      const path = wayOut(map, map.at(x, z), {
        at: (cell) => {
          const q = map.centre(cell);
          return (
            roughly(q.x, q.z) <= joinReach + JOIN_STRIDE * SPUR.step &&
            nearestJoin(q.x, q.z, joinReach) !== null
          );
        },
        distance: roughly,
      });
      // A pocket the stage has closed has no way out from anywhere in it:
      // two pads that fail to leave are the country's answer.
      if (!path) {
        ctx.note?.("road:no-way-out");
        if (++roads >= 2) break;
        continue;
      }
      const last = map.centre(path[path.length - 1]);
      const join = map.out(path[path.length - 1]) ? null : nearestJoin(last.x, last.z, joinReach);
      const away = path.length > 1 ? map.centre(path[1]) : c;
      const heading = Math.atan2(away.x - x, away.z - z);
      const out = layRoadOut(ctx, map, pad, heading, path, join);
      if (!out) {
        if (++roads >= 3) break;
        continue;
      }
      // Reversed: a car park's road runs from the outside world IN, so its
      // last sample is the pad's centre whichever way it was found.
      const length = out[out.length - 1].s;
      const samples: SpurSample[] = out
        .slice()
        .reverse()
        .map((sample) => ({
          x: sample.x,
          z: sample.z,
          heading: wrap(sample.heading + Math.PI),
          elevation: sample.elevation,
          s: length - sample.s,
          surface: ctx.loose,
          lift: 0,
          flat: 0,
        }));
      if (join) easeOffJoin(samples, join);
      easeOntoPad(samples, pad);
      if (!gradesHold(samples)) {
        ctx.note?.("road:ramp");
        if (++roads >= 3) break;
        continue;
      }
      const park: CarPark = {
        atS: stand.s,
        pad,
        heading: wrap(heading + Math.PI),
        bays: plan.bays,
        cars: [],
        heads: plan.heads,
        road: { atS: stand.s, samples, width: P.road.width },
        access: join?.kind ?? "map",
        trails: [],
        roll: rng.next(),
      };
      park.cars = fillBays(rng, { ...park, count: plan.cars });
      return { park, map };
    }
    ctx.note?.(tried > 80 ? "pad:tried-out" : "pad:none");
    return null;
  };

  /** Serve one stand: a car park a walk away, off a public road if one is
   * in reach and down a lane of its own otherwise, with trails to every
   * unserved stand that walk reaches. Null where the country refuses. */
  const serve = (
    ctx: CarParkContext,
    stand: Stand,
    stands: readonly Stand[],
  ): { park: CarPark; stands: Stand[] } | null => {
    const rng = createRng((seed ^ Math.imul(Math.round(stand.s * 4) + 1, 2654435761)) >>> 0);
    // R42 — the pad is sized from the CROWD: how many people are standing
    // at this corner, at a carful apiece, plus the space or two the blade
    // left over. An even count, because the bays are two rows of the same
    // length.
    const heads = standHeads(stand);
    const cars = carsFor(heads, rng.next());
    const bays = 2 * Math.ceil((cars + rng.int(P.bays.spare.min, P.bays.spare.max)) / 2);
    const { length, width } = bayLayout(bays);
    const plan = {
      bays,
      cars,
      heads,
      radius: Math.hypot(length / 2, width / 2) + P.pad.margin,
    };
    const back = standBack(stand);
    let park: CarPark | null = null;
    let map: CountryMap | null = null;
    for (const access of accessPoints(back).slice(0, 3)) {
      park = tryAccess(ctx, rng, access, stand, stands, plan);
      if (!park) continue;
      map = countryMap(ctx, back);
      const own = walkTrail(trailProbe(ctx), map, park.pad, stand);
      if (own) {
        park.trails.push(own);
        break;
      }
      park = null;
    }
    if (!park) {
      const built = tryBuiltOut(ctx, rng, stand, stands, plan);
      if (!built) {
        ctx.note?.("serve:no-park");
        return null;
      }
      park = built.park;
      map = built.map;
      const own = walkTrail(trailProbe(ctx), map, park.pad, stand);
      if (!own) {
        ctx.note?.("serve:own-trail");
        return null;
      }
      park.trails.push(own);
    }
    if (!map) return null;
    // ...and every other stand the same walk reaches: the ones behind on
    // the stage still unserved, and the ones ahead that are settled — no
    // further along than `hold` leaves room for, so a streamed stage sees
    // the same cluster however it was chunked.
    const reached: Stand[] = [stand];
    for (const other of stands) {
      if (other === stand || served.has(standKey(other))) continue;
      if (other.s - stand.s > P.hold - 200) continue;
      const otherBack = standBack(other);
      if (Math.hypot(otherBack.x - park.pad.x, otherBack.z - park.pad.z) > P.walk) continue;
      // ...and only as many of them as the cars on the pad could have
      // BROUGHT. The pad was graded for one corner's crowd; a second one
      // walking in from it needs the cars to have carried them too, and a
      // pad already laid cannot grow. The stand it turns away is decided on
      // its own turn and gets a car park of its own — which is the right
      // answer anyway: two corners far enough apart to be two stands are
      // two places a marshal opens a field.
      if ((park.heads + standHeads(other)) / P.occupancy.max > park.cars.length) continue;
      const trail = walkTrail(trailProbe(ctx), map, park.pad, other);
      if (!trail) continue;
      park.heads += standHeads(other);
      park.trails.push(trail);
      reached.push(other);
    }
    for (const trail of park.trails) signTrail(trailProbe(ctx), trail);
    return { park, stands: reached };
  };

  const extend: CarParkField["extend"] = (upToS, stands, given) => {
    const ctx: CarParkContext = given.note
      ? given
      : { ...given, note: carParkTally.note ?? undefined };
    const refused: Stand[] = [];
    for (const stand of stands) {
      const key = standKey(stand);
      if (decided.has(key)) continue;
      // On a streamed stage a stand waits until every stand its car park
      // could also serve has been placed; a finite one has them all.
      if (track.endless && stand.s + P.hold > upToS) break;
      decided.add(key);
      if (served.has(key)) continue;
      const found = serve(ctx, stand, stands);
      // R42 — nowhere to park within a walk, or no way to drive to it: then
      // nobody stood here. The stand goes.
      //
      // EXCEPT AT THE FINISH. The banks either side of the gate are not a
      // crowd that found its own way to a corner: the finish is where the
      // organisers put everything — the service area, the trucks, the road
      // the timing crew drove in on — so access to it is a property of the
      // event rather than something the country has to offer. A stage whose
      // finish is unwatched because no pad would grade behind it is a stage
      // that has lost the one crowd R27 guarantees.
      if (!found) {
        if (!stand.finish) refused.push(stand);
        continue;
      }
      carParks.push(found.park);
      for (const at of found.stands) served.add(standKey(at));
      ctx.commit(found.park);
    }
    carParks.sort((a, b) => a.atS - b.atS);
    // ...and only the ones still unserved when the pass is over. A stand
    // whose own turn found it nowhere to park can be picked up afterwards
    // by a LATER car park's cluster — it is within a walk of that pad even
    // though no pad could be planned from it — and handing that one back
    // drops a stand with a trail already running to it.
    return refused.filter((stand) => !served.has(standKey(stand)));
  };

  const trailClearanceAt = (x: number, z: number): number => {
    let best = Infinity;
    for (const park of carParks) best = Math.min(best, trailClearance(park.trails, x, z));
    return best;
  };

  const pruneBefore = (s: number): void => {
    let cut = 0;
    while (cut < carParks.length && carParks[cut].atS < s) cut++;
    if (cut > 0) carParks.splice(0, cut);
  };

  return { carParks, extend, trailClearance: trailClearanceAt, pruneBefore };
}

/** How far round a place an endless stage's country map reaches, m — a
 * streamed stage has no box, so a road that gets this far from the stand
 * has left the neighbourhood, past the fog. */
const STREAMED_BOX = 460;

/** R42 — everything about a car park the car can HIT, as solids: every
 * parked car as two. Read by the terrain field that collides them and by
 * any test that wants to know where the cars are. */
export function carParkSolids(
  park: CarPark,
  groundAt: (x: number, z: number) => number = (_x, _z) => NaN,
): WildObstacle[] {
  return parkedSolids(park.cars, groundAt, []);
}
