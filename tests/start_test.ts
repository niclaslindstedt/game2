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
  CARS,
  NEUTRAL_INPUT,
  START_INTERVAL,
  TUNING,
  createGame,
  skipIntro,
  startsIn,
  step,
  type GameState,
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
    // On the move the revs are the DRIVEN WHEELS through the gearing — the
    // free revs of the grid are gone, and the one number the tachometer and
    // the engine note read is the drivetrain's again. Road speed plus
    // whatever the axle is spinning beyond it: a launch is still lighting
    // the tyres up a second after the flag, so the needle sits a shade over
    // the road's own reading rather than exactly on it.
    const top = state.spec.gearTop[state.car.gear];
    expect(state.car.rev).toBeCloseTo((state.car.u + state.car.wheelspin) / top, 6);
    expect(state.car.rev).toBeGreaterThanOrEqual(state.car.u / top);
  });
});

/** How long a launch is judged over, seconds — long enough for the tyres to
 * have hooked up and the field to be at pace, short enough that it is still
 * the START being measured and not the stage. */
const WINDOW = 5;

/** A launch, driven to a script: `grid` on the throttle through the whole
 * start control, nothing for `reaction` seconds after the green, then
 * `pedal` for the rest of the window. Returns how far the car actually
 * travelled from the line — measured off its own position rather than off
 * `progressS`, which is quantized to the two-metre samples and cannot see a
 * car length. */
function launch(carId: string, grid: number, reaction: number, pedal = 1): number {
  const state = createGame({ seed: 42, carId });
  for (let i = 0; i < stepsIn(START); i++) step(state, { ...NEUTRAL_INPUT, throttle: grid });
  const fromX = state.car.x;
  const fromZ = state.car.z;
  for (let i = 0; i < stepsIn(reaction); i++) step(state, NEUTRAL_INPUT);
  for (let i = 0; i < stepsIn(WINDOW - reaction); i++) {
    step(state, { ...NEUTRAL_INPUT, throttle: pedal });
  }
  return Math.hypot(state.car.x - fromX, state.car.z - fromZ);
}

/** The state one frame after the lights, with `grid` held through them. */
function atGreen(carId: string, grid: number): GameState {
  const state = createGame({ seed: 42, carId });
  for (let i = 0; i < stepsIn(START); i++) step(state, { ...NEUTRAL_INPUT, throttle: grid });
  return state;
}

const CAR_IDS = CARS.map((car) => car.id);

describe("launching off the line", () => {
  it("lights the tyres for a driver who sat on the revs, and not for one who waited", () => {
    for (const carId of CAR_IDS) {
      expect(atGreen(carId, 1).car.launchSpin, carId).toBeGreaterThan(0.7);
      // Waiting hands the tyres nothing at the drop.
      expect(atGreen(carId, 0).car.launchSpin, carId).toBe(0);
    }
    // What is left after that is the car's own axle under the pedal: a
    // four-wheel-drive can be floored off the line and a rear-driver never
    // quite can, which is the difference between the two layouts.
    const spun = (carId: string): number => {
      const state = atGreen(carId, 0);
      for (let i = 0; i < stepsIn(0.5); i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
      return state.car.launchSpin;
    };
    expect(spun("coupe")).toBe(0);
    expect(spun("classic")).toBeGreaterThan(spun("compact"));
  });

  it("pays a driver who waits — and goes on paying one who takes 0.3 s to react", () => {
    for (const carId of CAR_IDS) {
      const revved = launch(carId, 1, 0);
      // Waiting with the pedal up is worth a good few car lengths...
      expect(launch(carId, 0, 0) - revved, carId).toBeGreaterThan(8);
      // ...and the point of the whole thing: it survives a human reaction
      // time. A third of a second late off a clean launch is still ahead of
      // an instant one off a screaming engine.
      expect(launch(carId, 0, 0.3) - revved, carId).toBeGreaterThan(1);
      // Half a second, and it has all been given back — which is what keeps
      // this a start-line skill rather than a free gift for anyone who
      // happened to have their foot up.
      expect(launch(carId, 0, 0.5) - revved, carId).toBeLessThan(0);
    }
  });

  it("does not make the launch worth more than the stage it starts", () => {
    // The penalty is sized against a reaction time, so it has to stay in the
    // same order as one. A start worth tens of metres would decide stages
    // from the line, which no amount of driving afterwards could answer.
    for (const carId of CAR_IDS) {
      expect(launch(carId, 0, 0) - launch(carId, 1, 0), carId).toBeLessThan(20);
    }
  });

  it("spins the drawn wheels for it, so the picture says what the clock does", () => {
    // `wheelspin` is the readout the wheels are drawn turning at and the
    // launch cloud is thrown off. A dumped clutch has to show up in it, or
    // the player is slower with nothing on screen telling them why.
    for (const carId of CAR_IDS) {
      const revved = atGreen(carId, 1);
      const waited = atGreen(carId, 0);
      for (let i = 0; i < stepsIn(0.4); i++) {
        step(revved, { ...NEUTRAL_INPUT, throttle: 1 });
        step(waited, { ...NEUTRAL_INPUT, throttle: 1 });
      }
      expect(revved.car.wheelspin, carId).toBeGreaterThan(waited.car.wheelspin + 1);
      expect(revved.car.u, carId).toBeLessThan(waited.car.u);
    }
  });

  it("hooks the tyres back up sooner for a driver who eases off", () => {
    // The one thing an analogue pedal buys, and the only thing: a shorter
    // mistake. Flooring it has to stay the right call — a binary pedal has
    // no other option — so this is measured on the SPIN, not on the clock.
    const held = atGreen("classic", 1);
    const eased = atGreen("classic", 1);
    for (let i = 0; i < stepsIn(0.6); i++) {
      step(held, { ...NEUTRAL_INPUT, throttle: 1 });
      step(eased, { ...NEUTRAL_INPUT, throttle: 0.3 });
    }
    expect(eased.car.launchSpin).toBeLessThan(held.car.launchSpin);
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
