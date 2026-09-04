// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R22 — the CIRCUIT search: a stage that comes back to where it started, so
// the start line is also the finish line and the race can be run over laps.
//
// It is the sprint search (generate.ts) with two things added and one taken
// away. Added: a RING COURSE — a bearing that turns once through a full
// circle over the target lap length, which the drawn turns are steered back
// toward, so the line goes round instead of wandering off; and a CLOSURE —
// once the line is most of the way round, every iteration tries to solve a
// turn-straight-turn (a Dubins CSC path) from where the cursor stands back
// onto the grid's own pose, exactly. Taken away: nothing. The vocabulary,
// the features, the world bound and the self-distance rule are the sprint's,
// except that on a ring arc distance is CYCLIC — the road running back into
// the start line is that line's neighbour, not a crossing of it.
//
// The closure is solved rather than drawn, so it lands on the start line to
// the millimeter; what the search has to find is a place where the pieces
// the solve asks for are inside the turn vocabulary. Trying it from every
// straight over the last third of the lap is what finds one.

import { angleDiff } from "../lib/math.ts";
import { createRng } from "../lib/prng.ts";
import { createLandField, type LandField } from "./land.ts";
import { roadClearance } from "./road.ts";
import {
  STAGE_RULES as R,
  challengeMul,
  circuitLapBand,
  knobScale,
  roadWidthOf,
  type FiniteStageLength,
  type SegmentPlan,
  type StageKnobs,
} from "./rules.ts";
import {
  DIR_PAIRS,
  PROBE_STEP,
  assignFeature,
  buildWalk,
  bearing,
  createPointField,
  drawTurn,
  inBounds,
  probePoints,
  recomputeSameDirRun,
  solveCsc,
  solveRadii,
  straightLength,
  straightRunAt,
  trackRun,
  type Cursor,
  type PointField,
  type Pose,
  type SameDirRun,
} from "./search.ts";

/** The corners the closure is allowed to solve at (R3's ladder). */
const CLOSE_RADII = solveRadii(R.circuit.closeRadii);

/** How far off the ring bearing a drawn turn is allowed to leave the road
 * before it is redrawn, and the share of that budget past which the next
 * turn is forced back toward the ring. Wider than a perfect circle on
 * purpose: a lap that never deviates from its own bearing is a roundabout,
 * and the budget still clears a hairpin. */
const COURSE_ERROR = 2.2;
const COURSE_PULL = 0.4;

/** The longest closure this vocabulary can build, m: two of the widest
 * corners sweeping their fullest, the straight's ceiling between them, and
 * the run at the line. Together with `MIN_CLOSURE` it says exactly where on
 * the lap a closure could still land inside the band — which is where the
 * search tries for one, rather than at some fraction of the way round. */
const MAX_CLOSURE =
  2 * R.turn.soft.radius.max * R.turn.soft.angle.max +
  R.circuit.closeStraight.max +
  R.closingStraight;

/** The shortest closure this vocabulary can build, m: two hairpin arcs at
 * their smallest, the closing straight's minimum between them, and the run
 * at the line. Once the lap has less room left than this, no closure can
 * fit inside the band and the attempt is over — carrying on would only
 * place-and-backtrack against the ceiling until the iteration budget ran
 * out, which is a much more expensive way to reach the same answer. */
const MIN_CLOSURE =
  2 * R.turn.hard.radius.min * R.turn.hard.angle.min +
  R.circuit.closeStraight.min +
  R.closingStraight;

/** How near the grid the road has to be before a closure is even worth
 * solving for, m — comfortably past the furthest a turn-straight-turn out
 * of this vocabulary can reach (the straight's ceiling plus two of the
 * widest corners' diameters). Beyond it there is no answer to find, and
 * looking for one is the search's whole cost. */
const CLOSE_REACH = 700;

/** How many times one attempt may back out of a pocket before it is
 * abandoned for a fresh sub-seed. Deliberately small: a lap that has to be
 * unpicked this often is one whose closure is not going to solve, and the
 * cheapest way past it is another line, not more unpicking of this one.
 * Restarting is what makes the search fast — many short attempts beat a few
 * long ones when most of the cost is walking the same ground twice. */
const MAX_BACKTRACKS = 40;

/** The closure as segments, or null when no solve at any radius produces a
 * corner combination the vocabulary owns. The closing straight (R2) is part
 * of it: a circuit's finish line is its start line, and both want a
 * readable run at them. */
function closureSegments(from: Pose, goal: Pose): SegmentPlan[] | null {
  const run = R.circuit.closeStraight;
  for (const first of CLOSE_RADII) {
    const band1 = R.turn[first.severity].angle;
    for (const last of CLOSE_RADII) {
      const band2 = R.turn[last.severity].angle;
      for (const [d1, d2] of DIR_PAIRS) {
        const solved = solveCsc(from, goal, first.radius, last.radius, d1, d2);
        if (!solved) continue;
        if (solved.arc1 < band1.min || solved.arc1 > band1.max) continue;
        if (solved.arc2 < band2.min || solved.arc2 > band2.max) continue;
        if (solved.straight < run.min || solved.straight > run.max) continue;
        return [
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
          { kind: "straight", length: R.closingStraight, feature: "none" },
        ];
      }
    }
  }
  return null;
}

