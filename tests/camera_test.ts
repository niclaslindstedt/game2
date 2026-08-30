// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The chase camera at a cliff. Two rules meet there and both used to fail:
// the ground the camera stands on may fall away in ONE STEP (a terrain
// lattice kinks, a shoreline swaps ground for water, two fields meet at a
// seam), and the camera must fly down that rather than cut to it; and while
// the car is falling the camera must NOT ride it down, because two metres
// over the roof is what a twenty-five metre drop looks like when nothing at
// all is happening. Driven directly — the camera only ever reads state, so a
// scripted fall is the whole scenario and needs no physics.
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

/** ...and the same road rolled into 6 m hills on a 200 m wavelength: the
 * terrain the camera still has to fly. */
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
        elevation: 6 * Math.sin((s.s * Math.PI * 2) / 200),
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

describe("the transit between two cars", () => {
  /** How far down the road the crew being cut TO is standing, m. */
  const GAP = 700;
  /** …and a ridge across the middle of it, high enough that no straight line
   * between the two cars can be over it. */
  const RIDGE = { at: GAP / 2, span: 80, height: 90 };

  /** A stage with that ridge across the middle and flat ground either side,
   * and a camera settled behind a car at the near end of it. */
  function staged(): { state: GameState; cam: ReturnType<typeof createGameCamera> } {
    const state = game();
    const car = state.car;
    const near = car.z;
    state.terrain = {
      ...state.terrain,
      groundAt: (_x, z) => (Math.abs(z - (near + RIDGE.at)) < RIDGE.span ? RIDGE.height : car.y),
      waterAt: () => null,
    };
    const cam = createGameCamera(1600, 900);
    cam.setMode("chase");
    car.heading = 0;
    // Settled: the rig has read its floor and stopped easing, so what the
    // flight starts from is a real shot rather than the camera's birth pose.
    for (let f = 0; f < 30; f++) cam.update(state, FRAME);
    return { state, cam };
  }

  /** How long a flight over `GAP` is given, s — `TIME_MIN` plus a second per
   * `TIME_SPAN` metres, restated here rather than exported because a test
   * that read the number off the module could not catch the module changing
   * it. */
  const FLIGHT = 0.9 + GAP / 900;

  /** Fly to a car `GAP` metres away and report every frame of it. `dz` is
   * which way that is: `+GAP` is down the road AHEAD of the lens, `-GAP` is
   * back up it BEHIND — the direction a spectator's next crew is actually
   * in, and the one an aim walked as a POINT tumbles over. The car is MOVED rather
   * than a second one built: the flight reads nothing off a crew but where
   * its car is, and one game with a moved car is the same two endpoints with
   * none of the ceremony. */
  function transit(
    seconds: number,
    dz = GAP,
  ): {
    heights: number[];
    clearances: number[];
    steps: number[];
    forwards: THREE.Vector3[];
    ups: THREE.Vector3[];
    landed: THREE.Vector3;
    aim: THREE.Quaternion;
    rig: THREE.Vector3;
    rigAim: THREE.Quaternion;
  } {
    const { state, cam } = staged();
    state.car.z += dz;
    cam.retake(state, true);
    const heights: number[] = [];
    const clearances: number[] = [];
    const steps: number[] = [];
    const forwards: THREE.Vector3[] = [];
    const ups: THREE.Vector3[] = [];
    let prev: THREE.Vector3 | null = null;
    for (let f = 0; f < Math.round(seconds / FRAME); f++) {
      cam.update(state, FRAME);
      const p = cam.camera.position;
      heights.push(p.y);
      clearances.push(p.y - state.terrain.groundAt(p.x, p.z));
      if (prev) steps.push(p.distanceTo(prev));
      prev = p.clone();
      forwards.push(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.camera.quaternion));
      ups.push(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.camera.quaternion));
    }
    // Where the rig alone would have stood this frame, and the way it would
    // have been facing — the flight's own destination, asked for by cutting
    // to the same car without one.
    const plain = staged();
    plain.state.car.z += dz;
    plain.cam.retake(plain.state, false);
    plain.cam.update(plain.state, FRAME);
    return {
      heights,
      clearances,
      steps,
      forwards,
      ups,
      landed: cam.camera.position.clone(),
      aim: cam.camera.quaternion.clone(),
      rig: plain.cam.camera.position.clone(),
      rigAim: plain.cam.camera.quaternion.clone(),
    };
  }

  it("clears the tallest ground between the two cars", () => {
    const { heights, clearances } = transit(FLIGHT);
    // The apex is over the ridge, and by a margin — a lens level with a
    // hilltop is a frame full of hilltop.
    expect(Math.max(...heights)).toBeGreaterThan(RIDGE.height + 15);
    // …and it is never inside anything, at any point of the flight. This is
    // the assertion the whole shot exists to keep: the crest is sampled off
    // a line, and a line can step past a spur.
    expect(Math.min(...clearances)).toBeGreaterThan(0);
  });

  it("lands on the pose the rig would have stood in, aim and all", () => {
    // Half way through it is still out over the country and nowhere near
    // the car...
    const half = transit(FLIGHT / 2);
    expect(half.landed.distanceTo(half.rig)).toBeGreaterThan(50);
    // ...and at the end it is home, on the rig's own frame — in POSITION and
    // in AIM, so the last flown frame and the first driven one are the same
    // frame. The aim half is the one that pops if it is left out: a shot
    // that points itself at the car all the way in hands over to a rig
    // pointing somewhere else entirely.
    const whole = transit(FLIGHT + 0.1);
    expect(whole.landed.distanceTo(whole.rig)).toBeLessThan(1);
    expect(whole.aim.angleTo(whole.rigAim)).toBeLessThan(0.02);
  });

  it("flies it, rather than cutting", () => {
    const { steps } = transit(FLIGHT);
    // No frame carries a disproportionate share of the distance: a cut
    // dressed as a flight shows up as one enormous step among a hundred
    // small ones. The eased middle is the fastest part and still nowhere
    // near a jump.
    const total = steps.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(GAP * 0.9);
    expect(Math.max(...steps)).toBeLessThan(total * 0.1);
  });

  it("never tumbles, flying BACK up the road to the crew behind", () => {
    // The spectator's own geometry: the lens is at the finish looking down
    // the road, and the crew it is being sent to is behind it, still coming.
    // Both ends of that flight face the SAME way, so the shot is a reverse
    // tracking move and the aim barely turns at all.
    //
    // Interpolating an aim POINT is what makes this incomprehensible: a line
    // from a point in front of the lens to a car behind it passes through
    // the lens, so the shot whips round to the back, tumbles at the
    // crossing, and whips forward again on the landing.
    const { forwards, ups } = transit(FLIGHT, -GAP);
    for (const fwd of forwards) {
      // Still looking down the road, every frame of the way — never round
      // at the target, and never through the reversal that gets it there.
      expect(fwd.z).toBeGreaterThan(0.3);
    }
    for (const up of ups) {
      // …and the horizon stays a horizon: a lens asked to look at the point
      // it is standing on rolls, and a rolled frame is the one thing a
      // viewer cannot read past.
      expect(up.y).toBeGreaterThan(0.9);
    }
    // No frame turns more than a few degrees, which is what "smoothly" means
    // when it is measured rather than looked at.
    for (let f = 1; f < forwards.length; f++) {
      expect(forwards[f].angleTo(forwards[f - 1])).toBeLessThan(0.05);
    }
  });

  it("tilts down over the arc, and comes back to the rig's own pitch", () => {
    const { forwards, rigAim } = transit(FLIGHT, -GAP);
    const pitch = forwards.map((f) => Math.asin(-f.y));
    // What "level" means here is the rig's own aim: a chase camera already
    // looks a few degrees down at the car it is behind, and the tilt is
    // measured against that rather than against the horizon.
    const settled = Math.asin(-new THREE.Vector3(0, 0, -1).applyQuaternion(rigAim).y);
    // Up over the country the lens is looking DOWN at the ground it is
    // flying over rather than out at the horizon...
    expect(Math.max(...pitch)).toBeGreaterThan(settled + 0.12);
    // ...and it arrives back on the rig's pitch, because the tilt is worth
    // exactly what the lift is worth and the lift is gone by the landing.
    expect(Math.abs(pitch[pitch.length - 1] - settled)).toBeLessThan(0.02);
  });

  it("does not fly at all when the lens is already there", () => {
    // Changing which VIEW a car is watched from is not a transit. Without
    // the guard the flight still climbs its clearance and comes back down —
    // a lob over a car that never moved.
    const { state, cam } = staged();
    const before = cam.camera.position.clone();
    cam.retake(state, true);
    const heights: number[] = [];
    for (let f = 0; f < 60; f++) {
      cam.update(state, FRAME);
      heights.push(cam.camera.position.y);
    }
    expect(Math.max(...heights)).toBeLessThan(before.y + 2);
  });

  it("cuts when it is not asked to fly", () => {
    // Standing the feed down is a cut: the destination is the results card,
    // not a shot. One frame and the camera is simply there.
    const { state, cam } = staged();
    state.car.z += GAP;
    cam.retake(state, false);
    cam.update(state, FRAME);
    const p = cam.camera.position;
    expect(Math.abs(p.z - state.car.z)).toBeLessThan(40);
    expect(p.y).toBeLessThan(RIDGE.height);
  });
});
