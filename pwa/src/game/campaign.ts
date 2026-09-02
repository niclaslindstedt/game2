// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAMPAIGN — authored stages, in order, played for points.
//
// Everything a generated stage needs is a seed, a length band and a shape, so
// a "level" here is just those with conditions and a name pinned to them: the
// same rules engine builds it, and it comes out identical for every player.
//
// R29/R30 — A CAMPAIGN IS A CHAMPIONSHIP, and one set of rules runs both. Every
// stage is raced against the same fourteen crews and pays the podium the way a
// kart game does — three for the win, two for second, one for third, nothing at
// all below it — and those points are kept for the WHOLE field, because the
// thing that has to be true at the end is "you beat these fourteen crews", and
// that is only a sentence if their points are on the board beside yours.
//
// The points are also THE LOCK, at both scales:
//
//   * A STAGE opens once the one before it paid the player something, which is
//     to say once they finished it on the podium.
//   * A LOCATION opens once the one before it has been driven all the way
//     through and the player is top of its table.
//
// And nothing here is ever spent: a stage can be run again as often as the
// player likes, and the board keeps the better afternoon. That is the whole
// shape of the thing — see the country, then go back for the wins it costs to
// leave it — and it is why a stage already cleared is still worth driving.
//
// Progress lives in one localStorage record: what has been driven to the line
// (which is what opens a stage in the time trial), what every stage paid the
// field, the best time on each, and the best place at each difficulty. Storage
// can be unavailable (private mode); a run simply does not persist rather than
// failing.

import {
  DEFAULT_KNOBS,
  NUMERIC_KNOBS,
  RIVALS,
  STAGE_RULES,
  type BiomeId,
  type Difficulty,
  type FiniteStageLength,
  type StageKnobs,
  type StageLength,
  type StageShape,
  type Season,
  type TimeOfDay,
  type Weather,
} from "@engine";

import { PLAYER_ID, type ClassRow } from "./standings.ts";

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

/** WHICH campaign stage a set of Roam settings is standing on, if any — the
 * level whose seed, band, shape and dials build this exact road.
 *
 * The conditions are deliberately not part of the match. A road is what the
 * generator builds; the hour, the weather and the season are what it is
 * driven in, and a level taken out at dusk in the rain is still that level.
 * Being able to say so is most of the reason Roam can load one at all — the
 * campaign's stages are fixed conditions, and this is where they are not.
 *
 * The dials ARE part of it, and have to be: the campaign builds every stage
 * off the rule book's defaults, so a seed driven on a WIDE road with no
 * water in it is a different road that happens to share a number. So is
 * the COUNTRY (R40): the same seed in the desert is a different road again. */
export function levelForRoad(
  seed: number,
  length: StageLength,
  shape: StageShape,
  knobs: StageKnobs,
): CampaignLevel | null {
  const stock = NUMERIC_KNOBS.every((key) => knobs[key] === DEFAULT_KNOBS[key]);
  if (!stock) return null;
  for (const location of LOCATIONS) {
    if (location.biome !== knobs.biome) continue;
    for (const level of location.levels) {
      if (level.seed !== seed || level.length !== length) continue;
      if ((level.shape ?? "sprint") !== shape) continue;
      return level;
    }
  }
  return null;
}

export type CampaignLocation = {
  id: string;
  name: string;
  blurb: string;
  /** R40 — the country every stage of the location is built in. A
   * location IS a biome: the ladder walks the countries in order. */
  biome: BiomeId;
  levels: CampaignLevel[];
};

/** The dials a campaign stage is built on: the rule book's defaults, in
 * the location's own country. The same road for everybody — the dials are
 * Roam's to play with, not the campaign's to inherit. */
export function campaignKnobs(level: CampaignLevel): StageKnobs {
  return { ...DEFAULT_KNOBS, biome: findLevel(level.id)?.location.biome ?? DEFAULT_KNOBS.biome };
}

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
  biome: "taiga",
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