/** How near the start line the closure has to land before it counts as
 * closed, m — well inside one sample, so the road runs into its own grid
 * with no seam to see or drive over. */
const CLOSE_TOLERANCE = 0.05;

/** The closure, solved against the road AS BUILT. The CSC solve is exact on
 * ideal arcs, but the compiler walks an arc in 2 m steps and lands a little
 * off the circle it was drawn from; over a closing corner that is tens of
 * centimeters, and the loop has to shut to the millimeter. So: solve for a
 * goal, walk what that produced, and move the goal by whatever the walk
 * missed by. The heading needs no such treatment — a segment's total turn
 * is its curvature times its length however finely it is stepped, so it
 * comes out exact — which leaves two numbers converging in a handful of
 * passes. */
function solveClosure(from: Pose): SegmentPlan[] | null {
  const goal: Pose = { x: 0, z: -R.closingStraight, heading: 0 };
  for (let pass = 0; pass < 6; pass++) {
    const segments = closureSegments(from, goal);
    if (!segments) return null;
    const end = buildWalk(from, segments);
    if (Math.hypot(end.x, end.z) <= CLOSE_TOLERANCE) return segments;
    goal.x -= end.x;
    goal.z -= end.z;
  }
  return null;
}

/** Total heading swept by a plan list, radians — a closed line that is a
 * lap turns through exactly one full circle, and anything that does not is
 * a shape that touched itself somewhere the self-distance window forgave. */
function netTurn(plans: SegmentPlan[]): number {
  let sum = 0;
  for (const p of plans) {
    if (p.kind === "turn" && p.dir && p.radius) sum += (p.dir * p.length) / p.radius;
  }
  return sum;
}

/** Walk the closure's segments from `cursor`, validating each against the
 * world bound, the cyclic self-distance rule and the water (R35). Returns
 * the points to commit, or null on the first violation. */
function probeClosure(
  cursor: Cursor,
  segments: SegmentPlan[],
  field: PointField,
  worldBound: number,
  cycle: number,
  keepsDry: (p: Cursor) => boolean,
): Cursor[] | null {
  let at = cursor;
  const all: Cursor[] = [];
  for (const plan of segments) {
    const { points, end } = probePoints(at, plan);
    for (const p of points) {
      if (!inBounds(p, worldBound)) return null;
      if (field.blocked(p, cycle)) return null;
      if (!keepsDry(p)) return null;
    }
    all.push(...points);
    at = end;
  }
  return all;
}

/** Generate a circuit's plan: deterministic in the seed, closed onto its own
 * start line, and inside the lap band for its stage length. An attempt that
 * cannot find a legal closure before it runs past the band is retried with a
 * derived sub-seed — still a pure function of the seed. */
export function generateCircuit(
  seed: number,
  length: FiniteStageLength,
  knobs: StageKnobs,
): SegmentPlan[] {
  // R35 — the country and its water, poured before the ring is drawn. One
  // field for every attempt: a retry is redrawing the road, not the
  // landscape.
  const land = createLandField(seed, knobs);
  const ladder = R.water.routeClearLadder;
  for (let attempt = 0; attempt < 400; attempt++) {
    // The same relaxing setback the sprint search walks down — a ring has
    // to close on itself as well as keep out of the water, so it needs the
    // give even more than a point-to-point stage does.
    const clearance =
      R.water.routeClear *
      ladder[Math.floor((attempt * ladder.length) / 400)] *
      knobScale(knobs.water, R.wet.routeSetback);
    const plans = tryCircuit((seed + attempt * 0x9e3779b9) >>> 0, length, knobs, land, clearance);
    if (plans) return plans;
  }
  throw new Error(`circuit generation failed for seed ${seed} (${length})`);
}

