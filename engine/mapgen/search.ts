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
import { biomeRules } from "./biomes.ts";
import { cellKey } from "../lib/math.ts";
import {
  SAMPLE_STEP,
  STAGE_RULES as R,
  knobScale,
  type SegmentPlan,
  type StageKnobs,
  type TurnSeverity,
} from "./rules.ts";

export type Cursor = {
  x: number;
  z: number;
  heading: number;
  arc: number;
  /** R23 — roughly how high the ROAD stands here, m, walked at the probe's
   * own resolution. Absent where the caller has no landscape to follow (a
   * synthetic track), and the height half of R23 is then simply not asked.
   *
   * It is the road's base, not its surface: the rolling profile rides on
   * top of this and swings a few metres either way, which is noise against
   * the tens of metres the height rule is about. */
  y?: number;
};

/** R34's height walk, at the probe's own resolution — the road builder's
 * eye, cheap enough to run inside the search rather than only after it.
 *
 * The same lag and the same two clamps the compiler walks with, so the
 * search's idea of how high the road will be tracks the road that actually
 * gets built rather than the bare hillside under it. That difference is the
 * whole point: a road is metres above the country it crosses on an
 * embankment and metres below it in a cutting, and it is the ROAD's height
 * that decides whether two arms of a stage can pass each other. */
export type Profile = { y: number; slope: number };

export function stepProfile(profile: Profile, ground: number, step: number): number {
  const F = R.elevation.follow;
  const want = profile.y + (ground - profile.y) * (1 - Math.exp(-step / F.lag));
  let next = (want - profile.y) / step;
  const swing = F.crest * step;
  if (next > profile.slope + swing) next = profile.slope + swing;
  else if (next < profile.slope - swing) next = profile.slope - swing;
  if (next > F.grade) next = F.grade;
  else if (next < -F.grade) next = -F.grade;
  profile.slope = next;
  profile.y += next * step;
  return profile.y;
}

/** Where a road is and which way it points — a cursor without the arc. */
export type Pose = { x: number; z: number; heading: number };

const TAU = Math.PI * 2;

/** Positive rotation from `from` to `to` turning in `dir`, radians. */
export function sweep(from: number, to: number, dir: 1 | -1): number {
  const raw = dir === 1 ? to - from : from - to;
  return ((raw % TAU) + TAU) % TAU;
}

/** The centre of the circle a car at `p` turns on at radius `r` in `dir`.
 * The heading's right-hand normal is (cos h, -sin h), and a dir of +1 grows
 * the heading, so that normal points at the centre. */
export function turnCentre(p: Pose, r: number, dir: 1 | -1): { x: number; z: number } {
  return { x: p.x + dir * r * Math.cos(p.heading), z: p.z - dir * r * Math.sin(p.heading) };
}

/** Heading of the vector (x, z) in the engine's convention. */
export function bearing(x: number, z: number): number {
  return Math.atan2(x, z);
}

export type Closure = { arc1: number; straight: number; arc2: number };

/** Solve the turn-straight-turn from `from` to `to`: a corner of radius
 * `r1` in direction `d1`, a straight, and a corner of radius `r2` in `d2`
 * that arrives on the target pose. The straight is the common tangent of
 * the two corners' circles — the OUTER one when both bend the same way, the
 * crossover when they bend against each other — and where that tangent
 * touches is found from one offset: the difference of the radii for a
 * same-sense pair, their sum for an opposite-sense one. Null when the
 * circles are too close together for that tangent to exist.
 *
 * Shared, because arriving exactly on a pose is what BOTH a circuit's
 * closure (R22, onto its own grid) and a junction's approach (R17, onto a
 * road that was laid before the route) are: one is a line coming back to
 * where it started, the other a line coming to meet somebody else's road,
 * and the geometry does not know the difference. */
export function solveCsc(
  from: Pose,
  to: Pose,
  r1: number,
  r2: number,
  d1: 1 | -1,
  d2: 1 | -1,
): Closure | null {
  const c1 = turnCentre(from, r1, d1);
  const c2 = turnCentre(to, r2, d2);
  const dx = c2.x - c1.x;
  const dz = c2.z - c1.z;
  const dist = Math.hypot(dx, dz);
  const offset = d1 === d2 ? d1 * (r2 - r1) : -d1 * (r1 + r2);
  if (dist <= Math.abs(offset) + 1e-6) return null;
  const hs = bearing(dx, dz) - Math.asin(offset / dist);
  return {
    arc1: sweep(from.heading, hs, d1),
    straight: Math.sqrt(dist * dist - offset * offset),
    arc2: sweep(hs, to.heading, d2),
  };
}

