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
import type { Underfoot } from "../mapgen/index.ts";
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
export function surfaceGripFor(spec: CarSpec, surface: Underfoot): number {
  const tyre = surface === "asphalt" ? spec.tyres.sealed : spec.tyres.loose;
  const ground = T.surfaces.grip[surface];
  // ...AND WHAT THE LAYOUT CLAWS BACK WHERE THERE IS LITTLE TO HOLD. A tyre
  // has one budget of grip and driving through it spends some: split the
  // torque across four wheels and each one spends half as much of a budget
  // that is already small, so the advantage of driving all of them is not
  // flat — it is worth almost nothing on a surface that grips and most of
  // its value on the ice, the snow and the standing water where the budget
  // has nearly run out. Measured as the shortfall against GRAVEL, which is
  // what every other number in the handling model is quoted against, so
  // graded stone and tarmac are untouched and the winter road is where the
  // four-wheel-drive collects.
  const shortfall = Math.max(0, 1 - ground);
  return (ground + shortfall * T.drivetrain[spec.drive].slipGrip) * tyre;
}

/** WHAT SHARE OF THE CAR'S WEIGHT IS STANDING ON THE DRIVEN WHEELS, 0..1 —
 * the number that decides how much of the engine the tyres can actually put
 * down, and the one thing separating the three layouts that is not a matter
 * of taste.
 *
 * A tyre's tractive limit is the friction coefficient times the load ON IT,
 * so what a layout can pull is the surface's grip times the share of the car
 * pressing its DRIVEN tyres into the ground. Four driven wheels have all of
 * it. A front-driver has whatever sits over its nose, a rear-driver whatever
 * sits over its tail — which is why four-wheel drive is worth roughly twice
 * a two-wheel drive off the line and why nothing about that is true of
 * CORNERING or BRAKING, where every car uses all four tyres whatever drives
 * them. `balance` and `centreHeight` in `defs/cars.ts` are the car's own
 * halves of it.
 *
 * AND IT MOVES WITH THE HILL, which is the half that makes a stage read.
 * Standing on a slope, gravity's component along the car pitches weight off
 * the downhill axle and onto the uphill one by `centreHeight / wheelbase`
 * per unit of grade: climbing, the nose goes light and the tail digs in. So
 * a rear-driver CLIMBS BETTER than it does on the flat, a front-driver claws
 * at a hill it was fine on, and a four-wheel drive does not care, because
 * the weight it lost off one axle it gained on the other. On a loose surface
 * where the budget is small to begin with, that is the difference between
 * driving up a dune and digging into it.
 *
 * The floor is not physics — a wheel carrying nothing really does pull
 * nothing — but a car whose traction reaches zero is one the player cannot
 * drive out of anything, and a cliff that steep is a bug however true it is.
 */
export function driveLoadOf(spec: CarSpec, grade: number): number {
  if (spec.drive === "awd") return 1;
  const shift = (spec.centreHeight / T.drivetrain.wheelbase) * drivenGrade(grade);
  const front = spec.balance - shift;
  return clamp(spec.drive === "fwd" ? front : 1 - front, T.drivetrain.loadFloor, 1);
}

/** THE GRADE THE TRACTION MODEL READS, m per m — the ground's, held inside
 * the range the model is about.
 *
 * Both halves of the model are linear in the grade, and linear in the grade
 * is only true of ground a car DRIVES on. Extended to a face, the load
 * transfer says a front-driver's nose is carrying less than nothing, which
 * is a car doing a wheelie rather than a car climbing, and the climb's cut
 * says the hill wants several times the friction the tyres have. Both are
 * arithmetic run past where it means anything: `collision.climbLimit` is
 * where the ground stops being a hill and starts refusing the car outright,
 * and past it what happens is the contact model's business and not this
 * one's — a face that steep is already pushing the car back out of itself
 * at several g (`car.ts`'s grade term is deliberately uncapped upward), and
 * charging the tyres a second time for the same hill is the same rule
 * applied twice. */
function drivenGrade(grade: number): number {
  const cap = T.collision.climbLimit;
  return clamp(grade, -cap, cap);
}

/** ...and THE BITE ITSELF: how much torque this car can hand the ground
 * here, before the pedal and the gear have their say (`drivetrain.ts` spends
 * it). The car's own `traction`, the layout's driveline (`drivetrain.bite`),
 * the share of the weight the driven wheels carry at this grade, and what
 * the surface will take.
 *
 * Stated here rather than in `drivetrain.ts` because three functions there
 * were each rebuilding it out of the same three factors, and a fourth
 * factor added to two of them would have been a car that spins differently
 * from the way it pulls. */
