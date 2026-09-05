// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CRASH — a car past its wheels, as a body with a shape and a weight in
// it rather than as an animation.
//
// Nothing here counts turns, and nothing here decides that a crash has gone
// on long enough. The shape and the plane under it are `roll-hull.ts`; this
// module is what happens on that surface, and it is four motions at once:
//
//   - GRAVITY pulls the weight downhill along the surface, in BOTH planes.
//     That is what turns the car over — across itself into a barrel roll,
//     along itself into an end-over-end — and what rocks it back when it
//     cannot make the next corner.
//   - THE GROUND DRIVES IT ON while the car is still travelling: one Coulomb
//     budget under one contact patch, pointing against the way that patch is
//     moving. That one vector does every job the ground does, and the reason
//     a crash looks like an accident is that it does them all at once — the
//     share across the car rolls it, the share along it pitches it, and the
//     patch's own offset from the weight SPINS it.
//   - EACH FACE arriving flat is an impact that changes which corner the
//     body turns about, and the exchange keeps a share set by the geometry
//     alone (`pivotKeep`).
//   - PAST a certain rate the surface falls away faster than gravity can
//     follow it, the body leaves the ground, and the flight is an ordinary
//     one that lands back here (`landRolled`).
//
// So a car goes over as many times as it has the energy to, in whichever
// planes it has the energy in, and comes to rest on whichever face it ran
// out on. Whether that face is its wheels is nobody's decision either:
// `standingOn` asks the box, and a car whose TYRES are what is on the ground
// goes straight back to the driver however far over it is holding — which is
// the whole of what balancing a car on two wheels is.

import { TUNING } from "./defs/tuning.ts";
import type { CarSpec } from "./defs/cars.ts";
import type { Rng } from "../lib/prng.ts";
import { arriving, contact, driveRolling, rubGround } from "./roll-contact.ts";
import { weightOverOrigin } from "./roll-ledger.ts";
import {
  type Bed,
  type MassSpread,
  LEVEL,
  bedNormal,
  clearOn,
  goesOverOn,
  massSpread,
  seatOn,
  seatSlopes,
  standingOn,
  turnedPoints,
} from "./roll-hull.ts";
import { clamp } from "../lib/math.ts";
import {
  rollTilt,
  rotateFrame,
  updateSlip,
  type CarInput,
  type CarState,
  type GameEvent,
  type RunStats,
} from "./state.ts";

export { WHEEL_BASIN, massSpread, onItsWheels, type MassSpread } from "./roll-hull.ts";
export { crashEnergy, crashTurbulence } from "./roll-ledger.ts";

const T = TUNING;
const R = TUNING.air.roll;
const B = TUNING.collision;

/** What the ground under a crashing car has to be able to say. A structural
 * subset of `car.ts`'s `GroundContext`, so the crash can be stepped without
 * the handling model — and without an import cycle between the two. */
export type RollGround = {
  groundAt: (x: number, z: number) => number;
  /** Ground slope along the heading and across it, dy/ds. */
  slope: number;
  slopeLat?: number;
  /** The run's own seeded RNG — the crash's flights draw the same turbulence
   * every other flight does, and from the same source, so a stage driven
   * twice crashes twice the same way. */
  rng: Rng;
};

/** THE PLANE THE BODY IS LYING ON, as its own normal. Everything the surface
 * says is said about the body's attitude relative to THIS, and a hillside is
 * tilted two ways at once — which is why it is a normal and not a pair of
 * angles subtracted from the roll and the pitch. */
export function rollBed(ctx: { slope: number; slopeLat?: number }): Bed {
  return bedNormal(ctx.slopeLat ?? 0, ctx.slope);
}

/** WHAT IS HOLDING THE CAR UP, as a height above the ground for its origin —
 * the wheel contact plane under its middle, which is what `CarState.y` is
 * and what the renderer hangs the whole car off.
 *
 * A car going over is on its shell, and the answer is however much of the
 * body is underneath it: what puts a rolled car's roof on the grass rather
 * than through it, and what makes a body turning in the air meet the ground
 * on the corner actually pointing at it. Read over the WHOLE box, because a
 * crashing body is rolled and pitched at once and a section of it cannot
 * then say where the metal is.
 *
 * Measured against LEVEL rather than the bed, deliberately: this is a height
 * for `car.y`, which is a world height, and the ground's own tilt is already
 * answered by `rollSeat` sampling the terrain under every corner.
 *
 * Every other car is on its WHEELS, however far the body leans on its
 * springs, so it is flat zero and an ordinary jump is untouched by it. */
