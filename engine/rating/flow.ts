// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// FLOW — what the road asks of the hands.
//
// The first thing anybody says about a rally stage is its shape: fast and
// open, or tight and technical, or — the one worth building — a stage that
// is both in turn. That is what this facet measures, and every trait in it
// is a band rather than a target because both ends of every one of them is
// a stage nobody finishes twice.
//
// Two of the traits here are not about the corners at all, and they are the
// two rally level-design practice is loudest about.
//
//   SIGHTLINE. What makes a corner hard is not its angle: it is speed,
//   width, grip and VISIBILITY together, and a light curve can be as
//   dangerous as a hairpin depending on what is in front of it and what
//   comes after. A blind crest with a bend behind it is the single most
//   rally thing a road does — Finland is famous for exactly that — and it
//   is invisible to every corner-counting measure ever written.
//
//   SECTIONS. A stretch of stage with one character has to last long enough
//   for the player to adapt to it. Under twenty seconds it reads as
//   arbitrary; a minute is the figure to aim at. A stage that changes its
//   mind every eight seconds has no sections in it, only events.
//
// The trait that carries the most and is the easiest to miss is
// `severityMix`. A stage can have exactly the right number of corners per
// kilometre and be unbearable because every one of them is the same corner:
// the hands learn it in the first two hundred metres and the remaining four
// kilometres are that. Density says how much there is; the mix says whether
// there is more than one thing.

import { ANALYSIS } from "../analysis/budgets.ts";
import { RATING } from "./scales.ts";
import { effectiveKinds, segmentSpans, type Corner, type Walk } from "./walk.ts";
import { facetScore, trait, traitNotes, type Facet, type Note, type Trait } from "./types.ts";

export function rateFlow(walk: Walk): Facet {
  const started = Date.now();
  const F = RATING.flow;
  const corners = walk.corners;

  const counts = { soft: 0, medium: 0, hard: 0 };
  let cornerMetres = 0;
  for (const corner of corners) {
    counts[corner.severity]++;
    cornerMetres += corner.length;
  }

  let switches = 0;
  for (let i = 1; i < corners.length; i++) {
    if (corners[i].dir !== corners[i - 1].dir) switches++;
  }

  const straightShare = Math.max(0, 1 - cornerMetres / walk.distance);
  const quiet = quietRun(walk);
  const sight = sightlines(walk);
  const sections = sectionLengths(walk);

  const traits: Trait[] = [
    trait("flow.corners", "corners a kilometre", "/km", corners.length / walk.km, F.corners, 1.0),
    trait(
      "flow.hairpins",
      "share of the corners that need the car slowed and pointed",
      "share",
      corners.length > 0 ? counts.hard / corners.length : 0,
      F.hairpins,
      1.0,
    ),
    trait(
      "flow.severityMix",
      "how many kinds of corner it really has",
      "kinds",
      effectiveKinds([counts.soft, counts.medium, counts.hard]),
      F.severityMix,
      1.1,
    ),
    trait(
      "flow.switches",
      "share of the corner-to-corner links that change direction",
      "share",
      corners.length > 1 ? switches / (corners.length - 1) : 0,
      F.switches,
      0.9,
    ),
    trait(
      "flow.straightShare",
      "share of the stage not turning",
      "share",
      straightShare,
      F.straightShare,
      0.8,
    ),
    trait(
      "flow.quietRun",
      "the longest stretch where nothing happens",
      "m",
      quiet.length,
      F.quietRun,
      0.7,
    ),
    trait(
      "flow.blind",
      "share of it committed to before it can be seen",
      "share",
      sight.blindShare,
      F.blind,
      1.05,
    ),
    trait(
      "flow.sections",
      "how long the stage holds one character",
      "s",
      sections.mean,
      F.sections,
      0.95,
    ),
  ];

  const notes: Note[] = traitNotes(traits, sayFlow);
  if (quiet.length > F.quietRun.max) {
    notes.push({
      code: "flow.quietRun",
      sense: "much",
      message: `${quiet.length.toFixed(0)} m with nothing in it`,
      s: quiet.s,
      value: quiet.length,
    });
  }
  if (sight.blindest) {
    notes.push({
      code: "flow.blind",
      sense: "note",
      message: `blindest corner is entered with ${sight.blindest.sight.toFixed(0)} m of road in sight`,
      s: sight.blindest.s,
      value: sight.blindest.sight,
    });
  }
  const hairpin = tightest(corners);
  if (hairpin) {
    notes.push({
      code: "flow.tightest",
      sense: "note",
      message: `tightest corner is ${hairpin.radius.toFixed(0)} m radius through ${((hairpin.angle * 180) / Math.PI).toFixed(0)}°`,
      s: hairpin.s,
      value: hairpin.radius,
    });
  }

  return {
    id: "flow",
    label: "flow",
    score: facetScore(traits),
    weight: RATING.weights.flow,
    traits,
    notes,
    stats: {
      corners: corners.length,
      soft: counts.soft,
      medium: counts.medium,
      hard: counts.hard,
      switches,
      cornerMetres: Math.round(cornerMetres),
      tightestRadius: hairpin ? Math.round(hairpin.radius) : 0,
      tightestNote: hairpin ? hairpin.note : 10,
      sightline: Math.round(sight.mean),
      blindCorners: sight.blind,
      sections: sections.count,
      sectionSeconds: Math.round(sections.mean),
    },
    ms: Date.now() - started,
  };
}

