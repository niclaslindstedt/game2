// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R17 — BORROWING THE TARMAC: how the route gets onto a road that was laid
// before it (`highway.ts`), runs it for a while, and turns off again.
//
// This is the half of the junction that used to be missing. When the sealed
// stretches were painted onto the racing line, the "other road" at every
// crossing had to be invented afterwards — a stub that left the junction on
// the route's own tangent, wandered, and stopped wherever the country ran
// out. Nothing about it went anywhere, because there was nothing for it to
// go to.
//
// With the tarmac laid first the direction of that dependency flips. The
// route SEEKS a road, meets it at a real angle, and runs ON it — so the arm
// it does not take is not invented at all: it is the rest of the road,
// which already crosses the map. The junction is where the two meet, and it
// is a place because both roads were there before it.
//
// The approach is SOLVED, not steered. A route that chases the nearest
// point on the tarmac arrives broadside; one that eases onto the road's own
// line arrives parallel, and a corner joining a road covers
// `radius · (1 − cos turn)` of sideways ground, so a parallel arrival needs
// an infinite radius and is refused however close it gets. What actually
// joins a road is the same turn-straight-turn a circuit closes onto its own
// grid with (`solveCsc`): pick a point on the tarmac, and solve the pieces
// that ARRIVE there pointing down it. The last of those pieces is the
// junction — so it is drawn from the corners R17 says a junction may sit
// at, and the geometry is a junction rather than being decorated into one.
//
// Everything here is geometry over the segment vocabulary the rest of the
// search speaks, so the borrowed stretch is validated against R9 and R10
// exactly like any other candidate: a borrow that would take the route out
// of the world or back across its own line is rejected whole, and the
// search carries on down the country on gravel.

import type { Highway, HighwayNetwork } from "./highway.ts";
import { STAGE_RULES as R, type SegmentPlan } from "./rules.ts";
import { DIR_PAIRS, solveCsc, solveRadii, type Pose } from "./search.ts";

/** How far apart the followed road is cut into segments, m. Short enough
 * that a public road's bend is tracked rather than chorded across, long
 * enough that a borrowed kilometre is a dozen segments and not a hundred. */
const FOLLOW_STEP = 70;

/** How many radii per severity the approach solves at. Three is the ladder
 * the circuit's closure uses; the approach has a whole road to aim at
 * rather than one pose, so it does not need a finer one. */
const APPROACH_RADII = 3;

