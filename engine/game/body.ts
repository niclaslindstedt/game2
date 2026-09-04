// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BODY, between the wheels and the world.
//
// The wheels track the ground exactly; the body does not. It rides on
// springs that lag them, squats through every dip and landing and rebounds
// out of it, and that lag is the car's weight made visible — it is also what
// decides how much car is actually standing on the tyres at any instant,
// which is a grip multiplier the whole handling model reads.
//
// The wind is here for the same reason: it moves the BODY, and it moves it
// without ever spinning it.

import { clamp } from "../lib/math.ts";
import { TUNING } from "./defs/tuning.ts";
import type { CarSpec } from "./defs/cars.ts";
import type { CarState } from "./state.ts";

const T = TUNING;

/** Ease the nose toward the attitude the ground (or the flight) asks for.
 * Snapping it would strobe the body over every ripple of terrain noise; the
 * lag IS the suspension travel a landing settles through. */
export function settlePitch(car: CarState, target: number): void {
  const want = clamp(target, -T.attitude.pitchMax, T.attitude.pitchMax);
  car.pitch += (want - car.pitch) * clamp(T.attitude.settle * T.dt, 0, 1);
}

/** One step of the springs the body sits on. `jolt` is the change in the
 * WHEELS' vertical speed this step, m/s — the ground moving out from under
 * the body (or into it) is the only thing that ever excites the heave, so
 * a flight, where wheels and body fall together, is quiet. `longAccel` is
 * what the car is doing along its own axis, which is the dive and the
 * squat.
 *
 * A second-order spring, deliberately under-damped: a body that eased to
 * rest would read as a cushion, and it is the OVERSHOOT — squat, rebound,
 * settle — that reads as mass. Heavier cars ride the same springs more
 * slowly (ω ∝ √(k/m)). */
export function stepSuspension(
  spec: CarSpec,
  car: CarState,
  jolt: number,
  longAccel: number,
): void {
  const S = T.suspension;
  const dt = T.dt;
  const w = 2 * Math.PI * S.freq * Math.sqrt(T.collision.refMass / spec.mass);
  // The wheels changed their vertical speed; the body kept its own.
  car.rideRate = clamp(car.rideRate - jolt * S.absorb, -S.rateMax, S.rateMax);
  let accel = -w * w * car.ride - 2 * S.damping * w * car.rideRate;
  // The bump stops: past the travel the springs are coil-bound. They are
  // stiff AND heavily damped, so a slam is caught and absorbed rather than
  // fired straight back out as a pogo.
  const limit = car.ride < 0 ? S.travel : S.droop;
  const over = Math.abs(car.ride) - limit;
  if (over > 0) {
    const dir = Math.sign(car.ride);
    accel -= dir * over * w * w * S.stopRate;
    // The stop's damping is what it takes OUT of the slam, and a rubber
    // stop takes it out on the way IN. Coming back out it is a spring like
    // any other and it PUSHES — which is the whole rebound of a landing,
    // the body being thrown back off its own wheels. Damped equally in both
    // directions, the car squatted onto its stops and stayed there: every
    // landing in the game, from a hop off a kerb to a two-metre lip, ended
    // at the same flat 9 cm of squat and eased quietly back to rest with no
    // rebound in it at all. That is what "the suspension didn't act" is.
    const into = car.rideRate * dir > 0;
    accel -= car.rideRate * S.stopDamp * (into ? 1 : S.stopRelease);
  }
  car.rideRate = clamp(car.rideRate + accel * dt, -S.rateMax, S.rateMax);
  car.ride = clamp(car.ride + car.rideRate * dt, -S.heaveMax, S.heaveMax);

  // Dive and squat. First-order, because weight transfer settles onto the
  // stops rather than ringing the way the heave does — and because an
  // impact writes straight into this, and what should follow a nose-dip is
  // the nose coming back up, not the tail going down next.
  const want = clamp(longAccel * S.pitchPerAccel, -T.attitude.pitchMax, T.attitude.pitchMax);
  car.pitchLoad += (want - car.pitchLoad) * clamp(S.pitchRate * dt, 0, 1);
}

/** HOW HARD THE GROUND IS PULLING THE CAR DOWN OFF ITSELF, m/s² — the
 * vertical acceleration it would take to keep the wheels following the
 * ground at this pace. Positive over a brow, over a crown, and where a bank
 * the car has ridden up straightens out again; negative through a
 * compression, which presses the car on instead.
 *
 * `curve` is the ground's curvature along the DIRECTION OF TRAVEL and
 * `pace` the speed the car is covering ground at, so this is `pace²/R` — a
 * shape and a speed, which is why the same crown holds a car at a crawl and
 * throws it at rally pace. Two things read it and they are the same
 * question asked at two depths: how much weight is left on the tires, and
 * whether there is any left at all. */
export function groundPull(curve: number, pace: number): number {
  return -pace * pace * curve;
}

/** HOW MUCH CAR IS STANDING ON THE ROAD right now, as a multiplier on grip.
 * A tire is worth the weight on it and nothing else, and two things take
 * that weight away.
 *
 * A car that has just arrived is not standing on its tires yet: the wheels
 * hammer on their own rubber for the better part of a second, and a wheel
 * intermittently in the air holds intermittently. That is `car.settle`,
 * written by the landing and sized by how hard it was, and it is what turns
 * a landing into a MOMENT — a nose a few degrees off line, or a wheel with
 * any lock on it, takes the car sideways where the same input on the flat
 * would not.
 *
 * ...and a car going over a shape is not standing on its full weight: that
 * is `car.weight`, the ground's own curvature under the path spending part
 * of the car's mass on following the ground down. It is why cresting a rise
 * and running straight off the top of it is a moment too, and why riding up
 * a bank and levelling out lets a car away from the driver at a speed the
 * same lock would have held on the flat.
 *
 * Neither is read off the springs, which is the model that suggests itself
 * and does not work — see the tuning for why `car.ride` cannot tell a
 * landing from an ordinary rutted road. Both read 1 on level ground, so
 * this costs an ordinary corner nothing. */
export function tyreLoad(car: CarState): number {
  const S = T.suspension;
  // ...and a body that has lifted off its wheels is standing on less again:
  // the wheels reaching down after ground that is falling away carry only
  // what the springs' last inch of droop presses on them, which is nothing
  // much. Toward the same floor the shape's own unloading has, over the
  // reach the wheels have (`air.loft`), so the two are one continuum — the
  // car goes light, then lifts, then flies.
  const lofted = 1 - (1 - S.weightFloor) * clamp(car.loft / T.air.loft, 0, 1);
  return Math.max(S.loadFloor, (1 - S.loadSkitter * car.settle) * car.weight * lofted);
}

/** How much of the wind carries the car this step. A translation, not a
 * torque — the wind moves the car off its line without ever spinning it. */
export function windCarry(car: CarState): number {
  if (car.airborne) return T.wind.carry.airborne;
  return car.drifting ? T.wind.carry.drifting : T.wind.carry.grounded;
}