export function rollStand(car: CarState): number {
  return car.rolling ? clearOn(rollTilt(car.roll), rollTilt(car.pitch)) : 0;
}

/** THE GROUND UNDER THE WHOLE BODY, as a height for the middle of the car —
 * the same question `ground.ts`'s `seatOn` asks of a car that is driving,
 * asked of the box a car that is going over is lying on.
 *
 * A crashing body is four metres of car at an attitude nobody chose, and out
 * in the wild the ground under one end of it is nothing like the ground under
 * its middle. Standing it on the single point under its origin buries
 * whichever end is over rising ground — a tail through a bank, a roof through
 * the far side of the rut it is grinding along — at the one moment the player
 * is watching the car most closely.
 *
 * A corner over ground rising harder than the body could have got there over
 * is not lying on it, it is up against a WALL — and a wall stops a car, it
 * does not hold it in the air. So what a corner may claim is capped at
 * `collision.climbLimit` over its own reach, the same line `seatOn` draws.
 *
 * Handed back as a GROUND HEIGHT and never as a lift applied to `car.y` after
 * the fact. The height the step carries between frames IS `car.y`, so a clamp
 * on it is read back next step as the body having CLIMBED: a pitched car held
 * clear of the ground came back thinking its weight was that much higher, was
 * lifted again off that, and flew away without touching anything again. */
function rollSeat(car: CarState, ctx: RollGround): number {
  const tilt = rollTilt(car.roll);
  const pitch = rollTilt(car.pitch);
  const under = ctx.groundAt(car.x, car.z);
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  let seat = under;
  for (const p of turnedPoints(tilt, pitch)) {
    // Forward is (sin h, cos h) and right is (cos h, -sin h).
    const x = car.x + sinH * p.along + cosH * p.across;
    const z = car.z + cosH * p.along - sinH * p.across;
    const reach = Math.hypot(p.along, p.across) * B.climbLimit;
    const plane = Math.min(ctx.groundAt(x, z), under + reach) - p.up;
    if (plane > seat) seat = plane;
  }
  return seat - clearOn(tilt, pitch);
}

/** DOES IT GO OVER SIDEWAYS? The energy question, asked of the plane a
 * sideways trip puts a car over in. */
export function goesOver(
  roll: number,
  rollRate: number,
  mass: MassSpread,
  bed: Bed = LEVEL,
): boolean {
  return goesOverOn("roll", rollTilt(roll), 0, rollRate, mass, bed);
}

/** ...AND DOES IT GO OVER ITS OWN NOSE? The same question in the other
 * plane: the one a long jump landed nose-first asks, and the one a car
 * bounced backwards off a bank asks about its tail. It takes far more,
 * because the box is more than twice as long as it is wide — a barrel roll
 * wants about three rad/s and an end-over-end four. That is why an endo is
 * the rarer accident, and nobody chose it: it is the shape of the car. */
export function goesOverEnd(
  pitch: number,
  pitchRate: number,
  mass: MassSpread,
  bed: Bed = LEVEL,
): boolean {
  return goesOverOn("pitch", 0, rollTilt(pitch), pitchRate, mass, bed);
}

/** WHAT TURNS A CAR THAT IS UP ON TWO WHEELS, rad/s² — the balance the driver
 * is actually playing with, handed to the handling model because the surface
 * it is read off lives here.
 *
 * A car standing on one pair of wheels is a rigid body pivoting on that
 * contact line, and exactly two things turn it:
 *
 *   - GRAVITY, through the surface. That moment is the same one a rollover
 *     runs on, which is the point: the car that is balancing and the car
 *     that is going over are the same body on the same surface, and
 *     `goesOver` decides which of the two this is.
 *   - THE CORNER THE DRIVER IS TAKING. The tyres' lateral force acts at the
 *     ground, a weight's height below the weight, so it works on that lever
 *     exactly as the ground's friction does in a crash. Steer INTO the side
 *     the car is standing on and it pushes the body back down onto four
 *     wheels; steer away and it holds it up, or takes it over. Nothing
 *     scripts that — it is the sign of `aLat` against the sign of the lean.
 *
 * `aLat` is the lateral acceleration the tyres are making, m/s², positive to
 * the car's right. */
