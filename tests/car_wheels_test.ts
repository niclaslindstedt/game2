// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which wheels can spin, and how fast the rest of them turn.
//
// Two halves of one rule, on either side of the engine/app seam. The engine
// says how lit the DRIVEN axle is (`CarState.wheelspin`, the same torque
// `engineAccel` spins away); the renderer's wheel arithmetic
// (pwa/src/game/car-wheels.ts) turns every wheel at the speed of the ground
// under it and adds that spin to the driven pair alone. A rear-driver's
// front wheels have nothing to turn them but the road, and a car drawn
// otherwise is a car whose wheels are a texture.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  carById,
  compileTrack,
  createGame,
  step,
  type CarInput,
  type GameState,
} from "@engine";

import {
  drivenAxles,
  wheelRoadSpeed,
  wheelSurfaceSpeed,
  type WheelMotion,
} from "../pwa/src/game/car-wheels.ts";

const LONG_STRAIGHT = [{ kind: "straight", length: 9000, feature: "none" } as const];

const drive = (overrides: Partial<CarInput> = {}): CarInput => ({
  ...NEUTRAL_INPUT,
  ...overrides,
});

function freshState(carId: string): GameState {
  // A slide carries the car tens of meters sideways: the road is widened so
  // the wheels are measured rather than the off-road respawn.
  const base = compileTrack(3, LONG_STRAIGHT);
  return createGame({
    seed: 3,
    carId,
    skipCountdown: true,
    track: { ...base, width: 220 },
  });
}

/** The speed the driven wheels' own surface is travelling at, m/s. */
function wheelSpeed(state: GameState): number {
  return Math.max(0, state.car.u) + state.car.wheelspin;
}

/** ...and what the gear it is in allows at the limiter. */
function gearCeiling(state: GameState): number {
  return state.spec.gearTop[state.car.gear] * TUNING.revs.limiter;
}

/** Steady state under one input — long enough for the readout's own settle
 * (TUNING.engine.spinSettle) to have arrived wherever it is going. */
function hold(state: GameState, input: CarInput, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 120); i++) step(state, input);
}

/** Where a wheel stands, in the car's own frame: front-right by default. */
const FRONT_RIGHT = { x: 0.75, z: 1.2 };
const REAR_RIGHT = { x: 0.75, z: -1.2 };
const REAR_LEFT = { x: -0.75, z: -1.2 };

const rolling = (over: Partial<WheelMotion> = {}): WheelMotion => ({
  u: 20,
  w: 0,
  yawRate: 0,
  wheelspin: 0,
  ...over,
});

describe("the engine's wheelspin readout", () => {
  it("lights the driven axle up off the line and hands it back at cruise", () => {
    const state = freshState("classic");
    hold(state, drive({ throttle: 1 }), 0.25);
    const launch = state.car.wheelspin;
    // Off the line the rear-driver's tyres turn half again as fast as the
    // road under them — the whole cost of its launch, made visible.
    expect(launch).toBeGreaterThan(0.5 * state.car.u);
    hold(state, drive({ throttle: 1 }), 12);
    // Gone once the car is up to the gearing: the loss is worst where the
    // torque is highest and there is least speed to hide behind, and there
    // is no headroom left to spin into at the top of a gear either.
    expect(state.car.wheelspin).toBeLessThan(launch);
  });

  it("is zero with the throttle shut, whatever the car is doing", () => {
    const state = freshState("classic");
    hold(state, drive({ throttle: 1 }), 1);
    expect(state.car.wheelspin).toBeGreaterThan(0);
    hold(state, drive(), 1);
    expect(state.car.wheelspin).toBeCloseTo(0, 3);
  });

  it("costs a one-axle car more than the four-wheel-drive", () => {
    const oneAxle = freshState("classic");
    const allFour = freshState("coupe");
    hold(oneAxle, drive({ throttle: 1 }), 0.5);
    hold(allFour, drive({ throttle: 1 }), 0.5);
    expect(allFour.car.wheelspin).toBeLessThan(oneAxle.car.wheelspin);
  });

  it("lights the axle up again in a drift, where the launch's spin has gone", () => {
    const state = freshState("classic");
    hold(state, drive({ throttle: 1 }), 9);
    const cruising = state.car.wheelspin;
    hold(state, drive({ throttle: 1, steer: 1 }), 1);
    expect(state.car.slide).toBeGreaterThan(0.5);
    // A tyre spending its grip sideways has that much less of it left to
    // drive with, so the rears light up at a speed where nothing else would
    // have spun them.
    expect(state.car.wheelspin).toBeGreaterThan(cruising + 1);
  });

  it("never spins a wheel past what the gear gives at the limiter", () => {
    const state = freshState("classic");
    for (let i = 0; i < 1800; i++) {
      step(state, drive({ throttle: 1, steer: Math.sin(i / 40) }));
      expect(state.car.wheelspin).toBeGreaterThanOrEqual(0);
      // The ROAD can carry a gear past its own limiter — a downshift hands
      // the engine a wheel already turning faster than it would, which is
      // what the limiter reading is for. The SPIN never adds to that: the
      // engine cannot turn a wheel faster than it turns itself.
      const ceiling = Math.max(state.car.u, gearCeiling(state));
      expect(wheelSpeed(state)).toBeLessThanOrEqual(ceiling + 1e-6);
    }
  });
});

