// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The campaign: authored stages, in order, behind locks. Everything a
// generated stage needs is a seed, a length band and a shape, so a "level"
// here is just those with conditions and a name pinned to them — the same
// rules engine builds it, and it comes out identical for every player.
//
// Progress lives in localStorage: which levels have been cleared (that is
// what unlocks the next one in the campaign, and what opens a stage at all
// in time trial) and the best time on each. Storage can be unavailable
// (private mode); a run simply does not persist rather than failing.

import {
  STAGE_RULES,
  type Difficulty,
  type FiniteStageLength,
  type StageShape,
  type Season,
  type TimeOfDay,
  type Weather,
} from "@engine";

export type CampaignLevel = {
  id: string;
  name: string;
  seed: number;
  length: FiniteStageLength;
  /** R22 — sprint (a stage from a start to a finish) or circuit (a closed
   * lap, raced over `laps`). Defaults to sprint. */
  shape?: StageShape;
  /** Laps a circuit level is raced over; defaults to the rule book's. */
  laps?: number;
  timeOfDay: TimeOfDay;
  weather: Weather;
  /** Which season the stage is run in — as much of a level's identity as
   * the hour it starts at, and the reason two levels on the same country
   * do not look like the same stage twice. */
  season: Season;
  /** One line of billing on the level's box. */
  blurb: string;
};

/** How many laps a level is raced over — one, unless it comes back to its
 * own start line. */
export function levelLaps(level: CampaignLevel): number {
  if (level.shape !== "circuit") return 1;
  return level.laps ?? STAGE_RULES.circuit.laps;
}

export type CampaignLocation = {
  id: string;
  name: string;
  blurb: string;
  levels: CampaignLevel[];
};

/** The Taiga ladder. The four seeds were chosen by scoring every seed in
 * 1..40 per length band on what actually makes a stage hard — hairpins
 * heaviest, then jumps, fords and crests, plus the mean curvature that says
 * how relentlessly the road bends — and then confirming the pick with the
 * bot sim, which climbs the way the ladder promises:
 *
 *   seed 38 short  1.8 km   66 s   99 km/h   12 drifts   1.1 s air   1 hit
 *   seed 19 medium 4.7 km  179 s   95 km/h   26 drifts   0.9 s air   0 hits
 *   seed 21 long   7.9 km  309 s   94 km/h   55 drifts   8.1 s air   6 hits
 *   seed  5 xlong 11.5 km  450 s   94 km/h   96 drifts   9.4 s air   6 hits
 *
 * Conditions darken down the ladder for the same reason the geometry
 * tightens: the last stage should ask for everything at once.
 *
 * The last two are a different discipline: CIRCUITS (R22), raced over three
 * laps of a road that comes back to its own start line, where the stage is
 * learnable and the clock is the whole opponent. Their seeds were picked
 * the same way — scored on hairpins and features, then confirmed with the
 * bot sim over the full three laps:
 *
 *   seed 3 medium circuit 1.59 km × 3  179 s  15 turns (4 hard)  1 jump, 1 crest, 57% tarmac
 *   seed 6 long   circuit 2.67 km × 3  316 s  26 turns (6 hard)  2 jumps, 1 crest
 */
const TAIGA: CampaignLocation = {
  id: "taiga",
  name: "Taiga",
  blurb: "Spruce, granite and cold water",
  levels: [
    {
      id: "taiga-1",
      name: "Loggers' Run",
      seed: 38,
      length: "short",
      timeOfDay: "day",
      weather: "clear",
      season: "summer",
      blurb: "Open forest road, one jump",
    },
    {
      id: "taiga-2",
      name: "Cold Water",
      seed: 19,
      length: "medium",
      timeOfDay: "dawn",
      weather: "clear",
      season: "spring",
      blurb: "Fords and blind crests",
    },
    {
      id: "taiga-3",
      name: "Granite Ridge",
      seed: 21,
      length: "long",
      timeOfDay: "dusk",
      weather: "rain",
      season: "autumn",
      blurb: "Hairpins over seven jumps",
    },
    {
      id: "taiga-4",
      name: "The Long Dark",
      seed: 5,
      length: "xlong",
      timeOfDay: "night",
      weather: "storm",
      season: "autumn",
      blurb: "Everything, in the dark",
    },
    {
      id: "taiga-5",
      name: "Spruce Ring",
      seed: 3,
      length: "medium",
      shape: "circuit",
      timeOfDay: "dawn",
      weather: "clear",
      season: "spring",
      blurb: "Three laps, gravel into tarmac",
    },
    {
      id: "taiga-6",
      name: "Marten Loop",
      seed: 6,
      length: "long",
      shape: "circuit",
      timeOfDay: "dusk",
      weather: "rain",
      season: "autumn",
      blurb: "Three laps, two jumps, no rest",
    },
  ],
};

export const LOCATIONS: CampaignLocation[] = [TAIGA];

export function locationById(id: string): CampaignLocation {
  return LOCATIONS.find((l) => l.id === id) ?? LOCATIONS[0];
}

/** How many places the podium is. Finish outside it and the stage is not
 * cleared: the ladder's next rung stays shut and the run ends on the card
 * that says so. Three, because a podium is three — the number is not a
 * difficulty knob, the FIELD is. */
export const PODIUM = 3;

