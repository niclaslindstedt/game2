// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHAPE OF A RALLY RATING: what a trait is, what it may say, and how
// the traits add up to a stage's character.
//
// `analysis/` and this module ask two different questions about the same
// road, and keeping them apart is the whole point of there being two.
//
//   ANALYSIS asks IS IT BROKEN. Its unit is a CHECK, its verdict is a
//   defect, and its ideal is a stage it has nothing to say about. Every
//   threshold there is a BUDGET — a ceiling, with everything under it
//   equally fine.
//
//   RATING asks IS IT ANY GOOD. Its unit is a TRAIT, its verdict is a
//   quality the stage has too little or too much of, and there is no such
//   thing as a stage it has nothing to say about — a road with no corners
//   scores as badly as a road that is nothing but corners. Every threshold
//   here is a BAND, with a floor as well as a ceiling, because that is what
//   separates a rally stage from a road that merely works.
//
// So a stage can be flawless by `analysis/` and dull by this, and that is
// not a contradiction: the generator's search only knows how to avoid
// breaking rules, and a seed that breaks none of them is where the
// interesting question STARTS. This module is what a campaign is picked
// with — see `campaign.ts` beside it, which judges a whole ladder of them
// against each other rather than one road on its own.
//
// A trait is worth having only if it can be WRONG IN BOTH DIRECTIONS. A
// number that is simply better when bigger belongs in the character vector
// or the stats, not in a facet — it would be a knob to max, and the search
// would find the seed that maxes it and nothing else.

import type { StageKnobs } from "../mapgen/rules.ts";

/** A trait's target range and how far outside it the score runs out.
 * `under` and `over` are stated separately because rally roads are not
 * symmetric about their ideals: a stage slightly short of jumps is a
 * disappointment, and a stage with four times too many is a circus. */
export type Band = {
  min: number;
  max: number;
  /** How far below `min` the score falls to zero, in the trait's own unit. */
  under: number;
  /** ...and how far above `max`. */
  over: number;
};

/** Which side of its band a measurement came out on. */
export type Verdict = "thin" | "in" | "much";

/** One measured QUALITY of a stage — a thing a rally road can have too
 * little or too much of. */
export type Trait = {
  /** `<facet>.<trait>` — stable, so a curator can point at one string. */
  id: string;
  /** What it is asking, in one line. The CLI prints this. */
  label: string;
  /** The measurement, in `unit`. */
  value: number;
  unit: string;
  band: Band;
  /** 0..1; 1 is a stage sitting inside the band. */
  score: number;
  verdict: Verdict;
  /** Its share of the facet it belongs to. */
  weight: number;
};

/** What a rating has to SAY about a stage. The counterpart of a `Finding`,
 * and deliberately not the same thing: a finding is a defect somebody has
 * to fix, and a note is a remark about the road's character that a curator
 * weighs against the other stages on the ladder. Nothing here is a bug. */
export type Note = {
  code: string;
  /** `thin` and `much` mirror the trait's verdict; `note` is a remark that
   * is neither — a place worth standing at, a number worth reading. */
  sense: Verdict | "note";
  message: string;
  /** Where along the stage it is, m — when it has a place. */
  s?: number;
  /** How much, in the trait's own unit. */
  value?: number;
};

export type Facet = {
  id: string;
  label: string;
  /** Weighted mean of its traits, 0..1. */
  score: number;
  /** Its share of the stage rating. */
  weight: number;
  traits: Trait[];
  notes: Note[];
  /** Numbers worth reading even when every trait is in band. */
  stats: Record<string, number>;
  ms: number;
};

/** The axes a stage's CHARACTER is written on — the comparable fingerprint
 * two stages are held apart by.
 *
 * These are NOT scores. Every one runs 0..1 from "none of this" to "as
 * much of it as this game builds", and no value on any axis is better than
 * another: `tight` at 0.9 is a switchback stage and at 0.1 an open blast,
 * and a campaign wants both. That is exactly why they are kept apart from
 * the traits — a trait says a stage is wrong, an axis says only that it is
 * unlike its neighbour, and the ladder is built out of the second. */
export const CHARACTER_AXES = [
  /** How much of the stage is spent turning, weighted by how hard. */
  "tight",
  /** How fast it is driven, against what the reference car can do. */
  "fast",
  /** How much the road goes up and down. */
  "vertical",
  /** How much of it is spent off the ground. */
  "airborne",
  /** How much of it is sealed rather than loose. */
  "sealed",
  /** How closed-in it is — trees and rock against the road. */
  "enclosed",
  /** How much it punishes a mistake — drops, solids, narrow at speed. */
  "exposed",
  /** How slippery the surfaces under it are, against dry gravel. */
  "slick",
  /** How long it is, against the game's longest band. */
  "long",
] as const;

export type CharacterAxis = (typeof CHARACTER_AXES)[number];
export type Character = Record<CharacterAxis, number>;

