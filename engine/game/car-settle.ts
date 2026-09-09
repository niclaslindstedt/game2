// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE BODY ENDS UP once the step has decided what the car is doing.
// The yaw and the longitudinal are `car.ts`'s; everything after them is
// here: the tyres REDIRECTING the velocity rather than braking it, the
// attitude the ground under the four wheels puts the body at, the lean the
// driver has some authority over, the drift readout the HUD reads, the
// move itself, the suspension it lands on, and the driven wheels' own
// speed.
//
// It is the tail of one step, split out because it is a different subject
// from the slide: nothing here decides anything, it settles.

// other two moments: the jump (the lip throws you, the air is committed —
// velocity is fixed, the nose barely answers) and the landing (aligned
// keeps your speed, sideways scrubs it and wobbles). Under all three the
// SPRINGS carry the body: the wheels track the ground exactly, the body
// lags them, and every dip, landing and bank is a jolt it squats through
// and rebounds out of — the car's weight, made visible. Numbers live in
// defs/, not here.

import { clamp } from "../lib/math.ts";
import { latCeiling } from "./limits.ts";
import { damageEffects } from "./damage.ts";
import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import {
  rollTilt,
  updateSlip,
  type CarInput,
  type CarState,
  type GameEvent,
  type RunStats,
} from "./state.ts";
import { settlePitch, stepSuspension } from "./body.ts";
import { landingDamage } from "./collision.ts";
import { readDrift } from "./drift.ts";
import { settleWheelspin, wheelspinShare } from "./drivetrain.ts";
import { rideGround } from "./flight.ts";
import { groundJolt, type GroundContext } from "./ground.ts";
import {
  beginRoll,
  goesOver,
  goesOverEnd,
  leanTorque,
  massSpread,
  onItsWheels,
  rollBed,
} from "./roll.ts";

export { clutchDump, spinHeadroom } from "./drivetrain.ts";
export { launch, stepAirborne } from "./flight.ts";
export { tyreLoad } from "./body.ts";
export type { GroundContext } from "./ground.ts";

const T = TUNING;
/** The drift group, used on nearly every line below. */
const D = TUNING.drift;

