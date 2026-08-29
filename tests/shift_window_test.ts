// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The window a THUMB FLICK may take a gear inside (pwa/src/game/shift-window.ts).
//
// A key and a shoulder button are deliberate and get whatever gear they ask
// for; the flick is the same thumb that also brakes and holds the throttle,
// so it is held to gears the car can actually use. What is worth asserting is
// not the thresholds — those move — but that the window never opens onto a
// gear that would hurt: never up out of a gear still pulling, never down into
// a ratio the car is travelling too fast for.
//
// It imports from pwa/ because that is where the control policy lives, and it
// can: the module is DOM-free and takes a GameState.

import { describe, expect, it } from "vitest";

import {
  CARS,
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  step,
  type GameState,
  type GearboxMode,
} from "@engine";

import { shiftWindow } from "../pwa/src/game/shift-window.ts";

/** Long enough to reach top gear on and settle against drag. */
const RUNWAY = [{ kind: "straight", length: 12000, feature: "none" }] as const;

function game(carId: string, gearbox: GearboxMode = "manual"): GameState {
  return createGame({
    seed: 0,
    carId,
    gearbox,
    skipCountdown: true,
    track: compileTrack(0, [...RUNWAY]),
  });
}

/** Hold the throttle for `seconds`, taking every gear the window offers —
 * driving the car the way the touch controls can drive it, and nothing more. */
function driveOnTheWindow(state: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TUNING.dt); i++) {
    const window = shiftWindow(state);
    step(state, { ...NEUTRAL_INPUT, throttle: 1, shiftUp: window.up });
  }
}

describe("the flick's shift window", () => {
  it("is shut in the automatic box, which picks its own gears", () => {
    for (const spec of CARS) {
      const state = game(spec.id, "auto");
      driveOnTheWindow(state, 6);
      expect(shiftWindow(state)).toEqual({ up: false, down: false });
    }
  });

  it("is shut on the grid, however hard the driver leans on it", () => {
    const state = createGame({
      seed: 0,
      carId: "compact",
      gearbox: "manual",
      track: compileTrack(0, [...RUNWAY]),
    });
    expect(state.phase).not.toBe("racing");
    expect(shiftWindow(state)).toEqual({ up: false, down: false });
  });

  it("never opens UP on a gear that is still pulling", () => {
    for (const spec of CARS) {
      const state = game(spec.id);
      for (let i = 0; i < Math.round(8 / TUNING.dt); i++) {
        if (shiftWindow(state).up) {
          // The gear has genuinely run out: the car is near the top of it,
          // where the taper (car.ts) has already eaten most of the pull.
          const top = state.spec.gearTop[state.car.gear];
          expect(state.car.u / top).toBeGreaterThan(0.79);
        }
        step(state, { ...NEUTRAL_INPUT, throttle: 1, shiftUp: shiftWindow(state).up });
      }
    }
  });

  it("never opens DOWN onto a ratio the car is travelling too fast for", () => {
    for (const spec of CARS) {
      const state = game(spec.id);
      for (let i = 0; i < Math.round(8 / TUNING.dt); i++) {
        const window = shiftWindow(state);
        if (window.down) {
          // Taking it would not pin the engine on its limiter.
          const lower = state.spec.gearTop[state.car.gear - 1];
          expect(state.car.u).toBeLessThan(lower * TUNING.revs.limiter);
        } else if (state.car.gear > 0) {
          // ...and when it is shut with a gear below, that IS why.
          const lower = state.spec.gearTop[state.car.gear - 1];
          expect(state.car.u).toBeGreaterThanOrEqual(lower * TUNING.revs.limiter);
        }
        step(state, { ...NEUTRAL_INPUT, throttle: 1, shiftUp: window.up });
      }
    }
  });

  it("opens both ways somewhere in a flat-out run, so a thumb is not locked out", () => {
    const state = game("coupe");
    let sawUp = false;
    let sawDown = false;
    for (let i = 0; i < Math.round(20 / TUNING.dt); i++) {
      const window = shiftWindow(state);
      sawUp ||= window.up;
      sawDown ||= window.down;
      step(state, { ...NEUTRAL_INPUT, throttle: 1, shiftUp: window.up });
    }
    expect(sawUp).toBe(true);
    expect(sawDown).toBe(true);
    // A car driven entirely on the window still gets all the way up the box.
    expect(state.car.gear).toBe(state.spec.gearTop.length - 1);
  });

  it("shuts the up half once the box has nothing left to give", () => {
    const state = game("compact");
    driveOnTheWindow(state, 30);
    expect(state.car.gear).toBe(state.spec.gearTop.length - 1);
    expect(shiftWindow(state).up).toBe(false);
  });
});
