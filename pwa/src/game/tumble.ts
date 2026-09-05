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
// body that has run out of energy goes to SLEEP: it stops being stepped and
// lies there as scenery.
//
// What attitude it keeps is the other half of that. A cone or a torn panel is
// roughly as wide as it is tall and may sleep however it landed; a SNAPPED
// TRUNK may not. A body eight metres long that settles standing up is a pole
// sticking out of the ground with no crown on it, and one that settles at
// forty degrees is a log hanging in the air — both of which read instantly as
// broken, from a long way off, for as long as the player can see the hillside
// they are on. So a long body is marked `lays`, and every step it spends in
// contact with the ground turns it toward horizontal.

import * as THREE from "three";
import { TUNING, type CarState } from "@engine";

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

/** Objects further than this from the car are not even tested for a hit,
 * m. One that is already in the air is stepped wherever it is: a piece
 * frozen mid-flight because the car drove on is the whole fault this
 * module exists to avoid. */
const NEAR = 12;

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
  /** LONG things come to rest lying down. A body marked this way is turned
   * toward horizontal — around its own long axis, keeping the bearing it
   * fell on — every step it touches the ground, and is exactly flat by the
   * time it sleeps. */
  lays: boolean;
  /** FLAT things come to rest on their face. A torn-off panel is a plate,
   * and a plate that settles standing on its edge is a door planted in the
   * gravel like a sign — so the object's own axis named here, the plate's
   * normal, is turned toward straight up (either way up) every step it
   * touches the ground, and is exactly upright by the time it sleeps. */
  flat: "x" | "y" | "z" | null;
  /** Stopped, and no longer worth stepping. */
  asleep: boolean;
};

/** Start a body tumbling from wherever its object currently stands. */
export function tumbleFrom(
  object: THREE.Object3D,
  vel: THREE.Vector3,
  spin: THREE.Vector3,
  rest: number,
  lays = false,
  flat: "x" | "y" | "z" | null = null,
): TumbleBody {
  return { object, vel, spin, rest, lays, flat, asleep: false };
}

/** How much of the way to flat a laying body turns per second of contact —
 * as a rate, so it is frame-rate independent. Fast enough that a trunk is
 * down within a bounce or two, slow enough that it reads as falling over
 * rather than snapping flat. */
const LAY_RATE = 7;
/** ...and how hard the ground kills the spin of one, per second of contact.
 * Without it a trunk that landed spinning stands itself back up between the
 * steps that are trying to lay it down. */
const LAY_SPIN_DRAG = 9;

const UP = new THREE.Vector3(0, 1, 0);
const axis = new THREE.Vector3();
const lying = new THREE.Quaternion();

/** Turn a long body toward lying flat, keeping the compass bearing its own
 * long axis is already pointing along. `t` is 0 (leave it) to 1 (flat now). */
function layDown(body: TumbleBody, t: number): void {
  const object = body.object;
  // Where the body's own length points, flattened onto the ground. Dead
  // upright has no bearing to keep, so it goes over the way it is leaning
  // and, failing that, along its own yaw.
  axis.copy(UP).applyEuler(object.rotation);
  axis.y = 0;
  if (axis.lengthSq() < 1e-4) axis.set(Math.sin(object.rotation.y), 0, Math.cos(object.rotation.y));
  lying.setFromUnitVectors(UP, axis.normalize());
  // Object3D keeps its Euler and its quaternion in step with each other, so
  // writing one is writing both — and the next step's spin picks up from
  // whatever attitude this left.
  if (t >= 1) object.quaternion.copy(lying);
  else object.quaternion.setFromEuler(object.rotation).slerp(lying, t);
}

const normal = new THREE.Vector3();
const flatten = new THREE.Quaternion();

/** Turn a plate toward lying on its face: its own `flat` axis, wherever it
 * points now, is swung to straight up by the shortest turn, which keeps
 * the bearing the plate skidded to a stop on. */
function layFlat(body: TumbleBody, t: number): void {
  const object = body.object;
  const flat = body.flat as "x" | "y" | "z";
  normal.set(flat === "x" ? 1 : 0, flat === "y" ? 1 : 0, flat === "z" ? 1 : 0);
  normal.applyQuaternion(object.quaternion);
  if (normal.y < 0) normal.negate();
  flatten.setFromUnitVectors(normal, UP).multiply(object.quaternion);
  if (t >= 1) object.quaternion.copy(flatten);
  else object.quaternion.slerp(flatten, t);
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
  if (body.lays) {
    layDown(body, 1 - Math.exp(-LAY_RATE * dt));
    body.spin.multiplyScalar(Math.exp(-LAY_SPIN_DRAG * dt));
  } else if (body.flat) {
    layFlat(body, 1 - Math.exp(-LAY_RATE * dt));
    body.spin.multiplyScalar(Math.exp(-LAY_SPIN_DRAG * dt));
  }
  // On the ground and still moving: the ground drags it down rather than
  // letting it slide forever across a hillside.
  const drag = Math.exp(-GROUND_DRAG * dt);
  body.vel.x *= drag;
  body.vel.z *= drag;

  if (body.vel.length() < SLEEP_SPEED && body.spin.length() < SLEEP_SPIN) {
    body.vel.set(0, 0, 0);
    body.spin.set(0, 0, 0);
    if (body.lays) layDown(body, 1);
    else if (body.flat) layFlat(body, 1);
    body.asleep = true;
    return false;
  }
  return true;
}

/**
 * THE CAR AS A BOX — what counts as driving through something light.
 *
 * Nothing in this module's care is collided with by the physics: a cone, a
 * marker post and a torn-off bumper all stop the car exactly as much as
 * each other, which is not at all. So the test is not a contact model, it
 * is a question about the BODY: is this point inside the same oriented box
 * the engine collides the car with, grown by the object's own `reach`,
 * because an object is a shape rather than a point and a wheel brushing one
 * is still a hit.
 *
 * Returns the point in the CAR's frame — `right` along its right axis,
 * `fwd` along its nose — or null when the car is nowhere near it. `tall` is
 * how far above or below the car's own height it can still be caught at, so
 * a flight clears what it is high enough over.
 */
export function drivingThrough(
  car: CarState,
  x: number,
  y: number,
  z: number,
  reach: number,
  tall: number,
): { right: number; fwd: number } | null {
  if (Math.abs(y - car.y) >= tall) return null;
  const dx = x - car.x;
  const dz = z - car.z;
  if (Math.abs(dx) > NEAR || Math.abs(dz) > NEAR) return null;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const fwd = dx * sinH + dz * cosH;
  const right = dx * cosH - dz * sinH;
  if (Math.abs(fwd) >= TUNING.collision.halfLength + reach) return null;
  if (Math.abs(right) >= TUNING.collision.halfWidth + reach) return null;
  return { right, fwd };
}

/** Which way a struck object should leave: out of the body along whichever
 * face is nearest — the flank for something beside the car, the nose for
 * something dead ahead — as a world direction. */
export function outOfBody(
  car: CarState,
  hit: { right: number; fwd: number },
  reach: number,
): { x: number; z: number } {
  const hl = TUNING.collision.halfLength + reach;
  const hw = TUNING.collision.halfWidth + reach;
  const right = hw - Math.abs(hit.right) < hl - Math.abs(hit.fwd) ? Math.sign(hit.right) : 0;
  const fwd = right === 0 ? Math.sign(hit.fwd) : 0;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  return { x: right * cosH + fwd * sinH, z: fwd * cosH - right * sinH };
}
