// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MINIMAP — the square of country it draws, and what stands on it
// (pwa/src/game/minimap-scene.ts, minimap-view.ts).
//
// It is tested rather than looked at because a screenshot only ever shows
// one place on one stage, and every claim the instrument makes is a claim
// about EVERY place a car can get to:
//
//   * the window is centred on the CAR, not on the stage — on the road, a
//     hundred metres off it in a field, and turned round facing back up it;
//   * it holds a fixed square of country, so a sprint and an epic are drawn
//     at the same scale and the road is a ribbon on both;
//   * the schematic is cut around an ANCHOR and slid, so the picture moves
//     every frame while the geometry behind it is rebuilt now and then —
//     and the two must agree, or the country lags the car;
//   * the marks that can leave the window behave the way each of them has
//     to: a rival goes, the board the run still owes rides the rim.

import { describe, expect, it } from "vitest";
import {
  compileTrack,
  createGame,
  type GameState,
  type RivalField,
  type SegmentPlan,
} from "@engine";

import {
  SPAN,
  VIEW,
  inView,
  minimapScene,
  project,
  spanFor,
} from "../pwa/src/game/minimap-scene.ts";
import { buildMinimap } from "../pwa/src/game/minimap-view.ts";

/** A long straight with a corner in it, wide enough that a car parked a
 * hundred metres off the road is still a car in this country rather than a
 * respawn waiting to happen. */
const RIG: SegmentPlan[] = [
  { kind: "straight", length: 400, feature: "none" },
  { kind: "turn", length: 160, dir: 1, radius: 90, severity: "medium", feature: "none" },
  { kind: "straight", length: 900, feature: "none" },
];

function game(seed = 11): GameState {
  return createGame({
    seed,
    carId: "compact",
    skipCountdown: true,
    track: compileTrack(seed, RIG),
  });
}

/** Every `M`/`L` coordinate pair in a path, in the order they are written. */
function points(path: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)) {
    out.push([Number(m[1]), Number(m[2])]);
  }
  return out;
}

describe("minimap window", () => {
  it("centres on the car wherever the car is", () => {
    const state = game();
    for (const at of [
      { x: state.car.x, z: state.car.z },
      { x: state.car.x + 140, z: state.car.z - 90 },
      { x: state.car.x - 2000, z: state.car.z + 3000 },
    ]) {
      state.car.x = at.x;
      state.car.z = at.z;
      const [px, py] = project(state, at.x, at.z, SPAN.solo);
      expect(px).toBeCloseTo(VIEW / 2, 6);
      expect(py).toBeCloseTo(VIEW / 2, 6);
    }
  });

  it("holds one fixed square of country, whatever the stage is", () => {
    const state = game();
    // A point half the span away lands on the frame; one twice that is off
    // the window entirely. That is the whole difference from a map fitted
    // to the stage, where the scale moves with the road's own extent.
    const edge = project(state, state.car.x - SPAN.solo / 2, state.car.z, SPAN.solo);
    expect(edge[0]).toBeCloseTo(VIEW, 6);
    expect(inView(project(state, state.car.x, state.car.z - SPAN.solo, SPAN.solo))).toBe(false);
  });

  it("draws the map in SCREEN space, so a heading-growing turn bends left", () => {
    const state = game();
    // The engine's +x is the map's left and its +z is the map's up: the
    // renderer mirrors the engine's map view, and the minimap draws what
    // the player sees rather than what the engine holds.
    const [rx] = project(state, state.car.x + 30, state.car.z, SPAN.solo);
    const [, uy] = project(state, state.car.x, state.car.z + 30, SPAN.solo);
    expect(rx).toBeLessThan(VIEW / 2);
    expect(uy).toBeLessThan(VIEW / 2);
  });
});