/** The four dir pairs, in the order a solve tries them. */
export const DIR_PAIRS: [1 | -1, 1 | -1][] = [
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
];

/** Walk `plans` from `from` the way compile.ts will walk them — the same
 * step count, the same order of operations — so the search knows where the
 * ROAD ends and not merely where its coarse validation probe thinks it
 * does. The two differ by meters over a lap, which is the difference
 * between a start line and a hole in one. */
export function buildWalk(from: Pose, plans: SegmentPlan[]): Pose {
  let { x, z, heading } = from;
  for (const plan of plans) {
    const steps = Math.max(1, Math.round(plan.length / SAMPLE_STEP));
    const step = plan.length / steps;
    const curvature = plan.kind === "turn" && plan.radius ? (plan.dir ?? 1) / plan.radius : 0;
    for (let i = 0; i < steps; i++) {
      if (curvature !== 0) heading += curvature * step;
      x += Math.sin(heading) * step;
      z += Math.cos(heading) * step;
    }
  }
  return { x, z, heading };
}

/** The corners a solve is allowed to use — a ladder of `steps` radii read
 * straight out of the turn vocabulary (R3) across each severity's band,
 * widest first: a corner that can be swept is worth more than one that has
 * to be hooked, so the hairpin end is the fallback and not the first
 * answer. Solving only at radii the generator would have DRAWN is what
 * keeps a solved corner inside R3 instead of beside it — the angle it
 * sweeps is then checked against that same severity's angle band. */
export function solveRadii(steps: number): { radius: number; severity: TurnSeverity }[] {
  return (["soft", "medium", "hard"] as const).flatMap((severity) => {
    const band = R.turn[severity].radius;
    return Array.from({ length: steps }, (_, i) => ({
      severity,
      radius: band.max - ((band.max - band.min) * i) / (steps - 1),
    }));
  });
}

/** Coarse spacing (meters) for the bounds / self-distance validation walk. */
export const PROBE_STEP = 6;

/** Arc distance under which two points count as route neighbours — closer
 * than this they may legitimately sit near each other (a hairpin's entry
 * and exit); beyond it R10 applies in full. */
export const SELF_IGNORE_ARC = 80;

/** R23 — the biggest height difference the rule sizes its search grid for,
 * m. Two arms further apart than this in height need more room than the
 * grid's ring walk looks at, so the rule under-reports past it: a ceiling
 * on the CHECK, not on the stage. Generous enough to cover any fold-back a
 * stage's own grade clamp can build over a few kilometres. */
const HEIGHT_SPAN = 60;

export type PointField = ReturnType<typeof createPointField>;

/** The committed probe points, spatially hashed so the R10 check per
 * candidate point is a 3×3 cell probe instead of a scan of the whole stage
 * — the difference between a millisecond search and a multi-second one on
 * the long bands. Cell size equals the clearance the field is enforcing
 * (R23's `roadClearance`), so every point within that distance of a query
 * sits in one of the neighbouring cells. */
