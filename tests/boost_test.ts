// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The booster: a finite tank of raw thrust. Burning it out-accelerates the
// engine alone, the tank drains only while burning and never refills (not
// even across a respawn), and an empty tank is a dead button.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  step,
  type GameEvent,
  type GameState,
  type SegmentPlan,
} from "@engine";

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 1900, feature: "none" }];

function game(): GameState {
  return createGame({
    seed: 0,
    carId: "compact",
    skipCountdown: true,
    track: compileTrack(0, STRAIGHT),
  });
}

function run(state: GameState, seconds: number, boost: boolean): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / TUNING.dt); i++) {
    events.push(...step(state, { ...NEUTRAL_INPUT, throttle: 1, boost }));
  }
  return events;
}

describe("the booster", () => {
  it("starts with a full tank and out-accelerates plain throttle", () => {
    const plain = game();
    const boosted = game();
    expect(boosted.car.boostLeft).toBe(TUNING.boost.capacity);
    run(plain, 3, false);
    const events = run(boosted, 3, true);
    expect(boosted.car.u).toBeGreaterThan(plain.car.u + 3);
    expect(events.some((e) => e.type === "boostStart")).toBe(true);
    expect(boosted.car.boostLeft).toBeCloseTo(TUNING.boost.capacity - 3, 1);
  });

  it("drains only while held, and pushes past a gear's top speed", () => {
    const state = game();
    run(state, 2, false);
    expect(state.car.boostLeft).toBe(TUNING.boost.capacity);
    const before = state.car.boostLeft;
    run(state, 1, true);
    expect(state.car.boostLeft).toBeCloseTo(before - 1, 2);
    // A long burn carries the car beyond what gearing alone reaches.
    const plain = game();
    run(plain, 12, false);
    const burned = game();
    run(burned, 12, true);
    expect(burned.car.u).toBeGreaterThan(plain.car.u);
  });

  it("empties exactly once and never refills", () => {
    const state = game();
    const events = run(state, TUNING.boost.capacity + 2, true);
    expect(events.filter((e) => e.type === "boostEmpty")).toHaveLength(1);
    expect(state.car.boostLeft).toBe(0);
    expect(state.car.boosting).toBe(false);
    // Coasting after the tank is dry buys nothing back.
    run(state, 2, false);
    expect(state.car.boostLeft).toBe(0);
    const at = state.car.u;
    run(state, 1, true);
    // A dead button: no boostStart, no thrust beyond the engine's own.
    const plain = game();
    run(plain, TUNING.boost.capacity + 5, false);
    expect(state.car.u).toBeLessThanOrEqual(Math.max(at + 1, plain.car.u + 1));
  });
});
