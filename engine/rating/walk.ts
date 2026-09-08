// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// READING THE ROAD ONCE — the shared walk of a stage that every facet asks
// its questions of.
//
// Five of the six facets need the same four things: which samples are on
// the timed stage, how fast the car is there, where the corners are, and
// how steep the road is under it. Computing those per facet would be five
// answers to the same question and five chances for two of them to disagree
// about where a corner starts, so they are computed here, once, and handed
// round.
//
// THE CORNERS ARE READ OFF THE ROAD ON A REAL PACENOTE SCALE, NOT OFF THE
// PLAN. `SegmentPlan` knows
// which R3 bucket each drawn turn came from, and that is the wrong list for
// this: a stage that turns onto a public road (R17) drives that road's own
// bends, and R3 explicitly does not govern them — so a plan-based count
// hands back a stage with a kilometre of curves in it and calls it a
// straight. What a driver meets is a run of curvature, whoever drew it, and
// its severity is what its radius says it is against R3's own vocabulary.

import { STAGE_RULES, type TurnSeverity } from "../mapgen/rules.ts";
import type { Track } from "../mapgen/compile.ts";
import { speedProfile } from "../analysis/speed.ts";
import { RATING } from "./scales.ts";

/** A corner AS DRIVEN: one run of curvature the same way round, with what
 * the road is doing underneath it. */
export type Corner = {
  /** First and last sample index of the run, inclusive. */
  from: number;
  to: number;
  s: number;
  endS: number;
  /** Arc length of the corner itself, m. */
  length: number;
  /** +1 grows the heading, matching `Pacenote.dir`. */
  dir: 1 | -1;
  severity: TurnSeverity;
  /** Its number on the pacenote scale, 1 (hairpin) to 10 (nearly flat). */
  note: number;
  /** Total heading change through it, rad. */
  angle: number;
  /** The tightest radius anywhere in the run, m — what the corner is
   * remembered as, and what its severity is read off. A corner that eases
   * out of a hairpin is a hairpin. */
  radius: number;
  /** Mean gradient through it, signed, m per m. */
  grade: number;
  /** Share of its metres banked AGAINST the turn (R19 rolls the cross-fall
   * into the corner, so anything left running the other way is either a
   * runoff still rolling out or a road on a hillside). */
  offCamber: number;
  /** The slowest the reference car is through it, m/s. */
  speed: number;
};

export type Window = { from: number; to: number };

export type Walk = {
  track: Track;
  /** The TIMED stage, m: the road up to the finish gate, never the run-out.
   * A circuit's whole road is timed; a sprint's last 220 m are not, and
   * counting them puts a phantom straight on the end of every stage. */
  distance: number;
  km: number;
  /** The last sample index inside the timed stage. */
  end: number;
  /** Sample indices the facets probe, at `RATING.sampling.stride`. */
  probes: number[];
  /** The reference car's speed at EVERY sample, m/s. */
  speed: number[];
  /** Signed road gradient at every sample, m per m. */
  grade: number[];
  /** True where a FEATURE owns the road rather than the road being the
   * feature: a jump's run-up, ramp, lip and landing, and R36's level
   * crossing with its two ramps. Every measurement of what the road does to
   * the car steps over these for `analysis/drive.ts`'s reason — the public
   * road stands on a formation and the rally climbs onto it, so read as
   * ordinary road a crossing is a 20% grade and a heave over budget every
   * single time.
   *
   * Leaving the crossings out cost the first calibration sweep two of its
   * numbers: a steepest sustained grade of 211% and an undulation of 93
   * m/s², both of them one railway ramp being met at rally pace. */
  feature: boolean[];
  corners: Corner[];
  /** The stage cut into `RATING.sampling.window` stretches — what anything
   * asking how much the stage VARIES measures over. */
  windows: Window[];
};

/** THE PACENOTE SCALE, as radii in metres — the ten severities a real
 * co-driver calls, tightest first (therallydriver.com's numbering, the one
 * the WRC stage-analysis work uses because it is the only common scale that
 * pins each number to a RADIUS rather than to a feel).
 *
 * It is here rather than in `scales.ts` because it is not a threshold this
 * project chose: it is the vocabulary the sport already has, and a corner's
 * severity is a fact about its radius. Reading corners on it rather than on
 * R3's three buckets matters for two reasons — R3 does not govern a
 * borrowed public road's own bends (R17) and never sees them, and three
 * buckets cannot tell a 20 m hairpin from a 30 m tight left, which is most
 * of the difference between two stages that count the same corners. */
export const PACENOTE_RADII = [10, 15, 20, 27.5, 35, 45, 60, 77.5, 100, 175] as const;

/** Where a radius sits on it, 1 (hairpin) to 10 (nearly flat). */
export function pacenoteSeverity(radius: number): number {
  for (let i = 0; i < PACENOTE_RADII.length; i++) {
    if (radius <= PACENOTE_RADII[i]) return i + 1;
  }
  return PACENOTE_RADII.length;
}