export function driveBiteOf(spec: CarSpec, surfaceGrip: number, grade: number): number {
  const axle =
    spec.traction * T.drivetrain[spec.drive].bite * driveLoadOf(spec, grade) * surfaceGrip;
  // ...LESS WHAT THE HILL IS ALREADY SPENDING. A car standing on a grade
  // needs that much of gravity supplied by its driven tyres before it moves
  // at all, and it comes out of the same friction budget everything else is
  // paid from — so a climb does not merely cost speed, it costs BITE, and
  // what is left is what the pedal may spend.
  //
  // This is the half that makes four driven wheels worth having, and
  // without it the advantage is invisible: on anything but a hill a
  // four-wheel drive's bite is over 1 and clamped, so it already loses
  // nothing and cannot be given less to lose. Take a quarter-grade's worth
  // out of every layout and the picture separates — on sand at 25% the
  // four-wheel drive still has most of its budget and the two-wheel drives
  // have spent well over half of theirs.
  //
  // Only a CLIMB charges. Rolling down a hill the tyres have budget to
  // spare and nothing is asking them for it — what a descent costs is
  // brakes, which is a different tyre and a different rule.
  return axle - Math.max(0, drivenGrade(grade)) * T.drivetrain.climbCost;
}

/** ...and HOW FAR SIDEWAYS the pair will go before the tyres give up, as
 * the multiple of the slide's own angles (`TUNING.drift.angleSpan` and its
 * fade band) that every angle in the drift model is scaled by. The
 * surface's own `breakaway` is most of it — a rally road has a slip
 * vocabulary tens of degrees wide and a sealed road's is a few degrees off
 * straight — and the layout is the rest.
 *
 * A DRIVEN REAR AXLE HAS A TARMAC VOCABULARY THE OTHERS DO NOT. What makes
 * a sealed road's breakaway small is that the rubber peaks a few degrees
 * off straight and falls away past it, so there is nothing to hang the car
 * out ON; what a driven rear does is spin the tyres up and supply that
 * itself, which is the one thing an undriven one cannot do and a driven
 * FRONT answers by washing the nose wide instead. So this is the shortfall
 * against gravel read the other way round: the sealed road is the only
 * surface under it, the rear-driver takes back better than half of what it
 * costs, and the other two layouts take back none. */
export function surfaceBreakawayFor(spec: CarSpec, surface: Underfoot): number {
  const ground = T.surfaces.breakaway[surface];
  const shortfall = Math.max(0, 1 - ground);
  return ground + shortfall * T.drivetrain[spec.drive].sealedSlip;
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

/** ...and the DEEPEST slide this car reaches however hard it is provoked,
 * 0..1 — the layout's own ceiling. The rear-driver's is the reference and
 * every other layout's is a fraction of it, which is what makes the roster's
 * cars different cars rather than the same car reached by different routes.
 *
 * Nearly level across the three on purpose: real layouts differ far less in
 * the angle they can be GOT to than in what HOLDS them there, and holding
 * them there is the throttle's job (`drift.powerSpan`). */
export function slideCap(spec: CarSpec): number {
  return T.drivetrain[spec.drive].cap;
}

/** ...and how much of one it can develop once a MOVE has taken the weight
 * off the rear — `provoked` being how far that move has gone, 0..1
 * (`CarState.provoked`). The lift a move is worth is the layout's own
 * shortfall against its own CEILING, so it is worth most to the car with the
 * least of its own and still never takes that car past what the layout can
 * do. Lifted toward 1 instead — which is what this did — a provocation
 * handed every layout the reference slide, and the hatch, having the
 * furthest to be lifted, came out of a hairpin on the lever as sideways as
 * the saloon that had it all along. */
export function askedSlide(spec: CarSpec, provoked: number): number {
  const wheel = wheelSlide(spec);
  const cap = slideCap(spec);
  return wheel + Math.max(0, cap - wheel) * clamp(provoked, 0, 1);
}

/** THE STEEPEST GROUND THE WHEELS CARRY THE CAR ONTO at a speed, m per m.
 * `collision.climbLimit` from a crawl, `collision.wallSlope` once the car
 * arrives at `collision.climbSpeed.to`, and the grade between rises with
 * the speed between: momentum is what takes a car up a bank, and a face
 * steeper than this at the speed the car meets it with is a wall to it
 * (`collideSlope`). Read by the seat, the face check and the contact
 * alike, so the ground a car is standing on is never a ground the contact
 * model is also refusing. Independent of the car: a heavier car carries
 * the same grade at the same speed, and pays for it in the fold. */
export function climbGrade(speed: number): number {
  const C = T.collision;
  const t = clamp((speed - C.climbSpeed.from) / (C.climbSpeed.to - C.climbSpeed.from), 0, 1);
  return C.climbLimit + (C.wallSlope - C.climbLimit) * t;
}

/** ...and the same line read the other way: the speed a face of `grade`
 * has to be met with to be carried up, m/s. `climbSpeed.from` for anything
 * a crawl takes, `climbSpeed.to` at `wallSlope` — and a face at or past
 * the wall is refused at any speed, which is the contact's own clause. */
export function climbSpeed(grade: number): number {
  const C = T.collision;
  const t = clamp((grade - C.climbLimit) / (C.wallSlope - C.climbLimit), 0, 1);
  return C.climbSpeed.from + (C.climbSpeed.to - C.climbSpeed.from) * t;
}

/** THE SPEED FLOOR under all of it, m/s of ground speed: under this the car
 * does not slide at all and the wheel is the only thing steering it. A move
 * lowers it — the corners that need one are the slow ones — but never
 * removes it. */
export function slideFloor(spec: CarSpec, provoked: number): number {
  const layout = T.drivetrain[spec.drive].driftFloor;
  return D.slideFrom * layout * (1 - (1 - D.provokeFloor) * clamp(provoked, 0, 1));
}
