// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R30 — THE CHAMPIONSHIP: three points for a stage win, two for second, one
// for third, and the next country behind the table those points build.
//
// Five things are worth a guard here, and every one of them is a lock that
// fails SILENTLY — either it hands a player a country they did not earn, or
// it takes one they did:
//
//   * AN EMPTY TABLE THE PLAYER LEADS. Nobody has scored, everybody is on
//     nought, and the tie-break puts the player on top — which would open
//     the next location before a single stage had been driven.
//   * A REPLAY THAT COSTS A TITLE. A stage run again for fun must never
//     lower what it already paid, or the game has taught the player not to
//     drive it.
//   * A CLASSIFICATION THAT IS NOT ONE. The points go to a finishing ORDER,
//     so the order has to be the times — with the crews who never made the
//     line behind everybody who did.
//   * A LADDER THAT LEAKS. The stage after this one is a podium away; the
//     COUNTRY after this one is a championship away, and the results card
//     must not offer what the campaign menu locks.
//   * A SETTLE THAT NEVER SETTLES. The stragglers are run home off the
//     results card's frames, so a bot that is never coming home has to be
//     retired rather than waited for.

import { beforeEach, describe, expect, it } from "vitest";

import { RIVALS, compileStage } from "@engine";

import { LOCATIONS } from "../pwa/src/game/campaign.ts";
import {
  POINTS,
  championshipWon,
  ladderAfter,
  loadChampionship,
  locationUnlocked,
  playerStanding,
  pointsFor,
  recordStage,
  resetSeason,
  seasonComplete,
  seasonContinue,
  standings,
  winEverything,
} from "../pwa/src/game/championship.ts";
import {
  PLAYER_ID,
  createField,
  fieldResults,
  settleField,
  type ClassRow,
} from "../pwa/src/game/standings.ts";

/** A localStorage that lives for one test. */
function stubStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const TAIGA = LOCATIONS[0];

/** A result sheet where `order` finished in that order, quickest first, and
 * everybody else is behind them in roster order. */
function sheet(order: string[]): ClassRow[] {
  const ids = [...order, PLAYER_ID, ...RIVALS.map((crew) => crew.id)].filter(
    (id, i, all) => all.indexOf(id) === i,
  );
  return ids.map((id, index) => ({
    id,
    alias: id === PLAYER_ID ? "YOU" : (RIVALS.find((c) => c.id === id)?.alias ?? id),
    driver: "",
    carId: "compact",
    time: 60 + index,
    place: index + 1,
    you: id === PLAYER_ID,
  }));
}

/** Give the player `place` on every stage of the Taiga. */
function driveSeason(place: number): void {
  const ahead = RIVALS.slice(0, place - 1).map((crew) => crew.id);
  for (const level of TAIGA.levels) {
    recordStage(TAIGA.id, level.id, sheet([...ahead, PLAYER_ID]));
  }
}

describe("what a place is worth", () => {
  it("pays the podium three, two and one, and nothing below it", () => {
    expect(POINTS).toEqual([3, 2, 1]);
    expect(pointsFor(1)).toBe(3);
    expect(pointsFor(2)).toBe(2);
    expect(pointsFor(3)).toBe(1);
    // The fourth-place finish has to sting: a table where everybody scores
    // is a table nobody can lose.
    expect(pointsFor(4)).toBe(0);
    expect(pointsFor(15)).toBe(0);
  });
});

