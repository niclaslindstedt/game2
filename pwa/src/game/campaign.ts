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
// The TIME TRIAL is held behind the second of those and not the first — the
// whole country at once, the moment the campaign opens the country. See
// `timeTrialOpen`; it is the one place in the game a mode is allowed to run
// ahead of the ladder, and it only ever runs ahead INSIDE a country.
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
  resolveKnobs,
  type BiomeId,
  type Difficulty,
  type FiniteStageLength,
  type StageKnobs,
  type StageLength,
  type StageShape,
  type Season,
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
  /** The hour the stage STARTS at, 0..24 local solar time — the sun's
   * clock runs on from it at an hour a minute, so a level set at sunset is
   * driven into the dark and one set before dawn drives into the light.
   * Read with the season and the country: 17:00 is a low autumn sun over
   * the taiga and broad daylight over the desert. */
  hour: number;
  weather: Weather;
  /** Which season the stage is run in — as much of a level's identity as
   * the hour it starts at, and the reason two levels on the same country
   * do not look like the same stage twice. */
  season: Season;
  /** The generator's dials this stage is built on, for any it does not take
   * from the rule book (`campaignKnobs`). Almost always absent, and that is
   * the default it should stay: the campaign is the same road for
   * everybody, and the rule book's defaults are what every stage on the
   * ladder was scored, timed and previewed against.
   *
   * It exists so that a level is a COMPLETE description of its road — every
   * lever Roam has, written down — and so a level that wants one of them
   * moved (R46's difficulty, say, up the ladder) can say so here rather
   * than by being a seed that happens to come out that way. The COUNTRY is
   * not among them: a location IS a biome (R40), so it always wins. */
  knobs?: Partial<StageKnobs>;
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
 * The dials ARE part of it, and have to be — measured against the LEVEL's
 * own (`campaignKnobs`), which is the rule book's defaults unless that
 * level says otherwise: a seed driven on a wider road, or with the
 * difficulty wound up, is a different road that happens to share a number.
 * So is the COUNTRY (R40): the same seed in the desert is a different road
 * again. */
