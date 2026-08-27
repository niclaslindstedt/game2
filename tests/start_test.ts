// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The start grid: where a run sits before the lights go green. Every stage
// rolls its elevation from its own seed, so the road at the line is metres
// above or below the world origin — a car parked at zero spends the whole
// countdown sunk in the gravel or hovering over it, in full view.

import { describe, expect, it } from "vitest";

import { NEUTRAL_INPUT, createGame, step } from "@engine";

/** Seeds whose first sample sits well clear of zero, both ways. */
const SEEDS = [1, 2, 3, 7, 42, 20692];

describe("the start grid", () => {
  it("parks the car ON the road at the line, whatever the stage's elevation", () => {
    for (const seed of SEEDS) {
      const state = createGame({ seed });
      const grid = state.track.samples[0];
      expect(state.car.y, `seed ${seed}`).toBeCloseTo(grid.elevation, 6);
      expect(state.car.x, `seed ${seed}`).toBeCloseTo(grid.x, 6);
      expect(state.car.z, `seed ${seed}`).toBeCloseTo(grid.z, 6);
      expect(state.car.heading, `seed ${seed}`).toBeCloseTo(grid.heading, 6);
    }
  });

  it("holds that pose right through the countdown", () => {
    const state = createGame({ seed: 20692 });
    const start = { ...state.car };
    for (let i = 0; i < 60; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    expect(state.phase).toBe("countdown");
    expect(state.car.y).toBe(start.y);
    expect(state.car.z).toBe(start.z);
  });

  it("a throttle held through the lights is revving, not being wedged", () => {
    const state = createGame({ seed: 20692 });
    let respawns = 0;
    // Well past both the countdown and the wedge clock, foot to the floor.
    for (let i = 0; i < 120 * 8; i++) {
      respawns += step(state, { ...NEUTRAL_INPUT, throttle: 1 }).filter(
        (e) => e.type === "respawn",
      ).length;
    }
    expect(state.phase).toBe("racing");
    expect(respawns).toBe(0);
  });
});
