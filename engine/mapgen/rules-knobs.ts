// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stage generator's SHARED VOCABULARY: the small types every other
// module in `mapgen/` speaks (a turn's severity, a stage's shape, what a
// segment carries, how it gets over water), and the DIALS — the six numbers
// a player turns to ask for a different kind of stage, with their defaults
// and the one way a dial ever reaches a rule (`knobScale`).
//
// It is the leaf of the rule book: the chapters under `rules-*.ts` and the
// dial readings in `rules-country.ts` all import it, and it imports nothing
// but the countries.

import { isBiomeId, type BiomeId } from "./biomes.ts";

/** Sample spacing along the compiled centerline, meters. It lives here
 * because it is not only the compiler's business: a search that has to land
 * a road exactly on a point (R22's closure) must walk it the way the
 * compiler will, step for step. */
export const SAMPLE_STEP = 2;

export type TurnSeverity = "soft" | "medium" | "hard";
/** R22 — how a stage is laid out: a sprint runs from a start line to a
 * finish somewhere else; a circuit comes back to where it started, which is
 * what makes laps possible. */
export type StageShape = "sprint" | "circuit";
export type SegmentFeature = "none" | "jump" | "water" | "crest" | "tunnel";
/** How a stage crosses water: wade through it, span it, or carry it under
 * the road in a pipe (R12). */
export type Crossing = "ford" | "timber" | "concrete" | "culvert";

/** The generator's DIALS — four numbers, each 0..1, that a player (or the
 * tooling) turns to ask for a different kind of stage. They never break a
 * rule: they move the ranges the rules draw from, and 0.5 on every dial is
 * the stage this generator built before they existed. */
