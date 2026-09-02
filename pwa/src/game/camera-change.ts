// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VIEW CHANGE — the camera going from one seat to the next.
//
// The camera key walks a ladder of eight (PLAY_CAMERAS in settings.ts), and
// four of its steps cross between families — over the roof to the nose, the
// nose to the scuttle, the scuttle to the seat, and the seat back out onto
// the boom. A CUT is the one edit that tells the player nothing there. Both
// frames are of the same car a couple of metres apart, so the only thing a
// cut communicates is that the picture has been replaced, and the driver
// spends the next corner working out where they are now sitting.
//
// The other four steps walk along the boom, where the standoff and the
// height already ease between rigs and most of the hand-over was there
// already. They are flown too, because the part that does NOT ease is the
// AIM: the aim point is read straight off the rig's row, so a step along the
// boom swings the shot a couple of degrees in a single frame — small, and
// exactly the kind of small that reads as the picture flinching.
//
// So the lens GOES there, on the shortest honest path: a straight line from
// where it was standing to where the new rig has stood it, turning as it
// travels, over about a third of a second. That is what climbing in and
// stepping back out of the car looks like, and it is short enough that a
// player pressing the key mid-stage is never taken off the road for it.
//
// Three things keep it honest:
//
//   BOTH ENDS RIDE THE CAR. At 140 km/h the car covers twelve metres inside
//   this move, so a path drawn between two WORLD points is a lens left
//   standing in a field while the car drives out of the frame. The pose the
//   move starts from is held in the CAR's own axes instead — how far ahead,
//   how far to the side, how far up, and which way it was facing relative to
//   the nose — and rebuilt around the car every frame. The move is then the
//   same gesture standing still as it is flat out.
//
//   IT LANDS ON THE RIG, NOT NEAR IT. The destination is re-read every frame
//   off the pose the new rig has already written, so the last flown frame IS
//   the rig's own frame and there is nothing left to catch up. It is also
//   why the rig being landed on has to be STOOD around the car rather than
//   eased onto it (`restand` in camera.ts): a destination still travelling
//   is one this move can only chase, and the arrival would be the ease
//   rather than the flight.
//
//   IT DOES NOT GO THROUGH THE GROUND. The line between a seat and a camera
//   twenty metres over the roof clears everything; the one between a bumper
//   and a boom five metres back does not, over a brow. A floor under the
//   path answers that, faded in with the length of the move and out again
//   before it lands, so both ends stay the poses they are supposed to be.

import * as THREE from "three";
import { clamp } from "../lib/angles.ts";
import type { GameState } from "@engine";

/** How long a move takes, s: this much, plus a second for every `TIME_SPAN`
 * metres between the two poses. A step along the in-car ladder is a metre
 * and the step off the roof is twenty, and one fixed beat makes the first a
 * lurch or the second a crawl. Both bounds are short — this is a player
 * changing their mind about where to sit, not a shot. */
const TIME_MIN = 0.3;
const TIME_MAX = 0.62;
const TIME_SPAN = 34;

/** Clearance the path is never allowed under, m, over ground or water —
 * modest, because both ends of a move are already standing clear and all
 * this has to do is keep the middle out of a brow. Faded in over `RAMP` of
 * the move and out over the last of it, and scaled away entirely on a move
 * shorter than `GUARD_SPAN`: two seats a metre apart have no ground between
 * them to clear, and lifting that path is a hop. */
const GUARD = 0.4;
const GUARD_SPAN = 6;
const RAMP = 0.3;

/** The axis the car's heading turns about — a rotation of `heading` about it
 * carries local +Z onto the car's nose and local +X onto its right, which is
 * the frame the start pose is held in. */
const UP = new THREE.Vector3(0, 1, 0);

/** Smoothstep, so the move leaves and arrives at rest: the speeding up and
 * slowing down IS what makes it read as one gesture rather than a slide. */
