// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RELIEF — the road going up and down, and what that does to a corner.
//
// Elevation is the half of a rally stage a map cannot show and the half
// everybody remembers. A corner is a different corner on a slope: the
// weight is off the front going up and on the nose coming down, the brow
// arrives before the apex does, and the road that was flat under the last
// one is now pushing or falling away. So this facet measures the vertical
// twice — once as the ground the stage crosses (`climb`, `steepest`), and
// once as WHAT IT DOES TO THE CORNERS (`steepCorners`, `offCamber`), which
// is the part that changes how the stage drives rather than how it looks.
//
// `undulation` is the third reading and the one closest to what a driver
// calls "a road that works": the vertical acceleration the road puts
// through the car at the speed it is met. It is small everywhere on a
// stage laid over a table, and it is what a crest, a compression and a
// dozen metres of nervous ground all show up in.

import { RATING } from "./scales.ts";
import { segmentSpans, type Walk } from "./walk.ts";
import { facetScore, trait, traitNotes, type Facet, type Note, type Trait } from "./types.ts";

export function rateRelief(walk: Walk): Facet {
  const started = Date.now();
  const R = RATING.relief;
  const samples = walk.track.samples;

  let climb = 0;
  let fall = 0;
  for (let i = 1; i <= walk.end; i++) {
    const rise = samples[i].elevation - samples[i - 1].elevation;
    if (rise > 0) climb += rise;
    else fall -= rise;
  }

  const crests = segmentSpans(walk.track).filter(
    (span, i) => walk.track.segments[i].feature === "crest" && span.from < walk.distance,
  ).length;

  let steepMetres = 0;
  let cornerMetres = 0;
  let camberMetres = 0;
  let steepestCorner: { s: number; grade: number } | null = null;
  for (const corner of walk.corners) {
    cornerMetres += corner.length;
    if (Math.abs(corner.grade) >= R.steepGrade) {
      steepMetres += corner.length;
      if (!steepestCorner || Math.abs(corner.grade) > Math.abs(steepestCorner.grade)) {
        steepestCorner = { s: corner.s, grade: corner.grade };
      }
    }
    camberMetres += corner.offCamber * corner.length;
  }

  const undulation = shakeRms(walk);
  const steepest = steepestRun(walk);

  const traits: Trait[] = [
    trait("relief.climb", "metres climbed a kilometre", "m/km", climb / walk.km, R.climb, 1.0),
    trait("relief.crests", "blind brows a kilometre", "/km", crests / walk.km, R.crests, 0.9),
    trait(
      "relief.steepCorners",
      "share of the corner metres taken on a slope",
      "share",
      cornerMetres > 0 ? steepMetres / cornerMetres : 0,
      R.steepCorners,
      1.15,
    ),
    trait(
      "relief.undulation",
      "how alive the road is under the car",
      "m/s²",
      undulation,
      R.undulation,
      1.0,
    ),
    trait(
      "relief.offCamber",
      "share of the corner metres banked the wrong way",
      "share",
      cornerMetres > 0 ? camberMetres / cornerMetres : 0,
      R.offCamber,
      // A guard on R19 rather than a chooser between seeds — the whole
      // sweep measures under one per cent of the corner metres. See the band.
      0.45,
    ),
    trait(
      "relief.steepest",
      "the steepest grade it holds for sixty metres",
      "m/m",
      steepest.grade,
      R.steepest,
      0.75,
    ),
  ];

  const notes: Note[] = traitNotes(traits, sayRelief);
  if (steepest.grade > 0) {
    notes.push({
      code: "relief.steepest",
      sense: "note",
      message: `steepest sustained run is ${(steepest.grade * 100).toFixed(0)}%${steepest.grade > 0 && steepest.down ? " downhill" : ""}`,
      s: steepest.s,
      value: steepest.grade,
    });
  }
  if (steepestCorner) {
    notes.push({
      code: "relief.steepCorner",
      sense: "note",
      message: `hardest corner-on-a-slope runs at ${(steepestCorner.grade * 100).toFixed(0)}%`,
      s: steepestCorner.s,
      value: steepestCorner.grade,
    });
  }

  return {
    id: "relief",
    label: "relief",
    score: facetScore(traits),
    weight: RATING.weights.relief,
    traits,
    notes,
    stats: {
      climb: Math.round(climb),
      fall: Math.round(fall),
      // The stage's own TILT: what it does over its whole length, which is
      // the difference between a mountain descent and a road that goes up
      // and comes back down again. Not a trait — neither end of it is
      // wrong, and a campaign wants one of each.
      netDrop: Math.round(samples[0].elevation - samples[walk.end].elevation),
      crests,
      undulation: Math.round(undulation * 100) / 100,
      steepest: Math.round(steepest.grade * 1000) / 1000,
    },
    ms: Date.now() - started,
  };
}