export function leanTorque(
  roll: number,
  pitch: number,
  aLat: number,
  mass: MassSpread,
  bed: Bed,
): number {
  const tilt = rollTilt(roll);
  const nose = rollTilt(pitch);
  const height = standingOn(tilt, nose, bed).height;
  const slopes = seatSlopes(tilt, nose, bed);
  return (aLat * height - T.air.gravity * slopes.roll) / mass.over.roll;
}

/** THE CAR IS GOING OVER. Books the crash and says so once — everything
 * about how far it then goes is the stepping below. */
export function beginRoll(car: CarState, events: GameEvent[], stats: RunStats): void {
  if (car.rolling) return;
  car.rolling = true;
  car.sliding = false;
  car.planted = false;
  stats.rolls += 1;
  events.push({
    type: "rollover",
    rate: Math.max(Math.abs(car.rollRate), Math.abs(car.pitchRate)),
    speed: Math.hypot(car.u, car.w),
  });
}

/** A FLIGHT that comes down with the car off its wheels. There is nothing for
 * the tyres to do — a flank or the nose arrives instead — so the landing is
 * the crash's own contact and the car carries straight on turning over. */
export function landRolled(
  spec: CarSpec,
  car: CarState,
  groundY: number,
  bed: Bed,
  events: GameEvent[],
  stats: RunStats,
): void {
  const tilt = rollTilt(car.roll);
  const pitch = rollTilt(car.pitch);
  car.y = groundY + clearOn(tilt, pitch);
  car.airborne = false;
  car.settling = false;
  car.wheelVy = 0;
  car.footVy = 0;
  car.footMean = 0;
  car.foot = 0;
  beginRoll(car, events, stats);
  // The descent is gone into the ground, and it is the crash's contact that
  // decides what is left of the turn — this is the only contact a fast crash
  // gets, because it is in the air for the rest of every turn.
  const descent = Math.max(0, -car.vy);
  car.vy = 0;
  contact(
    arriving(car),
    spec,
    car,
    descent,
    tilt,
    pitch,
    bed,
    massSpread(spec.mass),
    events,
    stats,
  );
}

/** ONE STEP OF A CAR GOING OVER.
 *
 * The crash owns BOTH halves of itself — the body turning on the ground and
 * the body in the air between two contacts — and it has to, because they are
 * the same motion. A crashing body in flight follows a parabola about its own
 * WEIGHT while it goes on turning underneath it; handing that to the ordinary
 * flight, which flies the wheel plane, has the ground apparently rising and
 * falling with the body's attitude and the car chattering in and out of
 * contact several times a face. So the height tracked here is the weight's,
 * and the ground it is compared against is the surface.
 *
 * THE DRIVER IS STILL DRIVING (`driveRolling`), for as much of the car as is
 * still standing on its tyres and no more. Nothing about that is an override
 * or an escape: it is one more force at the same contact patch, spent out of
 * the same budget, doing the same four jobs — so it changes where the crash
 * goes and not only how fast it ends, and it fades to nothing on its own as
 * the body passes its flank.
 *
 * What ends the roll is `car.rolling` going false, at which point either the
 * tyres are back down and the handling model takes the car — leaning or not —
 * or they are not, and step.ts sends the run back to its last split board. */
