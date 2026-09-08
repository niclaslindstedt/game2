// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT HOLDS THE CAR TOGETHER — the arms, the uprights and the engine
// mounts, and the fact that every one of them can only pull so hard on
// what hangs off it.
//
// Folding panels is only half of an arrival. Everything BOLTED to the car
// has to be brought to a stop with the car, and a bolt does that by pulling
// on the mass behind it: the load is that mass times the deceleration, and
// the deceleration is set by how far the car travelled while it stopped.
// Fold half a metre of structure under the springs and a heavy landing is a
// few dozen g; arrive at terminal speed on a face with nothing under it and
// the same arithmetic says hundreds.
//
// That is the whole difference between a wall and a cliff, and neither one
// is special-cased anywhere. A wall is a fold the structure was DESIGNED to
// make, over a stroke long enough that the mounts never notice; a mountain
// is the same fold arriving four times as fast, and the arms and the
// mounts were never rated for the answer.
//
// Nothing here decides anything. It answers two questions with arithmetic —
// how hard the arrival pulled, and what that spends of each mount's life —
// and collision.ts is the one place that writes the ledger.

import { clamp } from "../lib/math.ts";
import { TUNING } from "./defs/tuning.ts";

const M = TUNING.collision.mounts;

/** Earth's own g, m/s². A rating in g is a claim about the real world, so
 * it is read against the real number and not against `air.gravity`, which
 * is deliberately arcade-heavy so that a flight reads as a flight. */
const G = 9.81;

/** HOW HARD AN ARRIVAL PULLS on everything bolted to the car, in g.
 *
 * `slam` is the descent the ground had to take out of the car, m/s, and
 * `stroke` is how far the car travelled while that happened — the springs,
 * the sidewalls, and whatever folded, m. Constant deceleration over the
 * stroke, which is what a structure collapsing at a roughly fixed force
 * IS: v²/2s, in multiples of g.
 *
 * The stroke is the term that carries the meaning. Two cars arriving at
 * the same speed pull wildly different loads depending on what is under
 * them, and that is the honest reason a car survives a jump and does not
 * survive a cliff — not the height it fell from, which nothing here ever
 * asks about. */
export function arrestLoad(slam: number, stroke: number): number {
  return (slam * slam) / (2 * Math.max(M.minStroke, stroke) * G);
}

/** ...and WHAT IT SPENDS, as a fraction of the three ledgers a mount
 * failure writes into: each wheel's own (`CarDamage.wheels`, off the car
 * at 1), the drivetrain's (`systems.gearbox` — the half-shafts and their
 * joints are the part of it a landing loads) and the engine's
 * (`systems.engine`, dead at 1).
 *
 * How far past its rating the load pulled, times what one multiple over is
 * worth. Zero until the rating is passed: a mount inside what it is rated
 * for is a mount doing its job, and a car that lands on its wheels within
 * the arms' capacity drives away with them.
 *
 * The three ratings are ordered the way a car actually comes apart — the
 * uprights, then the shafts, then the block — so a fall that is merely bad
 * leaves a car limping on flat tyres and short a gear, and only a fall
 * with nothing under it takes all three. */
export function mountFailure(load: number): { hub: number; drive: number; engine: number } {
  return {
    hub: Math.max(0, load / M.hubG - 1) * M.hubPerOver,
    drive: Math.max(0, load / M.driveG - 1) * M.drivePerOver,
    engine: Math.max(0, load / M.engineG - 1) * M.enginePerOver,
  };
}

/** The four corners as arms off the middle of the body, m — forward, and to
 * the RIGHT, in `WHEEL_PARTS` order (FL, FR, RL, RR). The collision box is
 * the footprint every contact already reasons about the car with, so its
 * corners are the arms: nothing here needs a wheel's exact place, only
 * which end and which side of the car it is on. */
const ARMS: readonly (readonly [number, number])[] = [
  [TUNING.collision.halfLength, -TUNING.collision.halfWidth],
  [TUNING.collision.halfLength, TUNING.collision.halfWidth],
  [-TUNING.collision.halfLength, -TUNING.collision.halfWidth],
  [-TUNING.collision.halfLength, TUNING.collision.halfWidth],
];

/** WHICH CORNER TOOK THE ARRIVAL, as a multiplier on each hub's share of
 * the load — `WHEEL_PARTS` order, written into `into`.
 *
 * A car almost never lands level, and the corner that is LOWEST under the
 * attitude it arrived at reaches the ground first and is what the whole
 * mass comes down through. So a car that spears in nose-down tears its
 * front wheels off and may leave the rear pair hanging; one slammed onto
 * its left flank loses the left pair. Dealing the same load to all four is
 * what made a plunge shed its wheels in formation.
 *
 * `tilt` is the roll (positive lifts the right side) and `pitch` the nose
 * (positive lifts it), so a corner's height off the body's middle plane is
 * `fwd·sin(pitch) + right·sin(tilt)` and the deepest one is the most
 * negative. The shares are symmetric about 1 across the four corners, so
 * the ARRIVAL is only ever redistributed and never inflated — what a level
 * car takes is exactly what it always took. */
export function cornerLoads(tilt: number, pitch: number, into: number[]): void {
  const sinPitch = Math.sin(pitch);
  const sinTilt = Math.sin(tilt);
  for (let i = 0; i < ARMS.length; i++) {
    const [fwd, right] = ARMS[i];
    const lift = fwd * sinPitch + right * sinTilt;
    into[i] = 1 + M.tiltShare * clamp(-lift / M.tiltReach, -1, 1);
  }
}

/** HOW FAST A PART LEAVES THE CAR, m/s. A wheel torn off is not dropped:
 * it is trapped between the ground and its own arch as the car comes down
 * on it, and what the structure cannot hold it against squeezes it out
 * sideways — the harder the arrival, the harder it goes.
 *
 * `speed` is what the thing that took it off was travelling at (a
 * landing's slam, a contact's closing speed) and `share` is that corner's
 * own helping of it (`cornerLoads`), so the corner the car came down on
 * throws its wheel furthest. The floor is what a part has always left
 * with, so nothing that used to pop off gently now flops instead: this
 * only has something to say about arrivals violent enough to beat it. */
export function shedSpeed(speed: number, share = 1): number {
  return Math.max(M.shedFloor, M.shedPerSpeed * speed * share);
}