function sayRelief(t: Trait): string {
  const short = t.verdict === "thin";
  switch (t.id) {
    case "relief.climb":
      return short
        ? `${t.value.toFixed(0)} m of climb a km — laid on a table`
        : `${t.value.toFixed(0)} m of climb a km — a staircase`;
    case "relief.crests":
      return short
        ? `${t.value.toFixed(1)} brows a km — you can see everything coming`
        : `${t.value.toFixed(1)} brows a km — the road is a rollercoaster`;
    case "relief.steepCorners":
      return short
        ? `only ${(t.value * 100).toFixed(0)}% of the corner metres are on a slope — the hard things are kept apart`
        : `${(t.value * 100).toFixed(0)}% of the corner metres are on a slope — never a flat corner`;
    case "relief.undulation":
      return short
        ? `the road is flat under the car (${t.value.toFixed(1)} m/s²)`
        : `the car never settles (${t.value.toFixed(1)} m/s²)`;
    case "relief.offCamber":
      return short
        ? `every corner is banked into the turn — no drama anywhere`
        : `${(t.value * 100).toFixed(0)}% of the corner metres are banked the wrong way — a road nobody built`;
    default:
      return short
        ? `never steeper than ${(t.value * 100).toFixed(0)}% for any distance`
        : `holds ${(t.value * 100).toFixed(0)}% for sixty metres — a climb, not a road`;
  }
}

/** HOW ALIVE THE ROAD IS: the RMS of the vertical acceleration the road's
 * own curvature puts through a car crossing it at the reference speed.
 *
 * The road's vertical shape is a curve in `elevation` against `s`; a car
 * following it at v feels v² times that curve's second derivative. That is
 * why the measurement has to be taken at SPEED rather than as a geometric
 * roughness: the same brow is a lift at 140 km/h and nothing at all at 50,
 * and a stage is judged by the one it is driven at.
 *
 * Jumps are stepped over (`walk.feature`) — a ramp read as road is an
 * enormous number every time and says nothing about the road between them. */
function shakeRms(walk: Walk): number {
  const samples = walk.track.samples;
  let sum = 0;
  let counted = 0;
  for (let i = 1; i < walk.end; i++) {
    if (walk.feature[i]) continue;
    const back = Math.max(1e-3, samples[i].s - samples[i - 1].s);
    const forward = Math.max(1e-3, samples[i + 1].s - samples[i].s);
    const curve =
      (2 *
        (samples[i - 1].elevation * forward -
          samples[i].elevation * (back + forward) +
          samples[i + 1].elevation * back)) /
      (back * forward * (back + forward));
    const accel = curve * walk.speed[i] * walk.speed[i];
    sum += accel * accel;
    counted++;
  }
  return counted > 0 ? Math.sqrt(sum / counted) : 0;
}

/** The steepest grade the road holds over a sixty-metre window — the run a
 * car is actually climbing or dropping, as opposed to the single steepest
 * pair of samples, which on a rolled profile is always the top of some
 * bump. */
function steepestRun(walk: Walk): { grade: number; s: number; down: boolean } {
  const samples = walk.track.samples;
  const span = Math.max(1, Math.round(60 / walk.track.step));
  let best = 0;
  let at = 0;
  let down = false;
  for (let i = 0; i + span <= walk.end; i++) {
    if (walk.feature[i] || walk.feature[i + span]) continue;
    const run = Math.max(1e-3, samples[i + span].s - samples[i].s);
    const rise = samples[i + span].elevation - samples[i].elevation;
    const grade = Math.abs(rise) / run;
    if (grade > best) {
      best = grade;
      at = samples[i].s;
      down = rise < 0;
    }
  }
  return { grade: best, s: at, down };
}
