// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE GROUND DOES TO A CAR THAT IS GOING OVER — every force at the
// contact patch, and the one place they are turned into rotation.
//
// A body on the ground has ONE contact patch under it and one Coulomb
// budget: `grip` times the load, pointing against the way that patch is
// moving. Because it acts at the ground rather than through the weight it
// does four jobs at once — it retards the travel, rolls the body, pitches
// it, and spins it about its own vertical — and those are not four charges.
// They are one force read on the arms it actually has.
//
// The driver's tyres are a second force at that same patch, which is why
// they are here too and not somewhere else: they come OUT of the ground's
// budget rather than beside it, and `turnAt` is the single place either of
// them becomes rotation, so the two can never disagree about the geometry.
//
// `roll.ts` owns the step this is called from; `roll-hull.ts` owns the shape
// the patch is read off.

import { TUNING } from "./defs/tuning.ts";
import type { CarSpec } from "./defs/cars.ts";
import type { Surface } from "../mapgen/index.ts";
import { landingDamage } from "./collision.ts";
import { crashEnergy } from "./roll-ledger.ts";
import { foldSpeed, landingFace } from "./structure.ts";
import {
  type Axis,
  type Bed,
  type MassSpread,
  type Patch,
  type Slopes,
  gripOn,
  pivotKeep,
  seatSlopes,
  standingOn,
  tyreShare,
} from "./roll-hull.ts";
import {
  updateSlip,
  type CarInput,
  type CarState,
  type GameEvent,
  type RunStats,
} from "./state.ts";

const T = TUNING;
const R = TUNING.air.roll;
const DR = TUNING.air.roll.driver;

/** WHAT THE GROUND UNDER A CRASH IS MADE OF — the two ways a surface that
 * is not steel enters the contact. `give` is the share of an arrival the
 * ground takes as its own deformation (a furrow, a corner sunk into sand):
 * arrival that neither turns the body nor folds the shell. `plough` is the
 * friction dragging that furrow costs, over the shell's own coefficient. */
export type Ground = { readonly give: number; readonly plough: number };

/** A surface that does neither: what a contact is resolved against when
 * nobody said what the ground was, and what the bench tests stand on. */
export const RIGID: Ground = { give: 0, plough: 0 };

