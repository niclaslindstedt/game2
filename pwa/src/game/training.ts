// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAINING GROUND, as the menu sees it.
//
// The engine builds the place (`mapgen/arena.ts`); this is the one card the
// menu needs to offer it. It is shaped as a campaign level because the page
// that picks a car IS the campaign's card — the same spec sheet, the same
// gearbox row, the same START — and a training ground that had a page of
// its own would be that page again with the points taken off it.
//
// What it is NOT is a campaign stage. It pays nothing, unlocks nothing,
// keeps no time and enters nobody: it is not in `LOCATIONS`, so nothing
// that walks the ladder can reach it, and the only way in is the root
// menu's own row. That separation is the whole design — a place to learn a
// car in stops being one the moment it starts keeping score.

import { ARENA_SEED } from "@engine";

import type { CampaignLevel, CampaignLocation } from "./campaign.ts";

/** The id the menu addresses it by. Deliberately not a campaign id — see
 * `findLevel`, which does not know it and must not. */
export const TRAINING_ID = "training";

export const TRAINING_LEVEL: CampaignLevel = {
  id: TRAINING_ID,
  name: "Training Ground",
  seed: ARENA_SEED,
  // A ribbon a hundred metres long, and the level is what stands at the end
  // of it. The band is the shortest there is because nothing reads it here.
  length: "short",
  // Fixed conditions, on purpose: a car is judged against the last car you
  // drove here, and a low sun or a wet surface would make that judgement
  // about the weather instead.
  timeOfDay: "day",
  weather: "clear",
  season: "summer",
  blurb: "Tarmac, gravel, a jump and a yard full of cones",
};

/** The card's own heading. It is a location because the page asks for one;
 * it holds one level and appears in no ladder. */
export const TRAINING_LOCATION: CampaignLocation = {
  id: TRAINING_ID,
  name: "Training",
  blurb: "Learn the car. Nothing here is timed.",
  biome: "taiga",
  levels: [TRAINING_LEVEL],
};

/** Is this the training ground? Asked wherever a level id arrives from the
 * menu or a URL, because every other level id in the game resolves through
 * the campaign's own table and this one deliberately does not. */
export function isTraining(levelId: string | undefined): boolean {
  return levelId === TRAINING_ID;
}