export function stepRolling(
  spec: CarSpec,
  car: CarState,
  input: CarInput,
  ctx: RollGround,
  events: GameEvent[],
  stats: RunStats,
): void {
  const dt = T.dt;
  const bed = rollBed(ctx);
  const mass = massSpread(spec.mass);
  const tilt = rollTilt(car.roll);
  const pitch = rollTilt(car.pitch);
  // WHERE THE WEIGHT IS, as a WORLD height. Carried in `car.y` (the origin)
  // between steps, which is what the rest of the game reads, and unpacked
  // here through the attitude.
  //
  // A world height and never a height above the ground under the body. The
  // surface is what decides where the CONTACT is; it is not a datum a flying
  // body may be carried relative to. `rollSeat` moves with the terrain AND
  // with the attitude (`clearOn` is inside it), so a body re-datumed onto it
  // every step is re-seated onto whatever ground it happens to be over and
  // climbs hills between contacts for nothing — in steps where the only term
  // that ran was gravity. On flat ground it cancels exactly, which is why
  // only a crash thrown off a lip into the wild ever showed it: it was 13.5%
  // of `carry`'s whole budget, all of it on `air->air` steps.
  let centre = car.y + weightOverOrigin(tilt, pitch);
  // `airborne` is the crash's own bit for BETWEEN ITS CONTACTS — which is
  // what airborne honestly means for a car going over, and what the camera,
  // the HUD and the effects want to hear. It cannot be read back off the
  // height: a body letting go of its corner separates from the surface by
  // half a gravity times a step squared, a third of a millimetre, and any
  // tolerance coarse enough not to chatter on that is coarse enough to glue
  // it back down for the first several steps of every flight.
  const down = !car.airborne;
  const wasFlat = standingOn(tilt, pitch, bed).flat;

  if (down) {
    // GRAVITY along the surface, in both planes at once — downhill toward the
    // face below the weight, uphill against the corner ahead of it, and read
    // against the BED so that "the face below it" is the hillside's idea of
    // one. A car on its roof on a bank lies on the BANK, a bank's worth of
    // angle round from upside down, and sits in a genuine minimum there:
    // which is what "it just slides down" means.
    const slopes = seatSlopes(tilt, pitch, bed);
    car.rollRate -= (T.air.gravity / mass.over.roll) * slopes.roll * dt;
    car.pitchRate -= (T.air.gravity / mass.over.pitch) * slopes.pitch * dt;
    // ...and THE GROUND, which is the same friction that is slowing the car
    // down and has to be written as one thing. It is bought OUT OF THE
    // TRAVEL, and that is the whole of why a crash ends: a torque written on
    // the sign of the slide alone is a car that turns over for as long as
    // anything nudges it sideways, because nothing it spends comes from
    // anywhere.
    // THE DRIVER FIRST, through whatever of the car is still on rubber, and
    // then the ground with WHAT IS LEFT of the patch. The order is the whole
    // point: they are one contact and one budget, so a steering input the
    // ground then reacted to in full would be the same friction charged
    // twice. With no input on the pedals or the wheel this takes nothing and
    // the rub below is exactly the crash the module always ran.
    const asked = driveRolling(car, input, T.air.gravity * dt, tilt, pitch, bed, mass);
    rubGround(car, T.air.gravity * dt * (1 - asked), tilt, pitch, bed, mass, false);
    // What the ground bleeds out of each rotation as it grinds round on it.
    // Panels are not tyres, and the pitch loses it faster because the whole
    // length of the car is lying on the ground while it goes end over end
    // where only its width is while it barrel-rolls.
    car.rollRate *= Math.exp(-R.drag * dt);
    car.pitchRate *= Math.exp(-R.pitchDamp * dt);
    car.yawRate *= Math.exp(-R.yawDamp * dt);
  }

  const wasRoll = car.roll;
  const wasPitch = car.pitch;
  car.roll += car.rollRate * dt;
  car.pitch += car.pitchRate * dt;
  const nowR = rollTilt(car.roll);
  const nowP = rollTilt(car.pitch);
  // WHERE THE AXLE IS. A body going over turns about the CORNER of itself
  // that is on the ground, and that corner is out from the middle of the car
  // — so the whole car is carried as it goes over, about two metres per half
  // turn sideways and twice that end over end. `car.y` and the rotation alone
  // put the right corner on the ground at every attitude but leave the body
  // turning about a fixed point under its own middle, which is a car holding
  // a bar at ground level and spinning round it: the one thing a crashing car
  // never does.
  //
  // How far it walks per radian is how tall the body is standing on that
  // corner, which is the box's own clearance. In the air there is no corner
  // and no walk — the body turns about its weight and nothing else.
  const stand = clearOn(nowR, nowP, bed);
  const walk = down ? -stand * (car.roll - wasRoll) : 0;
  const stride = down ? -stand * (car.pitch - wasPitch) : 0;

  // A FACE ARRIVING while the body is still on the ground. Asked of the BOX —
  // a face that was not flat on the plane a step ago and is now — rather than
  // of an angle crossing a quarter turn, which cannot be asked honestly of a
  // body that is pitched and rolled at once on a plane tilted two ways.
  if (down && !wasFlat && standingOn(nowR, nowP, bed).flat) {
    contact(arriving(car), spec, car, 0, nowR, nowP, bed, mass, events, stats);
  }

  if (down) {
    // The hill still pulls: a car on its roof on a slope goes down it.
    car.u -= T.air.gravity * ctx.slope * dt;
    if (ctx.slopeLat) car.w -= T.air.gravity * ctx.slopeLat * dt;
  }
  updateSlip(car);
  const delta = car.yawRate * dt;
  car.heading += delta;
  rotateFrame(car, delta);
  // ...AND THE SPIN DOES NOT TURN WITH IT. The velocity is a world vector
  // read on the car's own axes, so it has to be re-expressed when those axes
  // swing; the roll and the pitch are not one, and there is no honest way to
  // treat them as one here. It was tried both ways.
  //
  // Re-expressing the ROLL ALONE is what the reported fault asks for — a car
  // that swapped ends going on rolling the same way in the world, which is
  // the other way in its own frame — and it is not a rotation at all: the
  // roll takes `-pitchRate x sin` and the pitch pays nothing back, which put
  // 0.086 rad/s a step into the roll of a crash at six rad/s of yaw, half
  // again what the ground under the car was taking out of it. Nor does it
  // deliver the flip: applied a step at a time, `x cos(delta)` compounds to a
  // seven per cent decay over a half turn of yaw, never a sign change.
  //
  // The CONSERVATIVE PAIR is exact for the rates and wrong for the angles.
  // `roll` and `pitch` are Euler angles stepped independently, and the
  // exchange's own kinematics want the rate the NOSE comes round at, which
  // once the body is pitched is not the rate it is turning about the world's
  // vertical at — `heading` runs at `yawRate - rollRate x sin(pitch)`, and a
  // car going over at eight rad/s with its nose twenty degrees down differs
  // by 2.7 rad/s. The ground's spin torque is conjugate to the heading, so
  // the module cannot have it both ways. Measured with the pair in, `carry`
  // turned nine and a quarter times and covered 121 m: a roll with nothing
  // left in it that could end.
  //
  // So neither, and the invariant bought is worth more than the flip:
  // NOTHING IN THIS MODULE CAN ADD ROTATION. Gravity trades it against the
  // surface, the ground's one budget is capped at the slip it is stopping,
  // the damps and the pivot exchange only ever take, and the turbulence is
  // bounded and averages to nothing. Every rotational fault this module has
  // had was something quietly making rotation out of nothing.
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  car.x += (sinH * car.u + cosH * car.w) * dt + cosH * walk + sinH * stride;
  car.z += (cosH * car.u - sinH * car.w) * dt - sinH * walk + cosH * stride;

  // Nothing is standing on the springs, and there is no drift, no spin and no
  // wheelspin to read off a car with no wheels on the ground. The PITCH is
  // not in this list: it is a plane the body is going over in, not a readout
  // of a contact patch, and it is stepped above.
  car.pitchLoad = 0;
  car.ride = 0;
  car.rideRate = 0;
  car.loft = 0;
  car.loftRate = 0;
  car.slide = 0;
  car.drifting = false;
  car.spun = false;
  car.wheelspin = 0;
  car.locked = false;
  car.reversing = false;
  car.weight = 1;
  // ...but the DRIVER is not a readout of the ground. The rack follows the
  // hands whether or not there is anything under the front wheels to answer
  // it, and the lamps light off the pedal rather than off the grip, so a
  // player fighting a crash can see their own inputs on the car.
  car.steer += (input.steer - car.steer) * clamp(T.steering.rackRate * dt, 0, 1);
  car.braking = input.brake > 0 || input.handbrake;
  // A body off its wheels is never planted, whatever it is doing next step.
  car.planted = false;

  const seat = seatOn(nowR, nowP, bed);
  const slopes = seatSlopes(nowR, nowP, bed);
  // ...and WHERE IT WOULD REST, in the world: the ground under the whole body
  // plus the arm the attitude holds the weight out on. This is the one place
  // the terrain enters, and it enters as the height a contact happens AT
  // rather than as a datum anything is carried relative to.
  const rest = rollSeat(car, ctx) + seat;
  // How fast the surface itself is moving under the body — it is not a floor,
  // it runs at its own slope times the rate the body is turning, in both
  // planes at once.
  const seatVy = slopes.roll * car.rollRate + slopes.pitch * car.pitchRate;
  if (down) {
    // OFF THE GROUND. Following the box round a corner asks the weight to
    // fall faster than gravity alone would take it, and the ground has
    // nothing to pull down with — so the contact lets go and the body flies,
    // still turning, at the rate it was going round at. Below about three
    // rad/s that never happens and the car simply grinds its way over; above
    // it, most of every turn is flight.
    const held =
      seat * (car.rollRate * car.rollRate + car.pitchRate * car.pitchRate) +
      (T.air.gravity / mass.over.roll) * slopes.roll * slopes.roll +
      (T.air.gravity / mass.over.pitch) * slopes.pitch * slopes.pitch;
    centre = rest;
    car.vy = seatVy;
    car.airborne = held > T.air.gravity;
    car.airTime = 0;
  } else {
    car.vy -= T.air.gravity * dt;
    centre += car.vy * dt;
    car.airTime += dt;
    // A body between contacts is as out of control as any other in the air,
    // and takes the same knocks: without them a crash thrown clear turns at
    // exactly the rate it left with and comes down on the face arithmetic
    // says it must, every time, off the same takeoff.
    car.rollRate += (ctx.rng.next() - 0.5) * 2 * T.air.rollTurbulence * dt;
    car.yawRate += (ctx.rng.next() - 0.5) * 2 * T.air.turbulence * dt;
    car.pitchRate += (ctx.rng.next() - 0.5) * 2 * T.air.pitchTurbulence * dt;
    // ...AND A CONTACT IS A CORNER CLOSING ON THE GROUND, never a body found
    // below its own surface. The surface `rest` is the height the weight has
    // to be at for the box to touch at THIS attitude, so it sweeps up and
    // down as the body turns — at slope × rate, which past a corner is ten
    // metres a second — and a body turning at eight rad/s is overtaken by it
    // and left underneath it every step or two while one and the same corner
    // is still coming down. Read as arrivals, those steps were charged a full
    // pivot exchange each: one hand-over billed four times over, 8.24 rad/s
    // down to 3.30 through a single corner, on contacts reporting a descent
    // of nothing. `descent` is already capped at `g × airTime` and correctly
    // gave the friction nothing on them; this is what says the same of the
    // rotation, and it says it as a fact about the step rather than as
    // something the body has to remember about the last one.
    //
    // The test is the closing itself — is the surface still coming at the
    // weight — and it is the same quantity the arrival is priced off two
    // lines down, which is the point: one account of the geometry. Where it
    // is zero the corner is already on its way back out, and the honest
    // answer is that nothing arrived: no exchange, no reaction, and no
    // re-seating the body onto a surface that is dropping away from it, which
    // would hand it a fall it never took.
    const closing = Math.max(0, seatVy - car.vy);
    if (centre <= rest && closing > 0) {
      // ...and comes back to it. ONE contact, at whatever attitude it
      // actually arrived at.
      //
      // WHAT ARRIVED is a much smaller thing than the numbers on either side
      // of the contact suggest, and a crash that carries has to make both
      // corrections. It is the closing speed against the SURFACE, never the
      // body's own fall — the surface is moving, at slope × rate under a body
      // turning off a corner, which past a corner is ten metres a second of
      // it, and a body tracking that down is not arriving anywhere. And it is
      // capped by WHAT THE FLIGHT PUT IN: gravity is the only thing that can
      // have been adding to the fall while the body was off the ground, so
      // `g × airTime` is the whole of what the ground has to arrest, and the
      // rest of the closing is the body ROTATING over its corner, which the
      // pivot exchange prices and the travel must never be charged for.
      const descent = Math.min(closing, T.air.gravity * car.airTime);
      centre = rest;
      car.airborne = false;
      car.airTime = 0;
      contact(arriving(car), spec, car, descent, nowR, nowP, bed, mass, events, stats);
      // ...and the body leaves at the speed the SURFACE is now moving, which
      // the contact has just changed: the reaction turned the body about the
      // corner it landed on, and the seat under a body turning at a new rate
      // rises and falls at a new speed. Read off `seatVy` from before the
      // contact, the body arrives at the next step already closing on ground
      // it is no longer falling toward, and books a second arrival for the
      // first one's impulse.
      //
      // WHAT IS LEFT OF THE LEAK LIVES HERE, and it is not this line's to
      // fix. A body in flight turns about its own weight; a body on the
      // ground turns about the corner under it and carries the weight round
      // on that arm, and the ledger reads the arm's motion as `vy` where the
      // grounded step integrates it inside `mass.over`. So the two hand-overs
      // disagree — the takeoff gives the arm up, the touchdown takes it back
      // — and on a fast bare roll that is one or two steps worth a fifth of
      // the budget. Both repairs that suggest themselves (scale the rotation
      // to what the arrival could pay for; settle the residual as a normal
      // impulse at the corner) DO close it, to a worst 18% from 32%, and both
      // flatten `make roll` to half a turn at every entry from 24 to 50 m/s,
      // because they take from the rotation at every one of the touchdowns a
      // fast roll makes and a slow one does not. The exchange is already
      // priced once, by `pivotKeep`; charging it again here is the double
      // charge this module keeps rediscovering. Closing it honestly means the
      // grounded step coupling the travel to the rotation — inertia `spin +
      // slopes²` rather than the constant `spin + SILL_ARM` — which is a
      // different model and a full retune of the crash's feel.
      const after = seatSlopes(nowR, nowP, bed);
      car.vy = after.roll * car.rollRate + after.pitch * car.pitchRate;
    }
  }
  // Back into the origin the rest of the game reads the car's height from.
  car.y = centre - weightOverOrigin(nowR, nowP);
  car.settling = false;

  car.sliding = false;
  if (car.airborne) return;
  const patch = standingOn(nowR, nowP, bed);
  // ON ITS TYRES AND NOT GOING ANYWHERE ELSE: the driver gets the car back,
  // LEANING OR NOT, and that is the whole of what balancing a car on two
  // wheels is.
  //
  // The old bar was that the body had to be lying FLAT on a face with the
  // rotation spent, so a car that came down out of a crash and caught itself
  // at forty degrees was still the crash's — no throttle, no steering, and a
  // kinematic recovery slamming it level. The most retrievable moment in any
  // accident was the one moment the driver could do nothing with.
  //
  // The two tests that matter are geometric. `sprung` says the points holding
  // the car up are its TYRES rather than a corner of the shell; `goesOver`
  // says the body has not the energy to climb its own sill corner and is
  // coming back down rather than going over. Pass both and it is a car on its
  // wheels whatever angle it is holding — and the lean, the roll rate and the
  // travel go back untouched, because `car.ts` models them now (`leanTorque`)
  // instead of easing them away.
  //
  // ...and NOT WHILE IT IS STILL TURNING. A crash passes THROUGH the
  // wheels-down attitude once every turn, and for that step the tyres are
  // honestly the lowest points of the box — so `sprung` alone hands a car
  // out of the middle of its own accident, at whatever speed it happened to
  // be doing, and car.ts puts it straight back in on the next step and books
  // a second rollover for the same crash.
  //
  // The difference between a car BALANCING and a car passing through is the
  // rate. A driver holding a car up on two wheels is holding it more or less
  // still — that is what balancing IS — while a body mid-roll is going round
  // at two or three rad/s and only looks upright for a fiftieth of a second.
  // `R.rest` is the bar the settle already uses for "the rotation is spent",
  // and it is the right one here for the same reason.
  if (
    patch.sprung &&
    Math.abs(car.rollRate) < R.rest &&
    !goesOver(car.roll, car.rollRate, mass, bed)
  ) {
    car.rolling = false;
    return;
  }
  if (Math.abs(car.rollRate) >= R.rest || Math.abs(car.pitchRate) >= R.rest) return;
  if (!patch.flat) return;
  // ...NOR WHILE IT IS STILL SLIDING, if the face it came to rest on is not
  // its wheels. A car on its roof has no tyres on the ground: it has a roof,
  // and the ground goes on taking the travel out of it at the same friction
  // that was turning it over a moment ago. That grind belongs to the crash
  // and the crash keeps the car through it — handing it back the instant the
  // ROTATION stopped froze it solid, because `stepOverturned` returns before
  // anything moves, and a car that settled onto its roof at 63 km/h stood
  // there for the whole of `lieFor` with the speed unspent in its velocity.
  if (Math.hypot(car.u, car.w) > R.restSpeed) {
    car.sliding = true;
    return;
  }
  car.rolling = false;
  car.rollRate = 0;
  car.pitchRate = 0;
}
