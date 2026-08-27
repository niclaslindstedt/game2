// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// REVERSE — the brake's second job. The pedal slows a car that is rolling
// forward; once it has stopped one, the same pedal backs it out. There is no
// gear to select and no separate control: a nose in a tree is something the
// player drives out of.
//
// The traps this file exists to catch are both silent. One is the standstill
// snap that zeroes `u` below 0.05 m/s — it stops a parked car creeping on a
// slope, and left ungated it also eats reverse's own first tick, so the car
// sits at the tree with the pedal down forever. The other is the brake's
// retardation running alongside the reverse thrust: `-brake * sign(u)` pushes
// FORWARD once `u` is negative, so the two fight over one pedal and the car
// crawls, or stops, depending on which number is bigger.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  botInput,
  compileTrack,
  createGame,
  step,
  type CarInput,
  type GameState,
  type SegmentPlan,
} from "@engine";

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 900, feature: "none" }];

/** A car on the straight with road BEHIND it as well as ahead. Reversing
 * from the start line runs out of stage in thirty meters — past the apron
 * the terrain owns the ground (R24), and these scenarios are about the
 * pedal, not about what the country does to a car backing off the map. */
function game(carId = "compact"): GameState {
  const state = createGame({
    seed: 0,
    carId,
    skipCountdown: true,
    track: compileTrack(0, STRAIGHT),
  });
  const grid = state.track.samples[Math.round(400 / state.track.step)];
  state.car.x = grid.x;
  state.car.y = grid.elevation;
  state.car.z = grid.z;
  state.car.heading = grid.heading;
  state.progressIndex = Math.round(400 / state.track.step);
  state.progressS = grid.s;
  return state;
}

function hold(state: GameState, input: Partial<CarInput>, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TUNING.dt); i++) {
    step(state, { ...NEUTRAL_INPUT, ...input });
  }
}

describe("reverse", () => {
  it("backs the car out when the brake is held at a standstill", () => {
    const state = game();
    hold(state, { brake: 1 }, 2);
    expect(state.car.reversing).toBe(true);
    expect(state.car.u).toBeLessThan(-1);
  });

  it("settles at the reverse top speed instead of running away", () => {
    const state = game();
    hold(state, { brake: 1 }, 12);
    expect(state.car.u).toBeGreaterThanOrEqual(-TUNING.reverse.top - 0.01);
    expect(state.car.u).toBeLessThan(-TUNING.reverse.top * 0.7);
  });

  it("stops the car before it reverses, rather than instead of it", () => {
    const state = game();
    hold(state, { throttle: 1 }, 4);
    const entrySpeed = state.car.u;
    expect(entrySpeed).toBeGreaterThan(15);
    // One tick of brake at pace is the brake, not a gear change.
    step(state, { ...NEUTRAL_INPUT, brake: 1 });
    expect(state.car.reversing).toBe(false);
    expect(state.car.u).toBeLessThan(entrySpeed);
    expect(state.car.u).toBeGreaterThan(0);
    // Held down, it takes the car through zero and out the other side.
    hold(state, { brake: 1 }, 6);
    expect(state.car.u).toBeLessThan(-1);
  });

  it("gives the throttle the pedal back, with no gear to select", () => {
    const state = game();
    hold(state, { brake: 1 }, 3);
    expect(state.car.u).toBeLessThan(-1);
    hold(state, { throttle: 1 }, 3);
    expect(state.car.reversing).toBe(false);
    expect(state.car.u).toBeGreaterThan(1);
  });

  it("coasts back to a stop when the pedal comes up", () => {
    const state = game();
    hold(state, { brake: 1 }, 6);
    expect(state.car.u).toBeLessThan(-3);
    // Stopped within a second or so, not still rolling. (Not exactly zero:
    // the lateral-grip redirect rebuilds `u` from the slip angle after the
    // standstill snap has run, and leaves sub-mm/s dust behind.)
    hold(state, {}, 2);
    expect(state.car.reversing).toBe(false);
    expect(Math.abs(state.car.u)).toBeLessThan(0.05);
  });

  it("answers the wheel the other way round while backing out", () => {
    const left = game();
    hold(left, { brake: 1 }, 1);
    hold(left, { brake: 1, steer: -1 }, 1.5);
    const right = game();
    hold(right, { brake: 1 }, 1);
    hold(right, { brake: 1, steer: 1 }, 1.5);
    // Both moved; the same lock turns the nose opposite ways...
    expect(Math.abs(left.car.heading)).toBeGreaterThan(0.05);
    expect(Math.sign(left.car.heading)).toBe(-Math.sign(right.car.heading));
    // ...and each is the mirror of what that lock does going forward.
    const forward = game();
    hold(forward, { throttle: 1 }, 1);
    hold(forward, { throttle: 0.4, steer: -1 }, 1.5);
    expect(Math.sign(left.car.heading)).toBe(-Math.sign(forward.car.heading));
  });

  it("leaves the brake lights to actual braking", () => {
    const state = game();
    hold(state, { brake: 1 }, 6);
    expect(state.car.u).toBeLessThan(-3);
    expect(state.car.braking).toBe(false);
  });
});

/** Put the car out in the wild with a face it cannot climb `at` metres away
 * along x, and a landscape that is nothing else. The road is back toward
 * -x, so a wall on that side is one the bot will drive into trying to reach
 * it. Props go where the car ends up, never at a bare origin. */
function wildWall(state: GameState, at: number): void {
  const car = state.car;
  car.x += 200;
  const wall = car.x + at;
  const rising = at < 0 ? (x: number) => (wall - x) * 8 : (x: number) => (x - wall) * 8;
  const heightAt = (x: number): number => Math.min(24, Math.max(0, rising(x)));
  state.terrain = {
    ...state.terrain,
    heightAt,
    groundAt: heightAt,
    waterAt: () => null,
    obstaclesNear: () => [],
    treesNear: () => [],
  };
  car.y = heightAt(car.x);
}

describe("the bot backing out of a wedge", () => {
  it("reverses off a face it cannot get past instead of sitting against it", () => {
    const state = game();
    wildWall(state, -4); // between the car and the road it is aiming for
    state.car.heading = -Math.PI / 2;
    let reversed = false;
    for (let i = 0; i < 120 * 4; i++) {
      step(state, botInput(state));
      if (state.car.reversing && state.car.u < -2) reversed = true;
    }
    expect(reversed).toBe(true);
    // Its own recovery, not the engine's: nothing had to drag the car home.
    expect(state.stats.respawns).toBe(0);
  });

  it("takes another run at the line once it is off the thing", () => {
    const state = game();
    wildWall(state, -4);
    state.car.heading = -Math.PI / 2;
    let pushedAfterBackingOut = false;
    let backedOut = false;
    for (let i = 0; i < 120 * 4; i++) {
      step(state, botInput(state));
      if (state.car.u < -3) backedOut = true;
      if (backedOut && state.car.u > 3) pushedAfterBackingOut = true;
    }
    expect(pushedAfterBackingOut).toBe(true);
  });
});

describe("the wedge rescue", () => {
  it("still fires on a car that is pinned backwards too", () => {
    const state = game();
    wildWall(state, -2.5); // a face immediately BEHIND the nose-forward car
    state.car.heading = Math.PI / 2;
    // Backing into it is asking to move as much as pushing into it is, so
    // the clock keeps running and the rescue arrives — a car that reversing
    // cannot free must not sit there forever because it tried.
    hold(state, { brake: 1 }, 6);
    expect(state.stats.respawns).toBeGreaterThan(0);
  });
});
