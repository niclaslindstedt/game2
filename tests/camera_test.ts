// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The chase camera at a cliff. Two rules meet there and both used to fail:
// the ground the camera stands on may fall away in ONE STEP (a terrain
// lattice kinks, a shoreline swaps ground for water, two fields meet at a
// seam), and the camera must fly down that rather than cut to it; and while
// the car is falling the camera must NOT ride it down, because two metres
// over the roof is what a twenty-five metre drop looks like when nothing at
// all is happening. Driven directly — the camera only ever reads state, so a
// scripted fall is the whole scenario and needs no physics.
import * as THREE from "three";
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

/** Undulating ground and a weaving car — everything an outside rig answers
 * to at once (the nose, the swing, the hill lift, the floor it may not sink
 * under), scripted so every rig answers the identical drive. */
function weave(
  state: GameState,
  cam: ReturnType<typeof createGameCamera>,
  frames: number,
): { heights: number[]; pitches: number[] } {
  const car = state.car;
  const z0 = car.z;
  const ground = (z: number): number =>
    Math.sin((z - z0) * 0.07) * 1.1 + Math.sin((z - z0) * 0.31) * 0.2;
  state.terrain = { ...state.terrain, groundAt: (_x, z) => ground(z), waterAt: () => null };
  car.u = 30;
  car.y = ground(z0);
  const heights: number[] = [];
  const pitches: number[] = [];
  const dir = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    const t = f * FRAME;
    car.heading = Math.sin(t * 1.6) * 0.5;
    car.yawRate = Math.cos(t * 1.6) * 0.8;
    car.z += car.u * FRAME;
    const y = ground(car.z);
    car.vy = (y - car.y) / FRAME;
    car.y = y;
    cam.update(state, FRAME);
    heights.push(cam.camera.position.y - car.y);
    cam.camera.getWorldDirection(dir);
    pitches.push(Math.asin(Math.max(-1, Math.min(1, dir.y))));
  }
  return { heights, pitches };
}

/** Nothing but the road's own grain: a car held at pace, dead straight, on
 * ground with no shape to it at all. Whatever moves the lens here is the
 * hood cam's own invention. */
function straight(
  state: GameState,
  cam: ReturnType<typeof createGameCamera>,
  frames: number,
): { heights: number[]; pitches: number[] } {
  const car = state.car;
  state.terrain = { ...state.terrain, groundAt: () => car.y, waterAt: () => null };
  car.heading = 0;
  car.yawRate = 0;
  car.u = 30;
  const heights: number[] = [];
  const pitches: number[] = [];
  const dir = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    car.z += car.u * FRAME;
    cam.update(state, FRAME);
    heights.push(cam.camera.position.y - car.y);
    cam.camera.getWorldDirection(dir);
    pitches.push(Math.asin(Math.max(-1, Math.min(1, dir.y))));
  }
  return { heights, pitches };
}

/** How violently a series moves, per second squared. A pan of any speed has
 * almost no second difference; a shot that ROCKS is nothing else, which is
 * why this and not the travel itself is what "smooth" has to be measured
 * against — a camera can move a long way and still be smooth. */
function jolt(series: number[]): number {
  let sum = 0;
  for (let i = 1; i < series.length - 1; i++) {
    sum += ((series[i + 1] - 2 * series[i] + series[i - 1]) / (FRAME * FRAME)) ** 2;
  }
  return Math.sqrt(sum / (series.length - 2));
}

function spread(series: number[]): number {
  const mean = series.reduce((a, v) => a + v, 0) / series.length;
  return Math.sqrt(series.reduce((a, v) => a + (v - mean) ** 2, 0) / series.length);
}

/** The grain fades in over its first half second, and a rising envelope on
 * an oscillation is its own transient — measure the steady state. */
const SETTLED = 90;

function steady(cam: ReturnType<typeof createGameCamera>, mode: "close" | "chase" | "hood") {
  const state = game();
  cam.setMode(mode);
  cam.skipStartShot();
  const run = mode === "hood" ? straight(state, cam, 600) : weave(state, cam, 600);
  return {
    heave: jolt(run.heights.slice(SETTLED)),
    pitch: jolt(run.pitches.slice(SETTLED)),
    travel: spread(run.heights.slice(SETTLED)),
  };
}

describe("the two shots the game is driven from", () => {
  it("are equally steady over the same drive", () => {
    const close = steady(createGameCamera(1600, 900), "close");
    const chase = steady(createGameCamera(1600, 900), "chase");
    // `chase` stands further back than `close`, and a longer boom turns the
    // same lag into more travel — so matching it is not free, it is what the
    // shared follow rate and swing spring in CHASE_RIGS buy. Stood back is
    // allowed to be a different FRAMING; it is not allowed to be a rockier
    // picture.
    expect(chase.heave).toBeLessThanOrEqual(close.heave);
    expect(chase.pitch).toBeLessThanOrEqual(close.pitch);
  });
});

describe("the hood camera's road grain", () => {
  it("shakes the seat without shaking the picture apart", () => {
    const hood = steady(createGameCamera(1600, 900), "hood");
    // The road is still coming up through the seat: on a smooth straight at
    // pace the eye is never still, and a grain that stopped being felt would
    // put the bonnet back to being a painted slab pinned to the glass.
    expect(hood.travel).toBeGreaterThan(0.004);
    // ...but it is a vibration, not a rattle. Both ceilings are what a 60 Hz
    // frame can still draw as a WAVE rather than as a different offset every
    // frame; past them the grain has stopped describing the road and started
    // describing the sampling.
    expect(hood.heave).toBeLessThan(7);
    expect(hood.pitch).toBeLessThan(6.5);
  });
});
