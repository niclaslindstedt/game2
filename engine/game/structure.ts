// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE SHELL IS MADE OF — the one place a contact asks how the car is
// BUILT before deciding what the blow does to it.
//
// A car is not one material. The nose and the tail are crumple zones,
// designed to collapse at a moderate and roughly constant force over half a
// metre of stroke so that the cabin behind them does not have to. A flank is
// a door skin over door bars, with less room to fold. The roof is the CAGE:
// the stiffest thing on a rally car, welded to the sills and the pillars,
// and it folds a hand's breadth and no further. And a face that has already
// folded to its cap is no longer that face — the cage is what meets the
// ground now, whatever panel used to be there.
//
// Two things fall out of that, and both are here so that the roll and the
// contact model read one account of it:
//
//   - HOW MUCH OF AN ARRIVAL REACHES THE BODY (`foldSpeed`). A structure
//     that collapses at a fixed force passes on a fixed impulse per second of
//     folding, so the faster a corner arrives the more of that arrival goes
//     into the metal and the less into turning what is left of the car. That
//     asymptote is a property of the face, and of the mass behind it — the
//     same force changes a heavier body's speed less.
//   - HOW MUCH OF THE CLOSING SPEED COMES BACK (`restitutionAt`). A car is
//     not a rubber ball. At a walking pace the bumpers are elastic and a
//     third of the arrival comes back; at speed the arrival is spent
//     deforming the car, and almost none of it does. The coefficient falls
//     with the closing speed, which is what every barrier test measures.

import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import type { CarState } from "./state.ts";

const T = TUNING;
const S = TUNING.collision.structure;

/** WHICH FACE OF THE CAR a contact reached: a ring zone for the nose, the
 * tail, a flank or a corner, or one of the two faces the ring has no room
 * for. */
export type CrushFace = number | "belly" | "roof";

/** ...and which one the GROUND arrived at, from the attitude alone. Positive
 * roll lifts the right side, so a car tilted positive is one lying on its
 * LEFT flank (zone 6).
 *
 * The boundaries are the two the hull's own geometry sets: `rollLandLimit`
 * is as far as a car can lean and still land on its tyres, and three
 * quarters of a turn is the corner between a flank and the roof. */
const ROOF_FROM = (Math.PI * 3) / 4;

export function landingFace(tilt: number): CrushFace {
  const lean = Math.abs(tilt);
  if (lean <= T.air.rollLandLimit) return "belly";
  if (lean >= ROOF_FROM) return "roof";
  return tilt > 0 ? 6 : 2;
}

/** The car's mass against the mass every collision number is written for.
 * Above 1 is a heavy car. */
export function massRatio(spec: { mass: number }): number {
  return spec.mass / T.collision.refMass;
}

/** HOW FAR A FACE MAY FOLD, m — its stroke before the cage behind it is what
 * is taking the blow. The ring and the floorpan share the crumple zones'
 * budget; the roof IS the cage, and has a hand's breadth. */
export function crushCap(face: CrushFace): number {
  return face === "roof" ? S.roofMax : T.collision.zoneMax;
}

/** How far this face has already folded, m. */
export function folded(damage: CarState["damage"], face: CrushFace): number {
  if (face === "belly") return damage.belly;
  if (face === "roof") return damage.roof;
  return damage.zones[face];
}

/** Which structure a ring zone is: the crumple zones at either end, or a
 * flank with door bars in it. A corner is half of each, and takes the
 * stiffer answer — it is the end of a door bar meeting the end of a rail. */
function ringFold(zone: number): number {
  const F = S.fold;
  if (zone === 0 || zone === 4) return F.crumple;
  if (zone === 2 || zone === 6) return F.flank;
  return (F.crumple + F.flank) / 2;
}

/** HOW MUCH OF AN ARRIVAL THE SHELL PASSES ON to the body rather than
 * folding, m/s — the asymptote a contact's reaction saturates at, for the
 * face that arrived, on THIS car, in the state it is in.
 *
 * Three things set it, and none of them is a constant:
 *
 *   THE FACE. A crumple zone is built to fold and passes on the least; the
 *   cage passes on the most, because it hardly folds at all — a car coming
 *   down on its roof is thrown by the contact where one coming down on its
 *   nose is stopped by it.
 *
 *   THE MASS. The structure collapses at a fixed FORCE, and a fixed force
 *   changes a heavy body's speed less: the coupe is turned less by the same
 *   corner arriving than the hatch is, and folds deeper for it
 *   (`massRatio`, spent on the crush in the same breath).
 *
 *   WHAT IS LEFT TO FOLD. A face at its cap is a face the cage is holding,
 *   and the cage is what meets the ground from then on. So the asymptote
 *   climbs toward the cage's as the face folds — which is what a rollover
 *   does: the first contact is soft and the car is stopped by it, the fifth
 *   is on bare structure and the car is kicked by it. A car is distorted and
 *   destroyed by a crash, and it gets HARDER as it is destroyed. */
export function foldSpeed(spec: CarSpec, damage: CarState["damage"], face: CrushFace): number {
  const F = S.fold;
  const own = face === "roof" ? F.roof : face === "belly" ? F.belly : ringFold(face);
  const spent = Math.min(1, folded(damage, face) / crushCap(face));
  return (own + (F.cage - own) * spent) / massRatio(spec);
}

/** WHAT COMES BACK OFF A SOLID, 0..1 — the coefficient of restitution at
 * the closing speed the contact happened at.
 *
 * `base` is the coefficient a gentle contact has: the bumpers, the tyres
 * and the trunk's own bark giving and returning. Past the scuff floor the
 * arrival is spent DEFORMING the car, and deformation returns nothing, so
 * the coefficient falls away as `elasticSpeed / (elasticSpeed + over)`. That
 * is the shape every barrier test draws: a third at walking pace, a tenth at
 * 50 km/h, a twentieth at 100. A constant coefficient, however low, is a car
 * that bounces off a wall at a fixed share of whatever speed it arrived at —
 * which at 120 km/h is a car thrown back up the road at 35, and reads as a
 * rubber ball where it should read as a wreck. */
export function restitutionAt(base: number, closing: number): number {
  const over = Math.max(0, closing - T.collision.scuffSpeed);
  return (base * T.collision.elasticSpeed) / (T.collision.elasticSpeed + over);
}
