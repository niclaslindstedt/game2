// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT DIRTIES A CAR, and the answer is distance rather than time. The
// wheels are what throw gravel at the paint and at the glass, so a car
// standing on the start line with the engine running is a car nothing is
// arriving at — it stays in the colour it rolled out in until it moves.
//
// The rates live in the renderer (pwa/src/game/car-dirt.ts) because the
// coat is baked vertex colours, but the RULE is arithmetic over the game
// state, and that half is what this test reads: no GPU, no canvas.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createGame, type GameState } from "@engine";

import { createCarDirt, dirtRate, glassSpray, groundTravel } from "../pwa/src/game/car-dirt.ts";

/** A racing state parked on the first sample of the given surface.
 *
 * The seed is SEARCHED FOR rather than named, and that is not fussiness.
 * What surfaces a stage has is a property of its COUNTRY: tarmac exists only
 * where the land carried a public road the route could use (R17), and water
 * only where the pour left a body in the way (R35). A seed that has both
 * today can have neither tomorrow — any change to how the route meets the
 * roads redraws every stage downstream of it, and a suite that pins one
 * seed then fails with "seed 7 has no asphalt", which says nothing about
 * the thing under test. This helper wants A STAGE WITH TARMAC ON IT; the
 * sweep is how it asks for one. */
// Only the SEED is remembered, never the state: every caller mutates the
// one it is handed, so a shared state would carry one test's car into the
// next.
const staged = new Map<string, number>();
function stageOn(surface: "gravel" | "asphalt" | "water"): GameState {
  const known = staged.get(surface);
  const build = (seed: number): GameState =>
    createGame({ seed, length: "long", knobs: { water: 0.8 } });
  let state: GameState | null = known === undefined ? null : build(known);
  for (let seed = 1; state === null && seed <= 24; seed++) {
    const built = build(seed);
    if (!built.track.samples.some((s) => s.surface === surface)) continue;
    staged.set(surface, seed);
    state = built;
  }
  if (state === null) throw new Error(`no seed in the sweep carried ${surface}`);
  const at = state.track.samples.findIndex((s) => s.surface === surface);
  expect(at, `the staged seed has ${surface} somewhere`).toBeGreaterThanOrEqual(0);
  state.phase = "racing";
  // Both: the run has got this far, and this is the sample the car is
  // standing on. What the ground throws is a question about the second one.
  state.progressIndex = at;
  state.nearIndex = at;
  state.car.slide = 0;
  state.car.airborne = false;
  return state;
}

describe("how far the car went, over the ground", () => {
  it("is nothing at all when the car is not moving", () => {
    const state = stageOn("gravel");
    state.car.u = 0;
    state.car.w = 0;
    expect(groundTravel(state.car, 1)).toBe(0);
  });

  it("counts sideways as travelled, and reverse as travelled", () => {
    const state = stageOn("gravel");
    state.car.u = -3;
    state.car.w = 4;
    expect(groundTravel(state.car, 2)).toBeCloseTo(10, 6);
  });

  it("is nothing in the air: no surface is under the wheels", () => {
    const state = stageOn("gravel");
    state.car.u = 30;
    state.car.w = 0;
    state.car.airborne = true;
    expect(groundTravel(state.car, 1)).toBe(0);
  });
});

describe("what the ground throws at the car, per metre", () => {
  it("dusts a gravel road, and throws several times as much in a slide", () => {
    const state = stageOn("gravel");
    const gripped = dirtRate(state);
    state.car.slide = 0.9;
    const sliding = dirtRate(state);
    expect(gripped.dust).toBeGreaterThan(0);
    expect(gripped.mud).toBe(0);
    expect(sliding.dust).toBeGreaterThan(gripped.dust * 3);
  });

  it("throws nothing at all on sealed road", () => {
    const state = stageOn("asphalt");
    expect(dirtRate(state)).toEqual({ dust: 0, mud: 0 });
    state.car.slide = 0.9;
    expect(dirtRate(state)).toEqual({ dust: 0, mud: 0 });
  });

  it("mud, not dust, off the verge and through a ford", () => {
    const ford = stageOn("water");
    expect(dirtRate(ford).mud).toBeGreaterThan(dirtRate(ford).dust);
    const verge = stageOn("gravel");
    verge.offRoad = true;
    expect(dirtRate(verge).mud).toBeGreaterThan(0);
    // The verge is wet whatever the road under it was doing.
    expect(dirtRate(verge).mud).toBeGreaterThan(dirtRate(stageOn("gravel")).mud);
  });
});

describe("what the ground throws at the GLASS, per metre", () => {
  it("throws nothing on tarmac, whatever the car is doing on it", () => {
    const state = stageOn("asphalt");
    expect(glassSpray(state)).toBe(0);
    state.car.slide = 0.9;
    expect(glassSpray(state)).toBe(0);
  });

  it("throws nothing off the road either: turf holds its own soil down", () => {
    const state = stageOn("gravel");
    state.offRoad = true;
    expect(glassSpray(state)).toBe(0);
    // ...and the PAINT still takes the verge's mud, which is the whole
    // distinction: what a wheel lifts off grass goes on the sills, not on
    // the windows.
    expect(dirtRate(state).mud).toBeGreaterThan(0);
  });

  it("films the screens on gravel, and harder in a slide", () => {
    const state = stageOn("gravel");
    const gripped = glassSpray(state);
    state.car.slide = 0.9;
    expect(gripped).toBeGreaterThan(0);
    expect(glassSpray(state)).toBeGreaterThan(gripped);
  });

  it("throws through a ford", () => {
    expect(glassSpray(stageOn("water"))).toBeGreaterThan(0);
  });
});

describe("the coat that accumulates over a run", () => {
  const dirtFor = (state: GameState, steps: number): number => {
    // An empty group has no colours to bake, which is exactly what this
    // wants: the accumulator, without the painter it drives.
    const dirt = createCarDirt(new THREE.Group());
    for (let n = 0; n < steps; n++) dirt.update(state, 1 / 60);
    return dirt.level();
  };

  it("stays showroom-clean while the car sits still on the gravel", () => {
    const state = stageOn("gravel");
    state.car.u = 0;
    state.car.w = 0;
    expect(dirtFor(state, 60 * 60)).toBe(0);
  });

  it("stays clean standing in a ford, too — a bath is not a splash", () => {
    const state = stageOn("water");
    state.car.u = 0;
    state.car.w = 0;
    expect(dirtFor(state, 60 * 60)).toBe(0);
  });

  it("goes by the metre, not by the minute: half the pace, half the time", () => {
    const fast = stageOn("gravel");
    fast.car.u = 30;
    fast.car.w = 0;
    const slow = stageOn("gravel");
    slow.car.u = 15;
    slow.car.w = 0;
    // The same GROUND covered — twice as long at half the speed — leaves
    // the same coat. Under a per-second rate the crawl would come home
    // twice as filthy as the drive.
    expect(dirtFor(slow, 2 * 60)).toBeCloseTo(dirtFor(fast, 60), 6);
    expect(dirtFor(fast, 60)).toBeGreaterThan(0);
  });

  it("only accumulates while the run is being driven", () => {
    const state = stageOn("gravel");
    state.car.u = 30;
    state.car.w = 0;
    state.phase = "countdown";
    expect(dirtFor(state, 60 * 10)).toBe(0);
  });
});