describe("minimap schematic", () => {
  it("draws the road as a ribbon reaching both edges of the window", () => {
    const state = game();
    const scene = minimapScene(state);
    const drawn = points(scene.road);
    expect(drawn.length).toBeGreaterThan(20);
    // The car starts on the road, so the road runs under the middle of the
    // box and out of the far side of it.
    expect(drawn.some(([, y]) => y < 0)).toBe(true);
    expect(drawn.some((p) => inView(p))).toBe(true);
  });

  it("slides the cut instead of re-cutting it every frame", () => {
    const state = game();
    const first = minimapScene(state);
    // A few metres of driving move the picture without touching the paths:
    // the schematic is anchored, and the anchor's drift IS the offset.
    state.car.x += 6;
    const slid = minimapScene(state);
    expect(slid.road).toBe(first.road);
    expect(slid.cut).toBe(first.cut);
    expect(slid.offset.x).toBeCloseTo(6 * (VIEW / SPAN.solo), 6);
    // ...and a long way of driving re-cuts it around where the car now is.
    // The cut's own id changes with it, which is what tells the component
    // not to tween the frame the whole transform jumps on.
    state.car.x += 400;
    const recut = minimapScene(state);
    expect(recut.road).not.toBe(first.road);
    expect(recut.cut).not.toBe(first.cut);
    expect(Math.abs(recut.offset.x)).toBeLessThan(VIEW / 2);
  });

  it("keeps drawing the country when the car is off the road", () => {
    const state = game();
    // Out in a field, well beyond the road's own width: the window has left
    // the stage and the stage is still on it, which is the case a map fitted
    // to the route could not draw at all.
    state.car.z += 110;
    const scene = minimapScene(state);
    expect(points(scene.road).some((p) => inView(p))).toBe(true);
    expect(scene.offset).toEqual({ x: 0, y: 0 });
  });

  it("does not cut the last stage's country onto this one", () => {
    // Two stages the car stands on the same spot of: the cut is keyed on the
    // TRACK, so the second one may not be handed the first one's road — and
    // a seed is not enough to tell them apart, because a synthetic rig and a
    // generated stage can share one.
    const a = game(11);
    const first = minimapScene(a).road;
    const b = createGame({
      seed: 11,
      carId: "compact",
      skipCountdown: true,
      track: compileTrack(11, [
        { kind: "turn", length: 300, dir: -1, radius: 70, severity: "hard", feature: "none" },
        { kind: "straight", length: 600, feature: "none" },
      ]),
    });
    b.car.x = a.car.x;
    b.car.z = a.car.z;
    expect(minimapScene(b).road).not.toBe(first);
  });
});

/** A grid with one rival on it, stood `ahead` metres up the road from the
 * player. Hand-built rather than entered through `createField`, which
 * would run fourteen bots down the stage to answer a question about where
 * one plate lands. */
function headsUp(own: GameState, ahead: number): RivalField {
  const rival = game();
  rival.car.x = own.car.x;
  rival.car.z = own.car.z - ahead;
  return {
    massStart: true,
    runs: [{ entry: { crew: { id: "birch" }, number: 3 }, state: rival, done: false, owed: 0 }],
  } as unknown as RivalField;
}

describe("minimap framing", () => {
  it("frames a heads-up race wider, so the field is on the map", () => {
    const state = game();
    const field = headsUp(state, 200);
    const rival = field.runs[0].state;
    // Two hundred metres up the road is past the solo window's own half-span
    // and inside the race one's — which is the whole of what the wider
    // framing buys, and it costs the corner some of its shape.
    expect(inView(project(state, rival.car.x, rival.car.z, SPAN.solo))).toBe(false);
    expect(inView(project(state, rival.car.x, rival.car.z, SPAN.race))).toBe(true);
    expect(buildMinimap(state, field).cars).toHaveLength(1);
  });

  it("keeps the road's own framing on every run that is not a race", () => {
    const state = game();
    // A rally leaves ten seconds apart and has no field to hold, so nothing
    // widens the window and nothing is plated on it.
    expect(buildMinimap(state).cars).toEqual([]);
    const solo = minimapScene(state, SPAN.solo).road;
    expect(minimapScene(state).road).toBe(solo);
    expect(minimapScene(state, SPAN.race).road).not.toBe(solo);
  });
});