/** The Desert ladder — the second country (R40), opened by winning the
 * taiga's table. The same six rungs in the same order: four sprints up the
 * length bands, then two circuits. Its seeds were picked the way the
 * taiga's were — every seed in 1..40 per band scored on hairpins, jumps,
 * crests and mean curvature, in the DESERT (a seed is a different road in
 * a different country), then confirmed with the bot sim on the sand, which
 * is slower than the taiga's gravel by about a tenth everywhere:
 *
 *   seed 16 short   1.75 km   84 s   75 km/h    3 hard turns  1 jump   1.1 s drift
 *   seed 13 medium  4.58 km  226 s   73 km/h    9 hard turns  2 jumps  4.3 s drift
 *   seed 11 long    7.59 km  355 s   77 km/h   14 hard turns  6 jumps  5.5 s air
 *   seed 30 xlong  11.65 km  560 s   75 km/h   21 hard turns  3 jumps  12 s drift
 *
 * The circuits were picked the same way and sat the same three laps; the
 * bot is a poor judge of a circuit in either country, so the two chosen
 * are the ones it FINISHES, and the rest of the scoring did the ordering:
 *
 *   seed 27 medium circuit  1.68 km × 3  209 s  4 hard  1 jump   17% tarmac
 *   seed 23 long   circuit  2.60 km × 3  274 s  4 hard  1 jump   the most bend per metre of any
 *
 * There is no rain here: the conditions run from a clear noon down through
 * dusk into the dust storm, which is the desert's own bad weather. */
const DESERT: CampaignLocation = {
  id: "desert",
  name: "Desert",
  blurb: "Sand, saguaro and a sky with nothing in it",
  biome: "desert",
  levels: [
    {
      id: "desert-1",
      name: "Bajada",
      seed: 16,
      length: "short",
      timeOfDay: "day",
      weather: "clear",
      season: "summer",
      blurb: "Sand under the saguaros, two jumps",
    },
    {
      id: "desert-2",
      name: "Creosote Flats",
      seed: 13,
      length: "medium",
      timeOfDay: "dawn",
      weather: "clear",
      season: "spring",
      blurb: "Fast, open, and further than it looks",
    },
    {
      id: "desert-3",
      name: "Dune Sea",
      seed: 11,
      length: "long",
      timeOfDay: "dusk",
      weather: "clear",
      season: "autumn",
      blurb: "Crests you cannot see over",
    },
    {
      id: "desert-4",
      name: "Haboob",
      seed: 30,
      length: "xlong",
      timeOfDay: "night",
      weather: "storm",
      season: "summer",
      blurb: "The whole desert, in a wall of sand",
    },
    {
      id: "desert-5",
      name: "Joshua Ring",
      seed: 27,
      length: "medium",
      shape: "circuit",
      timeOfDay: "day",
      weather: "clear",
      season: "spring",
      blurb: "Three laps between the Joshua trees",
    },
    {
      id: "desert-6",
      name: "Salt Pan Loop",
      seed: 23,
      length: "long",
      shape: "circuit",
      timeOfDay: "dusk",
      weather: "storm",
      season: "autumn",
      blurb: "Three laps, the dust coming in",
    },
  ],
};

export const LOCATIONS: CampaignLocation[] = [TAIGA, DESERT];

export function locationById(id: string): CampaignLocation {
  return LOCATIONS.find((l) => l.id === id) ?? LOCATIONS[0];
}

/** What a place is worth, best first. Off the end of it a stage is worth
 * nothing at all: a points table where everybody scores is a starting-money
 * table, and the fourth-place finish has to STING. */
export const POINTS = [3, 2, 1] as const;

/** How many places the podium is — the length of the points table, because
 * they are the same statement: finish where nothing is paid and the stage is
 * not cleared, the ladder's next rung stays shut, and the run ends on the card
 * that says so. Three, because a podium is three — the number is not a
 * difficulty knob, the FIELD is. */
export const PODIUM = POINTS.length;

/** What finishing `place` (1-based) pays. */
export function pointsFor(place: number): number {
  return POINTS[place - 1] ?? 0;
}

/** Points for one stage, by crew id (`PLAYER_ID` for the player's own run). */
export type StageScores = Record<string, number>;

/** What a stage's finishing order paid everybody on it. */
export function scoreStage(rows: readonly ClassRow[]): StageScores {
  const out: StageScores = {};
  for (const row of rows) out[row.id] = pointsFor(row.place);
  return out;
}

