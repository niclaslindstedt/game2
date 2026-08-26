// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The two launch cars and their gearboxes: the auto shifts itself through
// the whole box, the manual only moves on the driver's command (and cuts
// throttle while the shift engages).
import { describe, expect, it } from "vitest";

import {
  CARS,
  NEUTRAL_INPUT,
  TUNING,
  carById,
  compileTrack,
  createGame,
  step,
  type GameEvent,
  type GameState,
  type SegmentPlan,
} from "@engine";

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 1900, feature: "none" }];

function game(carId: string): GameState {
  return createGame({
    seed: 0,
    carId,
    skipCountdown: true,
    track: compileTrack(0, STRAIGHT),
  });
}

function flatOut(state: GameState, seconds: number, shift = false): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / TUNING.dt); i++) {
    const wantUp =
      shift && state.car.u > state.spec.gearTop[state.car.gear] * 0.93 && !state.car.airborne;
    events.push(...step(state, { ...NEUTRAL_INPUT, throttle: 1, shiftUp: wantUp }));
  }
  return events;
}

describe("cars and gearboxes", () => {
  it("ships exactly the two launch cars — one auto, one manual", () => {
    expect(CARS).toHaveLength(2);
    expect(CARS.map((c) => c.gearbox).sort()).toEqual(["auto", "manual"]);
    expect(carById("compact").gearbox).toBe("auto");
    expect(carById("classic").gearbox).toBe("manual");
  });

  it("the auto shifts itself up through the box on a long straight", () => {
    const state = game("compact");
    const events = flatOut(state, 25);
    const shifts = events.filter((e) => e.type === "shift");
    expect(shifts.length).toBeGreaterThanOrEqual(3);
    expect(state.car.gear).toBeGreaterThanOrEqual(3);
    // Top speed approaches the top gear's ceiling.
    expect(state.car.u).toBeGreaterThan(state.spec.gearTop[state.car.gear] * 0.8);
  });

  it("the manual never shifts on its own", () => {
    const state = game("classic");
    const events = flatOut(state, 15, false);
    expect(events.filter((e) => e.type === "shift")).toHaveLength(0);
    expect(state.car.gear).toBe(0);
    // Stuck in first: speed is pinned at the gear ceiling.
    expect(state.car.u).toBeLessThanOrEqual(state.spec.gearTop[0] + 0.5);
  });

  it("the manual shifts on command and cuts throttle briefly", () => {
    const state = game("classic");
    flatOut(state, 6, false);
    const before = state.car.gear;
    const events: GameEvent[] = [];
    events.push(...step(state, { ...NEUTRAL_INPUT, throttle: 1, shiftUp: true }));
    expect(state.car.gear).toBe(before + 1);
    expect(events.some((e) => e.type === "shift")).toBe(true);
    expect(state.car.shiftCutUntil).toBeGreaterThan(state.t);
  });

  it("a manual driver who shifts beats one who does not", () => {
    const shifting = game("classic");
    flatOut(shifting, 20, true);
    const lazy = game("classic");
    flatOut(lazy, 20, false);
    expect(shifting.progressS).toBeGreaterThan(lazy.progressS * 1.5);
  });
});
