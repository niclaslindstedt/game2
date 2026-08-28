// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R29 — THE CAMPAIGN FIELD: the fourteen crews the player is racing, the
// budget model that decides how good they are, and the podium rule that
// decides whether the ladder opens.
//
// Four things are worth a guard here, and every one of them is silent when
// it breaks:
//
//   * A BUDGET THAT DOES NOT SPEND. The water-filling in `spend` hands an
//     axis's overflow back to the pot; get that wrong and a lopsided crew
//     quietly throws points away, which reads in the game as "hard is not
//     harder" rather than as a bug.
//   * A DIFFICULTY THAT IS NOT ONE. Easy, medium and hard have to be a
//     ladder for EVERY crew, not on average — and the field they produce has
//     to actually get quicker down it, which only the real engine can say.
//   * A ROSTER WITH A HOLE IN IT. A typo'd car id resolves to the first car
//     in the catalog rather than throwing, so half the field would silently
//     drive the same machine.
//   * A PODIUM RULE THAT LEAKS. Finishing ninth must open the time trial and
//     must NOT open the next rung of the ladder, and no storage round-trip is
//     allowed to blur the two.
//
// The engine work is real: the field runs the actual bot on the actual road,
// so the pace assertions are measurements rather than restated constants.

import { beforeEach, describe, expect, it } from "vitest";

import {
  AXIS_MAX,
  CARS,
  DIFFICULTIES,
  DIFFICULTY_IDS,
  FIELD_SIZE,
  PLAYER_NUMBER,
  RIVALS,
  SKILL_AXES,
  SKILL_MAX,
  START_INTERVAL,
  budgetFor,
  compileStage,
  profileFor,
  rivalField,
  simulateStage,
  skillPoints,
  spend,
  type BotSkill,
} from "@engine";

import {
  PODIUM,
  bestPlace,
  loadProgress,
  recordFinish,
  unlockEverything,
  levelCompleted,
  LOCATIONS,
} from "../pwa/src/game/campaign.ts";
import {
  createField,
  placeAtFinish,
  placeAtSplit,
  splitLeader,
  stepField,
  stopField,
} from "../pwa/src/game/standings.ts";

const flat = (n: number): BotSkill => {
  const skill = {} as BotSkill;
  for (const axis of SKILL_AXES) skill[axis] = n;
  return skill;
};

describe("the skill budget", () => {
  it("spends everything it is given, and never more than an axis can hold", () => {
    for (const budget of [0, 7, 19, 31, 44, SKILL_MAX]) {
      const skill = spend(budget, flat(1));
      expect(skillPoints(skill)).toBeCloseTo(budget, 6);
      for (const axis of SKILL_AXES) {
        expect(skill[axis]).toBeGreaterThanOrEqual(0);
        expect(skill[axis]).toBeLessThanOrEqual(AXIS_MAX);
      }
    }
  });

  it("hands a capped axis's overflow back rather than throwing it away", () => {
    // Everything asked for in one place, and far more than that place holds.
    const wanted = { ...flat(1), commitment: 60 };
    const skill = spend(40, wanted);
    expect(skill.commitment).toBe(AXIS_MAX);
    // The other 30 points went somewhere: a crew that wanted one thing still
    // ends up with a complete car.
    expect(skillPoints(skill)).toBeCloseTo(40, 6);
  });

  it("cannot be handed more than the model has room for", () => {
    expect(skillPoints(spend(SKILL_MAX * 3, flat(1)))).toBeCloseTo(SKILL_MAX, 6);
  });

  it("never lowers an axis when the budget goes up", () => {
    const shape = { ...flat(2), attack: 9, vision: 1 };
    let previous = spend(0, shape);
    for (let budget = 4; budget <= SKILL_MAX; budget += 4) {
      const next = spend(budget, shape);
      for (const axis of SKILL_AXES) {
        expect(next[axis]).toBeGreaterThanOrEqual(previous[axis] - 1e-9);
      }
      previous = next;
    }
  });
});