export function settleBody(
  spec: CarSpec,
  car: CarState,
  input: CarInput,
  ctx: GroundContext,
  events: GameEvent[],
  step: {
    dt: number;
    prevVy: number;
    prevWheelVy: number;
    prevU: number;
    surfaceGrip: number;
    hurt: ReturnType<typeof damageEffects>;
    driveBite: number;
    breakaway: number;
    hold: number;
    lever: number;
    open: number;
    shiftCut: number;
    sliding: number;
    spun: number;
    steer: number;
    stats: RunStats;
  },
): void {
  const { dt, prevVy, prevWheelVy, prevU, surfaceGrip, hurt } = step;
  const { driveBite, breakaway, hold, lever, open, shiftCut, sliding, spun, steer, stats } = step;
  // ── Lateral grip: the tires REDIRECT the car, they do not brake it ────────
  // The velocity swings back in behind the nose at `latRate` while its
  // MAGNITUDE is kept — a corner taken sideways comes out at pace, which is
  // the whole point. Only the fraction a sliding tire really burns off is
  // lost, and it scales with sin²(slip), so ordinary cornering costs
  // nothing at all. Weight transfer is the player's tool against running
  // wide: staying on the power keeps the rear loose, lifting tightens the
  // line — and the bot breathes the throttle the same way.
  // Across the grade (off-road): a hillside pulls the car toward its
  // downhill side. Applied HERE, with the slip refreshed, so the redirect
  // below sees the deflection and the tires get to fight it — a gentle
  // slope is a lean, a steep one a slide, and the ground answers back
  // instead of reading as a tilted carpet. (Before the slip update the
  // redirect would rebuild `w` from the stale angle and erase the pull.)
  if (ctx.slopeLat) {
    car.w -= 9.8 * T.hills.gravityAlong * ctx.slopeLat * dt;
    updateSlip(car);
  }
  const lift = 1 + T.grip.liftGrip * (1 - input.throttle) * sliding;
  // The lever comes in through the speed floor like everything else that
  // takes the rear away: under it the handbrake stops the car and does not
  // unstick it, so a yank at 40 km/h is a brake and nothing more.
  // The lever locks the REAR wheels — the fronts keep rolling and keep
  // steering, so what the car loses is its tail, not its ability to change
  // direction. `handbrakeLat` is what the redirect keeps for that reason,
  // and it sits well above `handbrakeGrip` (which is the rear letting go,
  // up at the slide threshold): cut the two together and the car pivots
  // beautifully while carrying straight on past the apex, which is the one
  // thing the lever is supposed to be for.
  const leverLat = 1 + (T.grip.handbrakeLat - 1) * open * lever;
  // Bent arms, a twisted shell that moves the geometry under load, and the
  // downforce of a wing that is no longer on the car — all three through
  // `hurt.grip`, floored so they can never stack into an unpointable car.
  const grip = surfaceGrip * lift * leverLat * hurt.grip;
  // THE HANDS ARE WHAT RE-GRIP THE CAR. Sideways, the front tires are as
  // crossed up as the body is: pointed nowhere near where the car is going,
  // they have almost nothing to pull against, and it is LOCK — either way,
  // the held corner or the catch — that aims them back along the travel and
  // lets them bite. So the redirect keeps its full rate wherever the wheel
  // is asking for something, and fades to `1 - tailFade` only where a
  // centred wheel meets a real slip angle.
  //
  // That one gate is what makes the exit belong to the driver. Without it,
  // dropping the wheel mid-slide let the tires eat the car's whole sideways
  // momentum on their own: the velocity swung thirty degrees back in behind
  // the nose after the hands came off, so the slide finished the corner by
  // itself and handed the car back straight, on the road, faster than it
  // went in. Now letting go leaves the car going where it was already
  // going — out toward the outside of the road, aimed off the line — and
  // steering is what tips it back into the middle.
  //
  // The angle is sized in the surface's own breakaway, for the same reason
  // `askedSlip` is: a sealed road's whole slip vocabulary is a few degrees
  // wide, and a fade sized for gravel would never reach it.
  const tailAt = clamp(
    (Math.abs(car.slip) - T.grip.tailPeak * breakaway) / (T.grip.tailBand * breakaway),
    0,
    1,
  );
  // Through the speed floor like everything else that keeps a car sideways:
  // under it the wheel steers the car and that is all it does, so a slow
  // scrabble out of a ditch cannot use a centred wheel to go on sliding.
  // ...and a SPUN car has given the lock's exemption up: the fade above is
  // held off by a wheel that still has something to pull against, and past
  // `spinAt` it has not. So the fade arrives in full however much lock is
  // wound on, which is what makes a spin a thing the car does rather than
  // a thing the driver is doing.
  const crossed = Math.max(tailAt * tailAt * (3 - 2 * tailAt) * (1 - Math.abs(steer)), spun) * open;
  const tail = 1 - T.grip.tailFade * crossed;
  const latRate = (spec.gripLat + (spec.driftLat - spec.gripLat) * sliding) * grip * tail;
  // THE TRACTION CEILING. The redirect is a RATE, and a rate times a speed
  // is a force the tires have to find: unbounded, the car pulls whatever
  // lateral acceleration the geometry asks for, which is how it ends up
  // carrying a hairpin's radius at a straight's speed. Capped at what the
  // tires hold, speed costs radius instead — the line a car can hold flat
  // out grows as u², so a sweeper is a drift at pace and a hairpin has to be
  // braked for. Past the ceiling the velocity stops catching the nose up and
  // the car runs WIDE at a bigger angle, which is the point of a drift.
  // It saturates rather than clipping, because a hard min() is a cliff: one
  // notch of lock either side of it would separate a gripped car from a
  // sideways one. `tanh` rolls off the way a tire does, and `latGive` is the
  // bite it never loses — without that residual slope the angle runs away
  // the instant the demand touches the ceiling, since nothing but slip is
  // left to answer more lock with.
  const travel = Math.hypot(car.u, car.w);
  const ceiling = latCeiling(spec, grip);
  const demanded = travel * latRate * Math.abs(car.slip);
  const over = demanded / ceiling;
  const held = ceiling * (T.grip.latGive * over + (1 - T.grip.latGive) * Math.tanh(over));
  // ...and a spun tyre has let go of most of it (`drift.spinHold`).
  const heldRate = (demanded > 1e-6 ? (latRate * held) / demanded : latRate) * hold;
  if (car.u > 1) {
    const swung = car.slip * Math.exp(-heldRate * dt);
    // `travel` is this same speed: nothing between there and here moves the
    // car, and the magnitude is what the redirect keeps.
    // ...and a spun car scrubs far harder: sin² is the price of dragging a
    // tire sideways, and four of them dragged fully sideways is the most
    // effective brake in the game. It is why a spin costs a run so much more
    // than the corner it happened in.
    // ...and a car sideways with its rear wheels DRAGGED scrubs harder than
    // one sideways on rolling tyres. It is the other half of what the lever
    // costs — the half that is paid in the corner rather than on the way in
    // — and it is what makes a hairpin taken on the handbrake a corner the
    // driver has to get back on the throttle out of.
    const dragged = 1 + (T.grip.handbrakeScrub - 1) * lever;
    const scrub = T.grip.scrub * (spun ? D.spinScrub : dragged);
    const kept = travel * Math.exp(-scrub * Math.sin(car.slip) ** 2 * dt);
    car.u = kept * Math.cos(swung);
    car.w = kept * Math.sin(swung);
  } else {
    car.w *= Math.exp(-heldRate * dt);
  }
  updateSlip(car);

  // ── Attitude: the body sits on the ground it is standing on ─────────────
  // The wheels are what the car's attitude is made of, so both angles come
  // from the ground under them and neither feeds back into the handling.
  // Roll unwinds whatever the last flight left toward the NEAREST upright —
  // a car most of the way over finishes the roll instead of rewinding it —
  // and then settles onto the CAMBER: out in the wild a hillside tips the
  // car the way the hillside goes, which is the same cross-slope that is
  // already pulling it downhill. On the road it is the road's OWN camber
  // (R16 — the crown it sheds water off, the wheel track it drops into):
  // a fraction of a degree where a hillside is tens of them, and never the
  // drift's, which contributes nothing to how level the car sits.
  //
  // A roll rate the ground was handed and did not take — a landing that
  // tripped the car but not over (`air.tripSlide`), a low solid clipped
  // under the sill — plays out first: the body LURCHES over on its springs
  // and the recovery below brings it back, which is the near-miss the
  // player gets to see before the one that goes over.
  car.roll += car.rollRate * dt;
  car.rollRate *= Math.exp(-T.air.leanDamp * dt);
  // ...unless the lurch is worth the lift up over the body's own sill
  // corner, at which point there is no near-miss and no recovery: the car
  // is past its outside wheels and the roll owns it from here (roll.ts).
  // THE PITCH HERE IS THE SPRINGS', NOT THE BOX'S. A car being driven
  // carries its nose angle on its suspension — `settlePitch` eases it onto
  // the grade, up to `attitude.pitchMax` — and that is an attitude, not a
  // rotation of the body. The crash model's pitch is the other thing
  // entirely: the plane the box is actually turning over in. So the roll is
  // asked with the pitch the box has, which while driving is none of it;
  // reading the springs' angle instead stands a car merely driving down a
  // steep hill on its own bumper, and every hop and every edge in the suite
  // said so.
  const mass = massSpread(spec);
  if (
    goesOver(car.roll, car.rollRate, mass, rollBed(ctx)) ||
    goesOverEnd(car.pitch, car.pitchRate, mass, rollBed(ctx)) ||
    !onItsWheels(car.roll, 0)
  ) {
    beginRoll(car, events, stats);
    return;
  }
  // ── The body's lean, and the driver's authority over it ────────────────
  // A car standing on all four wheels is held by its springs, and this game
  // keeps it FLAT on purpose: a rally car goes sideways level, and the roll
  // is the ground's camber, never a lean into the slide. That is the ease
  // below and it is unchanged for every ordinary metre of every stage.
  //
  // A car UP ON TWO WHEELS is a different thing entirely, and it used to get
  // the same treatment: the ease dragged it back to the camber at a fixed
  // rate whatever the driver did. So the most retrievable moment in any
  // accident — the car caught itself, the tyres are down, it is balanced
  // over — was the one moment nothing the player pressed could matter.
  //
  // Past the lean the springs can hold it is a rigid body pivoting on its
  // outer contact line, and `leanTorque` is what turns it: gravity down the
  // same surface a rollover runs on, plus the lateral force the tyres are
  // making, working on the lever of the weight's own height. Steer INTO the
  // side the car is standing on and it comes back down onto four wheels;
  // steer away and it holds up there, or goes over — which `goesOver` above
  // has already had its say about. None of that is scripted; it is the sign
  // of the cornering against the sign of the lean.
  //
  // The lateral acceleration is the one the tyres are actually making:
  // speed times the rate the nose is coming round, which is the centripetal
  // term and the same quantity a load transfer is written on.
  const bed = rollBed(ctx);
  const lean = rollTilt(car.roll);
  const camber = ctx.slopeLat ? Math.atan(ctx.slopeLat) : 0;
  // ...and this branch is also where `planted` is decided, because it IS the
  // question: the springs carrying the body, or a rigid body up on its outer
  // contact line. Nothing else in the game may draw that line a second time.
  if (Math.abs(lean - camber) > T.air.leanFree) {
    // Only the TORQUE is added here. The rate was integrated and damped a
    // few lines up, where every roll rate the ground hands the body is —
    // doing either again is a second helping of both.
    car.rollRate += leanTorque(car.roll, 0, car.u * car.yawRate, mass, bed) * dt;
    car.planted = false;
  } else {
    car.roll += (camber - lean) * clamp(T.air.rollRecover * dt, 0, 1);
    car.planted = true;
  }
  settlePitch(car, Math.atan(ctx.slope));

  // ── Drift readout ────────────────────────────────────────────────────────
  readDrift(car, sliding, breakaway, stats, dt);

  // ── Move, then the ground the car finds ──────────────────────────────────
  rideGround(spec, car, ctx, prevVy, prevWheelVy, events, stats);

  // ── Suspension ───────────────────────────────────────────────────────────
  // Whatever the ground just did to the wheels, the body has to catch up
  // with: the shape under the car, capped, and the bumps in it, on their own
  // ceiling (ground.ts). Landings and impacts arrive as velocity steps of
  // their own and are not capped here. A car that has just launched has
  // nothing under its wheels to be jolted by.
  const jolt = car.airborne ? 0 : groundJolt(car, prevVy, prevWheelVy);
  stepSuspension(spec, car, jolt, (car.u - prevU) / dt);
  // A FACE MET AT PACE reaches the belly the way a landing does. The
  // wheels' vertical speed jumping UPWARD in one step — the foot of a bank
  // arriving under a car at speed — is what the springs are handed above,
  // and they lift the body with the wheels up to the most one bump may
  // throw into them (`suspension.bumpMax`); past that the body has met the
  // ground before the wheels could lift it, and the underside folds by the
  // rest, charged as the arrival it is (`landingDamage`, with the tolerance
  // a landing has — which shot dampers narrow). So it is the SPRINGS that
  // decide what a bank costs: a bank taken at the speed that carries the
  // car up it stays free; the same bank at twice that speed costs the
  // belly. The WHEELS' speed alone, and only rising: the smoothed grade
  // predicting a drop the wheels have not made yet — the nose creeping out
  // over an edge — is nothing arriving under the car, and read against it
  // a car rolling off a table folded its floor on thin air.
  if (!car.airborne) {
    const over = car.wheelVy - prevWheelVy - T.suspension.bumpMax;
    if (over > 0) landingDamage(spec, car, T.collision.hardLandSpeed + over, events, stats);
  }
  // The hopping dies down with them. Only on the ground: a car back in the
  // air off its own rebound is still the same landing, and it has nothing
  // to settle against up there.
  car.settle = Math.max(0, car.settle - T.suspension.settleFade * dt);

  // ── The driven wheels ────────────────────────────────────────────────────
  // How far ahead of the road the engine is spinning them, once the step has
  // settled. It goes LAST because it is measured against the speed the car
  // ended up at and the slide it ended up in: sized against the speed it
  // started from, a step that accelerated hard would leave the wheels
  // turning faster than their own engine could turn them. An engaging shift
  // takes the pedal away, and with it the spin.
  settleWheelspin(spec, car, wheelspinShare(spec, car, driveBite, input.throttle * shiftCut), dt);
}
