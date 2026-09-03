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

/** THE SLIP A HELD SLIDE PARKS AT, rad — full lock, at pace, on a surface
 * of this `breakaway`. The wheel's own ask (`angleSpan` × the layout's
 * `depth`) plus the room past it where the deepening forces balance the
 * redirect, which is the same place `drift.overFrom` names as the top of
 * what the wheel has to say. `slide` is how far the slide has actually come
 * in (`wheelSlide` with a speed), not the layout's own ceiling: a car on
 * the way into a fast corner is only part of the way up its own ramp.
 *
 * It predicts a held full-lock slide to within a degree on all three
 * layouts, and it is the number the two functions below are really about:
 * how far sideways this car goes is what decides how hard it can corner. */
export function heldSlip(spec: CarSpec, slide: number, breakaway: number): number {
  return (D.angleSpan * slide + D.overFrom * D.angleBand) * breakaway;
}

/** WHAT THE CAR ACTUALLY HOLDS at a speed, m/s² — the traction ceiling read
 * at the slip angle the car is really carrying, rather than the ceiling
 * itself.
 *
 * They are not the same number and never were. `latCeiling` is the SCALE of
 * the tyre's saturation curve; what the car gets out of it is
 * `latGive × over + (1 - latGive) × tanh(over)` of that (`car.ts`), and
 * `over` is the demand the SLIP is making. A car hung a long way out asks
 * for far more than the ceiling and the residual slope hands some of it
 * over; a car barely sideways cannot even reach the ceiling, because
 * `tanh(1)` is 0.76.
 *
 * That is why the drift model reaches into the bot at all. When a full-lock
 * slide was 35° the car pulled half again its stated ceiling and the plan,
 * quoted straight off `latCeiling`, was conservative by accident. Halve the
 * angles and the same plan is optimistic instead — and an optimistic plan
 * is a crew arriving at a corner it cannot hold, running wide into the
 * trees and rolling. It cost the rival field ten DNFs in seventy-two stages
 * before this existed, none of which was the bot doing anything different:
 * it was the bot being wrong about the car it was sitting in, which is the
 * one thing this module is here to stop.
 *
 * It RISES with speed, which is worth reading twice: a corner taken faster
 * is a corner taken at a bigger `over`, so the tyres give more of their
 * ceiling up the faster the car is going. What still makes speed cost
 * radius is that the demand grows as u² and this grows a great deal more
 * slowly. */
export function latHold(
  spec: CarSpec,
  speed: number,
  surfaceGrip: number,
  breakaway: number,
): number {
  const ceiling = latCeiling(spec, surfaceGrip);
  const slide = wheelSlide(spec, speed, surfaceGrip);
  const latRate = (spec.gripLat + (spec.driftLat - spec.gripLat) * slide) * surfaceGrip;
  const over = (speed * latRate * heldSlip(spec, slide, breakaway)) / ceiling;
  return ceiling * (T.grip.latGive * over + (1 - T.grip.latGive) * Math.tanh(over));
}

/** ...and the speed the car holds a given radius at, m/s — the corner
 * speed, in other words, which is the number a driver is really reading a
 * corner for. `share` is how much of the hold the driver is asking for
 * (`BotProfile.latFraction`), so an ace reads this straight and a novice
 * reads a fraction of it.
 *
 * Solved rather than evaluated: the speed sets the lateral acceleration and
 * the lateral acceleration sets the speed. `v² × curvature = share ×
 * latHold(v)` has one crossing — the demand grows as v² and the hold a good
 * deal more slowly — and iterating from the tyre-limited speed walks onto
 * it in two or three passes. Three, because the third is worth about a
 * tenth of a km/h and costs nothing next to the terrain query beside it. */
export function cornerSpeed(
  spec: CarSpec,
  curvature: number,
  surfaceGrip: number,
  breakaway = 1,
  share = 1,
): number {
  const k = Math.max(1e-9, curvature);
  let speed = Math.sqrt((share * latCeiling(spec, surfaceGrip)) / k);
  for (let i = 0; i < 3; i++) {
    speed = Math.sqrt((share * latHold(spec, speed, surfaceGrip, breakaway)) / k);
  }
  return speed;
}

/** How much of a fully developed slide the WHEEL alone can develop in this
 * car, 0..1. The number that separates a rear-driver, which has all the
 * rotation it needs in the throttle, from a front-driver, which has almost
 * none and has to be asked for it.
 *
 * With a SPEED it answers the sharper question: how much of that the car
 * has actually got at full lock at this speed, which is `car.ts`'s
 * `slideFactor` run forward on the demand full lock makes there. The
 * difference matters wherever the answer feeds a corner speed — a layout's
 * `depth` is what it reaches when the wheel is asking for everything, and
 * on the way to a fast corner it is asking for rather less than that. */
export function wheelSlide(spec: CarSpec, speed?: number, surfaceGrip = 1): number {
  const depth = T.drivetrain[spec.drive].depth;
  if (speed === undefined) return depth;
  // Full lock, undamaged rack, on this surface — the same product `car.ts`
  // builds out of the rack's rate, the speed fade, the standstill ramp and
  // what the tires give the front wheels to pull against.
  const fade = T.steering.fadeSpeed / spec.stability;
  const bite = 1 + T.grip.steerGrip * (surfaceGrip / spec.tyres.loose - 1);
  const gain =
    (spec.steerRate / (1 + speed / fade)) * clamp(speed / T.steering.deadSpeed, 0, 1) * bite;
  const demand = (speed * gain) / (spec.gripAccel * surfaceGrip);
  const entry = D.entryAt * T.drivetrain[spec.drive].entry;
  const t = clamp((demand - entry) / D.entrySpread, 0, 1);
  return t * t * (3 - 2 * t) * depth;
}

/** ...and the DEEPEST slide this car reaches however hard it is provoked,
 * 0..1 — the layout's own ceiling. The rear-driver's is the reference and
 * every other layout's is a fraction of it, which is what makes the
 * roster's cars different cars rather than the same car reached by
 * different routes. */
export function slideCap(spec: CarSpec): number {
  return T.drivetrain[spec.drive].cap;
}

/** ...and how much of one it can develop once a MOVE has taken the weight
 * off the rear — `provoked` being how far that move has gone, 0..1
 * (`CarState.provoked`). The lift a move is worth is the layout's own
 * shortfall against its own CEILING, so it is worth most to the car with
 * the least of its own and still never takes that car past what the layout
 * can do. Lifted toward 1 instead — which is what this did — a provocation
 * handed every layout the reference slide, and the hatch, having the
 * furthest to be lifted, came out of a hairpin on the lever as sideways as
 * the saloon that had it all along. */
export function askedSlide(spec: CarSpec, provoked: number): number {
  const wheel = wheelSlide(spec);
  const cap = slideCap(spec);
  return wheel + Math.max(0, cap - wheel) * clamp(provoked, 0, 1);
}

/** THE SPEED FLOOR under all of it, m/s of ground speed: under this the car
 * does not slide at all and the wheel is the only thing steering it. A move
 * lowers it — the corners that need one are the slow ones — but never
 * removes it. */
export function slideFloor(spec: CarSpec, provoked: number): number {
  const layout = T.drivetrain[spec.drive].driftFloor;
  return D.slideFrom * layout * (1 - (1 - D.provokeFloor) * clamp(provoked, 0, 1));
}