describe("the needle and the wheels are one number", () => {
  it("reads the revs back off the wheel speed through the gearing", () => {
    const state = freshState("classic");
    hold(state, drive({ throttle: 1 }), 0.5);
    expect(state.car.wheelspin).toBeGreaterThan(0);
    expect(state.car.rev).toBeCloseTo(wheelSpeed(state) / state.spec.gearTop[state.car.gear], 6);
  });

  it("flares the needle past the road when the axle is lit, and not otherwise", () => {
    const spinning = freshState("classic");
    hold(spinning, drive({ throttle: 1 }), 0.5);
    const roadRev = spinning.car.u / spinning.spec.gearTop[spinning.car.gear];
    expect(spinning.car.rev).toBeGreaterThan(roadRev);

    // Hooked up and coasting, the needle is the road and nothing else.
    const rolling = freshState("classic");
    hold(rolling, drive({ throttle: 1 }), 9);
    hold(rolling, drive(), 1);
    const geared = rolling.car.u / rolling.spec.gearTop[rolling.car.gear];
    expect(rolling.car.rev - geared).toBeLessThan(0.001);
  });

  it("leaves the wheels standing still on the grid, however hard the driver revs", () => {
    // Nothing is geared yet: the blip is free revs, and free revs turn
    // nothing. The grid step never reaches the handling at all.
    const base = compileTrack(3, LONG_STRAIGHT);
    const state = createGame({ seed: 3, carId: "classic", track: base });
    hold(state, drive({ throttle: 1 }), 1);
    expect(state.car.rev).toBeGreaterThan(0.5);
    expect(state.car.wheelspin).toBe(0);
  });
});

describe("which wheels the layout lets spin", () => {
  it("drives the front of a front-driver, the rear of a rear-driver, and all of a four-wheel-drive", () => {
    expect(drivenAxles(carById("compact").drive)).toEqual({ front: true, rear: false });
    expect(drivenAxles(carById("classic").drive)).toEqual({ front: false, rear: true });
    expect(drivenAxles(carById("coupe").drive)).toEqual({ front: true, rear: true });
  });

  it("leaves an undriven wheel on the road's own speed however lit the car is", () => {
    const motion = rolling({ wheelspin: 12 });
    const road = wheelRoadSpeed(motion, REAR_RIGHT, 0);
    expect(wheelSurfaceSpeed(motion, REAR_RIGHT, 0, false)).toBeCloseTo(road, 6);
    // ...and a standing car's undriven wheels do not turn at all: a
    // rear-driver lighting its tyres up on the line still has two wheels
    // that say the car has not moved.
    expect(wheelSurfaceSpeed(rolling({ u: 0, wheelspin: 12 }), FRONT_RIGHT, 0, false)).toBeCloseTo(
      0,
      6,
    );
  });

  it("lets a driven wheel outrun the road by exactly the slip it is carrying", () => {
    const motion = rolling({ wheelspin: 6 });
    const road = wheelRoadSpeed(motion, REAR_RIGHT, 0);
    expect(wheelSurfaceSpeed(motion, REAR_RIGHT, 0, true)).toBeCloseTo(road + 6, 6);
  });
});

describe("the speed of the ground under one wheel", () => {
  it("turns the inside wheel of a corner slower than the outside one", () => {
    // Turning right: the nose swings toward +x, so the right-hand wheels
    // travel the shorter arc.
    const motion = rolling({ yawRate: 0.8 });
    expect(wheelRoadSpeed(motion, REAR_RIGHT, 0)).toBeLessThan(
      wheelRoadSpeed(motion, REAR_LEFT, 0),
    );
  });

  it("slows a front wheel that is being dragged sideways on opposite lock", () => {
    // A rear-driver hung out to the right (w > 0) with the wheels crossed to
    // the left: the road is running across the tyre, not along it.
    const motion = rolling({ w: 9 });
    const crossed = wheelRoadSpeed(motion, FRONT_RIGHT, -0.5);
    expect(crossed).toBeLessThan(motion.u);
    expect(crossed).toBeGreaterThan(0);
  });

  it("counts the sideways sweep of the front axle when the wheels are turned", () => {
    // On the centerline, where the yaw rate cannot lengthen or shorten the
    // wheel's own arc, all that is left of it is the axle sweeping sideways
    // through the ground — which a wheel steered into the swing rolls with.
    const onAxis = { x: 0, z: FRONT_RIGHT.z };
    const straight = wheelRoadSpeed(rolling(), onAxis, 0.4);
    const yawing = wheelRoadSpeed(rolling({ yawRate: 1 }), onAxis, 0.4);
    expect(yawing).toBeGreaterThan(straight);
    // Pointed straight ahead the same sweep does nothing at all.
    expect(wheelRoadSpeed(rolling({ yawRate: 1 }), onAxis, 0)).toBeCloseTo(
      wheelRoadSpeed(rolling(), onAxis, 0),
      6,
    );
  });

  it("runs a wheel backwards when the car is backing out", () => {
    expect(wheelRoadSpeed(rolling({ u: -3 }), REAR_RIGHT, 0)).toBeLessThan(0);
  });
});
