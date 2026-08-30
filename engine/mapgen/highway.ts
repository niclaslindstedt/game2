// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17 — THE TARMAC, laid before anybody thought about a rally.
//
// A sealed road is not a property of the racing line. It is a public road
// that was there first, that goes somewhere, and that the stage borrows for
// a kilometre before turning off it again. Deriving it from the route
// instead — sealing whichever stretch a paving field happened to point at,
// and inventing a stub for the arm the route does not take — is what makes
// a crossing read as two ribbons colliding: the "other road" starts at the
// junction, wanders, and stops in a field, because it was never a road.
//
// So this module runs FIRST, on nothing but the seed, the dials and the
// bare country. It lays whole roads across the map, edge to edge, steering
// round the lakes — and because they are built from edge to edge, a tarmac
// road leading somewhere is a property of the construction rather than
// something a later check has to hope for.
//
// What it does NOT decide is height. The stage's elevation is a profile
// along the ROUTE's arc, not a heightfield, so a road's height is only
// settled once it is known which piece of it the route drives; a highway
// laid on the bare land would disagree with the route the moment the two
// shared ground. This module answers WHERE the tarmac goes. `compile.ts`
// settles how high it is, from the junction outward, the way it always has.

import { createRng } from "../lib/prng.ts";
import { cellKey } from "../lib/math.ts";
import { LAKE_Y, type LandField } from "./land.ts";
import { STAGE_RULES as R, type StageKnobs } from "./rules.ts";

/** One point on a tarmac road's centerline. No height: see the header. */
export type HighwayPoint = {
  x: number;
  z: number;
  /** Direction of travel along the road at this point, radians. */
  heading: number;
  /** Distance from the road's first point, m. */
  s: number;
};

export type Highway = {
  points: HighwayPoint[];
  /** Full carriageway width, m — the stage's own, because a rally borrows
   * the road it meets rather than one built to a different gauge. */
  width: number;
};

/** How the tarmac is laid, in meters unless noted. */
export const HIGHWAY = {
  /** Spacing along a road's centerline, m. Coarser than the stage's own
   * sampling: nothing drives this line until the compiler has resampled the
   * piece the route uses, and everything else asks it for distances
   * measured in tens of meters. */
  step: 8,
  /** How far outside the stage's world bound a road starts and ends, m. It
   * has to leave the map by more than the fog can reach, so it is never
   * seen ending — and by more than a branch's own escape, since the piece
   * the player can drive is cut from this line. */
  overrun: 320,
  /** Radius the line never turns tighter than, m. A public road through
   * open country bends; it does not corner. */
  minRadius: 220,
  /** ...and how often it redraws that bend, m. */
  bend: 260,
  /** How far ahead it looks for water, and how far above the water table
   * the ground has to stand before it will drive on it. A road does not
   * strike out across a lake on an embankment. */
  shoreLook: 190,
  shoreFreeboard: 2,
  /** ...and the radius it is allowed to bend to while it skirts one, m. */
  avoidRadius: 70,
  /** How hard it may steer back onto its bearing once it has gone round
   * something, as a share of `minRadius`'s curvature. */
  correction: 0.55,
  /** How many entry points a road may try before the country is judged not
   * to carry one there. */
  tries: 40,
} as const;

/** Cell edge of the lookup grid, m — a couple of points per cell. */
const INDEX_CELL = 32;

export type HighwayHit = {
  road: Highway;
  /** Index of the nearest point on it. */
  index: number;
  /** Distance to that point, m. */
  d: number;
};

export type HighwayNetwork = {
  roads: Highway[];
  /** The nearest piece of tarmac to a point, or null when the map has
   * none. Spatially hashed: the route's search asks this per candidate. */
  nearest: (x: number, z: number) => HighwayHit | null;
};

/** How many sealed roads a stage's country carries. The `asphalt` dial is
 * the share of the ROUTE that comes out paved (R15), and that share is
 * bought by borrowing these — so under the dial's floor there are none at
 * all, and past it the count grows with the country rather than with the
 * dial: one road crosses a sprint's map, a long stage's has room for two. */
export function highwayCount(knobs: StageKnobs, worldBound: number): number {
  if (knobs.asphalt < R.paving.floor) return 0;
  return worldBound >= 1800 ? 2 : 1;
}

