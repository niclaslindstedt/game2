// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The chase camera at a cliff. Two rules meet there and both used to fail:
// the ground the camera stands on may fall away in ONE STEP (a terrain
// lattice kinks, a shoreline swaps ground for water, two fields meet at a
// seam), and the camera must fly down that rather than cut to it; and the
// camera must COME WITH the falling car rather than watch it leave, on a
// rod that turns over to lie along the car's own path (`flight` in
// camera-feel.ts) so the fall reads as a fall without the car shrinking to
// a dot. Driven directly — the camera only ever reads state, so a scripted
// fall is the whole scenario and needs no physics.
//
// ...and, at the bottom, the TRANSIT between two cars (camera-sweep.ts): a
// spectator changing crew is a jump of hundreds of metres over country that
// is mostly hill, and the one thing a picture can never prove is that the
// lens did not go THROUGH any of it.
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  step,
  type GameState,
  type SegmentPlan,
} from "@engine";

import { clamp } from "../pwa/src/lib/angles.ts";

import {
  DRIVING_MODES,
  PLAY_MODES,
  createGameCamera,
  type CameraMode,
} from "../pwa/src/game/camera.ts";
import type { ShakeSource } from "../pwa/src/game/camera-shake.ts";

const FLAT: SegmentPlan[] = [{ kind: "straight", length: 600, feature: "none" }];

const FRAME = 1 / 60;
const DEG = Math.PI / 180;

/** The rigs that STAND somewhere rather than being sat in — the five the one
 * chase table drives (CHASE_RIGS in camera.ts). Restated rather than
 * exported: a test that read the list off the module could not catch the
 * module moving a camera from one family to the other. */
