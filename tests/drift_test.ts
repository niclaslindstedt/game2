// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The slide, moment by moment. There is no drift mode to test: what these
// assert is that turning hard at pace IS the drift, that it builds smoothly
// instead of snapping, that it costs the car very little speed, and that it
// parks at an angle rather than spinning. Runs on a synthetic dead-straight
// stage so nothing but the scripted input shapes the car's motion.
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

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 1500, feature: "none" }];

function game(carId = "compact"): GameState {
  // A slide carries the car tens of meters sideways; widen the test road so
  // the handling is measured, not the off-road respawn.
  const track = { ...compileTrack(0, STRAIGHT), width: 220 };
  return createGame({ seed: 0, carId, skipCountdown: true, track });
}

function run(state: GameState, input: Partial<CarInput>, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) {
    events.push(...step(state, { ...NEUTRAL_INPUT, ...input }));
  }
  return events;
}

/** Speed to the gearbox's ceiling on the straight before the corner. */
function upToSpeed(state: GameState, seconds: number): void {
  run(state, { throttle: 1 }, seconds);
}

describe("turning at pace", () => {
  it("a committed turn at speed slides the car — no handbrake, no flick", () => {
    const state = game();
    upToSpeed(state, 8);
    expect(state.car.u).toBeGreaterThan(30);
    run(state, { throttle: 1, steer: 1 }, 1);
    expect(state.car.slide).toBeGreaterThan(0.5);
    expect(state.car.drifting).toBe(true);
    expect(Math.abs(state.car.slip)).toBeGreaterThan(0.2);
  });

  it("a gentle turn at the same speed stays gripped", () => {
    const state = game();
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 0.25 }, 1.5);
    expect(state.car.slide).toBe(0);
    expect(state.car.drifting).toBe(false);
    expect(Math.abs(state.car.slip)).toBeLessThan(0.1);
  });

  it("the angle builds over tenths of a second, it does not snap out", () => {
    const state = game();
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 1 }, 0.1);
    // A tenth of a second in, the car has barely started to rotate: no kick
    // throws the tail out from under the driver.
    expect(Math.abs(state.car.slip)).toBeLessThan(0.1);
    run(state, { throttle: 1, steer: 1 }, 0.9);
    expect(Math.abs(state.car.slip)).toBeGreaterThan(0.2);
  });

  it("costs very little speed — the tires redirect the car, they do not brake it", () => {
    const state = game();
    upToSpeed(state, 8);
    const before = Math.hypot(state.car.u, state.car.w);
    run(state, { throttle: 1, steer: 1 }, 2);
    expect(state.car.slide).toBeGreaterThan(0.5);
    // Two full seconds pinned sideways on the power — a longer drift than
    // any real corner asks for — and the car still carries most of its
    // pace. Measured on the velocity's MAGNITUDE: a slide turns speed, the
    // forward component alone would count that turn as a loss. The bar sits
    // a little under the gripped case because the power's oversteer holds
    // the car DEEPER than the old parked angle, and a deeper slide pays
    // more scrub — that extra cost is the price of not catching it.
    expect(Math.hypot(state.car.u, state.car.w)).toBeGreaterThan(before * 0.78);
  });

  it("a held slide parks at an angle instead of spinning", () => {
    const state = game();
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 1 }, 1.5);
    const settled = Math.abs(state.car.slip);
    run(state, { throttle: 1, steer: 1 }, 2);
    // Still sideways, and no more sideways than it was: the deepening
    // forces saturate.
    expect(Math.abs(state.car.slip)).toBeGreaterThan(0.2);
    expect(Math.abs(state.car.slip)).toBeLessThan(settled + 0.15);
    expect(Math.abs(state.car.slip)).toBeLessThan(1);
  });

  it("counter-steer gathers it up", () => {
    const state = game();
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 1 }, 1.5);
    const sideways = Math.abs(state.car.slip);
    run(state, { throttle: 1, steer: -0.4 }, 1);
    expect(Math.abs(state.car.slip)).toBeLessThan(sideways * 0.5);
    expect(state.car.drifting).toBe(false);
  });

  it("the handbrake unsticks the rear without teleporting the car sideways", () => {
    const state = game();
    upToSpeed(state, 5);
    const speed = state.car.u;
    run(state, { throttle: 1, steer: 1, handbrake: true }, 0.05);
    // Six frames of handbrake: no injected sideways speed, no lost pace.
    expect(Math.abs(state.car.slip)).toBeLessThan(0.06);
    expect(state.car.u).toBeGreaterThan(speed * 0.97);
    // A FLICK provokes the drift within a few tenths...
    run(state, { throttle: 1, steer: 1, handbrake: true }, 0.3);
    expect(state.car.drifting).toBe(true);
    // ...and HOLDING it with the power down and full lock spins the car:
    // rear grip is cut, the driven axle keeps pushing, nothing catches it.
    run(state, { throttle: 1, steer: 1, handbrake: true }, 0.7);
    expect(Math.abs(state.car.slip)).toBeGreaterThan(1.2);
  });

  it("stays gripped below the speed where turning outruns the tires", () => {
    const state = game();
    run(state, { throttle: 0.2 }, 0.5);
    expect(state.car.u).toBeLessThan(TUNING.drift.minSpeed);
    run(state, { throttle: 0.2, steer: 1 }, 0.5);
    expect(state.car.drifting).toBe(false);
  });

  it("counts sideways time and score for the balance table", () => {
    const state = game();
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 1 }, 1.5);
    expect(state.stats.driftCount).toBe(1);
    expect(state.stats.driftTime).toBeGreaterThan(0.5);
    expect(state.stats.driftScore).toBeGreaterThan(0);
  });
});