export type StageKnobs = {
  /** How hilly: the rolling road profile's amplitude and the landscape's
   * relief around it. 0 is a plain, 1 is mountain country. */
  elevation: number;
  /** How wet: how often water crosses the road (and how wide, which is
   * what decides ford vs bridge), and how much of the nature is lake. */
  water: number;
  /** How forested: the density of the solid trunk field the car crashes
   * into. 0 is open heath, 1 is closed forest. */
  trees: number;
  /** The share of the road that is asphalt, 0..1 — grip, tighter lines,
   * and tire smoke instead of a gravel plume. */
  asphalt: number;
  /** R21 — how wide the road is, 0..1 across `roadWidth`'s band. 0 is a
   * narrow lane where the line is the only line there is; 1 is a broad
   * boulevard with room to throw the car at a corner and still be on the
   * road when it lands. */
  width: number;
  /** R34 — how STEEP the country stands. Not how HIGH it stands, which is
   * `elevation`: this is the angle the same relief is held at. At 0 the
   * ice has been over everything — long slopes, whaleback summits, fault
   * steps worn back into hillsides, and a road that is graded gently into
   * whatever it crosses. At 1 the rock keeps its faces, and where the road
   * has to go through a shoulder of it rather than round, it goes through
   * a CUT: a blasted face standing over the verge instead of a bank
   * battered back to something a car could climb. */
  steepness: number;
  /** R49 — WHICH WAY THE STAGE RUNS THROUGH THE COUNTRY, 0..1: 0 is a
   * stage that climbs, 1 is a stage that comes down, and 0.5 is neither —
   * a road that takes the country as it finds it, which is every stage
   * this generator built before the dial existed.
   *
   * It is not `elevation`, which says how much height the country HAS, nor
   * `steepness`, which says what angle it is held at. Those two describe
   * the ground; this one describes the JOURNEY across it, and it is the
   * half of a rally stage a player feels first — a road that loses height
   * carries speed it did not have to earn, and one that gains it spends
   * the whole stage paying for the view.
   *
   * It works by moving WHERE THE STAGE STARTS, which is the one lever a
   * country of bounded hills actually answers to (R35, R49). The road
   * follows the land through a lag, so its height at any point is the
   * country's; what the stage does over its whole length is therefore
   * decided almost entirely by how high the ground under the start line
   * is against the country's average. Sited on a shoulder, a stage spends
   * the rest of itself coming down off it.
   *
   * That is also why it is a MILD instrument, and deliberately so. It can
   * only trade within the relief the country actually has — a taiga at the
   * top of the dial comes down a few tens of metres over a stage, not a
   * mountainside — and it cannot make the road steeper than R34 already
   * allows, because it never touches the road's own grade. A stage that
   * drops off a cliff is `elevation` and `steepness`, not this. */
  tilt: number;
  /** R46 — HOW HARD THE ROAD IS, 0..1. The one dial that is not about a
   * single thing the stage has in it: it leans on the corner vocabulary,
   * the jumps, the road's width and the country's relief at once, always
   * inside what the rules already allow. 0.5 is the game as it is tuned,
   * and is exactly that — the middle of this dial changes nothing.
   *
   * It is not R29's `difficulty`, which is how good the RIVALS are. This
   * is the ROAD, and it is the only one of the two Roam has any use for:
   * a seed driven on your own has nobody to be faster than. */
  challenge: number;
  /** R47 — HOW MANY PEAKS the country has, 0..1 — the one dial only a
   * mountain country reads (`BiomeLand.massif`; the taiga and the desert
   * have no peaks to count). At 0 ONE mountain stands alone in a plain:
   * the ridge system's period is stretched past the stage's box and the
   * valley floor widened to most of it, so the stage is laid on the one
   * flank and off the road there is nothing but the drop to the ground.
   * At 1 the period is tightened to a RANGE — a crest every kilometre and
   * a valley between each pair — and the road threads them. The middle is
   * the country the rules were tuned on: one valley and the ridge beside
   * it inside a medium stage's box. */
  peaks: number;
  /** R47 — HOW HIGH THE RACE IS, 0..1, read onto a band of METRES by
   * `altitudeOf` — the second dial only a mountain country reads. `peaks`
   * says how many crests the country has; this says how far the one the
   * stage is laid on stands over the valley floor, and the valley floor
   * stays where it is: at the dial's bottom the crest is a few hundred
   * metres of worn shoulder a rally can run up and down, and at the top it
   * is six thousand metres of rock with the road blasted along one ledge
   * of it and the green a mile below.
   *
   * The dial does not stretch the mountain, it BUILDS A BIGGER ONE: the
   * ridge system's period grows too, but only `R.massif.altitude.spread`
   * as fast, so every metre of height is also a steeper flank. That is the
   * whole point of the dial — high is not merely far up, it is sheer — and
   * it is why the country's zones, the air's lapse rate and the earthworks
   * a road may be built on all read it (`landOf`). */
  altitude: number;
  /** R40 — HOW HIGH THE SAND STANDS, 0..1, read onto a band of METRES by
   * `duneHeightOf` — the dial only a sand country reads (`BiomeLand.dunes`;
   * the taiga and the alpine have no sand to pile). It is a MAXIMUM: what
   * a full-grown dune stands over the trough beside it, where the wind has
   * heaped the deepest sand. Most of the country is lower, because the
   * mask that says where the sand sea is at all fades the field out
   * between its ergs, and the pans between them carry none.
   *
   * The dial does not merely stretch one dune field upward, it builds a
   * BIGGER ONE: the period across the wind grows with the height, and the
   * ergs with the period (`STAGE_RULES.dunes.spread`). Sand cannot stand
   * steeper than its own angle of repose whatever the dial says, so a
   * dune that got taller without getting longer would be a wall of
   * something that is physically a liquid — and at the top of the travel
   * the faces come out right at repose, which is what a real erg looks
   * like. At 0 the wind has left the country bare: no sand at all, and the
   * rock and the pans are the whole of it.
   *
   * `dunes: 0` is therefore the only dial position that removes something
   * rather than shrinking it, and it says so honestly — `landOf` hands
   * back a country with no dune row at all. */
  dunes: number;
  /** R40 — which COUNTRY the stage is built in (`biomes.ts`). The one dial
   * that is a name rather than a number: it does not move a range, it says
   * which set of ranges — the taiga's lakes and spruce, or the desert's
   * dunes and saguaros — the other five are read against. */
  biome: BiomeId;
};

/** The numeric dials — everything in `StageKnobs` that is a position on a
 * band rather than the name of a country. What the menus put a row of
 * stops under and the URL readers parse as a number. */
export type NumericKnob = Exclude<keyof StageKnobs, "biome">;

export const NUMERIC_KNOBS: readonly NumericKnob[] = [
  "elevation",
  "water",
  "trees",
  "asphalt",
  "width",
  "steepness",
  "tilt",
  "challenge",
  "peaks",
  "altitude",
  "dunes",
];

