// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R36 — CROSSING THE TARMAC: the route going straight over a public road
// instead of turning onto it.
//
// The stage's other answer to a road in its way is `borrow.ts` — join it,
// run it, turn off. That is the right answer when the stage WANTS tarmac,
// and the wrong one when it merely wants to be on the other side: a borrow
// costs the route a kilometre of detour and the `asphalt` dial a budget it
// was not asked to spend, and where the dial is at zero it is not available
// at all. Before this module a search boxed in against a public road with no
// borrow in it had exactly one move left, which was to back out and go round
// — so the road partitioned the country, and the seeds where it partitioned
// it badly are the seeds that took forty sub-seeds to generate or none.
//
// A crossing costs nothing and goes nowhere. The route straightens up, goes
// over the road square, and carries on down the country on gravel.
//
// SQUARE is the whole of it, and it is a geometric requirement rather than a
// stylistic one. R23 forbids two roads sharing ground, because the terrain
// lays its shelf under one road and the other is left standing in the air —
// and a gravel road dragged over a sealed one at a slant shares ground for
// as far as the slant runs. Crossed at right angles it shares one PLACE:
// the route is off the tarmac's mat within a road width of the middle of it,
// the two dirt arms are collinear, and what the map shows is a crossroads.
// So the approach is not steered at the road and checked for angle
// afterwards — it is SOLVED onto a pose that stands `clear` metres short of
// the road pointing exactly across it, and a solve that will not close is a
// crossing that does not happen.
//
// What this module does NOT decide is the step. That the tarmac stands proud
// of the country, and that a car crossing at speed leaves the ground, is a
// property of the built road (`compile.ts`), not of the plan: the height of
// a stage is a profile along its own arc and nothing here has one yet.

import type { HighwayNetwork } from "./highway.ts";
import { STAGE_RULES as R, type SegmentPlan } from "./rules.ts";
import { DIR_PAIRS, solveCsc, solveRadii, type Pose } from "./search.ts";

/** How many radii per severity the approach solves at — the ladder the
 * circuit's closure and the borrow's approach both use. */
const APPROACH_RADII = 3;

export type Crossing = {
  /** The approach (a corner, a straight and a corner), then the STRAIGHT
   * that carries the route over the road. */
  plans: SegmentPlan[];
  /** Which road is crossed, and the point of it the crossing sits on. */
  road: number;
  index: number;
  /** Where the crossing point falls inside the last plan, m from its start
   * — half of it, since the through straight is centred on the road. */
  at: number;
};

/** R36 — plan the whole crossing as one candidate: the turn-straight-turn
 * that lines the route up square on the road, and the straight that takes it
 * over. Returns null where nothing solves, and the caller carries on down
 * the country and asks again further on.
 *
 * One candidate, like a borrow, and for a sharper reason: the approach is
 * only legal BECAUSE of the crossing. It runs inside the clearance of a road
 * it is allowed near solely because it is about to cross it square, so an
 * approach committed without its crossing is a route that walked up to a
 * public road and turned away along it — which is the thing R23 exists to
 * forbid. Built whole, validated whole, dropped whole.
 */
export function planCrossing(
  from: Pose,
  network: HighwayNetwork,
  width: number,
  /** R4 — whether the segment the route is standing on is a straight. A hard
   * turn is taken out of a straight and never out of another turn. */
  fromStraight: boolean,
): Crossing | null {
  const hit = network.nearest(from.x, from.z, undefined, R.crossing.seek);
  if (!hit) return null;
  const road = hit.road;
  const C = R.crossing;
  const perPoint = road.points[1].s - road.points[0].s;
  const stride = Math.max(1, Math.round(C.meet.step / perPoint));
  const span = Math.ceil(C.meet.reach / perPoint);
  const radii = solveRadii(APPROACH_RADII);
  const approach = radii.filter((c) => fromStraight || c.severity !== "hard");
  const straight = { min: R.straightShort.min, max: R.straightLong.max };
  /** The through straight: `clear` metres of run-up, the road, and the same
   * again out the far side. It has to be a straight the vocabulary could
   * have drawn anyway — a crossing is an ordinary piece of stage with a
   * public road lying across the middle of it. */
  const over = 2 * C.clear;
  if (over < straight.min || over > straight.max) return null;
  /** How far a crossing point can be from the cursor and still be reachable
   * by one turn-straight-turn. Past it there is no solve to find, and
   * looking for one is the entire cost of a crossing that fails. */
  const reach = straight.max + 4 * R.turn.soft.radius.max;

  // Nearest first: a crossing close to where the route already is costs the
  // stage less detour than one at the far end of the look.
  for (let step = 0; step <= span; step += stride) {
    for (const side of step === 0 ? [1] : [1, -1]) {
      const index = hit.index + side * step;
      if (index < 0 || index >= road.points.length) continue;
      const at = road.points[index];
      if (Math.hypot(at.x - from.x, at.z - from.z) > reach) continue;
      // The two ways over: a road can be crossed from either side, and
      // which one comes out is whichever the vocabulary can arrive on.
      for (const hand of [1, -1]) {
        const heading = at.heading + (hand * Math.PI) / 2;
        // The approach aims at a pose standing `clear` short of the road's
        // centerline, pointing across it — so the route is already straight
        // and already square well before it reaches the tarmac, and the
        // corner that aimed it there is out in open country.
        const goal: Pose = {
          x: at.x - Math.sin(heading) * C.clear,
          z: at.z - Math.cos(heading) * C.clear,
          heading,
        };
        for (const first of approach) {
          const band1 = R.turn[first.severity ?? "medium"].angle;
          for (const last of radii) {
            const band2 = R.turn[last.severity ?? "medium"].angle;
            for (const [d1, d2] of DIR_PAIRS) {
              const solved = solveCsc(from, goal, first.radius, last.radius, d1, d2);
              if (!solved) continue;
              if (solved.arc1 < band1.min || solved.arc1 > band1.max) continue;
              if (solved.arc2 < band2.min || solved.arc2 > band2.max) continue;
              if (solved.straight < straight.min || solved.straight > straight.max) continue;
              return {
                plans: [
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
                  // R36 — and over. Featureless: the step in the road IS the
                  // feature, and a jump lip laid on top of the one the
                  // tarmac already makes is two jumps in one straight.
                  {
                    kind: "straight",
                    length: over,
                    feature: "none",
                    overRoad: { road: network.roads.indexOf(road), index },
                  },
                ],
                road: network.roads.indexOf(road),
                index,
                at: C.clear,
              };
            }
          }
        }
      }
    }
  }
  return null;
}

/** R36 — how wide a crossing's exemption from R23 is, m: the whole passage
 * over the road, measured from the crossing point, plus the road it is
 * measured across.
 *
 * `junction.parting` is the same idea for a junction and lands on nearly the
 * same number, but it is not the same rule and sharing it would be a
 * coincidence: a junction's exemption has to cover two carriageways peeling
 * apart through a corner, and a crossing's has to cover a straight going
 * over a mat and nothing else. Stated from the straight's own geometry,
 * which is what it is about — and no larger, because every metre of it is a
 * metre where a route may lie beside a public road unreported. */
export function crossingParting(width: number): number {
  return R.crossing.clear + width;
}