export function createPointField(clear: number, shelfEnd = 0) {
  // R23's height half needs to reach further than its plan half whenever
  // two arms differ by more than the plain clearance can bridge, so the
  // grid's cells — and the ring the query walks — are sized on the widest
  // separation the rule can ask for rather than on `clear` alone.
  const faceMax = R.verge.cut.face.max;
  const reach = Math.max(clear, 2 * shelfEnd + HEIGHT_SPAN / faceMax);
  const cell = reach;
  const minD2 = clear * clear;
  const points: Cursor[] = [];
  const grid = new Map<number, Cursor[]>();
  const keyOf = (p: Cursor): number => cellKey(Math.floor(p.x / cell), Math.floor(p.z / cell));

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
    /** R10/R23 — does any committed point beyond the route-neighbour window
     * sit closer than the road's own clearance to `c`? On a CIRCUIT arc
     * distance is
     * cyclic: pass the lap's total length as `cycle` and the road running
     * back into the start line counts as the neighbour it actually is,
     * instead of as a crossing of a stage it is the continuation of. */
    blocked(c: Cursor, cycle = Infinity): boolean {
      const ix = Math.floor(c.x / cell);
      const iz = Math.floor(c.z / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(cellKey(ix + dx, iz + dz));
          if (!bucket) continue;
          for (const p of bucket) {
            const gap = c.arc - p.arc;
            if (Math.min(gap, cycle - gap) < SELF_IGNORE_ARC) continue;
            const ddx = p.x - c.x;
            const ddz = p.z - c.z;
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < minD2) return true;
            // R23 IN HEIGHT. Keeping two arms `clear` apart on the map says
            // nothing about how far apart they are vertically, and the
            // terrain between them has to get from one to the other: each
            // road owns its corridor out to `shelfEnd`, and the country in
            // between can climb no faster than R34's steepest cut face.
            //
            // Without this a stage could legally fold back 43 m from itself
            // with 33 m of height between the two arms — and then no ground
            // satisfies both. Whichever road a lattice corner is nearer to
            // owns it, so adjacent corners 14 m apart came out 32 m apart in
            // height: a cliff at the upper road's edge, its verge running
            // out into thin air, and R31 broken with nothing in the terrain
            // able to fix it.
            if (c.y === undefined || p.y === undefined) continue;
            const rise = Math.abs(p.y - c.y);
            const need = 2 * shelfEnd + rise / faceMax;
            if (d2 < need * need) return true;
          }
        }
      }
      return false;
    },
  };
}

/** R24 — how far a probe point is from the ground the START stands on, m.
 * Every plan is walked from the origin heading toward +z, so the start line
 * is (0, 0) and the apron behind it runs back to (0, −apron): the zone is
 * that segment, and this is the distance to it. */
export function startZoneDistance(p: Cursor): number {
  const spine = Math.min(0, Math.max(-R.startZone.apron, p.z));
  return Math.hypot(p.x, p.z - spine);
}

/** R24 — does this candidate point come back INTO the start? Only road that
 * has already gone somewhere is asked: the opening straight and the corner
 * off it are the route LEAVING, which is not a return. A CIRCUIT never asks:
 * closing onto its own start line is the whole shape of it (R22), and the
 * road it closes with lies along the apron rather than across it. */
export function entersStart(p: Cursor, clear: number): boolean {
  return p.arc >= R.startZone.fromArc && startZoneDistance(p) < clear;
}

/** Walk a candidate segment from `from`, at the coarse validation spacing. */
export function probePoints(
  from: Cursor,
  plan: SegmentPlan,
  /** The road's height as it walks, or undefined to skip it. Advanced by
   * this call and NOT rewound — the caller keeps the authoritative copy and
   * hands in a clone for a candidate it may yet throw away. */
  height?: { profile: Profile; groundAt: (x: number, z: number) => number },
): { points: Cursor[]; end: Cursor } {
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
    const y = height ? stepProfile(height.profile, height.groundAt(x, z), step) : undefined;
    points.push({ x, z, heading, arc, y });
  }
  return { points, end: { x, z, heading, arc, y: height?.profile.y } };
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
  if (!last || last.kind !== "turn" || !last.dir || last.paved) return;
  run.dir = last.dir;
  for (let i = plans.length - 1; i >= 0; i--) {
    const p = plans[i];
    if (p.kind !== "turn" || p.dir !== run.dir || p.paved) break;
    run.count += 1;
    run.angle += p.length / (p.radius ?? 1);
  }
}

/** R5 — the same-direction run, advanced by one committed segment.
 *
 * A BORROWED segment resets it, exactly as a straight does. R5 caps how
 * many corners in a row the rally may turn the same way, so a stage does
 * not spiral — and the pieces of a public road the route is running along
 * (R17) are not the rally's corners. They are a line being tracked: a
 * gentle bend cut into seventy-metre chunks (`borrow.ts`) comes out as
 * several same-direction turns that in the country are one sweep, and
 * counting them caps the rally's own vocabulary for something the rally
 * did not draw. What the reset says is that the route came off a public
 * road, so the next corner is a fresh corner. */
