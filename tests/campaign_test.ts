// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R29/R30 — THE CAMPAIGN, PLAYED FOR POINTS: three for a stage win, two for
// second, one for third, the next STAGE behind a podium and the next COUNTRY
// behind the table those points build.
//
// Six things are worth a guard here, and every one of them is a lock that
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
//     COUNTRY after this one is the whole table away, and the results card
//     must not offer what the campaign menu locks.
//   * A SETTLE THAT NEVER SETTLES. The stragglers are run home off the
//     results card's frames, so a bot that is never coming home has to be
//     retired rather than waited for.
//   * A SAVE THAT LOSES A LADDER. The points used to be a second game played
//     on top of the campaign, in a storage key of its own. A player mid-way
//     through one must come back to every stage they had opened and every
//     point they had scored.

import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_KNOBS, RIVALS, biomeRules, compileStage } from "@engine";

import {
  LOCATIONS,
  PODIUM,
  POINTS,
  campaignKnobs,
  continueAt,
  ladderAfter,
  latestOpen,
  levelCleared,
  levelForRoad,
  levelCompleted,
  levelUnlocked,
  loadProgress,
  locationComplete,
  locationStandings,
  locationUnlocked,
  locationWon,
  playerStanding,
  pointsFor,
  recordFinish,
  recordResult,
  resetPoints,
  unlockEverything,
  type CampaignLevel,
} from "../pwa/src/game/campaign.ts";
import {
  PLAYER_ID,
  RALLY_FIELD,
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
function driveLocation(place: number): void {
  const ahead = RIVALS.slice(0, place - 1).map((crew) => crew.id);
  for (const level of TAIGA.levels) {
    recordResult(level.id, sheet([...ahead, PLAYER_ID]));
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

describe("the location's table", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("adds a location's stages up for the whole field, not just the player", () => {
    recordResult(TAIGA.levels[0].id, sheet(["frostbite", PLAYER_ID, "blink"]));
    recordResult(TAIGA.levels[1].id, sheet([PLAYER_ID, "frostbite"]));
    const table = locationStandings(TAIGA, loadProgress());
    const points = new Map(table.map((row) => [row.id, row.points]));
    // Second and then first: two and three.
    expect(points.get(PLAYER_ID)).toBe(5);
    // First and then second: three and two — level, and the tie goes to the
    // driver who was actually there.
    expect(points.get("frostbite")).toBe(5);
    // Third on both, once as named and once off the back of the sheet.
    expect(points.get("blink")).toBe(2);
    expect(playerStanding(TAIGA, loadProgress()).place).toBe(1);
    // Everybody entered is on the table, scored or not.
    expect(table).toHaveLength(RIVALS.length + 1);
    expect(table.map((row) => row.place)).toEqual(table.map((_row, i) => i + 1));
  });

  it("keeps the better run when a stage is driven again", () => {
    const level = TAIGA.levels[0];
    const points = (id: string): number =>
      locationStandings(TAIGA, loadProgress()).find((row) => row.id === id)?.points ?? 0;
    recordResult(level.id, sheet(["frostbite", PLAYER_ID]));
    expect(points(PLAYER_ID)).toBe(2);
    expect(points("frostbite")).toBe(3);

    // A lap driven for fun, gone badly. It must not cost a single point —
    // and the field's own points from that afternoon go nowhere either.
    recordResult(level.id, sheet(["frostbite", "blink", "scrapper", PLAYER_ID]));
    expect(points(PLAYER_ID)).toBe(2);
    expect(points("scrapper")).toBe(0);

    // …and a better one replaces the whole sheet, the field with it.
    recordResult(level.id, sheet([PLAYER_ID, "frostbite"]));
    expect(points(PLAYER_ID)).toBe(3);
    expect(points("frostbite")).toBe(2);
  });

  it("counts stage wins, and breaks a tie on them", () => {
    // Two wins for the player against a rival's three seconds: level on
    // points, and the wins decide it.
    recordResult(TAIGA.levels[0].id, sheet([PLAYER_ID, "frostbite"]));
    recordResult(TAIGA.levels[1].id, sheet([PLAYER_ID, "frostbite"]));
    recordResult(TAIGA.levels[2].id, sheet(["blink", "scrapper", "frostbite"]));
    recordResult(TAIGA.levels[3].id, sheet(["blink", "scrapper", "frostbite"]));
    recordResult(TAIGA.levels[4].id, sheet(["blink", "scrapper", "frostbite"]));
    const table = locationStandings(TAIGA, loadProgress());
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
    const progress = loadProgress();
    // An empty table is a fifteen-way tie the player leads on the tie-break,
    // and it must not open a thing.
    expect(playerStanding(TAIGA, progress).place).toBe(1);
    expect(locationComplete(TAIGA, progress)).toBe(false);
    expect(locationWon(TAIGA, progress)).toBe(false);

    driveLocation(1);
    expect(locationComplete(TAIGA, loadProgress())).toBe(true);
    expect(locationWon(TAIGA, loadProgress())).toBe(true);
  });

  it("is lost by a run of podiums that were never wins", () => {
    driveLocation(3);
    const table = locationStandings(TAIGA, loadProgress());
    expect(locationComplete(TAIGA, loadProgress())).toBe(true);
    expect(locationWon(TAIGA, loadProgress())).toBe(false);
    // Every stage cleared, and the crews who won them are up the road.
    expect(table.find((row) => row.you)?.points).toBe(TAIGA.levels.length * pointsFor(3));
    expect(table[0].you).toBe(false);
  });

  it("picks the campaign back up: forward first, then back for the wins", () => {
    // Nothing driven: the first stage, which is the only one open.
    expect(continueAt(TAIGA, loadProgress())?.id).toBe(TAIGA.levels[0].id);

    // Driven, but only third — the stage is cleared, so the next one is open
    // and forward is where the campaign goes.
    recordResult(TAIGA.levels[0].id, sheet(["frostbite", "blink", PLAYER_ID]));
    expect(levelCleared(loadProgress(), TAIGA.levels[0].id)).toBe(true);
    expect(continueAt(TAIGA, loadProgress())?.id).toBe(TAIGA.levels[1].id);

    // Won, which opens the stage after it — and forward is still forward.
    recordResult(TAIGA.levels[1].id, sheet([PLAYER_ID]));
    expect(continueAt(TAIGA, loadProgress())?.id).toBe(TAIGA.levels[2].id);

    // …and once every OPEN stage has been driven — this one outside the
    // podium, so nothing further opens — back to the first stage that is not
    // a WIN, which is the third place standing on stage one.
    recordResult(TAIGA.levels[2].id, sheet(["frostbite", "blink", "scrapper", PLAYER_ID]));
    expect(continueAt(TAIGA, loadProgress())?.id).toBe(TAIGA.levels[0].id);
  });

  it("names the last stage a gate leaves open, for the cursor to stand on", () => {
    // Where a controller lands, and what the pad's START takes (menu-nav.ts).
    // The campaign's gate opens the stage after each podium…
    const campaign = (_level: CampaignLevel, index: number): boolean =>
      levelUnlocked(TAIGA, index, loadProgress());
    expect(latestOpen(TAIGA, campaign)?.id).toBe(TAIGA.levels[0].id);
    recordResult(TAIGA.levels[0].id, sheet([PLAYER_ID]));
    expect(latestOpen(TAIGA, campaign)?.id).toBe(TAIGA.levels[1].id);

    // …while the time trial's opens anything driven to the END, podium or
    // not, so the two gates answer differently on the same progress. A stage
    // finished off the podium opens no further campaign box and is still the
    // furthest road the clock is offered on.
    const finished = (level: CampaignLevel): boolean => levelCompleted(level, loadProgress());
    recordFinish(TAIGA.levels[1].id, 100, { place: 9, difficulty: "medium" });
    expect(latestOpen(TAIGA, finished)?.id).toBe(TAIGA.levels[1].id);
    expect(latestOpen(TAIGA, campaign)?.id).toBe(TAIGA.levels[1].id);

    // A gate that opens nothing has no answer to give rather than a wrong one.
    expect(latestOpen(TAIGA, () => false)).toBeNull();
  });

  it("starts again on a reset, and the developer unlock wins the lot", () => {
    driveLocation(1);
    recordFinish(TAIGA.levels[0].id, 100, { place: 1, difficulty: "hard" });
    expect(levelCleared(loadProgress(), TAIGA.levels[0].id)).toBe(true);
    expect(locationWon(TAIGA, resetPoints(TAIGA.id))).toBe(false);
    expect(playerStanding(TAIGA, loadProgress()).points).toBe(0);
    // The points ARE the ladder now, so a reset shuts it behind the first
    // stage — but a road whose finish line has been seen cannot be un-seen,
    // and it stays open in the time trial.
    expect(levelCleared(loadProgress(), TAIGA.levels[0].id)).toBe(false);
    expect(loadProgress().finished).toContain(TAIGA.levels[0].id);
    expect(loadProgress().best[TAIGA.levels[0].id]).toBe(100);

    const won = unlockEverything();
    for (const location of LOCATIONS) {
      expect(locationWon(location, won)).toBe(true);
      expect(locationUnlocked(location, won)).toBe(true);
    }
  });
});

describe("the line and the classification", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("clears the stage at the line, then fills the field in behind it", () => {
    // The player is home and the crews behind them are still out on the road.
    // The stage is already cleared — a player who presses straight on to the
    // next one must not lose the stage they just won.
    recordFinish(TAIGA.levels[0].id, 90, { place: 2, difficulty: "hard" });
    expect(levelCleared(loadProgress(), TAIGA.levels[0].id)).toBe(true);
    expect(playerStanding(TAIGA, loadProgress()).points).toBe(2);
    expect(
      locationStandings(TAIGA, loadProgress()).find((row) => row.id === "frostbite")?.points,
    ).toBe(0);

    // …and when the last car lands, the same run's sheet fills the rest of
    // the field in without moving the player's own points.
    recordResult(TAIGA.levels[0].id, sheet(["frostbite", PLAYER_ID]));
    expect(playerStanding(TAIGA, loadProgress()).points).toBe(2);
    expect(
      locationStandings(TAIGA, loadProgress()).find((row) => row.id === "frostbite")?.points,
    ).toBe(3);
  });

  it("never lets a worse afternoon overwrite the sheet that stands", () => {
    recordResult(TAIGA.levels[0].id, sheet([PLAYER_ID, "frostbite"]));
    // A lap for fun, gone badly — at the line and again when it settles.
    recordFinish(TAIGA.levels[0].id, 80, { place: PODIUM + 1, difficulty: "hard" });
    recordResult(TAIGA.levels[0].id, sheet(["blink", "scrapper", "frostbite", PLAYER_ID]));
    const table = locationStandings(TAIGA, loadProgress());
    expect(table.find((row) => row.you)?.points).toBe(3);
    expect(table.find((row) => row.id === "frostbite")?.points).toBe(2);
    // Second on the afternoon that was thrown away is worth nothing at all.
    expect(table.find((row) => row.id === "scrapper")?.points).toBe(0);
    // …and the best time still belongs to the run that set it.
    expect(loadProgress().best[TAIGA.levels[0].id]).toBe(80);
  });
});

describe("a save from before the campaign kept the points", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("keeps every point of the old season, and every rung it had opened", () => {
    localStorage.setItem(
      "scandi-flick-campaign",
      JSON.stringify({
        finished: [TAIGA.levels[0].id, TAIGA.levels[1].id],
        cleared: [TAIGA.levels[0].id, TAIGA.levels[1].id],
        best: { [TAIGA.levels[0].id]: 90 },
        places: {},
      }),
    );
    localStorage.setItem(
      "scandi-flick-championship",
      JSON.stringify({ taiga: { [TAIGA.levels[0].id]: { [PLAYER_ID]: 3, frostbite: 2 } } }),
    );
    const progress = loadProgress();
    // The stage the old season scored comes back exactly as it was scored…
    expect(progress.points[TAIGA.levels[0].id]).toEqual({ [PLAYER_ID]: 3, frostbite: 2 });
    // …and the one it only knew as CLEARED comes back as the thinnest podium
    // there is: the rung stays open, and no win is invented.
    expect(levelCleared(progress, TAIGA.levels[1].id)).toBe(true);
    expect(progress.points[TAIGA.levels[1].id]).toEqual({ [PLAYER_ID]: POINTS[PODIUM - 1] });
    expect(progress.best[TAIGA.levels[0].id]).toBe(90);
    expect(playerStanding(TAIGA, progress).points).toBe(3 + POINTS[PODIUM - 1]);

    // The next write folds the lot into the one record and retires the old
    // key — two boards is exactly what this merge is here to end.
    recordFinish(TAIGA.levels[2].id, 100, { place: 1, difficulty: "hard" });
    expect(localStorage.getItem("scandi-flick-championship")).toBeNull();
    expect(playerStanding(TAIGA, loadProgress()).points).toBe(3 + POINTS[PODIUM - 1] + 3);
  });
});

