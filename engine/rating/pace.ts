// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PACE — how fast the stage is, and how much the speed MOVES.
//
// The second of those is the one that matters and the one a generator will
// never find by accident. A stage held at 110 km/h from the line to the
// gate is not a fast stage, it is a stage with one speed in it: the ear
// stops hearing the engine, the hands stop working, and nothing that
// happens is faster or slower than anything else that happened. What makes
// a rally stage read as fast is the corner that took it down to second and
// the kilometre afterwards that got it all back — a stage is fast because
// it was, a moment ago, slow.
//
// So `swing` — the spread of the speed profile against its own mean — is
// the trait this facet exists for, and the outright numbers are the
// context it is read in. Everything is measured off `analysis/speed.ts`'s
// reference car rather than off a bot run, on purpose: the question here is
// what the ROAD allows, and a bot's lap is a driver's answer to it. When
// the two disagree, `make sim` is the one that is right about the game and
// this is the one that is right about the road.

import { RATING } from "./scales.ts";
import { spread, type Walk } from "./walk.ts";
import { facetScore, trait, traitNotes, type Facet, type Note, type Trait } from "./types.ts";

const KMH = 3.6;

export function ratePace(walk: Walk): Facet {
  const started = Date.now();
  const P = RATING.pace;
  const speeds: number[] = [];
  for (let i = 0; i <= walk.end; i++) speeds.push(walk.speed[i]);

  const { mean, sd } = spread(speeds);
  // The stage's own top, found before anything is scored against it.
  let top = 0;
  let slowest = Infinity;
  let slowestAt = 0;
  for (let i = 0; i <= walk.end; i++) {
    if (walk.speed[i] > top) top = walk.speed[i];
    if (walk.speed[i] < slowest) {
      slowest = walk.speed[i];
      slowestAt = walk.track.samples[i].s;
    }
  }
  if (!Number.isFinite(slowest)) slowest = 0;

  // FLAT OUT FOR THIS STAGE, not for the car. Measured against the
  // reference car's own ceiling the whole sweep came back at two to five per
  // cent, which is a fact about the car — nothing on a rally road reaches a
  // straight-line top speed. Against the stage's own fastest point it is a
  // fact about the road: how much of it is spent at the pace it is capable
  // of, which is the thing that separates a blast from a stage with one
  // long straight on it.
  const flatOutAbove = top * P.flatOutOf;
  let flatOut = 0;
  for (let i = 0; i <= walk.end; i++) if (walk.speed[i] >= flatOutAbove) flatOut++;
  const flatOutShare = walk.end > 0 ? flatOut / (walk.end + 1) : 0;

  const brakings = brakingZones(walk);

  const traits: Trait[] = [
    // A GUARD rather than a chooser: the whole 144-stage sweep came out
    // between 87 and 113 km/h, so this band is not separating seeds — it is
    // there to fail loudly the day a change puts a stage outside what the
    // sport calls a stage. Weighted as a guard so it is not spending a full
    // trait's worth of the facet on a number nothing fails.
    trait("pace.mean", "the pace the stage is driven at", "km/h", mean * KMH, P.mean, 0.55),
    trait(
      "pace.swing",
      "how much the speed moves, against its own mean",
      "share",
      mean > 1 ? sd / mean : 0,
      P.swing,
      1.25,
    ),
    trait("pace.slowest", "the slowest the stage ever gets", "km/h", slowest * KMH, P.slowest, 1.0),
    trait(
      "pace.brakings",
      "heavy braking zones a kilometre",
      "/km",
      brakings.count / walk.km,
      P.brakings,
      0.9,
    ),
    trait("pace.flatOut", "share of it held flat out", "share", flatOutShare, P.flatOut, 0.8),
  ];

  const notes: Note[] = traitNotes(traits, sayPace);
  notes.push({
    code: "pace.slowest",
    sense: "note",
    message: `slowest point is ${(slowest * KMH).toFixed(0)} km/h`,
    s: slowestAt,
    value: slowest * KMH,
  });
  if (brakings.hardest > 0) {
    notes.push({
      code: "pace.hardest",
      sense: "note",
      message: `biggest shed of speed is ${(brakings.hardest * KMH).toFixed(0)} km/h`,
      s: brakings.hardestAt,
      value: brakings.hardest * KMH,
    });
  }

  return {
    id: "pace",
    label: "pace",
    score: facetScore(traits),
    weight: RATING.weights.pace,
    traits,
    notes,
    stats: {
      topKmh: Math.round(top * KMH),
      meanKmh: Math.round(mean * KMH),
      slowestKmh: Math.round(slowest * KMH),
      swing: Math.round((mean > 1 ? sd / mean : 0) * 1000) / 1000,
      brakings: brakings.count,
      hardestShedKmh: Math.round(brakings.hardest * KMH),
    },
    ms: Date.now() - started,
  };
}

function sayPace(t: Trait): string {
  const short = t.verdict === "thin";
  switch (t.id) {
    case "pace.mean":
      return short
        ? `averages ${t.value.toFixed(0)} km/h — slow going`
        : `averages ${t.value.toFixed(0)} km/h — barely off the throttle`;
    case "pace.swing":
      return short
        ? `one speed the whole way (swing ${t.value.toFixed(2)}) — nothing to be fast AGAINST`
        : `never settles at any speed (swing ${t.value.toFixed(2)})`;
    case "pace.slowest":
      return short
        ? `crawls to ${t.value.toFixed(0)} km/h somewhere — nearly a stop`
        : `slowest corner is still ${t.value.toFixed(0)} km/h — no second-gear moment`;
    case "pace.brakings":
      return short
        ? `${t.value.toFixed(1)} braking zones a km — the brakes are decoration`
        : `${t.value.toFixed(1)} braking zones a km — a stage spent stopping`;
    default:
      return short
        ? `only ${(t.value * 100).toFixed(0)}% of it is flat out`
        : `${(t.value * 100).toFixed(0)}% of it is flat out — a bypass`;
  }
}

/** THE BRAKING ZONES: every run where the reference car's speed falls by at
 * least `brakeDrop` before it starts rising again.
 *
 * Counted as runs rather than as samples for the obvious reason and one
 * less obvious one: a long descending sweeper sheds speed continuously over
 * four hundred metres and is not a braking zone at all, so the run has to
 * be bounded by the speed turning round rather than by a distance. What
 * comes back is a count of the places a pacenote would be read. */
function brakingZones(walk: Walk): {
  count: number;
  hardest: number;
  hardestAt: number;
} {
  let count = 0;
  let hardest = 0;
  let hardestAt = 0;
  let peak = walk.speed[0] ?? 0;
  let peakAt = 0;
  let falling = false;

  for (let i = 1; i <= walk.end; i++) {
    const now = walk.speed[i];
    const before = walk.speed[i - 1];
    if (now < before) {
      falling = true;
      continue;
    }
    if (falling) {
      const shed = peak - before;
      if (shed >= RATING.pace.brakeDrop) {
        count++;
        if (shed > hardest) {
          hardest = shed;
          hardestAt = walk.track.samples[peakAt].s;
        }
      }
      falling = false;
    }
    peak = now;
    peakAt = i;
  }
  if (falling) {
    const shed = peak - walk.speed[walk.end];
    if (shed >= RATING.pace.brakeDrop) {
      count++;
      if (shed > hardest) {
        hardest = shed;
        hardestAt = walk.track.samples[peakAt].s;
      }
    }
  }
  return { count, hardest, hardestAt };
}
