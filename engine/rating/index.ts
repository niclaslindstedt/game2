// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RALLY RATING — is this stage any GOOD?
//
// `analysis/` asks whether a generated stage is broken and is happy with
// one that is merely correct. This asks the question that starts where that
// one stops: of the seeds that hold water, which are worth driving, and —
// the reason the module exists — which SIX of them make a campaign.
//
// The loop it is built for:
//
//   1. sweep seeds  (`make rate COUNT=64`)
//   2. read the table: the score is the compass, the NOTES are the stage
//   3. shortlist by CHARACTER, not by score — a ladder needs stages that
//      are unlike each other, and the six best-scoring seeds in a sweep are
//      routinely six versions of the same road
//   4. audit the ladder as a set (`make rate CAMPAIGN=1`)
//   5. confirm the pick against the game: `make sim` for whether the bot
//      agrees it climbs, `make level` for what is actually on the road,
//      `make track` for what it looks like
//   6. ask whether the RATING measured the right thing — a stage the tool
//      loves and nobody enjoys is a band that needs moving, and a stage
//      everybody remembers that scores 70 is a trait nobody has written
//
// Step 6 is `analysis/`'s step 5 and it matters more here, because there is
// no rule book underneath this to be right when the scoreboard is wrong.
// Every threshold lives in `scales.ts`; the `level-rating` skill owns the
// procedure.
//
// It is dev-time only, exactly like `analysis/` — nothing the app ships
// imports it, and the campaign it picks is a table of seeds somebody
// committed.

import { compileStage, type Track } from "../mapgen/compile.ts";
import { createTerrain, type TerrainField } from "../mapgen/terrain.ts";
import type { FiniteStageLength, StageKnobs, StageShape } from "../mapgen/rules.ts";
import { rateFlow } from "./flow.ts";
import { ratePace } from "./pace.ts";
import { rateRelief } from "./relief.ts";
import { rateFeatures } from "./features.ts";
import { rateScenery } from "./scenery.ts";
import { rateRisk } from "./risk.ts";
import { stageCharacter, stageDemand, stageDifficulty } from "./character.ts";
import { walkStage } from "./walk.ts";
import { rankNotes, type Facet, type Note, type StageRating } from "./types.ts";

export { RATING } from "./scales.ts";
export { CHARACTER_AXES, characterDistance } from "./types.ts";
export type {
  Band,
  Character,
  CharacterAxis,
  Demand,
  Facet,
  Note,
  StageRating,
  Trait,
  Verdict,
} from "./types.ts";
export { walkStage, type Corner, type Walk } from "./walk.ts";
export {
  rateCampaign,
  rateLadder,
  stepDemand,
  type CampaignReport,
  type LadderReport,
  type LadderStep,
  type StageConditions,
} from "./campaign.ts";

export type RateOptions = {
  length?: FiniteStageLength;
  shape?: StageShape;
  knobs?: Partial<StageKnobs>;
};

/** Rate a stage that has already been built, with a terrain field over it
 * that has been SYNCED PAST THE WHOLE STAGE. The entry point for tests and
 * for anything holding the stage; `rateSeed` is the one the tooling uses. */
export function rateTrack(
  track: Track,
  terrain: TerrainField,
  options: RateOptions = {},
): StageRating {
  const started = Date.now();
  const walk = walkStage(track);
  const facets: Facet[] = [
    rateFlow(walk),
    ratePace(walk),
    rateRelief(walk),
    rateFeatures(walk),
    rateScenery(walk, terrain),
    rateRisk(walk, terrain),
  ];

  let sum = 0;
  let weight = 0;
  const notes: Note[] = [];
  const stats: Record<string, number> = {};
  for (const facet of facets) {
    sum += facet.score * facet.weight;
    weight += facet.weight;
    notes.push(...facet.notes);
    for (const [key, value] of Object.entries(facet.stats)) stats[`${facet.id}.${key}`] = value;
  }

  const character = stageCharacter(walk, facets);
  return {
    seed: track.seed,
    length: options.length ?? "medium",
    shape: options.shape ?? (track.circuit ? "circuit" : "sprint"),
    knobs: { ...track.knobs },
    distance: walk.distance,
    facets,
    notes: rankNotes(notes),
    score: weight > 0 ? Math.round((sum / weight) * 1000) / 10 : 0,
    character,
    demand: stageDemand(character),
    difficulty: Math.round(stageDifficulty(character) * 1000) / 1000,
    stats,
    ms: Date.now() - started,
  };
}

/** Build a stage from a seed and rate it — the whole loop in one call. */
export function rateSeed(seed: number, options: RateOptions = {}): StageRating {
  const length = options.length ?? "medium";
  const track = compileStage(seed, length, options.knobs, options.shape);
  const terrain = createTerrain(track);
  // `createTerrain` syncs on construction, so the field has already caught
  // up with the whole stage here. Said out loud because it is a PRECONDITION
  // of `rateTrack` rather than an accident: the streams, guards, stands,
  // props and car parks are built lazily as the road is synced, and an
  // unsynced field rates a stage with no trees, no water and nothing built
  // beside it — which reads as a very high scenery score for an empty world.
  return rateTrack(track, terrain, { ...options, length });
}