/** Lay the tarmac for a seed. Deterministic in the seed, the dials and the
 * country — and in nothing else, so every consumer that rebuilds the
 * network gets the same roads. */
export function layHighways(
  seed: number,
  knobs: StageKnobs,
  land: LandField,
  /** Half-extent of the world the stage is built in, m
   * (`stageLengths[*].worldBound`). */
  worldBound: number,
  width: number,
): Highway[] {
  const roads: Highway[] = [];
  const count = highwayCount(knobs, worldBound);
  for (let i = 0; i < count; i++) {
    // Several entries tried per road, because where a road can be laid is
    // the country's decision: a rim point out in a sea basin, or a line
    // that runs into a lake it cannot get round, is not a road worth
    // building, and the answer is to try somewhere else rather than to
    // build it anyway.
    for (let attempt = 0; attempt < HIGHWAY.tries; attempt++) {
      const road = layOne(
        (seed ^ ((i + 1) * 0x9e3779b9) ^ (attempt * 0x85ebca6b)) >>> 0,
        land,
        worldBound,
        width,
        roads,
      );
      if (road) {
        roads.push(road);
        break;
      }
    }
  }
  return roads;
}

/** One road, walked from an entry on the map's rim to wherever it leaves.
 * Returns null where the country would not carry one — a rim point in a
 * lake, or a walk that never got clear — rather than laying a road that
 * stops. */
function layOne(
  seed: number,
  land: LandField,
  worldBound: number,
  width: number,
  standing: Highway[],
): Highway | null {
  const rng = createRng(seed);
  const reach = worldBound + HIGHWAY.overrun;
  // Enter on one side of the rim and aim across the map, so the road is a
  // road THROUGH the country rather than a line clipping a corner of it.
  // The aim wanders as it goes; what this fixes is only which way it set
  // out.
  const entry = rng.range(0, Math.PI * 2);
  let x = Math.sin(entry) * reach;
  let z = Math.cos(entry) * reach;
  // A road goes somewhere, so it is steered at a PLACE — the point on the
  // far rim it is headed for — rather than along a bearing. The difference
  // shows the first time it has to go round a lake: a bearing takes it out
  // of the country and leaves it there, because the correction that brings
  // it back is aiming it the way it was already pointing. Offset off the
  // exact diameter so it does not run through the middle of every seed's
  // map, but not so far that it clips a corner instead of crossing.
  const exit = entry + Math.PI + rng.range(-0.42, 0.42);
  const target = { x: Math.sin(exit) * reach, z: Math.cos(exit) * reach };
  let heading = Math.atan2(target.x - x, target.z - z);
  let curvature = 0;
  const points: HighwayPoint[] = [];
  const limit = Math.ceil((4 * reach) / HIGHWAY.step);

  /** The lowest the bare country gets above the water table along a bearing
   * inside the look-ahead, m. Negative is a lake in the way. */
  const clearance = (bearing: number): number => {
    const sin = Math.sin(bearing);
    const cos = Math.cos(bearing);
    let worst = Infinity;
    for (const ahead of [HIGHWAY.step, HIGHWAY.shoreLook * 0.4, HIGHWAY.shoreLook]) {
      const h = land.heightAt(x + sin * ahead, z + cos * ahead) - LAKE_Y;
      if (h < worst) worst = h;
    }
    return worst;
  };

  let entered = false;
  for (let i = 0; i < limit; i++) {
    points.push({ x, z, heading, s: i * HIGHWAY.step });
    if (Math.hypot(x, z) <= worldBound) entered = true;
    // Out the far side: the road has crossed the country and left it. Only
    // once it has been IN it — the walk starts out on the rim, so a first
    // step that bends outward would otherwise finish the road before it
    // reached the map at all.
    if (entered && Math.hypot(x, z) > reach) break;
    // The shore. A public road goes ROUND a lake — and it bends harder
    // doing it than it ever does in open country, which is why the dodge
    // has a radius of its own: at the sweeping radius a road holds across a
    // field it cannot turn away from water it can already see, and the
    // whole line gets thrown away for a lake it should have skirted.
    if (clearance(heading) < HIGHWAY.shoreFreeboard) {
      let best = 0;
      let bestClear = clearance(heading);
      for (const swing of [0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.5, -1.5, 2.2, -2.2]) {
        const clear = clearance(heading + swing);
        if (clear <= bestClear) continue;
        bestClear = clear;
        best = swing;
        if (clear >= HIGHWAY.shoreFreeboard) break;
      }
      // Nothing back toward the aim while it is skirting water: the pull is
      // what would steer it straight back in.
      heading += Math.sign(best) * Math.min(Math.abs(best), HIGHWAY.step / HIGHWAY.avoidRadius);
      curvature = 0;
      x += Math.sin(heading) * HIGHWAY.step;
      z += Math.cos(heading) * HIGHWAY.step;
      continue;
    }
    if (i > 0 && i % Math.round(HIGHWAY.bend / HIGHWAY.step) === 0) {
      curvature = rng.range(-1, 1) / HIGHWAY.minRadius;
    }
    // ...and always back toward where it is GOING, so a road that went
    // round a headland resumes crossing the map instead of carrying on the
    // way the detour left it pointing.
    let err = Math.atan2(target.x - x, target.z - z) - heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err <= -Math.PI) err += 2 * Math.PI;
    const pull = Math.max(-1, Math.min(1, err * 4)) / HIGHWAY.minRadius;
    curvature = curvature * (1 - HIGHWAY.correction) + pull * HIGHWAY.correction;
    heading += curvature * HIGHWAY.step;
    x += Math.sin(heading) * HIGHWAY.step;
    z += Math.cos(heading) * HIGHWAY.step;
  }

  // A road that never got out of the country is not a road: better no
  // tarmac on a seed than tarmac that stops in a field.
  const last = points[points.length - 1];
  if (!last || !entered || Math.hypot(last.x, last.z) <= worldBound) return null;
  // ...and it stays out of the water for as far as anyone can SEE it. The
  // overrun past the map's rim is not held to that: it is beyond the fog by
  // construction, and a rim that happens to sit in a sea basin would
  // otherwise veto every road on the seed rather than the piece of one
  // nobody can look at.
  const seen = worldBound + HIGHWAY.overrun * 0.35;
  for (const p of points) {
    if (Math.hypot(p.x, p.z) > seen) continue;
    if (land.flooded(p.x, p.z, HIGHWAY.shoreFreeboard)) return null;
  }
  // R23 — and two public roads do not run into each other out in the
  // country either. A crossroads is a place somebody built; two lines that
  // happen to touch is not.
  const keep = 4 * width;
  for (const other of standing) {
    for (const p of other.points) {
      for (const q of points) {
        if (Math.hypot(p.x - q.x, p.z - q.z) < keep) return null;
      }
    }
  }
  return { points, width };
}