/** ...and which of R3's three names that number answers to, so the
 * generator's own vocabulary and the co-driver's agree about a corner.
 * The cuts fall on the scale's own radii: 1-4 (10-27.5 m) is the tight
 * stuff a car is slowed and pointed for, 5-7 (35-60 m) is a real corner,
 * 8-10 (77.5-175 m) is a bend taken in a high gear. Read off the TIGHTEST
 * point of the run rather than its mean — a corner that eases out of a
 * hairpin is a hairpin. */
function severityOf(radius: number): TurnSeverity {
  const note = pacenoteSeverity(radius);
  if (note <= 4) return "hard";
  if (note <= 7) return "medium";
  return "soft";
}

/** The loosest radius that still gets a call, m — the top of the pacenote
 * scale. Above it the road is a straight with a lean on it, which is why
 * the scale stops there.
 *
 * It is well past R3's own widest drawn turn (`turn.soft.radius.max`) on
 * purpose: the rally's roads are not the only roads on the stage, and a
 * kilometre of borrowed tarmac curve is a kilometre a driver spends
 * turning whoever drew it. */
const CORNER_RADIUS = PACENOTE_RADII[PACENOTE_RADII.length - 1];

/** How short a run of curvature has to be to be discarded, m. Below this
 * it is the ribbon easing between two straights rather than a corner. */
const MIN_CORNER = 14;

/** How much straight road two same-direction runs may have between them and
 * still be one corner, m — the distance the WRC stage-analysis work treats
 * as "nearby" when it decides whether two bends are one feature. A corner
 * that eases and re-tightens is one corner; the same two arcs fifty metres
 * apart are a pair, and a co-driver calls them as a pair. */
const CORNER_GAP = 25;

export function walkStage(track: Track): Walk {
  const samples = track.samples;
  const distance = track.finishS ?? track.length;
  let end = samples.length - 1;
  while (end > 0 && samples[end].s > distance) end--;

  const speed = speedProfile(track);
  const grade = new Array<number>(samples.length).fill(0);
  for (let i = 1; i < samples.length - 1; i++) {
    const run = Math.max(1e-3, samples[i + 1].s - samples[i - 1].s);
    grade[i] = (samples[i + 1].elevation - samples[i - 1].elevation) / run;
  }

  const feature = new Array<boolean>(samples.length).fill(false);
  const runUp = Math.ceil((STAGE_RULES.jump.runUp + STAGE_RULES.jump.rampLength.max) / track.step);
  const landing = Math.ceil(STAGE_RULES.jump.landing / track.step);
  for (let i = 0; i <= end; i++) {
    if (!samples[i].jump) continue;
    for (let k = Math.max(0, i - runUp); k <= Math.min(end, i + landing); k++) feature[k] = true;
  }
  // Bounded by the RAMP — the arc the compiler raises the road over, which
  // is the graded top plus `crossing.ramp` of gravel either side. Not by
  // `flat`, which stops at the platform's rim and leaves the steep part
  // reported.
  for (const junction of track.junctions) {
    if (!junction.crossing) continue;
    const reach = 0.72 * junction.spread + STAGE_RULES.crossing.ramp;
    for (let i = 0; i <= end; i++) {
      if (Math.abs(samples[i].s - junction.s) > reach) continue;
      for (let k = Math.max(0, i - 1); k <= Math.min(end, i + 1); k++) feature[k] = true;
    }
  }

  const probes: number[] = [];
  for (let i = 0; i <= end; i += RATING.sampling.stride) probes.push(i);

  // THE WINDOW IS A TIME, NOT A DISTANCE. A section of stage that lasts
  // under twenty seconds reads as arbitrary rather than as a place — the
  // player has not adapted to it before it is over — so "a part of the
  // stage" has to be measured in seconds of driving, and a fixed number of
  // metres is a different amount of stage on a 60 km/h mountain road and on
  // a 140 km/h forest blast.
  let paceSum = 0;
  for (let i = 0; i <= end; i++) paceSum += speed[i];
  const pace = Math.max(8, paceSum / Math.max(1, end + 1));
  const windows: Window[] = [];
  const span = Math.max(1, Math.round((RATING.sampling.windowSeconds * pace) / track.step));
  for (let from = 0; from <= end; from += span) {
    windows.push({ from, to: Math.min(end, from + span - 1) });
  }
  // A last stretch shorter than half a window is the tail of the one before
  // it, not a place of its own — measuring the spread of the stage over a
  // 40 m offcut is measuring the offcut.
  if (windows.length > 1) {
    const last = windows[windows.length - 1];
    if (last.to - last.from < span / 2) {
      windows[windows.length - 2].to = last.to;
      windows.pop();
    }
  }

  return {
    track,
    distance,
    km: Math.max(1e-3, distance / 1000),
    end,
    probes,
    speed,
    grade,
    feature,
    corners: findCorners(track, end, speed, grade),
    windows,
  };
}