describe("the season", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("adds a location's stages up for the whole field, not just the player", () => {
    recordStage(TAIGA.id, TAIGA.levels[0].id, sheet(["frostbite", PLAYER_ID, "blink"]));
    recordStage(TAIGA.id, TAIGA.levels[1].id, sheet([PLAYER_ID, "frostbite"]));
    const table = standings(TAIGA, loadChampionship());
    const points = new Map(table.map((row) => [row.id, row.points]));
    // Second and then first: two and three.
    expect(points.get(PLAYER_ID)).toBe(5);
    // First and then second: three and two — level, and the tie goes to the
    // driver who was actually there.
    expect(points.get("frostbite")).toBe(5);
    // Third on both, once as named and once off the back of the sheet.
    expect(points.get("blink")).toBe(2);
    expect(playerStanding(TAIGA, loadChampionship()).place).toBe(1);
    // Everybody entered is on the table, scored or not.
    expect(table).toHaveLength(RIVALS.length + 1);
    expect(table.map((row) => row.place)).toEqual(table.map((_row, i) => i + 1));
  });

  it("keeps the better run when a stage is driven again", () => {
    const level = TAIGA.levels[0];
    const points = (id: string): number =>
      standings(TAIGA, loadChampionship()).find((row) => row.id === id)?.points ?? 0;
    recordStage(TAIGA.id, level.id, sheet(["frostbite", PLAYER_ID]));
    expect(points(PLAYER_ID)).toBe(2);
    expect(points("frostbite")).toBe(3);

    // A lap driven for fun, gone badly. It must not cost a single point —
    // and the field's own points from that afternoon go nowhere either.
    recordStage(TAIGA.id, level.id, sheet(["frostbite", "blink", "scrapper", PLAYER_ID]));
    expect(points(PLAYER_ID)).toBe(2);
    expect(points("scrapper")).toBe(0);

    // …and a better one replaces the whole sheet, the field with it.
    recordStage(TAIGA.id, level.id, sheet([PLAYER_ID, "frostbite"]));
    expect(points(PLAYER_ID)).toBe(3);
    expect(points("frostbite")).toBe(2);
  });

  it("counts stage wins, and breaks a tie on them", () => {
    // Two wins for the player against a rival's three seconds: level on
    // points, and the wins decide it.
    recordStage(TAIGA.id, TAIGA.levels[0].id, sheet([PLAYER_ID, "frostbite"]));
    recordStage(TAIGA.id, TAIGA.levels[1].id, sheet([PLAYER_ID, "frostbite"]));
    recordStage(TAIGA.id, TAIGA.levels[2].id, sheet(["blink", "scrapper", "frostbite"]));
    recordStage(TAIGA.id, TAIGA.levels[3].id, sheet(["blink", "scrapper", "frostbite"]));
    recordStage(TAIGA.id, TAIGA.levels[4].id, sheet(["blink", "scrapper", "frostbite"]));
    const table = standings(TAIGA, loadChampionship());
    const mine = table.find((row) => row.you);
    const rival = table.find((row) => row.id === "frostbite");
    expect(mine?.points).toBe(6);
    expect(mine?.wins).toBe(2);
    expect(rival?.points).toBe(7);
    expect(rival?.wins).toBe(0);
    // More points is still more points — wins only settle a dead heat.
    expect(rival!.place).toBeLessThan(mine!.place);
  });

  it("is not won until every stage has been driven", () => {
    const season = loadChampionship();
    // An empty table is a fifteen-way tie the player leads on the tie-break,
    // and it must not open a thing.
    expect(playerStanding(TAIGA, season).place).toBe(1);
    expect(seasonComplete(TAIGA, season)).toBe(false);
    expect(championshipWon(TAIGA, season)).toBe(false);

    driveSeason(1);
    expect(seasonComplete(TAIGA, loadChampionship())).toBe(true);
    expect(championshipWon(TAIGA, loadChampionship())).toBe(true);
  });

  it("is lost by a season of podiums that were never wins", () => {
    driveSeason(3);
    const table = standings(TAIGA, loadChampionship());
    expect(seasonComplete(TAIGA, loadChampionship())).toBe(true);
    expect(championshipWon(TAIGA, loadChampionship())).toBe(false);
    // Every stage cleared, and the crews who won them are up the road.
    expect(table.find((row) => row.you)?.points).toBe(TAIGA.levels.length * pointsFor(3));
    expect(table[0].you).toBe(false);
  });

  it("picks the season back up: forward first, then back for the wins", () => {
    const progress = { finished: [], cleared: [], best: {}, places: {} };
    // Nothing driven: the first stage, which is the only one open.
    expect(seasonContinue(TAIGA, progress, loadChampionship())?.id).toBe(TAIGA.levels[0].id);

    // Driven, but only third — the stage is cleared, so the next one is open
    // and forward is where the season goes.
    recordStage(TAIGA.id, TAIGA.levels[0].id, sheet(["frostbite", "blink", PLAYER_ID]));
    const cleared = { ...progress, cleared: [TAIGA.levels[0].id] };
    expect(seasonContinue(TAIGA, cleared, loadChampionship())?.id).toBe(TAIGA.levels[1].id);

    // …and once the open stages have all been driven, back to the first one
    // that is not a WIN.
    recordStage(TAIGA.id, TAIGA.levels[1].id, sheet([PLAYER_ID]));
    expect(seasonContinue(TAIGA, cleared, loadChampionship())?.id).toBe(TAIGA.levels[0].id);
  });

  it("starts again on a reset, and the developer unlock wins the lot", () => {
    driveSeason(1);
    expect(championshipWon(TAIGA, resetSeason(TAIGA.id))).toBe(false);
    expect(playerStanding(TAIGA, loadChampionship()).points).toBe(0);

    const won = winEverything();
    for (const location of LOCATIONS) {
      expect(championshipWon(location, won)).toBe(true);
      expect(locationUnlocked(location, won)).toBe(true);
    }
  });
});

