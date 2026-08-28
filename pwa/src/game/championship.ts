// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R30 — THE CHAMPIONSHIP: what a season of stages adds up to, and what it
// takes to leave a country.
//
// A stage is a result; a location is a SEASON of them. Every stage hands the
// podium points the way a kart game does — three for the win, two for second,
// one for third, nothing for anybody else — and those points are kept for the
// whole field, not just for the player, because the thing that has to be true
// at the end is "you beat these fourteen crews", and that is only a sentence
// if their points are on the board beside yours.
//
// AND IT IS THE LOCK. Clearing every stage of a location on the podium opens
// the stage after it (R29); winning the location's CHAMPIONSHIP is what opens
// the next location. So a player who scrapes third all season has seen the
// whole country and still has a reason to go back to the stage they were
// slowest on — which is exactly the reason a points table exists in a game
// where every stage can be run again.
//
// The points live in their own storage key rather than in `CampaignProgress`:
// a save written before the championship existed simply has no season yet,
// and reading one back must not disturb a single cleared stage.

import { RIVALS } from "@engine";

import {
  LOCATIONS,
  findLevel,
  levelUnlocked,
  nextLevel,
  type CampaignLevel,
  type CampaignLocation,
  type CampaignProgress,
} from "./campaign.ts";
import { PLAYER_ID, type ClassRow } from "./standings.ts";

/** What a place is worth, best first. Off the end of it a stage is worth
 * nothing at all: a points table where everybody scores is a starting-money
 * table, and the fourth-place finish has to STING. */
export const POINTS = [3, 2, 1] as const;

/** What finishing `place` (1-based) pays. */
export function pointsFor(place: number): number {
  return POINTS[place - 1] ?? 0;
}

/** Points for one stage, by crew id (`PLAYER_ID` for the player's own run). */
export type StageScores = Record<string, number>;

/** A location's season so far: what each stage paid, by stage id. Stages
 * never driven are simply absent. */
export type LocationSeason = Record<string, StageScores>;

/** Every location's season, by location id. */
export type Championship = Record<string, LocationSeason>;

const SEASON_KEY = "scandi-flick-championship";

/** One crew's season: what they have, and how they got it. */
export type ChampionshipRow = {
  id: string;
  alias: string;
  driver: string;
  points: number;
  /** Stage wins — the first tie-break, and the line a season is remembered
   * by. */
  wins: number;
  /** 1 is the championship lead. */
  place: number;
  /** Somebody else is on the same points and the same wins, so this place is
   * a tie-break rather than a gap — written the way a results sheet writes
   * one, with an equals sign in front of it. */
  tied: boolean;
  you: boolean;
};

function scores(value: unknown): StageScores {
  if (typeof value !== "object" || value === null) return {};
  const out: StageScores = {};
  for (const [id, points] of Object.entries(value as Record<string, unknown>)) {
    if (typeof points === "number" && Number.isFinite(points)) out[id] = points;
  }
  return out;
}