/** Fold an angle into -PI..PI. */
function wrap(a: number): number {
  let d = a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** R17 — how far along the main road two carriageways still overlap after
 * a corner of this radius: the arc the turn has to run before it has
 * carried the route clear of the main road's mat. Stated here as well as in
 * the compiler because it is what decides whether a corner is a junction at
 * all, and the approach has to solve for one that IS. */
function partedAt(radius: number, width: number): number {
  const cos = Math.max(-1, Math.min(1, 1 - width / radius));
  return radius * Math.acos(cos);
}

/** The corners a junction may sit at: inside R17's angle band, and tight
 * enough that the two carriageways actually part. */
function junctionCorners(width: number): { radius: number; severity: SegmentPlan["severity"] }[] {
  return solveRadii(APPROACH_RADII).filter(
    (c) => partedAt(c.radius, width) <= R.paving.junctionParts * width,
  );
}

export type Borrow = {
  /** The approach (a corner, a straight and the junction's own corner),
   * then the run along the tarmac, then the corner off it. */
  plans: SegmentPlan[];
  /** Which road was borrowed, and the span of its points the route ran. */
  road: number;
  from: number;
  to: number;
};

/** R17 — build the whole borrow as one candidate: turn on, run the road,
 * turn off. Returns null where the geometry will not make a junction — the
 * caller then carries on down the country and tries again further on.
 *
 * It is one candidate on purpose. A borrow committed a segment at a time
 * could be half-placed when the run along the road turns out to cross the
 * stage's own line, and there is no honest way back from that: the route
 * would be left on a tarmac road it never leaves. Built whole, it is
 * validated whole and dropped whole. */
export function planBorrow(
  from: Pose,
  network: HighwayNetwork,
  width: number,
  /** How far the route stays on the tarmac once it is on it, m. */
  runOn: number,
): Borrow | null {
  const hit = network.nearest(from.x, from.z);
  if (!hit || hit.d > R.paving.borrow.seek) return null;
  const road = hit.road;
  const meet = R.paving.borrow.meet;
  const perPoint = road.points[1].s - road.points[0].s;
  const stride = Math.max(1, Math.round(meet.step / perPoint));
  const span = Math.ceil(meet.reach / perPoint);
  const corners = junctionCorners(width);
  const approach = solveRadii(APPROACH_RADII);
  const straight = { min: R.straightShort.min, max: R.straightLong.max };
  /** How far a meeting point can be from the cursor and still be reachable
   * by one turn-straight-turn: the straight's ceiling plus what the two
   * corners can carry. Anything past it has no solve to find, and looking
   * for one is the whole cost of a borrow that fails — which is most of
   * them, since the route asks at every corner while the dial wants
   * tarmac. */
  const reach = straight.max + 4 * R.turn.soft.radius.max;

  // Every place on the road worth meeting, nearest first: a junction close
  // to where the route already is costs the stage less detour than one at
  // the far end of the look.
  for (let step = 0; step <= span; step += stride) {
    for (const side of step === 0 ? [1] : [1, -1]) {
      const index = hit.index + side * step;
      if (index < 0 || index >= road.points.length) continue;
      const at = road.points[index];
      if (Math.hypot(at.x - from.x, at.z - from.z) > reach) continue;
      // A road runs both ways and the rally may take either, so both are
      // solved for; which one comes out is whichever the vocabulary can
      // actually arrive on.
      for (const forward of [true, false]) {
        const goal: Pose = {
          x: at.x,
          z: at.z,
          heading: forward ? at.heading : at.heading + Math.PI,
        };
        for (const first of approach) {
          const band1 = R.turn[first.severity ?? "medium"].angle;
          for (const last of corners) {
            const band2 = R.turn[last.severity ?? "medium"].angle;
            for (const [d1, d2] of DIR_PAIRS) {
              const solved = solveCsc(from, goal, first.radius, last.radius, d1, d2);
              if (!solved) continue;
              if (solved.arc1 < band1.min || solved.arc1 > band1.max) continue;
              if (solved.arc2 < band2.min || solved.arc2 > band2.max) continue;
              // R17 — the arrival corner IS the junction, so its angle is
              // the junction's: too shallow and the two roads merge at a
              // glance, too tight and the junction is a hairpin.
              if (
                solved.arc2 < R.paving.junctionAngle.min ||
                solved.arc2 > R.paving.junctionAngle.max
              ) {
                continue;
              }
              if (solved.straight < straight.min || solved.straight > straight.max) continue;
              const plans: SegmentPlan[] = [
                {
                  kind: "turn",
                  length: first.radius * solved.arc1,
                  dir: d1,
                  radius: first.radius,
                  severity: first.severity,
                  feature: "none",
                },
                { kind: "straight", length: solved.straight, feature: "none" },
                {
                  kind: "turn",
                  length: last.radius * solved.arc2,
                  dir: d2,
                  radius: last.radius,
                  severity: last.severity,
                  feature: "none",
                },
              ];
              const ran = followRoad(road, index, forward, runOn, plans);
              if (ran === null) continue;
              // ...and the corner off it, back onto the dirt. Drawn rather
              // than solved: where the route goes after a junction is the
              // stage's business, and the only thing it has to be is a
              // corner R17 would put a junction at.
              const off = corners[corners.length - 1];
              plans.push({
                kind: "turn",
                length: off.radius * R.paving.junctionAngle.min,
                dir: d2 === 1 ? -1 : 1,
                radius: off.radius,
                severity: off.severity,
                feature: "none",
              });
              return { plans, road: network.roads.indexOf(road), from: index, to: ran };
            }
          }
        }
      }
    }
  }
  return null;
}

/** Cut `runOn` metres of the road into segments that track its bend, from
 * `index` onward, appending them to `plans`. Returns the index it reached,
 * or null where the road runs out first — a route that would drive off the
 * end of the tarmac it borrowed is not a borrow.
 *
 * A public road's curvature is gentle by construction, so most of what
 * comes out is straight — which is what a road across open country is. */
function followRoad(
  road: Highway,
  index: number,
  forward: boolean,
  runOn: number,
  plans: SegmentPlan[],
): number | null {
  const step = forward ? 1 : -1;
  const perPoint = road.points[1].s - road.points[0].s;
  const chunk = Math.max(2, Math.round(FOLLOW_STEP / perPoint));
  const widest = R.turn.soft.radius.max;
  let i = index;
  let ran = 0;
  while (ran < runOn) {
    const next = i + step * chunk;
    if (next < 0 || next >= road.points.length) return null;
    const a = road.points[i];
    const b = road.points[next];
    const length = Math.abs(b.s - a.s);
    const turn = wrap(forward ? b.heading - a.heading : a.heading - b.heading);
    const bend = Math.abs(turn) > 1e-4 ? length / Math.abs(turn) : Infinity;
    plans.push(
      bend > widest
        ? { kind: "straight", length, feature: "none", paved: true }
        : {
            kind: "turn",
            length,
            dir: turn > 0 ? 1 : -1,
            radius: bend,
            severity: "soft",
            feature: "none",
            paved: true,
          },
    );
    ran += length;
    i = next;
  }
  return i;
}

/** The slice of a road either side of a borrowed stretch: the arms the
 * route does NOT take at its two junctions. Not built — CUT, from a road
 * that already crosses the map, which is the whole reason a borrowed
 * junction has somewhere to go. */
export function armsOf(
  road: Highway,
  from: number,
  to: number,
): { entry: number[]; exit: number[] } {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const before: number[] = [];
  for (let i = lo; i >= 0; i--) before.push(i);
  const after: number[] = [];
  for (let i = hi; i < road.points.length; i++) after.push(i);
  // The route joined at `from`, so the arm it abandoned there is whichever
  // end of the road lies behind it.
  return from <= to ? { entry: before, exit: after } : { entry: after, exit: before };
}
