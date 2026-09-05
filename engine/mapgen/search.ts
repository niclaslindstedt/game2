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
import { straightness } from "./rolling.ts";
import {
  SAMPLE_STEP,
  STAGE_RULES as R,
  challengeMul,
  challengeSkew,
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
  /** R23 — how high the ROAD stands here, m, walked at the probe's own
   * resolution. Absent where the caller has no landscape to follow (a
   * synthetic track), and the height half of R23 is then simply not asked.
   *
   * The road's SURFACE — the base the builder's eye followed the country
   * to, plus the stage's own roll on top of it (`rolling.ts`), read at the
   * same arc the compiler will read it at. The roll swings several metres
   * either way, and a rule that has to fit two arms of a stage between
   * R31's cones, or lay a ford against its valley floor, is about metres. */
  y?: number;
  /** ...and how far along the roll that is, m — advanced through corners
   * at `straightness`, exactly as the compiler's cursor advances. */
  rollS?: number;
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
export type Profile = {
  /** The road's BASE, m — the country's height as the eye has followed it. */
  y: number;
  slope: number;
  /** Arc along the roll, m (`rolling.ts`). Corners advance it slowly, so it
   * is not the probe's own arc and has to be walked beside it. */
  rollS: number;
};

/** The road's base after one probe step of `step` m toward `ground`, with
 * the roll's arc advanced for a segment of `curvature`. */
export function stepProfile(profile: Profile, ground: number, step: number, curvature = 0): number {
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
  profile.rollS += step * straightness(curvature);
  return profile.y;
}

/** What the search walks the road's height WITH: the ground the road may
 * be built on at a point given the roll there (the compiler's `buildable`,
 * water's freeboard included), and the roll itself. */
export type HeightWalk = {
  profile: Profile;
  groundAt: (x: number, z: number, roll: number) => number;
  rolling: (s: number) => number;
};

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

/** R23 — the biggest height difference the rule walks its grid for, m.
 * Two arms further apart than this in height need more room than the
 * query's ring walk looks at, so the rule under-reports past it: a ceiling
 * on the CHECK, not on the stage. Generous enough to cover any fold-back a
 * stage's own grade clamp can build over a few kilometres. */
const HEIGHT_SPAN = 60;

/** R23 — how far apart two arms of a stage have to be, centerline to
 * centerline, to stand `rise` metres apart in height and still both have
 * the ground R31 promises beside them, m.
 *
 * Stated ONCE and read by the search and the analysis (`roads.step`), so
 * the two cannot drift. It is R31's own geometry read between two roads:
 * the upper arm owns its corridor out to `shelfEnd` at its own height, the
 * lower arm's bench keeps the country flat out to `verge.bench` at ITS
 * height, and between the two the ground may climb no faster than
 * `verge.climb`. Any closer than that and no ground satisfies both — the
 * terrain gives each lattice corner to the nearer road and the difference
 * stands up as a face along the upper road's edge, its verge running out
 * into thin air.
 *
 * Read against R34's steepest cut face instead of the verge's climb, as it
 * was, it let a stage fold back 45 m from itself with 33 m between the arms
 * — a rock face the country never earns (a cut opens only where the road
 * runs UNDER the land, and a road benched along a hillside runs at it) and
 * the single commonest error the analyzer found on the taiga, on every seed
 * of a dozen. */
export function armSeparation(shelfEnd: number, rise: number): number {
  const bench = Math.max(shelfEnd, R.verge.bench);
  return shelfEnd + bench + Math.abs(rise) / R.verge.climb;
}

export type PointField = ReturnType<typeof createPointField>;

/** The committed probe points, spatially hashed so the R10 check per
 * candidate point is a 3×3 cell probe instead of a scan of the whole stage
 * — the difference between a millisecond search and a multi-second one on
 * the long bands. Cell size equals the clearance the field is enforcing
 * (R23's `roadClearance`), so every point within that distance of a query
 * sits in one of the neighbouring cells. */
export function createPointField(clear: number, shelfEnd = 0) {
  const cell = clear;
  const minD2 = clear * clear;
  const points: Cursor[] = [];
  /** A cell's points, and the band of heights they span. The band is what
   * lets the height half of R23 reach further than the plan half without
   * the query scanning further: a cell whose every point is near the
   * probe's own height cannot trigger the rule from more than a cell away,
   * and is thrown away unread. It only ever WIDENS — a backtrack leaves it
   * as it was, which costs a scan and never an answer. */
  type Bucket = { points: Cursor[]; minY: number; maxY: number };
  const grid = new Map<number, Bucket>();
  const keyOf = (p: Cursor): number => cellKey(Math.floor(p.x / cell), Math.floor(p.z / cell));
  // The band of heights the whole field spans, for the same rejection one
  // level up: a probe no further in height from every point than the
  // plain clearance can bridge need not walk past the 3×3 block at all.
  let fieldMinY = Infinity;
  let fieldMaxY = -Infinity;
  const span = Math.ceil(armSeparation(shelfEnd, HEIGHT_SPAN) / cell);

  return {
    points,
    add(added: Cursor[]): void {
      for (const p of added) {
        points.push(p);
        const key = keyOf(p);
        const bucket = grid.get(key);
        if (bucket) {
          bucket.points.push(p);
          if (p.y !== undefined) {
            if (p.y < bucket.minY) bucket.minY = p.y;
            if (p.y > bucket.maxY) bucket.maxY = p.y;
          }
        } else {
          grid.set(key, { points: [p], minY: p.y ?? Infinity, maxY: p.y ?? -Infinity });
        }
        if (p.y !== undefined) {
          if (p.y < fieldMinY) fieldMinY = p.y;
          if (p.y > fieldMaxY) fieldMaxY = p.y;
        }
      }
    },
    /** Remove the most recently added `n` points (a backtrack). */
    removeLast(n: number): void {
      for (let i = 0; i < n && points.length > 0; i++) {
        const p = points.pop() as Cursor;
        const bucket = grid.get(keyOf(p));
        if (bucket) {
          const at = bucket.points.lastIndexOf(p);
          if (at >= 0) bucket.points.splice(at, 1);
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
          const at = bucket.points.indexOf(p);
          if (at >= 0) bucket.points.splice(at, 1);
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
      // The plan half lives in the 3×3 block; the height half can reach
      // `rings` out, and a further cell is read only where its band of
      // heights could put a point inside the separation its distance
      // demands.
      let reach = 1;
      if (c.y !== undefined && fieldMinY <= fieldMaxY) {
        const rise = Math.max(Math.abs(fieldMinY - c.y), Math.abs(fieldMaxY - c.y));
        reach = Math.max(1, Math.min(span, Math.ceil(armSeparation(shelfEnd, rise) / cell)));
      }
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dz = -reach; dz <= reach; dz++) {
          const bucket = grid.get(cellKey(ix + dx, iz + dz));
          if (!bucket) continue;
          const ring = Math.max(Math.abs(dx), Math.abs(dz));
          if (ring > 1) {
            const y = c.y as number;
            const rise = Math.max(Math.abs(bucket.minY - y), Math.abs(bucket.maxY - y));
            if (!(armSeparation(shelfEnd, rise) > (ring - 1) * cell)) continue;
          }
          for (const p of bucket.points) {
            const gap = c.arc - p.arc;
            if (Math.min(gap, cycle - gap) < SELF_IGNORE_ARC) continue;
            const ddx = p.x - c.x;
            const ddz = p.z - c.z;
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < minD2) return true;
            // R23 IN HEIGHT. Keeping two arms `clear` apart on the map says
            // nothing about how far apart they are vertically, and the
            // terrain between them has to get from one to the other at a
            // grade R31 lets it (`armSeparation`).
            //
            // Without this a stage could legally fold back 43 m from itself
            // with 33 m of height between the two arms — and then no ground
            // satisfies both. Whichever road a lattice corner is nearer to
            // owns it, so adjacent corners 14 m apart came out 32 m apart in
            // height: a cliff at the upper road's edge, its verge running
            // out into thin air, and R31 broken with nothing in the terrain
            // able to fix it.
            if (c.y === undefined || p.y === undefined) continue;
            const need = armSeparation(shelfEnd, p.y - c.y);
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

/** The start the search measures R24 against IN HEIGHT: the line's own
 * height (the apron behind it is extrapolated flat at it) and the corridor
 * shelf the road owns, the same pair `createPointField` holds for R23. */
export type StartGround = { y: number; shelfEnd: number };

/** R24 — does this candidate point come back INTO the start? Only road that
 * has already gone somewhere is asked: the opening straight and the corner
 * off it are the route LEAVING, which is not a return. A CIRCUIT never asks:
 * closing onto its own start line is the whole shape of it (R22), and the
 * road it closes with lies along the apron rather than across it.
 *
 * Asked in height as well as on the map where the search knows both
 * (`start`): the apron is road like any other arm, and a stretch passing it
 * at R23's plain clearance but a dozen metres above it leaves the country
 * between the two nothing to be but a face (`armSeparation`). The point
 * field cannot see this one — the apron is behind the first committed point
 * and outside every bucket — so the same clause is asked here. */
export function entersStart(p: Cursor, clear: number, start?: StartGround): boolean {
  if (p.arc < R.startZone.fromArc) return false;
  let need = clear;
  if (start && p.y !== undefined) {
    need = Math.max(need, armSeparation(start.shelfEnd, p.y - start.y));
  }
  return startZoneDistance(p) < need;
}

/** Walk a candidate segment from `from`, at the coarse validation spacing. */
export function probePoints(
  from: Cursor,
  plan: SegmentPlan,
  /** The road's height as it walks, or undefined to skip it. Advanced by
   * this call and NOT rewound — the caller keeps the authoritative copy and
   * hands in a clone for a candidate it may yet throw away. */
  height?: HeightWalk,
): { points: Cursor[]; end: Cursor } {
  const points: Cursor[] = [];
  let { x, z, heading, arc } = from;
  const steps = Math.max(1, Math.ceil(plan.length / PROBE_STEP));
  const step = plan.length / steps;
  const curvature = plan.kind === "turn" && plan.radius ? (plan.dir ?? 1) / plan.radius : 0;
  /** The road's surface at the walk's current position: the base plus the
   * roll at the arc the roll has reached. */
  const surface = (): number | undefined =>
    height ? height.profile.y + height.rolling(height.profile.rollS) : undefined;
  for (let i = 0; i < steps; i++) {
    if (curvature !== 0) heading += curvature * step;
    x += Math.sin(heading) * step;
    z += Math.cos(heading) * step;
    arc += step;
    if (height) {
      // The roll this step ARRIVES at, read ahead the way the compiler
      // reads it: the ground the road may be built on is the water's
      // freeboard less the roll standing on it, so the roll has to be
      // known before the base is stepped toward that ground.
      const rollS = height.profile.rollS + step * straightness(curvature);
      const roll = height.rolling(rollS);
      stepProfile(height.profile, height.groundAt(x, z, roll), step, curvature);
    }
    points.push({ x, z, heading, arc, y: surface(), rollS: height?.profile.rollS });
  }
  return { points, end: { x, z, heading, arc, y: surface(), rollS: height?.profile.rollS } };
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
    rng.chance(R.featureChance.jump * challengeMul(knobs.challenge, R.challenge.jumpChance))
  ) {
    const ramp =
      R.jump.rampLength.min +
      (R.jump.rampLength.max - R.jump.rampLength.min) *
        challengeSkew(rng.next(), knobs.challenge, R.challenge.rampLength);
    const lipAt = rng.range(R.jump.runUp, length - R.jump.landing - ramp);
    // R6 — the ramp's GRADE is drawn and the lip follows from it, because
    // the grade is what throws the car and a height drawn on its own says
    // nothing about it over a ramp of unknown length. The cap keeps the
    // biggest lips sane; `rules_test` holds it clear of the grade floor, so
    // capping can never hand back a ramp gentler than a hill.
    // R46 — and WHERE IN that band it is drawn is the difficulty dial's:
    // a savage stage keeps rolling the steep end of it, which is the same
    // ramp the rule already allowed and a great deal more air.
    const ratio =
      R.jump.ratio.min +
      (R.jump.ratio.max - R.jump.ratio.min) *
        challengeSkew(rng.next(), knobs.challenge, R.challenge.jump);
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
  /** R46 — the dials, for the difficulty the corner is drawn at. */
  knobs: StageKnobs,
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
  // R46 — how big the hard bucket is, is the difficulty dial's. The medium
  // share does not move, so what a harder stage spends is its soft turns.
  const hardShare = R.severityChance.hard * challengeMul(knobs.challenge, R.challenge.hardShare);
  let severity: TurnSeverity;
  if (roll < hardShare) severity = prevWasStraight ? "hard" : "medium";
  else if (roll < hardShare + R.severityChance.medium) severity = "medium";
  else severity = "soft";
  if (cap && SEVERITY_ORDER.indexOf(severity) > SEVERITY_ORDER.indexOf(cap)) severity = cap;
  const vocab = R.turn[severity];
  // R3/R46 — the vocabulary says what this corner may be; the dial says
  // where in it the dice keep landing. Tighter and further round as it
  // rises, and never outside the severity's own band at any position.
  const radius =
    vocab.radius.min +
    (vocab.radius.max - vocab.radius.min) *
      challengeSkew(rng.next(), knobs.challenge, R.challenge.radius);
  const angle =
    vocab.angle.min +
    (vocab.angle.max - vocab.angle.min) *
      challengeSkew(rng.next(), knobs.challenge, R.challenge.angle);
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