describe("the three difficulties", () => {
  it("are a ladder for every crew on the roster", () => {
    for (const crew of RIVALS) {
      const budgets = DIFFICULTY_IDS.map((id) => budgetFor(id, crew.standing));
      expect(budgets[0]).toBeLessThan(budgets[1]);
      expect(budgets[1]).toBeLessThan(budgets[2]);
      expect(budgets[2]).toBeLessThanOrEqual(SKILL_MAX);
      expect(budgets[0]).toBeGreaterThan(0);
    }
  });

  it("spread the field: the head of a difficulty outspends its tail", () => {
    for (const id of DIFFICULTY_IDS) {
      const entries = rivalField(id);
      const points = entries.map((e) => skillPoints(e.skill));
      expect(Math.max(...points) - Math.min(...points)).toBeGreaterThan(
        DIFFICULTIES[id].spread * 0.5,
      );
    }
  });

  it("actually get quicker down the ladder, driven by the real bot", () => {
    // The seeded number one at each setting, over a short stage. Ratios are
    // not needed: one crew, one car, one road, three profiles.
    const times = DIFFICULTY_IDS.map((id) => {
      const entry = rivalField(id)[0];
      const run = simulateStage({
        seed: 38,
        length: "short",
        carId: entry.crew.carId,
        profile: entry.profile,
        maxTime: 400,
      });
      expect(run.finished).toBe(true);
      return run.time;
    });
    expect(times[1]).toBeLessThan(times[0]);
    expect(times[2]).toBeLessThan(times[1]);
  });
});

describe("the roster", () => {
  it("fills the start list, with the player last out", () => {
    expect(RIVALS).toHaveLength(FIELD_SIZE - 1);
    expect(PLAYER_NUMBER).toBe(FIELD_SIZE);
    expect(START_INTERVAL).toBeGreaterThan(0);
  });

  it("is fourteen distinct crews in real cars", () => {
    const ids = new Set(RIVALS.map((c) => c.id));
    const aliases = new Set(RIVALS.map((c) => c.alias));
    const standings = new Set(RIVALS.map((c) => c.standing));
    expect(ids.size).toBe(RIVALS.length);
    expect(aliases.size).toBe(RIVALS.length);
    // Two crews on the same standing would be two crews the seeding order
    // cannot separate, and the start list would flip between builds.
    expect(standings.size).toBe(RIVALS.length);
    for (const crew of RIVALS) {
      expect(CARS.some((car) => car.id === crew.carId)).toBe(true);
      expect(crew.standing).toBeGreaterThanOrEqual(0);
      expect(crew.standing).toBeLessThanOrEqual(1);
      // A weight of zero is an axis the crew can never buy at any
      // difficulty — a car that cannot be driven rather than a weakness.
      for (const axis of SKILL_AXES) expect(crew.weights[axis]).toBeGreaterThan(0);
      // The notes are the tuning brief: a crew nobody can describe is a crew
      // that is not different from the one above it.
      expect(crew.notes.length).toBeGreaterThan(80);
    }
  });

  it("seeds the quickest reputations out first", () => {
    const entries = rivalField("medium");
    expect(entries.map((e) => e.number)).toEqual(entries.map((_, i) => i + 1));
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].crew.standing).toBeLessThan(entries[i - 1].crew.standing);
    }
  });

  it("gives every crew a driving profile that differs from its neighbours", () => {
    const seen = new Set(
      rivalField("hard").map((entry) => JSON.stringify(profileFor(entry.skill))),
    );
    expect(seen.size).toBe(RIVALS.length);
  });
});

