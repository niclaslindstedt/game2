// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stage generator's search loop: a rules engine that assembles a stage
// from the segment vocabulary in rules.ts while enforcing every R-rule.
// Candidate segments are drawn from the seeded RNG and validated against the
// world bounds (R9) and the self-distance rule (R10); a candidate that fails
// is re-drawn a bounded number of times, then the generator backtracks one
// segment rather than shipping a violation. The result is a deterministic
// function of the seed.

import { createRng, type Rng } from "../lib/prng.ts";
import { STAGE_RULES as R, type SegmentPlan } from "./rules.ts";

type Cursor = { x: number; z: number; heading: number; arc: number };

/** Coarse spacing (meters) for the bounds / self-distance validation walk. */
const PROBE_STEP = 6;

/** Arc distance under which two points count as route neighbours — closer
 * than this they may legitimately sit near each other (a hairpin's entry
 * and exit); beyond it R10 applies in full. */
const SELF_IGNORE_ARC = 80;

function probePoints(from: Cursor, plan: SegmentPlan): { points: Cursor[]; end: Cursor } {
  const points: Cursor[] = [];
  let { x, z, heading, arc } = from;
  const steps = Math.max(1, Math.ceil(plan.length / PROBE_STEP));
  const step = plan.length / steps;
  for (let i = 0; i < steps; i++) {
    if (plan.kind === "turn" && plan.radius) {
      heading += ((plan.dir ?? 1) * step) / plan.radius;
    }
    x += Math.sin(heading) * step;
    z += Math.cos(heading) * step;
    arc += step;
    points.push({ x, z, heading, arc });
  }
  return { points, end: { x, z, heading, arc } };
}

function inBounds(p: Cursor): boolean {
  return Math.abs(p.x) <= R.worldBound && Math.abs(p.z) <= R.worldBound;
}

/** R10 — every candidate point must keep clear of every committed point
 * that lies more than SELF_IGNORE_ARC behind it along the route. The
 * exclusion is measured per candidate point (not from the segment start),
 * so a long straight cannot creep back toward geometry the tail check
 * would have skipped. */
function clearsSelf(candidate: Cursor[], committed: Cursor[]): boolean {
  const minD2 = R.minSelfDistance * R.minSelfDistance;
  for (const c of candidate) {
    for (const p of committed) {
      if (c.arc - p.arc < SELF_IGNORE_ARC) break;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (dx * dx + dz * dz < minD2) return false;
    }
  }
  return true;
}

function straightLength(rng: Rng): number {
  const bucket = rng.chance(0.5) ? R.straightShort : R.straightLong;
  return rng.range(bucket.min, bucket.max);
}

/** Feature assignment for a mid-stage straight (R6/R7/R8). `sStart` is the
 * segment's absolute start along the stage; `sLastLipEnd` the absolute end of
 * the last jump's ramp (or -Infinity). */
function assignFeature(
  rng: Rng,
  length: number,
  sStart: number,
  sLastLipEnd: number,
): Pick<SegmentPlan, "feature" | "featureStart" | "featureEnd" | "lipHeight" | "crestHeight"> {
  // Jumps first — they are the headline feature.
  if (
    length >= R.jump.minStraight &&
    sStart + R.jump.runUp - sLastLipEnd >= R.jump.minSpacing &&
    rng.chance(R.featureChance.jump)
  ) {
    const ramp = rng.range(R.jump.rampLength.min, R.jump.rampLength.max);
    const lipAt = rng.range(R.jump.runUp, length - R.jump.landing - ramp);
    return {
      feature: "jump",
      featureStart: lipAt,
      featureEnd: lipAt + ramp,
      lipHeight: rng.range(R.jump.lipHeight.min, R.jump.lipHeight.max),
    };
  }
  if (length >= R.water.minStraight && rng.chance(R.featureChance.water)) {
    const span = rng.range(R.water.length.min, R.water.length.max);
    const earliest = Math.max(10, sLastLipEnd + R.water.clearAfterJump - sStart);
    const latest = length - span - 10;
    if (earliest < latest) {
      const at = rng.range(earliest, latest);
      return { feature: "water", featureStart: at, featureEnd: at + span };
    }
  }
  if (length >= R.crest.minStraight && rng.chance(R.featureChance.crest)) {
    const span = Math.min(rng.range(R.crest.length.min, R.crest.length.max), length - 16);
    const at = rng.range(8, length - span - 8);
    return {
      feature: "crest",
      featureStart: at,
      featureEnd: at + span,
      crestHeight: rng.range(R.crest.height.min, R.crest.height.max),
    };
  }
  return { feature: "none" };
}

