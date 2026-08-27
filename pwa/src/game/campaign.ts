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
  type FiniteStageLength,
  type StageShape,
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
      blurb: "Open forest road, one jump",
    },
    {
      id: "taiga-2",
      name: "Cold Water",
      seed: 19,
      length: "medium",
      timeOfDay: "dawn",
      weather: "clear",
      blurb: "Fords and blind crests",
    },
    {
      id: "taiga-3",
      name: "Granite Ridge",
      seed: 21,
      length: "long",
      timeOfDay: "dusk",
      weather: "rain",
      blurb: "Hairpins over seven jumps",
    },
    {
      id: "taiga-4",
      name: "The Long Dark",
      seed: 5,
      length: "xlong",
      timeOfDay: "night",
      weather: "storm",
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
      blurb: "Three laps, gravel into tarmac",
    },
    {
      id: "taiga-6",
      name: "Wolverine Loop",
      seed: 6,
      length: "long",
      shape: "circuit",
      timeOfDay: "dusk",
      weather: "rain",
      blurb: "Three laps, two jumps, no rest",
    },
  ],
};

export const LOCATIONS: CampaignLocation[] = [TAIGA];

export function locationById(id: string): CampaignLocation {
  return LOCATIONS.find((l) => l.id === id) ?? LOCATIONS[0];
}

export type CampaignProgress = {
  /** Ids of every level cleared, in no particular order. */
  cleared: string[];
  /** Best stage time per level id, seconds. */
  best: Record<string, number>;
};

const PROGRESS_KEY = "scandi-flick-campaign";

const EMPTY: CampaignProgress = { cleared: [], best: {} };

export function loadProgress(): CampaignProgress {
  try {
    const stored = localStorage.getItem(PROGRESS_KEY);
    if (!stored) return EMPTY;
    const parsed = JSON.parse(stored) as Partial<CampaignProgress>;
    return {
      cleared: Array.isArray(parsed.cleared)
        ? parsed.cleared.filter((id) => typeof id === "string")
        : [],
      best: typeof parsed.best === "object" && parsed.best !== null ? parsed.best : {},
    };
  } catch {
    return EMPTY;
  }
}

/** Record a finished run: the level is cleared (which unlocks the next one)
 * and its best time only improves. Returns the progress to render from. */
export function recordFinish(id: string, time: number): CampaignProgress {
  const progress = loadProgress();
  const cleared = progress.cleared.includes(id) ? progress.cleared : [...progress.cleared, id];
  const previous = progress.best[id];
  const best = { ...progress.best };
  if (previous === undefined || time < previous) best[id] = time;
  const next: CampaignProgress = { cleared, best };
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the unlock still holds for this session */
  }
  return next;
}

/** Mark every stage in every location cleared, which is what opens all of
 * them in the campaign AND in time trial. Best times are left alone: an
 * unlock is not a result, and wiping the board would cost a real one. */
export function unlockEverything(): CampaignProgress {
  const progress = loadProgress();
  const cleared = [
    ...new Set([...progress.cleared, ...LOCATIONS.flatMap((l) => l.levels.map((v) => v.id))]),
  ];
  const next: CampaignProgress = { cleared, best: progress.best };
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the unlock still holds for this session */
  }
  return next;
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

/** The TIME TRIAL's gate, which is a stricter one: a stage opens there once
 * it has been finished, not once it has been reached. A time is something
 * you chase on a road you have already driven to the end — being handed the
 * clock on a stage you have never seen the finish of is the campaign again
 * with the ladder taken away. */
export function levelCompleted(level: CampaignLevel, progress: CampaignProgress): boolean {
  return progress.cleared.includes(level.id);
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