export type CampaignProgress = {
  /** Ids of every level driven to the FINISH LINE, wherever it placed. This
   * is what opens a stage in the time trial: a time is something you chase
   * on a road you have already seen the end of. */
  finished: string[];
  /** What every stage has paid, by level id, for the WHOLE FIELD — the board
   * the campaign is played on. A stage never driven is simply absent; a stage
   * the player scored on is a stage they CLEARED. */
  points: Record<string, StageScores>;
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

/** Where the points lived while the championship was a second game played on
 * top of the campaign. Read once and folded into the record above, so a save
 * from that version keeps every point of its season. */
const LEGACY_SEASON_KEY = "scandi-flick-championship";

const EMPTY: CampaignProgress = { finished: [], points: {}, best: {}, places: {} };

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

function scores(value: unknown): StageScores {
  if (typeof value !== "object" || value === null) return {};
  const out: StageScores = {};
  for (const [id, points] of Object.entries(value as Record<string, unknown>)) {
    if (typeof points === "number" && Number.isFinite(points)) out[id] = points;
  }
  return out;
}

function board(value: unknown): Record<string, StageScores> {
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, StageScores> = {};
  for (const [levelId, row] of Object.entries(value as Record<string, unknown>)) {
    out[levelId] = scores(row);
  }
  return out;
}

/** The old season, flattened. It filed its stages under their location, and a
 * level id already says which location it is in. */
function legacySeason(): Record<string, StageScores> {
  try {
    const stored = localStorage.getItem(LEGACY_SEASON_KEY);
    if (!stored) return {};
    const out: Record<string, StageScores> = {};
    for (const season of Object.values(JSON.parse(stored) as Record<string, unknown>)) {
      Object.assign(out, board(season));
    }
    return out;
  } catch {
    return {};
  }
}

export function loadProgress(): CampaignProgress {
  try {
    const stored = localStorage.getItem(PROGRESS_KEY);
    const parsed = stored
      ? (JSON.parse(stored) as Partial<CampaignProgress> & { cleared?: unknown })
      : {};
    // Whatever this record already knows wins over the old season key: the
    // fold is a migration, not a merge of two live boards.
    const points = { ...legacySeason(), ...board(parsed.points) };
    // A save from before the points knows only that a stage was CLEARED, and
    // cleared meant a podium — so a stage the folded board pays the player
    // nothing for gets the thinnest podium there is. That leaves the ladder
    // exactly as open as the player left it without inventing a win, and it
    // is written over the field's own scores rather than instead of them.
    const cleared = ids(parsed.cleared);
    for (const id of cleared) {
      const stage = points[id];
      if ((stage?.[PLAYER_ID] ?? 0) === 0) {
        points[id] = { ...stage, [PLAYER_ID]: POINTS[PODIUM - 1] };
      }
    }
    return {
      // A save written before the field existed has only `cleared`, and every
      // id in it was driven to the line — that is what cleared MEANT then.
      // Nobody loses a time trial they had already opened.
      finished: parsed.finished === undefined ? cleared : ids(parsed.finished),
      points,
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
    // The old season has just been written into the record above; leaving it
    // behind would be a second board nobody reads.
    localStorage.removeItem(LEGACY_SEASON_KEY);
  } catch {
    /* storage unavailable — the unlock still holds for this session */
  }
  return progress;
}

function withId(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

/** A stage's board written AT THE LINE, before the crews behind the player
 * were home: the player's own score and nobody else's. It is a real result —
 * it clears the stage and it counts — and the classification that lands a few
 * seconds later fills the rest of the field in behind it. */
function provisional(stage: StageScores): boolean {
  return Object.keys(stage).length <= 1;
}

/** Put a stage's scores on the board, keeping THE BETTER RUN — the one worth
 * more to the player, and the whole field's points from that same afternoon
 * with it. A table where a lap driven for fun can cost a championship is a
 * table that teaches players not to drive, so a worse run changes nothing and
 * an equal one only fills in a board that is still provisional. */
function withScores(
  points: Record<string, StageScores>,
  levelId: string,
  scored: StageScores,
): Record<string, StageScores> {
  const stood = points[levelId];
  const mine = scored[PLAYER_ID] ?? 0;
  const theirs = stood?.[PLAYER_ID] ?? 0;
  if (stood !== undefined && !(mine > theirs || (provisional(stood) && mine === theirs))) {
    return points;
  }
  return { ...points, [levelId]: scored };
}

/** Record a run that reached the finish line: the stage is open in the time
 * trial from now on, its best time only improves, and the place the player
 * took is on the board immediately — the crews behind them are still out
 * there, and a player who presses on to the next stage the moment the card
 * lands must not lose the stage they just won.
 *
 * `standing` is the field's verdict on a CAMPAIGN run — null on a run with
 * nobody entered, which posts a time and nothing else. Returns the progress to
 * render from. */
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
    points: standing
      ? withScores(progress.points, id, { [PLAYER_ID]: pointsFor(standing.place) })
      : progress.points,
    best,
    places,
  });
}

