// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOOSE THINGS — the marshal's cones the car drives through, and the
// tumbler every knocked-free object falls under.
//
// None of this is engine state: a cone stops nothing, no run changes for
// having hit one, and the whole field lives renderer-side. What it owes is
// entirely a LOOK, and the two ways that look breaks are both invisible in a
// diff and instant on screen:
//
//   * A piece that HANGS. Anything that falls onto a fixed floor height —
//     the ground under the car at the moment it came loose — hovers over
//     every hillside in the game. The floor has to be the drawn ground under
//     wherever the piece has actually got to.
//   * A piece the world FORGETS. A cone stepped only while the car is beside
//     it freezes mid-arc the moment the car drives on, which is the same
//     fault seen from the other end.
//
// So the tests here drive a real car at a real cone over ground that is not
// flat, and then look at where things end up.
//
// This is a renderer module and still a plain-Node test: what it exercises is
// three's scene graph and maths, and nothing in the field reaches for a DOM.
// Anything about how a cone LOOKS is a screenshot's job, not this file's.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  compileTrack,
  createGame,
  step,
  type CarInput,
  type GameState,
  type SegmentPlan,
} from "@engine";

import { createConeField } from "../pwa/src/game/cones.ts";

const LONG_STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 6000, feature: "none" }];

const drive = (overrides: Partial<CarInput> = {}): CarInput => ({
  ...NEUTRAL_INPUT,
  ...overrides,
});

/** A run on a landscape the test owns, so the ground a cone lands on is
 * exactly the ground the test says it is. */
function onGround(heightAt: (x: number, z: number) => number): GameState {
  const state = createGame({
    seed: 5,
    skipCountdown: true,
    track: compileTrack(5, LONG_STRAIGHT),
  });
  state.terrain = {
    ...state.terrain,
    heightAt,
    groundAt: heightAt,
    waterAt: () => null,
    obstaclesNear: () => [],
    treesNear: () => [],
  };
  return state;
}

/** Put the car out in the wild, pointed down +z at the given pace. */
function intoTheWild(state: GameState, speed: number): void {
  state.car.x = 120;
  state.car.z = 200;
  state.car.heading = 0;
  state.car.y = state.terrain.groundAt(state.car.x, state.car.z);
  state.car.u = speed;
}

/** Stand a cone `ahead` metres down the car's nose. */
function coneAhead(state: GameState, field: ReturnType<typeof createConeField>, ahead: number) {
  const sinH = Math.sin(state.car.heading);
  const cosH = Math.cos(state.car.heading);
  const x = state.car.x + sinH * ahead;
  const z = state.car.z + cosH * ahead;
  field.plant(x, state.terrain.groundAt(x, z), z, 0);
  return field.group.children[field.group.children.length - 1];
}

/** Run the car and the field together for `seconds`, at the engine's own step. */
function run(state: GameState, field: ReturnType<typeof createConeField>, seconds: number): void {
  const dt = 1 / 120;
  for (let i = 0; i < seconds * 120; i++) {
    step(state, drive({ throttle: 1 }));
    field.update(state, dt);
  }
}

describe("driving through the cones", () => {
  it("sends one flying and leaves it lying on the ground", () => {
    const state = onGround(() => 20);
    const field = createConeField();
    intoTheWild(state, 22);
    const cone = coneAhead(state, field, 25);
    const from = cone.position.clone();

    run(state, field, 6);

    // It went somewhere, and it is no longer standing where it stood.
    expect(cone.position.distanceTo(from)).toBeGreaterThan(4);
    // …and it came back down: at rest on the ground, not hanging over it.
    expect(cone.position.y).toBeLessThan(from.y);
    expect(cone.position.y).toBeGreaterThan(20 - 0.01);
    // A knocked cone lies over rather than standing back up.
    const upright = Math.abs(cone.rotation.x) + Math.abs(cone.rotation.z);
    expect(upright).toBeGreaterThan(0.2);
  });

  it("settles on the ground it flew over, not on the ground it left", () => {
    // A hillside falling away ahead of the car — the case a fixed floor
    // height gets wrong, and gets more wrong the further the cone travels.
    const heightAt = (_x: number, z: number): number => 60 - z * 0.25;
    const state = onGround(heightAt);
    const field = createConeField();
    intoTheWild(state, 26);
    const cone = coneAhead(state, field, 25);

    run(state, field, 8);

    const under = heightAt(cone.position.x, cone.position.z);
    expect(cone.position.y).toBeGreaterThan(under - 0.01);
    expect(cone.position.y - under).toBeLessThan(0.6);
  });

  it("keeps stepping a cone the car has already driven past", () => {
    // The car is long gone by the time the cone lands. A field that only
    // stepped what is near the car would leave this one in the air.
    const state = onGround(() => 20);
    const field = createConeField();
    intoTheWild(state, 30);
    const cone = coneAhead(state, field, 20);

    run(state, field, 10);

    const gone = Math.hypot(state.car.x - cone.position.x, state.car.z - cone.position.z);
    expect(gone).toBeGreaterThan(60); // well past it
    expect(cone.position.y).toBeGreaterThan(20 - 0.01);
    expect(cone.position.y).toBeLessThan(20 + 0.5);
  });

  it("leaves a cone the car never reaches standing exactly where it was put", () => {
    const state = onGround(() => 20);
    const field = createConeField();
    intoTheWild(state, 18);
    // Well off the car's line, and past the reach of its body box.
    const cone = coneAhead(state, field, 40);
    cone.position.x += 12;
    const from = cone.position.clone();

    run(state, field, 4);

    expect(cone.position.distanceTo(from)).toBe(0);
  });

  it("does not re-launch the cone under a car that has stopped on it", () => {
    const state = onGround(() => 20);
    const field = createConeField();
    intoTheWild(state, 0);
    const cone = coneAhead(state, field, 0.4);
    const dt = 1 / 120;
    for (let i = 0; i < 240; i++) {
      step(state, drive());
      field.update(state, dt);
    }
    // A parked car is not driving through anything: the cone stays put
    // rather than being kicked once per frame forever.
    expect(cone.position.y).toBeCloseTo(20 + 0.55, 5);
  });
});
