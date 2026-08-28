// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ESTABLISHING SHOT — the beat a stage opens on, before the lights.
//
// A rally broadcast never cuts to a car already on the line. It flies the
// start control: the crew ahead of you gets its countdown, leaves, and is
// followed away down the road; the camera comes round the car that is next
// out; and only then does the shot settle into the one the driver will
// actually drive from. This is that, and it is timed off `TUNING.intro` so
// the whole thing lands exactly as the lights start (engine `startsIn`).
//
// Three things make it read as a camera being FLOWN rather than a value
// being animated:
//
//   IT ARRIVES WHERE THE DRIVING CAMERA IS. The last stretch of the shot is
//   a blend from the orbit into whatever rig the player drives with — the
//   real one, solved this frame — so the hand-over has no cut and no pop in
//   it whichever camera they chose, hood included.
//
//   IT SWEEPS TOWARD THE ROAD. The orbit starts ahead of the car looking
//   back down the stage, which is where the departing crew drives THROUGH
//   frame, and finishes behind it looking up the road, which is where the
//   driving camera stands. One continuous move, no reversal.
//
//   IT AIMS OVER THE CAR, NOT AT IT. The lens is held near level and led a
//   couple of car lengths up the road, so the subject is the start CONTROL
//   with the country behind it rather than a car on a field of gravel.

import * as THREE from "three";
import { TUNING, type GameState } from "@engine";

/** Where the orbit begins and ends, radians around the car measured from
 * DIRECTLY BEHIND it — 0 is the chase camera's own side, positive swings to
 * the car's left. It opens a little past broadside on the far side, so the
 * road ahead runs left-to-right across the frame and the car in front
 * leaves along it, and closes at the driving camera's shoulder. */
const SWEEP = { from: 2.5, to: 0.35 };

/** How far out the orbit flies, m, and how high above the road it rides.
 * Both come in as the shot goes on, so the move reads as a descent onto the
 * car rather than a turntable at a fixed radius. */
const ARC = { from: { dist: 27, height: 8.5 }, to: { dist: 12, height: 4.2 } };

/** The lens, degrees: wide enough at the top of the shot for the landscape
 * to be the subject, tightening as it comes down onto the car. */
const FOV = { from: 62, to: 54 };

/** How far ahead of the car the shot aims, m, and how far above the road.
 * Two separate jobs, and they pull against each other. The HEIGHT is what
 * levels the lens: aimed at the car's own wheels the shot pitches down hard
 * and fills its bottom half with gravel, and the country the stage runs
 * through — the reason to fly a camera over a start line at all — never
 * gets into frame. The LEAD is what the shot is about, and it has to stay
 * short: the camera is off to the side, so aiming far up the road swings it
 * past the start control and walks the cars off the edge of the frame. A
 * couple of car lengths keeps them in the middle of it with the road
 * running away past them. */
const AIM = { ahead: 8, up: 2.4 };

/** The share of the shot spent handing over to the driving camera, 0..1.
 * A fifth: long enough that the two framings visibly become one, short
 * enough that the orbit is still an orbit for most of its length. */
const HAND_OVER = 0.2;

/** Where the shot is at, 0..1 across `TUNING.intro`. Past 1 the lights are
 * up and this camera is finished. */
export function introProgress(state: GameState): number {
  if (state.phase !== "intro") return 1;
  return Math.min(1, state.t / Math.max(TUNING.dt, TUNING.intro));
}

/** Smoothstep — the shot's own easing, so it leaves and arrives at rest. */
function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Fly the shot for this frame and blend it over whatever the driving
 * camera has already written into `camera`.
 *
 * The caller runs the play rig FIRST, so `camera` arrives holding the pose
 * the player would be driving with; this reads that as the destination and
 * mixes toward it. `fov` is the driving camera's design fov, and the
 * returned number is the design fov for this frame. */
export function flyStart(
  camera: THREE.PerspectiveCamera,
  state: GameState,
  drivingFov: number,
): number {
  const t = introProgress(state);
  const car = state.car;
  const swing = ease(t);
  // The blend runs on the tail of the shot alone, on its own eased ramp:
  // before it the orbit owns the frame completely.
  const hand = ease(Math.max(0, t - (1 - HAND_OVER)) / HAND_OVER);

  const angle = car.heading + Math.PI + SWEEP.from + (SWEEP.to - SWEEP.from) * swing;
  const dist = ARC.from.dist + (ARC.to.dist - ARC.from.dist) * swing;
  const lift = ARC.from.height + (ARC.to.height - ARC.from.height) * swing;
  const px = car.x + Math.sin(angle) * dist;
  const pz = car.z + Math.cos(angle) * dist;
  // Never below the ground it is flying over: a shot that clips through a
  // bank at the side of the line is worse than no shot at all.
  const floor = state.terrain.groundAt(px, pz) + 1.2;
  const orbit = new THREE.Vector3(px, Math.max(car.y + lift, floor), pz);

  const target = camera.position.clone();
  const driving = camera.quaternion.clone();
  camera.position.copy(orbit).lerp(target, hand);
  camera.lookAt(
    car.x + Math.sin(car.heading) * AIM.ahead,
    car.y + AIM.up,
    car.z + Math.cos(car.heading) * AIM.ahead,
  );
  camera.quaternion.slerp(driving, hand);
  return (FOV.from + (FOV.to - FOV.from) * swing) * (1 - hand) + drivingFov * hand;
}