const OUTSIDE: CameraMode[] = ["close", "chase", "far", "heli", "top", "tv"];

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
): {
  worstStep: number;
  heights: number[];
  overs: number[];
  /** How far the lens is from the car, m — the standoff the rod's own
   * length sets, which is what says whether the car is being followed or
   * being left behind. */
  ranges: number[];
  /** ...and how far below the horizontal it is pointing, rad. */
  pitches: number[];
} {
  const heights: number[] = [];
  const overs: number[] = [];
  const ranges: number[] = [];
  const pitches: number[] = [];
  const dir = new THREE.Vector3();
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
    const car = state.car;
    ranges.push(cam.camera.position.distanceTo(new THREE.Vector3(car.x, car.y, car.z)));
    cam.camera.getWorldDirection(dir);
    pitches.push(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)));
  }
  return { worstStep, heights, overs, ranges, pitches };
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

  /** A car driven off a lip into free fall, and everything the shot does
   * about it. `low` is the ground under the whole world: far below by
   * default, so what is measured is the rig and never the floor. */
  function freefall(mode: CameraMode, frames = 180, low = -500) {
    const state = game();
    const car = state.car;
    cliffGround(state, car.z - 1e6, low, low);
    const cam = createGameCamera(1600, 900);
    cam.setMode(mode);
    car.heading = 0;
    car.u = 24;
    const top = car.y;
    // Two seconds on the flat first, so what the fall changes is measured
    // against a settled shot rather than against a rig still standing up.
    const level = run(state, cam, 120, (s) => {
      s.car.z += 24 * FRAME;
    });
    let vy = 0;
    const fall = run(state, cam, frames, (s) => {
      s.car.airborne = true;
      vy -= 9.81 * FRAME;
      s.car.vy = vy;
      s.car.y += vy * FRAME;
      s.car.z += 24 * FRAME;
    });
    return { state, car, cam, top, level, fall, fallen: top - car.y };
  }

  it("comes down with the car instead of watching it leave", () => {
    const { top, level, fall, fallen } = freefall("chase");
    expect(fallen).toBeGreaterThan(40);
    // THE RULE. The rod TURNS to lie along the car's path rather than
    // stretching: the lens swings over the falling car, so it ends up
    // higher above it than the rig's own 2.45 m — but no further AWAY from
    // it than a rod that length can reach. A camera left on the clifftop
    // would be tens of metres off; this one is within a couple of the
    // standoff it was driving with.
    const settled = level.ranges[level.ranges.length - 1];
    expect(Math.max(...fall.ranges)).toBeLessThan(settled + 2.5);
    // ...and it really did travel: most of the whole fall, not a fraction,
    // and what it is short by is the rod standing it over the car rather
    // than any part of it left behind at the top.
    expect(top - fall.heights[fall.heights.length - 1]).toBeGreaterThan(fallen * 0.8);
    expect(fall.overs[fall.overs.length - 1]).toBeLessThan(10);
  });

  it("pitches over after it, and does it smoothly", () => {
    const { level, fall } = freefall("chase");
    // The settled shot looks a few degrees down at the car; by the bottom
    // of the fall it is looking down the fall itself.
    expect(level.pitches[level.pitches.length - 1]).toBeGreaterThan(-15 * DEG);
    expect(fall.pitches[fall.pitches.length - 1]).toBeLessThan(-45 * DEG);
    // And it gets there smoothly: no frame moves the lens more than a
    // hand's width more than the frame before it, and no frame turns it
    // more than a fraction of a degree more than the frame before it.
    for (let f = 2; f < fall.heights.length; f++) {
      const jerk = Math.abs(fall.heights[f] - 2 * fall.heights[f - 1] + fall.heights[f - 2]);
      expect(jerk).toBeLessThan(0.1);
      const turn = Math.abs(fall.pitches[f] - 2 * fall.pitches[f - 1] + fall.pitches[f - 2]);
      expect(turn).toBeLessThan(0.5 * DEG);
    }
  });

  it("does it from every seat the game is driven from", () => {
    // The one thing no camera may do is let the car fall out of it. The
    // outside rigs turn their rod by their own share of the read; the seats
    // inside the car cannot lose it at all.
    //
    // Stated over the views hung off the CAR, because the quantity here is a
    // RANGE to it: the TV cam's tripods are planted in the world and stay
    // there (camera-tv.ts), so a car going over a cliff is a car getting
    // several hundred metres further away, which is the camera doing its
    // job rather than losing the car. That it does not lose it is the next
    // test's rule, in the terms that actually apply to a fixed lens — the
    // FRAME.
    for (const mode of DRIVING_MODES) {
      const { level, fall, fallen } = freefall(mode);
      expect(fallen).toBeGreaterThan(40);
      const settled = level.ranges[level.ranges.length - 1];
      expect(Math.max(...fall.ranges), mode).toBeLessThan(settled + 7);
    }
  });

  it("keeps the car inside the frame the whole way down, in landscape and in portrait", () => {
    // THE RULE THE WHOLE SHEET IS FOR, stated as the frame rather than as the
    // geometry: whatever the OUTSIDE rig, whatever the aspect, a car that has
    // gone over may not leave the picture. Portrait is checked because the
    // fov is VERTICAL — the hor+ rule (`verticalFovFor`) raises it on a phone
    // held upright, so the two aspects frame a steep shot differently and a
    // landscape screenshot cannot answer for both.
    //
    // The three seats INSIDE the car are not in it, and cannot be: they are
    // bolted to the body, so the car's own middle is around the lens rather
    // than in front of it and projects nowhere meaningful. They also cannot
    // fail the rule — a camera cannot lose a car it is sitting in.
    const point = new THREE.Vector3();
    for (const [w, h] of [
      [1600, 900],
      [390, 844],
    ]) {
      for (const mode of OUTSIDE) {
        const state = game();
        const car = state.car;
        cliffGround(state, car.z - 1e6, -500, -500);
        const cam = createGameCamera(w, h);
        cam.setMode(mode);
        car.heading = 0;
        car.u = 24;
        for (let f = 0; f < 120; f++) {
          car.z += 24 * FRAME;
          cam.update(state, FRAME);
        }
        let vy = 0;
        let worst = 0;
        for (let f = 0; f < 240; f++) {
          car.airborne = true;
          vy -= 9.81 * FRAME;
          car.vy = vy;
          car.y += vy * FRAME;
          car.z += 24 * FRAME;
          cam.update(state, FRAME);
          // The car's own middle, in normalised device coordinates: inside
          // ±1 on both axes is inside the picture.
          point.set(car.x, car.y, car.z).project(cam.camera);
          worst = Math.max(worst, Math.abs(point.x), Math.abs(point.y));
        }
        expect(worst, `${mode} at ${w}x${h}`).toBeLessThan(0.8);
      }
    }
  });

  it("comes off a real lip too, however slowly the car goes over it", () => {
    // The alpine case, and the one the floor could plausibly break: real
    // ground level with the car right up to the edge and a sheer drop past
    // it, crawled off rather than driven off. The slower the car goes over,
    // the longer the lens is still standing on the clifftop with solid
    // ground under it — and the floor may never hold it there while the car
    // is on its way to the valley.
    const state = game();
    const car = state.car;
    const top = car.y;
    const edge = car.z + 10;
    cliffGround(state, edge, top, top - 300);
    const cam = createGameCamera(1600, 900);
    cam.setMode("chase");
    car.heading = 0;
    car.u = 4;
    let vy = 0;
    const { heights, ranges } = run(state, cam, 300, (s) => {
      s.car.z += 4 * FRAME;
      if (s.car.z <= edge) return;
      s.car.airborne = true;
      vy -= 9.81 * FRAME;
      s.car.vy = vy;
      s.car.y += vy * FRAME;
    });
    expect(top - car.y).toBeGreaterThan(30);
    const over = heights[heights.length - 1] - car.y;
    expect(over).toBeGreaterThan(2.45);
    expect(over).toBeLessThan(10);
    expect(ranges[ranges.length - 1]).toBeLessThan(ranges[0] + 4);
  });

  it("holds its standoff over an ordinary jump and rises to its hover", () => {
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
    const { overs, ranges } = run(state, cam, 90, (s) => {
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
    // The STANDOFF holds — which is now the length of a rod that TURNS, so
    // the test of it is the range to the car and not the lens's height. The
    // rod dips under the climbing car and comes over the descending one, so
    // the height does move: what may not move is how big the car is in the
    // frame. A designed jump is watched from the same distance it was
    // driven at.
    const settled = ranges[3];
    expect(Math.min(...ranges.slice(4))).toBeGreaterThan(settled - 0.6);
    expect(Math.max(...ranges.slice(4))).toBeLessThan(settled + 1.4);
    // The height reads the grip. In the air there is none, so the lens
    // stands at the top of the rig's hover over its ride height
    // (camera-feel.ts, `hover` in CHASE_RIGS — 0.8 m over 2.45), and the
    // rod's own turn puts it higher again on the way down.
    expect(Math.max(...overs.slice(4))).toBeGreaterThan(2.45 + 0.4);
  });

  it("tips up off the lip, over as the car comes down, and bounces level again", () => {
    const state = game();
    const car = state.car;
    cliffGround(state, car.z - 1e6, -500, -500);
    const cam = createGameCamera(1600, 900);
    cam.setMode("chase");
    car.heading = 0;
    car.u = 28;
    const lip = car.y;
    let vy = 7;
    let landed = 0;
    const { pitches } = run(state, cam, 240, (s) => {
      vy -= 9.81 * FRAME;
      s.car.y += vy * FRAME;
      if (s.car.y <= lip) {
        s.car.y = lip;
        vy = 0;
      }
      s.car.airborne = s.car.y > lip;
      if (!s.car.airborne && landed === 0) landed = 1;
      s.car.vy = vy;
      s.car.z += 28 * FRAME;
    });
    // Where the shot points with the car on the ground, at either end.
    const rest = pitches[pitches.length - 1];
    const climbing = pitches.slice(2, 20);
    const falling = pitches.slice(70, 86);
    // Off the lip the rod dips under the car and the shot looks UP the arc
    // — several degrees above where it sits on the road...
    expect(Math.max(...climbing)).toBeGreaterThan(rest + 10 * DEG);
    // ...and coming back down it comes over and looks along the descent.
    expect(Math.min(...falling)).toBeLessThan(rest - 10 * DEG);
    // Then the wheels are down, the car is level, and the rod swings back
    // through the horizontal and settles — a bounce, not an arrival.
    const after = pitches.slice(90);
    expect(Math.max(...after)).toBeGreaterThan(rest + 0.5 * DEG);
    expect(Math.max(...after)).toBeLessThan(rest + 4 * DEG);
    expect(Math.abs(pitches[pitches.length - 1] - pitches[pitches.length - 30])).toBeLessThan(
      0.2 * DEG,
    );
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

describe("the chase camera over a crease in the ground", () => {
  /** Level ground that turns into a 10% climb at `edge`: the kink every
   * lattice cell edge off the road hands the car, at its sharpest. */
  function creaseGround(state: GameState, edge: number, level: number): void {
    state.terrain = {
      ...state.terrain,
      groundAt: (_x, z) => (z < edge ? level : level + (z - edge) * 0.1),
      waterAt: () => null,
    };
  }

  it("answers the kink as a curve and still climbs the hill", () => {
    const state = game();
    const car = state.car;
    const edge = car.z + 60;
    creaseGround(state, edge, car.y);
    const cam = createGameCamera(1600, 900);
    cam.setMode("chase");
    car.heading = 0;
    car.u = 24;
    car.airborne = false;
    const { heights } = run(state, cam, 300, (s) => {
      s.car.z += 24 * FRAME;
      s.car.y = s.terrain.groundAt(s.car.x, s.car.z);
      s.car.vy = s.car.z > edge ? 2.4 : 0;
    });
    // The height is carried on a MASS: its velocity is built up by the
    // spring, so no frame turns it by more than a whisker. A first-order
    // ease at 9/s turns a kink in the ground into a kink in the camera's
    // path — 0.006 m per frame² over this crease — where the spring, led by
    // the climb, stays under 0.0035.
    let worstTurn = 0;
    for (let i = 2; i < heights.length; i++) {
      worstTurn = Math.max(worstTurn, Math.abs(heights[i] - 2 * heights[i - 1] + heights[i - 2]));
    }
    expect(worstTurn).toBeLessThan(0.004);
    // ...and the hill is followed rather than trailed: led by the car's
    // climb, the camera stands near the same height over the car on the
    // grade as it did on the flat — less the slack's play, the rig's own
    // duck on a climb and the spring's residual, which together are well
    // under a metre. A spring with no lead trails a 2.4 m/s climb by most
    // of a metre on its own.
    const flatOver = heights[60] - state.terrain.groundAt(0, edge - 1);
    const climbOver = heights[heights.length - 1] - car.y;
    expect(flatOver - climbOver).toBeGreaterThan(0);
    expect(flatOver - climbOver).toBeLessThan(0.8);
  });
});

describe("the two shots the game is driven from", () => {
  it("are equally steady over the same drive", () => {
    const close = steady(createGameCamera(1600, 900), "close");
    const chase = steady(createGameCamera(1600, 900), "chase");
    // `chase` stands further back than `close`, and a longer boom turns the
    // same lag into more travel — so matching it is not free, it is what the
    // shared follow rate and swing spring in CHASE_RIGS buy. Stood back is
    // allowed to be a different FRAMING; it is not allowed to be a rockier
    // picture.
    //
    // Within a fraction of a percent the two ARE the same number, and which
    // way a tie falls is decided by the last bits of a standoff nobody is
    // asserting. A rig that had actually gone rocky would not need a tighter
    // comparison than this — the failure this guards is a multiple, not a
    // rounding.
    const SAME = 1.01;
    expect(chase.heave).toBeLessThanOrEqual(close.heave * SAME);
    expect(chase.pitch).toBeLessThanOrEqual(close.pitch * SAME);
  });
});

/** THE DRIFT AS THE FRAMING SHOWS IT, deg: how far the shot's own forward
 * has come away from where the car's nose points. The camera builds its
 * yaw as (sin, cos), so the lens's world yaw comes straight back off its
 * quaternion and the gap against `car.heading` IS the angle the car lies
 * across the frame. */
function framedDrift(cam: ReturnType<typeof createGameCamera>, state: GameState): number {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.camera.quaternion);
  const yaw = Math.atan2(fwd.x, fwd.z);
  let gap = yaw - state.car.heading;
  while (gap > Math.PI) gap -= Math.PI * 2;
  while (gap < -Math.PI) gap += Math.PI * 2;
  return (gap * 180) / Math.PI;
}

/** Hold the car at `slipDeg` of slip at pace and let the framing settle
 * there, then read what the shot shows. Scripted straight onto the car
 * rather than driven: the question is what the CAMERA does with a slip
 * angle, and a physics model that will only give one car forty degrees is
 * the wrong instrument for asking it. */
function framedAt(mode: CameraMode, slipDeg: number, opts: { airborne?: boolean } = {}): number {
  const state = game();
  const cam = createGameCamera(1600, 900);
  cam.setMode(mode);
  const speed = 35;
  const slip = (slipDeg * Math.PI) / 180;
  state.car.u = speed * Math.cos(slip);
  state.car.w = speed * Math.sin(slip);
  state.car.airborne = opts.airborne ?? false;
  // Long enough that the drift offset has wound all the way on: it eases at
  // the rig's own follow rate, which is a few tenths of a second.
  for (let f = 0; f < 300; f++) cam.update(state, FRAME);
  return framedDrift(cam, state);
}

/** THE SLIP ANGLES THE ROSTER ACTUALLY REACHES, deg — the peak off a
 * Scandinavian flick into a soft left, per car, as `npm run drift -- --table`
 * measures it. They are what the ceiling exists for: three layouts that go
 * sideways by very different amounts on purpose. */
const ROSTER_PEAKS = { compact: 29.6, coupe: 24.3, classic: 40.7 };

describe("the drift in the framing", () => {
  it("carries an ordinary slide at its full weight", () => {
    // Well under the ceiling the share is the rig's `driftWeight` and
    // nothing else — a ten-degree slide is filmed as a ten-degree slide, so
    // the car that rarely goes past that is filmed exactly as it was.
    expect(Math.abs(framedAt("chase", 10))).toBeGreaterThan(10 * 0.8 * 0.9);
    expect(Math.abs(framedAt("chase", 10))).toBeLessThan(10 * 0.8 * 1.02);
  });

  it("never lays the car across the shot, however deep the slide", () => {
    for (const mode of ["close", "chase", "far"] as const) {
      // Twice the deepest angle in the roster, which is more than the
      // physics will give any car: the ceiling is a ceiling.
      expect(Math.abs(framedAt(mode, 80))).toBeLessThan(19);
    }
  });

  it("frames the three layouts' deepest slides alike", () => {
    const framed = Object.values(ROSTER_PEAKS).map((slip) => Math.abs(framedAt("chase", slip)));
    // Straight off `driftWeight` the three would be filmed 1.7:1 apart, as
    // their peaks are — a sixteen-degree gap between the front-driver's
    // deepest slide and the rear-driver's, which is the whole complaint.
    // Softened onto the ceiling they land inside a couple of degrees of
    // each other: the cars drive differently and are filmed the same.
    expect(Math.max(...framed) - Math.min(...framed)).toBeLessThan(2.5);
  });

  it("follows the travel whole in the air", () => {
    // Nothing capped: a car that left the lip crossed up is going where its
    // travel points, and the shot's job for those two seconds is the
    // landing.
    expect(Math.abs(framedAt("chase", 40, { airborne: true }))).toBeGreaterThan(36);
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

/** THE WHEEL TRACKS. R16 builds the road with a crown down the middle and
 * two worn tracks either side of it, and the car rides that cross-section —
 * so a corner that carries the car across the road moves it up and down by
 * fifteen centimetres on ground that is dead flat. The car is supposed to
 * do that. The camera is not (SLACK in camera.ts).
 *
 * Nothing here is scripted onto the car: the road is compiled flat, the
 * physics drives, and the only input is a lateral line the car is steered
 * along. Whatever the camera does with it is the whole measurement.
 */
const WEAVE = { reach: 3.4, period: 5 };

/** A dead-flat, dead-straight stage: no elevation, no bank. Every metre of
 * vertical anything moves on it comes from the road's cross-section. */
function flatRoad(): GameState {
  const base = compileTrack(3, [{ kind: "straight", length: 2000, feature: "none" }]);
  return createGame({
    seed: 3,
    carId: "compact",
    skipCountdown: true,
    track: { ...base, samples: base.samples.map((s) => ({ ...s, elevation: 0, bank: 0 })) },
  });
}

/** ...and the same road rolled into 6 m hills on a 400 m wavelength: the
 * terrain the camera still has to fly. Long enough that the car crests
 * them on its wheels at full throttle — a shorter one is a jump now, and
 * a car in the air is the other test's subject. */
function rollingRoad(): GameState {
  const base = compileTrack(3, [{ kind: "straight", length: 2000, feature: "none" }]);
  return createGame({
    seed: 3,
    carId: "compact",
    skipCountdown: true,
    track: {
      ...base,
      samples: base.samples.map((s) => ({
        ...s,
        elevation: 6 * Math.sin((s.s * Math.PI * 2) / 400),
        bank: 0,
      })),
    },
  });
}

/** Drive `state` at full throttle for `seconds`, steering the car along a
 * lateral line across the road, and report what the camera and the car each
 * did. `line` is metres right of where the car started. */
function driveAcross(
  state: GameState,
  mode: "chase" | "hood",
  seconds: number,
  line: (t: number) => number,
): { camY: number[]; carY: number[]; camRoll: number[]; carRoll: number[] } {
  const cam = createGameCamera(1600, 900);
  cam.setMode(mode);
  const sub = Math.round(FRAME / TUNING.dt);
  const drive = (steer: number): void => {
    for (let s = 0; s < sub; s++) step(state, { ...NEUTRAL_INPUT, throttle: 1, steer });
  };
  // Up to pace first, straight: a car pulling away from the line is not
  // driving the road yet.
  for (let f = 0; f < 60 * 6; f++) {
    drive(0);
    cam.update(state, FRAME);
  }
  const home = state.car.x;
  const trace = {
    camY: [] as number[],
    carY: [] as number[],
    camRoll: [] as number[],
    carRoll: [] as number[],
  };
  const up = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let was = 0;
  for (let f = 0; f < Math.round(seconds / FRAME); f++) {
    const off = state.car.x - home;
    // Hold the line: proportional on the offset, damped on the rate it is
    // closing at, so the car crosses the road instead of diverging off it.
    const steer = clamp(0.11 * (line(f * FRAME) - off) - 0.24 * ((off - was) / FRAME), -0.4, 0.4);
    was = off;
    drive(steer);
    cam.update(state, FRAME);
    trace.camY.push(cam.camera.position.y);
    trace.carY.push(state.car.y);
    cam.camera.getWorldDirection(dir);
    up.set(0, 1, 0).applyQuaternion(cam.camera.quaternion);
    trace.camRoll.push(Math.atan2(up.x * dir.z - up.z * dir.x, up.y));
    trace.carRoll.push(state.car.roll);
  }
  return trace;
}

/** The BUMP in a trace: the biggest excursion from its own 1.5 s moving
 * average. A hill lives in the average; a wheel track does not. */
function bump(series: number[]): number {
  const win = Math.round(0.75 / FRAME);
  let peak = 0;
  for (let i = win; i < series.length - win; i++) {
    let avg = 0;
    for (let k = -win; k <= win; k++) avg += series[i + k];
    peak = Math.max(peak, Math.abs(series[i] - avg / (2 * win + 1)));
  }
  return peak;
}

const weaving = (t: number): number => WEAVE.reach * Math.sin((t * Math.PI * 2) / WEAVE.period);

describe("the road's own cross-section", () => {
  it("moves the car and not the camera", () => {
    const run = driveAcross(flatRoad(), "chase", 16, weaving);
    // The car is doing what R16 says it should: dropping into a wheel track
    // and climbing back over the crown, on a stage with no hill in it.
    expect(bump(run.carY)).toBeGreaterThan(0.06);
    // The camera is not following it there. What is left is a slow drift of
    // under a centimetre — the play recovering — not a bump.
    expect(bump(run.camY)).toBeLessThan(0.02);
  });

  it("rocks the body and not the driver's horizon", () => {
    const run = driveAcross(flatRoad(), "hood", 16, weaving);
    const body = Math.max(...run.carRoll) - Math.min(...run.carRoll);
    const horizon = Math.max(...run.camRoll) - Math.min(...run.camRoll);
    // The trough of a wheel track is steep enough to tip the body ten
    // degrees over a crossing...
    expect(body).toBeGreaterThan(0.15);
    // ...and the driver's head is levelled against most of it. Not all: a
    // seat that took none of the road would be a tripod, and the neck's own
    // lean through the corner is in here too.
    expect(horizon).toBeLessThan(body * 0.55);
  });

  it("leaves the hills alone", () => {
    const run = driveAcross(rollingRoad(), "chase", 16, () => 0);
    const rise = Math.max(...run.carY) - Math.min(...run.carY);
    expect(rise).toBeGreaterThan(10);
    // The camera flies all of it. The play it hangs on is the only thing it
    // is allowed to keep, and that is centimetres against metres.
    expect(Math.max(...run.camY) - Math.min(...run.camY)).toBeGreaterThan(rise - 0.75);
  });
});

/** THE HEAD ON THE NECK. The three in-car views are the only ones with the
 * car's own furniture in frame, which changes what "steady" means: a head
 * moving against the shell moves the fascia a hand's reach from the lens,
 * not the road twenty metres out. So what these lock is not how far the
 * picture travels but what it is ALLOWED to — the arc a neck swings on, the
 * direction a load throws it, and the fact that none of it is a reading of
 * the machine's frame rate. */
const NECK_SETTLE = 1.5;
const NECK_LOAD = 0.8;

/** Drive dead straight and flat at `u` m/s for a while, then apply `load`
 * (m/s² along the nose) for the rest of it, and report where the lens ends
 * up in the car's own axes relative to where it settled before the load. */
function neckRun(
  mode: "cockpit" | "hood" | "bumper",
  frame: number,
  load: number,
  kick?: { at: number; strength: number; dir: { x: number; y: number; z: number } },
): { fwd: number; up: number; side: number; worst: number } {
  const state = game();
  const cam = createGameCamera(1600, 900);
  cam.setMode(mode);
  cam.skipStartShot();
  const car = state.car;
  state.terrain = { ...state.terrain, groundAt: () => car.y, waterAt: () => null };
  car.heading = 0;
  car.yawRate = 0;
  car.u = 34;
  const at = (): { fwd: number; up: number; side: number } => ({
    // Heading is pinned at zero, so the car's axes are the world's.
    fwd: cam.camera.position.z - car.z,
    up: cam.camera.position.y - car.y,
    side: cam.camera.position.x - car.x,
  });
  // Both halves are counted in SECONDS, not frames: the whole point of one
  // of these is that two machines running at different rates see the same
  // drive, and a fixed frame count would hand them different ones.
  const settle = Math.round(NECK_SETTLE / frame);
  const frames = settle + Math.round(NECK_LOAD / frame);
  let datum = at();
  let worst = 0;
  for (let f = 0; f < frames; f++) {
    if (f === settle) datum = at();
    if (f >= settle) car.u = Math.max(0, car.u + load * frame);
    if (kick && f === settle + kick.at) cam.kick(kick.strength, kick.dir);
    car.z += car.u * frame;
    cam.update(state, frame);
    if (f >= settle) {
      const now = at();
      worst = Math.max(
        worst,
        Math.hypot(now.fwd - datum.fwd, now.up - datum.up, now.side - datum.side),
      );
    }
  }
  const end = at();
  return {
    fwd: end.fwd - datum.fwd,
    up: end.up - datum.up,
    side: end.side - datum.side,
    worst,
  };
}

describe("the head behind the wheel", () => {
  it("is thrown toward the nose by the brakes and back by the power", () => {
    // A driver's own inertia, and the only two directions a straight road
    // can push them in. The sizes are a tad each — this is a stiff neck in a
    // harness, not a bobblehead — but the SIGNS are the whole point, and a
    // model that reads its load off the mount's position instead gets them
    // from the road speed rather than from the driver and can have both
    // pointing the same way.
    const braking = neckRun("cockpit", FRAME, -20, undefined);
    const power = neckRun("cockpit", FRAME, 6, undefined);
    expect(braking.fwd).toBeGreaterThan(0.004);
    expect(power.fwd).toBeLessThan(-0.001);
  });

  it("never swings further than a neck reaches, whatever it is hit with", () => {
    // The hardest blow the game can land (`kick` saturates at 0.9) on the
    // frame after the brakes go on, so the impulse lands on a head already
    // leaning. `soften` makes the arc a bound that is approached rather than
    // a wall that is hit, so this holds for anything: there is no input that
    // buys more picture.
    for (const mode of ["cockpit", "hood", "bumper"] as const) {
      const hit = neckRun(mode, FRAME, -20, {
        at: 1,
        strength: 0.9,
        dir: { x: 1, y: 0.15, z: 1 },
      });
      expect(hit.worst, mode).toBeLessThan(0.09);
    }
  });

  it("lands in the same place on a 144 Hz machine as on a 60 Hz one", () => {
    // The engine steps at a fixed 120 Hz off an accumulator, so a display
    // rate 120 does not divide steps some frames twice and some not at all.
    // Anything the camera reads by differencing the MOUNT alternates between
    // double speed and a dead stop across those frames and hands the neck
    // metres a second of motion the car never made — which is why the load
    // is read off the car's own rates instead. Same drive, same lean.
    const sixty = neckRun("cockpit", FRAME, -20, undefined);
    const fast = neckRun("cockpit", 1 / 144, -20, undefined);
    expect(fast.fwd).toBeGreaterThan(sixty.fwd * 0.75);
    expect(fast.fwd).toBeLessThan(sixty.fwd * 1.25);
  });
});

/** WHOSE SHAKE IS IT. A hit happens to the CAR: the engine drops the body
 * onto its springs, dips the nose and rolls the shell (collision.ts), and
 * car-mesh.ts draws all of it. A camera stood five metres behind on a boom is
 * attached to none of that — so the rule camera-shake.ts writes down is that
 * an outside rig takes no part of a CONTACT, while the three taken from
 * inside the car take all of it, because in there a head that keeps going
 * when the car stops is the only thing in frame that says anything was hit.
 *
 * The car is parked on flat ground with nothing to answer, so every
 * millimetre the lens moves after it settles is the blow and nothing else. */
function blowRun(
  mode: "chase" | "cockpit",
  source: ShakeSource,
  strength: number,
): { worst: number; tail: number } {
  const state = game();
  const cam = createGameCamera(1600, 900);
  cam.setMode(mode);
  cam.skipStartShot();
  const car = state.car;
  state.terrain = { ...state.terrain, groundAt: () => car.y, waterAt: () => null };
  car.heading = 0;
  car.yawRate = 0;
  car.u = 0;
  const second = Math.round(1 / FRAME);
  for (let f = 0; f < second * 2; f++) cam.update(state, FRAME);
  const datum = cam.camera.position.clone();
  cam.kick(strength, { x: 0, y: -1, z: 0 }, source);
  let worst = 0;
  let tail = 0;
  for (let f = 0; f < second * 2; f++) {
    cam.update(state, FRAME);
    const off = cam.camera.position.distanceTo(datum);
    worst = Math.max(worst, off);
    // Past the first second the blow is meant to be over and gone.
    if (f >= second) tail = Math.max(tail, off);
  }
  return { worst, tail };
}

describe("what a blow does to the picture", () => {
  it("does not move the outside shot when the car runs into something", () => {
    // The hardest contact the game can land (`kick` saturates at 0.9) against
    // the same drive with no blow in it. Not "less" — none: the car is in
    // frame crushing and rocking, and a lens that jumps with it hides the one
    // thing worth looking at.
    const still = blowRun("chase", "contact", 0);
    const hit = blowRun("chase", "contact", 0.9);
    expect(hit.worst).toBeCloseTo(still.worst, 9);
  });

  it("...but still throws the head when the shot is taken from inside", () => {
    const calm = blowRun("cockpit", "contact", 0);
    const hit = blowRun("cockpit", "contact", 0.9);
    expect(hit.worst - calm.worst).toBeGreaterThan(0.01);
  });

  it("shudders the outside shot on a landing, by centimetres and no more", () => {
    // Every blow draws its own phase, so this is run a dozen times: the band
    // has to hold for the whole family of wobbles the model can produce, not
    // for the one that happened to come up.
    const still = blowRun("chase", "landing", 0);
    for (let n = 0; n < 12; n++) {
      const landed = blowRun("chase", "landing", 0.62);
      const moved = landed.worst - still.worst;
      // Felt: a landing that leaves the picture perfectly still reads as the
      // car having been set down by hand.
      expect(moved).toBeGreaterThan(0.005);
      // ...and not read: under a tenth of a metre at nearly six of standoff,
      // which is a shudder rather than a lost apex.
      expect(moved).toBeLessThan(0.08);
      // And it is over well inside a second — a picture still trembling on
      // the way into the next corner is the camera describing itself.
      expect(landed.tail).toBeCloseTo(still.tail, 6);
    }
  });
});

describe("the car going over", () => {
  /** How far apart two angles are, rad, wrapped — the reading every test
   * below is made of, since what the shot does with a crash is entirely a
   * question of where it is pointing. */
  function apart(a: number, b: number): number {
    return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  }

  /** Which way the boom is standing from the car, rad in the game's own
   * convention (z+ is forward, so a camera directly behind a car heading 0
   * stands at π). It is the PERSPECTIVE the player is watching from, and the
   * whole subject of this suite is when it may change. */
  function boom(cam: THREE.Vector3, car: { x: number; z: number }): number {
    return Math.atan2(cam.x - car.x, cam.z - car.z);
  }

  /** A roll, scripted: the body past its outside wheels, turning about its
   * own centre at most of a turn a second and travelling away from where it
   * was tripped. It is the state no rig can READ — the heading is spinning,
   * the travel direction has come apart from it, and the wheels are off the
   * ground — and it is written directly, because what the camera does with
   * it is the whole subject and how the car got there is not.
   *
   * `car.planted` is maintained the way the engine maintains it: false from
   * the moment the body goes over until it is back down and level, because
   * that flag is the only thing that releases the hold.
   *
   * `rolling` false runs the same tumble past a rig that is still reading
   * it, which is what the hold is measured against. */
  function tumble(
    mode: CameraMode,
    frames: number,
    rolling = true,
    each?: (state: GameState, f: number) => void,
  ) {
    const state = game();
    const car = state.car;
    car.heading = 0;
    car.u = 26;
    car.w = 12;
    const cam = createGameCamera(1600, 900);
    cam.setMode(mode);
    // Two seconds of ordinary driving first: the shot holds the framing the
    // player was actually driving in, and a rig that has never stood
    // anywhere has no framing to hold.
    for (let f = 0; f < 120; f++) {
      car.z += car.u * FRAME;
      cam.update(state, FRAME);
    }
    let over = true;
    const seats: THREE.Vector3[] = [];
    const aims: THREE.Vector3[] = [];
    const ups: THREE.Vector3[] = [];
    const cars: THREE.Vector3[] = [];
    const forward = new THREE.Vector3();
    for (let f = 0; f < frames; f++) {
      if (over) {
        // Over and over, and going somewhere while it does. The roll ends
        // where any roll ends: with the body down and out of turn.
        car.roll += 5.5 * FRAME;
        car.heading += 4.5 * FRAME;
        car.airborne = f % 20 < 8;
        car.rolling = rolling;
        car.planted = false;
        car.z += 24 * FRAME;
        car.x += 9 * FRAME;
        if (f > 90) {
          over = false;
          car.rolling = false;
          car.airborne = false;
        }
      } else car.planted = true;
      each?.(state, f);
      cam.update(state, FRAME);
      seats.push(cam.camera.position.clone());
      cam.camera.getWorldDirection(forward);
      aims.push(forward.clone());
      ups.push(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.camera.quaternion));
      cars.push(new THREE.Vector3(car.x, car.y, car.z));
    }
    return { state, cam, car, seats, aims, ups, cars };
  }

  it("stays on the boom and keeps travelling with the car", () => {
    // The lens is not taken away from the player and stood in the grass: it
    // is the camera they were driving with, still behind their car.
    const { seats, cars } = tumble("chase", 90);
    for (let f = 0; f < 90; f++) expect(seats[f].distanceTo(cars[f])).toBeLessThan(14);
    // ...and it went with the car rather than watching it leave — the car
    // covers some forty metres over the roll and the lens covers them too.
    expect(seats[89].distanceTo(seats[0])).toBeGreaterThan(30);
  });

  it("keeps the perspective it had when the car went over", () => {
    // THE RULE. Whatever the body does, the picture is taken from the same
    // side of the car it was being driven from — the boom does not walk
    // round with a spinning heading, and the aim does not swing with it.
    const { seats, aims, cars } = tumble("chase", 90);
    const opened = boom(seats[0], cars[0]);
    const along = Math.atan2(aims[0].x, aims[0].z);
    for (let f = 0; f < 90; f++) {
      expect(apart(boom(seats[f], cars[f]), opened)).toBeLessThan(0.1);
      expect(apart(Math.atan2(aims[f].x, aims[f].z), along)).toBeLessThan(0.1);
    }
  });

  it("does not whip round with a car that is spinning under it", () => {
    // The same tumble, past the hold and past a rig still reading it. A boom
    // tracking a blend of nose and travel follows the spin through most of a
    // circle.
    const held = tumble("chase", 90);
    const followed = tumble("chase", 90, false);
    const swung = (aims: THREE.Vector3[]): number => {
      let total = 0;
      for (let f = 1; f < aims.length; f++) total += aims[f].angleTo(aims[f - 1]);
      return total;
    };
    expect(swung(held.aims)).toBeLessThan(swung(followed.aims) / 5);
    // ...and the lens is not being flown round the car either: it travels
    // with the car and no further, where a rig reading the spin orbits it.
    const moved = (seats: THREE.Vector3[]): number => {
      let total = 0;
      for (let f = 1; f < seats.length; f++) total += seats[f].distanceTo(seats[f - 1]);
      return total;
    };
    expect(moved(held.seats)).toBeLessThan(moved(followed.seats));
  });

  it("keeps the horizon level while the body goes over", () => {
    // THE OTHER HALF OF THE RULE, and the two families answer it in opposite
    // directions. An outside rig banks a degree or so into a corner and a
    // slide (camera-feel.ts), and those are readings of a car being DRIVEN;
    // a car going over is giving none, so the frame comes level and stays
    // there and the world turns over inside a picture that does not. A lens
    // bolted to the body goes round WITH it, which is the whole reason to
    // drive from in there.
    //
    // Measured as the roll about the lens's own view axis — an outside rig
    // is pitched down at the car, and the angle between its up and the
    // world's is mostly that pitch.
    const worst = (mode: CameraMode): number => {
      const { aims, ups } = tumble(mode, 90);
      let most = 0;
      for (let f = 0; f < 90; f++) {
        const roll = Math.atan2(ups[f].x * aims[f].z - ups[f].z * aims[f].x, ups[f].y);
        most = Math.max(most, Math.abs(roll));
      }
      return most;
    };
    expect(worst("chase")).toBeLessThan(0.01);
    expect(worst("cockpit")).toBeGreaterThan(1);
  });

  it("never sinks into the ground it is standing on", () => {
    const { state, seats } = tumble("chase", 120);
    for (const seat of seats) {
      expect(seat.y).toBeGreaterThan(state.terrain.groundAt(seat.x, seat.z));
    }
  });

  it("follows the car's direction again once it is driving", () => {
    // ...and the hold is a hold, not a freeze: once the car is back on four
    // wheels the rig swings round behind whatever heading it came out of the
    // accident with, at its own follow rate, and the shot is the ordinary
    // one again.
    const { cam, car } = tumble("chase", 90 + 180, true, (state, f) => {
      // Straight and driving: the slide the tumble was set up with would
      // otherwise leave the drift offset holding the boom off the nose,
      // which is the framing working rather than failing.
      if (f > 91) state.car.w = 0;
    });
    expect(apart(boom(cam.camera.position, car), car.heading + Math.PI)).toBeLessThan(0.12);
  });

  /** THE SAME ACCIDENT, DRIVEN FRAME BY FRAME, so a test can decide when the
   * body is going over, when the rotation stops, and when the car is
   * properly back on four wheels — which are three different moments, and
   * the whole of what the hold is measured against. */
  function accident(mode: CameraMode) {
    const state = game();
    const car = state.car;
    car.heading = 0;
    car.u = 26;
    const cam = createGameCamera(1600, 900);
    cam.setMode(mode);
    for (let f = 0; f < 120; f++) {
      car.z += car.u * FRAME;
      cam.update(state, FRAME);
    }
    const run = (frames: number, over: boolean, planted = false): void => {
      for (let f = 0; f < frames; f++) {
        car.rolling = over;
        car.planted = planted;
        if (over) {
          car.roll += 5.5 * FRAME;
          car.heading += 4.5 * FRAME;
          car.x += 9 * FRAME;
        }
        car.z += 24 * FRAME;
        cam.update(state, FRAME);
      }
    };
    return { state, cam, car, run, from: (): number => boom(cam.camera.position, car) };
  }

  it("does not come back for a car that has stopped turning but is not planted", () => {
    // The crash hands a car back the moment its tyres are down and the
    // rotation is spent, however far over it is still leaning — and a car
    // caught at forty degrees and still sliding is not one anybody is
    // steering. Coming back for it would swing the shot onto a heading the
    // driver is about to lose again.
    const { run, from } = accident("chase");
    run(40, true);
    const held = from();
    run(90, false);
    expect(apart(from(), held)).toBeLessThan(0.1);
    // ...and `planted` is what ends it: down on all four and level, and the
    // rig comes round behind the nose again.
    run(90, false, true);
    expect(apart(from(), held)).toBeGreaterThan(0.5);
  });

  it("holds for a car that ends up lying there", () => {
    // A wreck: the rotation is spent, nobody has the car, and the crew are
    // left in it for `roll.lieFor`. Nothing about that is a car being
    // driven, so the picture stays exactly where the accident left it.
    const { state, run, from } = accident("chase");
    run(40, true);
    const held = from();
    state.overturned = { since: state.t };
    run(Math.round(TUNING.air.roll.lieFor / FRAME), false);
    expect(apart(from(), held)).toBeLessThan(0.1);
  });

  it("drops the hold when the crew are put back at the last board", () => {
    // A respawn is a jump no framing survives: there is no perspective on
    // this piece of road left to keep, and the rig is stood around the car
    // where it has been put down (`replant`).
    const { state, cam, car, run } = accident("chase");
    run(40, true);
    car.rolling = false;
    car.planted = true;
    car.heading = 0;
    car.roll = 0;
    car.z += 400;
    cam.replant();
    cam.update(state, FRAME);
    expect(apart(boom(cam.camera.position, car), car.heading + Math.PI)).toBeLessThan(0.1);
    expect(cam.camera.position.distanceTo(new THREE.Vector3(car.x, car.y, car.z))).toBeLessThan(20);
  });

  it("leaves the seats inside the car alone — they go over with it", () => {
    // A lens bolted to the car is not a shot that fails on a roll; it is
    // the roll from inside, and the whole reason to drive from in there. The
    // hold is an OUTSIDE rig's answer to a body it cannot read; a camera
    // sitting in that body has nothing to hold and everything to show.
    const { seats, cars } = tumble("cockpit", 90);
    for (let f = 0; f < 90; f++) expect(seats[f].distanceTo(cars[f])).toBeLessThan(3);
  });

  it("turns the driver's head over WITH the car, one for one", () => {
    // A head on a neck takes only a share of the body's roll through a bit
    // of play, which is right for a camber and wrong for a roll: two thirds
    // of a turn while the car takes a whole one slides the interior round the
    // lens. Measured as the angle between the camera's own UP and the car's,
    // which is zero for a head that is going over with the body whatever
    // attitude the body is at.
    const state = game();
    const car = state.car;
    car.heading = 0;
    car.u = 26;
    const cam = createGameCamera(1600, 900);
    cam.setMode("cockpit");
    for (let f = 0; f < 60; f++) {
      car.z += car.u * FRAME;
      cam.update(state, FRAME);
    }
    const up = new THREE.Vector3();
    const body = new THREE.Vector3();
    let worst = 0;
    for (let f = 0; f < 150; f++) {
      car.rolling = true;
      car.roll += 5.5 * FRAME;
      car.z += 24 * FRAME;
      cam.update(state, FRAME);
      up.set(0, 1, 0).applyQuaternion(cam.camera.quaternion);
      // Positive roll lifts the car's right side, so the body's up leans the
      // same way about its own nose axis (+z, the car heading 0).
      body.set(-Math.sin(car.roll), Math.cos(car.roll), 0);
      // The blend at the start of the roll is a fifth of a second; past that
      // the head is bolted.
      if (f > 30) worst = Math.max(worst, up.angleTo(body));
    }
    // Within the few degrees the seat's own tilt, wobble and road grain are
    // worth — they sit on top of the body's attitude and are meant to. What
    // this rules out is the SHARE: a head taking `rollFollow` of the roll is
    // most of a radian out by the time the car is upside down.
    expect(worst).toBeLessThan(0.12);
  });

  it("does not leave the horizon canted once the car is back on its wheels", () => {
    // `car.roll` accumulates and is never wrapped: a car that has been over
    // once carries a whole turn in it, and a SHARE of a whole turn is not
    // zero. Read raw, the driver spent the rest of the run looking at a
    // world tipped most of the way onto its side.
    const state = game();
    const car = state.car;
    car.heading = 0;
    car.u = 26;
    const cam = createGameCamera(1600, 900);
    cam.setMode("cockpit");
    for (let f = 0; f < 60; f++) {
      car.z += car.u * FRAME;
      cam.update(state, FRAME);
    }
    const level = new THREE.Vector3(0, 1, 0);
    const cant = (): number =>
      new THREE.Vector3(0, 1, 0).applyQuaternion(cam.camera.quaternion).angleTo(level);
    // What a seat is worth on its own: the tilt, the wobble and the road
    // grain, on a car that has never been anywhere near upside down.
    for (let f = 0; f < 120; f++) {
      car.z += car.u * FRAME;
      cam.update(state, FRAME);
    }
    const settled = cant();
    // Over once and back down, upright, exactly as the roll leaves it.
    car.roll = Math.PI * 2;
    for (let f = 0; f < 120; f++) {
      car.z += car.u * FRAME;
      cam.update(state, FRAME);
    }
    expect(cant()).toBeCloseTo(settled, 2);
  });
});

describe("the transit between two cars", () => {
  /** A stage that BENDS: two straights with a long sweeping right between
   * them. The straight line between the two ends of a transit cuts the chord
   * across that corner; the road does not, and the difference is what the
   * shot is built on. */
  const BEND: SegmentPlan[] = [
    { kind: "straight", length: 320, feature: "none" },
    { kind: "turn", length: 340, dir: 1, radius: 200, severity: "soft", feature: "none" },
    { kind: "straight", length: 320, feature: "none" },
  ];

  /** How much road the crew being cut TO is standing back up, m. */
  const GAP = 700;

  /** How long a move over `GAP` is given, s — `TIME_MIN` plus a second per
   * `TIME_SPAN` metres, restated here rather than exported because a test
   * that read the number off the module could not catch the module changing
   * it. */
  const MOVE = 0.85 + GAP / 800;

  function bent(): GameState {
    return createGame({
      seed: 4,
      carId: "compact",
      skipCountdown: true,
      track: compileTrack(4, BEND),
    });
  }

  /** Stand the car on the road at arc position `s`, progress and all. The
   * transit reads the destination off `progressS` — the car's own place on
   * the stage — so a scenario that moved the body without it would be a car
   * teleported off the road rather than one further up it. */
  function place(state: GameState, s: number): void {
    const samples = state.track.samples;
    const i = clamp(Math.round(s / state.track.step), 0, samples.length - 1);
    const sample = samples[i];
    state.car.x = sample.x;
    state.car.z = sample.z;
    state.car.y = sample.elevation;
    state.car.heading = sample.heading;
    state.progressIndex = i;
    state.progressS = sample.s;
  }

  /** How far `(x, z)` is from the nearest point of the road. */
  function offRoad(state: GameState, x: number, z: number): number {
    let best = Infinity;
    for (const sample of state.track.samples) {
      best = Math.min(best, Math.hypot(sample.x - x, sample.z - z));
    }
    return best;
  }

  /** The stage, with a camera settled behind a car near the finish — the
   * place every transit this shot exists for starts from. */
  function staged(): { state: GameState; cam: ReturnType<typeof createGameCamera> } {
    const state = bent();
    place(state, state.track.length - 30);
    const cam = createGameCamera(1600, 900);
    cam.setMode("chase");
    // Settled: the rig has read its floor and stopped easing, so what the
    // move starts from is a real shot rather than the camera's birth pose.
    for (let f = 0; f < 30; f++) cam.update(state, FRAME);
    return { state, cam };
  }

  /** Move the lens to a car `GAP` metres back up the road and report every
   * frame of it. The car is MOVED rather than a second one built: the shot
   * reads nothing off a crew but where its car is on the stage, and one game
   * with a moved car is the same two ends with none of the ceremony. */
  function transit(
    seconds: number,
    back = GAP,
  ): {
    positions: THREE.Vector3[];
    steps: number[];
    forwards: THREE.Vector3[];
    ups: THREE.Vector3[];
    strays: number[];
    overs: number[];
    landed: THREE.Vector3;
    aim: THREE.Quaternion;
    rig: THREE.Vector3;
    rigAim: THREE.Quaternion;
  } {
    const { state, cam } = staged();
    const target = state.progressS - back;
    place(state, target);
    cam.retake(state, true);
    const positions: THREE.Vector3[] = [];
    const steps: number[] = [];
    const forwards: THREE.Vector3[] = [];
    const ups: THREE.Vector3[] = [];
    const strays: number[] = [];
    const overs: number[] = [];
    let prev: THREE.Vector3 | null = null;
    for (let f = 0; f < Math.round(seconds / FRAME); f++) {
      cam.update(state, FRAME);
      const p = cam.camera.position.clone();
      positions.push(p);
      if (prev) steps.push(p.distanceTo(prev));
      prev = p;
      forwards.push(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.camera.quaternion));
      ups.push(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.camera.quaternion));
      strays.push(offRoad(state, p.x, p.z));
      overs.push(p.y - state.terrain.groundAt(p.x, p.z));
    }
    // Where the rig alone would have stood this frame, and the way it would
    // have been facing — the move's own destination, asked for by cutting to
    // the same car without one.
    const plain = staged();
    place(plain.state, plain.state.progressS - back);
    plain.cam.retake(plain.state, false);
    plain.cam.update(plain.state, FRAME);
    return {
      positions,
      steps,
      forwards,
      ups,
      strays,
      overs,
      landed: cam.camera.position.clone(),
      aim: cam.camera.quaternion.clone(),
      rig: plain.cam.camera.position.clone(),
      rigAim: plain.cam.camera.quaternion.clone(),
    };
  }

  it("follows the ROAD rather than the line between the two cars", () => {
    const { positions, strays } = transit(MOVE);
    // Never far off the centreline — a chase camera's own standoff and the
    // lift, and nothing like the chord.
    expect(Math.max(...strays)).toBeLessThan(40);
    // …and the chord is genuinely somewhere else, or the assertion above is
    // free: the straight line between the two ends leaves the road by a
    // margin no rig standoff explains.
    const { state } = staged();
    const a = positions[0];
    const b = positions[positions.length - 1];
    let worstChord = 0;
    for (let i = 0; i <= 40; i++) {
      const f = i / 40;
      worstChord = Math.max(
        worstChord,
        offRoad(state, a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f),
      );
    }
    expect(worstChord).toBeGreaterThan(90);
  });

  it("stays low, and never inside the ground", () => {
    const { positions, overs } = transit(MOVE);
    // A camera on a boom running back up the stage, not an aircraft: the
    // whole complaint about a lobbed transit is that nobody can place
    // themselves in a frame taken from forty metres up.
    expect(Math.max(...overs)).toBeLessThan(26);
    // …and it does rise: a move that never left road height would have
    // nothing for the ground to move against.
    expect(Math.max(...overs)).toBeGreaterThan(8);
    // Never inside anything, at any point. Following the road makes this
    // nearly free, which is exactly why it is worth stating.
    expect(Math.min(...overs)).toBeGreaterThan(0);
    expect(positions.length).toBeGreaterThan(50);
  });

  it("speeds up and then slows down, once", () => {
    const { steps } = transit(MOVE);
    const total = steps.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(GAP * 0.85);
    // One hump: slow, then fast, then slow. Read off the three thirds of
    // the move rather than off consecutive frames, because the road is a
    // polyline and a metre of sampling noise between two frames says
    // nothing about the gesture. This is what "a smooth motion, increasing
    // in speed then decreasing" means once it is measured rather than
    // looked at.
    const third = Math.floor(steps.length / 3);
    const mean = (from: number, to: number): number =>
      steps.slice(from, to).reduce((a, b) => a + b, 0) / Math.max(1, to - from);
    const opening = mean(0, third);
    const middle = mean(third, third * 2);
    const closing = mean(third * 2, steps.length);
    expect(middle).toBeGreaterThan(opening * 1.5);
    expect(middle).toBeGreaterThan(closing * 1.5);
    // …and it leaves and arrives at rest, rather than cutting into motion.
    const peak = Math.max(...steps);
    expect(steps[0]).toBeLessThan(peak * 0.25);
    expect(steps[steps.length - 1]).toBeLessThan(peak * 0.25);
    // No frame carries a disproportionate share of the road, which is what a
    // cut dressed as a move looks like from here.
    expect(peak).toBeLessThan(total * 0.05);
  });

  it("never tumbles, going BACK up the road to the crew behind", () => {
    // The spectator's own geometry: the lens is at the finish looking down
    // the road, and the crew it is being sent to is behind it, still coming.
    // Both ends of that move face the way the cars drive, and so does every
    // frame between them.
    //
    // Interpolating an aim POINT is what makes this incomprehensible: a line
    // from a point in front of the lens to a car behind it passes through
    // the lens, so the shot whips round to the back, tumbles at the
    // crossing, and whips forward again on the landing.
    const { forwards, ups } = transit(MOVE);
    for (const up of ups) {
      // The horizon stays a horizon: a lens asked to look at the point it is
      // standing on rolls, and a rolled frame is the one thing a viewer
      // cannot read past.
      expect(up.y).toBeGreaterThan(0.9);
    }
    // No frame turns more than a degree and a half. The stage bends between
    // the two ends, so this is not zero — but the turn is spread over the
    // whole move rather than spent at the apex, which is the difference
    // between being carried round a corner and being whipped round one.
    for (let f = 1; f < forwards.length; f++) {
      expect(forwards[f].angleTo(forwards[f - 1])).toBeLessThan(0.025);
    }
  });

  it("lands on the pose the rig would have stood in, aim and all", () => {
    // Half way through it is still out on the stage and nowhere near the
    // car...
    const half = transit(MOVE / 2);
    expect(half.landed.distanceTo(half.rig)).toBeGreaterThan(50);
    // ...and at the end it is home, on the rig's own frame — in POSITION and
    // in AIM, so the last flown frame and the first driven one are the same
    // frame. The aim half is the one that pops if it is left out: a shot
    // that points itself at the car all the way in hands over to a rig
    // pointing somewhere else entirely.
    const whole = transit(MOVE + 0.1);
    expect(whole.landed.distanceTo(whole.rig)).toBeLessThan(1);
    expect(whole.aim.angleTo(whole.rigAim)).toBeLessThan(0.02);
  });

  it("does not move at all when the lens is already there", () => {
    // Changing which VIEW a car is watched from is not a transit. Without
    // the guard the shot still lifts and settles — a hop over a car that
    // never moved.
    const { state, cam } = staged();
    const before = cam.camera.position.clone();
    for (let f = 0; f < 60; f++) {
      cam.retake(state, true);
      cam.update(state, FRAME);
      expect(Math.abs(cam.camera.position.y - before.y)).toBeLessThan(1);
    }
  });

  it("cuts when it is not asked to fly", () => {
    // Standing the feed down is a cut: the destination is the results card,
    // not a shot. One frame and the camera is simply there.
    const { state, cam } = staged();
    place(state, state.progressS - GAP);
    cam.retake(state, false);
    cam.update(state, FRAME);
    const p = cam.camera.position;
    expect(Math.hypot(p.x - state.car.x, p.z - state.car.z)).toBeLessThan(40);
  });
});

// ...and the same question one rung down: the camera key walks a ladder of
// eight, four of whose steps cross between a seat inside the car and a boom
// behind it (camera-change.ts). Every one of them is a MOVE, and the failure
// this section exists to catch is the cut it replaced — a frame that does
// not belong beside the one before it, at either end of the ladder.

/** A frame of a change, read in the CAR's frame: where the lens stands
 * relative to the car and which way it points. The heading is zero and the
 * ground is level in every drive below, so subtracting the car's position is
 * exactly the car's own frame — and it is the frame that matters, because
 * both ends of a change ride the car and a world reading would only measure
 * the road going past. */
type Frame = { at: THREE.Vector3; aim: THREE.Vector3 };

/** Two seconds in the first view before anything is asked of the camera: the
 * rig it is LEAVING has to be settled, or what gets measured is the standoff
 * still easing out rather than the change. */
const SETTLE = 120;
/** …of which the last few frames are recorded, so the series spans the press
 * itself. A cut is invisible to a series that begins after it. */
const LEAD = 10;

/** A car held at pace on dead flat ground, with the camera up and the views
 * in `walk` taken one after another every `hold` frames. */
function ladderDrive(walk: CameraMode[], hold: number): Frame[] {
  const state = game();
  const car = state.car;
  state.terrain = { ...state.terrain, groundAt: () => car.y, waterAt: () => null };
  car.heading = 0;
  car.yawRate = 0;
  car.u = 30;
  const cam = createGameCamera(1600, 900);
  // The three seats, as a real car's meshes would push them (setEyes): left
  // to the fallback they are all the SAME point, and a move between two
  // views that share a mount is a move with nowhere to go.
  cam.setEyes({
    bumper: { x: 0, y: 0.5, z: 1.95 },
    hood: { x: -0.16, y: 1.21, z: 0.66 },
    cockpit: { x: -0.36, y: 1.08, z: 0.1 },
  });
  cam.setMode(walk[0]);
  cam.skipStartShot();
  const frames: Frame[] = [];
  for (let f = 0; f < SETTLE + hold * (walk.length - 1); f++) {
    if (f >= SETTLE && (f - SETTLE) % hold === 0) {
      cam.setMode(walk[Math.floor((f - SETTLE) / hold) + 1]);
    }
    car.z += car.u * FRAME;
    cam.update(state, FRAME);
    if (f < SETTLE - LEAD) continue;
    const aim = new THREE.Vector3();
    cam.camera.getWorldDirection(aim);
    frames.push({
      at: new THREE.Vector3(
        cam.camera.position.x - car.x,
        cam.camera.position.y - car.y,
        cam.camera.position.z - car.z,
      ),
      aim,
    });
  }
  return frames;
}

/** One step of the ladder, taken and then held long enough to land. */
function walkTo(from: CameraMode, to: CameraMode, hold: number): Frame[] {
  return ladderDrive([from, to], hold);
}

/** Every step the camera key takes, in the order it takes them — including
 * the one that wraps the top of the ladder back onto the nose. */
const LADDER: [CameraMode, CameraMode][] = PLAY_MODES.map((mode, i) => [
  mode,
  PLAY_MODES[(i + 1) % PLAY_MODES.length],
]);

/** The names of the steps `bad` holds against — an empty list is the pass,
 * and a failure says which rung of the ladder broke. */
function stepsFailing(check: (frames: Frame[]) => boolean, hold: number): string[] {
  return LADDER.filter(([from, to]) => !check(walkTo(from, to, hold))).map(
    ([from, to]) => `${from}->${to}`,
  );
}

/** The whole ladder walked with the camera key from `from`, one press at a
 * time, until it comes back to where it started or has plainly not got a
 * wrap in it. `watching` is the replay's ladder (camera.ts). */
function pressAround(from: CameraMode, watching: boolean): CameraMode[] {
  const cam = createGameCamera(1600, 900);
  cam.setMode(from);
  const walked: CameraMode[] = [];
  for (let i = 0; i < PLAY_MODES.length + 1; i++) {
    cam.cycle(watching);
    const at = cam.mode();
    if (at === from) break;
    walked.push(at);
  }
  return walked;
}

describe("the camera key's ladder", () => {
  it("never reaches the TV cam in a run, from any view the run can be driven from", () => {
    // The rule the TV cam's whole placement rests on: its tripods frame the
    // corner for an audience, so the road past it is off the shot and the
    // cut lands where a driver most needs to be reading ahead
    // (camera-tv.ts). A stage is therefore never driven from it — not from
    // the first press, and not from the eighth.
    for (const from of DRIVING_MODES) {
      expect(pressAround(from, false), from as string).not.toContain("tv");
    }
  });

  it("walks every driving view and comes back round, in a run and in a replay alike", () => {
    // The wrap is what makes the key a ladder rather than a dead end, and
    // nothing on either ladder may be unreachable from anywhere else on it.
    for (const from of DRIVING_MODES) {
      expect(new Set(pressAround(from, false)), from as string).toEqual(
        new Set(DRIVING_MODES.filter((mode) => mode !== from)),
      );
      expect(new Set(pressAround(from, true)), from as string).toEqual(
        new Set(PLAY_MODES.filter((mode) => mode !== from)),
      );
    }
  });

  it("reaches the TV cam in a replay, and steps back off it onto the ladder", () => {
    // A recording is the one run nobody is steering, so the gallery is on
    // the end of its ladder — and a player who wants a different angle
    // mid-replay has to be able to leave it again.
    expect(pressAround("top", true)).toContain("tv");
    const cam = createGameCamera(1600, 900);
    cam.setMode("tv");
    cam.cycle(true);
    expect(DRIVING_MODES).toContain(cam.mode());
  });

  it("lands a scripted shot pinned on the TV cam back on the driving ladder", () => {
    // `?camera=tv` puts a shot harness on the gallery in a run that is not a
    // replay (`startCamera`). The key is not a dead end there either: it
    // steps onto the head of the ladder rather than doing nothing.
    const cam = createGameCamera(1600, 900);
    cam.setMode("tv");
    cam.cycle(false);
    expect(cam.mode()).toBe(DRIVING_MODES[0]);
  });

  it("is a no-op from the overhead views, on either ladder", () => {
    // The drone and the map are the menu's own framing; walking one onto a
    // driving camera would leave a menu page standing over a shot nobody
    // asked for.
    for (const watching of [false, true]) {
      for (const mode of ["drone", "map"] as CameraMode[]) {
        const cam = createGameCamera(1600, 900);
        cam.setMode(mode);
        cam.cycle(watching);
        expect(cam.mode(), mode as string).toBe(mode);
      }
    }
  });
});

describe("changing view", () => {
  it("is a move and never a cut, at every step of the ladder", () => {
    // A cut spends the WHOLE distance between the two poses in one frame.
    // The eased clock peaks at about a twelfth of it over the shortest beat
    // on the ladder, so a sixth is a wide bar that a cut cannot get under.
    const carried = (frames: Frame[]): boolean => {
      const span = frames[0].at.distanceTo(frames[frames.length - 1].at);
      const swing = frames[0].aim.angleTo(frames[frames.length - 1].aim);
      let move = 0;
      let turn = 0;
      for (let i = 1; i < frames.length; i++) {
        move = Math.max(move, frames[i].at.distanceTo(frames[i - 1].at));
        turn = Math.max(turn, frames[i].aim.angleTo(frames[i - 1].aim));
      }
      return move < Math.max(span, 0.3) / 6 && turn < Math.max(swing, 0.15) / 6;
    };
    expect(stepsFailing(carried, 90)).toEqual([]);
  });

  it("lands on the pose the new rig would have stood in", () => {
    // Held for five seconds, which is far longer than the longest move on
    // the ladder AND longer than the slowest rig takes to settle — the two
    // that fly (`heli`, `top`) answer the car over the best part of a
    // second, so a shorter hold measures the REFERENCE still easing out.
    // By the end the lens stands where it would have been standing had the
    // view never changed, with nothing left over to ease away after.
    const landed = LADDER.filter(([from, to]) => {
      const walked = walkTo(from, to, 300);
      const sat = walkTo(to, to, 300);
      return walked[walked.length - 1].at.distanceTo(sat[sat.length - 1].at) > 0.05;
    });
    expect(landed.map(([from, to]) => `${from}->${to}`)).toEqual([]);
  });

  it("carries the lens with the car rather than leaving it standing", () => {
    // At 30 m/s the car covers eighteen metres inside the longest move, so a
    // path drawn between two WORLD points strands the lens in a field behind
    // it. Both ends ride the car: the lens never falls further back than the
    // two rigs themselves stand.
    //
    // "Both ends ride the car" is the condition, not decoration, so the steps
    // on and off the TV cam are not held to it: one end of those is a tripod
    // planted in a field, which is exactly a lens left standing, and is the
    // whole of what that camera is (camera-tv.ts).
    const kept = (frames: Frame[]): boolean => {
      const behind = frames.map((f) => Math.hypot(f.at.x, f.at.z));
      return Math.max(...behind) <= Math.max(behind[0], behind[behind.length - 1]) + 0.5;
    };
    const rides = ([from, to]: [CameraMode, CameraMode]): boolean =>
      DRIVING_MODES.includes(from) && DRIVING_MODES.includes(to);
    const failing = LADDER.filter(rides)
      .filter(([from, to]) => !kept(walkTo(from, to, 90)))
      .map(([from, to]) => `${from}->${to}`);
    expect(failing).toEqual([]);
  });

  it("arrives, and then STAYS — the rig it lands on is already stood up", () => {
    // Walking the ladder from over the roof down into the car leaves the
    // boom's height and standoff wherever `top` left them: twenty metres
    // up. A rig that eased out of THAT when the player came back to `close`
    // would hand the move a destination still travelling, and the lens
    // would go on sinking for a second after it had supposedly landed.
    // Nothing here is turning and the pace is constant, so a settled rig on
    // this drive is a lens that does not move at all in the car's frame.
    const frames = ladderDrive(["top", "bumper", "hood", "cockpit", "close"], 90);
    const settled = frames.slice(-30);
    let after = 0;
    for (let i = 1; i < settled.length; i++) {
      after += settled[i].at.distanceTo(settled[i - 1].at);
    }
    expect(after).toBeLessThan(0.05);
  });
});

// A crash ends with the car spun round facing back up the road, and the
// reset button then puts it down at the last board a couple of hundred
// metres away, pointing down the stage again (`respawn` in step.ts). Every
// reading the shot holds — the boom's yaw, the neck's gaze, the floor, a
// verge lens planted for the accident — belongs to where the car WAS, and
// eased across that gap the camera spends the best part of a second flying
// round the car to find the stage. That second is the whole of what a
// player sees of the press, and it is not a shot: it is the game taking
// the camera away at the exact moment they asked for it back.

/** The reset button, in the three lines the camera can see, taken in `view`
 * — and the frames after it, in the car's own frame (its heading is zero and
 * the ground is level, so subtracting its position is exactly that). */
function respawnDrive(view: CameraMode, frames: number): Frame[] {
  const state = game();
  const car = state.car;
  state.terrain = { ...state.terrain, groundAt: () => car.y, waterAt: () => null };
  const cam = createGameCamera(1600, 900);
  cam.setEyes({
    bumper: { x: 0, y: 0.5, z: 1.95 },
    hood: { x: -0.16, y: 1.21, z: 0.66 },
    cockpit: { x: -0.36, y: 1.08, z: 0.1 },
  });
  cam.setMode(view);
  cam.skipStartShot();
  // Stopped facing back the way it came, and held there long enough that
  // every angle the rig carries is that heading's.
  car.heading = Math.PI;
  car.z = 300;
  car.u = 0;
  for (let f = 0; f < SETTLE; f++) cam.update(state, FRAME);
  // ...and set down at the board, pointing down the stage.
  car.z = 100;
  car.heading = 0;
  car.u = TUNING.offTrack.respawnSpeed;
  cam.replant();
  const out: Frame[] = [];
  for (let f = 0; f < frames; f++) {
    cam.update(state, FRAME);
    const aim = new THREE.Vector3();
    cam.camera.getWorldDirection(aim);
    out.push({
      at: new THREE.Vector3(
        cam.camera.position.x - car.x,
        cam.camera.position.y - car.y,
        cam.camera.position.z - car.z,
      ),
      aim,
    });
    car.z += car.u * FRAME;
  }
  return out;
}

describe("the crew put back at the last board", () => {
  it("stands the shot where the car is rather than flying round to it", () => {
    // The pose on the FIRST frame after the press is the pose it holds: a
    // rig that eased out of the old heading would still be swinging a
    // second later, and half a metre of travel in the car's own frame is
    // far less than the four the boom would cover going round.
    // Every reading here is taken in the CAR'S frame, so it is the views hung
    // off the car that are held to it: a TV tripod is planted in the world
    // and the car drives away from it, which reads as several metres of
    // travel a frame and is the camera doing its job.
    const drifting = DRIVING_MODES.filter((view) => {
      const frames = respawnDrive(view, 90);
      return frames[0].at.distanceTo(frames[frames.length - 1].at) > 0.5;
    });
    expect(drifting).toEqual([]);
  });

  it("is already looking down the stage on that first frame", () => {
    // Whichever seat it is taken from, the shot faces the way the car has
    // been pointed — down the road, +z. The overhead rig is looking mostly
    // at the roof, so what is asked of every view is the same thing at the
    // strength that view can give it: nothing may be pointing BACK.
    const wrong = PLAY_MODES.filter((view) => respawnDrive(view, 1)[0].aim.z <= 0);
    expect(wrong).toEqual([]);
  });

  it("costs the press nothing to look at — no swing, in any seat", () => {
    // The frame-to-frame movement of a stood shot is the car creeping
    // forward under it at walking pace and nothing else. A boom unwinding
    // half a turn crosses metres per frame at the start of it.
    const swinging = DRIVING_MODES.filter((view) => {
      const frames = respawnDrive(view, 90);
      let worst = 0;
      for (let i = 1; i < frames.length; i++) {
        worst = Math.max(worst, frames[i].at.distanceTo(frames[i - 1].at));
      }
      return worst > 0.05;
    });
    expect(swinging).toEqual([]);
  });
});
