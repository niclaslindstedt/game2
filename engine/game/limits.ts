// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A CAR CAN DO — the handling model's own limits, stated once.
//
// Every one of these was, at some point, computed in two places: the
// physics enforced it and something else guessed at it. The bot is the
// worst offender by nature — it has to plan a corner before the corner
// happens, so it needs the same numbers `car.ts` will apply when it gets
// there — and a bot planning off `gripAccel` while the tires deliver
// `gripAccel × latCeiling × grip` is not a driver misjudging a corner, it
// is two different cars. Whatever the bot may be wrong about, it must not
// be wrong about what the car it is sitting in is capable of.
//
// So this module is the single statement of the ceilings, and both sides
// read it: `car.ts` to enforce them, `sim/bot.ts` to plan around them.
// Nothing here has state and nothing here steps anything — they are
// questions about a SPEC, answerable before the car has turned a wheel.
// (`BotProfile.latFraction` and friends are then honest fractions of a real
// limit rather than of a number that only resembles one.)

import { clamp } from "../lib/math.ts";
import type { Surface } from "../mapgen/index.ts";
import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";

const T = TUNING;
const D = TUNING.drift;

/** WHAT THE GROUND AND THE RUBBER COME TO TOGETHER, as the one number every
 * ceiling below is quoted against. A road tyre holds more on tarmac and
 * skates over gravel, a loose-surface tyre is the other way round, and
 * neither is simply better — so a car's grip is a property of the PAIR and
 * never of the surface alone. The slide's ceiling, the lateral rate, how
 * much torque the driven axle can put down and every corner the bot reads
 * ahead of itself are all quoted against this, which is exactly why it is
 * stated here: two of them computing the product separately is two cars. */
export function surfaceGripFor(spec: CarSpec, surface: Surface | "nature"): number {
  const tyre = surface === "asphalt" ? spec.tyres.sealed : spec.tyres.loose;
  return T.surfaces.grip[surface] * tyre;
}

/** THE TRACTION CEILING: the most lateral acceleration this car's tires
 * will actually deliver on a surface of this grip, m/s². Not `gripAccel`,
 * which is where the slide starts easing in — this is where the tires are
 * genuinely out, and it is what decides the tightest line the car can hold
 * at a speed. */
export function latCeiling(spec: CarSpec, surfaceGrip: number): number {
  return spec.gripAccel * T.grip.latCeiling * surfaceGrip;
}

/** ...and the speed that ceiling holds a given radius at, m/s — the corner
 * speed, in other words, which is the number a driver is really reading a
 * corner for. */
export function cornerSpeed(spec: CarSpec, curvature: number, surfaceGrip: number): number {
  return Math.sqrt(latCeiling(spec, surfaceGrip) / Math.max(1e-9, curvature));
}

/** How much of a fully developed slide the WHEEL alone can develop in this
 * car, 0..1. The number that separates a rear-driver, which has all the
 * rotation it needs in the throttle, from a front-driver, which has almost
 * none and has to be asked for it. */
export function wheelSlide(spec: CarSpec): number {
  return T.drivetrain[spec.drive].depth;
}

/** ...and how much of one it can develop once a MOVE has taken the weight
 * off the rear — `provoked` being how far that move has gone, 0..1
 * (`CarState.provoked`). The lift a move is worth is the layout's own
 * shortfall, so it is worth most to the car with the least of its own. */
export function askedSlide(spec: CarSpec, provoked: number): number {
  const wheel = wheelSlide(spec);
  return wheel + (1 - wheel) * clamp(provoked, 0, 1);
}

/** THE SPEED FLOOR under all of it, m/s of ground speed: under this the car
 * does not slide at all and the wheel is the only thing steering it. A move
 * lowers it — the corners that need one are the slow ones — but never
 * removes it. */
export function slideFloor(spec: CarSpec, provoked: number): number {
  const layout = T.drivetrain[spec.drive].driftFloor;
  return D.slideFrom * layout * (1 - (1 - D.provokeFloor) * clamp(provoked, 0, 1));
}
