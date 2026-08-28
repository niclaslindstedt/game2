// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The chase camera at a cliff. Two rules meet there and both used to fail:
// the ground the camera stands on may fall away in ONE STEP (a terrain
// lattice kinks, a shoreline swaps ground for water, two fields meet at a
// seam), and the camera must fly down that rather than cut to it; and while
// the car is falling the camera must NOT ride it down, because two metres
// over the roof is what a twenty-five metre drop looks like when nothing at
// all is happening. Driven directly — the camera only ever reads state, so a
// scripted fall is the whole scenario and needs no physics.
import { describe, expect, it } from "vitest";

import { compileTrack, createGame, type GameState, type SegmentPlan } from "@engine";

import { createGameCamera } from "../pwa/src/game/camera.ts";

const FLAT: SegmentPlan[] = [{ kind: "straight", length: 600, feature: "none" }];

const FRAME = 1 / 60;

function game(): GameState {
  return createGame({
    seed: 4,
    carId: "compact",
    skipCountdown: true,
    track: compileTrack(4, FLAT),
  });
}

/** Ground that is `high` behind `edge` metres of z and `low` past it, with
 * nothing else in the world — the sharpest cliff a terrain can hand the
 * camera, and sharper than any real stage builds. */
function cliffGround(state: GameState, edge: number, high: number, low: number): void {
  state.terrain = {
    ...state.terrain,
    groundAt: (_x, z) => (z < edge ? high : low),
    waterAt: () => null,
  };
}

/** Step the camera `frames` times while `drive` moves the car, and report the
 * biggest single-frame change in the camera's height. */
function run(
  state: GameState,
  cam: ReturnType<typeof createGameCamera>,
  frames: number,
  drive: (state: GameState) => void,
): { worstStep: number; heights: number[]; overs: number[] } {
  const heights: number[] = [];
  const overs: number[] = [];
  let worstStep = 0;
  let prev: number | null = null;
  for (let f = 0; f < frames; f++) {
    drive(state);
    cam.update(state, FRAME);
    const y = cam.camera.position.y;
    // The first frame plants the camera wherever the car is; a plant is not
    // a movement.
    if (prev !== null) worstStep = Math.max(worstStep, Math.abs(y - prev));
    prev = y;
    heights.push(y);
    overs.push(y - state.car.y);
  }
  return { worstStep, heights, overs };
}

describe("chase camera over a cliff", () => {
  it("flies down a step in the ground instead of cutting to it", () => {
    const state = game();
    const car = state.car;
    const edge = car.z + 60;
    cliffGround(state, edge, car.y, car.y - 25);

    const cam = createGameCamera(1600, 900);
    cam.setMode("chase");
    // Already off the lip and down at the bottom, with the camera trailing
    // it still over the top: that is what pins the camera to the floor, and
    // the floor is the thing that steps.
    car.heading = 0;
    car.u = 30;
    car.y -= 25;
    car.airborne = false;
    const { worstStep, heights } = run(state, cam, 300, (s) => {
      s.car.z += 30 * FRAME;
    });
    // The whole 25 m is crossed — the camera does end up at the bottom...
    expect(heights[0] - heights[heights.length - 1]).toBeGreaterThan(20);
    // ...but never more than a fraction of a metre of it in any one frame.
    expect(worstStep).toBeLessThan(0.5);
  });

  it("holds above the top while the car falls away", () => {
    const state = game();
    const car = state.car;
    // Ground far below everything: the floor can never be what holds the
    // camera up here, so what is measured is the hold and nothing else.
    cliffGround(state, car.z - 1e6, -500, -500);
    const cam = createGameCamera(1600, 900);
    cam.setMode("chase");
    car.heading = 0;
    car.u = 24;
    const top = car.y;
    let vy = 0;
    const { heights } = run(state, cam, 180, (s) => {
      s.car.airborne = true;
      vy -= 9.81 * FRAME;
      s.car.vy = vy;
      s.car.y += vy * FRAME;
      s.car.z += 24 * FRAME;
    });
    const fallen = top - car.y;
    expect(fallen).toBeGreaterThan(25);
    // The chase rig rides 2 m over the roof. After a fall that long the car
    // is metres further down the frame than that, and the camera is still
    // near the height it had at the lip.
    const over = heights[heights.length - 1] - car.y;
    expect(over).toBeGreaterThan(7);
    expect(top - heights[heights.length - 1]).toBeLessThan(fallen * 0.75);
    // And it gets there smoothly: no frame moves it more than a hand's
    // width more than the frame before it.
    for (let f = 2; f < heights.length; f++) {
      const jerk = Math.abs(heights[f] - 2 * heights[f - 1] + heights[f - 2]);
      expect(jerk).toBeLessThan(0.1);
    }
  });

  it("leaves an ordinary jump's framing alone", () => {
    const state = game();
    const car = state.car;
    cliffGround(state, car.z - 1e6, -500, -500);
    const cam = createGameCamera(1600, 900);
    cam.setMode("chase");
    car.heading = 0;
    car.u = 28;
    const lip = car.y;
    // Up over a 2 m lip and back down to the same ground: a designed jump,
    // and the frame it is watched in must not change for it.
    let vy = 7;
    const { overs } = run(state, cam, 90, (s) => {
      vy -= 9.81 * FRAME;
      s.car.y += vy * FRAME;
      if (s.car.y <= lip) {
        s.car.y = lip;
        vy = 0;
      }
      s.car.airborne = s.car.y > lip;
      s.car.vy = vy;
      s.car.z += 28 * FRAME;
    });
    // What little there is over the rig's 2 m ride height is its own
    // descent lift (`dropLift`) on the way down; the cliff hold contributes
    // none of it.
    expect(Math.max(...overs.slice(4))).toBeLessThan(2.8);
  });
});