function ease(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/** Up over `RAMP`, held, and down over the last `RAMP` — a plateau rather
 * than a lob, so the middle of the path clears the ground for as long as it
 * is over it. */
function plateau(t: number): number {
  return ease(t / RAMP) * ease((1 - t) / RAMP);
}

export type ViewChange = {
  /** Begin a move from the frame that is on screen. Call it BEFORE the new
   * rig writes anything: the pose captured here is the one the player is
   * looking at, and `fov` is the design fov it was drawn at. `car` is the
   * car THAT frame was drawn around — the pose is held relative to it, so
   * it has to be the one it was taken from and not the one a step of
   * physics later, or the move opens with the lens standing still for a
   * frame while the car drives half a metre out from under it. */
  start: (camera: THREE.PerspectiveCamera, fov: number, car: GameState["car"]) => void;
  /** Whether the move still owns the frame. */
  flying: () => boolean;
  /** How far through it, eased 0..1 — what the caller blends the per-view
   * numbers it owns across (the near plane, the hor+ ceiling). */
  at: () => number;
  /** Move this frame OVER the pose the rig has already written.
   *
   * The caller runs the destination rig FIRST, so `camera` arrives holding
   * the pose it would be standing in had there been no move; this reads that
   * as the destination and pulls the lens back toward where it came from.
   * `rigFov` is the rig's design fov and the return is this frame's. On the
   * frame the move ENDS it touches nothing and hands the rig's own pose
   * straight back, so there is no pop between the last flown frame and the
   * first driven one. */
  fly: (camera: THREE.PerspectiveCamera, state: GameState, rigFov: number, dt: number) => number;
  /** Abandon a move — a cut is wanted instead. */
  reset: () => void;
};

export function createViewChange(): ViewChange {
  /** How far through the move, 0..1. One means there is no move. */
  let at = 1;
  /** …and how long this one is given, s. */
  let span = TIME_MIN;
  /** How far the lens has to travel, m — read once, on the first frame of
   * the move, because that is when the destination first exists; the beat
   * and the ground guard are then fixed while the car drives on. */
  let travel = 0;
  /** Whether that first frame is still to come. */
  let measuring = false;
  /** Where the move starts, in the car's axes: to its right, above it, and
   * ahead of it. */
  const from = new THREE.Vector3();
  /** …and the way the lens was facing there, as a rotation off the car's own
   * heading. */
  const fromQuat = new THREE.Quaternion();
  let fromFov = 60;

  /** Scratch: the car's heading as a rotation, the start pose rebuilt in the
   * world, and the destination the rig wrote this frame. */
  const heading = new THREE.Quaternion();
  const startQuat = new THREE.Quaternion();
  const to = new THREE.Vector3();
  const toQuat = new THREE.Quaternion();

  return {
    flying: () => at < 1,
    at: () => ease(at),
    reset: () => {
      at = 1;
      measuring = false;
    },
    start: (camera, fov, car) => {
      // Straight into the car's axes, against the car the frame was drawn
      // around: from here on the start pose travels with it.
      const dx = camera.position.x - car.x;
      const dz = camera.position.z - car.z;
      const fwdX = Math.sin(car.heading);
      const fwdZ = Math.cos(car.heading);
      from.set(dx * fwdZ - dz * fwdX, camera.position.y - car.y, dx * fwdX + dz * fwdZ);
      fromQuat
        .copy(camera.quaternion)
        .premultiply(heading.setFromAxisAngle(UP, car.heading).invert());
      fromFov = fov;
      at = 0;
      measuring = true;
    },
    fly: (camera, state, rigFov, dt) => {
      const car = state.car;
      const fwdX = Math.sin(car.heading);
      const fwdZ = Math.cos(car.heading);
      if (measuring) {
        // How far there is to go, and therefore how long this move is given
        // — read here because this is the first frame the destination
        // exists.
        travel = Math.hypot(
          camera.position.x - (car.x + from.z * fwdX + from.x * fwdZ),
          camera.position.y - (car.y + from.y),
          camera.position.z - (car.z + from.z * fwdZ - from.x * fwdX),
        );
        span = clamp(TIME_MIN + travel / TIME_SPAN, TIME_MIN, TIME_MAX);
        measuring = false;
      }
      at = Math.min(1, at + dt / span);
      // Arrived: the rig's pose is already in `camera`, and the kindest thing
      // to do with it is nothing.
      if (at >= 1) return rigFov;

      // Where the move started, hung back on the car as it is NOW — both
      // ends of the path travel with it.
      const sx = car.x + from.z * fwdX + from.x * fwdZ;
      const sy = car.y + from.y;
      const sz = car.z + from.z * fwdZ - from.x * fwdX;
      to.copy(camera.position);
      toQuat.copy(camera.quaternion);

      const t = ease(at);
      const x = sx + (to.x - sx) * t;
      const y = sy + (to.y - sy) * t;
      const z = sz + (to.z - sz) * t;
      const lift = GUARD * plateau(at) * clamp(travel / GUARD_SPAN, 0, 1);
      const under = Math.max(
        state.terrain.groundAt(x, z),
        state.terrain.waterAt(x, z) ?? -Infinity,
      );
      camera.position.set(x, Math.max(y, under + lift), z);

      // One turn from the way the lens was facing to the way the rig is
      // facing, on the same eased clock as the path: the two are one gesture,
      // and a lens that arrives before its aim does is a pan on top of a
      // move.
      startQuat.copy(heading.setFromAxisAngle(UP, car.heading)).multiply(fromQuat);
      camera.quaternion.slerpQuaternions(startQuat, toQuat, t);
      return fromFov + (rigFov - fromFov) * t;
    },
  };
}