describe("minimap zoom", () => {
  it("opens the window up with the speedo, and stops opening it", () => {
    expect(spanFor(SPAN.solo, 0)).toBe(SPAN.solo);
    expect(spanFor(SPAN.solo, 90)).toBeGreaterThan(SPAN.solo);
    expect(spanFor(SPAN.solo, 180)).toBeGreaterThan(spanFor(SPAN.solo, 90));
    // Past the top of the ramp the picture settles: a map that kept opening
    // would end the stage showing a squiggle again.
    expect(spanFor(SPAN.solo, 400)).toBe(spanFor(SPAN.solo, 180));
  });

  it("puts more road in the frame the faster the car is going", () => {
    const state = game();
    const board = state.track.checkpoints[0];
    const sample = state.track.samples[board.index];
    // A hundred and ninety metres back from the board: past a standing car's
    // window, inside the one a car at rally pace is given.
    state.car.x = sample.x;
    state.car.z = sample.z + 190;
    expect(buildMinimap(state).next?.edge).toBe(true);
    state.car.u = 60;
    expect(buildMinimap(state).next?.edge).toBe(false);
  });

  it("shows the same country whatever span it was cut at", () => {
    // The cut is quantised and the zoom carries the remainder, so the two
    // have to compose back to the honest projection — every span, including
    // the ones that land on a different step. Get this wrong and the country
    // slides out from under the car every time the speedo crosses a step.
    const state = game();
    expect(state.nearIndex).toBe(0);
    const first = state.track.samples[0];
    for (const span of [SPAN.solo, 317, 355, 420, SPAN.race]) {
      const scene = minimapScene(state, span);
      const [hx, hy] = points(scene.road)[0];
      const want = project(state, first.x, first.z, span);
      expect(scene.zoom).toBeGreaterThanOrEqual(1);
      expect(VIEW / 2 + (hx - VIEW / 2) * scene.zoom + scene.offset.x).toBeCloseTo(want[0], 0);
      expect(VIEW / 2 + (hy - VIEW / 2) * scene.zoom + scene.offset.y).toBeCloseTo(want[1], 0);
    }
  });
});

describe("minimap marks", () => {
  it("puts the car in the middle and turns it with the heading", () => {
    const state = game();
    state.car.heading = Math.PI / 2;
    const map = buildMinimap(state);
    expect(map.heading).toBeCloseTo(-90, 6);
  });

  it("rides the rim with the board the run still owes, pointing at it", () => {
    const state = game();
    const board = state.track.checkpoints[state.checkpointsPassed];
    expect(board).toBeDefined();
    const sample = state.track.samples[board.index];
    // Stand a long way to one side of the board: it is off the window, and
    // the mark has to say which way it went rather than disappear.
    state.car.x = sample.x + 900;
    state.car.z = sample.z;
    const next = buildMinimap(state).next;
    expect(next).not.toBeNull();
    expect(next?.edge).toBe(true);
    // The board is at -x of the car, which the screen mirrors to the right.
    expect(next?.x).toBeGreaterThan(VIEW / 2);
    expect(next?.angle).toBeCloseTo(90, 1);
    // ...and once the car is on top of it the mark is a place again.
    state.car.x = sample.x;
    expect(buildMinimap(state).next?.edge).toBe(false);
  });

  it("counts the stage down in kilometres under the frame", () => {
    const state = game();
    const start = buildMinimap(state).label;
    state.progressS = (state.track.finishS ?? state.track.length) - 400;
    const near = buildMinimap(state).label;
    expect(start.endsWith(" KM")).toBe(true);
    expect(Number.parseFloat(near)).toBeLessThan(Number.parseFloat(start));
    expect(Number.parseFloat(near)).toBeCloseTo(0.4, 1);
  });
});
