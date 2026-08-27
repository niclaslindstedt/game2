// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stage searches' shared machinery: the walking cursor, the committed
// point field that answers R9 (world bounds) and R10 (self-distance), the
// draws that turn the rules' vocabulary into a candidate segment, and the
// feature assignment that decides what a straight carries. Every search in
// this generator — the finite sprint, the endless stream, and the circuit —
// assembles a stage out of exactly these pieces; what differs between them
// is only WHERE the line is being steered, which is what generate.ts and
// circuit.ts own.

import type { Rng } from "../lib/prng.ts";
import { STAGE_RULES as R, knobScale, type SegmentPlan, type StageKnobs } from "./rules.ts";

export type Cursor = { x: number; z: number; heading: number; arc: number };

/** Coarse spacing (meters) for the bounds / self-distance validation walk. */
export const PROBE_STEP = 6;

/** Arc distance under which two points count as route neighbours — closer
 * than this they may legitimately sit near each other (a hairpin's entry
 * and exit); beyond it R10 applies in full. */
export const SELF_IGNORE_ARC = 80;

export type PointField = ReturnType<typeof createPointField>;

/** The committed probe points, spatially hashed so the R10 check per
 * candidate point is a 3×3 cell probe instead of a scan of the whole stage
 * — the difference between a millisecond search and a multi-second one on
 * the long bands. Cell size equals `minSelfDistance`, so every point within
 * that distance of a query sits in one of the neighbouring cells. */
