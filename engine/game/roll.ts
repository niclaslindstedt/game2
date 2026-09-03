// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROLL — a car past its outside wheels, as a body with a shape and a
// weight in it rather than as an animation.
//
// Nothing in this module counts turns, and nothing in it decides that a
// roll has gone on long enough. The car is the box in `TUNING.collision`
// standing on the ground: two wheel contacts and the four corners of the
// shell. Rotate that outline and its centre of mass rises and falls —
// lowest with a face down (on its wheels, on a flank, on its roof), and
// highest balanced on a corner between two of them. That curve is the
// whole model:
//
//   - GRAVITY pulls the centre downhill along it, which is what turns the
//     car over and what rocks it back when it cannot make the next corner.
//   - THE GROUND DRIVES IT ON while the car is still travelling sideways
//     (`roll.grip`): friction under a sliding body, working on the lever of
//     the centre's own height. This is why a roll is a roll and not one
//     flip — and why it stops, because the same friction is scrubbing the
//     travel away underneath it.
//   - EACH FACE arriving flat on the ground is an impact that changes which
//     corner the body is turning about, and that exchange keeps a share of
//     the roll set by the geometry alone (`faceKeep`). A flank keeps about
//     half and usually carries the car straight on over; square on the
//     wheels or the roof keeps under a fifth, which is where rolls end.
//   - PAST a certain rate the outline falls away faster than gravity can
//     follow it, the body leaves the ground, and the flight is an ordinary
//     one that lands back here (`landRolled`).
//
// So a car goes over as many times as it has the energy to, and comes to
// rest on whichever face it ran out on. Whether that face is the wheels is
// nobody's decision either: step.ts asks `onItsWheels` afterwards, and a
// run whose car is lying on its roof goes back to the last split board.

import { clamp } from "../lib/math.ts";
import { TUNING } from "./defs/tuning.ts";
import type { CarSpec } from "./defs/cars.ts";
import type { Rng } from "../lib/prng.ts";
import { landingDamage } from "./collision.ts";
import {
  rollTilt,
  rotateFrame,
  updateSlip,
  type CarState,
  type GameEvent,
  type RunStats,
} from "./state.ts";

const T = TUNING;
const R = TUNING.air.roll;
const B = TUNING.collision;

/** What the ground under a rolling car has to be able to say. A structural
 * subset of `car.ts`'s `GroundContext`, so the roll can be stepped without
 * the handling model — and without an import cycle between the two. */
export type RollGround = {
  groundAt: (x: number, z: number) => number;
  /** Ground slope along the heading and across it, dy/ds. */
  slope: number;
  slopeLat?: number;
  /** The run's own seeded RNG — the roll's flights draw the same
   * turbulence every other flight does, and from the same source, so a
   * stage driven twice rolls twice the same way. */
  rng: Rng;
};

/** THE OUTLINE, in the body's own frame: (across, up) from the wheel
 * contact plane under the middle of the car, which is what `CarState.y`
 * is. Two wheel contacts and the four corners of the shell — every point a
 * car can come to rest on. A roll is this hull turning on the ground.
 *
 * The third field is whether that corner is SPRUNG, and it matters at
 * exactly one moment: when the corner is the one ARRIVING at the ground
 * (`pivotKeep`). A shell corner arriving is sheet metal against the
 * ground and the exchange is the rigid one; a WHEEL arriving is what the
 * suspension exists to swallow, and it gives most of it back instead of
 * taking it out of the body. Without that distinction a car merely levered
 * up off level pays a flat-on-both-wheels impact for passing through
 * upright, which is nine tenths of any trip gone before the car has left
 * the ground — no landing, however crossed up, could roll a car at all. */
const CONTACTS: readonly (readonly [number, number, boolean])[] = [
  [B.halfTrack, 0, true],
  [-B.halfTrack, 0, true],
  [B.halfWidth, B.floorY, false],
  [-B.halfWidth, B.floorY, false],
  [B.halfWidth, B.roofY, false],
  [-B.halfWidth, B.roofY, false],
];

/** How far the hull has to be lifted for the outline above to rest on the
 * ground at this attitude, m — the deepest any of its points has gone
 * below the wheel plane. Zero upright, `halfWidth` on its side, the whole
 * height of the car on its roof. */
