// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The jump, moment by moment: the lip throws the car, the air is committed
// (gravity plus barely any nose authority), and the landing pays or punishes
// depending on how straight you touch down. Synthetic one-jump stage.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  step,
  type CarInput,
  type GameEvent,
  type GameState,
  type SegmentPlan,
} from "@engine";

const JUMP_STAGE: SegmentPlan[] = [
  {
    kind: "straight",
    length: 700,
    feature: "jump",
    featureStart: 400,
    featureEnd: 414,
    lipHeight: 2,
  },
  { kind: "straight", length: 400, feature: "none" },
];

function game(): GameState {
  return createGame({
    seed: 0,
    carId: "classic",
    skipCountdown: true,
    track: compileTrack(0, JUMP_STAGE),
  });
}

function run(state: GameState, input: Partial<CarInput>, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) {
    events.push(...step(state, { ...NEUTRAL_INPUT, ...input }));
  }
  return events;
}

function driveToLip(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  let guard = 0;
  while (!state.car.airborne && guard < 120 * 60) {
    events.push(
      ...step(state, {
        ...NEUTRAL_INPUT,
        throttle: 1,
        shiftUp: state.car.u > state.spec.gearTop[state.car.gear] * 0.93,
      }),
    );
    guard += 1;
  }
  return events;
}

describe("the jump", () => {
  it("climbs the ramp smoothly — no hopping its way up", () => {
    const state = game();
    // Roll up to the ramp and record every height on the way up it.
    const heights: number[] = [];
    const pitches: number[] = [];
    let guard = 0;
    const drive = (): void => {
      step(state, {
        ...NEUTRAL_INPUT,
        throttle: 1,
        shiftUp: state.car.u > state.spec.gearTop[state.car.gear] * 0.93,
      });
      guard += 1;
    };
    // Run up to the foot of the ramp first and take the car's height THERE
    // as the floor. The road has a cross-section (R16) — a crown, and two
    // wheel tracks a car settles into — so "on the flat" is not zero, and a
    // threshold measured off zero starts recording part-way up the ramp.
    while (state.progressS < JUMP_STAGE[0].featureStart! - 20 && guard < 120 * 60) drive();
    const rest = state.car.y;
    while (!state.car.airborne && guard < 120 * 60) {
      drive();
      if (state.car.y > rest + 0.05 && !state.car.airborne) {
        heights.push(state.car.y);
        // The attitude the renderer draws: vy/u is the gradient the car is
        // climbing, and on the ramp that is the ramp's own slope.
        pitches.push(Math.atan2(state.car.vy, state.car.u));
      }
    }
    expect(heights.length).toBeGreaterThan(20);
    // Monotonic up the ramp, and climbing at a rate that only ever changes
    // gradually: the road is sampled every 2 m, so a car that snapped to the
    // nearest sample would climb in ~0.5 m stairs — alternating plateaus and
    // jumps — and bounce off every one of them.
    const climb: number[] = [];
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1]);
      climb.push(heights[i] - heights[i - 1]);
    }
    for (let i = 1; i < climb.length; i++) {
      expect(Math.abs(climb[i] - climb[i - 1])).toBeLessThan(0.02);
    }
    // Nose up the whole climb — this is the tilt, and it is never absurd.
    expect(Math.min(...pitches)).toBeGreaterThan(0);
    expect(Math.max(...pitches)).toBeLessThan(0.6);
  });

  it("the lip throws the car with upward speed scaled by pace", () => {
    const state = game();
    const events = driveToLip(state);
    const takeoff = events.find((e) => e.type === "takeoff");
    expect(takeoff).toBeDefined();
    if (takeoff && takeoff.type === "takeoff") {
      expect(takeoff.vy).toBeGreaterThan(1);
    }
    expect(state.car.airborne).toBe(true);
    expect(state.car.y).toBeGreaterThan(0);
  });

  it("flight carries: real air time, forward speed nearly kept", () => {
    const state = game();
    driveToLip(state);
    const speedAtTakeoff = state.car.u;
    const events = run(state, {}, 3);
    const landing = events.find((e) => e.type === "landing");
    expect(landing).toBeDefined();
    if (landing && landing.type === "landing") {
      expect(landing.airTime).toBeGreaterThan(0.5);
      expect(landing.clean).toBe(true);
    }
    expect(state.car.airborne).toBe(false);
    // A straight, clean landing keeps the speed the car flew with.
    expect(state.car.u).toBeGreaterThan(speedAtTakeoff * 0.9);
    expect(state.stats.jumps).toBe(1);
    expect(state.stats.cleanLandings).toBe(1);
  });

  it("midair the nose barely answers — the velocity is committed", () => {
    const state = game();
    driveToLip(state);
    const headingAt = state.car.heading;
    const xAt = state.car.x;
    run(state, { steer: 1 }, 0.4);
    // Full lock for 0.4 s of flight turns the nose only a few degrees...
    expect(Math.abs(state.car.heading - headingAt)).toBeLessThan(0.1);
    // ...and the flight path stays put (no mid-air lane change).
    expect(Math.abs(state.car.x - xAt)).toBeLessThan(1.5);
  });

  it("a sideways landing scrubs speed and wobbles the car", () => {
    const state = game();
    driveToLip(state);
    // Force a sideways attitude midair: hold the wheel the whole flight.
    let guard = 0;
    let speedBefore = state.car.u;
    const events: GameEvent[] = [];
    while (state.car.airborne && guard < 120 * 6) {
      speedBefore = state.car.u;
      // Crank sideways speed directly — the air keeps w frozen, so a messy
      // takeoff attitude survives to the landing. -14 against ~35 m/s
      // forward is a ~22° slip: well past the clean-landing limit.
      state.car.w = -14;
      events.push(...step(state, { ...NEUTRAL_INPUT }));
      guard += 1;
    }
    const landing = events.find((e) => e.type === "landing");
    expect(landing).toBeDefined();
    if (landing && landing.type === "landing") {
      expect(landing.clean).toBe(false);
    }
    expect(state.car.u).toBeLessThan(speedBefore);
    expect(state.stats.cleanLandings).toBe(0);
  });
});