export function levelForRoad(
  seed: number,
  length: StageLength,
  shape: StageShape,
  knobs: StageKnobs,
): CampaignLevel | null {
  for (const location of LOCATIONS) {
    if (location.biome !== knobs.biome) continue;
    for (const level of location.levels) {
      if (level.seed !== seed || level.length !== length) continue;
      if ((level.shape ?? "sprint") !== shape) continue;
      const built = levelKnobs(location.biome, level);
      if (!NUMERIC_KNOBS.every((key) => knobs[key] === built[key])) continue;
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

/** The dials a campaign stage is built on: the rule book's defaults, in the
 * location's own country, and whatever that level says for itself. The same
 * road for everybody — the dials are Roam's to play with, and the
 * campaign's only where a level has written one down. */
export function campaignKnobs(level: CampaignLevel): StageKnobs {
  return levelKnobs(findLevel(level.id)?.location.biome ?? DEFAULT_KNOBS.biome, level);
}

/** ...with the country handed in, for the callers that already know which
 * one it is. The biome goes on LAST: a location is a country (R40), and a
 * level cannot be built somewhere else. */
function levelKnobs(biome: BiomeId, level: CampaignLevel): StageKnobs {
  return resolveKnobs({ ...DEFAULT_KNOBS, ...level.knobs, biome });
}

/** THE RUNG ORDER, and it is the same in all three countries: a sprint, a
 * loop, a sprint, a loop, a sprint, and the long one.
 *
 *   1  short  sprint     2  medium circuit    3  medium sprint
 *   4  long   circuit    5  long   sprint     6  xlong  sprint
 *
 * The circuits are INSIDE the climb rather than bolted onto the end of it.
 * Four sprints up the length bands and then two loops is the arrangement
 * this campaign shipped with, and it is the one thing `make rate CAMPAIGN=1`
 * refused every country for: a 1.7 km ring after an eleven-kilometre finale
 * is a rung the ladder steps DOWN, and all three countries did it in the
 * same place. Interleaved, every rung asks more than the one before it in
 * all three — and the player meets the second discipline (R22: three laps
 * of a road that comes back to its own start line, learnable, the clock the
 * whole opponent) second rather than seventh.
 *
 * WHAT A RUNG ASKS FOR IS THE ROAD AND THE SKY TOGETHER, about two thirds
 * and one third (`RATING.ladder.conditionShare`). That is why the seeds
 * below are not simply sorted by how hard the geometry is: an hour, a
 * weather and a season are the cheapest levers the game has, they cost
 * nothing that has to be re-verified, and used properly they carry a third
 * of the climb. Each country runs all four seasons, all three day-parts and
 * every weather its own sky offers — the desert has no rain (biomes.ts), so
 * it has the other two.
 *
 * HOW THE SEEDS WERE PICKED. A sweep of 1..48 per country per slot, rated
 * (`engine/rating/`) and analyzed (`engine/analysis/`), then searched for
 * the SET of six that scores best as a ladder rather than the six best
 * stages — which are reliably the same road six times. The brief the search
 * was held to, beyond the ladder scorer's own bands:
 *
 *   * every rung asks MORE than the one under it, by enough to feel (0.035)
 *     and not so much it is a wall (0.14)
 *   * no seed twice in a country, and no two rungs under the same sky
 *   * every car the right car somewhere, every season, every day-part
 *   * as few `make analyze` errors as the slot allows
 *
 * That last one is not a tiebreak. An earlier pass of this ladder, chosen
 * on the rating alone, put a road carrying EIGHTY-ONE R-rule violations
 * into the alpine long sprint; it rated 84. Every CIRCUIT in the game
 * carries a few — the analyzer reads a lap rejoining its own start line as
 * two roads too close together (R23) and as a corner too near the grid —
 * so the count separates circuits from each other, never from sprints.
 *
 * The bot drives all eighteen clean on the compact: no respawn, no roll, no
 * damage worth a number, and the pace falls down each ladder as the roads
 * tighten. The times below are its own, and they move whenever the
 * generator does — `npm run sim -- --seeds N --length L` says what they are
 * today. Note the clock is NOT the order: a three-lap circuit takes longer
 * than the sprint above it in the same band, because a lap is a slower road
 * than a run through the country, and the ladder is ordered on what a stage
 * ASKS rather than on how long the bot is out there.
 */

/** The Taiga ladder — the first country, and the game's opening hour.
 * Gravel through spruce, a village with tarmac through it, and water the
 * road fords rather than crosses.
 *
 * IT RUNS SPRING TO AUTUMN, and never in winter. The cold country is the
 * ALPINE's, six levels later, and a taiga that opened on ice said the game
 * had one landscape rather than three — the boreal forest under snow is a
 * different biome to look at, not a fourth face of this one. Winter here is
 * Roam's: every seed can still be driven in it, and R48's ice road with it.
 *
 * THE FIRST THREE RUNGS ARE THE TUTORIAL THE GAME DOES NOT HAVE, so they
 * are built rather than merely chosen. Each carries its own dials
 * (`knobs`), which is the whole reason a level may: a WIDER road, because
 * the first thing a player is learning is where the car points and a lane
 * that punishes a late turn-in teaches nothing; and a small DESCENT (R49),
 * because a road that gives speed back reads as fast without asking for
 * anything, and because this game rolls a car easily enough that a big one
 * would be a cliff to fall off rather than a gift. They fall away by rung —
 * 22 m of road at level one, then 21, then 19 — so the road has closed to
 * the game's own width by the time the ladder is asking real questions.
 *
 *   seed 30 short   sprint   1.79 km   82 s   79 km/h   a ford, a crest, 20.0 m of road
 *   seed 11 medium  circuit  1.72×3   225 s   82 km/h   16 calls a lap, 28 m of climb
 *   seed 48 medium  sprint   4.85 km  208 s   84 km/h   43 calls, two jumps, a bridge
 *   seed 46 long    circuit  2.74×3   372 s   80 km/h   28 bends a lap, 28% sealed
 *   seed 45 long    sprint   7.48 km  344 s   78 km/h   the country stands up, in rain
 *   seed  1 xlong   sprint  10.42 km  457 s   82 km/h   92 calls, 17 of them hard
 *
 * The bot drives all eighteen clean in all three cars: no spin, no roll,
 * no respawn and no damage anywhere on the ladder — which is the bar the
 * first three rungs exist to clear, because a wide road that still rolls
 * the car has taught nobody anything.
 */
const TAIGA: CampaignLocation = {
  id: "taiga",
  name: "Taiga",
  blurb: "Spruce, granite and cold water",
  biome: "taiga",
  levels: [
    {
      id: "taiga-1",
      name: "Broad Ford",
      seed: 30,
      length: "short",
      hour: 13,
      weather: "clear",
      season: "summer",
      // R21/R49 — the widest road in the game and a gentle fall through it.
      knobs: { width: 0.85, tilt: 0.7 },
      blurb: "A wide road falling through the spruce, one ford",
    },
    {
      id: "taiga-2",
      name: "Morning Loop",
      seed: 11,
      length: "medium",
      shape: "circuit",
      hour: 7,
      weather: "clear",
      season: "spring",
      // Still wide. No tilt: a lap comes back to its own start line, so
      // there is no descent to ask for (R49) — what a circuit wants is
      // FLAT, and this seed climbs 19 m a km against a band that allows 42.
      knobs: { width: 0.8 },
      blurb: "Three flat laps past the town, in the early light",
    },
    {
      id: "taiga-3",
      name: "Turbine Road",
      seed: 48,
      length: "medium",
      hour: 15,
      weather: "rain",
      season: "spring",
      // The last of the wide ones, and the narrowest of the three.
      knobs: { width: 0.7, tilt: 0.6 },
      blurb: "Forty-three calls under the turbines, in the wet",
    },
    {
      id: "taiga-4",
      name: "Village Loop",
      seed: 46,
      length: "long",
      shape: "circuit",
      hour: 19,
      weather: "storm",
      season: "summer",
      blurb: "Three laps through the village, a storm coming over",
    },
    {
      id: "taiga-5",
      name: "Hunter's Line",
      seed: 45,
      length: "long",
      hour: 22,
      weather: "rain",
      season: "autumn",
      blurb: "The country stands up, and the rain comes with it",
    },
    {
      id: "taiga-6",
      name: "The Long Dark",
      seed: 1,
      length: "xlong",
      hour: 23,
      weather: "storm",
      season: "autumn",
      blurb: "Ten kilometres and ninety calls, in the dark",
    },
  ],
};

/** The Desert ladder — the second country (R40), opened by winning the
 * taiga's table. Sand off the mountain, one length of real blacktop, and a
 * sky with two weathers in it: clear, and the dust coming across.
 *
 *   seed 33 short   sprint   1.73 km   83 s   75 km/h   one jump off the fan
 *   seed 43 medium  circuit  1.60×3   192 s   90 km/h   half of it sealed
 *   seed 16 medium  sprint   4.80 km  226 s   76 km/h   five jumps
 *   seed  4 long    circuit  2.75×3   436 s   68 km/h   25 bends a lap, none soft
 *   seed 11 long    sprint   7.92 km  393 s   72 km/h   68 bends in the dust
 *   seed 23 xlong   sprint  10.63 km  583 s   66 km/h   102 bends, no tarmac at all
 *
 * The desert's winter is its WET season (climate.ts), which is why the
 * fourth rung is the one before dawn in January and not the one at noon in
 * July. */
const DESERT: CampaignLocation = {
  id: "desert",
  name: "Desert",
  blurb: "Sand, saguaro and a sky with nothing in it",
  biome: "desert",
  levels: [
    {
      id: "desert-1",
      name: "Bajada",
      seed: 33,
      length: "short",
      hour: 12,
      weather: "clear",
      season: "summer",
      blurb: "Sand off the mountain, one jump",
    },
    {
      id: "desert-2",
      name: "Blacktop Ring",
      seed: 43,
      length: "medium",
      shape: "circuit",
      hour: 22,
      weather: "clear",
      season: "autumn",
      blurb: "Three laps, half of them on real road, after dark",
    },
    {
      id: "desert-3",
      name: "Arroyo",
      seed: 16,
      length: "medium",
      hour: 17.5,
      weather: "clear",
      season: "spring",
      blurb: "Five jumps in five kilometres, into a low sun",
    },
    {
      id: "desert-4",
      name: "Cold Dawn",
      seed: 4,
      length: "long",
      shape: "circuit",
      hour: 4,
      weather: "clear",
      season: "winter",
      blurb: "Three laps before sunrise, in the desert's one wet month",
    },
    {
      id: "desert-5",
      name: "Haboob",
      seed: 11,
      length: "long",
      hour: 18,
      weather: "storm",
      season: "autumn",
      blurb: "Eight kilometres with the dust coming across",
    },
    {
      id: "desert-6",
      name: "Dune Sea",
      seed: 23,
      length: "xlong",
      hour: 23,
      weather: "storm",
      season: "summer",
      blurb: "Ten kilometres of sand, not a metre of tarmac, at night",
    },
  ],
};

/** The Alpine ladder — the third country (R47), opened by winning the
 * desert's table. Every stage of it starts beside the snow, and every
 * sprint COMES DOWN — which is the country's whole character and is
 * test-enforced (`tests/campaign_test.ts`). The circuits close on
 * themselves and so stay up on the shoulder they start on.
 *
 *   seed 17 short   sprint   1.56 km   72 s   78 km/h   97 m down in a mile
 *   seed 30 medium  circuit  1.72×3   222 s   84 km/h   three laps on the shoulder
 *   seed 27 medium  sprint   5.12 km  209 s   88 km/h   225 m down, 64% sealed
 *   seed 41 long    circuit  2.55×3   469 s   59 km/h   three jumps a lap
 *   seed  3 long    sprint   7.48 km  361 s   75 km/h   259 m down, half of it sealed
 *   seed 38 xlong   sprint  10.96 km  594 s   66 km/h   306 m down, two tunnels
 *
 * Its dials are the country rather than the level: a high massif, and a
 * pass sealed to halfway up the rock band. */
const ALPINE_KNOBS = { elevation: 0.6, steepness: 0.6, asphalt: 0.5 };
const ALPINE: CampaignLocation = {
  id: "alpine",
  name: "Alps",
  blurb: "Snow, rock and a road that comes down",
  biome: "alpine",
  levels: [
    {
      id: "alpine-1",
      name: "The Col",
      seed: 17,
      length: "short",
      knobs: ALPINE_KNOBS,
      hour: 12,
      weather: "clear",
      season: "summer",
      blurb: "Off the pass and down, ninety metres in a mile",
    },
    {
      id: "alpine-2",
      name: "First Light",
      seed: 30,
      length: "medium",
      shape: "circuit",
      knobs: ALPINE_KNOBS,
      hour: 4,
      weather: "clear",
      season: "spring",
      blurb: "Three laps on the shoulder, before the sun clears the ridge",
    },
    {
      id: "alpine-3",
      name: "Switchbacks",
      seed: 27,
      length: "medium",
      knobs: ALPINE_KNOBS,
      hour: 23,
      weather: "rain",
      season: "spring",
      blurb: "Two hundred metres down wet tarmac, into the town",
    },
    {
      id: "alpine-4",
      name: "Ridge Ring",
      seed: 41,
      length: "long",
      shape: "circuit",
      knobs: ALPINE_KNOBS,
      hour: 17.5,
      weather: "clear",
      season: "autumn",
      blurb: "Three laps high up, with three jumps on each of them",
    },
    {
      id: "alpine-5",
      name: "Cloud Line",
      seed: 3,
      length: "long",
      knobs: ALPINE_KNOBS,
      hour: 21,
      weather: "storm",
      season: "autumn",
      blurb: "Two hundred and sixty metres down, half of it sealed, in a storm",
    },
    {
      id: "alpine-6",
      name: "Summit to Valley",
      seed: 38,
      length: "xlong",
      knobs: ALPINE_KNOBS,
      hour: 23,
      weather: "storm",
      season: "winter",
      blurb: "Three hundred metres down and through two tunnels, in a blizzard",
    },
  ],
};

export const LOCATIONS: CampaignLocation[] = [TAIGA, DESERT, ALPINE];

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

/** THE DEVELOPER'S LOCKS, and the rule both halves are built on: THE LADDER
 * IS A PREFIX. A country opens once the one before it has been won
 * (`locationUnlocked`), so opening one country means opening the run up TO
 * it and shutting one means shutting everything IN FRONT of it — a board
 * with a hole in the middle is a country the game itself still refuses to
 * open. Best times and best places are left alone by both: a lock is no
 * more a result than an unlock is, and wiping the board would cost a real
 * one. */
function openLevels(
  progress: CampaignProgress,
  locations: readonly CampaignLocation[],
): CampaignProgress {
  const all = locations.flatMap((l) => l.levels.map((v) => v.id));
  const points = { ...progress.points };
  for (const id of all) points[id] = { ...(points[id] ?? {}), [PLAYER_ID]: POINTS[0] };
  return save({ ...progress, finished: [...new Set([...progress.finished, ...all])], points });
}

/** Every stage of these locations back to never having been driven. The
 * points go, and so does the FINISH LINE — a stage merely un-scored stays
 * open in the time trial (`timeTrialOpen`), and a country meant to read as
 * unreached cannot have six roads open in another mode. */
function shutLevels(
  progress: CampaignProgress,
  locations: readonly CampaignLocation[],
): CampaignProgress {
  const gone = new Set(locations.flatMap((l) => l.levels.map((v) => v.id)));
  const points = { ...progress.points };
  for (const id of gone) delete points[id];
  return save({ ...progress, finished: progress.finished.filter((id) => !gone.has(id)), points });
}

/** Mark every stage in every location won, which is what opens all of them in
 * the campaign, opens every country behind them, and opens the lot in time
 * trial. */
export function unlockEverything(): CampaignProgress {
  return openLevels(loadProgress(), LOCATIONS);
}

/** Open the campaign AS FAR AS one country — its stages and every stage
 * behind it, which is the only shape the ladder has (see `openLevels`). */
export function unlockLocation(locationId: string): CampaignProgress {
  const index = LOCATIONS.findIndex((l) => l.id === locationId);
  return openLevels(loadProgress(), index < 0 ? LOCATIONS : LOCATIONS.slice(0, index + 1));
}

/** Shut one country and everything in FRONT of it: the campaign reads as
 * having stopped at the country before this one. */
export function lockLocation(locationId: string): CampaignProgress {
  const index = LOCATIONS.findIndex((l) => l.id === locationId);
  return shutLevels(loadProgress(), index < 0 ? LOCATIONS : LOCATIONS.slice(index));
}

/** Back to a save that has never driven a stage — every country shut, every
 * best time kept. */
export function lockEverything(): CampaignProgress {
  return shutLevels(loadProgress(), LOCATIONS);
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

/** DRIVEN TO THE END, podium or not — HEADS UP's gate, and the second half
 * of the time trial's. A road you have seen the finish of is a road you can
 * race the crews over again; one you have never seen is a road you should be
 * learning in the campaign, where it counts for something. */
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

/** How many of the location's stages have a TIME on them — what the time
 * trial counts of a country, where the campaign counts stages cleared. Now
 * that the whole country opens at once, "how many are open" says nothing
 * about a player and this does. */
export function stagesTimed(location: CampaignLocation, progress: CampaignProgress): number {
  return location.levels.filter((level) => progress.best[level.id] !== undefined).length;
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

/** THE TIME TRIAL'S GATE, and it is a COUNTRY rather than a stage: all six
 * of a location's roads open together, the moment the campaign opens the
 * location itself.
 *
 * It is not a way past the campaign's own lock — the country is behind the
 * same table it always was — it is a way past the LADDER INSIDE it, which
 * the clock has no business being held behind. A player who has earned the
 * desert has earned all six of its roads, and making them podium their way
 * down the rungs a second time before they may put a clock on the fourth one
 * is asking for the campaign twice. It is the arrangement a kart game has
 * used since the beginning — win the cup, and the next cup's four tracks
 * appear in the time trial together — and the alternative teaches the player
 * that the trial is where you go once you are DONE, which is the one thing a
 * board of best times must never be.
 *
 * The second half is what a gate hung off the board cannot say on its own: a
 * stage driven to the line is open here FOREVER, whatever the points do
 * afterwards. Tearing a location's points up (`resetPoints`) shuts the
 * country behind it in the campaign, and a road whose finish line has been
 * seen cannot be un-seen. */
export function timeTrialOpen(location: CampaignLocation, progress: CampaignProgress): boolean {
  if (locationUnlocked(location, progress)) return true;
  return location.levels.some((level) => levelCompleted(level, progress));
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