function sayFlow(t: Trait): string {
  const short = t.verdict === "thin";
  switch (t.id) {
    case "flow.corners":
      return short
        ? `${t.value.toFixed(1)} corners a km — a road between two places`
        : `${t.value.toFixed(1)} corners a km — no room to do anything but turn`;
    case "flow.hairpins":
      return short
        ? `only ${(t.value * 100).toFixed(0)}% of the corners are hard ones`
        : `${(t.value * 100).toFixed(0)}% of the corners are hard ones — relentless`;
    case "flow.severityMix":
      return `only ${t.value.toFixed(1)} kinds of corner on the whole stage — they are all the same one`;
    case "flow.switches":
      return short
        ? `only ${(t.value * 100).toFixed(0)}% of the corners change direction — the road spirals`
        : `${(t.value * 100).toFixed(0)}% of the corners change direction — it never settles`;
    case "flow.blind":
      return short
        ? `nothing on it is hidden — every corner is visible before it has to be committed to`
        : `${(t.value * 100).toFixed(0)}% of it is committed to blind — memorization, not driving`;
    case "flow.sections":
      return short
        ? `its character changes every ${t.value.toFixed(0)} s — sections too short to adapt to`
        : `${t.value.toFixed(0)} s between changes — long enough to stop being a section`;
    case "flow.straightShare":
      return short
        ? `only ${(t.value * 100).toFixed(0)}% of it is not a corner`
        : `${(t.value * 100).toFixed(0)}% of it is not a corner — a transport section with turns at the ends`;
    default:
      return short
        ? `nowhere to breathe — the longest quiet stretch is ${t.value.toFixed(0)} m`
        : `${t.value.toFixed(0)} m of nothing`;
  }
}

function tightest(corners: Corner[]): Corner | null {
  let best: Corner | null = null;
  for (const corner of corners) {
    if (!best || corner.radius < best.radius) best = corner;
  }
  return best;
}

/** THE LONGEST STRETCH WHERE NOTHING HAPPENS, and where it starts.
 *
 * "Something" is anything a co-driver would call: a corner past the soft
 * bucket, a jump and its ground, a crest, water under the car, a bore, and
 * a junction platform. Soft corners deliberately do not count — a long
 * sweeper at speed is a rest, and calling it an event is how a stage with
 * two kilometres of gentle curve scores as eventful. */