describe("the field on the road", () => {
  it("books splits as the crews go through, and places the player behind them", () => {
    const track = compileStage(38, "short");
    const field = createField(track, "hard", {
      seed: 38,
      laps: 1,
      timeOfDay: "day",
      weather: "clear",
      season: "summer",
    });
    expect(field.of).toBe(FIELD_SIZE);
    // On the grid the player is the last car out and nobody has been through
    // anything, so the first board is theirs to lose.
    expect(placeAtSplit(field, 0)).toBe(1);
    expect(splitLeader(field, 0)).toBeNull();

    // Half a minute of racing: enough for the field to reach the first board
    // on a short stage, and cheap enough to run in a unit test.
    for (let i = 0; i < 120 * 45; i++) stepField(field);
    const through = field.runs.filter((run) => run.splits.length > 0).length;
    expect(through).toBeGreaterThan(0);
    expect(placeAtSplit(field, 0)).toBe(through + 1);

    const leader = splitLeader(field, 0);
    expect(leader).not.toBeNull();
    // Whoever is quoted IS the quickest through that board.
    for (const run of field.runs) {
      if (run.splits[0] !== undefined) expect(run.splits[0]).toBeGreaterThanOrEqual(leader!.time);
    }
    expect(RIVALS.some((crew) => crew.alias === leader!.alias)).toBe(true);

    // …and the place can only ever hold or worsen from here, because every
    // car is ahead of the player on the road and none of them can come back.
    const early = placeAtSplit(field, 0);
    for (let i = 0; i < 120 * 20; i++) stepField(field);
    expect(placeAtSplit(field, 0)).toBeGreaterThanOrEqual(early);

    stopField(field);
    const frozen = field.runs.map((run) => run.splits.length);
    for (let i = 0; i < 600; i++) stepField(field);
    expect(field.runs.map((run) => run.splits.length)).toEqual(frozen);
  });

  it("counts the cars home at the line", () => {
    const track = compileStage(38, "short");
    const field = createField(track, "easy", {
      seed: 38,
      laps: 1,
      timeOfDay: "day",
      weather: "clear",
      season: "summer",
    });
    expect(placeAtFinish(field)).toBe(1);
    for (let i = 0; i < 120 * 200; i++) stepField(field);
    const home = field.runs.filter((run) => run.time !== null).length;
    expect(home).toBeGreaterThan(RIVALS.length / 2);
    expect(placeAtFinish(field)).toBe(home + 1);
  });
});

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

const FIRST = LOCATIONS[0].levels[0];

describe("the podium rule", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("opens the time trial on any finish, and the ladder only on a podium", () => {
    const missed = recordFinish(FIRST.id, 120, { place: PODIUM + 1, difficulty: "hard" });
    expect(missed.finished).toContain(FIRST.id);
    expect(missed.cleared).not.toContain(FIRST.id);
    expect(levelCompleted(FIRST, missed)).toBe(true);

    const made = recordFinish(FIRST.id, 118, { place: PODIUM, difficulty: "hard" });
    expect(made.cleared).toContain(FIRST.id);
  });

  it("keeps the best place per difficulty, and the best time across them all", () => {
    recordFinish(FIRST.id, 130, { place: 9, difficulty: "hard" });
    recordFinish(FIRST.id, 121, { place: 2, difficulty: "easy" });
    recordFinish(FIRST.id, 140, { place: 4, difficulty: "hard" });
    const progress = loadProgress();
    expect(bestPlace(progress, FIRST.id, "hard")).toBe(4);
    expect(bestPlace(progress, FIRST.id, "easy")).toBe(2);
    expect(bestPlace(progress, FIRST.id, "medium")).toBeUndefined();
    // A time is a time whatever the field was doing.
    expect(progress.best[FIRST.id]).toBe(121);
  });

  it("posts a time and nothing else for a run with nobody entered", () => {
    const progress = recordFinish(FIRST.id, 99, null);
    expect(progress.finished).toContain(FIRST.id);
    expect(progress.cleared).not.toContain(FIRST.id);
    for (const id of DIFFICULTY_IDS) expect(bestPlace(progress, FIRST.id, id)).toBeUndefined();
  });

  it("reads a save written before the field existed as a set of finishes", () => {
    localStorage.setItem(
      "scandi-flick-campaign",
      JSON.stringify({ cleared: [FIRST.id], best: { [FIRST.id]: 90 } }),
    );
    const progress = loadProgress();
    // Nobody loses a time trial they had already opened.
    expect(progress.finished).toEqual([FIRST.id]);
    expect(progress.cleared).toEqual([FIRST.id]);
    expect(progress.places).toEqual({});
  });

  it("opens every stage on both gates when everything is unlocked", () => {
    const progress = unlockEverything();
    for (const location of LOCATIONS) {
      for (const level of location.levels) {
        expect(progress.finished).toContain(level.id);
        expect(progress.cleared).toContain(level.id);
      }
    }
  });
});
