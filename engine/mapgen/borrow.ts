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
import {
  DIR_PAIRS,
  solveCsc,
  solveRadii,
  straightPart,
  straightRunAt,
  type Pose,
} from "./search.ts";

/** How far apart the followed road is cut into segments, m. Short enough
 * that a public road's bend is tracked rather than chorded across, long
 * enough that a borrowed kilometre is a dozen segments and not a hundred. */
const FOLLOW_STEP = 35;

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

/** The corners a junction may sit at: inside R17's angle band, tight enough
 * that the two carriageways actually part, and wide enough that the corner
 * still has an inside. */
function junctionCorners(width: number): { radius: number; severity: SegmentPlan["severity"] }[] {
  return solveRadii(APPROACH_RADII).filter(
    (c) =>
      c.radius >= R.paving.junctionRadius * width &&
      partedAt(c.radius, width) <= R.paving.junctionParts * width,
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
  /** How far the route would LIKE to stay on the tarmac, m — what the
   * asphalt dial is asking for. What it gets is however much of that the
   * road can offer inside R38, down to `paving.borrow.runOn.min`. */
  runOn: number,
  /** R4 — whether the segment the route is standing on is a straight. A
   * hard turn is taken out of a straight and never out of another turn, so
   * where it is not, the approach's first corner is drawn from the gentler
   * half of the vocabulary. */
  fromStraight: boolean,
): Borrow | null {
  const hit = network.nearest(from.x, from.z, undefined, R.paving.borrow.seek);
  if (!hit) return null;
  const road = hit.road;
  const meet = R.paving.borrow.meet;
  const perPoint = road.points[1].s - road.points[0].s;
  const stride = Math.max(1, Math.round(meet.step / perPoint));
  const span = Math.ceil(meet.reach / perPoint);
  const corners = junctionCorners(width);
  const approach = solveRadii(APPROACH_RADII).filter((c) => fromStraight || c.severity !== "hard");
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
              //
              // The tightest such corner, because that is the SQUAREST
              // crossing the vocabulary can give (see `junctionRadius`) —
              // unless the road's last few metres bent, in which case R4
              // binds: a hard turn is taken out of a straight, never out of
              // another turn. A public road mostly runs straight, so the
              // tight one is what a borrow usually gets.
              const straightOut = plans[plans.length - 1].kind === "straight";
              const off = straightOut
                ? corners[corners.length - 1]
                : corners.filter((c) => c.severity !== "hard").pop();
              if (!off) continue;
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
 * end of the tarmac it borrowed is not a borrow — or where the road runs
 * STRAIGHTER than R38 allows, which is the same refusal for the same
 * reason: the route may not be left somewhere it does not belong.
 *
 * A chunk becomes a straight when the road is straight BY R38 — the same
 * `straightRun.bend` the rule counts a run with, so what the route drives
 * and what the rule measures cannot disagree. It is emphatically not the
 * turn vocabulary's widest radius: the vocabulary tops out at a 100 m soft
 * turn and a public road bends at 220 at its tightest, so measured against
 * that every chunk of every road came out "straight" and the route stopped
 * tracking the bend at all — it left the junction on the road's tangent and
 * ran off into the field beside it, one chord at a time, with the terrain
 * able to lay its shelf under only one of the two.
 *
 * What a chunk drawn as a straight still gives up is the chord across the
 * bend it ignores: `length² / 8r`, which at the threshold is under a metre
 * over a 70 m chunk — inside the carriageway on the narrowest road the
 * width dial builds, and gone entirely on anything straighter. */
function followRoad(
  road: Highway,
  index: number,
  forward: boolean,
  runOn: number,
  plans: SegmentPlan[],
): number | null {
  /** The shortest run that is still a borrow rather than a mistake. */
  const least = R.paving.borrow.runOn.min;
  const step = forward ? 1 : -1;
  const perPoint = road.points[1].s - road.points[0].s;
  const chunk = Math.max(2, Math.round(FOLLOW_STEP / perPoint));
  const widest = R.straightRun.bend;
  let i = index;
  let ran = 0;
  // R38 — and how far the route has come along the tarmac without a corner
  // in it. Seeded from what the approach left standing, because the
  // junction corner and the straight in front of it are part of the same
  // run the driver is sitting through.
  let straight = straightRunAt(plans);
  while (ran < runOn) {
    const next = i + step * chunk;
    if (next < 0 || next >= road.points.length) return ran >= least ? i : null;
    const a = road.points[i];
    const b = road.points[next];
    const length = Math.abs(b.s - a.s);
    const turn = wrap(forward ? b.heading - a.heading : a.heading - b.heading);
    const bend = Math.abs(turn) > 1e-4 ? length / Math.abs(turn) : Infinity;
    const plan: SegmentPlan =
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
          };
    // R38 — THE RALLY LEAVES THE ROAD BEFORE THE ROAD GETS BORING. A
    // public road is laid to get somewhere and runs straight for hundreds
    // of metres at a time between its bends, so this is not a rare case to
    // refuse: measured over seeds 1-8 at long it is most of every road, and
    // a borrow that insisted on the whole of `runOn` being interesting was
    // refused 92% of the time and left the `asphalt` dial with nothing to
    // spend on.
    //
    // So the run ENDS here instead, at the last chunk before the straight
    // would break the rule, and the caller turns off onto the dirt. What it
    // may not do is end so early that the borrow was never worth making —
    // that really is a detour onto a road and straight off it again — which
    // is what `least` is.
    straight += straightPart(plan);
    if (straight > R.straightRun.borrowed) return ran >= least ? i : null;
    plans.push(plan);
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
