// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ENDLESS STAGE — the same vocabulary and the same rules as the finite
// search, walked forever instead of closed.
//
// It sits apart from generate.ts because the two searches answer different
// questions with the same pieces. A sprint knows where it is going and may
// throw the whole attempt away to get there (R9, R2, the sub-seed retry);
// a stream has nowhere to be and can never start over, so everything it
// does about a country that boxes it in has to happen IN PLACE — the course
// it steers back onto, the commit lag it keeps as backtrack runway, and the
// water ladder it walks down a rung at a time rather than re-rolling. Those
// three mechanisms are the whole of this module; the cursor, the point
// field and the draws underneath them are search.ts's, shared with the
// stage searches next door.

import { angleDiff } from "../lib/math.ts";
import { createRng } from "../lib/prng.ts";
import { STAGE_RULES as R, type SegmentPlan, type StageKnobs } from "./rules.ts";
import { knobScale, resolveKnobs } from "./rules.ts";
import { createLandField } from "./land.ts";
import { roadClearance } from "./road.ts";
import {
  PROBE_STEP,
  assignFeature,
  createPointField,
  drawTurn,
  entersStart,
  probePoints,
  recomputeSameDirRun,
  straightLength,
  straightPart,
  trackRun,
  type Cursor,
  type SameDirRun,
} from "./search.ts";

export type StageStream = {
  /** Extend the plan until at least `upToArc` meters are committed; returns
   * the whole segments appended by this call, in stage order. The sequence
   * of segments is a pure function of the seed — how the calls chunk it
   * makes no difference. */
  extendTo: (upToArc: number) => SegmentPlan[];
  /** R43 — the road the search has PLANNED but not yet handed out, as the
   * probe points it holds: what a placer beside the compiled road has to
   * keep off as well, or the road laid a moment later runs through it. */
  ahead: () => readonly { x: number; z: number }[];
  /** R43 — a disc no future road may enter: a thing the compiled road has
   * stood beside itself (a turbine's pad, a fence) that the search cannot
   * see any other way. Kept for the life of the stream; a few dozen discs
   * over an endless run is nothing against the point field. */
  keepOff: (x: number, z: number, radius: number) => void;
};

/** The endless stage: the same vocabulary and rules as the finite search,
 * but the line roams an unbounded world (no R9) and never closes (no R2).
 * Two mechanisms replace the finite search's whole-attempt reject:
 *
 * - A COURSE: the stream is point-to-point. It follows a slowly drifting
 *   bearing and keeps the road's heading within `R.endless.maxCourseError`
 *   of it, so the walk makes progress instead of scribbling — and an
 *   endless run reads as a journey.
 * - A COMMIT LAG: the search runs `R.endless.commitLag` meters ahead of the
 *   road it hands out. Plans inside the lag may still be backtracked when
 *   the line boxes itself in; plans behind it are frozen and final. The
 *   freeze boundary follows the generation high-water mark, so what a seed
 *   produces is independent of how callers chunk their `extendTo` calls.
 *
 * R10 holds against the trailing `R.endless.tailWindow` meters — older road
 * is far behind the car, out of sight, and dropped from the working set,
 * which is what keeps memory and search time flat forever. */