function tryCircuit(
  seed: number,
  length: FiniteStageLength,
  knobs: StageKnobs,
  land: LandField,
  routeClear: number,
): SegmentPlan[] | null {
  const spec = R.stageLengths[length];
  const band = circuitLapBand(length);
  const rng = createRng(seed);
  const target = rng.range(band.min, band.max);
  // Which way round the lap runs — the ring bearing's sense.
  const ringDir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
  const plans: SegmentPlan[] = [];
  // R23 — a ring keeps a road's clearance from itself exactly as a sprint
  // does. What it does NOT get is R24: closing onto its own start line is
  // the whole shape of a circuit, and the closure lies along the start's
  // apron rather than across it.
  const field = createPointField(roadClearance(roadWidthOf(knobs)));
  /** R35 — a ring is drawn round the water like any other road. */
  const keepsDry = (p: Cursor): boolean => !land.nearWater(p.x, p.z, routeClear);
  let cursor: Cursor = { x: 0, z: 0, heading: 0, arc: 0 };
  // Where the ROAD stands, walked the compiler's way — the pose the closure
  // has to solve from. `builtStack` carries one entry per committed segment
  // so a backtrack restores it without re-walking the lap.
  let built: Pose = { x: 0, z: 0, heading: 0 };
  const builtStack: Pose[] = [];
  let total = 0;
  let sLastLipEnd = -Infinity;
  const sameDirRun: SameDirRun = { dir: 0, count: 0, angle: 0 };

  const commit = (plan: SegmentPlan, points: Cursor[], end: Cursor): void => {
    if (plan.feature === "jump") sLastLipEnd = total + (plan.featureEnd ?? plan.length);
    plans.push(plan);
    field.add(points);
    cursor = end;
    built = buildWalk(built, [plan]);
    builtStack.push(built);
    total += plan.length;
    trackRun(sameDirRun, plan);
  };

  // R1 — the grid, and the room to build speed off it. On a circuit this is
  // also the run OUT of the start line the closing straight runs INTO.
  const opening: SegmentPlan = {
    kind: "straight",
    length: R.openingStraight + rng.range(0, 40),
    feature: "none",
  };
  {
    const { points, end } = probePoints(cursor, opening);
    commit(opening, points, end);
  }

  const homeFrom = target * R.circuit.homeFrom;
  const maxIterations = 2000 + spec.band.max;
  let iterations = 0;
  let backtracks = 0;

  for (;;) {
    if (++iterations > maxIterations) return null;
    // The closure is tried from a STRAIGHT: its first arc then has the
    // braking zone R4 asks for, and the same-direction run (R5) is clear
    // behind it, so a solved corner can never be the third in a spiral.
    if (
      total + MAX_CLOSURE >= band.min &&
      plans[plans.length - 1].kind === "straight" &&
      Math.hypot(built.x, built.z + R.closingStraight) < CLOSE_REACH
    ) {
      const segments = solveClosure(built);
      const added = segments ? segments.reduce((a, p) => a + p.length, 0) : 0;
      if (segments && total + added >= band.min && total + added <= band.max) {
        const points = probeClosure(
          { ...built, arc: cursor.arc },
          segments,
          field,
          spec.worldBound,
          total + added,
          keepsDry,
        );
        if (points && Math.abs(netTurn([...plans, ...segments])) > Math.PI) {
          plans.push(...segments);
          return plans;
        }
      }
    }
    if (total > band.max - MIN_CLOSURE) return null;

    let placed = false;
    for (let attempt = 0; attempt < 12 && !placed; attempt++) {
      // Where the line is being steered. Most of the way round that is the
      // RING: a bearing that turns once through a full circle over the
      // target lap. Past `closeFrom` it is the grid itself — the closure
      // needs the cursor brought back within reach of a solve, and homing
      // on the start line is what does it.
      const homing = total >= homeFrom;
      const ring = (ringDir * 2 * Math.PI * Math.min(total, target)) / target;
      const course = homing ? bearing(-cursor.x, -R.closingStraight - cursor.z) : ring;
      const off = angleDiff(cursor.heading, course);
      const forcedDir: 1 | -1 | 0 =
        Math.abs(off) > COURSE_ERROR * COURSE_PULL ? (off >= 0 ? 1 : -1) : 0;
      // R38 — what is left of the straight run decides whether this may be
      // a straight at all, exactly as it does on a sprint.
      const straightLeft = R.straightRun.max - straightRunAt(plans);
      const kind: "straight" | "turn" =
        straightLeft < R.straightShort.min ||
        // R46 — how much of the ring bends is the difficulty dial's.
        rng.chance(R.turnChance * challengeMul(knobs.challenge, R.challenge.turns))
          ? "turn"
          : "straight";
      let plan: SegmentPlan;
      if (kind === "turn") {
        plan = drawTurn(
          rng,
          knobs,
          plans[plans.length - 1].kind === "straight",
          forcedDir,
          sameDirRun,
        );
      } else {
        const straight = Math.min(straightLength(rng), straightLeft);
        plan = {
          kind: "straight",
          length: straight,
          ...assignFeature(rng, straight, total, sLastLipEnd, knobs),
        };
      }
      if (total + plan.length > band.max - MIN_CLOSURE) continue;
      const { points, end } = probePoints(cursor, plan);
      // A turn's heading is monotonic, so its exit covers the whole arc.
      if (Math.abs(angleDiff(end.heading, ring)) > COURSE_ERROR) continue;
      if (!points.every((p) => inBounds(p, spec.worldBound))) continue;
      if (points.some((p) => field.blocked(p) || !keepsDry(p))) continue;
      commit(plan, points, end);
      placed = true;
    }
    if (!placed) {
      if (++backtracks > MAX_BACKTRACKS) return null;
      // Boxed in by its own line: back out of the pocket, several segments
      // at once, and let the loop try a different way round. Never into the
      // grid — a lap with no start straight is not a lap.
      for (let drop = 0; drop < 3; drop++) {
        const dropped = plans.pop();
        builtStack.pop();
        if (!dropped || plans.length <= 1) return null;
        field.removeLast(Math.max(1, Math.ceil(dropped.length / PROBE_STEP)));
        total -= dropped.length;
      }
      cursor = { ...field.points[field.points.length - 1] };
      built = { ...builtStack[builtStack.length - 1] };
      recomputeSameDirRun(plans, sameDirRun);
    }
  }
}
