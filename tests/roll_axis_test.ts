// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AXIS A CRASHING BODY TURNS ABOUT.
//
// `CarState.x/y/z` is the ORIGIN — the wheel contact plane under the car's
// middle, which the renderer hangs the whole body off — and the weight rides
// half a metre above it. A body in the air turns about its weight, so the
// weight is what flies straight and the origin is what goes round: out to
// the side as the car comes onto its flank, back under it on its roof. Step
// the origin straight instead and the weight swings round the wheel plane on
// the arm of its own height, which reads from any seat as a car slung round
// an axis somewhere under it.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  massSpread,
  rollTilt,
  step,
  weightFromOrigin,
  type GameState,
  type SegmentPlan,
} from "@engine";

const STAGE: SegmentPlan[] = [{ kind: "straight", length: 900, feature: "none" }];

/** Where the WEIGHT is, in the world's x/z, off the origin and the attitude. */
function weightAt(state: GameState): { x: number; z: number } {
  const car = state.car;
  const at = weightFromOrigin(
    rollTilt(car.roll),
    rollTilt(car.pitch),
    massSpread(state.spec).weight,
  );
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  return {
    x: car.x + cosH * at.across + sinH * at.along,
    z: car.z + cosH * at.along - sinH * at.across,
  };
}

/** A body thrown clear: rolling, well off the ground, turning on all three
 * axes at once, with no travel of its own so the only motion the origin can
 * have is the walk the attitude gives it. */
function thrown(): GameState {
  const state = createGame({
    seed: 0,
    carId: "classic",
    skipCountdown: true,
    track: compileTrack(0, STAGE),
  });
  state.terrain.obstaclesNear = () => [];
  state.terrain.treesNear = () => [];
  const car = state.car;
  car.rolling = true;
  car.planted = false;
  car.airborne = true;
  car.airTime = 0.01;
  car.y += 6;
  car.vy = 4;
  car.u = 0;
  car.w = 0;
  car.roll = 0.3;
  car.rollRate = 6;
  car.pitchRate = 1.5;
  car.yawRate = 2;
  return state;
}

describe("a body between contacts", () => {
  it("turns about its weight: the weight flies straight while the origin goes round it", () => {
    const state = thrown();
    const start = weightAt(state);
    const x0 = state.car.x;
    const z0 = state.car.z;
    let walked = 0;
    for (let i = 0; i < Math.round(0.3 / TUNING.dt); i += 1) {
      step(state, NEUTRAL_INPUT);
      expect(state.car.airborne).toBe(true);
      const now = weightAt(state);
      expect(now.x).toBeCloseTo(start.x, 6);
      expect(now.z).toBeCloseTo(start.z, 6);
      walked = Math.max(walked, Math.hypot(state.car.x - x0, state.car.z - z0));
    }
    // ...and the origin really did move: over the third of a second that
    // takes the roll through a quarter turn, out by the better part of the
    // weight's own height.
    expect(walked).toBeGreaterThan(0.5 * massSpread(state.spec).weight.up);
  });
});
