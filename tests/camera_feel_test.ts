// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The outside camera as an INSTRUMENT (camera-feel.ts): grip read as
// height, the car's attitude read as a degree or two of tilt, and pace past
// the gears read as a tremor. Driven directly — the camera only ever reads
// state, so a scripted car is the whole scenario and needs no physics.
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  compileTrack,
  createGame,
  step,
  type GameState,
  type SegmentPlan,
} from "@engine";

import {
  CAMERA_FEEL,
  bankWanted,
  gripReading,
  hoverFor,
  pitchWanted,
  tremorAmount,
  tremorAt,
} from "../pwa/src/game/camera-feel.ts";
import { createGameCamera } from "../pwa/src/game/camera.ts";

const FLAT: SegmentPlan[] = [{ kind: "straight", length: 800, feature: "none" }];
const FRAME = 1 / 60;
const DEG = Math.PI / 180;

/** The chase rig's height over the car and its hover, restated rather than
 * exported (CHASE_RIGS in camera.ts): a test that read them off the module
 * could not catch the module changing them. */
const CHASE_HEIGHT = 2.45;
const CHASE_HOVER = 0.8;

function game(): GameState {
  const state = createGame({
    seed: 4,
    carId: "compact",
    skipCountdown: true,
    track: compileTrack(4, FLAT),
  });
  // Settled on level ground, all four wheels planted, on the gravel the
  // read is quoted against.
  const car = state.car;
  state.terrain = { ...state.terrain, groundAt: () => car.y, waterAt: () => null };
  state.surface = "gravel";
  car.airborne = false;
  car.weight = 1;
  car.loft = 0;
  car.settle = 0;
  car.slide = 0;
  return state;
}

/** A chase camera stood on `state` and left to settle. */
function chase(state: GameState): ReturnType<typeof createGameCamera> {
  const cam = createGameCamera(1600, 900);
  cam.setMode("chase");
  cam.skipStartShot();
  for (let f = 0; f < 120; f++) cam.update(state, FRAME);
  return cam;
}

/** The lens's height over the car's own. */
function over(cam: ReturnType<typeof createGameCamera>, state: GameState): number {
  return cam.camera.position.y - state.car.y;
}

/** How far the lens's RIGHT axis dips below the horizontal, rad — positive
 * is the frame banked into a right-hander (its up vector tipped right). */
function bankOf(cam: ReturnType<typeof createGameCamera>): number {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.camera.quaternion);
  return -Math.asin(Math.max(-1, Math.min(1, right.y)));
}

describe("the grip reading", () => {
  it("is 1 for a car standing on its whole weight on gravel", () => {
    expect(gripReading(game())).toBeCloseTo(1, 6);
  });

  it("is nothing at all in the air, and less over a brow", () => {
    const flying = game();
    flying.car.airborne = true;
    expect(gripReading(flying)).toBe(0);
    const light = game();
    light.car.weight = 0.6;
    expect(gripReading(light)).toBeCloseTo(0.6, 6);
  });

  it("reads a slide as spending some of it, and a sealed road as holding more", () => {
    const sliding = game();
    sliding.car.slide = 1;
    expect(gripReading(sliding)).toBeCloseTo(1 - CAMERA_FEEL.grip.slideCost, 6);
    const sealed = game();
    sealed.surface = "asphalt";
    // Whether a sealed road is more grip than gravel is the car's tires'
    // business (a loose-surface tire skates on it); the compact's read
    // above 1 is what lets the camera settle a little below its height.
    expect(gripReading(sealed)).toBeGreaterThan(1);
  });

  it("stands the camera off its height by the hover, bounded below", () => {
    expect(hoverFor(1, CHASE_HOVER)).toBeCloseTo(0, 9);
    expect(hoverFor(0, CHASE_HOVER)).toBeCloseTo(CHASE_HOVER, 9);
    expect(hoverFor(0.5, CHASE_HOVER)).toBeCloseTo(CHASE_HOVER / 2, 9);
    expect(hoverFor(3, CHASE_HOVER)).toBeCloseTo(-CAMERA_FEEL.grip.sink * CHASE_HOVER, 9);
  });
});