/** Index the network so the route's search can ask where the tarmac is
 * without walking every point of every road. */
export function createHighwayNetwork(roads: Highway[]): HighwayNetwork {
  const grid = new Map<number, { road: Highway; index: number }[]>();
  for (const road of roads) {
    for (let i = 0; i < road.points.length; i++) {
      const p = road.points[i];
      const key = cellKey(Math.floor(p.x / INDEX_CELL), Math.floor(p.z / INDEX_CELL));
      const bucket = grid.get(key);
      if (bucket) bucket.push({ road, index: i });
      else grid.set(key, [{ road, index: i }]);
    }
  }
  const nearest = (x: number, z: number): HighwayHit | null => {
    if (roads.length === 0) return null;
    const cx = Math.floor(x / INDEX_CELL);
    const cz = Math.floor(z / INDEX_CELL);
    let best: HighwayHit | null = null;
    // Out ring by ring until the ring itself cannot beat what is in hand.
    for (let ring = 0; ring < 64; ring++) {
      if (best && (ring - 1) * INDEX_CELL >= best.d) break;
      for (let dx = -ring; dx <= ring; dx++) {
        const stride = Math.abs(dx) === ring || ring === 0 ? 1 : 2 * ring;
        for (let dz = -ring; dz <= ring; dz += stride) {
          const bucket = grid.get(cellKey(cx + dx, cz + dz));
          if (bucket === undefined) continue;
          for (const entry of bucket) {
            const p = entry.road.points[entry.index];
            const d = Math.hypot(p.x - x, p.z - z);
            if (!best || d < best.d) best = { road: entry.road, index: entry.index, d };
          }
        }
      }
    }
    return best;
  };
  return { roads, nearest };
}