function quietRun(walk: Walk): { length: number; s: number } {
  const samples = walk.track.samples;
  const busy = new Array<boolean>(walk.end + 1).fill(false);

  for (const corner of walk.corners) {
    if (corner.severity === "soft") continue;
    for (let i = corner.from; i <= Math.min(walk.end, corner.to); i++) busy[i] = true;
  }
  for (let i = 0; i <= walk.end; i++) {
    if (walk.feature[i]) busy[i] = true;
    const sample = samples[i];
    if (sample.flat > 0.05 || sample.tunnel || sample.deck !== null) busy[i] = true;
    if (sample.surface === "water") busy[i] = true;
  }
  const spans = segmentSpans(walk.track);
  const crests = spans.filter((_, i) => walk.track.segments[i].feature === "crest");
  for (let i = 0; i <= walk.end; i++) {
    const s = samples[i].s;
    if (crests.some((span) => s >= span.from && s <= span.to)) busy[i] = true;
    if (walk.track.culverts.some((culvert) => Math.abs(s - culvert.s) < 12)) busy[i] = true;
  }
  let best = 0;
  let bestAt = 0;
  let runFrom = 0;
  for (let i = 0; i <= walk.end; i++) {
    if (!busy[i]) continue;
    const length = samples[i].s - samples[runFrom].s;
    if (length > best) {
      best = length;
      bestAt = samples[runFrom].s;
    }
    runFrom = i;
  }
  const tail = samples[walk.end].s - samples[runFrom].s;
  if (tail > best) {
    best = tail;
    bestAt = samples[runFrom].s;
  }
  return { length: best, s: bestAt };
}

/** HOW FAR AHEAD THE ROAD CAN BE SEEN, and which corner is entered
 * blindest.
 *
 * Marched forward from each probe along the road itself, stopping at the
 * first of two things: the road swinging further off the driver's forward
 * line than `SIGHT_OFFSET`, or a crest standing between the eye and it. The
 * crest test is a plain line-of-sight — the ray from the eye to a point of
 * road ahead is blocked if any road between the two stands above it.
 *
 * The bend test is a LATERAL OFFSET rather than an angle, and the first
 * sweep is why: a cone measured in degrees is far too tight at ten metres
 * and absurdly generous at three hundred, where sixty degrees is a hundred
 * and seventy metres of sideways. What actually takes a road out of sight
 * round a bend is it going far enough to one side to be behind whatever is
 * on the inside of the corner, and that is a distance.
 *
 * The road's own surface only — no trees and no cutting walls. Vegetation
 * closes a sightline too, and measuring that means a ray march through the
 * trunk field per probe per station, which is minutes rather than
 * milliseconds. What is left is the half a stage is REMEMBERED for anyway:
 * a bend hidden behind a brow. `scenery.enclosure` carries the other half. */
const SIGHT_OFFSET = 45;
const EYE_HEIGHT = 1.15;
const SIGHT_MAX = 420;

