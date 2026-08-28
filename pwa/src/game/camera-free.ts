// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// God mode's flying camera: the lens comes off the car and becomes a
// six-axis rig somebody walks around the stage in first person. It is a
// DEVELOPER tool, and its whole job is to make a place on the map
// addressable — fly to the thing that looks wrong, and the debug overlay
// turns where you are standing into a line anyone else can paste back.
//
// It lives beside camera.ts rather than inside it for two reasons: nothing
// here reads GameState (a free camera has no car to follow, which is the
// point), and camera.ts is already the longest module in the app.
//
// The pose is the same convention every other camera in this game uses:
// yaw 0 looks down +z and grows toward +x, pitch is positive UP. Keep it
// that way — the repro line writes these two numbers down, and a pose that
// means something different here than in camera.ts is a teleport that lands
// somewhere else every time. Note which way that convention TURNS: growing
// the yaw swings the view to the LEFT of the screen, because the camera's
// right in this world is forward x up = (-cos yaw, 0, sin yaw). Everything
// the hands do — the mouse, the arrows, A and D — is in screen terms, so it
// crosses that sign exactly once, here in `update`.

import * as THREE from "three";

import { clamp } from "../lib/angles.ts";

/** Where the free camera is and where it points — the whole of its state,
 * because everything else about it is derived per frame. This is exactly
 * what the repro line carries, so it is also what the debug overlay
 * prints. */
export type FreeFlyPose = {
  x: number;
  y: number;
  z: number;
  /** Radians, 0 looking down +z, growing toward +x. */
  yaw: number;
  /** Radians, positive up; clamped short of straight up or down. */
  pitch: number;
};

/** What the controls are asking for this frame. The translation axes are
 * -1..1 in the camera's own frame; the look deltas are radians already
 * summed from every source that produced them (mouse, keys). */
export type FreeFlyMove = {
  forward: number;
  right: number;
  up: number;
  yawDelta: number;
  pitchDelta: number;
  /** Sprint held — FAST_SCALE on the cruise speed. */
  fast: boolean;
  /** Steps of the wheel since the last frame; each one moves the cruise
   * speed by a factor of SPEED_STEP. */
  speedSteps: number;
};

export const NEUTRAL_MOVE: FreeFlyMove = {
  forward: 0,
  right: 0,
  up: 0,
  yawDelta: 0,
  pitchDelta: 0,
  fast: false,
  speedSteps: 0,
};

/** Cruise speed the rig starts at, m/s — a brisk walk-through of a stage
 * whose corners are a hundred metres apart. Fast enough to cross a stage
 * in under a minute, slow enough to line a shot up on one tree. */
const SPEED_DEFAULT = 24;
const SPEED_MIN = 1;
/** A stage is kilometres long, so the top of the range has to be able to
 * cross one while somebody is still looking at the screen. */
const SPEED_MAX = 400;
/** Multiplier per wheel step — a little under a semitone-per-notch feel, so
 * a few flicks change the register rather than the digit. */
const SPEED_STEP = 1.15;
/** What the sprint key buys on top of the cruise speed. */
const FAST_SCALE = 4;

/** How fast the rig reaches the speed the sticks are asking for, 1/s. Not
 * instant: an unmoderated camera reads as a teleport per keypress, and a
 * screenshot taken mid-jerk is a blurred one. High enough that releasing
 * everything still stops it inside a metre at cruise. */
const ACCEL = 12;

/** Radians of look per second of held arrow key. The keyboard is the path a
 * script drives this rig down — a headless pass has no mouse — so it has to
 * be usable on its own, which means slow enough to aim with. */
export const KEY_LOOK_RATE = 1.4;
/** Radians of look per pixel of mouse travel under pointer lock. */
export const MOUSE_LOOK_RATE = 0.0022;

/** How close to straight up or down the pitch may come, radians. Exactly
 * vertical loses the yaw reference and the view rolls. */
const PITCH_LIMIT = Math.PI / 2 - 0.02;

export type FreeFlyRig = {
  /** Live pose — read by the debug overlay and the repro line. Rewritten in
   * place, so a holder keeps reading the current one. */
  pose: FreeFlyPose;
  /** Cruise speed, m/s (before the sprint multiplier). */
  speed: () => number;
  /** Put the rig somewhere exactly — the URL's `gx/gy/gz/gyaw/gpitch`. */
  place: (pose: Partial<FreeFlyPose>) => void;
  /** Take the pose off whatever camera is standing now. This is what makes
   * entering god mode a hand-over rather than a cut: the flight starts from
   * the frame the player was already looking at. */
  takeOver: (camera: THREE.PerspectiveCamera) => void;
  /** Fly for `dt` seconds and write the result onto the camera. */
  update: (camera: THREE.PerspectiveCamera, move: FreeFlyMove, dt: number) => void;
};