export function loadChampionship(): Championship {
  try {
    const stored = localStorage.getItem(SEASON_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const out: Championship = {};
    for (const [locationId, season] of Object.entries(parsed)) {
      if (typeof season !== "object" || season === null) continue;
      const stages: LocationSeason = {};
      for (const [levelId, row] of Object.entries(season as Record<string, unknown>)) {
        stages[levelId] = scores(row);
      }
      out[locationId] = stages;
    }
    return out;
  } catch {
    return {};
  }
}

function save(season: Championship): Championship {
  try {
    localStorage.setItem(SEASON_KEY, JSON.stringify(season));
  } catch {
    /* storage unavailable — the season still stands for this sitting */
  }
  return season;
}

/** What a stage's finishing order paid everybody on it. */
export function scoreStage(rows: readonly ClassRow[]): StageScores {
  const out: StageScores = {};
  for (const row of rows) out[row.id] = pointsFor(row.place);
  return out;
}

/** Book a stage's result into its location's season.
 *
 * A campaign stage can be run again as often as the player likes, so a stage
 * already on the board keeps THE BETTER RUN — the one worth more to the
 * player, and the whole field's points from that same afternoon with it. A
 * table where a lap driven for fun can cost a championship is a table that
 * teaches players not to drive. Ties keep what was already there. */
export function recordStage(
  locationId: string,
  levelId: string,
  rows: readonly ClassRow[],
): Championship {
  const season = loadChampionship();
  const stages = { ...(season[locationId] ?? {}) };
  const scored = scoreStage(rows);
  const stood = stages[levelId];
  if (stood === undefined || (scored[PLAYER_ID] ?? 0) > (stood[PLAYER_ID] ?? 0)) {
    stages[levelId] = scored;
  }
  return save({ ...season, [locationId]: stages });
}

/** THE TABLE — every crew entered in the location, the player included,
 * best first. Ties go to stage wins, and then to the player: a season that
 * ends level and hands the country to the machine is a lock with no visible
 * way in. Below that, the field's own reputation order breaks it. */
export function standings(location: CampaignLocation, season: Championship): ChampionshipRow[] {
  const stages = season[location.id] ?? {};
  const tally = (id: string): { points: number; wins: number } => {
    let points = 0;
    let wins = 0;
    for (const level of location.levels) {
      const got = stages[level.id]?.[id] ?? 0;
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
export function playerStanding(location: CampaignLocation, season: Championship): ChampionshipRow {
  const table = standings(location, season);
  return table.find((row) => row.you) ?? table[table.length - 1];
}

/** What the stage just driven paid each crew — the results card's PTS
 * column, read back out of the season so a re-run that was NOT kept shows
 * the points that actually count. */
export function stageScores(
  locationId: string,
  levelId: string,
  season: Championship,
): StageScores {
  return season[locationId]?.[levelId] ?? {};
}

/** Every stage of the location driven at least once — a season is not over
 * while a stage of it has never been started, however well the ones that
 * have are going. */
export function seasonComplete(location: CampaignLocation, season: Championship): boolean {
  const stages = season[location.id] ?? {};
  return location.levels.every((level) => stages[level.id] !== undefined);
}

/** WON — the season is complete and the player is top of its table. Both
 * halves matter: a table nobody has scored on is a table the player leads on
 * the tie-break, and an empty season must not open a country. */
export function championshipWon(location: CampaignLocation, season: Championship): boolean {
  return seasonComplete(location, season) && playerStanding(location, season).place === 1;
}

/** WHERE THE SEASON PICKS BACK UP. Forward first: the next stage of the
 * location the player has not driven at all. Once the season has been all the
 * way through, back to the first stage they have not WON — which is the
 * whole shape of a points championship, and the reason a cleared stage is
 * still worth going back to. Null when every open stage is already a win. */
export function seasonContinue(
  location: CampaignLocation,
  progress: CampaignProgress,
  season: Championship,
): CampaignLevel | null {
  const stages = season[location.id] ?? {};
  const open = location.levels.filter((_level, index) => levelUnlocked(location, index, progress));
  return (
    open.find((level) => stages[level.id] === undefined) ??
    open.find((level) => (stages[level.id]?.[PLAYER_ID] ?? 0) < POINTS[0]) ??
    null
  );
}

/** Tear the location's table up and start the season again. Every stage
 * stays cleared — a season is a scoreboard, not the ladder — so this costs
 * points and nothing else. */
export function resetSeason(locationId: string): Championship {
  const season = loadChampionship();
  const out = { ...season };
  delete out[locationId];
  return save(out);
}

/** Hand the player every stage win there is — the developer menu's unlock,
 * which opens the ladder and must open the countries behind it too. */
export function winEverything(): Championship {
  const season = loadChampionship();
  const out: Championship = { ...season };
  for (const location of LOCATIONS) {
    const stages = { ...(out[location.id] ?? {}) };
    for (const level of location.levels) {
      stages[level.id] = { ...(stages[level.id] ?? {}), [PLAYER_ID]: POINTS[0] };
    }
    out[location.id] = stages;
  }
  return save(out);
}

/** A location opens once the one before it has been WON. The first one is
 * always open, and a location the ladder has not reached yet is shut however
 * many stages behind it are cleared. */
export function locationUnlocked(location: CampaignLocation, season: Championship): boolean {
  const index = LOCATIONS.indexOf(location);
  if (index <= 0) return true;
  return championshipWon(LOCATIONS[index - 1], season);
}

/** Where the ladder goes after a stage: the next rung, the next COUNTRY
 * behind its championship, or the end of the road. */
export type LadderStep =
  | { kind: "next"; level: CampaignLevel }
  | { kind: "locked"; location: CampaignLocation }
  | { kind: "end" };

/** What the results card may offer after `levelId`. The next stage inside a
 * location is a podium away (R29); the first stage of the NEXT one is behind
 * this location's championship, so a player who has cleared every stage in
 * third place is shown the lock rather than the stage. */
export function ladderAfter(levelId: string, season: Championship): LadderStep {
  const after = nextLevel(levelId);
  if (!after) return { kind: "end" };
  const here = findLevel(levelId);
  const there = findLevel(after.id);
  if (!here || !there) return { kind: "end" };
  if (there.location === here.location) return { kind: "next", level: after };
  return locationUnlocked(there.location, season)
    ? { kind: "next", level: after }
    : { kind: "locked", location: here.location };
}