export function createStageStream(seed: number, knobs?: Partial<StageKnobs>): StageStream {
  const dials = resolveKnobs(knobs);
  const rng = createRng(seed);
  const clear = roadClearance(knobScale(dials.width, R.roadWidth));
  const field = createPointField(clear);
  // R35 — the same water the finite search steers round. An endless run
  // meets more of the country than any stage does, so it meets more of the
  // country's lakes; the pour's block cache is what keeps asking about
  // them flat as the road runs on.
  const land = createLandField(seed, dials);
  /** ...and how much of it the DIAL leaves: a lakeland road runs the shore
   * because there is nowhere else to run. */
  const setback = knobScale(dials.water, R.wet.routeSetback);
  /** The setback the water is given right now. A stream cannot start over
   * the way the finite search does, so where that one walks a ladder of
   * whole ATTEMPTS this one walks the same ladder in place: every failed
   * placement gives the water a little less room, and the first success
   * hands it all back. A run that meets an archipelago squeezes past it
   * and then goes back to keeping its distance.
   *
   * It counts iterations since the road last got FURTHER, not failed
   * placements: a line boxed in against a shore places a segment, fails,
   * backtracks and places again for as long as you let it, all without
   * advancing a metre, so a counter that any success resets never counts
   * past one. */
  let stuck = 0;
  const keepsDry = (p: Cursor): boolean => {
    const ladder = R.water.routeClearLadder;
    const rung = Math.floor(stuck / R.endless.wetPatience);
    // Off the bottom of the ladder the rule lets go altogether, and the
    // road is allowed to cross. That is not the rule failing: a stream
    // has a COURSE to keep and cannot turn round, so a country that walls
    // it in with water leaves exactly two options — cross, or stop
    // forever. A finite stage in the same spot throws the attempt away and
    // re-rolls, which is why only the endless search needs this.
    if (rung >= ladder.length) return true;
    return !land.nearWater(p.x, p.z, R.water.routeClear * ladder[rung] * setback);
  };
  let cursor: Cursor = { x: 0, z: 0, heading: 0, arc: 0 };
  let total = 0;
  /** Generation high-water mark — never rewound by a backtrack, so the
   * freeze boundary only ever moves forward. */
  let highWater = 0;
  let course = 0;
  const sameDirRun: SameDirRun = { dir: 0, count: 0, angle: 0 };
  /** Every live plan with its absolute start arc; `frozen` marks how many
   * have been handed out (and may never change again). */
  const plans: { plan: SegmentPlan; start: number }[] = [];
  let frozen = 0;
  /** R43 — the discs the compiled road's own furniture has claimed. */
  const blocks: { x: number; z: number; r2: number }[] = [];
  const claimed = (p: Cursor): boolean => {
    for (const b of blocks) {
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      if (dx * dx + dz * dz < b.r2) return true;
    }
    return false;
  };

  const lastLipEnd = (): number => {
    for (let i = plans.length - 1; i >= 0; i--) {
      const p = plans[i];
      if (p.plan.feature === "jump") return p.start + (p.plan.featureEnd ?? p.plan.length);
    }
    return -Infinity;
  };

  const commit = (plan: SegmentPlan, points: Cursor[], end: Cursor): void => {
    plans.push({ plan, start: total });
    field.add(points);
    cursor = end;
    total += plan.length;
    highWater = Math.max(highWater, total);
    trackRun(sameDirRun, plan);
    course += rng.range(-R.endless.courseDrift, R.endless.courseDrift);
    field.pruneBefore(cursor.arc - R.endless.tailWindow);
  };

  const place = (): boolean => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const off = angleDiff(cursor.heading, course);
      // The course pull: already off the bearing by more than half the
      // budget, a drawn turn must come back toward it. Straights stay in
      // the mix even then — they hold the heading (never making the error
      // worse) and reset the R5 run, without which a maxed-out run whose
      // forced turn keeps getting flipped can starve the draw loop.
      const forcedDir: 1 | -1 | 0 =
        Math.abs(off) > R.endless.maxCourseError * 0.55 ? (off >= 0 ? 1 : -1) : 0;
      // R38 — the straight run behind the cursor. Walked here rather than
      // through `straightRunAt` because the stream carries its plans paired
      // with the arc they start at; the rule is the same one and reads the
      // same `straightPart`.
      let run = 0;
      for (let i = plans.length - 1; i >= 0; i--) {
        const part = straightPart(plans[i].plan);
        if (part === 0) break;
        run += part;
      }
      const straightLeft = R.straightRun.max - run;
      const kind: "straight" | "turn" =
        straightLeft < R.straightShort.min || rng.chance(R.turnChance) ? "turn" : "straight";
      let plan: SegmentPlan;
      if (kind === "turn") {
        plan = drawTurn(
          rng,
          plans[plans.length - 1].plan.kind === "straight",
          forcedDir,
          sameDirRun,
        );
      } else {
        const length = Math.min(straightLength(rng), straightLeft);
        plan = {
          kind: "straight",
          length,
          ...assignFeature(rng, length, total, lastLipEnd(), dials),
        };
      }
      const { points, end } = probePoints(cursor, plan);
      // Keep the road on course: a turn whose exit heading strays past the
      // error budget is redrawn (a turn's heading is monotonic, so checking
      // the exit covers the whole arc).
      if (Math.abs(angleDiff(end.heading, course)) > R.endless.maxCourseError) continue;
      if (
        points.some((p) => field.blocked(p) || claimed(p) || entersStart(p, clear) || !keepsDry(p))
      ) {
        continue;
      }
      commit(plan, points, end);
      return true;
    }
    return false;
  };

  const backtrack = (): void => {
    // Boxed in: back the line out of the pocket, several segments at once
    // (a one-segment retreat usually re-enters the same dead end) — but
    // never into road that has already been handed out.
    for (let drop = 0; drop < 3; drop++) {
      const tail = plans[plans.length - 1];
      if (!tail || plans.length <= frozen || plans.length <= 1) break;
      plans.pop();
      field.removeLast(Math.max(1, Math.ceil(tail.plan.length / PROBE_STEP)));
      total = tail.start;
    }
    cursor = { ...field.points[field.points.length - 1] };
    recomputeSameDirRun(
      plans.map((p) => p.plan),
      sameDirRun,
    );
  };

  let opened = false;

  const extendTo = (upToArc: number): SegmentPlan[] => {
    if (!opened) {
      opened = true;
      const opening: SegmentPlan = {
        kind: "straight",
        length: R.openingStraight + rng.range(0, 40),
        feature: "none",
      };
      const { points, end } = probePoints(cursor, opening);
      commit(opening, points, end);
    }
    // Generate until the FROZEN road covers the request; the lag between
    // the frozen boundary and the frontier is the backtrack runway. The
    // iteration budget has never been reached in sweeps — treat exhausting
    // it as a bug rather than shipping a violation.
    let iterations = 0;
    while (highWater - R.endless.commitLag < upToArc) {
      if (++iterations > 4000) {
        throw new Error(`endless stream stuck at ${total.toFixed(0)} m (seed ${seed})`);
      }
      const was = highWater;
      if (!place()) backtrack();
      // Progress walks the setback back UP the ladder a rung at a time
      // rather than restoring it all at once. Snapping straight back to
      // the full standard the moment a segment lands strands a road that
      // has just been let into the shallows: the next segment is refused
      // again, and the line spends the rest of the run oscillating on the
      // waterline it was supposed to be crossing.
      if (highWater > was) stuck = Math.max(0, stuck - R.endless.wetPatience);
      else stuck++;
    }
    // Freeze every plan that STARTS behind the boundary: the last of them
    // ends at or past the boundary (segments tile the arc), so the road
    // handed out always covers the request.
    const boundary = highWater - R.endless.commitLag;
    const added: SegmentPlan[] = [];
    while (frozen < plans.length && plans[frozen].start < boundary) {
      added.push(plans[frozen].plan);
      frozen += 1;
    }
    // Live plans behind the frozen boundary can never be popped again; the
    // ones ahead of it stay in `plans` for the next call.
    return added;
  };

  return {
    extendTo,
    ahead: () => field.points,
    keepOff: (x, z, radius) => {
      blocks.push({ x, z, r2: radius * radius });
    },
  };
}