export type CampaignProgress = {
  /** Ids of every level driven to the FINISH LINE, wherever it placed. This
   * is what opens a stage in the time trial: a time is something you chase
   * on a road you have already seen the end of. */
  finished: string[];
  /** Ids of every level CLEARED — finished on the podium (R29). Only this
   * opens the next rung of the campaign ladder. */
  cleared: string[];
  /** Best stage time per level id, seconds. A time is a time whatever the
   * field was doing, so this is not kept per difficulty. */
  best: Record<string, number>;
  /** Best (lowest) finishing position per level, per difficulty. A place is
   * only meaningful against the field that produced it — third out of
   * fifteen on EASY and third on HARD are not the same result — so it is
   * filed under the setting it was set on. */
  places: Record<string, Partial<Record<Difficulty, number>>>;
};

const PROGRESS_KEY = "scandi-flick-campaign";

const EMPTY: CampaignProgress = { finished: [], cleared: [], best: {}, places: {} };

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

export function loadProgress(): CampaignProgress {
  try {
    const stored = localStorage.getItem(PROGRESS_KEY);
    if (!stored) return EMPTY;
    const parsed = JSON.parse(stored) as Partial<CampaignProgress>;
    const cleared = ids(parsed.cleared);
    return {
      // A save written before the field existed has only `cleared`, and
      // every id in it was driven to the line — that is what cleared MEANT
      // then. Nobody loses a time trial they had already opened.
      finished: parsed.finished === undefined ? cleared : ids(parsed.finished),
      cleared,
      best: typeof parsed.best === "object" && parsed.best !== null ? parsed.best : {},
      places: typeof parsed.places === "object" && parsed.places !== null ? parsed.places : {},
    };
  } catch {
    return EMPTY;
  }
}

function save(progress: CampaignProgress): CampaignProgress {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* storage unavailable — the unlock still holds for this session */
  }
  return progress;
}

function withId(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

/** Record a run that reached the finish line: the stage is open in the time
 * trial from now on, and its best time only improves. `standing` is the
 * field's verdict on a CAMPAIGN run — null on a run with nobody entered,
 * which posts a time and nothing else. Its best place at that difficulty
 * only improves, and the ladder's next rung opens only on a podium.
 * Returns the progress to render from. */
export function recordFinish(
  id: string,
  time: number,
  standing: { place: number; difficulty: Difficulty } | null,
): CampaignProgress {
  const progress = loadProgress();
  const best = { ...progress.best };
  const previous = best[id];
  if (previous === undefined || time < previous) best[id] = time;
  const places = { ...progress.places, [id]: { ...progress.places[id] } };
  if (standing) {
    const stood = places[id][standing.difficulty];
    if (stood === undefined || standing.place < stood) {
      places[id][standing.difficulty] = standing.place;
    }
  }
  return save({
    finished: withId(progress.finished, id),
    cleared:
      standing !== null && standing.place <= PODIUM
        ? withId(progress.cleared, id)
        : progress.cleared,
    best,
    places,
  });
}

/** The best position this level has ever been finished in at `difficulty`,
 * or undefined if it never has been. */
export function bestPlace(
  progress: CampaignProgress,
  id: string,
  difficulty: Difficulty,
): number | undefined {
  return progress.places[id]?.[difficulty];
}

/** Mark every stage in every location cleared, which is what opens all of
 * them in the campaign AND in time trial. Best times and best places are left
 * alone: an unlock is not a result, and wiping the board would cost a real
 * one. */
export function unlockEverything(): CampaignProgress {
  const progress = loadProgress();
  const all = LOCATIONS.flatMap((l) => l.levels.map((v) => v.id));
  return save({
    finished: [...new Set([...progress.finished, ...all])],
    cleared: [...new Set([...progress.cleared, ...all])],
    best: progress.best,
    places: progress.places,
  });
}

/** A level opens in the CAMPAIGN once the one before it has been cleared;
 * the first one is always open. */
export function levelUnlocked(
  location: CampaignLocation,
  index: number,
  progress: CampaignProgress,
): boolean {
  if (index <= 0) return true;
  return progress.cleared.includes(location.levels[index - 1].id);
}

/** The TIME TRIAL's gate, and it is a different one rather than a stricter
 * one: a stage opens there once it has been driven to the END, podium or
 * not. A time is something you chase on a road you have already seen the
 * finish of — and a stage the player crossed the line on in ninth is
 * exactly the road they now want the clock on. */
export function levelCompleted(level: CampaignLevel, progress: CampaignProgress): boolean {
  return progress.finished.includes(level.id);
}

/** The stage after this one, or null at the end of the ladder — what the
 * results card offers when a campaign stage is cleared. The ladder carries on
 * into the next LOCATION rather than stopping at the end of one, so a finished
 * location hands the player straight into the next country. */
export function nextLevel(id: string): CampaignLevel | null {
  const found = findLevel(id);
  if (!found) return null;
  const after = found.location.levels[found.index + 1];
  if (after) return after;
  const nextLocation = LOCATIONS[LOCATIONS.indexOf(found.location) + 1];
  return nextLocation?.levels[0] ?? null;
}

/** Where a level id sits, for the finish handler that has only the id. */
export function findLevel(
  id: string,
): { location: CampaignLocation; level: CampaignLevel; index: number } | null {
  for (const location of LOCATIONS) {
    const index = location.levels.findIndex((l) => l.id === id);
    if (index >= 0) return { location, level: location.levels[index], index };
  }
  return null;
}