/** Book a stage's CLASSIFICATION — every crew's points from the run that has
 * just finished settling, which is the first moment the places behind the
 * player are known. */
export function recordResult(levelId: string, rows: readonly ClassRow[]): CampaignProgress {
  const progress = loadProgress();
  return save({ ...progress, points: withScores(progress.points, levelId, scoreStage(rows)) });
}

/** What a stage paid, by crew — the results card's PTS column, read back out
 * of the board so a re-run that was NOT kept shows the points that count. */
export function stagePoints(levelId: string, progress: CampaignProgress): StageScores {
  return progress.points[levelId] ?? {};
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

/** CLEARED — the stage paid the player something, which is to say they
 * finished it on the podium. */
export function levelCleared(progress: CampaignProgress, id: string): boolean {
  return (progress.points[id]?.[PLAYER_ID] ?? 0) > 0;
}

/** Mark every stage in every location won, which is what opens all of them in
 * the campaign, opens every country behind them, and opens the lot in time
 * trial. Best times and best places are left alone: an unlock is not a result,
 * and wiping the board would cost a real one. */
export function unlockEverything(): CampaignProgress {
  const progress = loadProgress();
  const all = LOCATIONS.flatMap((l) => l.levels.map((v) => v.id));
  const points = { ...progress.points };
  for (const id of all) points[id] = { ...(points[id] ?? {}), [PLAYER_ID]: POINTS[0] };
  return save({
    finished: [...new Set([...progress.finished, ...all])],
    points,
    best: progress.best,
    places: progress.places,
  });
}

/** Tear a location's board up and drive it again. Every stage of it stays
 * FINISHED — a time trial is opened by having seen a road's finish line, and
 * that cannot be un-seen — but the points are gone and the ladder inside the
 * location closes back up behind the first stage. */
export function resetPoints(locationId: string): CampaignProgress {
  const progress = loadProgress();
  const points = { ...progress.points };
  for (const level of locationById(locationId).levels) delete points[level.id];
  return save({ ...progress, points });
}

/** A level opens in the CAMPAIGN once the one before it has been cleared;
 * the first one is always open. */
export function levelUnlocked(
  location: CampaignLocation,
  index: number,
  progress: CampaignProgress,
): boolean {
  if (index <= 0) return true;
  return levelCleared(progress, location.levels[index - 1].id);
}

/** The TIME TRIAL's gate, and it is a different one rather than a stricter
 * one: a stage opens there once it has been driven to the END, podium or
 * not. A time is something you chase on a road you have already seen the
 * finish of — and a stage the player crossed the line on in ninth is
 * exactly the road they now want the clock on. */
export function levelCompleted(level: CampaignLevel, progress: CampaignProgress): boolean {
  return progress.finished.includes(level.id);
}

/** One crew's location: what they have, and how they got it. */
export type StandingsRow = {
  id: string;
  alias: string;
  driver: string;
  points: number;
  /** Stage wins — the first tie-break, and the line a campaign is remembered
   * by. */
  wins: number;
  /** 1 is the lead. */
  place: number;
  /** Somebody else is on the same points and the same wins, so this place is
   * a tie-break rather than a gap — written the way a results sheet writes
   * one, with an equals sign in front of it. */
  tied: boolean;
  you: boolean;
};

/** THE TABLE — every crew entered in the location, the player included,
 * best first. Ties go to stage wins, and then to the player: a location that
 * ends level and hands the country to the machine is a lock with no visible
 * way in. Below that, the field's own reputation order breaks it. */
export function locationStandings(
  location: CampaignLocation,
  progress: CampaignProgress,
): StandingsRow[] {
  const tally = (id: string): { points: number; wins: number } => {
    let points = 0;
    let wins = 0;
    for (const level of location.levels) {
      const got = progress.points[level.id]?.[id] ?? 0;
      points += got;
      if (got === POINTS[0]) wins += 1;
    }
    return { points, wins };
  };
  const rows = [
    { id: PLAYER_ID, alias: "YOU", driver: "You", you: true, seed: -1, ...tally(PLAYER_ID) },
    ...RIVALS.map((crew) => ({
      id: crew.id,
      alias: crew.alias,
      driver: crew.driver,
      you: false,
      seed: crew.standing,
      ...tally(crew.id),
    })),
  ];
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      (a.you ? -1 : 0) - (b.you ? -1 : 0) ||
      b.seed - a.seed,
  );
  return rows.map(({ seed: _seed, ...row }, index) => ({
    ...row,
    place: index + 1,
    tied: rows.some(
      (other) => other.id !== row.id && other.points === row.points && other.wins === row.wins,
    ),
  }));
}