function sightlines(walk: Walk): {
  mean: number;
  blindShare: number;
  blind: number;
  blindest: { s: number; sight: number } | null;
} {
  const samples = walk.track.samples;
  const sight = new Array<number>(samples.length).fill(0);

  for (const i of walk.probes) {
    const here = samples[i];
    const eye = here.elevation + EYE_HEIGHT;
    let reach = 0;
    // The steepest rise the sight ray has had to clear so far: once a brow
    // has lifted the ray, everything beyond it has to clear the SAME ray,
    // which is what makes a crest hide the dip behind it rather than only
    // its own top.
    let horizon = -Infinity;
    for (let k = i + 1; k <= walk.end; k++) {
      const ahead = samples[k];
      const run = ahead.s - here.s;
      if (run > SIGHT_MAX) break;
      // How far the road ahead has swung off the line the driver is
      // looking down: the component of the offset across the heading.
      const lateral = Math.abs(
        (ahead.x - here.x) * Math.cos(here.heading) - (ahead.z - here.z) * Math.sin(here.heading),
      );
      if (lateral > SIGHT_OFFSET) break;
      const slope = (ahead.elevation - eye) / Math.max(1e-3, run);
      if (slope < horizon) break;
      horizon = slope;
      reach = run;
    }
    sight[i] = reach;
  }

  let sum = 0;
  for (const i of walk.probes) sum += sight[i];
  const mean = walk.probes.length > 0 ? sum / walk.probes.length : 0;

  // COMMITTED BLIND: the driver has to start shedding speed for what is
  // ahead before the road that demands it comes into view. Real stage
  // design says a driver should be able to see the apex or the exit early
  // enough to pick a line, so this is that rule read as a fraction of the
  // stage — and unlike a mean sight distance (which on any twisty road is
  // just the distance to the next bend, and came back inside fifteen metres
  // across a whole sweep) it separates one stage from another.
  let committed = 0;
  for (const i of walk.probes) {
    const here = walk.speed[i];
    let slowest = here;
    for (let k = i + 1; k <= walk.end; k++) {
      if (samples[k].s - samples[i].s > SIGHT_MAX) break;
      if (walk.speed[k] < slowest) slowest = walk.speed[k];
    }
    if (slowest >= here) continue;
    const needed = (here * here - slowest * slowest) / (2 * ANALYSIS.drive.brake);
    if (sight[i] < needed) committed++;
  }
  const blindShare = walk.probes.length > 0 ? committed / walk.probes.length : 0;

  // A corner is entered BLIND when the road cannot be seen as far as the
  // corner's own entry from the braking point in front of it — the driver
  // is committing to a corner they have not seen.
  let blind = 0;
  let blindest: { s: number; sight: number } | null = null;
  for (const corner of walk.corners) {
    if (corner.severity === "soft") continue;
    const approach = Math.max(0, corner.from - Math.round(60 / walk.track.step));
    let nearest = Infinity;
    for (let k = approach; k <= corner.from; k++) {
      if (sight[k] <= 0) continue;
      const toCorner = samples[corner.from].s - samples[k].s;
      if (sight[k] < toCorner) nearest = Math.min(nearest, sight[k]);
    }
    if (!Number.isFinite(nearest)) continue;
    blind++;
    if (!blindest || nearest < blindest.sight) blindest = { s: corner.s, sight: nearest };
  }
  return { mean, blindShare, blind, blindest };
}

/** HOW LONG THE STAGE HOLDS ONE CHARACTER, seconds.
 *
 * The stage is cut into `sampling.windowSeconds` places (`walk.windows`),
 * each is called BUSY or CALM by whether more than half of it is spent
 * turning past the soft bucket, and a section is a run of places that agree.
 * What comes back is the mean length of those runs in seconds — the number
 * rally level design puts a floor of twenty under, and a target of sixty
 * on. */
function sectionLengths(walk: Walk): { mean: number; count: number } {
  const samples = walk.track.samples;
  const busy = new Array<boolean>(samples.length).fill(false);
  for (const corner of walk.corners) {
    if (corner.severity === "soft") continue;
    for (let i = corner.from; i <= Math.min(walk.end, corner.to); i++) busy[i] = true;
  }

  const runs: number[] = [];
  let current: boolean | null = null;
  let from = 0;
  for (const window of walk.windows) {
    let turning = 0;
    for (let i = window.from; i <= window.to; i++) if (busy[i]) turning++;
    const kind = turning * 2 > window.to - window.from;
    if (current === null) {
      current = kind;
      from = window.from;
      continue;
    }
    if (kind === current) continue;
    runs.push(samples[window.from].s - samples[from].s);
    current = kind;
    from = window.from;
  }
  runs.push(samples[walk.end].s - samples[from].s);

  let paceSum = 0;
  for (let i = 0; i <= walk.end; i++) paceSum += walk.speed[i];
  const pace = Math.max(8, paceSum / Math.max(1, walk.end + 1));
  const mean = runs.length > 0 ? runs.reduce((a, b) => a + b, 0) / runs.length / pace : 0;
  return { mean, count: runs.length };
}