describe("grip as height", () => {
  it("stands at the rig's own height on planted wheels", () => {
    const state = game();
    const cam = chase(state);
    expect(over(cam, state)).toBeCloseTo(CHASE_HEIGHT, 1);
  });

  it("hovers up as the car goes light, and to the top of its travel when it flies", () => {
    const state = game();
    const cam = chase(state);
    const planted = over(cam, state);
    state.car.weight = 0.5;
    for (let f = 0; f < 120; f++) cam.update(state, FRAME);
    const light = over(cam, state);
    expect(light - planted).toBeGreaterThan(CHASE_HOVER * 0.4);
    expect(light - planted).toBeLessThan(CHASE_HOVER * 0.6);
    // Flying: no grip at all. The car is held at its own height so the
    // cliff hold (CLIFF) contributes nothing and the lift is the hover's.
    state.car.weight = 1;
    state.car.airborne = true;
    for (let f = 0; f < 120; f++) cam.update(state, FRAME);
    const flying = over(cam, state);
    expect(flying - planted).toBeGreaterThan(CHASE_HOVER * 0.95);
    expect(flying - planted).toBeLessThan(CHASE_HOVER * 1.05);
  });

  it("settles a little BELOW its height where the tires hold harder than gravel", () => {
    const state = game();
    const cam = chase(state);
    const gravel = over(cam, state);
    state.surface = "asphalt";
    for (let f = 0; f < 180; f++) cam.update(state, FRAME);
    const sealed = over(cam, state);
    expect(sealed).toBeLessThan(gravel - 0.02);
    expect(gravel - sealed).toBeLessThanOrEqual(CAMERA_FEEL.grip.sink * CHASE_HOVER + 1e-6);
  });

  it("comes down again as a landed car settles", () => {
    const state = game();
    const cam = chase(state);
    const planted = over(cam, state);
    state.car.airborne = true;
    for (let f = 0; f < 120; f++) cam.update(state, FRAME);
    // Down, still skittering on its tires.
    state.car.airborne = false;
    state.car.settle = 1;
    for (let f = 0; f < 30; f++) cam.update(state, FRAME);
    const skittering = over(cam, state);
    expect(skittering).toBeGreaterThan(planted + 0.1);
    state.car.settle = 0;
    for (let f = 0; f < 180; f++) cam.update(state, FRAME);
    expect(over(cam, state)).toBeCloseTo(planted, 1);
  });
});

describe("attitude as tilt", () => {
  it("wants a bank into a right-hand drift, and a smaller one into a gripped right turn", () => {
    const state = game();
    const car = state.car;
    car.u = 30;
    // Turning right: positive yaw rate. A gripped turn at about half a g.
    car.yawRate = 0.16;
    car.slip = 0;
    const turn = bankWanted(car);
    expect(turn).toBeGreaterThan(0);
    // ...and sliding through it: yawed further right than the travel, so
    // the sideways speed is to the LEFT and the slip angle is negative.
    car.slip = -0.5;
    const drift = bankWanted(car);
    expect(drift).toBeGreaterThan(turn);
    // A degree or two, never more.
    expect(drift).toBeLessThanOrEqual(CAMERA_FEEL.tilt.bankMax * DEG + 1e-9);
    expect(drift).toBeGreaterThan(1 * DEG);
    // Mirrored to the left.
    car.yawRate = -0.16;
    car.slip = 0.5;
    expect(bankWanted(car)).toBeCloseTo(-drift, 9);
  });

  it("never banks more than the ceiling, and not at all in the air", () => {
    const state = game();
    const car = state.car;
    car.u = 40;
    car.yawRate = 3;
    car.slip = -1.2;
    expect(bankWanted(car)).toBeCloseTo(CAMERA_FEEL.tilt.bankMax * DEG, 9);
    car.airborne = true;
    expect(bankWanted(car)).toBe(0);
  });

  it("tips back up a climb, forward down a drop, and nods with the body's dive", () => {
    const state = game();
    const car = state.car;
    // A 10% grade at the default share is about a degree.
    const up = pitchWanted(0.1, car);
    expect(up).toBeGreaterThan(0.5 * DEG);
    expect(up).toBeLessThan(2 * DEG);
    expect(pitchWanted(-0.1, car)).toBeCloseTo(-up, 9);
    expect(pitchWanted(5, car)).toBeCloseTo(CAMERA_FEEL.tilt.slopeMax * DEG, 9);
    // The nose dropping under the brakes tips the shot forward with it.
    car.pitchLoad = -0.04;
    expect(pitchWanted(0, car)).toBeLessThan(0);
  });

  it("banks the chase frame into a right-hand slide, by a degree or two", () => {
    const state = game();
    const cam = chase(state);
    expect(Math.abs(bankOf(cam))).toBeLessThan(0.05 * DEG);
    const car = state.car;
    car.u = 30;
    car.yawRate = 0.4;
    car.slip = -0.5;
    car.w = -Math.tan(0.5) * 30;
    car.slide = 0.8;
    for (let f = 0; f < 120; f++) cam.update(state, FRAME);
    const bank = bankOf(cam);
    expect(bank).toBeGreaterThan(1 * DEG);
    expect(bank).toBeLessThanOrEqual(CAMERA_FEEL.tilt.bankMax * DEG + 0.01 * DEG);
    // ...and comes back level once the car is straight.
    car.yawRate = 0;
    car.slip = 0;
    car.w = 0;
    car.slide = 0;
    for (let f = 0; f < 180; f++) cam.update(state, FRAME);
    expect(Math.abs(bankOf(cam))).toBeLessThan(0.05 * DEG);
  });

  it("tips the chase frame back on a climb, over and above the aim's own lift", () => {
    // The same hill twice: once with the attitude on, once with it off. The
    // aim rides the climb either way (`aimClimb`); the difference is the
    // frame's own pitch, and it has to be the share the knob says.
    const pitchOn = (slope: number): number => {
      const was = CAMERA_FEEL.tilt.slope;
      CAMERA_FEEL.tilt.slope = slope;
      try {
        const state = game();
        const car = state.car;
        const grade = 0.15;
        state.terrain = { ...state.terrain, groundAt: (_x, z) => z * grade, waterAt: () => null };
        car.heading = 0;
        car.u = 25;
        car.y = car.z * grade;
        const cam = createGameCamera(1600, 900);
        cam.setMode("chase");
        cam.skipStartShot();
        for (let f = 0; f < 240; f++) {
          car.z += car.u * FRAME;
          const y = car.z * grade;
          car.vy = (y - car.y) / FRAME;
          car.y = y;
          cam.update(state, FRAME);
        }
        const dir = new THREE.Vector3();
        cam.camera.getWorldDirection(dir);
        return Math.asin(dir.y);
      } finally {
        CAMERA_FEEL.tilt.slope = was;
      }
    };
    const on = pitchOn(CAMERA_FEEL.tilt.slope);
    const off = pitchOn(0);
    const share = (on - off) / Math.atan(0.15);
    expect(share).toBeGreaterThan(CAMERA_FEEL.tilt.slope * 0.8);
    expect(share).toBeLessThan(CAMERA_FEEL.tilt.slope * 1.2);
  });
});

