// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stage generator's search loops: a rules engine that assembles a stage
// from the segment vocabulary in rules.ts while enforcing every R-rule.
// Candidate segments are drawn from the seeded RNG and validated against the
// world bounds (R9) and the self-distance rule (R10); a candidate that fails
// is re-drawn a bounded number of times, then the generator backtracks one
// segment rather than shipping a violation. The result is a deterministic
// function of the seed. Endless stages use the same vocabulary through
// `createStageStream`, which appends sections forever instead of closing;
// circuits (R22) close back onto their own start line and live in
// circuit.ts. Everything all three searches share — the cursor, the point
// field, the draws — is in search.ts.

import { angleDiff } from "../lib/math.ts";
import { createRng } from "../lib/prng.ts";
import {
  STAGE_RULES as R,
  type FiniteStageLength,
  type SegmentPlan,
  type StageKnobs,
  type StageShape,
} from "./rules.ts";
import { resolveKnobs } from "./rules.ts";
import { generateCircuit } from "./circuit.ts";
import {
  PROBE_STEP,
  assignFeature,
  createPointField,
  drawTurn,
  inBounds,
  probePoints,
  recomputeSameDirRun,
  straightLength,
  trackRun,
  type Cursor,
  type SameDirRun,
} from "./search.ts";

/** Generate a finite stage plan from a seed, sized for `length`'s band.
 * Deterministic; always satisfies the R-rules. A search that boxes itself
 * in so badly that even the closing straight cannot be placed legally is
 * retried with a derived sub-seed — still a pure function of the seed.
 *
 * R22 — `shape` picks which search runs. A sprint runs from a start to a
 * finish somewhere else (the search below); a circuit closes back onto its
 * own start line so the stage can be raced over laps (circuit.ts). */
export function generateStage(
  seed: number,
  length: FiniteStageLength = "medium",
  knobs?: Partial<StageKnobs>,
  shape: StageShape = "sprint",
): SegmentPlan[] {
  const dials = resolveKnobs(knobs);
  if (shape === "circuit") return generateCircuit(seed, length, dials);
  for (let attempt = 0; attempt < 40; attempt++) {
    const plans = tryGenerateStage((seed + attempt * 0x9e3779b9) >>> 0, length, dials);
    if (plans) return plans;
  }
  throw new Error(`stage generation failed for seed ${seed} (${length})`);
}

