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

import { PLAY_MODES, createGameCamera, type CameraMode } from "../pwa/src/game/camera.ts";
import type { ShakeSource } from "../pwa/src/game/camera-shake.ts";

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
    // descent lift (`dropLift`) on the way down, plus the frame or two the
    // camera takes to settle onto the landed car (HEIGHT_SPRING — in the air
    // the spring is stiff enough to sit on the arc, on the ground it is a
    // mass that has to be got moving); the cliff hold contributes none of
    // it.
    expect(Math.max(...overs.slice(4))).toBeLessThan(3.0);
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

/** How long the roll shot has to give the frame back to a driver who caught
 * the car, s (`ROLL.rescue` in camera-roll.ts). Restated here rather than
 * exported, for the transit's reason: a test that read the number off the
 * module could not catch the module changing it. */
const ROLL_RESCUE = 0.3;

describe("the car going over", () => {
  /** A roll, scripted: the body past its outside wheels, turning about its
   * own centre at most of a turn a second and travelling away from where it
   * was tripped. It is the state no rig can follow — the heading is spinning,
   * the travel direction has come apart from it, and the wheels are off the
   * ground — and it is written directly, because what the camera does with it
   * is the whole subject and how the car got there is not.
   *
   * `rolling` false runs the same tumble past the driving rig instead, which
   * is what the shot is measured against. */
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
    // Two seconds of ordinary driving first: the shot plants from the view
    // the player was actually driving in, and a rig that has never stood
    // anywhere is not that view.
    for (let f = 0; f < 120; f++) {
      car.z += car.u * FRAME;
      cam.update(state, FRAME);
    }
    let over = true;
    const seats: THREE.Vector3[] = [];
    const aims: THREE.Vector3[] = [];
    const cars: THREE.Vector3[] = [];
    const lens: number[] = [];
    const forward = new THREE.Vector3();
    for (let f = 0; f < frames; f++) {
      if (over) {
        // Over and over, and going somewhere while it does. The roll ends
        // where any roll ends: with the body down and out of turn.
        car.roll += 5.5 * FRAME;
        car.heading += 4.5 * FRAME;
        car.airborne = f % 20 < 8;
        car.rolling = rolling;
        car.z += 24 * FRAME;
        car.x += 9 * FRAME;
        if (f > 90) {
          over = false;
          car.rolling = false;
          car.airborne = false;
        }
      }
      each?.(state, f);
      cam.update(state, FRAME);
      seats.push(cam.camera.position.clone());
      cam.camera.getWorldDirection(forward);
      aims.push(forward.clone());
      cars.push(new THREE.Vector3(car.x, car.y, car.z));
      lens.push(cam.camera.fov);
    }
    return { state, cam, seats, aims, cars, lens };
  }

  it("stops travelling with the car and lets it go", () => {
    const { seats, cars } = tumble("chase", 90);
    // The lens comes to rest rather than cutting to it — it is still moving
    // as the shot opens, taking its coast and its step back...
    const opening = seats[6].distanceTo(seats[0]);
    expect(opening).toBeGreaterThan(0.5);
    // ...and is standing still well before the roll is over, over three
    // times as many frames.
    const late = seats[89].distanceTo(seats[70]);
    expect(late).toBeLessThan(0.05);
    // Meanwhile the car has left: the whole point of the shot is that the
    // distance between the two grows.
    const first = seats[0].distanceTo(cars[0]);
    const last = seats[89].distanceTo(cars[89]);
    expect(last).toBeGreaterThan(first + 15);
  });

  it("keeps the car in the picture for every frame of it", () => {
    const { seats, aims, cars, lens } = tumble("chase", 90);
    for (let f = 0; f < 90; f++) {
      const to = cars[f].clone().sub(seats[f]).normalize();
      // Inside the frame, and not by a whisker: the lens is tightening
      // underneath the pan the whole time, so the test is against the fov
      // the frame is actually being drawn at, halved.
      expect(aims[f].angleTo(to)).toBeLessThan(((lens[f] / 2) * Math.PI) / 180);
    }
  });

  it("zooms, so the car is still worth looking at when it stops", () => {
    const { seats, cars, lens } = tumble("chase", 90);
    /** What share of the frame's height a two-metre car fills, %. */
    const size = (f: number): number =>
      ((2 * Math.atan(2 / seats[f].distanceTo(cars[f])) * 180) / Math.PI / lens[f]) * 100;
    // The car ends the roll more than twice as far away as it began it...
    expect(seats[89].distanceTo(cars[89])).toBeGreaterThan(seats[10].distanceTo(cars[10]) * 2);
    // ...and the lens has been pulled in to answer it, so it is never less
    // than a readable object rather than the six pixels a fixed one leaves.
    expect(lens[89]).toBeLessThan(lens[10] * 0.7);
    for (let f = 10; f < 90; f++) expect(size(f)).toBeGreaterThan(7);
  });

  it("climbs to see over a bank the car has gone behind", () => {
    // A ridge across the road just past where the car went over: from the
    // plant the accident is behind it, and a shot that stays put watches a
    // bank. Every frame's sight line is walked, and none of it may be under
    // the ground it crosses.
    const state = game();
    const car = state.car;
    const ridgeAt = car.z + 46;
    const ground = (z: number): number => (Math.abs(z - ridgeAt) < 8 ? 6 : 0);
    state.terrain = { ...state.terrain, groundAt: (_x, z) => ground(z), waterAt: () => null };
    car.y = 0;
    car.heading = 0;
    car.u = 26;
    const cam = createGameCamera(1600, 900);
    cam.setMode("chase");
    for (let f = 0; f < 60; f++) {
      car.z += car.u * FRAME;
      car.y = ground(car.z);
      cam.update(state, FRAME);
    }
    let blocked = 0;
    for (let f = 0; f < 150; f++) {
      car.rolling = true;
      car.roll += 5.5 * FRAME;
      car.heading += 4.5 * FRAME;
      car.z += 24 * FRAME;
      car.y = ground(car.z);
      cam.update(state, FRAME);
      // Only once the operator has had a moment to get up there: the climb
      // is rate-limited on purpose, and a solve that landed in one frame
      // would be a camera teleporting onto a hill.
      if (f < 110) continue;
      const lens2 = cam.camera.position;
      for (let i = 1; i < 12; i++) {
        const t = i / 12;
        const z = lens2.z + (car.z - lens2.z) * t;
        const y = lens2.y + (car.y + 0.7 - lens2.y) * t;
        if (y < state.terrain.groundAt(lens2.x + (car.x - lens2.x) * t, z)) blocked++;
      }
    }
    expect(blocked).toBe(0);
    // ...and it got there by going up and forward, not by teleporting onto
    // the hill: the ridge stands 6 m and the lens has climbed past it.
    expect(cam.camera.position.y).toBeGreaterThan(6);
  });

  it("does not whip round with a car that is spinning under it", () => {
    // The same tumble, past the shot and past the rig it replaces. A boom
    // tracking a blend of nose and travel follows the spin through most of a
    // circle; a bystander turns their head.
    const planted = tumble("chase", 90);
    const followed = tumble("chase", 90, false);
    const swung = (aims: THREE.Vector3[]): number => {
      let total = 0;
      for (let f = 1; f < aims.length; f++) total += aims[f].angleTo(aims[f - 1]);
      return total;
    };
    expect(swung(planted.aims)).toBeLessThan(swung(followed.aims) / 2);
    // ...and the lens itself is not being flown round the car either.
    const moved = (seats: THREE.Vector3[]): number => {
      let total = 0;
      for (let f = 1; f < seats.length; f++) total += seats[f].distanceTo(seats[f - 1]);
      return total;
    };
    expect(moved(planted.seats)).toBeLessThan(moved(followed.seats) / 3);
  });

  it("leaves the seats inside the car alone — they go over with it", () => {
    // A lens bolted to the body is not a shot that fails on a roll; it is
    // the roll from inside, and the whole reason to drive from in there. So
    // the plant never takes an in-car view: the eye stays in the car, which
    // means it stays with it as it goes.
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

  it("steps back off a car it was sitting right behind", () => {
    // The tightest boom on the ladder stands four metres off the bumper, and
    // four metres is bodywork filling the frame rather than an accident.
    const { seats, cars } = tumble("close", 40);
    expect(seats[0].distanceTo(cars[0])).toBeLessThan(7);
    expect(seats[39].distanceTo(cars[0])).toBeGreaterThan(seats[0].distanceTo(cars[0]));
  });

  it("never sinks into the ground it is standing on", () => {
    const { state, seats } = tumble("chase", 120);
    for (const seat of seats) {
      expect(seat.y).toBeGreaterThan(state.terrain.groundAt(seat.x, seat.z));
    }
  });

  /** The worst any frame changes the lens's TRAVEL over the frame before it,
   * m — which is what proves a blend is a flight and not a cut. A cut is one
   * enormous value here; a flight, however quick, is a small one. */
  function jerkiest(seats: THREE.Vector3[], from: number): number {
    let worst = 0;
    for (let f = from; f < seats.length; f++) {
      const jerk = seats[f]
        .clone()
        .sub(seats[f - 1])
        .sub(seats[f - 1])
        .add(seats[f - 2]);
      worst = Math.max(worst, jerk.length());
    }
    return worst;
  }

  it("hands the frame back without a cut once the car is lying there", () => {
    // A WRECK's hand-back: the long one. The car is left lying for the beat
    // the crew are taken out in, and the flight home after it is a real
    // one — the car came to rest tens of metres from where the lens stood.
    //
    // `overturned` is what makes it a wreck rather than a save, and it has
    // to be set for this to be the case it claims to be: without it the
    // engine is describing a car the driver has back, and the shot rightly
    // gives the frame up on the short clock instead.
    const frames = Math.round((TUNING.air.roll.lieFor + 1.6) / FRAME) + 90;
    const { seats, cars } = tumble("chase", frames, true, (state, f) => {
      if (f >= 90) state.overturned ??= { since: state.t };
    });
    expect(jerkiest(seats, 92)).toBeLessThan(0.1);
    // ...and it does end up back on the boom, behind the car it was watching.
    expect(seats[frames - 1].distanceTo(cars[frames - 1])).toBeLessThan(12);
  });

  it("comes home quicker for a driver who caught it, and still flies", () => {
    // A SAVE's hand-back: the short one, and the difference is meant to be
    // felt. What it may not become is a cut — the lens is a long way from
    // the car by then, and covering that in a third of a second is a whip.
    const frames = Math.round((TUNING.air.roll.lieFor + 1.6) / FRAME) + 90;
    const { seats, cars } = tumble("chase", frames);
    // Home well before a wreck's beat would even have started its blend.
    const home = Math.round((90 * FRAME + TUNING.air.roll.lieFor) / FRAME);
    expect(seats[home].distanceTo(cars[home])).toBeLessThan(12);
    // Quicker, and still continuous: every frame's travel is within a
    // handful of centimetres of the frame before it.
    expect(jerkiest(seats, 92)).toBeLessThan(0.4);
  });

  /** THE SAME ACCIDENT, DRIVEN FRAME BY FRAME, so a test can decide when the
   * car goes over, when the driver takes it back, and when it is properly
   * back on four wheels. `tumble` scripts one whole roll; this hands the
   * script over, which is what the latch has to be measured against.
   *
   * `planted` is maintained the way the engine maintains it — false from the
   * moment the body goes over until it is level on its springs again —
   * because that flag is the only thing that clears the latch. */
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
    /** How far the lens is from the car — small on the boom, large once the
     * shot has planted and the car has left it. */
    const behind = (): number =>
      cam.camera.position.distanceTo(new THREE.Vector3(car.x, car.y, car.z));
    const run = (frames: number, over: boolean, planted = false): number[] => {
      const gap: number[] = [];
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
        gap.push(behind());
      }
      return gap;
    };
    return { state, cam, car, run, behind };
  }

  it("hands the frame straight back to a driver who catches it", () => {
    // A car the driver has saved is a car being driven, and every frame of a
    // verge lens after that is a frame they are driving from somebody else's
    // camera. So the shot gives up quickly — inside the rescue blend, not the
    // long hand-over a finished accident gets.
    const { run, behind } = accident("chase");
    run(40, true);
    expect(behind()).toBeGreaterThan(10);
    // Caught: back on its wheels, nobody overturned, still moving.
    run(Math.round(ROLL_RESCUE / FRAME) + 2, false);
    expect(behind()).toBeLessThan(12);
  });

  it("does not take the frame back for a second roll it has already let go of", () => {
    // THE LATCH. A crash that has been fought back from is very often not
    // over — the body is still leaning, one more edge puts it over again —
    // and a shot that planted itself for each of those would take the camera
    // away from the player exactly as often as they were saving the car.
    const { run, behind } = accident("chase");
    run(40, true);
    expect(behind()).toBeGreaterThan(10);
    run(Math.round(ROLL_RESCUE / FRAME) + 2, false);
    const home = behind();
    expect(home).toBeLessThan(12);
    // Over again, hard, for a good deal longer than the first one — and the
    // camera stays on the boom for the whole of it.
    const gap = run(120, true);
    for (const at of gap) expect(at).toBeLessThan(home + 6);
  });

  it("takes it again once the car is properly back on four wheels", () => {
    // ...and the latch is not a one-shot: what releases it is `planted`, the
    // engine's own line for a car that has fully come back. The next
    // accident gets its shot, because by then the last one is genuinely over.
    const { run, behind } = accident("chase");
    run(40, true);
    run(Math.round(ROLL_RESCUE / FRAME) + 2, false);
    expect(behind()).toBeLessThan(12);
    // Down on all four and driving for a moment...
    run(20, false, true);
    // ...and the next one is an accident in its own right.
    const gap = run(60, true);
    expect(gap[gap.length - 1]).toBeGreaterThan(10);
  });

  it("still holds on a car that ends up lying there", () => {
    // The latch is about a car somebody is DRIVING. A crash that ends with
    // the car on its roof is the shot's whole reason for existing, and it
    // keeps the frame for the beat the crew are left in it.
    const { state, run, behind } = accident("chase");
    run(40, true);
    const away = behind();
    expect(away).toBeGreaterThan(10);
    state.overturned = { since: state.t };
    run(Math.round(TUNING.air.roll.lieFor / FRAME) - 4, false);
    // Still out there watching it, well past the rescue blend.
    expect(behind()).toBeGreaterThan(away - 4);
  });

  it("drops the plant rather than panning across a respawn", () => {
    const { state, cam, seats } = tumble("chase", 60);
    const car = state.car;
    const away = seats[59].distanceTo(new THREE.Vector3(car.x, car.y, car.z));
    expect(away).toBeGreaterThan(10);
    // The crew are put back at the last split board: a jump no pan can
    // cross, and nothing left on this piece of road to watch.
    car.rolling = false;
    car.z += 400;
    car.roll = 0;
    cam.update(state, FRAME);
    cam.update(state, FRAME);
    expect(cam.camera.position.distanceTo(new THREE.Vector3(car.x, car.y, car.z))).toBeLessThan(20);
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
    const kept = (frames: Frame[]): boolean => {
      const behind = frames.map((f) => Math.hypot(f.at.x, f.at.z));
      return Math.max(...behind) <= Math.max(behind[0], behind[behind.length - 1]) + 0.5;
    };
    expect(stepsFailing(kept, 90)).toEqual([]);
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
  cam.replant(state);
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
    const drifting = PLAY_MODES.filter((view) => {
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
    const swinging = PLAY_MODES.filter((view) => {
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