describe("the ladder out of a country", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("opens the first location and holds every one behind it shut", () => {
    const progress = loadProgress();
    expect(locationUnlocked(LOCATIONS[0], progress)).toBe(true);
    for (const location of LOCATIONS.slice(1)) {
      expect(locationUnlocked(location, progress)).toBe(false);
    }
  });

  it("offers the next stage inside a location, and the end of the road at its tail", () => {
    const progress = loadProgress();
    const first = ladderAfter(TAIGA.levels[0].id, progress);
    expect(first.kind).toBe("next");
    expect(first.kind === "next" && first.level.id).toBe(TAIGA.levels[1].id);

    // The last stage of the last location: there is nothing after it, won or
    // not. A location with a country behind it answers "locked" instead —
    // see the crossing test below.
    const last = TAIGA.levels[TAIGA.levels.length - 1];
    const after = ladderAfter(last.id, progress);
    expect(after.kind).toBe(LOCATIONS.length > 1 ? "locked" : "end");
    if (after.kind === "locked") {
      expect(after.location.id).toBe(TAIGA.id);
      // …and topping the table opens it.
      driveLocation(1);
      expect(ladderAfter(last.id, loadProgress()).kind).toBe("next");
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
    const field = createField(
      track,
      { ...RALLY_FIELD, difficulty: "easy" },
      {
        seed: 38,
        laps: 1,
        timeOfDay: "day",
        weather: "clear",
        season: "summer",
      },
    );
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
    const stranded = createField(
      track,
      { ...RALLY_FIELD, difficulty: "easy" },
      {
        seed: 38,
        laps: 1,
        timeOfDay: "day",
        weather: "clear",
        season: "summer",
      },
    );
    expect(settleField(stranded, 10_000, 0)).toBe(true);
    for (const run of stranded.runs) expect(run.time).toBeNull();
  });
});

