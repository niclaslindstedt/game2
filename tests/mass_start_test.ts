// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MASS START — the grid a heads-up race lines up on, and the catch-up
// that pays for standing at the back of it.
//
// Two things have to hold, and the second one is the whole design:
//
//   * The GRID stands every car somewhere of its own, ON THE APRON behind the
//     start gate — nothing in front of it, nothing past the end of the run-up
//     — with the player last, behind the whole field, which is the point of
//     the mode.
//   * The CATCH-UP gives back exactly the metres the grid took, in the real
//     physics rather than on paper. `TUNING.massStart` claims that a slot
//     given `deficit / catchUpS` more drive has taken its deficit back by the
//     time the leader reaches `catchUpS`, whatever the car and whatever the
//     acceleration. That claim is what the last test below actually measures.

import { describe, expect, it } from "vitest";

import {
  GRID_DEFAULT,
  GRID_MAX,
  GRID_MIN,
  NEUTRAL_INPUT,
  STAGE_RULES,
  TUNING,
  catchUpFor,
  compileStage,
  compileTrack,
  createGame,
  entryList,
  headsUpField,
  locate,
  massStartGrid,
  step,
  type GameState,
  type SegmentPlan,
} from "@engine";
import {
  catchUpField,
  createField,
  fieldResults,
  onRoad,
  settleField,
  stepField,
} from "../pwa/src/game/standings.ts";

const M = TUNING.massStart;

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 1200, feature: "none" }];

/** The stage every launch below is measured on: dead flat, dead straight and
 * unbanked, so what separates two cars on it is the drive and nothing else. */
function straight() {
  const base = compileTrack(0, STRAIGHT);
  return { ...base, samples: base.samples.map((s) => ({ ...s, bank: 0 })) };
}

/** One car off a grid slot, flat out from its own green on a dead straight —
 * the only shape in which "how many metres did it take back" is a question
 * with a number for an answer. */
function launched(
  track: ReturnType<typeof straight>,
  slot: { back: number; lateral?: number; gain: number },
): GameState {
  return createGame({
    seed: 0,
    carId: "compact",
    track,
    skipCountdown: true,
    gridBack: slot.back,
    gridOffset: slot.lateral ?? 0,
    catchUp: slot.gain > 0 ? { gain: slot.gain, untilS: M.catchUpS } : undefined,
  });
}

/** How far along the road this car has got, m, SIGNED from the start gate —
 * negative while it is still on the apron behind it. Read off the ground
 * rather than off `progressS`, which is quantized to the sample spacing and
 * would round away the metres these tests exist to count, and projected onto
 * the road's own heading so a car sat out on the zig-zag is not credited with
 * the metres it is standing to one side. */
function along(state: GameState, line: { x: number; z: number; heading: number }): number {
  return (
    (state.car.x - line.x) * Math.sin(line.heading) +
    (state.car.z - line.z) * Math.cos(line.heading)
  );
}

/** Drive `state` flat out until it is `to` metres along, and say how many
 * steps it took. Bounded, so a car that never gets there fails on the
 * assertion rather than hanging the suite. */
function driveTo(state: GameState, to: number): number {
  const limit = Math.round(60 / TUNING.dt);
  let steps = 0;
  while (state.progressS < to && steps < limit) {
    step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    steps += 1;
  }
  return steps;
}

