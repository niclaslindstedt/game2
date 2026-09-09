// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A CAR PARK IS (R42): the pad the terrain grades to a plane, the way
// in the crowd drove up, the cars standing on it, and the trails walked
// off it to the stands — plus the arithmetic that turns a stand's crowd
// into a number of cars and a number of cars into a rectangle of bays.
// None of it needs the country: it is the shape of the thing, and
// `carparks.ts` is where one is put.

import { type ParkedCar } from "./buildings.ts";
import type { Surface } from "./compile.ts";
import type { LandField } from "./land.ts";
import { type Trail } from "./carpark-trail.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { SPUR, type SpurLine, type SpurSample } from "./spurs.ts";
import { type Stand } from "./stands.ts";

export const P = R.carPark;

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function wrap(a: number): number {
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
export const ROAD_MAX = SPUR.length.max;

/** How far outside the stage's own box a lane will go looking for a road to
 * join, m. The country map's lattice is grown to cover whichever roads
 * stand inside it; past this the road is somewhere the crowd drove FROM,
 * not somewhere a marshal ran a lane out to. */
export const LANE_REACH = 1000;

/** Over how much of its last stretch a lane closes its height onto the
 * road it runs into, m — at least. A lane that meets the road standing
 * higher or lower than this can close at its own grade starts closing
 * further out (`layRoadOut`), because the alternative is arriving beside
 * the road and dropping onto it. */
export const JOIN_EASE = 48;
/** How far the road that leaves a pad runs ON the pad's own plane before it
 * is allowed to bend away toward the country, m past the rim — so the
 * lane leaves the car park at the car park's own grade and the pad's
 * blend (`easeOntoPad`) has nothing to make up. */
export const PLANE_RUN = 8;
/** One sample in this many of a road a lane may join goes into the coarse
 * picture the search steers by — a point every couple of dozen metres. */
export const JOIN_STRIDE = 6;

/** How much of the joined road either side of the join a lane may close
 * on, m of that road's own arc.
 *
 * It is the R23 exemption for the road the lane is running INTO — inside it
 * the lane may come near that road, and near nothing else — so it has to be
 * long enough to cover the whole approach. A lane aiming at a public road
 * across open country runs at a shallow angle for the last few hundred
 * metres, and at a window of 120 m every one of the six approaches on seed 5
 * was refused for standing too close to the very road it was about to join. */
export const JOIN_WINDOW = 400;

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
export function standKey(stand: Stand): string {
  return `${stand.s.toFixed(2)}/${stand.facing.toFixed(4)}`;
}

/** A point on a public road a car park may leave from. */
export type Access = { line: SpurLine; sample: SpurSample; kind: CarParkAccess; d: number };

/** How big a cell the stand-off field is drawn on, m. */
export const NEAR_CELL = 64;

/** How far round a place an endless stage's country map reaches, m — a
 * streamed stage has no box, so a road that gets this far from the stand
 * has left the neighbourhood, past the fog. */
export const STREAMED_BOX = 460;