export function createPointField() {
  const cell = R.minSelfDistance;
  const minD2 = R.minSelfDistance * R.minSelfDistance;
  const points: Cursor[] = [];
  const grid = new Map<string, Cursor[]>();
  const keyOf = (p: Cursor): string => `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;

  return {
    points,
    add(added: Cursor[]): void {
      for (const p of added) {
        points.push(p);
        const key = keyOf(p);
        const bucket = grid.get(key);
        if (bucket) bucket.push(p);
        else grid.set(key, [p]);
      }
    },
    /** Remove the most recently added `n` points (a backtrack). */
    removeLast(n: number): void {
      for (let i = 0; i < n && points.length > 0; i++) {
        const p = points.pop() as Cursor;
        const bucket = grid.get(keyOf(p));
        if (bucket) {
          const at = bucket.lastIndexOf(p);
          if (at >= 0) bucket.splice(at, 1);
        }
      }
    },
    /** Drop points older than `arc` (the endless stream's sliding window). */
    pruneBefore(arc: number): void {
      let cut = 0;
      while (cut < points.length && points[cut].arc < arc) cut++;
      if (cut < 512) return; // amortize: rebuild rarely, in big slices
      for (let i = 0; i < cut; i++) {
        const p = points[i];
        const bucket = grid.get(keyOf(p));
        if (bucket) {
          const at = bucket.indexOf(p);
          if (at >= 0) bucket.splice(at, 1);
        }
      }
      points.splice(0, cut);
    },
    /** R10 — does any committed point beyond the route-neighbour window sit
     * closer than `minSelfDistance` to `c`? On a CIRCUIT arc distance is
     * cyclic: pass the lap's total length as `cycle` and the road running
     * back into the start line counts as the neighbour it actually is,
     * instead of as a crossing of a stage it is the continuation of. */
    blocked(c: Cursor, cycle = Infinity): boolean {
      const ix = Math.floor(c.x / cell);
      const iz = Math.floor(c.z / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(`${ix + dx},${iz + dz}`);
          if (!bucket) continue;
          for (const p of bucket) {
            const gap = c.arc - p.arc;
            if (Math.min(gap, cycle - gap) < SELF_IGNORE_ARC) continue;
            const ddx = p.x - c.x;
            const ddz = p.z - c.z;
            if (ddx * ddx + ddz * ddz < minD2) return true;
          }
        }
      }
      return false;
    },
  };
}

/** Walk a candidate segment from `from`, at the coarse validation spacing. */
export function probePoints(from: Cursor, plan: SegmentPlan): { points: Cursor[]; end: Cursor } {
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

/** The probe walks at PROBE_STEP while compile samples finer, and the two
 * Euler walks diverge cumulatively over a whole stage (coarser steps cut
 * every arc's corners). Validate against a bound pulled in by this slack so
 * the compiled centerline never leaves R9. */
const BOUND_SLACK = 8;

export function inBounds(p: Cursor, worldBound: number): boolean {
  const bound = worldBound - BOUND_SLACK;
  return Math.abs(p.x) <= bound && Math.abs(p.z) <= bound;
}

export type SameDirRun = { dir: 1 | -1 | 0; count: number; angle: number };

/** Rebuild the same-direction run from the committed plans' tail — the run
 * state after a backtrack must reflect what is actually still committed,
 * or a re-draw can stack a third same-direction turn past R5. */
export function recomputeSameDirRun(plans: SegmentPlan[], run: SameDirRun): void {
  run.dir = 0;
  run.count = 0;
  run.angle = 0;
  const last = plans[plans.length - 1];
  if (!last || last.kind !== "turn" || !last.dir) return;
  run.dir = last.dir;
  for (let i = plans.length - 1; i >= 0; i--) {
    const p = plans[i];
    if (p.kind !== "turn" || p.dir !== run.dir) break;
    run.count += 1;
    run.angle += p.length / (p.radius ?? 1);
  }
}

export function trackRun(run: SameDirRun, plan: SegmentPlan): void {
  if (plan.kind === "turn" && plan.dir) {
    const angle = plan.length / (plan.radius ?? 1);
    if (plan.dir === run.dir) {
      run.count += 1;
      run.angle += angle;
    } else {
      run.dir = plan.dir;
      run.count = 1;
      run.angle = angle;
    }
  } else {
    run.dir = 0;
    run.count = 0;
    run.angle = 0;
  }
}

export function straightLength(rng: Rng): number {
  const bucket = rng.chance(R.longStraightChance) ? R.straightLong : R.straightShort;
  return rng.range(bucket.min, bucket.max);
}

type FeatureFields = Pick<
  SegmentPlan,
  "feature" | "featureStart" | "featureEnd" | "lipHeight" | "crestHeight" | "crossing"
>;

/** R7/R13 — how this straight meets water, if it does. A crossing is drawn
 * as a WIDTH first and the architecture follows from it: narrow enough to
 * wade is a ford, anything wider needs a deck, and a deck past
 * `bridge.timberMax` is beyond what two trunks and a plank floor can span
 * — that one is concrete. The `water` dial decides both how wide the
 * crossings run and how often one is a river rather than a stream. */
function assignCrossing(
  rng: Rng,
  length: number,
  sStart: number,
  sLastLipEnd: number,
  knobs: StageKnobs,
): FeatureFields | null {
  if (rng.chance(knobScale(knobs.water, R.wet.bridgeShare)) && length >= R.bridge.minStraight) {
    const reach = knobScale(knobs.water, R.wet.spanReach);
    const span = rng.range(
      R.bridge.span.min,
      R.bridge.span.min + (R.bridge.span.max - R.bridge.span.min) * reach,
    );
    const earliest = Math.max(R.bridge.margin, sLastLipEnd + R.bridge.clearAfterJump - sStart);
    const latest = length - span - R.bridge.margin;
    if (earliest < latest) {
      const at = rng.range(earliest, latest);
      return {
        feature: "water",
        featureStart: at,
        featureEnd: at + span,
        crossing: span > R.bridge.timberMax ? "concrete" : "timber",
      };
    }
  }
  if (length < R.water.minStraight) return null;
  const span = rng.range(R.water.length.min, R.water.length.max);
  // R12 — the dip's aprons must fit inside the segment, so the ford keeps
  // an apron's clearance from both ends (and from the last jump's ramp).
  const earliest = Math.max(R.water.apron, sLastLipEnd + R.water.clearAfterJump - sStart);
  const latest = length - span - R.water.apron;
  if (earliest >= latest) return null;
  const at = rng.range(earliest, latest);
  return { feature: "water", featureStart: at, featureEnd: at + span, crossing: "ford" };
}

/** Feature assignment for a mid-stage straight (R6/R7/R8). `sStart` is the
 * segment's absolute start along the stage; `sLastLipEnd` the absolute end of
 * the last jump's ramp (or -Infinity). */
export function assignFeature(
  rng: Rng,
  length: number,
  sStart: number,
  sLastLipEnd: number,
  knobs: StageKnobs,
): FeatureFields {
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
  if (
    length >= R.water.minStraight &&
    rng.chance(R.featureChance.water * knobScale(knobs.water, R.wet.crossingChance))
  ) {
    const crossing = assignCrossing(rng, length, sStart, sLastLipEnd, knobs);
    if (crossing) return crossing;
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

export function drawTurn(
  rng: Rng,
  prevWasStraight: boolean,
  forcedDir: 1 | -1 | 0,
  sameDirRun: SameDirRun,
): SegmentPlan {
  // R3/R4 — pick the severity bucket. Hard turns need the braking zone a
  // preceding straight provides; drawn mid-combination the hard share
  // becomes a medium instead, so corner density survives without ambushes.
  const roll = rng.next();
  let severity: "soft" | "medium" | "hard";
  if (roll < R.severityChance.hard) severity = prevWasStraight ? "hard" : "medium";
  else if (roll < R.severityChance.hard + R.severityChance.medium) severity = "medium";
  else severity = "soft";
  const vocab = R.turn[severity];
  const radius = rng.range(vocab.radius.min, vocab.radius.max);
  const angle = rng.range(vocab.angle.min, vocab.angle.max);
  let dir: 1 | -1 = forcedDir !== 0 ? forcedDir : rng.chance(0.5) ? 1 : -1;
  // R5 — break up a same-direction run before it becomes a spiral: flip
  // when the run is at the count cap OR would curl past the angle cap (a
  // near-loop the self-distance probe would only reject after building the
  // doomed geometry). This caps even a bounds-forced turn: the flipped
  // candidate may then fail the bounds probe, which sends the search into
  // another draw or a backtrack — the rules hold, the search does the
  // sweating.
  if (
    dir === sameDirRun.dir &&
    (sameDirRun.count >= R.maxSameDirectionTurns ||
      sameDirRun.angle + angle > R.maxSameDirectionAngle)
  ) {
    dir = dir === 1 ? -1 : 1;
  }
  return { kind: "turn", length: radius * angle, dir, radius, severity, feature: "none" };
}