describe("rear-wheel drive", () => {
  /** Build speed, then hold a full-lock power slide for a second. */
  function enterDrift(state: GameState): void {
    upToSpeed(state, 8);
    run(state, { throttle: 1, steer: 1 }, 1);
    expect(state.car.drifting).toBe(true);
  }

  it("centering the wheel does not end a power slide — the counter does", () => {
    const state = game();
    enterDrift(state);
    const entrySign = Math.sign(state.car.slip);
    // Wheel straight, power still down: the driven rear keeps feeding the
    // slide, so the car stays parked sideways instead of straightening.
    run(state, { throttle: 1 }, 1.5);
    expect(state.car.drifting).toBe(true);
    expect(Math.sign(state.car.slip)).toBe(entrySign);
    expect(Math.abs(state.car.slip)).toBeGreaterThan(0.3);
  });

  it("lifting the throttle calms the car without any counter-steer", () => {
    const state = game();
    enterDrift(state);
    run(state, {}, 1.5);
    expect(state.car.drifting).toBe(false);
    expect(Math.abs(state.car.slip)).toBeLessThan(0.15);
  });

  it("over-holding the counter swings the pendulum into an opposite drift", () => {
    const state = game();
    enterDrift(state);
    const entrySign = Math.sign(state.car.slip);
    // Full counter-lock held straight through the catch: the body's yaw
    // momentum plus the power carries the slip past centre into a second
    // drift the other way — which needs its own counter.
    run(state, { throttle: 1, steer: -1 }, 1.2);
    expect(Math.sign(state.car.slip)).toBe(-entrySign);
    expect(Math.abs(state.car.slip)).toBeGreaterThan(TUNING.drift.enterSlip);
    expect(state.car.drifting).toBe(true);
  });

  it("a timed counter-and-release settles the car back to straight", () => {
    const state = game();
    enterDrift(state);
    // Counter until the nose is nearly back, then breathe everything —
    // the skilled exit: no pendulum, pace kept.
    run(state, { throttle: 1, steer: -0.7 }, 0.55);
    run(state, {}, 1.2);
    expect(state.car.drifting).toBe(false);
    expect(Math.abs(state.car.slip)).toBeLessThan(0.15);
  });
});
