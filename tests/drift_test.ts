// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The drift, moment by moment: the handbrake flick starts it, slip holds it
// against lateral grip, the exit ends it and pays a boost when it was clean.
// Runs on a synthetic dead-straight stage so nothing but the scripted input
// shapes the car's motion.
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
  // A drift slides the car tens of meters sideways; widen the test road so
  // the drift mechanics are measured, not the off-road respawn.
  const track = { ...compileTrack(0, STRAIGHT), width: 120 };
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

describe("the drift", () => {
  it("starts on a handbrake flick at speed", () => {
    const state = game();
    run(state, { throttle: 1 }, 4);
    expect(state.car.u).toBeGreaterThan(TUNING.drift.minSpeed);
    const events = run(state, { throttle: 1, steer: 1, handbrake: true }, 0.3);
    expect(events.some((e) => e.type === "driftStart")).toBe(true);
    expect(state.car.drifting).toBe(true);
    // The kick threw the tail out: real sideways speed, immediately.
    expect(Math.abs(state.car.slip)).toBeGreaterThan(0.1);
  });

  it("does not start below the minimum speed", () => {
    const state = game();
    run(state, { throttle: 0.2 }, 0.5);
    expect(state.car.u).toBeLessThan(TUNING.drift.minSpeed);
    const events = run(state, { steer: 1, handbrake: true }, 0.3);
    expect(events.some((e) => e.type === "driftStart")).toBe(false);
  });

  it("holds while steered, ends when released, and pays a clean-exit boost", () => {
    const state = game();
    run(state, { throttle: 1 }, 5);
    run(state, { throttle: 1, steer: 1, handbrake: true }, 0.2);
    // Hold the slide on the power for over a second.
    const holdEvents = run(state, { throttle: 1, steer: 0.7 }, 1.1);
    expect(state.car.drifting).toBe(true);
    expect(holdEvents.some((e) => e.type === "driftEnd")).toBe(false);
    const before = state.car.u;
    // Release: straighten up and let the slip die.
    const exitEvents = run(state, { throttle: 1, steer: -0.2 }, 2.5);
    const end = exitEvents.find((e) => e.type === "driftEnd");
    expect(end).toBeDefined();
    if (end && end.type === "driftEnd") {
      expect(end.duration).toBeGreaterThan(TUNING.drift.minDuration);
      expect(end.clean).toBe(true);
      expect(end.boost).toBeGreaterThan(0);
      // The boost is visible as speed the moment the drift ends.
      expect(state.stats.cleanDrifts).toBe(1);
      expect(state.stats.topSpeed).toBeGreaterThan(before);
    }
  });

  it("a token flick pays nothing", () => {
    const state = game();
    run(state, { throttle: 1 }, 4);
    run(state, { throttle: 1, steer: 1, handbrake: true }, 0.05);
    const events = run(state, { throttle: 1 }, 2);
    const end = events.find((e) => e.type === "driftEnd");
    expect(end).toBeDefined();
    if (end && end.type === "driftEnd") {
      // Too short to be clean, no boost.
      expect(end.boost).toBe(0);
    }
  });

  it("also starts from a committed steering flick at speed, without handbrake", () => {
    const state = game("classic");
    run(state, { throttle: 1 }, 7);
    const events = run(state, { throttle: 1, steer: 1 }, 1.2);
    expect(events.some((e) => e.type === "driftStart")).toBe(true);
  });

  it("accumulates drift score while sideways", () => {
    const state = game();
    run(state, { throttle: 1 }, 5);
    run(state, { throttle: 1, steer: 1, handbrake: true }, 0.8);
    expect(state.stats.driftScore).toBeGreaterThan(0);
  });
});