function hullStand(tilt: number): number {
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  let lowest = 0;
  for (const [across, up] of CONTACTS) {
    const h = up * cos - across * sin;
    if (h < lowest) lowest = h;
  }
  return -lowest;
}

/** ...and how high the WEIGHT in the car then sits, m. The one curve the
 * whole model runs on: its valleys are the faces a car comes to rest on
 * and its peaks are the corners a roll has to lift itself over. */
function centreHeight(tilt: number): number {
  return hullStand(tilt) + B.centreY * Math.cos(tilt);
}

/** Its slope, m per rad — the gravity torque, up to the inertia it works
 * against. Read as a difference rather than in closed form because the
 * curve is a MAX over the hull's corners and has a kink at every handover
 * from one of them to the next; the difference rounds those kinks off,
 * which is what a tyre and a bent sill do to them anyway. */
const SLOPE_STEP = 1e-3;
function centreSlope(tilt: number): number {
  return (centreHeight(tilt + SLOPE_STEP) - centreHeight(tilt - SLOPE_STEP)) / (2 * SLOPE_STEP);
}

/** THE FACES — the attitudes the body lies flat on the ground at: its
 * wheels, either flank, its roof. They are the valleys of `centreHeight`,
 * and with a rectangular hull they fall exactly on the quarter turns,
 * which is what makes a face arriving detectable as the roll crossing a
 * multiple of a right angle. */
const QUARTER = Math.PI / 2;

/** `centreHeight` sampled once round the turn, so asking what stands
 * between an attitude and the next face it could lie on is a walk over a
 * table rather than a hundred sines a step. A quarter of a degree resolves
 * a corner to about a tenth of a millimetre of lift. */
const STEPS = 1440;
const PER_STEP = (2 * Math.PI) / STEPS;
const PER_FACE = STEPS / 4;
const HEIGHT = (() => {
  const table = new Float64Array(STEPS);
  for (let i = 0; i < STEPS; i += 1) table[i] = centreHeight(-Math.PI + i * PER_STEP);
  return table;
})();

/** How far past upright the body can be and still fall back onto its
 * wheels, rad — the top of the climb out of the wheels-down valley, which
 * for this hull is the sill corner. Past it the car is going over whatever
 * anybody wants, and a car LYING past it is a car nobody is driving away
 * from. */
export const WHEEL_BASIN = (() => {
  let at = 0;
  let best = -Infinity;
  for (let i = 0; i <= PER_FACE; i += 1) {
    const h = HEIGHT[STEPS / 2 + i];
    if (h > best) {
      best = h;
      at = i * PER_STEP;
    }
  }
  return at;
})();

/** Is the car standing on its wheels? Asked of a body that has stopped
 * moving: inside the basin the ground rights it, outside it the run is
 * over and goes back to the last split board. */
export function onItsWheels(roll: number): boolean {
  return Math.abs(rollTilt(roll)) < WHEEL_BASIN;
}

/** WHAT IS HOLDING THE CAR UP, as a height above the ground for its origin
 * — the wheel contact plane under its middle, which is what `CarState.y`
 * is, and what the renderer hangs the whole car off.
 *
 * A car that is GOING OVER is on its shell, and the answer is however much
 * of the body is underneath it: what puts a rolled car's roof on the grass
 * rather than through it, and — just as important — what makes a body
 * turning in the air meet the ground on the corner that is actually
 * pointing at it. Landing every attitude on the wheel plane would have the
 * ground reaching up half a car's height for anything near upright, which
 * quietly ends most fast rolls back on their wheels.
 *
 * Every other car is on its WHEELS, however far the body is leaning on its
 * springs, so it is flat zero and an ordinary jump is untouched by any of
 * this. */
export function rollStand(car: CarState): number {
  return car.rolling ? hullStand(rollTilt(car.roll)) : 0;
}

/** The highest the body's centre has to be lifted to get from here to the
 * next face it could come to rest on, m — everything between it and there,
 * not merely the first bump. Read off the table, walking until the quarter
 * turn is crossed. */