/** ...and what a stage's surface is worth, read off `TUNING.surfaces`. */
export function groundOf(surface?: Surface | "nature"): Ground {
  if (!surface) return RIGID;
  return { give: T.surfaces.give[surface], plough: T.surfaces.plough[surface] };
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
 * dt` for a body grinding along, `grip × descent` for one arriving.
 *
 * `plough` is what the GROUND adds to the shell's coefficient — a sill
 * dragging a furrow through soil — and it is added for the share of the
 * patch that is shell rather than tyre, because a tyre rolls over what a
 * panel ploughs. */
export function rubGround(
  car: CarState,
  normal: number,
  tilt: number,
  pitch: number,
  bed: Bed,
  mass: MassSpread,
  swept: boolean,
  plough = 0,
): void {
  const shell = 1 - tyreShare(tilt, pitch, bed);
  const budget = (gripOn(tilt, pitch, bed) + plough * shell) * normal;
  if (budget <= 0) return;
  const patch = standingOn(tilt, pitch, bed, mass.weight);
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
  turnAt(car, patch, normal, mass, along, across);
  updateSlip(car);
}

/** WHAT AN IN-PLANE FORCE AT THE CONTACT PATCH DOES TO THE BODY'S THREE
 * ROTATIONS. The ground's friction is one such force and the driver's tyres
 * are another; they act at the same place, on the same arms, and are turned
 * into rotation here once so the two can never disagree about the geometry.
 *
 * `along` and `across` are the impulse in the car's own axes, m/s.
 *
 * THE FACE UNDER IT ANSWERS FIRST. A body lying flat is not standing on a
 * point: the normal force shifts WITHIN the face it is on to meet a moment,
 * and only what is left over turns the body. The face can answer `normal ×
 * its own reach` — two metres of roof against a moment of `force × the
 * weight's height`, which is half a metre — so a car sliding squarely on its
 * roof tracks straight, and one up on a corner, where the reach is nothing,
 * does not. Without it every long slide ended in an end-over-end: the
 * friction under a car doing 28 m/s torques its nose down every step, nothing
 * resisted it until the body had already pitched off the face, and a plain
 * sideways trip finished at 178° of pitch having tumbled the length of the
 * car.
 *
 * THE SPIN is on the arm the patch has in the ground plane. A patch a metre
 * ahead of the weight with the car sliding sideways swings the tail round;
 * one out at a corner does it hardest. A body flat and square on a face has
 * no arm and gets no spin, which is the same reason it tracks straight. */
function turnAt(
  car: CarState,
  patch: Patch,
  normal: number,
  mass: MassSpread,
  along: number,
  across: number,
): void {
  const lever = patch.height;
  car.rollRate += turnPast(across, lever, normal * patch.spanAcross) / mass.over.roll;
  car.pitchRate += turnPast(along, lever, normal * patch.spanAlong) / mass.over.pitch;
  car.yawRate += (patch.along * across - patch.across * along) / mass.yaw;
}

/** THE DRIVER, STILL DRIVING — the pedals and the wheel, spent through
 * whatever of the car is still standing on rubber.
 *
 * A crash used to be a cutscene the player was sat inside: `stepRolling` read
 * no input at all, so the most retrievable moment in any accident — two
 * wheels down, the body balanced, everything still to play for — was the one
 * moment nothing they pressed could matter. It is the same argument
 * `leanTorque` already makes for a car the roll has handed back, made one
 * step earlier, and it needs no new mechanism: the tyres are either on the
 * ground or they are not, and `tyreShare` says which.
 *
 * ONE PATCH, ONE BUDGET, and that is the trap this function is written
 * around. The three asks are summed as a vector and clamped to a friction
 * circle, because a tyre has one budget whether it is being asked to stop the
 * car, turn it or drive it — but the ground's own drag is spending that same
 * budget, and letting both have all of it is the same double charge on a
 * different axis. So this runs FIRST and reports back what fraction of the
 * patch it took: the driver points the tyre, and `rubGround` drags with what
 * is left. Left uncapped, a lock-to-lock input bought a lateral force the
 * ground then reacted to in full, and steering either way tripped the car.
 *
 * `normal` is the m/s of velocity change the load can pay for this step, the
 * same figure `rubGround` is handed. Returns the share of the PATCH's own
 * budget that went on the driver, 0..1 — which is what the ground is then
 * short by, and is not the same fraction as the load, because the driver
 * spends the tyres' coefficient where the ground spends the face's. */
export function driveRolling(
  car: CarState,
  input: CarInput,
  normal: number,
  tilt: number,
  pitch: number,
  bed: Bed,
  mass: MassSpread,
): number {
  const share = tyreShare(tilt, pitch, bed);
  if (share <= 0) return 0;
  // THE BRAKE ACTS AGAINST THE TRAVEL, and during a crash the travel is not
  // where the nose is pointing: a car going over sideways at 20 m/s braked
  // along its own heading would be steered by its brake pedal.
  const speed = Math.hypot(car.u, car.w);
  const dirU = speed > 0 ? car.u / speed : 0;
  const dirW = speed > 0 ? car.w / speed : 0;
  const stop = Math.max(input.brake, input.handbrake ? 1 : 0) * DR.brake;
  const ask = {
    along: input.throttle * DR.power - dirU * stop,
    across: input.steer * DR.steer - dirW * stop,
  };
  const want = Math.hypot(ask.along, ask.across);
  if (want <= 0) return 0;
  // The demand, clamped to the friction circle and then sized by the tyres'
  // own coefficient and by how much of the car is standing on them — and
  // never more than the whole patch, which is all there is to spend.
  const patch = gripOn(tilt, pitch, bed) * normal;
  if (patch <= 0) return 0;
  const mine = Math.min(Math.min(1, want) * R.faceGrip.wheels * share * normal, patch);
  const spend = mine / want;
  let dU = ask.along * spend;
  let dW = ask.across * spend;
  // ...and a pedal cannot push a car backwards. Whatever of the impulse
  // opposes the travel is capped at bringing it to a stop, the same cap the
  // ground's own rub takes, and the impulse is scaled whole so that the
  // clamp cannot quietly rotate it into a direction nobody asked for.
  const against = -(dU * dirU + dW * dirW);
  if (against > speed) {
    const keep = speed / against;
    dU *= keep;
    dW *= keep;
  }
  car.u += dU;
  car.w += dW;
  // ONLY THE ENGINE MAY ADD SPEED, and the throttle's own share of the patch
  // is the whole of what it may add. The steering and the brake REDIRECT and
  // RETARD: a lateral force that also grew the travel would be a tyre doing
  // work with nothing behind it, which is the one thing this module has never
  // let anything do. Applied to the pair together, so the cap turns the
  // velocity rather than deleting the steering's half of it.
  const powered = speed + Math.max(0, input.throttle) * DR.power * spend;
  const now = Math.hypot(car.u, car.w);
  if (now > powered) {
    const keep = powered / now;
    car.u *= keep;
    car.w *= keep;
  }
  turnAt(car, standingOn(tilt, pitch, bed, mass.weight), normal, mass, dU, dW);
  updateSlip(car);
  return mine / patch;
}

/** NEWTON'S THIRD LAW AT THE CORNER THAT ARRIVED — the reaction, and the
 * only thing in the module that lets the ground change what a crash IS
 * rather than merely how fast it is running out.
 *
 * The ground stops the patch. The rest of the body does not stop, and the
 * impulse that arrested it acted an arm's length from the weight — so it
 * TURNS the car, in both planes at once, by exactly as much as those arms
 * are long. That is what makes WHICH PART lands matter. A body coming down
 * square on a flank has its patch under its own weight, and the arrival
 * changes nothing about where the crash is going; the same body catching a
 * NOSE corner has a metre and a half of lever on the same impulse and is
 * pitched out of the plane it was rolling in by it.
 *
 * Without it the ground could only ever take SPEED out of a crash. Every
 * accident ran out along the plane it started in — a barrel roll stayed a
 * barrel roll, an end-over-end stayed an end-over-end — and the thing a
 * rollover is famous for, the change of hand halfway through when a corner
 * digs in, could not happen at all, because nothing anywhere in the model
 * carried a torque from one axis to the other. `pivotKeep` is the ROTATION's
 * own arrival and works in one plane by construction; this is the FALL's,
 * and the fall does not know what plane the body was turning in.
 *
 * IT CANNOT MAKE ROTATION OUT OF NOTHING, which is the rule this module is
 * built on. `descent` is already the patch's own closing speed net of the
 * rotation sweeping it (`stepRolling` subtracts the surface's own motion and
 * caps what is left at what gravity could have added), so this is a strictly
 * inelastic normal impulse against a real approach: `j` is that closing over
 * the body's effective mass at the patch — one for the translation and one
 * for each arm — and the rotational energy it hands over is at most a
 * quarter of the fall it takes away, for any arm whatever. It is exactly
 * zero for a body arriving flat and square, which is the body with no arm to
 * be turned about.
 *
 * IT IS THE SAME CONSTRAINT GRAVITY IS WRITTEN ON, one step of it. The
 * surface the body is lying on is `seatOn` — how high the weight has to be
 * for the box to rest on the plane at this attitude — and `seatSlopes` is
 * its gradient, which is what gravity is already resolved along
 * (`stepRolling`) and what the seat's own speed under a turning body is
 * already read off. So the reaction is resolved along it too, rather than
 * along a corner's offset measured a second way: the two would then be free
 * to disagree about which way the body falls, and the one thing this module
 * cannot afford is two accounts of the same geometry.
 *
 * `arrival` is how fast the weight is closing on that surface, already net
 * of the rotation carrying the surface up to meet it and of whatever the
 * ground itself gave. `fold` is the asymptote the FACE that arrived passes
 * on (`structure.foldSpeed`): a crumple zone's, a door's, or the cage's. */
function slamTurn(
  car: CarState,
  slopes: Slopes,
  mass: MassSpread,
  arrival: number,
  fold: number,
): void {
  if (arrival <= 0) return;
  // WHAT THE SHELL PASSED ON, rather than folding — a structure collapses at
  // a roughly fixed force, so what reaches the body saturates however hard
  // the corner came down. The rest is the fold, which the damage ledger
  // books in the same breath a few lines below.
  const impulse = (arrival * fold) / (fold + arrival);
  const share =
    1 +
    (slopes.roll * slopes.roll) / mass.spin.roll +
    (slopes.pitch * slopes.pitch) / mass.spin.pitch;
  const j = impulse / share;
  car.rollRate -= (slopes.roll * j) / mass.spin.roll;
  car.pitchRate -= (slopes.pitch * j) / mass.spin.pitch;
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
 * way round and one stopping dead on the face it puts down.
 *
 * `ground` is what the car came down ON. The ground's own give comes off
 * the arrival before the shell is asked what it folds and the body what it
 * turns by — a corner sunk into sand turned nothing and dented nothing. The
 * normal impulse itself is whole either way: the descent was arrested, in
 * the furrow or on the panel, and the momentum does not care which. Its
 * plough is NOT here: a furrow is dragged over the grind, not struck at the
 * arrival, so it belongs to the grounded step's rub (`stepRolling`) — and
 * an arrival's budget is already `grip × descent`, large enough that a
 * coefficient added on top of it overspent the patch (the travel rub and
 * each rotation's cap are taken separately) and read as energy made at the
 * touchdown. */
export function contact(
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
  ground: Ground = RIGID,
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
  // WHAT THE GROUND TOOK FIRST. Soil furrows and sand swallows a corner, and
  // that share of the arrival reaches neither the body nor the shell.
  const held = 1 - ground.give;
  // THE REACTION FIRST, then the friction it pays for. They are one arrival
  // and the order between them is a step's worth of arithmetic, but the
  // normal impulse is the larger of the two and the rub reads the rates it
  // leaves — so the drag under a corner that has just been kicked into a new
  // plane is the drag of the body that is actually there. The reaction is
  // the FACE's: what a crumple zone passes on and what the cage passes on
  // are different things, and a face already folded to its cap is the cage.
  const fold = foldSpeed(spec, car.damage, landingFace(tilt));
  slamTurn(car, seatSlopes(tilt, pitch, bed, mass.weight), mass, descent * drag * held, fold);
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
  // ...and the shell folds around what the ground did not take. The settle
  // and the burst below read the whole slam: a corner sunk into a furrow
  // is a corner that threw the most ground of all.
  landingDamage(spec, car, slam * held, events, stats);
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
export function arriving(car: CarState): Axis {
  return Math.abs(car.pitchRate) > Math.abs(car.rollRate) ? "pitch" : "roll";
}
