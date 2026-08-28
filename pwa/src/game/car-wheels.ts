// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How fast each of the four wheels turns.
//
// A wheel is turned by two things and no others: the ground running past
// underneath it, and — only where the engine reaches it — the engine, at
// whatever the revs come to through the gear it is in. Which wheels the
// engine reaches is the car's drive layout, so a front-driver's rear pair and
// a rear-driver's front pair can never do anything but report the road. Drawing them spun up is the
// oldest tell that a car is a toy: real wheels with nothing driving them
// stop turning when the car stops moving, and slow down when the car is
// dragged sideways across them.
//
// Plain arithmetic, no three.js and no DOM, so the rule above is testable.

import type { DriveLayout } from "@engine";

/** What a wheel needs to know about the car above it: how the body is moving
 * over the ground, and how hard the driven pair is spinning beyond it. */
export type WheelMotion = {
  /** Forward speed, m/s. */
  u: number;
  /** Sideways speed along the car's right axis, m/s. */
  w: number;
  /** Yaw rate, rad/s — positive turns the nose toward the car's right. */
  yawRate: number;
  /** How far the driven wheels are outrunning the road, m/s —
   * `CarState.wheelspin`. The engine sizes it against the gearing it is
   * spinning through, so there is no number to pick here: what the tyre is
   * doing over the road is what gets drawn. */
  wheelspin: number;
};

/** Where a wheel stands on the car, m: `x` is its side (+ is the car's
 * right), `z` its axle (+ is the nose). */
export type WheelAt = { x: number; z: number };

/** Which axles the engine can spin, for a given layout. */
export function drivenAxles(drive: DriveLayout): { front: boolean; rear: boolean } {
  return { front: drive !== "rwd", rear: drive !== "fwd" };
}

/** How fast the ground runs under one wheel ALONG THE WAY THAT WHEEL POINTS,
 * m/s — which is the only component of it that can turn the wheel.
 *
 * The velocity is the contact patch's own, not the car's: a yawing car drags
 * its outside wheels along faster than its inside ones and swings its axles
 * sideways through the ground on top of that. Crossed up on opposite lock a
 * front wheel is being dragged half sideways and visibly slows, which is
 * exactly what a wheel with nothing driving it does. */
export function wheelRoadSpeed(motion: WheelMotion, at: WheelAt, steer: number): number {
  const along = motion.u - motion.yawRate * at.x;
  const across = motion.w + motion.yawRate * at.z;
  return along * Math.cos(steer) + across * Math.sin(steer);
}

/** ...and how fast the tyre's surface is actually travelling, m/s: the road's
 * speed for an undriven wheel, and the road plus the slip the engine is
 * spinning into it (`CarState.wheelspin`) for a driven one — which is the
 * revs through the gear it is in, since that is the only thing a wheel with
 * a gear engaged can be doing. */
export function wheelSurfaceSpeed(
  motion: WheelMotion,
  at: WheelAt,
  steer: number,
  driven: boolean,
): number {
  const road = wheelRoadSpeed(motion, at, steer);
  return driven ? road + motion.wheelspin : road;
}