function barrier(tilt: number, dir: number): number {
  let i = Math.round((tilt + Math.PI) / PER_STEP);
  // Seeded BELOW everything, so what comes back is what stands AHEAD of the
  // body and never the ground it is already on. Seeding it with the current
  // sample makes the climb out of any attitude at least zero and, once the
  // rounding to the table has had its say, a hair over — which reads as a
  // corner a hair high, and every car a degree off level is then rolling.
  let highest = -Infinity;
  const step = dir > 0 ? 1 : -1;
  for (let n = 0; n < PER_FACE; n += 1) {
    i += step;
    const h = HEIGHT[((i % STEPS) + STEPS) % STEPS];
    if (h > highest) highest = h;
    // The next face: the body has somewhere to lie again, so the climb up
    // to here is the whole of what it had to pay.
    if (((i % PER_FACE) + PER_FACE) % PER_FACE === 0) break;
  }
  return highest;
}

/** DOES IT GO OVER? Energy, not a threshold: the roll the body is carrying
 * has to be worth the lift from where its centre stands now up to the
 * corner it is turning toward. This is the one question that decides
 * whether a landing taken sideways is a car that lurches and drives on or
 * a car about to spend the next second upside down — and the answer moves
 * with the attitude the body is already at, which is why a car half over
 * goes the rest of the way on far less than it took to get there. */
export function goesOver(roll: number, rollRate: number): boolean {
  if (rollRate === 0) return false;
  const tilt = rollTilt(roll);
  const climb = barrier(tilt, rollRate) - centreHeight(tilt);
  // Nothing to climb is not a car going over — it is a car falling back
  // into the face it is already beside, which is what a body a fraction of
  // a degree off level and settling is doing on every step of every
  // straight. A roll has to CROSS a corner, and where there is no corner
  // between here and the next face there is no roll. A body already past
  // one is the callers' other question (`onItsWheels`), not this one.
  if (climb <= 0) return false;
  return 0.5 * R.inertia * rollRate * rollRate > T.air.gravity * climb;
}

/** WHAT A CONTACT LEAVES OF THE ROLL at this attitude, 0..1, and how far
 * off the ground the corner that would take it still is, m.
 *
 * The body is turning about the corner it came over. When the NEXT corner
 * of the hull reaches the ground it starts turning about that one instead,
 * and the impulse in between is what the exchange costs: angular momentum
 * about the arriving corner is what survives it, so the answer is the two
 * corners' own geometry against `roll.spin` and nothing else.
 *
 * That is why the three faces behave so differently without anybody
 * choosing that they should. It is the SEPARATION of the pair that does
 * the work — a car coming down flat swaps a pivot for one a track's width
 * away and keeps a twelfth of its roll, a flank swaps for one across the
 * body and keeps half, and a car balanced up on a wheel with its sill a
 * hand's breadth above the ground swaps for a corner barely off the one it
 * is already on and keeps nearly all of it. */
function pivotKeep(tilt: number): { keep: number; gap: number } {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  let low = Infinity;
  let next = Infinity;
  let on = CONTACTS[0];
  let arriving = CONTACTS[0];
  for (const point of CONTACTS) {
    const h = point[1] * cos - point[0] * sin;
    if (h < low) {
      next = low;
      arriving = on;
      low = h;
      on = point;
    } else if (h < next) {
      next = h;
      arriving = point;
    }
  }
  // Both as the arms from the corner to the centre of mass.
  const ax = -on[0];
  const ay = B.centreY - on[1];
  const bx = -arriving[0];
  const by = B.centreY - arriving[1];
  const rigid = (R.spin + ax * bx + ay * by) / (R.spin + bx * bx + by * by);
  // ...and a SPRUNG corner arriving hands most of that back rather than
  // taking it: the spring stores the blow and returns it, which is the
  // whole job of a suspension and the reason a car can be rolled at all.
  const keep = arriving[2] ? 1 - (1 - rigid) * (1 - R.sprung) : rigid;
  return { keep: Math.max(0, Math.min(1, keep)), gap: next - low };
}

/** THE CAR IS GOING OVER. Books the roll and says so once — everything
 * about how far it then goes is the stepping below. */
