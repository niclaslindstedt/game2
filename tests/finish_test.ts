// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The finish: a LINE across the road at the gate, not a distance along the
// stage. A run ends by driving through it — between the posts, forwards —
// so a car that climbs the mountain beside the closing straight passes
// every sample of it and is still racing at the top.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  compileTrack,
  createGame,
  finishIndex,
  gateHalfWidth,
  step,
  wayHome,
  type CarInput,
  type GameState,
  type SegmentPlan,
} from "@engine";

const SHORT_STAGE: SegmentPlan[] = [{ kind: "straight", length: 400, feature: "none" }];

const drive: CarInput = { ...NEUTRAL_INPUT, throttle: 1 };

function stage(): GameState {
  const state = createGame({
    seed: 7,
    carId: "compact",
    skipCountdown: true,
    track: compileTrack(7, SHORT_STAGE),
  });
  // An empty flat landscape beside the road: the excursions below are about
  // where the car IS, not what it hits on the way.
  const ground = state.track.samples[0].elevation;
  state.terrain = {
    ...state.terrain,
    heightAt: () => ground,
    groundAt: () => ground,
    waterAt: () => null,
    obstaclesNear: () => [],
    treesNear: () => [],
  };
  return state;
}

/** How far past the finish line a point sits, m — negative before it. */
function pastLine(state: GameState, x: number, z: number): number {
  const s = state.track.samples[finishIndex(state.track)];
  return (x - s.x) * Math.sin(s.heading) + (z - s.z) * Math.cos(s.heading);
}

/** Slide the car sideways off the centerline, keeping its progress. */
function shift(state: GameState, lateral: number): void {
  const s = state.track.samples[state.progressIndex];
  state.car.x += Math.cos(s.heading) * lateral;
  state.car.z += -Math.sin(s.heading) * lateral;
}

function run(state: GameState, steps: number): boolean {
  let finished = false;
  for (let i = 0; i < steps && state.phase !== "finished"; i++) {
    if (step(state, drive).some((e) => e.type === "finish")) finished = true;
  }
  return finished;
}

describe("the finish line", () => {
  it("ends the run when the car drives through the gate", () => {
    const state = stage();
    expect(run(state, 120 * 60)).toBe(true);
    expect(state.phase).toBe("finished");
    expect(pastLine(state, state.car.x, state.car.z)).toBeGreaterThan(0);
  });

  it("does not end the run for a car that passes outside the posts", () => {
    const state = stage();
    // Out in the wild, well past the verge, and driving the length of the
    // stage from there: every sample of the closing straight goes by.
    shift(state, gateHalfWidth(state.track) + 30);
    expect(run(state, 120 * 60)).toBe(false);
    expect(state.phase).toBe("racing");
    expect(state.progressIndex).toBe(state.track.samples.length - 1);
    expect(pastLine(state, state.car.x, state.car.z)).toBeGreaterThan(0);
  });

  it("still ends the run when the car comes back and crosses the line", () => {
    const state = stage();
    shift(state, gateHalfWidth(state.track) + 30);
    run(state, 120 * 60);
    expect(state.phase).toBe("racing");
    // Back to the centerline behind the gate, pointing down the road.
    const s = state.track.samples[finishIndex(state.track)];
    state.car.x = s.x - Math.sin(s.heading) * 20;
    state.car.z = s.z - Math.cos(s.heading) * 20;
    state.car.y = s.elevation;
    state.car.heading = s.heading;
    expect(run(state, 120 * 30)).toBe(true);
  });

  it("never sends a respawn out past the line it has to cross", () => {
    const state = stage();
    shift(state, gateHalfWidth(state.track) + 30);
    run(state, 120 * 60);
    const home = wayHome(state);
    expect(pastLine(state, home.x, home.z)).toBeLessThan(0);
    expect(run(state, 120 * 30)).toBe(false);
    step(state, { ...drive, reset: true });
    expect(state.phase).toBe("racing");
    expect(run(state, 120 * 30)).toBe(true);
  });
});