/** The default dial positions — the stage the rules built before the knobs
 * existed, so an un-knobbed call keeps its old character. */
export const DEFAULT_KNOBS: StageKnobs = {
  biome: "taiga",
  elevation: 0.5,
  water: 0.5,
  trees: 0.5,
  // Sealed road is a guest on a rally stage, not the host: a quarter of it
  // is enough for the tarmac sections to be an event, and the sim says
  // that is about what the stage's drift time can pay for.
  asphalt: 0.25,
  // The width the stage vocabulary — turn radii, the bot's line, the drift
  // tuning — was measured against.
  width: 0.55,
  // Middling country: rock faces where the road has to force a shoulder,
  // worn slopes everywhere it does not.
  steepness: 0.5,
  // R49 — the middle of the tilt dial, which is the one position that asks
  // the search for nothing: the country decides where the road goes, as it
  // did before there was a dial. Every campaign stage but the ones that
  // name a tilt is built here.
  tilt: 0.5,
  // R46 — the middle of the difficulty dial, which is the vocabulary every
  // rule above states and every stage in the campaign is built on.
  challenge: 0.5,
  // R47 — a valley and the ridge beside it; read by a massif and by
  // nothing else.
  peaks: 0.5,
  // R47 — the ALTITUDE dial's own pivot: the country the alpine's row was
  // written for, and the height every alpine seed was built at before
  // there was a dial (`altitudeMul` is exactly 1 here, so it is). It sits
  // low on the travel rather than in the middle because what is above it
  // is a mountain range and what is below it is a hill — two thirds of the
  // dial for the two thirds of the idea.
  altitude: 0.35,
  // R40 — the DUNE dial's own pivot: the sand the desert's row was written
  // for, and the country every desert seed is built in until somebody moves
  // it (`landOf` hands the row itself back here, so it is). Low on the
  // travel because what is above it is an erg out of the Empty Quarter and
  // what is below it is a beach — a quarter of the dial for the country a
  // rally is actually laid across.
  dunes: 0.22,
};

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0;
}

/** Fill in and clamp a partial set of dials. Every entry point takes
 * `Partial<StageKnobs>` and runs it through here, so a knob is always a
 * number in 0..1 by the time any rule reads it. */
export function resolveKnobs(knobs?: Partial<StageKnobs>): StageKnobs {
  return {
    // A biome this build does not know — a stale URL, a save from another
    // version — is the taiga, which is the country every seed was built in
    // before there was a choice.
    biome: isBiomeId(knobs?.biome) ? knobs.biome : DEFAULT_KNOBS.biome,
    elevation: clamp01(knobs?.elevation ?? DEFAULT_KNOBS.elevation),
    water: clamp01(knobs?.water ?? DEFAULT_KNOBS.water),
    trees: clamp01(knobs?.trees ?? DEFAULT_KNOBS.trees),
    asphalt: clamp01(knobs?.asphalt ?? DEFAULT_KNOBS.asphalt),
    width: clamp01(knobs?.width ?? DEFAULT_KNOBS.width),
    steepness: clamp01(knobs?.steepness ?? DEFAULT_KNOBS.steepness),
    tilt: clamp01(knobs?.tilt ?? DEFAULT_KNOBS.tilt),
    challenge: clamp01(knobs?.challenge ?? DEFAULT_KNOBS.challenge),
    peaks: clamp01(knobs?.peaks ?? DEFAULT_KNOBS.peaks),
    altitude: clamp01(knobs?.altitude ?? DEFAULT_KNOBS.altitude),
    dunes: clamp01(knobs?.dunes ?? DEFAULT_KNOBS.dunes),
  };
}

/** Read a knob onto a `{ min, max }` band — the one way a dial ever
 * reaches a rule. */
export function knobScale(knob: number, band: { min: number; max: number }): number {
  return band.min + (band.max - band.min) * knob;
}

/** The menu's stage lengths. The finite ones map to a length band sized for
 * the target minutes at measured bot pace; `endless` streams new sections
 * from the seed for as long as the run lasts. */
export type StageLength = "short" | "medium" | "long" | "xlong" | "endless";
export type FiniteStageLength = Exclude<StageLength, "endless">;