export function beginRoll(car: CarState, events: GameEvent[], stats: RunStats): void {
  if (car.rolling) return;
  car.rolling = true;
  stats.rolls += 1;
  events.push({
    type: "rollover",
    rate: Math.abs(car.rollRate),
    speed: Math.hypot(car.u, car.w),
  });
}

/** A CONTACT OF THE ROLL: the ground arriving at the body, wherever round
 * the turn that happens.
 *
 * EVERY contact comes through here, and it has to. Past about three rad/s
 * the body cannot stay on the ground at all — a car pivoting on its
 * outside wheel at a turn a second is asking two and a half g of the
 * ground, which has one to give — so a fast roll is mostly FLIGHT with
 * contacts in it. A model that only charged for the contacts a body makes
 * while still on the ground would let the fastest rolls, the ones that
 * ought to cost the most, pay nothing at all.
 *
 * What a contact takes out of the ROTATION depends on where round the turn
 * it lands (`pivotKeep`), and on how far the corner that would take the
 * exchange still is from the ground: an arrival with the next corner
 * already down pays the swap in full, one with it a long way up pays none
 * of it, because the ground has met the corner the body was turning about
 * anyway. That is the difference between a roll tapping its way round and
 * a roll stopping dead on the face it puts down.
 *
 * `descent` is the vertical speed the arrival killed, m/s, which is what a
 * body coming down out of a flight adds on top of the roll's own. */
function contact(
  spec: CarSpec,
  car: CarState,
  descent: number,
  rng: Rng,
  events: GameEvent[],
  stats: RunStats,
): void {
  const pivot = pivotKeep(rollTilt(car.roll));
  const reach = Math.max(0, 1 - pivot.gap / R.reach);
  const keep = 1 - (1 - pivot.keep) * reach;
  const before = car.rollRate;
  car.rollRate = before * keep;
  // The TRAVEL it costs is the friction that this blow, and only this
  // blow, can pay for: the arrival presses the body into the ground for as
  // long as it takes to kill the descent, and Coulomb's is the most a
  // normal impulse that size can drag out of the travel sideways. Never
  // the rotational exchange above — that is the pivot swapping ends of a
  // face, a different thing entirely, and charging the travel for it stops
  // a car dead in a single contact.
  const rub = R.grip * descent;
  car.u -= Math.sign(car.u) * Math.min(Math.abs(car.u), rub);
  car.w -= Math.sign(car.w) * Math.min(Math.abs(car.w), rub);
  updateSlip(car);
  if (Math.abs(before) < R.slamAt && descent <= 0) return;
  // How hard it hit, for what it FOLDS: how fast the arriving corner was
  // travelling when it met the ground — the roll the body was CARRYING on
  // the arm it swings that corner round on (`R.slam`), or the descent out
  // of a flight, whichever is the faster arrival.
  //
  // Not the roll the ground took out of it. A body going over fast takes
  // almost nothing out of each tap, because it is already turning about a
  // corner beside the one arriving — so pricing the fold by the exchange
  // made the three-turn rolls, the ones in the air for most of every turn,
  // the CHEAPEST thing a car could do, while a slow flop settling onto its
  // roof paid for every rock. Sheet metal folds at the speed the ground
  // arrives at it; what the exchange decides is how far the car goes on.
  const slam = Math.max(descent, Math.abs(before) * R.slam);
  throwOffAxis(car, slam, rng);
  landingDamage(spec, car, slam, events, stats);
  car.settle = Math.max(car.settle, Math.min(1, slam / T.suspension.settleSlam));
  // A roll grinding itself out taps the ground a dozen times on the way,
  // and a car heard landing a dozen times is a car nobody can hear rolling.
  // The bar is the same one a contact has to clear to be an accident at all
  // rather than a car leaning on something (`collision.scuffSpeed`).
  if (slam > T.collision.scuffSpeed) {
    events.push({ type: "landing", airTime: car.airTime, slam, clean: false });
  }
  car.airTime = 0;
}