describe("the desert (R40)", () => {
  const DESERT = LOCATIONS[1];

  it("is the second country, with the same six rungs as the first", () => {
    expect(DESERT.biome).toBe("desert");
    expect(DESERT.levels).toHaveLength(TAIGA.levels.length);
    expect(DESERT.levels.map((l) => l.length)).toEqual(TAIGA.levels.map((l) => l.length));
    expect(DESERT.levels.map((l) => l.shape ?? "sprint")).toEqual(
      TAIGA.levels.map((l) => l.shape ?? "sprint"),
    );
  });

  it("is built on the rule book's defaults in its own country, and only its own sky", () => {
    const offered = biomeRules("desert").weathers;
    for (const level of DESERT.levels) {
      const knobs = campaignKnobs(level);
      expect(knobs.biome).toBe("desert");
      expect({ ...knobs, biome: "taiga" }).toEqual(DEFAULT_KNOBS);
      expect(offered).toContain(level.weather);
      // No water on any of them — the country guarantees it, and a level
      // is the country's stage and nothing else.
      const track = compileStage(level.seed, level.length, knobs, level.shape ?? "sprint");
      expect(track.samples.some((s) => s.surface === "water" || s.deck !== null)).toBe(false);
      expect(track.samples.some((s) => s.surface === "sand")).toBe(true);
    }
    expect(campaignKnobs(TAIGA.levels[0]).biome).toBe("taiga");
  });

  it("is the road Roam stands on only in the desert", () => {
    const level = DESERT.levels[0];
    const knobs = campaignKnobs(level);
    expect(levelForRoad(level.seed, level.length, level.shape ?? "sprint", knobs)?.id).toBe(
      level.id,
    );
    const inTaiga = levelForRoad(level.seed, level.length, level.shape ?? "sprint", {
      ...knobs,
      biome: "taiga",
    });
    expect(inTaiga?.id).not.toBe(level.id);
  });

  it("opens behind the taiga's table, and the ladder walks into it", () => {
    stubStorage();
    expect(locationUnlocked(DESERT, loadProgress())).toBe(false);
    driveLocation(1);
    expect(locationUnlocked(DESERT, loadProgress())).toBe(true);
    const step = ladderAfter(TAIGA.levels[TAIGA.levels.length - 1].id, loadProgress());
    expect(step.kind === "next" && step.level.id).toBe(DESERT.levels[0].id);
  });
});
