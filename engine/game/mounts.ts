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
