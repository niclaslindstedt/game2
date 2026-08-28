// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LOOSE THINGS, FALLING — the one tumbler every object the car knocks free
// is stepped by: a bumper torn off against a trunk, a marshal's cone sent
// down the verge.
//
// It is deliberately not a rigid-body engine. None of these objects supports
// anything, nothing else stands on them and nobody looks at one for more than
// a second, so what has to be right is only what the eye checks: it goes the
// way it was hit, it arcs, it MEETS THE GROUND IT WAS DRAWN OVER, it loses
// energy each time it does, and it stops. A piece that hangs in the air is
// the one failure that reads instantly — which is what a fixed floor height
// (the ground under the car at the moment of the break) gives you the moment
// the car is on a hillside.
//
// So the floor is sampled from the terrain under the object every step, and a
// body that has run out of energy goes to SLEEP: it keeps whatever attitude it
// landed in, stops being stepped, and lies there as scenery.

import * as THREE from "three";

/** Gravity, m/s². A hair over the real thing — the arcs are metres long and
 * a light one reads as slow motion at this scale. */
const GRAVITY = 15.7;
/** Fraction of the closing speed a bounce gives back. Low: a plastic cone
 * and a torn panel both land dead rather than trampolining. */
const RESTITUTION = 0.28;
/** Fraction of the speed ALONG the ground kept through a bounce. */
const SKID = 0.6;
/** Spin kept through a bounce. */
const SPIN_KEEP = 0.55;
/** How fast the ground drags a sliding body to a halt, 1/s. */
const GROUND_DRAG = 2.6;
/** Below this speed, and lying on the ground, a body settles for good (m/s).
 * Its spin has to be spent too, or a cone stops moving while still rolling. */
const SLEEP_SPEED = 0.6;
const SLEEP_SPIN = 1.2;

export type TumbleBody = {
  object: THREE.Object3D;
  vel: THREE.Vector3;
  /** Angular velocity about the world axes, rad/s. Applied to the object's
   * own Euler angles — good enough for something that is tumbling. */
  spin: THREE.Vector3;
  /** How far this object's own origin sits above the ground once it has come
   * to rest, m. A cone's origin is its middle, a torn panel's is wherever the
   * body had it — neither is the contact point. */
  rest: number;
  /** Stopped, and no longer worth stepping. */
  asleep: boolean;
};

/** Start a body tumbling from wherever its object currently stands. */
export function tumbleFrom(
  object: THREE.Object3D,
  vel: THREE.Vector3,
  spin: THREE.Vector3,
  rest: number,
): TumbleBody {
  return { object, vel, spin, rest, asleep: false };
}

/**
 * One step of one loose body. `groundAt` is the drawn ground under a world
 * point — the same surface the car rides, so a piece lands exactly where the
 * player would expect it to.
 *
 * Returns false once the body has settled, so the caller can stop paying for
 * it without having to know the rule.
 */
export function stepTumble(
  body: TumbleBody,
  dt: number,
  groundAt: (x: number, z: number) => number,
): boolean {
  if (body.asleep) return false;
  const p = body.object.position;

  body.vel.y -= GRAVITY * dt;
  p.addScaledVector(body.vel, dt);
  body.object.rotation.x += body.spin.x * dt;
  body.object.rotation.y += body.spin.y * dt;
  body.object.rotation.z += body.spin.z * dt;

  const floor = groundAt(p.x, p.z) + body.rest;
  if (p.y > floor) return true;

  p.y = floor;
  if (body.vel.y < 0) body.vel.y *= -RESTITUTION;
  body.vel.x *= SKID;
  body.vel.z *= SKID;
  body.spin.multiplyScalar(SPIN_KEEP);
  // On the ground and still moving: the ground drags it down rather than
  // letting it slide forever across a hillside.
  const drag = Math.exp(-GROUND_DRAG * dt);
  body.vel.x *= drag;
  body.vel.z *= drag;

  if (body.vel.length() < SLEEP_SPEED && body.spin.length() < SLEEP_SPIN) {
    body.vel.set(0, 0, 0);
    body.spin.set(0, 0, 0);
    body.asleep = true;
    return false;
  }
  return true;
}