export function createFreeFly(): FreeFlyRig {
  const pose: FreeFlyPose = { x: 0, y: 40, z: 0, yaw: 0, pitch: -0.25 };
  let speed = SPEED_DEFAULT;
  /** World-space velocity, m/s — carried between frames so ACCEL has
   * something to ramp. */
  let vx = 0;
  let vy = 0;
  let vz = 0;

  const update = (camera: THREE.PerspectiveCamera, move: FreeFlyMove, dt: number): void => {
    if (move.speedSteps !== 0) {
      speed = clamp(speed * SPEED_STEP ** move.speedSteps, SPEED_MIN, SPEED_MAX);
    }
    // The look deltas arrive in SCREEN terms — positive is "turn right" —
    // and the pose's yaw grows the other way (see the header): forward is
    // (sin yaw, cos yaw), and rotating that toward +x swings the view to
    // the LEFT of the screen. So a right-hand turn subtracts.
    pose.yaw -= move.yawDelta;
    pose.pitch = clamp(pose.pitch + move.pitchDelta, -PITCH_LIMIT, PITCH_LIMIT);

    // Forward carries the pitch — the rig flies where it looks, which is
    // what "FPS movement" means to the hands holding it. Strafe and lift
    // stay level, so a look down does not turn A and D into a spiral.
    const cosP = Math.cos(pose.pitch);
    const fx = Math.sin(pose.yaw) * cosP;
    const fy = Math.sin(pose.pitch);
    const fz = Math.cos(pose.yaw) * cosP;
    // The camera's own right, which in a right-handed world with +y up is
    // forward x up — NOT the engine's map-space right (cos, -sin). The two
    // are mirror images, and taking the engine's one here is what made D
    // strafe left.
    const rx = -Math.cos(pose.yaw);
    const rz = Math.sin(pose.yaw);

    const rate = speed * (move.fast ? FAST_SCALE : 1);
    // Normalised so a diagonal is not faster than a straight line — the
    // classic bug that makes a free camera feel like it has two gears.
    const push = Math.hypot(move.forward, move.right, move.up);
    const norm = push > 1 ? 1 / push : 1;
    const wantX = (fx * move.forward + rx * move.right) * rate * norm;
    const wantY = (fy * move.forward + move.up) * rate * norm;
    const wantZ = (fz * move.forward + rz * move.right) * rate * norm;

    const ease = clamp(ACCEL * dt, 0, 1);
    vx += (wantX - vx) * ease;
    vy += (wantY - vy) * ease;
    vz += (wantZ - vz) * ease;
    pose.x += vx * dt;
    pose.y += vy * dt;
    pose.z += vz * dt;

    camera.position.set(pose.x, pose.y, pose.z);
    camera.lookAt(pose.x + fx, pose.y + fy, pose.z + fz);
  };

  return {
    pose,
    speed: () => speed,
    place: (next) => {
      if (Number.isFinite(next.x)) pose.x = next.x as number;
      if (Number.isFinite(next.y)) pose.y = next.y as number;
      if (Number.isFinite(next.z)) pose.z = next.z as number;
      if (Number.isFinite(next.yaw)) pose.yaw = next.yaw as number;
      if (Number.isFinite(next.pitch)) {
        pose.pitch = clamp(next.pitch as number, -PITCH_LIMIT, PITCH_LIMIT);
      }
      // A rig that has just been PUT somewhere is standing still there; the
      // velocity the last flight left behind would otherwise carry it off
      // the mark the URL named.
      vx = 0;
      vy = 0;
      vz = 0;
    },
    takeOver: (camera) => {
      const here = poseOf(camera);
      pose.x = here.x;
      pose.y = here.y;
      pose.z = here.z;
      pose.yaw = here.yaw;
      pose.pitch = clamp(here.pitch, -PITCH_LIMIT, PITCH_LIMIT);
      vx = 0;
      vy = 0;
      vz = 0;
    },
    update,
  };
}

/** Scratch for `getWorldDirection`, which needs somewhere to write. The
 * pose is read out of it before anything else can reach it, and reading a
 * pose is a once-a-frame job, not a hot loop. */
const FORWARD = new THREE.Vector3();

/** Read a camera's pose in the same convention the rig flies in. The debug
 * overlay prints this for EVERY camera, not just the free one: a screenshot
 * taken from the chase cam is worth just as much as one taken in god mode,
 * and this is what lets the repro line put a free camera exactly where that
 * chase cam was standing. */
export function poseOf(camera: THREE.PerspectiveCamera): FreeFlyPose {
  const dir = camera.getWorldDirection(FORWARD);
  return {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
    yaw: Math.atan2(dir.x, dir.z),
    pitch: Math.asin(clamp(dir.y, -1, 1)),
  };
}
