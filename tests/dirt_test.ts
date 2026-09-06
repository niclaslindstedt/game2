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

import { buildCarBody } from "../pwa/src/game/car-body.ts";
import { createCarDamage } from "../pwa/src/game/car-damage.ts";
import {
  createCarDirt,
  createDirtPainter,
  dirtRate,
  glassSpray,
  groundTravel,
  wheelSpray,
} from "../pwa/src/game/car-dirt.ts";
import { paintLayers, type PaintLayers } from "../pwa/src/game/car-paint.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";

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

// THE GRIME AND THE FOLD SHARE ONE COLOUR BUFFER, and both of them write it
// by re-deriving every vertex from a pristine copy of their own. Left to
// themselves they take turns undoing each other: a knock re-derives the
// panels from the showroom livery and the stage's filth is gone, then the
// next visible step of dust re-derives them from the clean bake and the
// filth is back with the fold's shading gone with it. Since a knock is what
// starts it, the grime looks like it disappears when you crash.
//
// car-paint.ts is the fix — a layer each, composed in a fixed order — and
// these are the two directions it has to hold in.
describe("the coat and the fold, on one car", () => {
  const spec = CAR_BODIES[Object.keys(CAR_BODIES)[0]];

  /** A body, its dirt painter and its damage visual, wired exactly as
   * car-mesh.ts wires them. */
  const wired = () => {
    const body = buildCarBody(spec, {});
    const group = new THREE.Group();
    group.add(body.group);
    const paint = createDirtPainter(group, wheelSpray(spec));
    const damage = createCarDamage(body);
    return { body, paint, damage };
  };

  /** A racing state whose ledger has folded the car's nose in. */
  const knocked = (): GameState => {
    const state = createGame({ seed: 3, length: "short" });
    state.phase = "racing";
    const d = state.car.damage;
    d.zones = d.zones.map(() => 0.18);
    d.roof = 0.05;
    d.wear = 0.4;
    d.version++;
    return state;
  };

  /** The shell's colour buffer, as it stands. */
  const shellColours = (body: ReturnType<typeof buildCarBody>): Float32Array =>
    new Float32Array(
      (body.body.geometry.getAttribute("color") as THREE.BufferAttribute).array as Float32Array,
    );

  /** How many of two buffers' floats disagree. */
  const apart = (a: Float32Array, b: Float32Array): number => {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-4) n++;
    return n;
  };

  it("keeps the stage's filth on the car through a crash", () => {
    // The same knock, on the same car, with and without a stage's dirt on
    // it. The fold is a function of the ledger alone, so the ONLY thing
    // that can separate the two answers is the coat — and the bug was
    // exactly that nothing did: the fold re-derived the panels from the
    // showroom livery and handed back a freshly washed car.
    const state = knocked();

    const dirty = wired();
    dirty.paint({ dust: 0.9, mud: 0.7 });
    const beforeKnock = shellColours(dirty.body);
    dirty.damage.update(state, 1);

    const washed = wired();
    washed.damage.update(state, 1);

    const crashed = shellColours(dirty.body);
    expect(apart(crashed, beforeKnock), "the crash is drawn on the car").toBeGreaterThan(0);
    expect(
      apart(crashed, shellColours(washed.body)),
      "and the car comes out of it as filthy as it went in",
    ).toBeGreaterThan(0);

    dirty.body.dispose();
    washed.body.dispose();
  });

  it("keeps the crash on the car through the next fleck of dust", () => {
    const { body, paint, damage } = wired();
    const layers = paintLayers(body.body.geometry) as PaintLayers;
    const showroom = new Float32Array(layers.base);

    damage.update(knocked(), 1);
    const bent = new Float32Array(layers.base);
    let folded = 0;
    for (let i = 0; i < bent.length; i++) if (Math.abs(bent[i] - showroom[i]) > 1e-4) folded++;
    expect(folded, "the fold repainted the shell, so there is something to lose").toBeGreaterThan(
      0,
    );

    paint({ dust: 0.5, mud: 0.2 });
    // The car UNDER the dirt is still the bent, re-lit, scuffed one. The old
    // painter re-derived the buffer from the showroom bake instead, which
    // took the whole crash off the car until the next knock put it back.
    expect(Array.from(layers.base)).toEqual(Array.from(bent));

    // And every vertex the coat left bare reads as that car, not as the one
    // that rolled out of the service park.
    const arr = (body.body.geometry.getAttribute("color") as THREE.BufferAttribute)
      .array as Float32Array;
    let bare = 0;
    for (let j = 0; j < layers.count; j++) {
      if (layers.coat[j * 4 + 3] > 0) continue;
      bare++;
      expect(arr[j * 3]).toBeCloseTo(bent[j * 3], 6);
    }
    expect(bare, "a light coat is specks, not a wash").toBeGreaterThan(0);
    body.dispose();
  });
});
