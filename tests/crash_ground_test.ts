// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GROUND UNDER A CRASH IS NOT STEEL.
//
// A rolling car comes down on gravel, soil or sand, and every one of them
// gives: a corner sinks in, and that share of the arrival neither turns the
// body nor folds the shell — the ground took it (`TUNING.surfaces.give`).
// And dragging a furrow costs friction over the shell's own coefficient
// (`plough`), which is why a rollover on soil stops harder than one on
// pavement. These hold the two to what they must be: the same drop onto sand
// turns the body less and marks it less than onto tarmac, a body sliding on
// its roof stops shorter on sand, a bench with no surface is a rigid plane,
// and none of it puts energy into the crash.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  crashEnergy,
  crashTurbulence,
  createGame,
  createRng,
  groundOf,
  massSpread,
  step,
  updateSlip,
  type GameState,
  type SegmentPlan,
  type Surface,
} from "@engine";

const STAGE: SegmentPlan[] = [{ kind: "straight", length: 900, feature: "none" }];

/** A body dropped onto flat ground of a chosen SURFACE while going over — the
 * crash-contact bench, with the ground told what it is made of. */
function drop({
  surface,
  roll = 0,
  pitch = 0,
  rollRate = 0,
  height = 9,
  u = 0,
}: {
  surface: Surface | "nature";
  roll?: number;
  pitch?: number;
  rollRate?: number;
  height?: number;
  u?: number;
}): GameState {
  const state = createGame({
    seed: 0,
    carId: "classic",
    skipCountdown: true,
    track: compileTrack(0, STAGE),
  });
  state.terrain.obstaclesNear = () => [];
  state.terrain.treesNear = () => [];
  state.rng.next = () => 0.5;
  const car = state.car;
  // Off the road, onto dead flat ground: the wild branch reads the surface
  // off the terrain, and the terrain here says whatever the test says.
  const cosH = Math.cos(car.heading);
  const sinH = Math.sin(car.heading);
  car.x += cosH * 45;
  car.z -= sinH * 45;
  const level = state.terrain.groundAt(car.x, car.z);
  state.terrain.groundAt = () => level;
  state.terrain.spurSurfaceAt = () => (surface === "nature" ? null : surface);
  car.rolling = true;
  car.airborne = true;
  car.planted = false;
  car.roll = roll;
  car.pitch = pitch;
  car.rollRate = rollRate;
  car.y = level + height;
  car.vy = 0;
  car.u = u;
  car.w = 0;
  updateSlip(car);
  return state;
}

function untilItLands(state: GameState): GameState {
  for (let i = 0; i < TUNING.physicsHz * 3; i += 1) {
    const flying = state.car.airborne;
    step(state, { ...NEUTRAL_INPUT });
    if (flying && !state.car.airborne) return state;
  }
  throw new Error("the body never reached the ground");
}

describe("the ground under a crash", () => {
  it("is a rigid plane when nobody says what it is, and gives when they do", () => {
    expect(groundOf(undefined)).toEqual({ give: 0, plough: 0 });
    expect(groundOf("asphalt")).toEqual({ give: 0, plough: 0 });
    expect(groundOf("sand").give).toBeGreaterThan(groundOf("gravel").give);
    expect(groundOf("nature").give).toBeGreaterThan(groundOf("gravel").give);
    expect(groundOf("sand").plough).toBeGreaterThan(groundOf("nature").plough);
    for (const s of ["gravel", "sand", "nature", "water"] as const) {
      expect(groundOf(s).give).toBeGreaterThan(0);
      expect(groundOf(s).give).toBeLessThan(1);
    }
  });

  it("takes part of an arrival, so sand turns the body less than tarmac and marks it less", () => {
    // The same corner, the same fall: a nose corner catching after nine metres
    // of drop. On tarmac the whole arrival is the car's; on sand a share of it
    // is the corner sinking in.
    const hard = untilItLands(drop({ surface: "asphalt", pitch: 0.5 }));
    const soft = untilItLands(drop({ surface: "sand", pitch: 0.5 }));
    expect(Math.abs(soft.car.pitchRate)).toBeLessThan(Math.abs(hard.car.pitchRate));
    expect(Math.abs(soft.car.pitchRate)).toBeGreaterThan(0.3);
    expect(hard.car.damage.wear).toBeGreaterThan(soft.car.damage.wear);
    expect(soft.car.damage.wear).toBeGreaterThan(0);
  });

  it("stops a car sliding on its roof shorter in sand than on tarmac", () => {
    // A roof dragging a furrow is more brake than a roof on pavement.
    const slide = (surface: Surface | "nature"): number => {
      const state = drop({ surface, roll: Math.PI, height: 0.01, u: 15 });
      state.car.airborne = false;
      const x0 = state.car.x;
      const z0 = state.car.z;
      for (let i = 0; i < TUNING.physicsHz * 8 && state.car.rolling; i += 1) {
        step(state, { ...NEUTRAL_INPUT });
      }
      expect(Math.hypot(state.car.u, state.car.w)).toBeLessThanOrEqual(TUNING.air.roll.restSpeed);
      return Math.hypot(state.car.x - x0, state.car.z - z0);
    };
    const tarmac = slide("asphalt");
    const sand = slide("sand");
    expect(sand).toBeLessThan(tarmac);
    expect(sand).toBeGreaterThan(tarmac * 0.6);
  });

  it("never puts energy into the crash, on any surface", () => {
    for (const surface of ["asphalt", "sand", "nature"] as const) {
      const state = drop({ surface, roll: Math.PI / 2, pitch: 0.5, rollRate: 4, u: 14 });
      state.rng.next = createRng(7).next;
      const spread = massSpread(state.spec);
      let had = crashEnergy(state.car, spread);
      for (let i = 0; i < TUNING.physicsHz * 3; i += 1) {
        const allowed = crashTurbulence(state.car, spread);
        const wasAirborne = state.car.airborne;
        step(state, { ...NEUTRAL_INPUT });
        const now = crashEnergy(state.car, spread);
        if (wasAirborne && !state.car.airborne) expect(now - had).toBeLessThan(allowed);
        had = now;
        if (!state.car.rolling) break;
      }
    }
  });
});
