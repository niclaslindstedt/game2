// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE START CONTROL — everything between a stage being built and the stage
// being live. Two beats: the establishing shot, while the crew in front
// pulls away and the camera circles the line, and then the lights.
//
// The car is held through both, so the grid tests below cover the pair. The
// interesting number is the SUM: it is what puts the player's green light
// exactly one start interval after the car ahead, which is the whole reason
// a rally classification can be read off elapsed times at all.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  START_INTERVAL,
  TUNING,
  createGame,
  skipIntro,
  startsIn,
  step,
} from "@engine";

/** Seeds whose first sample sits well clear of zero, both ways. */
const SEEDS = [1, 2, 3, 7, 42, 20692];

/** Steps in `seconds` of sim. */
const stepsIn = (seconds: number): number => Math.round(seconds / TUNING.dt);

/** The whole ceremony, seconds. */
const START = TUNING.intro + TUNING.countdown;

describe("the start grid", () => {
  it("parks the car ON the road at the line, whatever the stage's elevation", () => {
    for (const seed of SEEDS) {
      const state = createGame({ seed });
      const grid = state.track.samples[0];
      expect(state.car.y, `seed ${seed}`).toBeCloseTo(grid.elevation, 6);
      expect(state.car.x, `seed ${seed}`).toBeCloseTo(grid.x, 6);
      expect(state.car.z, `seed ${seed}`).toBeCloseTo(grid.z, 6);
      expect(state.car.heading, `seed ${seed}`).toBeCloseTo(grid.heading, 6);
    }
  });

  it("holds that pose right through the start control", () => {
    const state = createGame({ seed: 20692 });
    const start = { ...state.car };
    for (let i = 0; i < stepsIn(START) - 1; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    expect(state.phase).toBe("countdown");
    expect(state.car.y).toBe(start.y);
    expect(state.car.z).toBe(start.z);
  });

  it("a throttle held through the lights is revving, not being wedged", () => {
    const state = createGame({ seed: 20692 });
    let respawns = 0;
    // Well past both the start control and the wedge clock, foot to the floor.
    for (let i = 0; i < stepsIn(START + 8); i++) {
      respawns += step(state, { ...NEUTRAL_INPUT, throttle: 1 }).filter(
        (e) => e.type === "respawn",
      ).length;
    }
    expect(state.phase).toBe("racing");
    expect(respawns).toBe(0);
  });

  it("revs to the throttle on the line, and lets them fall again", () => {
    const state = createGame({ seed: 20692 });
    expect(state.car.rev).toBe(0);
    // Half a second of throttle: the needle has to have moved, and it has to
    // have moved without the car moving or a gear being taken.
    for (let i = 0; i < 60; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    const blipped = state.car.rev;
    expect(blipped).toBeGreaterThan(0.5);
    expect(state.car.u).toBe(0);
    expect(state.car.gear).toBe(0);
    expect(state.phase).toBe("intro");

    for (let i = 0; i < 60; i++) step(state, NEUTRAL_INPUT);
    expect(state.car.rev).toBeLessThan(blipped * 0.5);
    expect(state.phase).toBe("intro");
  });

  it("hands the revs back to the gearing the moment the flag drops", () => {
    const state = createGame({ seed: 20692 });
    for (let i = 0; i < stepsIn(START) + 120; i++) {
      step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    }
    expect(state.phase).toBe("racing");
    // On the move the revs ARE gearing plus forward speed — the one thing
    // the tachometer, the shift light and the engine note all read.
    expect(state.car.rev).toBeCloseTo(state.car.u / state.spec.gearTop[state.car.gear], 6);
  });
});

describe("the start control's beats", () => {
  it("puts the player's green exactly one start interval after the car ahead", () => {
    // The establishing shot opens as the crew in front leaves the control,
    // so the sum of the two beats IS the interval between two cars. Break
    // this and the shot stops being the stagger the results are read off.
    expect(TUNING.intro + TUNING.countdown).toBe(START_INTERVAL);
  });

  it("opens on the shot, walks to the lights, and only then goes green", () => {
    const state = createGame({ seed: 42 });
    expect(state.phase).toBe("intro");
    for (let i = 0; i < stepsIn(TUNING.intro) - 1; i++) step(state, NEUTRAL_INPUT);
    expect(state.phase).toBe("intro");
    step(state, NEUTRAL_INPUT);
    expect(state.phase).toBe("countdown");
    for (let i = 0; i < stepsIn(TUNING.countdown) - 1; i++) step(state, NEUTRAL_INPUT);
    expect(state.phase).toBe("countdown");
    const events = step(state, NEUTRAL_INPUT);
    expect(state.phase).toBe("racing");
    expect(events.some((e) => e.type === "go")).toBe(true);
  });

  it("counts down through both beats and stops at zero", () => {
    const state = createGame({ seed: 42 });
    expect(startsIn(state)).toBeCloseTo(START, 6);
    for (let i = 0; i < stepsIn(TUNING.intro); i++) step(state, NEUTRAL_INPUT);
    expect(startsIn(state)).toBeCloseTo(TUNING.countdown, 6);
    for (let i = 0; i < stepsIn(TUNING.countdown); i++) step(state, NEUTRAL_INPUT);
    expect(state.phase).toBe("racing");
    expect(startsIn(state)).toBe(0);
  });

  it("skipping the shot lands on the lights, and reports what it jumped", () => {
    const state = createGame({ seed: 42 });
    for (let i = 0; i < stepsIn(2); i++) step(state, NEUTRAL_INPUT);
    const jumped = skipIntro(state);
    expect(jumped).toBeCloseTo(TUNING.intro - 2, 4);
    expect(state.phase).toBe("countdown");
    expect(startsIn(state)).toBeCloseTo(TUNING.countdown, 6);
    // The countdown is the one part of the start nobody skips.
    expect(skipIntro(state)).toBe(0);
    expect(state.phase).toBe("countdown");
  });

  it("skips the whole ceremony for a run nobody is sat in", () => {
    const state = createGame({ seed: 42, skipCountdown: true, quiet: true });
    expect(state.phase).toBe("racing");
    expect(startsIn(state)).toBe(0);
  });
});
