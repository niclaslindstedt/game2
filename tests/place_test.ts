// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A RUN STOOD AT A MOMENT instead of driven to it (engine/game/place.ts).
// The contract is that the moment itself stays the engine's: a placed
// finish is a step short of the line and the next step fires `finish`
// exactly as a driven one does; a placed retirement is a car at rest with
// a dead engine and the next step retires it. Everything a card reads —
// the clock, the splits, the lap book, the progress — has to read as though
// the road behind the car had been driven, and the field stood beside it
// has to keep the stagger a classification is read off.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  START_INTERVAL,
  TUNING,
  compileStage,
  createField,
  createGame,
  finishAt,
  placeField,
  placeRun,
  step,
  type GameEvent,
  type GameState,
} from "@engine";

import { placeFromQuery } from "../pwa/src/game/place-url.ts";

const SEED = 7;

/** One compiled stage for the whole file — placing is cheap, compiling is
 * not. Every test builds its OWN run on it: a state is mutated by whoever
 * holds it. */
const SPRINT = compileStage(SEED, "short");
const CIRCUIT = compileStage(SEED, "short", undefined, "circuit");

/** Step until an event of `type` fires or `seconds` are spent; the events
 * of the step that fired it, or null. */
function stepUntil(state: GameState, type: GameEvent["type"], seconds: number): GameEvent[] | null {
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) {
    const events = step(state, NEUTRAL_INPUT);
    if (events.some((e) => e.type === type)) return events;
  }
  return null;
}

describe("placing a run", () => {
  it("stands the car on the road at the arc position asked for, racing, at pace", () => {
    const state = createGame({ seed: SEED, track: SPRINT });
    expect(state.phase).toBe("intro");
    const jumped = placeRun(state, { at: "racing", s: 600 });
    expect(state.phase).toBe("racing");
    expect(jumped).toBeGreaterThan(TUNING.intro + TUNING.countdown);
    expect(state.t).toBeCloseTo(TUNING.intro + TUNING.countdown + state.raceTime, 6);
    expect(state.raceTime).toBeGreaterThan(0);
    const here = SPRINT.samples[state.progressIndex];
    expect(Math.abs(here.s - 600)).toBeLessThan(SPRINT.step);
    expect(state.car.y).toBe(here.elevation);
    expect(state.car.u).toBeGreaterThan(20);
    expect(state.offRoad).toBe(false);
    // …and it DRIVES from there: a second of neutral input is a car
    // coasting down the road it was stood on, not one respawning off it.
    const events: GameEvent[] = [];
    for (let i = 0; i < TUNING.physicsHz; i++) events.push(...step(state, NEUTRAL_INPUT));
    expect(events.some((e) => e.type === "respawn")).toBe(false);
    expect(state.progressIndex).toBeGreaterThan(state.nearIndex - 1);
    expect(state.offRoad).toBe(false);
  });

  it("books the boards behind the car, in order, on a clock that runs to the moment", () => {
    const state = createGame({ seed: SEED, track: SPRINT, skipCountdown: true });
    const s = SPRINT.checkpoints[1].s + 20;
    placeRun(state, { at: "racing", s, time: 90 });
    expect(state.raceTime).toBe(90);
    expect(state.checkpointsPassed).toBe(2);
    expect(state.checkpointTimes).toHaveLength(2);
    expect(state.checkpointTimes[0]).toBeLessThan(state.checkpointTimes[1]);
    expect(state.checkpointTimes[1]).toBeLessThan(90);
    // The stands already passed are not cheered on the first step.
    const events = step(state, NEUTRAL_INPUT);
    expect(events.some((e) => e.type === "cheer")).toBe(false);
  });

  it("a placed finish is one step short of the line, and the next steps fire it", () => {
    const state = createGame({ seed: SEED, track: SPRINT });
    placeRun(state, { at: "finish" });
    expect(state.phase).toBe("racing");
    expect(state.checkpointsPassed).toBe(SPRINT.checkpoints.length);
    const gate = finishAt(SPRINT) as number;
    expect(state.raceTime).toBeGreaterThan(gate / 40);
    const fired = stepUntil(state, "finish", 1);
    expect(fired).not.toBeNull();
    const finish = fired?.find((e) => e.type === "finish");
    expect(finish && finish.type === "finish" ? finish.time : 0).toBeCloseTo(state.raceTime, 1);
    // R25 — with a run-out to coast down, the clock has stopped and the car
    // has not, exactly as after a driven flying finish.
    expect(state.phase).toBe("rollout");
    expect(state.lapTimes).toHaveLength(1);
  });

  it("a placed circuit finish is the last lap, with the laps before it in the book", () => {
    const state = createGame({ seed: SEED, track: CIRCUIT, laps: 3, skipCountdown: true });
    placeRun(state, { at: "finish", time: 300 });
    expect(state.lap).toBe(3);
    expect(state.lapTimes).toHaveLength(2);
    expect(state.lapTimes[0]).toBeCloseTo(100, 6);
    expect(state.lapStart).toBeCloseTo(200, 6);
    expect(state.checkpointTimes).toHaveLength(CIRCUIT.checkpoints.length * 3);
    expect(stepUntil(state, "finish", 1)).not.toBeNull();
    expect(state.lapTimes).toHaveLength(3);
    expect(state.phase).toBe("finished");
  });

  it("a placed retirement is a car at rest that the next step retires", () => {
    const state = createGame({ seed: SEED, track: SPRINT });
    placeRun(state, { at: "retire", s: 300 });
    expect(state.phase).toBe("racing");
    expect(state.car.u).toBe(0);
    expect(state.car.damage.systems.engine).toBe(1);
    const fired = stepUntil(state, "retire", 1);
    expect(fired).not.toBeNull();
    expect(state.phase).toBe("retired");

    const wheels = createGame({ seed: SEED, track: SPRINT });
    placeRun(wheels, { at: "retire", reason: "wheels" });
    const retire = stepUntil(wheels, "retire", 1)?.find((e) => e.type === "retire");
    expect(retire && retire.type === "retire" ? retire.reason : null).toBe("wheels");
  });

  it("refuses what the stage cannot hold, and moves nothing", () => {
    const endless = createGame({ seed: SEED, length: "endless", skipCountdown: true });
    const before = { ...endless.car };
    expect(placeRun(endless, { at: "finish" })).toBe(0);
    expect(endless.car.x).toBe(before.x);
    expect(endless.phase).toBe("racing");

    // Past the line — coasting down the run-out with the clock stopped — is
    // past placing.
    const over = createGame({ seed: SEED, track: SPRINT });
    placeRun(over, { at: "finish" });
    stepUntil(over, "finish", 1);
    expect(over.phase).toBe("rollout");
    const t = over.t;
    expect(placeRun(over, { at: "racing", s: 10 })).toBe(0);
    expect(over.t).toBe(t);
  });

  it("is deterministic: the same moment stands the same run", () => {
    const a = createGame({ seed: SEED, track: SPRINT });
    const b = createGame({ seed: SEED, track: SPRINT });
    placeRun(a, { at: "racing", s: 450 });
    placeRun(b, { at: "racing", s: 450 });
    for (let i = 0; i < 240; i++) {
      step(a, { ...NEUTRAL_INPUT, throttle: 1 });
      step(b, { ...NEUTRAL_INPUT, throttle: 1 });
    }
    expect(a.car).toEqual(b.car);
    expect(a.raceTime).toBe(b.raceTime);
  });
});