/** WHICH CAR THE ROAD ASKS FOR, as three shares that sum to 1.
 *
 * The roster is three cars and one sentence each (`defs/cars.ts`): a light
 * front-driven compact that holds the most grip on a sealed road and hates
 * being sideways, a heavy powerful four-wheel-drive coupé that is tall
 * geared and composed, and a rear-driven classic that turns a loose stage
 * into a series of drifts and has no power to spare. So a road asks for one
 * of them by what it is made of, and a campaign that never asks for the
 * third is a campaign whose third car nobody drives.
 *
 * It is an INVITATION, not a verdict: the numbers say what the road rewards,
 * and `make sim --sweep` says which car actually wins on it. Read the second
 * before moving a level for the sake of the first. */
export type Demand = {
  /** Sealed, fast, precise — grip, and a car that dislikes rotating. */
  grip: number;
  /** Open, long, uphill — power and gearing. */
  power: number;
  /** Loose, tight, slippery — a car that lives sideways. */
  slide: number;
};

export type StageRating = {
  seed: number;
  length: string;
  shape: string;
  knobs: StageKnobs;
  /** Stage length, m — the road, not the run-out. */
  distance: number;
  facets: Facet[];
  /** Every note, thin and overdone first. */
  notes: Note[];
  /** 0..100 — how good a RALLY STAGE this road is, on its own. A compass
   * for one road and half the answer for a ladder: see `campaign.ts`. */
  score: number;
  character: Character;
  demand: Demand;
  /** 0..1 — how much the road asks of the driver, and the one number a
   * ladder is ordered on. Not the same as the score: a gentle opening
   * stage should be easy AND good. */
  difficulty: number;
  stats: Record<string, number>;
  ms: number;
};

/** Score a measurement against its band: 1 inside, falling linearly to 0
 * over `under` below it and `over` above. Linear for `analysis/`'s reason —
 * a curve makes the number harder to reason about than the thing it
 * measures — and clamped, so a stage with ten times too many hairpins and
 * one with twenty score the same nothing. */
export function bandScore(value: number, band: Band): number {
  if (value >= band.min && value <= band.max) return 1;
  if (value < band.min) return Math.max(0, 1 - (band.min - value) / Math.max(1e-6, band.under));
  return Math.max(0, 1 - (value - band.max) / Math.max(1e-6, band.over));
}

export function verdictOf(value: number, band: Band): Verdict {
  if (value < band.min) return "thin";
  if (value > band.max) return "much";
  return "in";
}

export function trait(
  id: string,
  label: string,
  unit: string,
  value: number,
  band: Band,
  weight: number,
): Trait {
  const measured = Number.isFinite(value) ? value : 0;
  return {
    id,
    label,
    value: measured,
    unit,
    band,
    score: bandScore(measured, band),
    verdict: verdictOf(measured, band),
    weight,
  };
}

/** Roll a facet's traits into its score. */
export function facetScore(traits: Trait[]): number {
  let sum = 0;
  let weight = 0;
  for (const t of traits) {
    sum += t.score * t.weight;
    weight += t.weight;
  }
  return weight > 0 ? sum / weight : 1;
}

/** Turn every trait that missed its band into a note, in the trait's own
 * words. Each facet builds its own notes for the things it can NAME A PLACE
 * for; this is the fallback that makes sure a lost point is never silent. */
export function traitNotes(traits: Trait[], say: (t: Trait) => string): Note[] {
  const notes: Note[] = [];
  for (const t of traits) {
    if (t.verdict === "in") continue;
    notes.push({ code: t.id, sense: t.verdict, message: say(t), value: t.value });
  }
  return notes;
}

/** Where `value` sits between `lo` and `hi`, clamped to 0..1 — how every
 * character axis is built. */
export function scale01(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, (value - lo) / Math.max(1e-6, hi - lo)));
}

/** Notes ordered the way a curator reads them: what the stage is short of
 * first, what it has too much of next, remarks last, and the biggest miss
 * at the head of each group. */
export function rankNotes(notes: Note[]): Note[] {
  const rank: Record<Note["sense"], number> = { thin: 0, much: 1, in: 2, note: 2 };
  return [...notes].sort((a, b) => {
    const bySense = rank[a.sense] - rank[b.sense];
    if (bySense !== 0) return bySense;
    return Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0);
  });
}

/** How far apart two stages are, 0 (the same road twice) to 1 (nothing in
 * common). The mean absolute difference across the character axes rather
 * than a Euclidean distance: nine axes in a unit cube put every honest pair
 * around 0.4 under the square root, and a number that never leaves the
 * middle of its range is a number nobody can set a threshold on. */
export function characterDistance(a: Character, b: Character): number {
  let sum = 0;
  for (const axis of CHARACTER_AXES) sum += Math.abs(a[axis] - b[axis]);
  return sum / CHARACTER_AXES.length;
}