/** Hold the throttle down for `steps` steps. */
function flatOut(state: GameState, steps: number): void {
  for (let i = 0; i < steps; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
}

describe("the mass-start grid", () => {
  it("stands every car in a slot of its own, zig-zagged, player last", () => {
    for (let cars = GRID_MIN; cars <= GRID_MAX; cars++) {
      const grid = massStartGrid(cars);
      expect(grid, `${cars} cars`).toHaveLength(cars);
      // No two cars on the same piece of road, and no two in a row on the
      // same side of it: a zig-zag is what keeps overlapping cars apart.
      const where = new Set(grid.map((slot) => `${slot.back}/${slot.lateral}`));
      expect(where.size, `${cars} cars`).toBe(cars);
      for (let i = 1; i < cars; i++) {
        expect(grid[i].lateral, `${cars} cars, slot ${i + 1}`).toBe(-grid[i - 1].lateral);
        expect(grid[i].back - grid[i - 1].back).toBeCloseTo(M.rowGap, 6);
      }
      // Pole is on the line and owes nothing; the last slot is the deepest
      // into the apron, which is the one the player takes.
      expect(grid[0].back).toBe(0);
      expect(grid[0].deficit).toBe(0);
      expect(grid[cars - 1].back).toBe((cars - 1) * M.rowGap);
      for (const slot of grid) {
        // Where a car is put and what it is owed for being put there are the
        // same number, and the compensation never runs away with itself.
        expect(slot.deficit).toBe(slot.back);
        expect(slot.gain).toBeLessThanOrEqual(M.catchUpMax);
        expect(Math.abs(slot.lateral)).toBe(M.columnOffset);
      }
    }
  });

  it("fits the whole grid on the apron, with its bodywork to spare", () => {
    // Past the end of the run-up a car is off the stage entirely, which is
    // not a place to start a race from — so the deepest slot the game will
    // ever stand up has to be inside it, car and all.
    const deepest = massStartGrid(GRID_MAX);
    const tail = deepest[deepest.length - 1].back + TUNING.collision.halfLength;
    expect(tail).toBeLessThanOrEqual(STAGE_RULES.startZone.apron);
    // …and one more row would not be.
    const over = GRID_MAX * M.rowGap + TUNING.collision.halfLength;
    expect(over).toBeGreaterThan(STAGE_RULES.startZone.apron);
  });

  it("puts every car of it ON the road, behind the gate and never in front", () => {
    const track = straight();
    const line = track.samples[0];
    for (const slot of massStartGrid(GRID_MAX)) {
      const state = launched(track, { ...slot, gain: 0 });
      const fix = locate(track, state.car.x, state.car.z, 0);
      // On the road: inside the width, and not past the end of the apron.
      expect(fix.offRoad, `slot ${slot.number}`).toBe(false);
      expect(Math.abs(fix.lateral - slot.lateral), `slot ${slot.number}`).toBeLessThan(0.01);
      // …and BEHIND the start line, by exactly the metres it was given.
      expect(along(state, line), `slot ${slot.number}`).toBeCloseTo(-slot.back, 6);
      expect(state.car.y, `slot ${slot.number}`).toBeCloseTo(line.elevation, 6);
    }
  });

  it("gives the default grid's back row a nudge, not a shove", () => {
    const grid = massStartGrid(GRID_DEFAULT);
    const back = grid[grid.length - 1];
    expect(back.deficit).toBe((GRID_DEFAULT - 1) * M.rowGap);
    // Under the ceiling: the default is the grid that must not need the cap
    // to stay reasonable.
    expect(back.gain).toBeLessThan(M.catchUpMax);
  });

  it("puts the SLOWEST crew on pole, so the good ones have to come through", () => {
    const field = headsUpField("medium", GRID_DEFAULT);
    expect(field).toHaveLength(GRID_DEFAULT - 1);
    for (let i = 1; i < field.length; i++) {
      expect(field[i].crew.standing).toBeGreaterThan(field[i - 1].crew.standing);
      expect(field[i].number).toBe(i + 1);
    }
  });

  it("spreads a short entry list across the roster instead of skimming it", () => {
    const short = entryList(GRID_DEFAULT);
    expect(short).toHaveLength(GRID_DEFAULT - 1);
    // Both ends of the field are on it, so a short grid still runs from the
    // benchmark to the tail rather than being one tier over and over.
    const all = entryList();
    expect(short[0].id).toBe(all[0].id);
    expect(short[short.length - 1].id).toBe(all[all.length - 1].id);
    expect(new Set(short.map((c) => c.id)).size).toBe(short.length);
  });
});

describe("the catch-up", () => {
  it("is spent once and never comes back", () => {
    const state = launched(straight(), { back: 0, gain: 0.1 });
    expect(state.catchUp).not.toBeNull();
    driveTo(state, M.catchUpS + 20);
    expect(state.catchUp).toBeNull();
  });

  it("hands a back-row car its metres back by the end of the window", () => {
    const track = straight();
    const grid = massStartGrid(GRID_DEFAULT);
    const pole = grid[0];
    const back = grid[grid.length - 1];
    const front = launched(track, pole);
    const behind = launched(track, back);
    const line = track.samples[0];
    // The grid opened the gap this test exists to close.
    const opened = along(front, line) - along(behind, line);
    expect(opened).toBeCloseTo(back.deficit, 6);
    // Both leave on the same green, so the window is measured on the
    // LEADER's road and the trailing car simply gets the same seconds.
    const steps = driveTo(front, M.catchUpS);
    flatOut(behind, steps);
    const left = along(front, line) - along(behind, line);
    // Within a fifth of the deficit — the yield is a roster average and this
    // is one car off it, so what is asserted is that the metres genuinely
    // come back, not that the model is exact.
    expect(Math.abs(left)).toBeLessThan(back.deficit * 0.2);
  });

  it("scales the gain to the metres, and never past the ceiling", () => {
    expect(catchUpFor(0)).toBe(0);
    // Twice the deficit is twice the drive, right up to the cap.
    expect(catchUpFor(10)).toBeCloseTo(catchUpFor(5) * 2, 6);
    expect(catchUpFor(M.catchUpS)).toBe(M.catchUpMax);
    for (let cars = GRID_MIN; cars <= GRID_MAX; cars++) {
      for (const slot of massStartGrid(cars)) {
        expect(slot.gain, `${cars} cars, slot ${slot.number}`).toBe(catchUpFor(slot.deficit));
      }
    }
  });

  it("costs a car that is owed nothing anything at all", () => {
    const track = straight();
    const plain = launched(track, { back: 0, gain: 0 });
    const helped = launched(track, { back: 0, gain: 0.1 });
    expect(plain.catchUp).toBeNull();
    const line = track.samples[0];
    const steps = driveTo(plain, M.catchUpS);
    flatOut(helped, steps);
    // Ahead, but by the fraction of the ideal the taper actually allows —
    // which is the whole reason `catchUpYield` exists.
    const gained = along(helped, line) - along(plain, line);
    expect(gained).toBeGreaterThan(0.1 * M.catchUpS * 0.4);
    expect(gained).toBeLessThan(0.1 * M.catchUpS);
  });
});

describe("a heads-up field on the road", () => {
  const stage = {
    seed: 38,
    laps: 1,
    timeOfDay: "day",
    weather: "clear",
    season: "summer",
  } as const;

  const plan = { difficulty: "medium", cars: GRID_DEFAULT, massStart: true } as const;

  it("stands the whole grid on the road at once, owing nobody anything", () => {
    const field = createField(compileStage(38, "short"), plan, stage);
    expect(field.of).toBe(GRID_DEFAULT);
    expect(field.playerNumber).toBe(GRID_DEFAULT);
    expect(field.interval).toBe(0);
    expect(field.runs).toHaveLength(GRID_DEFAULT - 1);
    // Nobody is in a start control: a mass start has no head start to pay
    // off, so every car is somewhere the world can see and hit from step one.
    for (const run of field.runs) expect(run.owed).toBe(0);
    expect(field.runs.every(onRoad)).toBe(true);
    expect(catchUpField(field)).toBe(false);
    // …and every one of them is stood on its own slot on the apron, measured
    // back from the gate they are all about to drive through.
    const track = compileStage(38, "short");
    const line = track.samples[0];
    const grid = massStartGrid(GRID_DEFAULT);
    for (const run of field.runs) {
      const slot = grid[run.entry.number - 1];
      const car = run.state.car;
      const along =
        (car.x - line.x) * Math.sin(line.heading) + (car.z - line.z) * Math.cos(line.heading);
      expect(along, `slot ${slot.number}`).toBeCloseTo(-slot.back, 6);
    }
  });

  it("holds the grid through the same ceremony the player sits through", () => {
    const field = createField(compileStage(38, "short"), plan, stage);
    const parked = field.runs.map((run) => ({ x: run.state.car.x, z: run.state.car.z }));
    // Right up to the last frame before the green: a grid that crept would be
    // a field that left before the player did.
    const held = Math.round((TUNING.intro + TUNING.countdown) / TUNING.dt) - 1;
    for (let i = 0; i < held; i++) stepField(field);
    field.runs.forEach((run, i) => {
      expect(run.state.phase).toBe("countdown");
      expect(run.state.raceTime).toBe(0);
      expect(run.state.car.x).toBeCloseTo(parked[i].x, 6);
      expect(run.state.car.z).toBeCloseTo(parked[i].z, 6);
    });
    stepField(field);
    for (const run of field.runs) expect(run.state.phase).toBe("racing");
  });

  it("races them home, and the sheet is one order with no points on it", () => {
    const field = createField(compileStage(38, "short"), plan, stage);
    // Nobody is retired inside five minutes of race time on a short stage.
    let clear = false;
    for (let i = 0; i < 400 && !clear; i++) clear = settleField(field, 2000, 300);
    expect(clear).toBe(true);
    const rows = fieldResults(field, { time: 90, carId: "compact" });
    expect(rows).toHaveLength(GRID_DEFAULT);
    expect(rows.map((row) => row.place)).toEqual(
      Array.from({ length: GRID_DEFAULT }, (_, i) => i + 1),
    );
    // Every clock started on the same green, so a finishing order IS the
    // order of the times — no stagger to correct for.
    const times = rows.map((row) => row.time).filter((t): t is number => t !== null);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
  });
});