function findCorners(track: Track, end: number, speed: number[], grade: number[]): Corner[] {
  const samples = track.samples;
  const threshold = 1 / CORNER_RADIUS;
  const runs: { from: number; to: number; dir: 1 | -1 }[] = [];

  for (let i = 0; i <= end; i++) {
    const curvature = samples[i].curvature;
    if (Math.abs(curvature) < threshold) continue;
    const dir: 1 | -1 = curvature > 0 ? 1 : -1;
    const open = runs[runs.length - 1];
    const gap = open ? samples[i].s - samples[open.to].s : Infinity;
    if (open && open.dir === dir && gap <= CORNER_GAP) open.to = i;
    else runs.push({ from: i, to: i, dir });
  }

  const corners: Corner[] = [];
  for (const run of runs) {
    const length = samples[run.to].s - samples[run.from].s;
    if (length < MIN_CORNER) continue;

    let angle = 0;
    let tightest = Infinity;
    let gradeSum = 0;
    let against = 0;
    let counted = 0;
    let slowest = Infinity;
    for (let i = run.from; i <= run.to; i++) {
      const step = i > run.from ? samples[i].s - samples[i - 1].s : 0;
      angle += Math.abs(samples[i].curvature) * step;
      const radius = 1 / Math.max(1e-6, Math.abs(samples[i].curvature));
      if (radius < tightest) tightest = radius;
      gradeSum += grade[i];
      // R19 banks a right-hand turn (curvature > 0) positive. Cross-fall
      // running the other way through a corner is the road tilting the car
      // off the road it is turning onto.
      if (samples[i].bank * run.dir < -1e-4) against++;
      counted++;
      if (speed[i] < slowest) slowest = speed[i];
    }

    corners.push({
      from: run.from,
      to: run.to,
      s: samples[run.from].s,
      endS: samples[run.to].s,
      length,
      dir: run.dir,
      severity: severityOf(tightest),
      note: pacenoteSeverity(tightest),
      angle,
      radius: tightest,
      grade: counted > 0 ? gradeSum / counted : 0,
      offCamber: counted > 0 ? against / counted : 0,
      speed: Number.isFinite(slowest) ? slowest : 0,
    });
  }
  return corners;
}

/** THE EFFECTIVE NUMBER OF KINDS in a set of shares — how many things this
 * stage really has, counting a thing it barely has as barely a thing.
 *
 * The perplexity of the distribution, `exp(H)`: three surfaces in even
 * thirds comes back as 3.0, three surfaces at 98/1/1 comes back as 1.1, and
 * one surface comes back as 1. Used wherever the question is "how mixed is
 * this" — the corner severities, the surfaces underfoot, the ground beside
 * the road.
 *
 * A NORMALIZED entropy was the obvious thing and it was wrong, in a way
 * only a picture caught. Normalized against the buckets PRESENT, a stage
 * with soil and a lake scores a perfect 1.0 for ground variety, exactly as
 * a stage with soil, rock, sand and ice does — the measure had quietly
 * become "of the kinds you have, are they evenly split", which every dull
 * stage in the sweep also passed. Normalized against the buckets POSSIBLE
 * it marks a taiga stage down for having no sand in it, which is a fact
 * about the country and not about the stage.
 *
 * The effective count is neither: it is a number of things, in units
 * anybody can argue with, and the band beside it is stated in the same
 * units. */
export function effectiveKinds(counts: number[]): number {
  const present = counts.filter((c) => c > 0);
  if (present.length <= 1) return present.length;
  const total = present.reduce((a, b) => a + b, 0);
  let h = 0;
  for (const count of present) {
    const p = count / total;
    h -= p * Math.log(p);
  }
  return Math.exp(h);
}

/** Mean and standard deviation of a sample set, in one pass. */
export function spread(values: number[]): { mean: number; sd: number } {
  if (values.length === 0) return { mean: 0, sd: 0 };
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let variance = 0;
  for (const v of values) variance += (v - mean) * (v - mean);
  return { mean, sd: Math.sqrt(variance / values.length) };
}

/** WHERE EACH PLANNED SEGMENT LIES ON THE STAGE, m. The features that are
 * not written onto a sample — a crest's brow, a ford's crossing kind, a
 * tunnel's bore — are properties of the PLAN, and the plan is a list of arc
 * lengths with no positions in it. This walks them into positions once.
 *
 * Which is also why nothing here re-derives a crest from the elevation
 * profile: a brow found by looking for a convex kink finds every rise the
 * rolling profile puts on a straight, and R8's crest is a thing the search
 * decided to put there. */
export function segmentSpans(track: Track): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = [];
  let s = 0;
  for (const segment of track.segments) {
    spans.push({ from: s, to: s + segment.length });
    s += segment.length;
  }
  return spans;
}