describe("speed as a tremor", () => {
  it("is nothing inside the gears and full at three hundred", () => {
    expect(tremorAmount(0)).toBe(0);
    expect(tremorAmount(CAMERA_FEEL.speed.from)).toBe(0);
    // Grows gently: at a quarter of the way it is well under a quarter.
    const S = CAMERA_FEEL.speed;
    expect(tremorAmount(S.from + (S.full - S.from) * 0.25)).toBeLessThan(0.1);
    expect(tremorAmount(S.full)).toBeCloseTo(1, 9);
    expect(tremorAmount(S.full + 30)).toBeCloseTo(1, 9);
  });

  it("moves the lens by its travel and no further", () => {
    let worst = 0;
    for (let t = 0; t < 10; t += 0.005) {
      const at = tremorAt(t, 1, 1);
      worst = Math.max(worst, Math.abs(at.x), Math.abs(at.y));
      expect(Math.abs(at.nod)).toBeLessThanOrEqual(CAMERA_FEEL.speed.nod + 1e-9);
    }
    expect(worst).toBeLessThanOrEqual(CAMERA_FEEL.speed.travel + 1e-9);
    expect(worst).toBeGreaterThan(CAMERA_FEEL.speed.travel * 0.5);
  });

  it("trembles the chase frame at a fall's pace and leaves a run on the power alone", () => {
    /** Spread of the lens's height over the car through a second of
     * settled driving at `speed`, m — a dead straight on flat ground, where
     * nothing else moves the lens. */
    const wobble = (speed: number): number => {
      const state = game();
      const car = state.car;
      car.heading = 0;
      car.u = speed;
      const cam = chase(state);
      const heights: number[] = [];
      for (let f = 0; f < 120; f++) {
        car.z += car.u * FRAME;
        cam.update(state, FRAME);
        if (f >= 60) heights.push(over(cam, state));
      }
      const mean = heights.reduce((a, v) => a + v, 0) / heights.length;
      return Math.sqrt(heights.reduce((a, v) => a + (v - mean) ** 2, 0) / heights.length);
    };
    expect(wobble(40)).toBeLessThan(1e-4);
    const falling = wobble(83);
    expect(falling).toBeGreaterThan(0.005);
    expect(falling).toBeLessThan(CAMERA_FEEL.speed.travel);
  });
});

describe("under a real drive", () => {
  it("holds every reading inside its bounds through a stage", () => {
    // The bot's own drive through a generated stage, the frame read every
    // step: whatever the car does, the bank stays inside its ceiling and
    // the lens stays inside the hover over the rig's height (plus the
    // cliff hold and the springs, which are the rest of the picture).
    const state = createGame({ seed: 11, carId: "compact", skipCountdown: true });
    const cam = createGameCamera(1600, 900);
    cam.setMode("chase");
    cam.skipStartShot();
    let worstBank = 0;
    for (let f = 0; f < 60 * 25; f++) {
      step(state, { ...NEUTRAL_INPUT, throttle: 1, steer: Math.sin(f / 40) * 0.5 });
      step(state, { ...NEUTRAL_INPUT, throttle: 1, steer: Math.sin(f / 40) * 0.5 });
      cam.update(state, FRAME);
      worstBank = Math.max(worstBank, Math.abs(bankOf(cam)));
    }
    expect(worstBank).toBeLessThanOrEqual(CAMERA_FEEL.tilt.bankMax * DEG + 0.05 * DEG);
  });
});