function tryGenerateStage(
  seed: number,
  length: FiniteStageLength,
  knobs: StageKnobs,
): SegmentPlan[] | null {
  const spec = R.stageLengths[length];
  const rng = createRng(seed);
  const plans: SegmentPlan[] = [];
  const field = createPointField();
  let cursor: Cursor = { x: 0, z: 0, heading: 0, arc: 0 };
  let total = 0;
  let sLastLipEnd = -Infinity;
  const sameDirRun: SameDirRun = { dir: 0, count: 0, angle: 0 };

  const commit = (plan: SegmentPlan, points: Cursor[], end: Cursor): void => {
    if (plan.feature === "jump") {
      sLastLipEnd = total + (plan.featureEnd ?? plan.length);
    }
    plans.push(plan);
    field.add(points);
    cursor = end;
    total += plan.length;
    trackRun(sameDirRun, plan);
  };

  // R1 — opening straight (never carries a feature: it is the start grid).
  const opening: SegmentPlan = {
    kind: "straight",
    length: R.openingStraight + rng.range(0, 40),
    feature: "none",
  };
  {
    const { points, end } = probePoints(cursor, opening);
    commit(opening, points, end);
  }

  const targetLength = rng.range(spec.band.min, spec.band.max) - R.closingStraight;

  // A boxed-in search can place-and-backtrack around the same pocket for a
  // very long time (a random walk with no exit). Normal stages assemble in
  // well under a thousand iterations; past this cap the attempt is hopeless
  // — reject it and let the caller retry with the next sub-seed. Longer
  // bands earn proportionally more iterations before giving up.
  const maxIterations = 2000 + spec.band.max;
  let iterations = 0;

  while (total < targetLength) {
    if (++iterations > maxIterations) return null;
    let placed = false;
    for (let attempt = 0; attempt < 10 && !placed; attempt++) {
      // R9 — near the boundary, steer back toward the middle: force a turn
      // whose direction reduces the outward heading.
      const margin =
        spec.worldBound - Math.max(R.boundMargin.min, spec.worldBound * R.boundMargin.frac);
      const out = Math.abs(cursor.x) > margin || Math.abs(cursor.z) > margin;
      let forcedDir: 1 | -1 | 0 = 0;
      let kind: "straight" | "turn" = rng.chance(R.turnChance) ? "turn" : "straight";
      if (out) {
        kind = "turn";
        // Heading error toward the origin decides the turn direction.
        const toCenter = Math.atan2(-cursor.x, -cursor.z);
        let err = toCenter - cursor.heading;
        while (err > Math.PI) err -= 2 * Math.PI;
        while (err <= -Math.PI) err += 2 * Math.PI;
        forcedDir = err >= 0 ? 1 : -1;
      }

      const prevWasStraight = plans[plans.length - 1].kind === "straight";
      let plan: SegmentPlan;
      if (kind === "turn") {
        plan = drawTurn(rng, prevWasStraight, forcedDir, sameDirRun);
      } else {
        const length = straightLength(rng);
        plan = {
          kind: "straight",
          length,
          ...assignFeature(rng, length, total, sLastLipEnd, knobs),
        };
      }

      // R11 — the segment that crosses targetLength must not overshoot the
      // band's ceiling once the closing straight lands on top.
      if (total + plan.length > spec.band.max - R.closingStraight) continue;

      const { points, end } = probePoints(cursor, plan);
      if (!points.every((p) => inBounds(p, spec.worldBound))) continue;
      if (points.some((p) => field.blocked(p))) continue;
      commit(plan, points, end);
      placed = true;
    }
    if (!placed) {
      // Search is stuck (boxed in by its own line). End the stage early if a
      // legal stage length is already reached; otherwise back the line out
      // of the pocket — several segments at once, because a one-segment
      // retreat usually re-enters the same dead end — and let the loop try
      // a different continuation.
      if (total >= spec.band.min - R.closingStraight) break;
      for (let drop = 0; drop < 3; drop++) {
        const dropped = plans.pop();
        if (!dropped || plans.length <= 1) return null;
        field.removeLast(Math.max(1, Math.ceil(dropped.length / PROBE_STEP)));
        total -= dropped.length;
      }
      cursor = { ...field.points[field.points.length - 1] };
      recomputeSameDirRun(plans, sameDirRun);
    }
  }

  // R2 — closing straight (featureless: the finish must be readable). It is
  // validated like any other segment: a finish that would cross the stage
  // (R10) or leave the world (R9) sheds tail segments until it fits, and a
  // stage that cannot fit a legal finish above the minimum length is
  // rejected so the caller retries with a sub-seed.
  const closing: SegmentPlan = { kind: "straight", length: R.closingStraight, feature: "none" };
  for (;;) {
    const { points, end } = probePoints(cursor, closing);
    if (
      points.every((p) => inBounds(p, spec.worldBound)) &&
      !points.some((p) => field.blocked(p))
    ) {
      commit(closing, points, end);
      return total >= spec.band.min ? plans : null;
    }
    const dropped = plans.pop();
    if (!dropped || plans.length <= 1) return null;
    field.removeLast(Math.max(1, Math.ceil(dropped.length / PROBE_STEP)));
    total -= dropped.length;
    cursor = { ...field.points[field.points.length - 1] };
    recomputeSameDirRun(plans, sameDirRun);
    if (total < spec.band.min - R.closingStraight) return null;
  }
}

export type StageStream = {
  /** Extend the plan until at least `upToArc` meters are committed; returns
   * the whole segments appended by this call, in stage order. The sequence
   * of segments is a pure function of the seed — how the calls chunk it
   * makes no difference. */
  extendTo: (upToArc: number) => SegmentPlan[];
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
  const field = createPointField();
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
      const kind: "straight" | "turn" = rng.chance(R.turnChance) ? "turn" : "straight";
      let plan: SegmentPlan;
      if (kind === "turn") {
        plan = drawTurn(
          rng,
          plans[plans.length - 1].plan.kind === "straight",
          forcedDir,
          sameDirRun,
        );
      } else {
        const length = straightLength(rng);
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
      if (points.some((p) => field.blocked(p))) continue;
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
      if (!place()) backtrack();
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

  return { extendTo };
}