function drawTurn(
  rng: Rng,
  prevWasStraight: boolean,
  forcedDir: 1 | -1 | 0,
  sameDirRun: { dir: 1 | -1 | 0; count: number },
): SegmentPlan {
  // R4 — hard turns need the braking zone a preceding straight provides.
  const severity = prevWasStraight && rng.chance(R.hardTurnChance) ? "hard" : "soft";
  const vocab = R.turn[severity];
  const radius = rng.range(vocab.radius.min, vocab.radius.max);
  const angle = rng.range(vocab.angle.min, vocab.angle.max);
  let dir: 1 | -1 = forcedDir !== 0 ? forcedDir : rng.chance(0.5) ? 1 : -1;
  // R5 — break up a same-direction run before it becomes a spiral. This
  // caps even a bounds-forced turn: the flipped candidate may then fail the
  // bounds probe, which sends the search into another draw or a backtrack —
  // the rules hold, the search does the sweating.
  if (dir === sameDirRun.dir && sameDirRun.count >= R.maxSameDirectionTurns) {
    dir = dir === 1 ? -1 : 1;
  }
  return { kind: "turn", length: radius * angle, dir, radius, severity, feature: "none" };
}

/** Generate a stage plan from a seed. Deterministic; always satisfies the
 * R-rules. A search that boxes itself in so badly that even the closing
 * straight cannot be placed legally is retried with a derived sub-seed —
 * still a pure function of the seed. */
export function generateStage(seed: number): SegmentPlan[] {
  for (let attempt = 0; attempt < 24; attempt++) {
    const plans = tryGenerateStage((seed + attempt * 0x9e3779b9) >>> 0);
    if (plans) return plans;
  }
  throw new Error(`stage generation failed for seed ${seed}`);
}

function tryGenerateStage(seed: number): SegmentPlan[] | null {
  const rng = createRng(seed);
  const plans: SegmentPlan[] = [];
  const committed: Cursor[] = [];
  let cursor: Cursor = { x: 0, z: 0, heading: 0, arc: 0 };
  let total = 0;
  let sLastLipEnd = -Infinity;
  const sameDirRun: { dir: 1 | -1 | 0; count: number } = { dir: 0, count: 0 };

  const commit = (plan: SegmentPlan, points: Cursor[], end: Cursor): void => {
    if (plan.feature === "jump") {
      sLastLipEnd = total + (plan.featureEnd ?? plan.length);
    }
    plans.push(plan);
    committed.push(...points);
    cursor = end;
    total += plan.length;
    if (plan.kind === "turn" && plan.dir) {
      if (plan.dir === sameDirRun.dir) sameDirRun.count += 1;
      else {
        sameDirRun.dir = plan.dir;
        sameDirRun.count = 1;
      }
    } else {
      sameDirRun.dir = 0;
      sameDirRun.count = 0;
    }
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

  const targetLength = rng.range(R.minStageLength, R.maxStageLength) - R.closingStraight;

  while (total < targetLength) {
    let placed = false;
    for (let attempt = 0; attempt < 10 && !placed; attempt++) {
      // R9 — near the boundary, steer back toward the middle: force a turn
      // whose direction reduces the outward heading.
      const margin = R.worldBound - R.boundMargin;
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
        plan = { kind: "straight", length, ...assignFeature(rng, length, total, sLastLipEnd) };
      }

      const { points, end } = probePoints(cursor, plan);
      if (!points.every(inBounds)) continue;
      if (!clearsSelf(points, committed)) continue;
      commit(plan, points, end);
      placed = true;
    }
    if (!placed) {
      // Search is stuck (boxed in by its own line). End the stage early if a
      // legal stage length is already reached; otherwise drop the last
      // segment and let the loop try a different continuation.
      if (total >= R.minStageLength - R.closingStraight) break;
      const dropped = plans.pop();
      if (!dropped || plans.length <= 1) break;
      const steps = Math.max(1, Math.ceil(dropped.length / PROBE_STEP));
      committed.splice(committed.length - steps, steps);
      total -= dropped.length;
      const tail = committed[committed.length - 1];
      cursor = { ...tail };
      sameDirRun.dir = 0;
      sameDirRun.count = 0;
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
    if (points.every(inBounds) && clearsSelf(points, committed)) {
      commit(closing, points, end);
      return total >= R.minStageLength ? plans : null;
    }
    const dropped = plans.pop();
    if (!dropped || plans.length <= 1) return null;
    const steps = Math.max(1, Math.ceil(dropped.length / PROBE_STEP));
    committed.splice(committed.length - steps, steps);
    total -= dropped.length;
    cursor = { ...committed[committed.length - 1] };
    if (total < R.minStageLength - R.closingStraight) return null;
  }
}