/** The player's own line of the table. */
export function playerStanding(
  location: CampaignLocation,
  progress: CampaignProgress,
): StandingsRow {
  const table = locationStandings(location, progress);
  return table.find((row) => row.you) ?? table[table.length - 1];
}

/** How many of the location's stages have been driven at all. */
export function stagesDriven(location: CampaignLocation, progress: CampaignProgress): number {
  return location.levels.filter((level) => progress.points[level.id] !== undefined).length;
}

/** Every stage of the location driven at least once — a location is not
 * finished while a stage of it has never been started, however well the ones
 * that have are going. */
export function locationComplete(location: CampaignLocation, progress: CampaignProgress): boolean {
  return stagesDriven(location, progress) === location.levels.length;
}

/** WON — every stage driven and the player top of the location's table. Both
 * halves matter: a table nobody has scored on is a table the player leads on
 * the tie-break, and an empty board must not open a country. */
export function locationWon(location: CampaignLocation, progress: CampaignProgress): boolean {
  return locationComplete(location, progress) && playerStanding(location, progress).place === 1;
}

/** A location opens once the one before it has been WON. The first one is
 * always open, and a location the ladder has not reached yet is shut however
 * many stages behind it are cleared. */
export function locationUnlocked(location: CampaignLocation, progress: CampaignProgress): boolean {
  const index = LOCATIONS.indexOf(location);
  if (index <= 0) return true;
  return locationWon(LOCATIONS[index - 1], progress);
}

/** WHERE THE CAMPAIGN PICKS BACK UP. Forward first: the next stage of the
 * location the player has not driven at all. Once they have been all the way
 * through, back to the first stage they have not WON — which is the whole
 * shape of a points campaign, and the reason a cleared stage is still worth
 * going back to. Null when every open stage is already a win. */
export function continueAt(
  location: CampaignLocation,
  progress: CampaignProgress,
): CampaignLevel | null {
  const open = location.levels.filter((_level, index) => levelUnlocked(location, index, progress));
  return (
    open.find((level) => progress.points[level.id] === undefined) ??
    open.find((level) => (progress.points[level.id]?.[PLAYER_ID] ?? 0) < POINTS[0]) ??
    null
  );
}

/** THE LAST STAGE A GATE LEAVES OPEN — the furthest one down the ladder a
 * player is allowed to drive right now. The gate is passed in for the same
 * reason `LevelGrid` takes one: the campaign opens the stage after the last
 * podium, and the time trial and heads-up open anything finished.
 *
 * It is where a grid stands its controller cursor, and what that grid's way
 * ON takes, so a pad walks INTO the campaign rather than back to the first
 * stage every time. `continueAt` is the campaign's better answer where it
 * has one; this is the fallback, and the whole answer on the two grids that
 * have no ladder to pick back up. */
export function latestOpen(
  location: CampaignLocation,
  open: (level: CampaignLevel, index: number) => boolean,
): CampaignLevel | null {
  let found: CampaignLevel | null = null;
  for (const [index, level] of location.levels.entries()) {
    if (open(level, index)) found = level;
  }
  return found;
}

/** The stage after this one, or null at the end of the ladder. The ladder
 * carries on into the next LOCATION rather than stopping at the end of one, so
 * a finished location hands the player straight into the next country. */
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

/** Where the ladder goes after a stage: the next rung, the next COUNTRY
 * behind the table it is locked to, or the end of the road. */
export type LadderStep =
  | { kind: "next"; level: CampaignLevel }
  | { kind: "locked"; location: CampaignLocation }
  | { kind: "end" };

/** What the results card may offer after `levelId`. The next stage inside a
 * location is a podium away; the first stage of the NEXT one is behind this
 * location's table, so a player who has cleared every stage in third place is
 * shown the lock rather than the stage. */
export function ladderAfter(levelId: string, progress: CampaignProgress): LadderStep {
  const after = nextLevel(levelId);
  if (!after) return { kind: "end" };
  const here = findLevel(levelId);
  const there = findLevel(after.id);
  if (!here || !there) return { kind: "end" };
  if (there.location === here.location) return { kind: "next", level: after };
  return locationUnlocked(there.location, progress)
    ? { kind: "next", level: after }
    : { kind: "locked", location: here.location };
}