describe("placing the field with the run", () => {
  it("a rally field keeps its stagger: every crew is a start interval apart", () => {
    const state = createGame({ seed: SEED, track: SPRINT });
    const field = createField(
      SPRINT,
      { difficulty: "medium", cars: 15, massStart: false },
      {
        seed: SEED,
        laps: 1,
        timeOfDay: "day",
        weather: "clear",
        season: "summer",
      },
    );
    const jumped = placeRun(state, { at: "racing", s: 200, time: 30 });
    placeField(field, state, jumped);
    let out = 0;
    for (const run of field.runs) {
      // A crew already home keeps the time it posted and the debt it never
      // needed to finish paying; everybody else is on the road, and the
      // debt is paid: nobody is still in the control.
      if (run.done) continue;
      out += 1;
      expect(run.owed, run.entry.crew.alias).toBeLessThanOrEqual(0);
      // Car 14 left one interval before the player, car 13 two, and so on:
      // each crew's own clock reads the player's plus the intervals it left
      // ahead of them.
      const ahead = (field.of - run.entry.number) * START_INTERVAL;
      expect(run.state.raceTime, run.entry.crew.alias).toBeCloseTo(30 + ahead, 1);
    }
    expect(out).toBeGreaterThan(0);
  });

  it("a mass-start grid shares the player's clock exactly", () => {
    const state = createGame({ seed: SEED, track: SPRINT, gridBack: 12 });
    const field = createField(
      SPRINT,
      { difficulty: "medium", cars: 6, massStart: true },
      {
        seed: SEED,
        laps: 1,
        timeOfDay: "day",
        weather: "clear",
        season: "summer",
      },
    );
    const jumped = placeRun(state, { at: "racing", s: 200, time: 30 });
    placeField(field, state, jumped);
    for (const run of field.runs) {
      if (run.done) continue;
      expect(run.state.t, run.entry.crew.alias).toBeCloseTo(state.t, 1);
      expect(run.state.phase).toBe("racing");
    }
  });
});

describe("the placement URL", () => {
  it("reads a moment, a discipline and a level off the query", () => {
    const request = placeFromQuery("?start=1&at=racing&s=1200&time=61.5&level=taiga-2");
    expect(request.moment).toEqual({ at: "racing", s: 1200, time: 61.5, speed: undefined });
    expect(request.levelId).toBe("taiga-2");
    expect(request.mode).toBeNull();
    expect(request.paused).toBe(false);
    expect(placeFromQuery("?at=finish&mode=headsup&paused=1")).toEqual({
      moment: { at: "finish", time: undefined, speed: undefined },
      paused: true,
      mode: "headsup",
      levelId: null,
    });
    expect(placeFromQuery("?at=retire&reason=wheels").moment).toEqual({
      at: "retire",
      reason: "wheels",
      s: undefined,
      time: undefined,
    });
  });

  it("ignores what it does not know rather than guessing", () => {
    const request = placeFromQuery("?at=podium&mode=arcade&s=-5&reason=fuel");
    expect(request.moment).toBeNull();
    expect(request.mode).toBeNull();
    expect(placeFromQuery("?at=racing&s=-5&time=x").moment).toEqual({
      at: "racing",
      s: undefined,
      time: undefined,
      speed: undefined,
    });
  });
});