describe("the ladder out of a country", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("opens the first location and holds every one behind it shut", () => {
    const season = loadChampionship();
    expect(locationUnlocked(LOCATIONS[0], season)).toBe(true);
    for (const location of LOCATIONS.slice(1)) {
      expect(locationUnlocked(location, season)).toBe(false);
    }
  });

  it("offers the next stage inside a location, and the end of the road at its tail", () => {
    const season = loadChampionship();
    const first = ladderAfter(TAIGA.levels[0].id, season);
    expect(first.kind).toBe("next");
    expect(first.kind === "next" && first.level.id).toBe(TAIGA.levels[1].id);

    // The last stage of the last location: there is nothing after it, won or
    // not. A location with a country behind it answers "locked" instead —
    // see the crossing test below.
    const last = TAIGA.levels[TAIGA.levels.length - 1];
    const after = ladderAfter(last.id, season);
    expect(after.kind).toBe(LOCATIONS.length > 1 ? "locked" : "end");
    if (after.kind === "locked") {
      expect(after.location.id).toBe(TAIGA.id);
      // …and the championship opens it.
      driveSeason(1);
      expect(ladderAfter(last.id, loadChampionship()).kind).toBe("next");
    }
  });
});

describe("the stage's classification", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("orders the field by their times, with the retirements behind them", () => {
    const rows = fieldResults(
      {
        runs: [
          { entry: { crew: { id: "a", alias: "A", driver: "", carId: "compact" } }, time: 90 },
          { entry: { crew: { id: "b", alias: "B", driver: "", carId: "coupe" } }, time: null },
          { entry: { crew: { id: "c", alias: "C", driver: "", carId: "classic" } }, time: 70 },
        ],
      } as never,
      { time: 80, carId: "compact" },
    );
    expect(rows.map((row) => row.id)).toEqual(["c", PLAYER_ID, "a", "b"]);
    expect(rows.map((row) => row.place)).toEqual([1, 2, 3, 4]);
    expect(rows[3].time).toBeNull();
    expect(rows[1].you).toBe(true);
    // …and that order is what the points are handed out on.
    expect(rows.map((row) => pointsFor(row.place))).toEqual([3, 2, 1, 0]);
  });

  it("runs the stragglers home off the card's frames, and retires the lost", () => {
    const track = compileStage(38, "short");
    const field = createField(track, "easy", {
      seed: 38,
      laps: 1,
      timeOfDay: "day",
      weather: "clear",
      season: "summer",
    });
    // A budget of nothing settles nothing: the card gets its frame back.
    expect(settleField(field, 0, 400)).toBe(false);

    let guard = 0;
    while (!settleField(field, 4000, 400) && guard < 400) guard += 1;
    expect(guard).toBeLessThan(400);
    // Everybody is accounted for — home, or retired at the limit.
    for (const run of field.runs) expect(run.done).toBe(true);
    expect(field.runs.some((run) => run.time !== null)).toBe(true);

    // …and the limit is what makes that true: a field given no time at all
    // is retired on the spot rather than driven forever.
    const stranded = createField(track, "easy", {
      seed: 38,
      laps: 1,
      timeOfDay: "day",
      weather: "clear",
      season: "summer",
    });
    expect(settleField(stranded, 10_000, 0)).toBe(true);
    for (const run of stranded.runs) expect(run.time).toBeNull();
  });
});
