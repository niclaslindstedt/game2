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
import { landingDamage } from "./collision.ts";
import {
  type Axis,
  type Bed,
  type MassSpread,
  LEVEL,
  bedNormal,
  clearOn,
  goesOverOn,
  gripOn,
  pivotKeep,
  seatOn,
  massSpread,
  seatSlopes,
  standingOn,
  turnedPoints,
} from "./roll-hull.ts";
import {
  rollTilt,
  rotateFrame,
  updateSlip,
  type CarState,
  type GameEvent,
  type RunStats,
} from "./state.ts";

export { WHEEL_BASIN, massSpread, onItsWheels, type MassSpread } from "./roll-hull.ts";

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

/** How high the weight rides above the ORIGIN at an attitude — the piece
 * that turns the surface's height into `car.y` and back. */
function weightOverOrigin(tilt: number, pitch: number): number {
  return seatOn(tilt, pitch) - clearOn(tilt, pitch);
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
  const height = car.y + weightOverOrigin(tilt, pitch);
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

/** THE CAR IS GOING OVER. Books the crash and says so once — everything
 * about how far it then goes is the stepping below. */
export function beginRoll(car: CarState, events: GameEvent[], stats: RunStats): void {
  if (car.rolling) return;
  car.rolling = true;
  car.sliding = false;
  stats.rolls += 1;
  events.push({
    type: "rollover",
    rate: Math.max(Math.abs(car.rollRate), Math.abs(car.pitchRate)),
    speed: Math.hypot(car.u, car.w),
  });
}

/** What is left of a friction impulse's moment once the face under the body
 * has answered as much of it as it can, signed. `hold` is the moment that
 * face can shift its own normal force through before the body has to turn. */
function turnPast(impulse: number, lever: number, hold: number): number {
  const moment = Math.abs(impulse) * lever;
  return moment <= hold ? 0 : Math.sign(impulse) * (moment - hold);
}

/** The impulse that would bring a slipping patch to a common speed with the
 * ground about one axis. The divisor is the effective mass there, which for
 * a body that can both travel and turn is `1 + lever² / inertia`. */
function stopping(slip: number, lever: number, inertia: number): number {
  return Math.abs(slip) / (1 + (lever * lever) / inertia);
}

/** THE GROUND'S ONE FRICTION IMPULSE, spent once and doing EVERY job it can
 * do. This is the centre of the whole module.
 *
 * A body on the ground has one contact patch under it and one Coulomb
 * budget: `grip` times the load, pointing against the way that patch is
 * moving. It acts at the ground rather than through the weight, so it does
 * four things at once, and they are not four charges — they are one force
 * read on the arms it actually has:
 *
 *   - it RETARDS THE TRAVEL, which is the only thing that slows a crashing
 *     car down and therefore the whole of why a crash ends;
 *   - its share ACROSS the car works on the lever of the weight's height and
 *     ROLLS the body (sliding right rolls the right side down, the same hand
 *     a trip goes over with);
 *   - its share ALONG the car works on the same lever and PITCHES it, which
 *     is what takes a car that has landed on its face the rest of the way
 *     over;
 *   - and because the patch is not under the middle of the car — a body up
 *     on a corner, or lying on one end of a face, has it a metre or more
 *     away — the whole vector works on that offset and SPINS the body about
 *     its own vertical.
 *
 * THAT LAST ONE IS THE NEW ONE. A crashing car's yaw used to be a seeded
 * kick that agreed with whichever way the car was already going round, an
 * exponential decay, and a hard ceiling. Nothing ever TORQUED it, so a spin
 * could not answer to how fast the car was going, could not be checked by
 * the ground, and could not change hand however the car was actually
 * sliding — the same defect the roll had, on the axis the player watches
 * most. Now the ground decides it every step, from where the car is touching
 * and which way that patch is moving.
 *
 * `swept` says whether the patch is being carried by the body's own rotation
 * as well as by the car. A body already grinding is translated by `walk` —
 * the origin moving as it pivots over the corner it stands on — and that is
 * exactly the sweep its rotation puts under it, so its patch moves at the
 * car's own travel. A body ARRIVING OUT OF A FLIGHT has had no walk: it was
 * turning about its own weight with nothing underneath, so its corner sweeps
 * at `rate × the weight's height` on top of the travel.
 *
 * `budget` is m/s of velocity change the normal load can pay for: `grip × g ×
 * dt` for a body grinding along, `grip × descent` for one arriving. */
function rubGround(
  car: CarState,
  normal: number,
  tilt: number,
  pitch: number,
  bed: Bed,
  mass: MassSpread,
  swept: boolean,
): void {
  const budget = gripOn(tilt, pitch, bed) * normal;
  if (budget <= 0) return;
  const patch = standingOn(tilt, pitch, bed);
  const lever = patch.height;
  const spin = swept ? lever : 0;
  // Where the patch is actually going: the car's travel, plus what the
  // body's own rotation is sweeping it at — in ALL THREE planes. The two
  // that turn the body over sweep the patch on the lever of the weight's
  // height; the SPIN sweeps it on the patch's own offset in the ground
  // plane, which is the arm the same friction turns the body about below.
  const slipW = car.w + car.rollRate * spin + car.yawRate * patch.along;
  const slipU = car.u + car.pitchRate * spin - car.yawRate * patch.across;
  if (Math.hypot(slipU, slipW) <= 0) return;

  // WHAT IT TAKES OUT OF THE TRAVEL: one impulse opposing the way the car is
  // going, never more than the car has. This half may only ever SLOW THE
  // BODY DOWN — a normal impulse cannot hand a car speed — and that is not a
  // detail. Sizing it off the patch's sweep instead pushes a stopped car
  // sideways whenever it happens to be rocking, the grind turns that back
  // into rotation, and the pump sustains itself: a car that had come to a
  // complete halt at 2.5 s sat rocking on its sill until 6, three and a half
  // seconds of `0KM/H DOWN ROLLING` in the lab's own frames.
  const speed = Math.hypot(car.u, car.w);
  if (speed > 0) {
    const rub = Math.min(speed, budget);
    car.u -= (car.u / speed) * rub;
    car.w -= (car.w / speed) * rub;
  }

  // ...AND WHICH WAY IT TURNS THE BODY, which is a different question with a
  // different answer, because the ground meets the PATCH and not the car.
  // Reading the plain travel here is why a crash's direction was a property
  // of the trip that started it and of nothing afterwards.
  //
  // Each moment is capped at the impulse that would bring the patch to a
  // common speed with the ground on that axis: friction stops a slip, it
  // does not drive one the other way, and without the cap a torque goes on
  // adding rotation after the sliding that paid for it has ended — energy
  // made out of a car the ground is supposed to be stopping. Eight rad/s
  // became twenty inside a second, the surface then "moved" at twenty metres
  // a second, that became real vertical speed, and the car was fired off the
  // ground and never came back.
  const across = -Math.sign(slipW) * Math.min(budget, stopping(slipW, lever, mass.over.roll));
  const along = -Math.sign(slipU) * Math.min(budget, stopping(slipU, lever, mass.over.pitch));
  // ...AND WHAT THE FACE UNDER IT ANSWERS FIRST. A body lying flat is not
  // standing on a point: the normal force shifts WITHIN the face it is on to
  // meet a moment, and only what is left over turns the body. The face can
  // answer `normal × its own reach` — two metres of roof against a friction
  // moment of `friction × the weight's height`, which is half a metre — so a
  // car sliding squarely on its roof tracks straight, and one up on a corner,
  // where the reach is nothing, does not.
  //
  // Without it every long slide ended in an end-over-end: the friction under
  // a car doing 28 m/s torques its nose down every step, nothing resisted it
  // until the body had already pitched off the face, and a plain sideways
  // trip finished at 178° of pitch having tumbled the length of the car.
  car.rollRate += turnPast(across, lever, normal * patch.spanAcross) / mass.over.roll;
  car.pitchRate += turnPast(along, lever, normal * patch.spanAlong) / mass.over.pitch;
  // THE SPIN, on the arm the patch has in the ground plane. A patch a metre
  // ahead of the weight with the car sliding sideways swings the tail round;
  // one out at a corner does it hardest. A body flat and square on a face
  // has no arm and gets no spin, which is why a car sliding squarely on its
  // roof tracks straight and one up on a corner does not.
  car.yawRate += (patch.along * across - patch.across * along) / mass.yaw;
  updateSlip(car);
}

/** A CONTACT OF THE CRASH: the ground arriving at the body, wherever round
 * either turn that happens.
 *
 * EVERY contact comes through here, and it has to. Past about three rad/s the
 * body cannot stay on the ground at all — a car pivoting on its outside wheel
 * at a turn a second is asking two and a half g of the ground, which has one
 * to give — so a fast crash is mostly FLIGHT with contacts in it. A model
 * that only charged for the contacts a body makes while still on the ground
 * would let the fastest rolls, the ones that ought to cost the most, pay
 * nothing at all.
 *
 * `axis` is WHICH PLANE arrived. What the contact takes out of that rotation
 * depends on where round the turn it lands (`pivotKeep`), and on how far the
 * corner that would take the exchange still is from the ground: an arrival
 * with the next corner already down pays the swap in full, one with it a long
 * way up pays none of it, because the ground has met the corner the body was
 * turning about anyway. That is the difference between a crash tapping its
 * way round and one stopping dead on the face it puts down. */
function contact(
  axis: Axis,
  spec: CarSpec,
  car: CarState,
  descent: number,
  tilt: number,
  pitch: number,
  bed: Bed,
  mass: MassSpread,
  events: GameEvent[],
  stats: RunStats,
): void {
  // What the body had before the ground got to it — the other end of this
  // is a few lines down, and the difference is the whole of what the
  // contact cost, rotation and travel together.
  const had = crashEnergy(car, mass);
  const pivot = pivotKeep(axis, tilt, pitch, mass, bed);
  const reach = Math.max(0, 1 - pivot.gap / R.reach);
  const keep = 1 - (1 - pivot.keep) * reach;
  const before = axis === "roll" ? car.rollRate : car.pitchRate;
  if (axis === "roll") car.rollRate = before * keep;
  else car.pitchRate = before * keep;
  // ...and WHAT ARRIVES decides whether the ground drags at all. A panel
  // meeting it is sheet metal on gravel and slides for the whole of it; a
  // WHEEL arriving is a tyre, and a tyre ROLLS — it takes the blow through
  // the spring and hands it back, which is the same argument `pivotKeep`
  // already makes about the rotation, made about the travel. A crash passes
  // through upright once a turn, and that arrival was once charged a full
  // sliding stop off the whole normal impulse: a car carrying 37 km/h into
  // the second turn came out at 3 km/h, on its wheels, having touched
  // nothing at all.
  const drag = pivot.sprung ? 1 - R.sprung : 1;
  rubGround(car, descent * drag, tilt, pitch, bed, mass, true);
  if (Math.abs(before) < R.slamAt && descent <= 0) return;
  // How hard it hit, for what it FOLDS: how fast the arriving corner was
  // travelling when it met the ground — the rotation the body was CARRYING on
  // the arm it swings that corner round on (`R.slam`), or the descent out of
  // a flight, whichever is the faster arrival. Not the rotation the ground
  // took out of it: a body going over fast takes almost nothing out of each
  // tap, because it is already turning about a corner beside the one
  // arriving, so pricing the fold by the exchange made the three-turn rolls
  // the CHEAPEST thing a car could do.
  const slam = Math.max(descent, Math.abs(before) * R.slam);
  landingDamage(spec, car, slam, events, stats);
  car.settle = Math.max(car.settle, Math.min(1, slam / T.suspension.settleSlam));
  // A crash grinding itself out taps the ground a dozen times on the way, and
  // a car heard landing a dozen times is a car nobody can hear rolling. The
  // bar is the same one a contact has to clear to be an accident at all
  // rather than a car leaning on something (`collision.scuffSpeed`).
  if (slam > T.collision.scuffSpeed) {
    // WHAT THE GROUND HAD TO SWALLOW, J per kg — which is not the same
    // question as how hard the corner arrived, and is the number the gravel
    // and the dust come off. Two halves, and both are needed:
    //
    //   THE ARRIVING CORNER's own, `slam²/2` — the energy the contact patch
    //   itself has to put into the ground, and the same quantity a car that
    //   lands on its WHEELS reports, so both kinds of arrival are on one
    //   scale and the effects never have to know which they are drawing.
    //   The ledger alone cannot see it: most of a fast roll's contacts are
    //   glancing taps that keep nearly all their rotation (`pivotKeep`
    //   swaps for a corner barely off the one it is on), so the body's
    //   TOTAL barely moves while a corner is ploughing into the ground at
    //   ten metres a second. Measured that way a trip's thirty-nine
    //   contacts each read a third of a joule and threw no gravel at all;
    //
    //   and THE LEDGER's own drop on top, which is the rotation the pivot
    //   exchange really did take plus whatever the rub took out of the
    //   travel. That is the half a speed cannot see, and it is what makes a
    //   contact that arrives gently but stops a whole rollover throw like
    //   the accident it is rather than like a car settling on its springs.
    const took = 0.5 * slam * slam + Math.max(0, had - crashEnergy(car, mass));
    events.push({ type: "landing", airTime: car.airTime, slam, took, clean: false });
  }
  car.airTime = 0;
}

/** WHICH PLANE A CONTACT BELONGS TO: the one the body is turning faster in is
 * the one whose corner is coming down. */
function arriving(car: CarState): Axis {
  return Math.abs(car.pitchRate) > Math.abs(car.rollRate) ? "pitch" : "roll";
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
 * Nothing here is steered or driven: there is no tyre on the ground and the
 * input is not read. What ends it is `car.rolling` going false, at which
 * point either the tyres are back down and the handling model takes the car —
 * leaning or not — or they are not, and step.ts sends the run back to its
 * last split board. */
export function stepRolling(
  spec: CarSpec,
  car: CarState,
  ctx: RollGround,
  events: GameEvent[],
  stats: RunStats,
): void {
  const dt = T.dt;
  const bed = rollBed(ctx);
  const mass = massSpread(spec.mass);
  const tilt = rollTilt(car.roll);
  const pitch = rollTilt(car.pitch);
  // Where the weight is, over the ground it is over. Carried in `car.y` (the
  // origin) between steps, which is what the rest of the game reads, and
  // unpacked here through the attitude.
  const was = rollSeat(car, ctx);
  let centre = car.y - was + weightOverOrigin(tilt, pitch);
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
    rubGround(car, T.air.gravity * dt, tilt, pitch, bed, mass, false);
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
  car.braking = false;
  car.locked = false;
  car.reversing = false;
  car.weight = 1;

  const seat = seatOn(nowR, nowP, bed);
  const slopes = seatSlopes(nowR, nowP, bed);
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
    centre = seat;
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
    if (centre <= seat) {
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
      const closing = Math.max(0, seatVy - car.vy);
      const descent = Math.min(closing, T.air.gravity * car.airTime);
      centre = seat;
      car.vy = seatVy;
      car.airborne = false;
      car.airTime = 0;
      contact(arriving(car), spec, car, descent, nowR, nowP, bed, mass, events, stats);
    }
  }
  // Back into the origin the rest of the game reads the car's height from.
  car.y = rollSeat(car, ctx) + centre - weightOverOrigin(nowR, nowP);
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
