// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The gearbox is the DRIVER's, not the car's: every car in the roster can
// be handed over either way. The auto shifts itself through the whole box,
// the manual only moves on command (and cuts throttle while the shift
// engages), and the same car does both depending on what it was created
// with.
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
  type GearboxMode,
  type SegmentPlan,
} from "@engine";

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 1900, feature: "none" }];

function game(carId: string, gearbox: GearboxMode = "manual"): GameState {
  return createGame({
    seed: 0,
    carId,
    gearbox,
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
  it("ships one car of each drivetrain and no gearbox baked into any of them", () => {
    expect(CARS).toHaveLength(3);
    expect(CARS.map((c) => c.drive).sort()).toEqual(["awd", "fwd", "rwd"]);
    // The box is a run setting; nothing in the catalog may carry one.
    for (const car of CARS) expect(car).not.toHaveProperty("gearbox");
    expect(carById("compact").drive).toBe("fwd");
    expect(carById("classic").drive).toBe("rwd");
    expect(carById("coupe").drive).toBe("awd");
  });

  it("defaults to the automatic when the run does not ask for a box", () => {
    const state = createGame({ seed: 0, carId: "coupe", track: compileTrack(0, STRAIGHT) });
    expect(state.car.gearbox).toBe("auto");
  });

  it("the auto shifts itself up through the box on a long straight", () => {
    const state = game("compact", "auto");
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

  it("every car takes either box — the hatch drives itself, the 4WD does not", () => {
    const manualStarter = game("compact", "manual");
    flatOut(manualStarter, 15, false);
    expect(manualStarter.car.gear).toBe(0);
    const autoFourWheel = game("coupe", "auto");
    flatOut(autoFourWheel, 15, false);
    expect(autoFourWheel.car.gear).toBeGreaterThanOrEqual(3);
  });

  it("a manual driver who shifts beats one who does not", () => {
    const shifting = game("classic");
    flatOut(shifting, 20, true);
    const lazy = game("classic");
    flatOut(lazy, 20, false);
    expect(shifting.progressS).toBeGreaterThan(lazy.progressS * 1.5);
  });
});