/** WHAT THE ARRIVAL DOES TO THE OTHER TWO AXES.
 *
 * The hull the roll turns on is an outline ACROSS the car — a width and a
 * height, no length — so it can say how far the body goes over and nothing
 * about which end of a face gets to the ground first. One end always does,
 * and the body is thrown about its nose-up and its nose-round axes for it.
 * That is the difference between a barrel roll and the thing a car actually
 * does: it corkscrews, it swaps ends, and it comes to rest pointing
 * somewhere nobody chose.
 *
 * The throw is seeded rather than derived, and it has to be: which end
 * arrives first is decided by the ground under the car, a ridge or a rut a
 * hand's breadth across, which is exactly what the terrain field is too
 * coarse to know. Drawn from the run's own RNG, so a stage driven twice
 * rolls twice the same way.
 *
 * The YAW is signed by what the car is already doing. A car does not trip
 * out of a straight line — it is sliding and rotating when its weight goes
 * past its leading wheels — and the arrivals wind that up rather than
 * starting an argument with it. */
function throwOffAxis(car: CarState, slam: number, rng: Rng): void {
  const kick = Math.min(1, slam / R.kickAt);
  if (kick <= 0) return;
  car.pitchRate += (rng.next() - 0.5) * 2 * R.pitchKick * kick;
  const spinning = car.yawRate === 0 ? (rng.next() < 0.5 ? -1 : 1) : Math.sign(car.yawRate);
  const room = Math.max(0, 1 - Math.abs(car.yawRate) / R.yawMax);
  car.yawRate += spinning * rng.next() * R.yawKick * kick * room;
}

/** A FLIGHT that comes down with the car off its wheels. There is nothing
 * for the tyres to do — the flank arrives instead — so the landing is the
 * roll's own contact and the car carries straight on turning over. */
export function landRolled(
  spec: CarSpec,
  car: CarState,
  groundY: number,
  rng: Rng,
  events: GameEvent[],
  stats: RunStats,
): void {
  car.y = groundY + hullStand(rollTilt(car.roll));
  car.airborne = false;
  car.settling = false;
  car.wheelVy = 0;
  car.footVy = 0;
  car.footMean = 0;
  car.foot = 0;
  beginRoll(car, events, stats);
  // The descent is gone into the ground, and it is the roll's contact that
  // decides what is left of the turn — this is the only contact a fast roll
  // gets, because it is in the air for the rest of every turn.
  const descent = Math.max(0, -car.vy);
  car.vy = 0;
  contact(spec, car, descent, rng, events, stats);
}

/** ONE STEP OF A CAR GOING OVER.
 *
 * The roll owns BOTH halves of itself — the body turning on the ground and
 * the body in the air between two contacts — and it has to, because they
 * are the same motion. A rolling body in flight follows a parabola about
 * its own CENTRE OF MASS while it goes on turning underneath it; handing
 * that to the ordinary flight, which flies the wheel plane, has the ground
 * apparently rising and falling with the body's attitude and the car
 * chattering in and out of contact several times a face. So the height
 * tracked through here is the centre's, and the ground it is compared
 * against is `centreHeight` — the same curve everything else in this
 * module is written on.
 *
 * Nothing here is steered or driven: there is no tyre on the ground and
 * the input is not read. What ends it is `car.rolling` going false, at
 * which point either the wheels are back down and the handling model takes
 * the car, or they are not and step.ts sends the run back to its last
 * split board. */
