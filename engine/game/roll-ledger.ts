// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CRASH'S LEDGER — what a body going over has, in one number.
//
// Nothing in the crash reads this and nothing branches on it. It exists so
// that the labs and the tests can hold the model to the one rule the rest of
// it is built on: a rollover is a budget being RUN DOWN. Gravity hands the
// car energy as the weight falls and everything else may only ever take, so
// a step that raises the ledger by more than the flight's own turbulence
// could is a term making motion out of nothing — which is what every
// rotational fault this module has ever had turned out to be.

import { TUNING } from "./defs/tuning.ts";
import { type MassSpread, type Weight, REFERENCE, clearOn, seatOn } from "./roll-hull.ts";
import { rollTilt, type CarState } from "./state.ts";

const T = TUNING;

/** How high the weight rides above the ORIGIN at an attitude — the piece
 * that turns the surface's height into `car.y` and back. */
export function weightOverOrigin(tilt: number, pitch: number, weight: Weight = REFERENCE): number {
  return seatOn(tilt, pitch, undefined, weight) - clearOn(tilt, pitch);
}

/** THE CRASH'S WHOLE LEDGER, J per kg of car — what it is travelling with,
 * what it is turning with, and how high its weight still is.
 *
 * A rollover is one budget being run down. The car arrives with the energy it
 * was carrying, gravity hands it more as the weight falls (which is why a car
 * going over down a hillside keeps going and one on the flat does not), and
 * everything else in this module may only ever TAKE: the ground's one Coulomb
 * budget, the damps, the pivot exchange. The one thing that adds is the
 * flight's turbulence, and it is bounded and averages to nothing.
 *
 * So this is not a number the model reads — nothing branches on it, and it is
 * never clamped, because a cap on a budget hides the bookkeeping error that
 * made it wrong instead of showing it. It is the INVARIANT, for the labs and
 * the tests to hold the model to: a step that raises it by more than the
 * turbulence could is a term making energy out of nothing, which is what
 * every rotational fault this module has had turned out to be.
 *
 * Mass-normalised throughout, like `INERTIA` — the car's mass divides out of
 * every term and never appears. */
export function crashEnergy(car: CarState, mass: MassSpread): number {
  const tilt = rollTilt(car.roll);
  const pitch = rollTilt(car.pitch);
  const move = car.u * car.u + car.w * car.w + car.vy * car.vy;
  // The CENTRAL radii, never the ones about the corner: a rotation's energy
  // is `1/2 I_cm w^2` about the body's own axes, and the corner version
  // already carries the weight's motion AROUND that corner — which is the
  // travel, counted just above. Using it here books that motion twice, and
  // the ledger then reads a body letting go of a corner as losing energy.
  const spin =
    mass.spin.roll * car.rollRate * car.rollRate +
    mass.spin.pitch * car.pitchRate * car.pitchRate +
    mass.yaw * car.yawRate * car.yawRate;
  // The WEIGHT's world height: `car.y` is the origin, and the weight rides
  // `seatOn - clearOn` above it. Read against level for the same reason
  // `rollStand` is — this is a world height, not an attitude on a plane.
  const height = car.y + weightOverOrigin(tilt, pitch, mass.weight);
  return 0.5 * (move + spin) + T.air.gravity * height;
}

/** ...AND THE MOST ONE STEP'S TURBULENCE COULD ADD to it, J per kg. The only
 * term in the module that puts energy IN, so it is the whole tolerance any
 * check of the invariant above is allowed. Each axis is kicked by at most
 * `rate x dt`, and what that is worth on top of the rotation already there is
 * `I x (|w| x d + d^2/2)`. */
export function crashTurbulence(car: CarState, mass: MassSpread): number {
  const dr = T.air.rollTurbulence * T.dt;
  const dp = T.air.pitchTurbulence * T.dt;
  const dy = T.air.turbulence * T.dt;
  return (
    mass.spin.roll * (Math.abs(car.rollRate) * dr + 0.5 * dr * dr) +
    mass.spin.pitch * (Math.abs(car.pitchRate) * dp + 0.5 * dp * dp) +
    mass.yaw * (Math.abs(car.yawRate) * dy + 0.5 * dy * dy)
  );
}