export function trackRun(run: SameDirRun, plan: SegmentPlan): void {
  if (plan.kind === "turn" && plan.dir && !plan.paved) {
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

/** R38 — how much of a segment the route covers WITHOUT A CORNER IN IT. A
 * straight is all of it; a bend wider than `straightRun.bend` is a lean the
 * driver holds rather than a corner they take, so it counts too; anything
 * tighter is a corner and breaks the run.
 *
 * Stated once, here, because three different places have to agree about it:
 * the search drawing a straight, the borrow deciding how far it may follow
 * a public road, and the retreat rebuilding the run after a backtrack. */
export function straightPart(plan: SegmentPlan): number {
  if (plan.kind === "straight") return plan.length;
  return (plan.radius ?? 0) > R.straightRun.bend ? plan.length : 0;
}

/** R38 — the straight run standing at the end of the committed plans, m.
 *
 * Recomputed from the tail rather than carried, for the same reason the
 * same-direction run is: after a backtrack the only honest answer is what
 * is still committed, and a run carried across an `uncommit` lets the next
 * straight stack onto one that is no longer there. */
export function straightRunAt(plans: SegmentPlan[]): number {
  let run = 0;
  for (let i = plans.length - 1; i >= 0; i--) {
    const part = straightPart(plans[i]);
    if (part === 0) break;
    run += part;
  }
  return run;
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
    // R6 — and long enough for the parts of a jump to fit inside it,
    // whichever ramp gets drawn below. `minStraight` alone does not say
    // that: at 90 m it is shorter than the run-up, the longest ramp and
    // the landing added together, so a straight could pass it and then
    // have nowhere to put the lip except inside its own run-up — which is
    // exactly what `rng.range(runUp, length - landing - ramp)` does when
    // its high bound falls under its low one, silently and only on the
    // draws where the ramp comes out long.
    length >= R.jump.runUp + R.jump.rampLength.max + R.jump.landing &&
    sStart + R.jump.runUp - sLastLipEnd >= R.jump.minSpacing &&
    rng.chance(R.featureChance.jump)
  ) {
    const ramp = rng.range(R.jump.rampLength.min, R.jump.rampLength.max);
    const lipAt = rng.range(R.jump.runUp, length - R.jump.landing - ramp);
    // R6 — the ramp's GRADE is drawn and the lip follows from it, because
    // the grade is what throws the car and a height drawn on its own says
    // nothing about it over a ramp of unknown length. The cap keeps the
    // biggest lips sane; `rules_test` holds it clear of the grade floor, so
    // capping can never hand back a ramp gentler than a hill.
    const ratio = rng.range(R.jump.ratio.min, R.jump.ratio.max);
    return {
      feature: "jump",
      featureStart: lipAt,
      featureEnd: lipAt + ramp,
      lipHeight: Math.min(R.jump.lipHeight.max, Math.max(R.jump.lipHeight.min, ratio * ramp)),
    };
  }
  // R40 — a dry country has no water for a straight to cross, so the roll
  // is never made there: the desert's straights go on to the crests.
  if (
    biomeRules(knobs.biome).water &&
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

const SEVERITY_ORDER: TurnSeverity[] = ["soft", "medium", "hard"];

export function drawTurn(
  rng: Rng,
  prevWasStraight: boolean,
  forcedDir: 1 | -1 | 0,
  sameDirRun: SameDirRun,
  /** R1 — the tightest severity this corner may be drawn from. Only the
   * first corner off the start passes one: a heads-up grid arrives at it
   * still stacked, so the stage may not open into a hairpin. */
  cap?: TurnSeverity,
): SegmentPlan {
  // R3/R4 — pick the severity bucket. Hard turns need the braking zone a
  // preceding straight provides; drawn mid-combination the hard share
  // becomes a medium instead, so corner density survives without ambushes.
  const roll = rng.next();
  let severity: TurnSeverity;
  if (roll < R.severityChance.hard) severity = prevWasStraight ? "hard" : "medium";
  else if (roll < R.severityChance.hard + R.severityChance.medium) severity = "medium";
  else severity = "soft";
  if (cap && SEVERITY_ORDER.indexOf(severity) > SEVERITY_ORDER.indexOf(cap)) severity = cap;
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