export function stepRolling(
  spec: CarSpec,
  car: CarState,
  ctx: RollGround,
  events: GameEvent[],
  stats: RunStats,
): void {
  const dt = T.dt;
  const tilt = rollTilt(car.roll);
  // Where the weight in the car is, over the ground it is over. Carried in
  // `car.y` (the origin) between steps, which is what the rest of the game
  // reads, and unpacked here through the attitude.
  const was = ctx.groundAt(car.x, car.z);
  let centre = car.y - was + B.centreY * Math.cos(tilt);
  // `airborne` is the roll's own bit for BETWEEN ITS CONTACTS — which is
  // what airborne honestly means for a car going over, and what the camera,
  // the HUD and the effects want to hear. It cannot be read back off the
  // height: a body letting go of its corner separates from the curve by
  // half a gravity times a step squared, a third of a millimetre, and any
  // tolerance coarse enough not to chatter on that is coarse enough to
  // glue it back down for the first several steps of every flight.
  const down = !car.airborne;

  if (down) {
    // GRAVITY along the centre's own curve — downhill toward the face
    // below it, uphill against the corner ahead of it.
    car.rollRate -= (T.air.gravity / R.inertia) * centreSlope(tilt) * dt;
    // ...and THE GROUND DRIVING IT ON. The body is still travelling across
    // itself, so the contact is being dragged, and the drag works on the
    // lever of the centre's own height: sliding to the right rolls the
    // right side down, which is negative roll — the same hand the trip
    // goes over with.
    //
    // It is written as the momentum the friction TAKES OUT OF THE TRAVEL
    // and puts into the body, and that is the whole of why a roll ends. A
    // torque written on the sign of the slide alone is a car that turns
    // over for as long as it is nudged sideways by anything at all — a
    // camber is enough — because nothing it spends comes from anywhere.
    // Here the roll is bought out of the sideways speed, so when that is
    // gone the drive is gone with it, and the bite can never reverse the
    // slide that is paying for it.
    const across = Math.sign(car.w);
    const bite = Math.min(R.grip * T.air.gravity * dt, Math.abs(car.w));
    if (bite > 0) {
      car.w -= across * bite;
      car.rollRate -= (across * bite * centreHeight(tilt)) / R.inertia;
    }
    car.rollRate *= Math.exp(-R.drag * dt);
    // The body grinds along on whatever is down, and it costs the run.
    car.u *= Math.exp(-R.scrub * dt);
    car.w *= Math.exp(-R.scrub * dt);
  }

  const before = car.roll;
  car.roll += car.rollRate * dt;
  const now = rollTilt(car.roll);
  // WHERE THE AXLE IS. A body going over turns about the CORNER of itself
  // that is on the ground, and that corner is a metre out from the middle
  // of the car — so the whole car is carried sideways as it goes over,
  // about two metres per half turn. `car.y` and the rotation alone put the
  // right corner on the ground at every attitude but leave the body
  // turning about a fixed point under its own middle, which is a car
  // holding on to a bar at ground level and spinning round it: the one
  // thing a rolling car never does.
  //
  // How far it walks per radian is exactly how tall the body is standing
  // on that corner — `hullStand`, the same curve the whole module runs on,
  // which is why it is zero for a car sitting flat on its wheels and
  // widest with the car up on a corner. It goes the way the roll takes it:
  // positive roll lifts the right side, so the car is pivoting over its
  // left corner and walking that way. In the air there is no corner and no
  // walk — the body turns about its own centre of mass and nothing else.
  const walk = down ? -hullStand(now) * (car.roll - before) : 0;

  // A FACE ARRIVING while the body is still on the ground: the hull lies
  // flat at every quarter turn, so a roll that has crossed one has just put
  // a side down and the far end of it has met the ground.
  if (down && Math.floor(before / QUARTER) !== Math.floor(car.roll / QUARTER)) {
    contact(spec, car, 0, ctx.rng, events, stats);
  }

  // THE OTHER TWO AXES, which is most of what makes a roll look like an
  // accident. Neither turns the car over — the outline the roll runs on
  // has no length in it, so it cannot — but both are real motion the
  // contacts keep handing the body, and the ground only takes them back
  // while the car is lying ON something.
  car.pitch = clamp(car.pitch + car.pitchRate * dt, -R.pitchMax, R.pitchMax);
  if (down) {
    car.pitchRate *= Math.exp(-R.pitchDamp * dt);
    // ...and the ground pulls the nose level under a body that is lying on
    // a face of itself: a car comes to rest flat on its roof, not tipped up
    // on a corner of it.
    car.pitch -= car.pitch * Math.min(1, R.pitchLevel * dt);
  }
  // The hill still pulls: a car on its roof on a slope goes down the slope.
  car.yawRate *= Math.exp(-R.yawDamp * dt);
  // ...and the ground will not let a body lying on it spin faster than
  // this, whatever it arrived carrying. The ceiling is the same one the
  // arrivals wind up TO: a car dropped into a roll out of a wild spin is
  // still a car grinding round on its panels, and a rate the friction
  // under it cannot hold is a rate the friction takes back.
  if (down && Math.abs(car.yawRate) > R.yawMax) {
    car.yawRate = Math.sign(car.yawRate) * R.yawMax;
  }
  if (down) {
    car.u -= T.air.gravity * ctx.slope * dt;
    if (ctx.slopeLat) car.w -= T.air.gravity * ctx.slopeLat * dt;
  }
  updateSlip(car);
  const delta = car.yawRate * dt;
  car.heading += delta;
  rotateFrame(car, delta);
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  car.x += (sinH * car.u + cosH * car.w) * dt + cosH * walk;
  car.z += (cosH * car.u - sinH * car.w) * dt - sinH * walk;

  // Nothing is standing on the springs, and there is no drift, no spin and
  // no wheelspin to read off a car that has no wheels on the ground. The
  // PITCH is not in this list: it is motion the body has, not a readout of
  // a contact patch, and it is stepped above.
  car.pitchLoad = 0;
  car.ride = 0;
  car.rideRate = 0;
  car.loft = 0;
  car.loftRate = 0;
  car.slide = 0;
  car.drifting = false;
  car.spun = false;
  car.wheelspin = 0;
  car.braking = false;
  car.locked = false;
  car.reversing = false;
  car.weight = 1;

  const seat = centreHeight(now);
  const slope = centreSlope(now);
  if (down) {
    // OFF THE GROUND. Following the outline round the corner asks the
    // centre to fall faster than gravity alone would take it, and the
    // ground has nothing to pull down with — so the contact lets go and
    // the body flies, still turning, at the speed it was going round at.
    // Below about three rad/s that never happens and the car simply grinds
    // its way over; above it, most of every turn is flight.
    const held = seat * car.rollRate * car.rollRate + (T.air.gravity / R.inertia) * slope * slope;
    centre = seat;
    car.vy = slope * car.rollRate;
    car.airborne = held > T.air.gravity;
    car.airTime = 0;
  } else {
    car.vy -= T.air.gravity * dt;
    centre += car.vy * dt;
    car.airTime += dt;
    // A body between contacts is as out of control as any other body in
    // the air, and it takes the same knocks: without them a roll thrown
    // clear of the ground turns at exactly the rate it left with and comes
    // down on the face arithmetic says it must, every time, off the same
    // takeoff.
    car.rollRate += (ctx.rng.next() - 0.5) * 2 * T.air.rollTurbulence * dt;
    car.yawRate += (ctx.rng.next() - 0.5) * 2 * T.air.turbulence * dt;
    car.pitchRate += (ctx.rng.next() - 0.5) * 2 * T.air.pitchTurbulence * dt;
    if (centre <= seat) {
      // ...and comes back to it. ONE contact, at whatever attitude it
      // actually arrived at, which is what `contact` is written to take.
      const descent = Math.max(0, -car.vy);
      centre = seat;
      car.vy = slope * car.rollRate;
      car.airborne = false;
      car.airTime = 0;
      contact(spec, car, descent, ctx.rng, events, stats);
    }
  }
  // Back into the origin the rest of the game reads the car's height from.
  car.y = ctx.groundAt(car.x, car.z) + centre - B.centreY * Math.cos(rollTilt(car.roll));
  car.settling = false;

  // IT IS OVER when the body is lying on a face of itself with no roll
  // left to take it off one — and never on the corner between two, where
  // gravity is still working on it, and never in the air.
  if (car.airborne) return;
  const face = Math.round(now / QUARTER) * QUARTER;
  if (Math.abs(car.rollRate) >= R.rest || Math.abs(now - face) > R.settled) return;
  // ...and not while the nose is still swinging either: a body that has run
  // out of roll on a face can still be pitching hard enough to take itself
  // off it, and handing that car back to the handling model mid-swing is
  // where a roll stops looking like one.
  if (Math.abs(car.pitchRate) >= R.rest) return;
  car.rolling = false;
  car.rollRate = 0;
  car.pitchRate = 0;
  car.pitch = 0;
  // Snapped onto the face, keeping the whole turns the roll accumulated so
  // the ground settles the car to the nearest upright rather than rewinding
  // a rotation it has actually done. What TRAVEL is left is left: a car
  // that rolls once and comes down on its wheels still going is a car that
  // drives on, and the scrub above is the only thing that decides how much
  // of it there is.
  car.roll += face - now;
}
