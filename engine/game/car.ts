// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The handling model — one grounded step and one airborne step of the car.
// There is no drift MODE here: a slide is simply a turn the tires cannot
// pay for, so the car rotates further than the road bends and the gravel
// starts flying. The tires REDIRECT the car rather than braking it, which
// is why going sideways costs pace but is never felt as a handbrake. The
// other two moments: the jump (the lip throws you, the air is committed —
// velocity is fixed, the nose barely answers) and the landing (aligned
// keeps your speed, sideways scrubs it and wobbles). Under all three the
// SPRINGS carry the body: the wheels track the ground exactly, the body
// lags them, and every dip, landing and bank is a jolt it squats through
// and rebounds out of — the car's weight, made visible. Numbers live in
// defs/, not here.

import { clamp } from "../lib/math.ts";
import { askedSlide, latCeiling, slideFloor, surfaceGripFor } from "./limits.ts";
import { damageEffects, type DamageEffects } from "./damage.ts";
import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import {
  rollTilt,
  rotateFrame,
  updateSlip,
  type CarInput,
  type CarState,
  type GameEvent,
  type RunStats,
} from "./state.ts";
import { landingDamage } from "./collision.ts";
import { footOn, groundJolt, readSeat, standOn, wheelSpeed, type GroundUnder } from "./ground.ts";
import { beginRoll, goesOver, landRolled, onItsWheels, rollStand } from "./roll.ts";
import type { Rng } from "../lib/prng.ts";
import type { Surface } from "../mapgen/index.ts";

const T = TUNING;
/** The drift group, used on nearly every line below. */
const D = TUNING.drift;

/** Where inside the current gear the engine is, 0 at the bottom and 1 at
 * the top. Both halves of `spec.torque` run off it — the curve that decides
 * where the shove lives, and the wheelspin that decides how much of it ever
 * reaches the ground — because both are at their most extreme where there
 * is most torque and least speed. */
function revs(spec: CarSpec, car: CarState, speed: number): number {
  return clamp(speed / spec.gearTop[car.gear], 0, 1);
}

/** How much of the torque the driven axle spins AWAY rather than putting
 * down, as a fraction of `gearAccel`. One driven axle carrying all the
 * torque on a loose surface spins where four driven wheels hook up and go,
 * and it spins worst exactly where the torque is highest: the bottom of the
 * gear. This is the whole cost of a rear-drive launch on gravel, and it is
 * gone by the time the gear runs out.
 *
 * On top of that standing shortfall sits the LAUNCH: whatever `launchSpin`
 * the pedal is asking for past the axle's bite, and whatever the clutch
 * dropped on it at the green. The two are added rather than combined
 * because they are different failures — one is an axle that never had the
 * bite, the other is an axle that had it and was overwhelmed.
 *
 * It is a function rather than four lines inside `engineAccel` because the
 * renderer needs the same number: wheels that are drawn spinning while the
 * engine believes they are hooked up would be a lie the picture tells about
 * the physics. `CarState.wheelspin` carries it out, normalized. */
function wheelspinLoss(spec: CarSpec, car: CarState, surfaceGrip: number, rev: number): number {
  const bite = clamp(spec.traction * T.drivetrain[spec.drive].bite * surfaceGrip, 0, 1);
  const standing = (1 - bite) * T.engine.wheelspin * spec.torque * (1 - rev);
  return clamp(standing + T.engine.spinLoss * car.launchSpin, 0, 1);
}

/** How much pedal the driven axle will take before the tyres start spinning
 * rather than gripping, 0..1. Over 1 on a four-wheel-drive standing on
 * gravel, which is exactly what a four-wheel-drive is for. */
function pedalHold(spec: CarSpec, surfaceGrip: number): number {
  return clamp(
    spec.traction * T.drivetrain[spec.drive].bite * surfaceGrip * T.engine.pedalHold,
    0,
    1,
  );
}

/** ...and how far past that a given demand is asking, 0..1 — the spin the
 * axle is being ASKED for. `demand` is the pedal, plus anything else pushing
 * torque at the tyres. Faded out by the revs for the same reason the
 * standing loss is: at the top of a gear there is road speed under the wheel
 * and nothing left to spin it with. */
function spinAsk(spec: CarSpec, car: CarState, surfaceGrip: number, demand: number): number {
  const rev = revs(spec, car, car.u);
  return clamp(demand - pedalHold(spec, surfaceGrip), 0, 1) * (1 - rev);
}

/** ...and what a PEDAL alone can light, which is only a fraction of it. A
 * throttle feeds torque at a tyre smoothly, and a tyre fed smoothly finds a
 * slip it can live at — a bit of scrabble, not a burnout. Only a step of
 * torque nothing was expecting lights an axle properly, and on a rally car
 * there is exactly one of those: the clutch. Keeping the two apart is what
 * stops the start-line rule from quietly becoming a corner-exit rule as
 * well, and it is why a rear-driver still puts its power down worse than a
 * front-driver everywhere the launch is not the question. */
function pedalSpin(spec: CarSpec, car: CarState, surfaceGrip: number, throttle: number): number {
  return T.engine.pedalSpin * spinAsk(spec, car, surfaceGrip, throttle);
}

/** THE CLUTCH COMING OUT, 0..1 — how lit the tyres are the instant the
 * lights go green, from the revs the driver was sitting on. Called once, by
 * the start control: on the grid nothing is geared and the free revs are the
 * only thing the player has been doing, so they arrive at the tyres whole.
 * A driver who waited with the pedal up hands them nothing at all. */
export function clutchDump(spec: CarSpec, car: CarState, surface: Surface | "nature"): number {
  const held = clamp((car.rev - T.engine.dumpFrom) / (1 - T.engine.dumpFrom), 0, 1);
  // Nothing stored, nothing to hand over: the axle is left to the pedal and
  // the settle below, which is what an idling engine and a raised foot come
  // to. The pedal is taken as FLOORED here — a driver dropping the clutch on
  // held revs is going, and one who is not gets the whole of it back inside
  // a few frames anyway, since the spin decays to whatever the pedal is
  // actually asking for.
  if (held <= 0) return 0;
  return spinAsk(spec, car, surfaceGripFor(spec, surface), 1 + T.engine.dumpSpin * held);
}

/** Move the launch's own spin toward what the pedal is asking for. It lights
 * up almost instantly and hooks back up over a second or so — and quicker
 * for a driver who eases off, which is the whole of what modulating the
 * throttle off the line buys. */
function settleLaunchSpin(
  spec: CarSpec,
  car: CarState,
  surfaceGrip: number,
  throttle: number,
  dt: number,
): void {
  const ask = pedalSpin(spec, car, surfaceGrip, throttle);
  const rate =
    ask > car.launchSpin
      ? T.engine.spinLight
      : T.engine.spinHook * (1 + T.engine.hookLift * (1 - throttle));
  car.launchSpin += (ask - car.launchSpin) * clamp(rate * dt, 0, 1);
}

/** How LIT the driven axle is, 0..1, with the pedal it answers to already in
 * it. Two things spin a driven wheel faster than the road, and they cover
 * different parts of the stage: the torque the axle cannot put down, which
 * is a launch and is gone by the top of the gear, and a tyre spending its
 * grip sideways, which is a drift and is not. */
function wheelspinShare(
  spec: CarSpec,
  car: CarState,
  surfaceGrip: number,
  throttle: number,
): number {
  const loss = wheelspinLoss(spec, car, surfaceGrip, revs(spec, car, car.u));
  const lit = clamp(loss / T.engine.wheelspin, 0, 1);
  return clamp(lit + T.engine.slideSpin * car.slide, 0, 1) * throttle;
}

/** How much room the gear leaves for the driven wheels to outrun the road,
 * m/s. A wheel with a gear engaged cannot turn faster than the engine can
 * spin it, so a fully lit axle winds to the top of the gear it is in and no
 * further: first gear spins away from a standstill, and top gear cannot spin
 * at all. `CarState.rev` is this same wheel speed read back through the
 * gearing (step.ts) — needle, engine note and drawn wheels are one number,
 * as they are in a car.
 *
 * Exported because the handling is not the last thing in a step to touch
 * `u`: the ground catching a spun car and another car's shunt both land
 * after it, and a spin sized against the headroom the gear had a moment ago
 * outlives the speed it was sized for. `step.ts` re-clamps against this
 * once everything has moved. */
export function spinHeadroom(spec: CarSpec, car: CarState): number {
  return Math.max(0, spec.gearTop[car.gear] * T.revs.limiter - Math.max(0, car.u));
}

/** Move the readout toward the spin the axle is asking for, and hold it
 * inside what the gear allows. The chase is what a tyre does — it lights up
 * over a few frames and hooks back up about as fast, and without the lag a
 * bouncing throttle would strobe both the drawn wheels and the needle
 * between spun-up and gripping. The ceiling has to be applied AFTER it: a
 * downshift, or the car simply accelerating, shrinks the headroom under a
 * spin that was sized against the old one, and a wheel turning faster than
 * its own engine is exactly what this model exists to rule out. */
function settleWheelspin(spec: CarSpec, car: CarState, share: number, dt: number): void {
  const room = spinHeadroom(spec, car);
  car.wheelspin += (room * share - car.wheelspin) * clamp(T.engine.spinSettle * dt, 0, 1);
  car.wheelspin = clamp(car.wheelspin, 0, room);
}

function engineAccel(spec: CarSpec, car: CarState, surfaceGrip: number): number {
  // Full torque through most of the gear, smoothly tapering to zero at the
  // gear's top speed. The taper starts late (last ~18%) so the equilibrium
  // against rolling drag sits close to gearTop and the shift-up threshold
  // is actually reachable — a long asymptotic curve would stall below it.
  const top = spec.gearTop[car.gear];
  const headroom = clamp((top - car.u) / (top * 0.18), 0, 1);
  const taper = headroom * headroom * (3 - 2 * headroom);
  const rev = revs(spec, car, car.u);
  // The torque curve, pivoting around mid-gear: a torquey engine shoves off
  // the bottom and runs out of puff, a peaky one wants revs. Area-neutral by
  // construction, so `torque` moves the pull around inside the gear without
  // ever adding any — two cars with the same gearing reach the same place by
  // different routes, and which route suits the stage is the point.
  const curve = clamp(1 + T.engine.torqueSpan * (spec.torque - 1) * (1 - 2 * rev), 0.2, 2);
  // ...and how much of it reaches the ground.
  return (
    spec.gearAccel[car.gear] * taper * curve * (1 - wheelspinLoss(spec, car, surfaceGrip, rev))
  );
}

function stepGearbox(
  spec: CarSpec,
  car: CarState,
  input: CarInput,
  t: number,
  hurt: DamageEffects,
  events: GameEvent[],
): void {
  // A box past `topGearAt` no longer takes its highest ratio: the stage is
  // finished on what is left of it, which caps the top end without ever
  // stopping the car. A car already in that gear is dropped out of it.
  const maxGear = Math.max(0, spec.gearTop.length - 1 - hurt.gearsLost);
  if (car.gear > maxGear) {
    car.gear = maxGear;
    events.push({ type: "shift", gear: car.gear });
  }
  // A hurt gearbox shifts harsher: the auto box, seamless when sound, cuts
  // throttle per shift as its damage grows; the manual's cut stretches.
  const gearboxDamage = car.damage.systems.gearbox;
  if (car.gearbox === "auto") {
    const cut = T.collision.systems.autoCut * gearboxDamage;
    if (car.gear < maxGear && car.u > spec.gearTop[car.gear] * T.gearbox.upAt) {
      car.gear += 1;
      car.shiftCutUntil = t + cut;
      events.push({ type: "shift", gear: car.gear });
    } else if (car.gear > 0 && car.u < spec.gearTop[car.gear - 1] * T.gearbox.downAt) {
      car.gear -= 1;
      car.shiftCutUntil = t + cut;
      events.push({ type: "shift", gear: car.gear });
    }
    return;
  }
  const cut = T.gearbox.shiftCut * (1 + T.collision.systems.shiftCut * gearboxDamage);
  if (input.shiftUp && car.gear < maxGear) {
    car.gear += 1;
    car.shiftCutUntil = t + cut;
    events.push({ type: "shift", gear: car.gear });
  } else if (input.shiftDown && car.gear > 0) {
    car.gear -= 1;
    car.shiftCutUntil = t + cut;
    events.push({ type: "shift", gear: car.gear });
  }
}

/** How sideways the car is, 0..1 — the one number the whole drift is made
 * of. The turn being ASKED for costs more lateral grip than the tires have,
 * and what was asked a moment ago has not fully let go yet, which is what
 * keeps a slide alive through the instant the wheel passes centre and makes
 * the transition between two corners one continuous motion.
 *
 * Demand is the turn the WHEEL commands — speed times the gripping steer
 * gain, plus whatever the driven axle is spinning up on its own — never the
 * yaw the car ended up with. That distinction is the whole
 * shape of the control. The slide feeds extra yaw authority (`driftYaw`)
 * back into the car, so a demand measured off the resulting yaw closes a
 * positive loop of gain `u · steer · driftYaw / (ceiling · entrySpread)`,
 * which is well above 1 at any real corner speed. Such a loop has no
 * equilibrium in the middle: every lock either stays gripped at a couple of
 * degrees or runs away to the same deep drift, a notch of wheel apart.
 * Commanded demand keeps the slide a monotone function of speed and lock,
 * so the angle moves WITH the wheel. Do not be tempted back to `car.yawRate`
 * here — it reads more physical and it costs the car its whole mid-range. */
type SlideState = {
  /** What the WHEEL is asking for past the limit — the only thing allowed to
   * DEEPEN a slide, so that the angle answers to the driver. */
  asked: number;
  /** Whether the tires are sliding at all, held up by the angle the car is
   * already at — what grip, scrub, the dust and the readout run off. */
  sliding: number;
  /** How much of a slide this speed allows at all, 0..1 — the speed floor,
   * open above `slideFrom` and shut below it. Everything that puts the car
   * sideways rather than round the corner has to pass through it. */
  open: number;
};

/** The four numbers the DRIVETRAIN moves in the slide: where the floor under
 * it sits, where it starts once past that floor, HOW FAR it develops, and how
 * fast it lets go again (TUNING.drivetrain). */
type SlideLimits = { floor: number; entryAt: number; depth: number; release: number };

function slideFactor(car: CarState, demand: number, limits: SlideLimits): SlideState {
  // THE SPEED FLOOR comes first, because under it there is no slide to
  // shape. Read off GROUND speed — the number on the speedo — so the rule
  // the player is told is the rule the car obeys, and so a car already
  // sideways loses the angle as it slows into the floor rather than
  // carrying it down to a standstill. WHERE the floor sits is the
  // drivetrain's: a rear axle with torque under it steps the tail out at
  // walking pace, which is a real thing a rear-driver does and no
  // front-driver ever does.
  const gate = clamp((Math.hypot(car.u, car.w) - limits.floor) / D.slideSpan, 0, 1);
  const open = gate * gate * (3 - 2 * gate);
  // SMOOTHSTEP, not a clamped line: the ramp has to leave zero and reach one
  // with no corner in it. A linear clamp puts a kink in the car's response
  // exactly at the limit, and a kink is an event — the moment a player feels
  // the car "change into" a drift. Starting below the limit (`entryAt`) and
  // easing in means nothing happens AT the limit at all. Where that entry
  // sits is the DRIVETRAIN's too: a front-driver understeers past the limit
  // before it steps out, a rear-driver has gone before it gets there.
  // ...and HOW FAR it develops past that is the drivetrain's as well, because
  // the two are different questions and only the first one used to be asked.
  // Every layout ran up the same ramp once over its threshold, so a front
  // axle out of grip produced the same tail-out slide as a lit-up rear one —
  // and since the front-driver's rubber is what gives out first on the loose,
  // it ended up the slidiest car in the game on the surface it is supposed to
  // wash wide on. A front axle that runs out of grip GOES STRAIGHT ON: it
  // still crosses the threshold, it just never develops much of a slide.
  const t = clamp((demand - limits.entryAt) / D.entrySpread, 0, 1);
  const asked = t * t * (3 - 2 * t) * open * limits.depth;
  // A slide the wheel has stopped asking for lets go over a beat instead of
  // in a step: last step's slide decays, and the wheel can take it straight
  // back up. Holding it up on the ANGLE instead — which is the one thing a
  // sideways car always has — is a feedback loop: more angle is more slide,
  // more slide is less lateral grip, and the car inflates its own drift well
  // past anything the driver asked for.
  const released = car.slide - limits.release * T.dt;
  // The gate caps the CARRIED slide too: a drift that runs out of speed is
  // let go by the floor closing on it, on the floor's own ramp.
  return { asked, sliding: Math.min(open, Math.max(asked, released)), open };
}

/** Leave the ground. A car that launches crossed up trips over its outside
 * wheels, so the roll it carries into the air is the slide the tires were
 * fighting plus the rotation already in the body: straight and level flies
 * flat, properly sideways goes a long way over, and once in a while it goes
 * all the way round. Physics decides — nothing here aims for it.
 *
 * `hop` marks a lift the flight's own gravity would not have allowed: the
 * ground let the body go at `air.hold` of its weight, and the arcade
 * gravity will have it back before the flight is anything. It flies the
 * same way, but it is the car BOBBING over a brow, not a jump — so it
 * draws no turbulence, books no air time and no jump, and (through
 * `settling`, which is the same fact read from a landing's side) the bot
 * keeps driving through it.
 *
 * `sudden` is the ground going in one step — a lip, an edge — under tyres
 * that were holding a slide a moment ago: that is the trip, below. A body
 * that lifted off its wheels over a brow left tyres that had already
 * unloaded across the whole of the loft, and they let go of nothing. */
export function launch(
  car: CarState,
  vy: number,
  events: GameEvent[],
  stats: RunStats,
  hop = false,
  sudden = true,
): void {
  car.airborne = true;
  car.settling = hop;
  car.airTime = 0;
  car.vy = vy;
  // The body's lift over the ground is the flight's now: the wheels have
  // stopped reaching after it.
  car.y += car.loft;
  car.loft = 0;
  car.loftRate = 0;
  // Nothing is standing on the tires up here, and nothing about the ground
  // the car just left applies to the one it comes down on. It arrives back
  // at its own weight and the landing's own skitter decides the rest.
  car.weight = 1;
  if (sudden) {
    car.rollRate = -(car.w * T.air.rollFromSlide + car.yawRate * T.air.rollFromYaw);
    // The same trip about the vertical axis: the tires that were holding
    // the slide let go all at once, so the car keeps turning the way the
    // slide was turning it. Sideways off a ledge is a car that SPINS as it
    // falls, which is the whole difference between a jump and going over
    // the edge in a drift. (Heading grows clockwise and rotating the frame
    // that way reduces `w`, so continuing the slide is a negative rate.)
    car.yawRate -= car.w * T.air.yawFromSlide;
  }
  if (hop) return;
  events.push({ type: "takeoff", vy });
  stats.jumps += 1;
}

/** Ease the nose toward the attitude the ground (or the flight) asks for.
 * Snapping it would strobe the body over every ripple of terrain noise; the
 * lag IS the suspension travel a landing settles through. */
function settlePitch(car: CarState, target: number): void {
  const want = clamp(target, -T.attitude.pitchMax, T.attitude.pitchMax);
  car.pitch += (want - car.pitch) * clamp(T.attitude.settle * T.dt, 0, 1);
}

/** One step of the springs the body sits on. `jolt` is the change in the
 * WHEELS' vertical speed this step, m/s — the ground moving out from under
 * the body (or into it) is the only thing that ever excites the heave, so
 * a flight, where wheels and body fall together, is quiet. `longAccel` is
 * what the car is doing along its own axis, which is the dive and the
 * squat.
 *
 * A second-order spring, deliberately under-damped: a body that eased to
 * rest would read as a cushion, and it is the OVERSHOOT — squat, rebound,
 * settle — that reads as mass. Heavier cars ride the same springs more
 * slowly (ω ∝ √(k/m)). */
function stepSuspension(spec: CarSpec, car: CarState, jolt: number, longAccel: number): void {
  const S = T.suspension;
  const dt = T.dt;
  const w = 2 * Math.PI * S.freq * Math.sqrt(T.collision.refMass / spec.mass);
  // The wheels changed their vertical speed; the body kept its own.
  car.rideRate = clamp(car.rideRate - jolt * S.absorb, -S.rateMax, S.rateMax);
  let accel = -w * w * car.ride - 2 * S.damping * w * car.rideRate;
  // The bump stops: past the travel the springs are coil-bound. They are
  // stiff AND heavily damped, so a slam is caught and absorbed rather than
  // fired straight back out as a pogo.
  const limit = car.ride < 0 ? S.travel : S.droop;
  const over = Math.abs(car.ride) - limit;
  if (over > 0) {
    const dir = Math.sign(car.ride);
    accel -= dir * over * w * w * S.stopRate;
    // The stop's damping is what it takes OUT of the slam, and a rubber
    // stop takes it out on the way IN. Coming back out it is a spring like
    // any other and it PUSHES — which is the whole rebound of a landing,
    // the body being thrown back off its own wheels. Damped equally in both
    // directions, the car squatted onto its stops and stayed there: every
    // landing in the game, from a hop off a kerb to a two-metre lip, ended
    // at the same flat 9 cm of squat and eased quietly back to rest with no
    // rebound in it at all. That is what "the suspension didn't act" is.
    const into = car.rideRate * dir > 0;
    accel -= car.rideRate * S.stopDamp * (into ? 1 : S.stopRelease);
  }
  car.rideRate = clamp(car.rideRate + accel * dt, -S.rateMax, S.rateMax);
  car.ride = clamp(car.ride + car.rideRate * dt, -S.heaveMax, S.heaveMax);

  // Dive and squat. First-order, because weight transfer settles onto the
  // stops rather than ringing the way the heave does — and because an
  // impact writes straight into this, and what should follow a nose-dip is
  // the nose coming back up, not the tail going down next.
  const want = clamp(longAccel * S.pitchPerAccel, -T.attitude.pitchMax, T.attitude.pitchMax);
  car.pitchLoad += (want - car.pitchLoad) * clamp(S.pitchRate * dt, 0, 1);
}

/** HOW HARD THE GROUND IS PULLING THE CAR DOWN OFF ITSELF, m/s² — the
 * vertical acceleration it would take to keep the wheels following the
 * ground at this pace. Positive over a brow, over a crown, and where a bank
 * the car has ridden up straightens out again; negative through a
 * compression, which presses the car on instead.
 *
 * `curve` is the ground's curvature along the DIRECTION OF TRAVEL and
 * `pace` the speed the car is covering ground at, so this is `pace²/R` — a
 * shape and a speed, which is why the same crown holds a car at a crawl and
 * throws it at rally pace. Two things read it and they are the same
 * question asked at two depths: how much weight is left on the tires, and
 * whether there is any left at all. */
function groundPull(curve: number, pace: number): number {
  return -pace * pace * curve;
}

/** HOW MUCH CAR IS STANDING ON THE ROAD right now, as a multiplier on grip.
 * A tire is worth the weight on it and nothing else, and two things take
 * that weight away.
 *
 * A car that has just arrived is not standing on its tires yet: the wheels
 * hammer on their own rubber for the better part of a second, and a wheel
 * intermittently in the air holds intermittently. That is `car.settle`,
 * written by the landing and sized by how hard it was, and it is what turns
 * a landing into a MOMENT — a nose a few degrees off line, or a wheel with
 * any lock on it, takes the car sideways where the same input on the flat
 * would not.
 *
 * ...and a car going over a shape is not standing on its full weight: that
 * is `car.weight`, the ground's own curvature under the path spending part
 * of the car's mass on following the ground down. It is why cresting a rise
 * and running straight off the top of it is a moment too, and why riding up
 * a bank and levelling out lets a car away from the driver at a speed the
 * same lock would have held on the flat.
 *
 * Neither is read off the springs, which is the model that suggests itself
 * and does not work — see the tuning for why `car.ride` cannot tell a
 * landing from an ordinary rutted road. Both read 1 on level ground, so
 * this costs an ordinary corner nothing. */
export function tyreLoad(car: CarState): number {
  const S = T.suspension;
  // ...and a body that has lifted off its wheels is standing on less again:
  // the wheels reaching down after ground that is falling away carry only
  // what the springs' last inch of droop presses on them, which is nothing
  // much. Toward the same floor the shape's own unloading has, over the
  // reach the wheels have (`air.loft`), so the two are one continuum — the
  // car goes light, then lifts, then flies.
  const lofted = 1 - (1 - S.weightFloor) * clamp(car.loft / T.air.loft, 0, 1);
  return Math.max(S.loadFloor, (1 - S.loadSkitter * car.settle) * car.weight * lofted);
}

/** Everything a step needs to know about the ground: the height under any
 * world position and whether it is the open lattice or a road profile
 * (`GroundUnder`, ground.ts), plus the grade and shape already read under
 * the car and the weather over it. */
export type GroundContext = GroundUnder & {
  surface: Surface | "nature";
  /** Road slope dy/ds under the car... */
  slope: number;
  /** Ground slope ACROSS the heading, positive when the ground rises to
   * the car's right — what pulls a car toward the downhill side. Off the
   * road it is the hillside; on the road it is the camber and the worn
   * wheel tracks (road.ts). Absent means dead flat. */
  slopeLat?: number;
  /** Vertical curvature of the road under the car, 1/m — negative over a
   * brow. Zero anywhere a jump lip owns the launch. */
  roadCurve: number;
  /** True within `air.crestSpan` of a jump lip on the road (step.ts). The
   * lip owns the launch there: the body's lift is read off the ground
   * under the middle, because the footprint's mean plunges as the front
   * wheels go over two metres before the middle does. */
  lip?: boolean;
  /** Current wind velocity, world space m/s. */
  windX: number;
  windZ: number;
  t: number;
  rng: Rng;
  /** What the drive is multiplied by this step — 1 everywhere except inside
   * a mass start's catch-up, where a car giving away grid rows is given back
   * the metres (state.catchUp). It multiplies the engine's pull and nothing
   * else: the grip, the slide and the top end are all still the car's. */
  drive: number;
};

/** How much of the wind carries the car this step. A translation, not a
 * torque — the wind moves the car off its line without ever spinning it. */
function windCarry(car: CarState): number {
  if (car.airborne) return T.wind.carry.airborne;
  return car.drifting ? T.wind.carry.drifting : T.wind.carry.grounded;
}

/** One grounded physics step. Returns events emitted this step. */
export function stepGrounded(
  spec: CarSpec,
  car: CarState,
  input: CarInput,
  ctx: GroundContext,
  events: GameEvent[],
  stats: RunStats,
): void {
  const dt = T.dt;
  const prevVy = car.vy;
  const prevWheelVy = car.wheelVy;
  const prevU = car.u;
  // WHAT THE GROUND IS DOING TO THE WEIGHT ON THE TIRES, before anything
  // spends it. The shape under the car's path either lifts weight off it or
  // presses weight on, and everything below that asks what the tires hold
  // has to see the answer — so this comes first, off the pace and the
  // ground the step is starting from.
  //
  // It EASES rather than arriving: the load takes a beat to reach the
  // contact patch, and the lag is also what keeps the seam between two
  // ground models — the road's corridor and the open lattice beside it —
  // from reading as a step in the grip when a car crosses it.
  {
    const S = T.suspension;
    const pull = groundPull(ctx.roadCurve, Math.hypot(car.u, car.w));
    const want = clamp(1 - (S.weightGain * pull) / T.air.gravity, S.weightFloor, S.weightCeil);
    car.weight += (want - car.weight) * clamp(S.weightRate * dt, 0, 1);
  }
  // The surface and the car's own rubber, as one number: the slide's
  // ceiling, the lateral rate and how much torque the driven axle can put
  // down all read it, so the tires are felt in all three.
  //
  // ...times how much of the car is actually STANDING on them, which for
  // the half second after a landing is not all of it. It multiplies in HERE
  // rather than inside `surfaceGripFor`, and the reason is who else reads
  // that: the bot quotes every corner it plans against it, and nobody plans
  // around a landing — what a car of this kind holds on this surface is a
  // standing fact, and what THIS car has under it right now is not. From
  // this one line the slide threshold, the redirect rate, the traction
  // ceiling and the driven axle's bite all go light together, which is why
  // a landing unsticks the car instead of playing an animation at it.
  const surfaceGrip = surfaceGripFor(spec, ctx.surface) * tyreLoad(car);
  const surfaceDrag = T.surfaces.drag[ctx.surface];
  const surfacePower = T.surfaces.power[ctx.surface];
  // Everything the crashes have done, as the multipliers the rest of this
  // function drives through (damage.ts). Read once, never written back:
  // collision.ts owns the ledger, the handling model only spends it.
  const hurt = damageEffects(car, Math.abs(car.u), ctx.t);
  /** Which wheels this car drives — the row every line below reads. */
  const DR = T.drivetrain[spec.drive];

  // The rack, and the hands on it, have weight: the lock EASES toward what
  // the driver is asking for instead of arriving in one tick. Everything
  // below reads `car.steer` rather than the raw input — the lag has to be
  // upstream of the whole model, or the slide would be commanded off a lock
  // the front wheels have not reached yet.
  // The rack's own SPEED — how fast the hands are moving, which is a
  // different thing from where they have got to, and the only thing a
  // flick is made of. Read BEFORE the lock moves: the throw belongs to the
  // wheel crossing the car, not to where it ends up.
  const rackVel = (input.steer - car.steer) * T.steering.rackRate;
  const crossing = clamp(-(input.steer * car.steer) / T.steering.flickCross, 0, 1);
  const thrown = crossing * clamp(Math.abs(rackVel) / T.steering.flickRate, 0, 1);
  // The throw takes time to cross the car and time to come back, so it is
  // HELD rather than read off the rack each step — see flickSettle.
  car.flick = Math.max(thrown, car.flick - T.steering.flickSettle * dt);
  // The weight moving forward off the driven axle, chasing the pedal at the
  // rate the mass actually travels. See `CarState.lift`.
  const wasLifted = car.lift;
  car.lift += (1 - input.throttle - car.lift) * clamp(T.grip.liftSettle * dt, 0, 1);
  /** THE BOOT, 0..1 — how hard the power is coming back on, read off the rate
   * the weight is moving back onto the driven axle. A stab off a closed
   * throttle tops this out; a throttle already open cannot move it at all. */
  const boot = clamp((wasLifted - car.lift) / (T.grip.liftSettle * dt), 0, 1);
  const flick = car.flick;
  // Which way the mass was sent. Latched with the load: by the time the
  // tires feel it the rack has long since arrived, and the lock's own sign
  // would throw the car back the way it came.
  if (thrown > 0) car.flickDir = Math.sign(rackVel);
  car.steer += (input.steer - car.steer) * clamp(T.steering.rackRate * dt, 0, 1);
  // THE PULL: a body folded harder down one side drags that way, and the
  // driver holds a correction into it for the rest of the stage. It goes on
  // the lock the TIRES see, not on `car.steer` — that is where the driver's
  // hands are, and the rack would ease the pull away as fast as it appeared.
  const steer = clamp(car.steer + hurt.pull, -1, 1);
  // Brake lights, so only a car being SLOWED lights them — a car backing out
  // of a ditch is under power, not under the brake.
  car.braking = input.brake > 0.2 && car.u > 3;
  // THE LEVER, as much of it as the car still has: one cable to the rear,
  // and a cut brake line takes most of it (damage.ts). Every place below
  // that used to ask whether the handbrake is pulled asks how much of it
  // is doing anything instead, so a broken lever is a weak one, not a
  // switch that is either there or not.
  const lever = input.handbrake ? hurt.lever : 0;
  // ...and the rear wheels dragged rather than rolled, which is a different
  // question from the pedal and from the angle both. See `CarState.locked`.
  car.locked = lever > 0.5 && car.u > 3;
  // The weight the BRAKE pitches onto the nose, on the same lag as the lift
  // and for the same reason. Only while the pedal is actually slowing the
  // car: backing out of a ditch on the same pedal loads nothing, and neither
  // does a car already stopped. See `CarState.brakeLoad`.
  const braked = car.u > T.reverse.engageBelow ? input.brake : 0;
  car.brakeLoad += (braked - car.brakeLoad) * clamp(T.grip.liftSettle * dt, 0, 1);
  // Which of its two jobs the brake pedal is doing this tick: it slows a car
  // that is still rolling forward, and once it has stopped one the same pedal
  // backs it out. Throttle always wins — gas is the way out of reverse, with
  // no gear to select first.
  //
  // The manoeuvre LATCHES, and stays latched through the pedal coming up
  // until the car is back at a stop. That is what separates "the driver put
  // this car in reverse" from "something threw it backwards": a rebound off a
  // cliff face is also negative `u`, and it belongs to the collision, which
  // gets to keep every bit of it.
  car.reversing =
    input.throttle === 0 &&
    (input.brake > 0 ? car.u <= T.reverse.engageBelow : car.reversing && car.u < -T.standstill);

  stepGearbox(spec, car, input, ctx.t, hurt, events);

  // ── Yaw ──────────────────────────────────────────────────────────────────
  // Steering authority fades with speed (stability) and with standstill
  // (you cannot pivot a parked car). Once the tires give up, the car gets
  // extra rotation and the slip itself turns the nose — the tail leads and
  // you catch it on the counter — both fading in with the slide so that
  // grip and slide are one continuous response, not two modes.
  // Everything below reads the SPEED, not the signed velocity: a car rolling
  // backwards — reversing out of a ditch, or sliding back down a climb it
  // could not carry — is moving, and a wheel with no authority at all is how
  // you get stuck twice. Going backwards it answers the other way round,
  // which is `backwards` below, applied once to the lock.
  const speed = Math.abs(car.u);
  const backwards = car.u < 0 ? -1 : 1;
  const speedFactor = clamp(speed / T.steering.deadSpeed, 0, 1);
  // A bent rack answers late and short: steering damage bleeds authority.
  const rack = hurt.steering;
  // ...and how fast that authority bleeds off with speed is the car's own
  // composure: a stable car calms down at pace and is lazy to turn in with
  // it, a nervous one stays sharp and stays nervous. It is why a stage of
  // long fast sweepers and a stage of hairpins want different cars.
  const fadeSpeed = T.steering.fadeSpeed / spec.stability;
  // ...and how much of it reaches the road is the TIRES', because the front
  // wheels are what point the car and a front wheel can only pull as hard as
  // what it is standing on lets it. Without this term grip only ever took
  // things away: in the gripped range the yaw is `steer × steerGain` with no
  // surface in it at all, so every car in the roster held a WIDER line on
  // tarmac than on gravel at the same lock while arriving a third faster,
  // and the one surface a car should be quick on was a place to run wide.
  //
  // Measured against GRAVEL, not against an abstract 1: gravel is this
  // game's reference surface, and quoting the advantage against anything
  // else quietly hands every car a different wheel on the surface most of
  // the stage is made of. The car's own loose-surface rubber is what makes
  // that reference the car's own. Sub-linear (`steerGrip` under 1): a tire
  // with half again the grip does not hand the driver half again the yaw.
  //
  // Off the SURFACE's own grip and never `surfaceGrip`, which carries the
  // landing's transient load with it. What a road is worth to the rack is a
  // standing fact; what this car has under it half a second after touching
  // down is not, and folding the two together made a landing take the
  // steering away at the same moment it took the grip — which nets out as a
  // landed car sliding LESS than one on the flat.
  const bite = 1 + T.grip.steerGrip * (surfaceGripFor(spec, ctx.surface) / spec.tyres.loose - 1);
  const steerGain = (spec.steerRate / (1 + speed / fadeSpeed)) * speedFactor * rack * bite;
  const rev = revs(spec, car, speed);
  // The lateral grip the tires have to spend, and the turn the wheel is
  // asking them for: the handbrake unsticks the rear by lowering the
  // ceiling, so the same lock asks far more of what is left.
  // Written so a whole lever is EXACTLY `handbrakeGrip` and no lever is
  // exactly 1: `1 - (1 - g)` is not bit-equal to `g`, and the field's crews
  // are deterministic to the bit — a rounding of that size, applied to
  // every sound car on every step, is a different race.
  const leverGrip =
    lever >= 1 ? T.grip.handbrakeGrip : lever <= 0 ? 1 : 1 - (1 - T.grip.handbrakeGrip) * lever;
  const gripCeiling = spec.gripAccel * surfaceGrip * leverGrip;
  // Speed is not the only way to unstick a driven axle. At the bottom of the
  // gear a rear axle with real torque under it spins up under power and the
  // tail steps out at walking pace, where the wheel's own lateral ask is
  // almost nothing — which is how a rear-driver is drifted at 10 km/h and
  // why a front-driver, whose axle simply goes straight on when it lets go,
  // cannot be. It enters the SAME demand the wheel does, so the slow slide
  // IS the fast one: one model, one readout, one plume of dust.
  // ...and it is a LOW-SPEED effect, faded out by the same floor the slide
  // itself starts at: below that speed torque is the only thing that can
  // unstick an axle, above it the wheel's own lateral ask has long taken
  // over and a car still being thrown sideways by its own throttle in fifth
  // is not a rear-driver, it is a car nobody can keep on the road. Without
  // this the term fires at the bottom of EVERY gear, fifth included.
  const slow = clamp(1 - speed / D.slideFrom, 0, 1);
  const spinDemand =
    (T.grip.torqueSpin *
      DR.spin *
      spec.torque *
      input.throttle *
      Math.abs(steer) *
      (1 - rev) *
      slow *
      slow) /
    Math.max(0.5, surfaceGrip);
  // ...and the weight a FLICK throws across the car, which unsticks it with
  // no driven axle involved at all. It is a SPIKE — the hands are only
  // crossing for an instant — and the slide's own release is what carries
  // it through the corner afterwards, which is exactly how the move works:
  // the flick sets the angle up, the wheel then drives it.
  const flickDemand = flick * T.grip.flickThrow * DR.flick * speedFactor;
  // ...and the weight coming BACK, which is a driven axle being asked for
  // torque it has no grip left to spend. Enters the same demand the wheel
  // does, so booting it mid-corner is one more way of asking for the angle
  // rather than a mode of its own.
  const bootDemand = boot * T.grip.bootThrow * DR.spin * spec.torque * speedFactor;
  const demand =
    Math.abs(car.u * steer * steerGain) / gripCeiling + spinDemand + flickDemand + bootDemand;
  // WHAT A MOVE BUYS. `depth` is what the WHEEL alone can develop, and on
  // anything but a rear-driver that is deliberately not much — a front axle
  // out of grip washes wide, whatever else is happening. The three ways a
  // driver takes the weight off the rear lift that ceiling toward the
  // reference slide: the mass thrown by a flick, the nose pitched down on a
  // trailed brake, and the rear wheels locked outright. The largest one
  // wins rather than the sum — they are all the same axle letting go, and a
  // driver doing two at once is not owed twice the angle for it.
  const asking = Math.max(
    lever * D.leverDepth,
    flick * D.flickDepth,
    car.brakeLoad * D.brakeDepth * DR.brake,
  );
  // ...and it is HELD once made. The lever comes up in one tick and the
  // weight it moved does not, so a raw reading would collapse the slide the
  // car is allowed in a single step — and the exit's spring, which is sized
  // off exactly that collapse, would fire mid-corner with the lock still on
  // and stand a hairpin's pivot straight up. See `CarState.provoked`.
  car.provoked = Math.max(clamp(asking, 0, 1), car.provoked - D.provokeSettle * dt);
  const provoked = car.provoked;
  // ...and what the move put into the car's ROTATION outlives the weight
  // it moved: see `CarState.thrown`.
  car.thrown = Math.max(provoked, car.thrown - D.thrownSettle * dt);
  // THE LIFT IS THE FOURTH MOVE, and the only one that does not argue with
  // the speed floor. Coming off the power takes weight off the driven axle
  // like the rest of them, so it has to lift the DEPTH — on a layout whose
  // own is 0.42 there is nothing under `liftSpan`'s setpoint for the pedal
  // to move, which is why a lift used to do nothing at all to a front-driver
  // on a surface with a small slip vocabulary. But it is not an ASK: the
  // lever and the brake are things a driver does to get a car round, and a
  // closed throttle is a driver stopping doing something. So it never claims
  // `provokeFloor`, and a lift-drift is let go by the floor as the car runs
  // out of speed — which is exactly the shape a lift should have.
  //
  // SQUARED, because the ask belongs to a CLOSED throttle and `car.lift` is
  // simply `1 - throttle` lagged: read straight, a car cruising a corner on
  // a third of the pedal is two-thirds lifted, and the depth it opened up
  // made every layout slide like the one above it whenever the driver was
  // not flat out. The square leaves a maintenance throttle almost nothing
  // and hands a driver who genuinely came off the power all of it.
  const lifted = clamp(car.lift * car.lift * D.liftDepth * DR.liftYaw, 0, 1);
  // ...and THE CHAIN the last drift left in the tires. Rubber that has just
  // been scrubbed is past its peak, so the next corner is entered on less
  // than the last one had: it lets go earlier and it goes deeper once it
  // has. Booked on drift starts (below) rather than grown from the slide, so
  // it escalates a SEQUENCE without ever feeding itself.
  const chain = clamp(car.chain, 0, 1);
  const { asked, sliding, open } = slideFactor(car, demand, {
    // Both of these are `limits.ts`, not restatements of it: a move argues
    // with the speed floor as well as with the depth (the corners that need
    // one are the slow ones), and the bot has to be able to ask the same
    // two questions about a corner it has not reached yet.
    floor: slideFloor(spec, provoked),
    entryAt: D.entryAt * DR.entry * (1 - D.linkEntry * chain),
    depth: askedSlide(spec, Math.max(provoked, lifted)),
    release: D.release * DR.release,
  });
  // The wheel does not just unstick the car — it NAMES the angle. Every
  // force that deepens a slide fades as the slip approaches what this much
  // lock is asking for at this speed, and is gone once the car is past it.
  // The setpoint has to MOVE with the wheel: a fade band at a fixed angle
  // leaves the deepening forces with no equilibrium below it, which is the
  // same two-state car the commanded demand above exists to avoid.
  // How far sideways THIS surface lets the car go: gravel's breakaway is a
  // long way out, a sealed road's is a few degrees off straight. It scales
  // the angle the slide asks for and the band it fades over together — one
  // is the setpoint and the other is the room around it, and stretching one
  // without the other would make the paved car's drift sharp-edged instead
  // of small.
  const breakaway = T.surfaces.breakaway[ctx.surface];
  // A CLOSED THROTTLE ASKS FOR MORE ANGLE. Lifting mid-corner throws the
  // weight onto the nose and takes it off the driven axle, and the tail
  // comes round: it is the oldest way there is of making a car turn in
  // harder than the wheel alone will. It has to move the SETPOINT rather
  // than push against it — every deepening force, the lift's own rotation
  // included, fades out as the car reaches the angle being asked for, so a
  // lift applied at the bottom of that band is a lift that does nothing.
  // With the setpoint moved, the band reopens and the whole machinery
  // carries the car to the deeper angle, where `liftGrip` is meanwhile
  // pulling the line tighter — one pedal, both halves of a rally turn-in.
  // ...and the chain deepens the same setpoint, for the same reason it
  // brought the breakaway forward above: the corner is being taken on tires
  // the last corner already used, and less grip is a bigger angle.
  // ...and the OTHER pedal deepens it on a DRIVEN REAR, which is the
  // steady-state drift a rear-driver has and a front-driver does not: the
  // rear tyre's longitudinal force is what holds the car out there, so the
  // angle stays for as long as the throttle is down. On the layout whose
  // `powerYaw` is zero this term is exactly 1 and the throttle is still the
  // way OUT of a slide (`pullStraight`) — the two pedals swap jobs between
  // the layouts, which is the single thing a player relearns moving from
  // one to the other.
  // Normalised on the OPEN throttle, so `angleSpan` is what a rear-driver
  // holds at full lock ON THE POWER — the state a rally car actually spends
  // a corner in — and coming off it is what costs the angle. Written as a
  // gain over 1 instead, this was a bonus on top of the reference and the
  // saloon sat 10% deeper than the number said it would.
  // SQUARED, for the reason `lifted` below is: `car.lift` is `1 - throttle`
  // lagged, so a car cruising a corner on a third of the pedal reads as
  // two-thirds lifted. Read straight, that took the angle off every corner
  // nobody was flat out in — which is most of them, for a bot and for a
  // player — and the saloon stopped drifting stages it had always drifted.
  // The ask belongs to a CLOSED throttle: squaring leaves a maintenance
  // throttle nearly all of its angle and takes it from a driver who has
  // genuinely come off the power.
  const power = D.powerSpan * DR.powerYaw;
  const pedal = 1 - car.lift * car.lift;
  const onPower = (1 + power * pedal) / (1 + power);
  const askedSlip =
    D.angleSpan *
    breakaway *
    asked *
    onPower *
    (1 + D.liftSpan * car.lift) *
    (1 + D.linkDepth * chain);
  const sat = clamp(1 - (Math.abs(car.slip) - askedSlip) / (D.angleBand * breakaway), 0, 1);
  // THE SPIN. Past this much slip the fronts are pointed so far from where
  // the car is going that neither the held lock nor the catch has anything
  // to pull against, and the car is round: it keeps rotating on the momentum
  // it has and drags four tires sideways across the road until that momentum
  // is gone. It is the top edge of the drift and the reason overdoing one
  // costs something — without it the deepest angle the car could be pushed
  // to was also a corner it got away with.
  //
  // Held through a hysteresis rather than read fresh each step: a bare
  // threshold flickers a car sitting near it several times a second, and
  // what is wanted is one moment the player can name. It ends when the angle
  // comes back under `spinBack`, or at `spinOut` whatever the angle.
  //
  // That speed floor is on the ENTRY as well, and it has to be: a car
  // pointing the wrong way at walking pace — beached on a bank, scrabbling
  // out of a ditch, reversing off a rock — is not spinning, it is parked
  // askew. Guarding only the exit let such a car enter on its angle and
  // leave on its speed in the same step, chattering the counter while the
  // scrub pinned it there and took away the steering it needed to drive out.
  //
  // GROUND speed, not `speed` — which is `|car.u|`, the along-the-nose
  // component. A car at seventy degrees of slip has almost no `u` however
  // fast it is actually travelling, so a spin gated on it drops out the
  // instant it succeeds and re-enters on the next step: twenty-six spin
  // events and twenty-six counted spins inside two seconds, off one yank of
  // the lever. It is the same reason `slideFactor`'s own floor reads the
  // speedo rather than the nose.
  const wasSpun = car.spun;
  const overGround = Math.hypot(car.u, car.w);
  const spinning = Math.abs(car.slip) > (wasSpun ? D.spinBack : D.spinAt) * breakaway;
  // ...and once spun, spun until the speed is gone: the slip is read from
  // the nearer axis, so a car going round reads as straight twice a turn,
  // and one that left the spin there swapped ends on the lock it still had
  // on and counted a fresh spin each time. A spin is over at `spinOut`, and
  // nowhere else — which is what "past a point the car is simply gone"
  // means.
  car.spun = (spinning || wasSpun) && overGround > D.spinOut;
  if (car.spun && !wasSpun) {
    events.push({ type: "spin", slip: Math.abs(car.slip), speed: overGround });
    stats.spins += 1;
    // The way the car is turning as it goes — the slide's own sense if the
    // yaw has not made its mind up.
    car.spinDir = Math.sign(car.yawRate) || -Math.sign(car.slip) || 1;
  }
  if (!car.spun) car.spinDir = 0;
  const spun = car.spun ? 1 : 0;
  const deepening = Math.sign(steer) === -Math.sign(car.slip) && car.slip !== 0;
  // ...and a spun car has almost none of it: the front wheels are as crossed
  // up as the body is, so whatever they are pointed at, it is not the road
  // ahead. `spinSteer` is what is left — enough that the driver is still in
  // the car, far too little to save the corner.
  const hands = spun ? D.spinSteer : 1;
  const steerTerm = steer * backwards * (steerGain + spec.driftYaw * speedFactor * asked) * hands;
  // THE FALLING SIDE OF THE TYRE. Everything below this line finds an
  // equilibrium: the deepening forces fade over `angleBand` as the car
  // reaches the angle the wheel asked for, and a held slide parks inside
  // that band. Past the TOP of it the wheel has nothing left to say — every
  // force it commands has faded out — and a real rear tyre out there is
  // past its peak: the force holding the tail FALLS as the angle grows, so
  // a car carried beyond what the wheel asked for, by a flick, the lever,
  // the throttle or a landing taken crossed up, has a tail that keeps
  // coming on its own, all the way to `spinAt`. This is that: from the top
  // of the band the slip itself turns the car further, and only lock the
  // OTHER way holds it, which is what makes over-doing a drift something
  // that can happen, and catching it something that has to be done in
  // time. Measured from the wheel's own setpoint rather than from a fixed
  // angle, and driven by what CARRIED the car past it — the move that
  // unstuck the rear (`thrown`, which outlives the weight it moved), or
  // the lift — and never by the wheel alone: the wheel names the angle, a
  // held lock finds that angle at any speed and parks there, and only what
  // goes past the name runs. Neither
  // a landing nor the chain drives it: the skitter already takes the grip,
  // the chain already deepens the ask and brings the breakaway forward,
  // and a car that came down hard and slid on tyres that were still
  // hopping is owed a wobble it can drive out of, not a spin it cannot —
  // the landing that goes further than that trips the car over instead
  // (`tripSlide`). Not the loop the slide model is built to avoid —
  // nothing here touches how much the car is sliding, only which way a
  // car already past the peak is turning. It hands over at `spinAt`: a
  // spun car is round and rotating on the momentum it has, and pushing it
  // on from here would carry it through backwards, where four dragged
  // tyres stop scrubbing.
  const counter = clamp(steer * backwards * Math.sign(car.slip), 0, 1);
  const carried = Math.max(car.thrown, lifted);
  // ...and it is a thing that happens at PACE. The model has no yaw inertia
  // — the nose answers its target at a rate — and what that leaves out is
  // exactly this: a car at 60 km/h has a tail its tyres can arrest, a car
  // at 120 has one they cannot. So the run comes in above the slide's own
  // floor, over `overSpeed` of it, which is also what keeps the lever's
  // hairpin — full lock and the handbrake held, well under the floor — a
  // pivot rather than a spin.
  const runPace = clamp((overGround - D.slideFrom) / (D.overSpeed * D.slideFrom), 0, 1);
  const overFrom = askedSlip + D.overFrom * D.angleBand * breakaway;
  const overPeak = clamp(
    (Math.abs(car.slip) - overFrom) /
      Math.max(D.overBand * breakaway, D.spinAt * breakaway - overFrom),
    0,
    1,
  );
  const runYaw =
    -Math.sign(car.slip) *
    D.overYaw *
    overPeak *
    carried *
    runPace *
    (1 - counter) *
    (1 - spun) *
    sliding *
    speedFactor;
  // ...and THROUGH THE SPIN (`spinCarry`, below the yaw's own settling):
  // past `spinAt` the tail is gone and the car turns on its momentum.
  const spinPace = clamp(overGround / D.slideFrom, 0, 1);
  // The slip's self-rotation scales with steering commitment, so holding
  // into the slide sustains it, releasing lets grip straighten the car, and
  // counter-steer exits fast. An unconditional slip term would be a
  // positive feedback loop — a car that never stops rotating once sideways.
  // Full commitment on the counter too: it damps the catch, which is what
  // keeps the exit a gather-up instead of a twitch.
  const commitment =
    T.steering.commitmentFloor + (1 - T.steering.commitmentFloor) * Math.abs(steer);
  /** How much the wheel is steered INTO the slide, 0..1 — what gates the
   * power's oversteer off while the driver is still asking for the angle. */
  const intoSlide = clamp(steer * -Math.sign(car.slip), 0, 1);
  // Through the speed floor like everything else that swings the tail: under
  // it the handbrake is a pair of locked rear wheels and nothing more, which
  // is what stops the lever from being a way round the floor at 30 km/h.
  const handbrakeYaw =
    lever * Math.sign(steer) * backwards * T.grip.handbrakeYaw * speedFactor * open;
  // The weight throw itself. Signed by the direction the RACK IS MOVING,
  // which is the way the mass is being sent — during the crossing the lock
  // itself is still on the old side and would throw the car backwards.
  const flickYaw = car.flickDir * backwards * T.grip.flickYaw * DR.flick * flick * speedFactor;
  // RWD power oversteer: the driven rear keeps feeding the slide — but only
  // once the wheel stops asking for the angle. Steered into the slide the
  // corner behaves classically (saturation parks it); released after the
  // turn, the tail lingers out for a beat before grip gathers the car up —
  // and a counter-steer settles it faster still. The soft sign keeps the
  // term from chattering through the instant the slip crosses centre.
  const tailDir = clamp(-car.slip / T.steering.tailSoftSlip, -1, 1);
  const powerYaw =
    tailDir *
    T.grip.powerYaw *
    DR.powerYaw *
    spec.torque *
    input.throttle *
    sliding *
    speedFactor *
    (1 - intoSlide);
  // The front axle's opposite number. Driven front wheels pull the car
  // toward where they POINT, so on a front-driver the throttle is the way
  // OUT of a slide and never into one — ungated by the wheel, because
  // power-on understeer is exactly what is felt while still asking for the
  // corner. The pedals swap jobs between the two layouts, which is the
  // single thing a player has to relearn moving between them.
  const pullStraight =
    car.slip *
    T.grip.pullStraight *
    DR.pullStraight *
    spec.torque *
    input.throttle *
    sliding *
    speedFactor;
  // ...and the same pull TIGHTENING a slow corner: the front-driver's
  // turn-in bite, strongest at the bottom of the gear and gone by the top
  // of it. Nothing at all on a rear-driver, which is why one is quick out
  // of a hairpin and the other is quick into it.
  const pullIn =
    steer *
    backwards *
    T.grip.pullIn *
    DR.pullIn *
    spec.torque *
    input.throttle *
    (1 - rev) *
    speedFactor;
  // A LIFT swings the tail: the weight comes off the driven axle and the
  // car rotates. `T.grip.liftGrip` is the other half of the same lift — one
  // tightens the line, this one swings the nose — and together they are how
  // a front-driver rotates at all without pulling the handbrake.
  // The rotation does not stop when the hands do. While the slide is letting
  // go, the yaw answers its target more slowly, so the nose keeps swinging
  // for a beat after the lock comes off and can carry a little PAST centre —
  // which is the dab of opposite lock on the way out of a big drift. It is
  // exactly zero while the wheel is still asking for the angle it has.
  const liftYaw =
    tailDir * T.grip.liftYaw * DR.liftYaw * (1 - input.throttle) * sliding * speedFactor;
  // ...and the BRAKE swings it harder, because the transfer is bigger: a
  // lift takes the drive off one axle, a brake stands the whole car on its
  // nose. It is what turns a trailed brake from a way of arriving slower
  // into a way of arriving pointed, and — with the depth it opens above —
  // it is how a front-driver gets round a corner it would otherwise wash
  // straight out of. Off the lagged load, so a stab on the straight is a
  // brake and nothing more.
  const brakeYaw = tailDir * T.grip.brakeYaw * DR.brake * car.brakeLoad * sliding * speedFactor;
  const releasing = clamp(sliding - asked, 0, 1);
  // ...and as it lets go the rear bites again and WEATHERVANES the car:
  // a torque pulling the nose back toward the direction the car is actually
  // travelling. That, against the yaw's own lag above, is a spring with
  // damping — which is what lets the nose swing back through centre and a
  // little past it instead of easing to zero and stopping there.
  // ...and neither the weathervane nor the slip's own self-straightening
  // below survives a spin whole (`spinHold`): they are the tyre's hold on
  // the car's travel read as a torque, and a spun tyre has let go.
  const hold = spun ? D.spinHold : 1;
  const straighten = car.slip * D.releaseSnap * DR.snap * releasing * speedFactor * hold;
  // Saturation gates EVERYTHING that deepens the slide except the power's
  // own oversteer; counter-steer keeps full authority, because it always
  // has somewhere to go.
  const yawTarget =
    (deepening ? steerTerm * sat : steerTerm) +
    handbrakeYaw * sat +
    flickYaw +
    pullIn +
    powerYaw +
    liftYaw * sat +
    brakeYaw * sat +
    pullStraight +
    straighten +
    runYaw -
    car.slip * T.grip.slipYaw * commitment * sat * sliding * hold;
  const yawResponse =
    (T.grip.yawResponse.grip + (T.grip.yawResponse.slide - T.grip.yawResponse.grip) * sliding) *
    (1 - D.releaseHang * releasing);
  car.yawRate += (yawTarget - car.yawRate) * clamp(yawResponse * dt, 0, 1);
  // THROUGH THE SPIN. The model has no yaw inertia — the nose chases a
  // target rate — and a spun car is the one place that shows: past
  // `spinAt` nothing under the car is holding the tail, and it turns on
  // the momentum it has, the way it was already turning (`spinDir`),
  // through backwards and on until the speed is scrubbed out of it
  // (`spinOut`) — where it stops is where it stops, and often enough that
  // is facing the way it came. So while spun the yaw never falls under
  // `spinCarry` in the spin's own direction (scaled by the ground speed
  // over the slide floor, and the counter takes only `spinSteer` of it
  // away, which is the spin the driver cannot influence enough to save).
  // A floor rather than a term in the target above: round on its tail the
  // car reads as straight, the slide shuts and the lock the driver still
  // has on steers the other way, and a target-rate term was cancelled to
  // nothing there — the car parked rolling backwards at pace with nothing
  // scrubbing it.
  if (car.spun) {
    const carry = car.spinDir * D.spinCarry * spinPace * (1 - counter * D.spinSteer);
    if (car.spinDir * car.yawRate < car.spinDir * carry) car.yawRate = carry;
  }

  const delta = car.yawRate * dt;
  car.heading += delta;
  rotateFrame(car, delta);
  updateSlip(car);

  // ── Longitudinal ─────────────────────────────────────────────────────────
  const shiftCut = ctx.t < car.shiftCutUntil ? 0 : 1;
  // How much of the pedal the tyres are refusing to take. Settled BEFORE the
  // torque is asked for, so the spin a stab of throttle lights costs that
  // same stab its shove rather than the next one's.
  settleLaunchSpin(spec, car, surfaceGrip, input.throttle * shiftCut, dt);
  // A folded radiator starves the engine, and past the misfire threshold the
  // ignition drops beats outright: a badly hurt car lurches up the road
  // instead of pulling up it. It limps — right up until the engine is dead,
  // and then nothing here pushes at all (step.ts retires the run once it
  // has coasted to a stop).
  const damagePower = hurt.power * hurt.firing;
  const accel =
    engineAccel(spec, car, surfaceGrip) *
    input.throttle *
    surfacePower *
    shiftCut *
    damagePower *
    ctx.drive;
  car.u += accel * dt;
  if (car.reversing) {
    // Backing out. The brake's own retardation is off while this runs, or the
    // two would fight over the same pedal and the car would sit still. Once
    // the pedal comes up the drivetrain gathers the car back to a stop —
    // rolling drag alone is tuned for a car with an engine holding it up
    // against it, and would let a released reverse coast on for a minute.
    car.u =
      input.brake > 0
        ? Math.max(-T.reverse.top, car.u - T.reverse.accel * input.brake * dt)
        : Math.min(0, car.u + T.reverse.coastStop * dt);
  } else {
    // THE LEVER IS A BRAKE. Two wheels dragged down the road is about a
    // third of what four of them do (`grip.handbrakeBrake`), and the model
    // used to charge nothing for it at all: the lever unstuck the rear, span
    // the car and cost it no speed, so the last resort was the cheapest move
    // in the game and there was never a reason not to hold it.
    //
    // The DEEPER of the two demands rather than their sum: with the pedal
    // already down the rears are locked whichever handle did it, and a
    // driver standing on both is owed one axle's worth of braking, not
    // three. The pedal's own damage (`hurt.brake` — a boiled circuit, a
    // hose) is on both, because a lever that has lost its cable has already
    // been taken away up at `lever` itself.
    const pedal = Math.max(input.brake, lever * T.grip.handbrakeBrake);
    // A spent chassis cannot hold its hubs square, so the car pulls up long.
    car.u -= spec.brake * hurt.brake * pedal * Math.sign(car.u) * dt;
  }
  // Torn bodywork, a ploughing floorpan and a shell that is no longer the
  // shape it was drawn as, all on top of what the surface itself costs.
  car.u -= (surfaceDrag + hurt.drag) * car.u * dt;
  // ...and what a seized engine or a hub on the road takes at ANY speed:
  // the constant part, which is what brings a car that cannot drive to
  // the standstill the retire rule is waiting for (damage.ts).
  if (hurt.coastBrake > 0 && !car.reversing) {
    car.u -= Math.sign(car.u) * Math.min(Math.abs(car.u), hurt.coastBrake * dt);
  }
  if (ctx.surface === "nature") {
    // The rough-ground cap: open nature is fast but never road-fast.
    car.u -= Math.max(0, car.u - T.surfaces.natureTop) * T.surfaces.natureOverDrag * dt;
  }
  // Grade: gravity along the road — the hills push back (or push on). A
  // face steeper than the car can climb pushes back HARDER, which is what
  // stops a car nosed into a bank in a couple of steps and rolls it back
  // out; but the descent is no steeper than a hill the car can stand on:
  // the grade is read over a baseline, and within it of a cliff lip it
  // reports the whole drop as a slope, which as gravity hurried a car
  // creeping toward the edge over it at several g. A drop is flown, never
  // driven down (the takeoff below).
  const grade = Math.max(ctx.slope, -T.collision.climbLimit);
  car.u -= 9.8 * T.hills.gravityAlong * grade * dt;
  // The standstill snap, which is also what stops a car creeping on a slope.
  // It has to stand down while the car is backing out, or reverse never gets
  // past its own first tick.
  if (Math.abs(car.u) < T.standstill && input.throttle === 0 && !car.reversing) car.u = 0;

  // The nose, as a vector. Nothing below turns the car — the yaw is long
  // since integrated — so the wind's head/tail component and the move at
  // the bottom are the same heading read once.
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);

  // ── Wind ─────────────────────────────────────────────────────────────────
  // Head/tailwind on the top end; the sideways carry is applied in the move.
  {
    const along = ctx.windX * sinH + ctx.windZ * cosH;
    car.u += along * T.wind.longForce * dt;
  }

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
  if (goesOver(car.roll, car.rollRate) || !onItsWheels(car.roll)) {
    beginRoll(car, events, stats);
    return;
  }
  const camber = ctx.slopeLat ? Math.atan(ctx.slopeLat) : 0;
  car.roll += (camber - rollTilt(car.roll)) * clamp(T.air.rollRecover * dt, 0, 1);
  settlePitch(car, Math.atan(ctx.slope));

  // ── Drift readout ────────────────────────────────────────────────────────
  // Nothing in the model above branches on this: it is what the dust, the
  // HUD and the balance table read off a car that happens to be sideways.
  car.slide = sliding;
  // In the surface's own units, like every other angle in this group: what
  // counts as sideways on a sealed road is a fraction of what counts as
  // sideways on gravel, and one absolute threshold made tarmac a surface
  // that could not be drifted rather than one that is drifted less.
  const angle = (car.drifting ? T.drift.exitSlip : T.drift.enterSlip) * breakaway;
  // A car has to be genuinely SLIDING to be drifting, not merely pointed a
  // few degrees off its own line: below the layout's speed floor the slide
  // is shut and a hard turn is understeer, which is not a drift and must not
  // light the dust, the HUD or the balance table's counter.
  const drifting = Math.abs(car.slip) > angle && sliding > 0;
  // THE CHAIN cools the whole time and is stepped once per drift STARTED,
  // which is the one place in the step that knows a drift began rather than
  // continued. Booking it off the count rather than off time spent sliding
  // is what keeps it out of the feedback loop this whole group is built to
  // avoid: nothing a deep drift does makes it deeper, and one long committed
  // slide leaves no more behind than one short one.
  car.chain = Math.max(0, car.chain - D.linkFade * dt);
  if (drifting) {
    if (!car.drifting) {
      stats.driftCount += 1;
      car.chain = Math.min(1, car.chain + D.linkStep);
    }
    stats.driftTime += dt;
    stats.driftScore += Math.abs(car.slip) * car.u * dt;
  }
  car.drifting = drifting;

  // ── Move ─────────────────────────────────────────────────────────────────
  const carry = windCarry(car);
  // Where the step started: what the ground has to be measured against to
  // tell a hill the wheels climb from a wall that refuses them.
  const fromX = car.x;
  const fromZ = car.z;
  car.x += (sinH * car.u + cosH * car.w + ctx.windX * carry) * dt;
  car.z += (cosH * car.u - sinH * car.w + ctx.windZ * carry) * dt;

  // ── Ground follow / takeoff ──────────────────────────────────────────────
  // The car RIDES the road: its vertical speed is the road's own, so a ramp
  // pitches the nose up and a dip drops it, smoothly, with no hop (the
  // renderer reads the attitude straight off vy/u). It leaves the ground
  // only when the road falls away faster than gravity could pull it down —
  // so the same crest launches you at pace and holds you at a crawl.
  // The wheels climb whatever the ground does under the DIRECTION OF TRAVEL,
  // which in a slide is nowhere near the heading. `slope` and `slopeLat` are
  // the ground's gradient resolved onto the car's own axes and (u, w) is its
  // velocity on those same axes, so the pair of them is the gradient dotted
  // with the velocity — the same number whichever way the car is pointing.
  // Taking only the along-heading half made a car sliding across a uniform
  // hillside report a vertical speed that swung with its own yaw. The jolt
  // cap below now hides most of what that cost the springs, but this is also
  // the number the landings, the bounce and the renderer read, and it should
  // be the speed the wheels are actually going up or down at.
  const roadVy = car.u * ctx.slope + car.w * (ctx.slopeLat ?? 0);
  // Both takeoff gates below are on the speed the car is COVERING GROUND
  // at, not on the speed it is pointing at. Sideways, those are different
  // numbers — a car at full lock crossing a lip has most of its pace in
  // `w` — and reading `u` alone glued every drift to the ground exactly
  // where a drift most wants to fly: over a crest, off a ledge, over the
  // top of a mountain. The lip does not care which way the nose is.
  const pace = Math.hypot(car.u, car.w);
  // The far end of the same number the tires were weighed with at the top of
  // the step: how hard the ground is asking to be followed down.
  const roadPull = groundPull(ctx.roadCurve, pace);
  // Ride the ground under the wheels, read where the car actually IS — a
  // slide carries the car ACROSS the slope, which the along-heading slope
  // can't see, and a road is read the same way so that leaving it and
  // coming back onto it is one continuous surface.
  //
  // THE EDGE. A cliff lip or a cut bank falls away by more than `edgeDrop`
  // under the car's middle in one step — at pace that is a flight, not a
  // face to be driven down, and at a crawl it is a drop. Everything else
  // the ground can do — a lip, a kink, a brow, a step the wheels cannot
  // follow — is the body's own momentum against the ground below.
  const at = readSeat(car, ctx);
  // PROPPED ON A FACE. Out in the wild the seat is lifted off the ground
  // under the middle by whatever corner asks for the most, and a corner up
  // against a face the wheels cannot climb asks for the top of its reach
  // (ground.ts, `corners`): a car nosed into a bank sits on a plane a couple
  // of metres up it. That plane is the contact model's fiction, not a hill
  // the body is standing on, and it comes down as fast as the car backs off
  // the face — so the body follows it, the way it follows the wall check,
  // and the momentum model below starts again only once the seat is back
  // within the wheels' reach of the ground. Without this a car reversing
  // off a bank was thrown a body-height into the air and fell for the
  // better part of a second before the driver had it back.
  if (at.seat - at.centre > T.air.leave) {
    car.loft = 0;
    car.loftRate = 0;
    car.foot = at.foot - at.centre;
    car.footVy = 0;
    car.footMean = 0;
    standOn(spec, car, ctx, at, fromX, fromZ, roadVy, events, stats);
  } else {
    // THE BODY HAS ITS OWN VERTICAL MOMENTUM. It arrives at this step with
    // the vertical speed it had (`prevVy` — the ground's own while the ground
    // was carrying it, its own once it was not) and falls from there at
    // `air.hold` of gravity; the ground can only ever push it UP. So the body
    // is put where its momentum takes it and compared with the ground the
    // wheels have just found: under the ground, and the ground has the car;
    // above it, and the ground is falling away faster than the body can
    // follow — the wheels reach down after it on their droop and the gap
    // between the two is `car.loft`. For the first `air.loft` of that the car
    // is grounded and light, its body up off the arches; past it the wheels
    // have run out of reach and it is flying with the speed it has actually
    // got, which is what makes a crest a MOMENT at pace and nothing at a
    // crawl: the same brow holds a slow car, unloads a quick one and throws a
    // fast one, and the one it only just throws lifts off late and low.
    //
    // The body carries the SMOOTHED grade's speed while it is carried, so a
    // rut, a kerb or the bump layer at pace — shapes the springs absorb, read
    // off the raw ground under the wheels — open a gap of a few centimetres
    // that the next rise closes, and only the shape of the hill can reach
    // past the droop. What the smoothing hides at a lattice crease or a road
    // crown is exactly what this catches: the ground turns down under a body
    // still going up, and the car skips.
    //
    // A HOP — a lift the flight's own gravity would have had back before it
    // was anything — is marked as one (`launch`'s `hop`), so it bobs the car
    // over a brow without booking a jump. A cliff edge is found by the rule
    // above before the body gets here; a jump LIP (R6) is flagged by the
    // road, and the flight it throws the car into is a jump whatever the
    // grade it sits on, with the launch speed the lip is designed around:
    // the wheels are on the steepest last metre of the ramp when the ground
    // drops away and the body, a wheelbase long, is carrying the ramp's
    // average — `launchKeep` of the wheels' climb, or the smoothed grade's,
    // whichever is more. From either direction: a car coming back the other
    // way climbs the landing face and is thrown off the top of it.
    //
    // The gap is grown from the two SPEEDS — the body's against the wheels'
    // over the ground they actually covered — and never read off heights: the
    // seat the body sits on also moves as the attitude settles onto a
    // hillside, and that is the body being lifted, not the ground going
    // anywhere. The wheels' speed is the FOOT's (ground.ts, `Seat.foot`): the
    // mean of the four, because the body rides the four and not the point
    // under its middle — a rut takes one wheel down a hand's width and the
    // body a quarter of that, and a bump shorter than the wheelbase is under
    // one axle at a time. Read off the centre alone, the road's own
    // cross-section lofted a car crossing it at a crawl. And the speed the
    // body ARRIVES with is the SMALLEST of the three it could have: the
    // smoothed grade's, which against a wall says the car is climbing at
    // absurd speed while the wheels go nowhere, and four metres short of a
    // cliff lip says it is already diving; the middle's own, which a kerb
    // spikes for one step while the body has not moved; and the foot's,
    // whose corners are inside the wall before the middle has reached it.
    // Only ground the car has actually been carried along carries the body
    // on — and a body already up off its wheels is carrying its own speed,
    // which nothing under it bounds.
    //
    // ...smallest going UP. Going DOWN the body is never slower than the foot
    // has been: the smoothed grade under a car sliding across a banked,
    // crowned road reads a gentler descent than the wheels are actually on,
    // and a body reset to that every step kept falling behind ground that
    // was only doing what it had done for the last second — a car drifting
    // across a wide S-bend lifted off nothing. What the foot has BEEN doing
    // is read over `air.footLag` (`car.footMean`), so one step's blip in a
    // four-wheel mean crossing the ruts sideways is not a speed the body
    // has to have; the gap itself is still grown from the raw speed, and
    // the springs answer that.
    const smallest = (a: number, b: number): number => (Math.abs(a) < Math.abs(b) ? a : b);
    const carriedVy =
      car.loft > 0
        ? prevVy
        : Math.min(smallest(smallest(prevVy, prevWheelVy), car.footVy), car.footMean);
    const bodyVy = carriedVy - T.air.gravity * T.air.hold * dt;
    const footVy = ctx.lip ? wheelSpeed(ctx, at.centre) : (at.foot - (ctx.groundY + car.foot)) / dt;
    const loft = Math.max(0, car.loft + (bodyVy - footVy) * dt);
    car.foot = at.foot - at.centre;
    car.footVy = footVy;
    car.footMean += (footVy - car.footMean) * clamp(dt / T.air.footLag, 0, 1);
    if (at.centre < ctx.groundY - T.air.edgeDrop) {
      // Off the edge with the speed the body has, which off a cliff lip is
      // none of the dive the grade ahead of it reads: the car sails off at
      // pace and DROPS at a crawl — a car creeping over an edge falls from
      // where it was, it is never set down the face. The drop is the GROUND
      // under the middle falling away, never the seat: a car sliding along a
      // face it cannot climb is held up on a corner, and that lift coming
      // off as it slides clear is not a cliff.
      launch(car, bodyVy, events, stats, pace < T.air.crestSpeed);
    } else if (ctx.lip && bodyVy - footVy >= T.air.edgeSpeed) {
      // THE LIP. The ground under the middle has just gone at edge speed
      // within reach of a flagged jump lip: the car leaves NOW, from the top
      // of the ramp, and not two steps down the landing face when the reach
      // has run out — with the launch speed the lip is designed around.
      launch(car, Math.max(roadVy, prevWheelVy * T.air.launchKeep, bodyVy), events, stats);
    } else if (loft <= 0) {
      car.loft = 0;
      car.loftRate = 0;
      standOn(spec, car, ctx, at, fromX, fromZ, roadVy, events, stats);
    } else {
      // The wheels stand on the ground (the wall check included); the body
      // is up off them, at its own speed — which is what the camera, the
      // attitude and the springs read, so a lifting body rides its springs
      // out to the droop the way a car cresting a brow does.
      standOn(spec, car, ctx, at, fromX, fromZ, roadVy, events, stats);
      // The body is never more than `leave` above the wheels: past that the
      // rest of the gap is ground the wheels have already left, and the
      // body's height is the reach, not the drop. Between `loft` and `leave`
      // the car is SKIPPING — the wheels off the ground for a few tenths,
      // the tyres carrying nothing, the car still steered — which is what a
      // bump at pace does to a real car and the whole difference between
      // going light over one and flying off it.
      car.loft = Math.min(loft, T.air.leave);
      car.loftRate = bodyVy - footVy;
      car.vy = bodyVy;
      // A jump is the body going UP off the ground at `hopRate` or more, at
      // pace, over ground that is falling away faster than the flight's own
      // gravity could follow. Everything else is a hop or a drop: the ground
      // going away under a body that was barely rising, or not at all — a
      // bump, the crown of a road, a car backing off a face its nose had
      // ridden up, a creep over an edge — or a brow the flight's gravity
      // would have held the car on (`hold`), which the body bobs over; and
      // only the air's own length can make a flight of that (`hopTime`).
      // ...and a body that came off its wheels over a brow left tyres that
      // had unloaded across the whole of the loft; one whose foot plunged at
      // edge speed left tyres that were holding it a step ago — the trip.
      if (loft > T.air.leave) {
        const hop = pace < T.air.crestSpeed || bodyVy < T.air.hopRate || roadPull < T.air.gravity;
        launch(car, bodyVy, events, stats, hop, car.loftRate >= T.air.edgeSpeed);
      }
    }
  }

  // ── Suspension ───────────────────────────────────────────────────────────
  // Whatever the ground just did to the wheels, the body has to catch up
  // with: the shape under the car, capped, and the bumps in it, on their own
  // ceiling (ground.ts). Landings and impacts arrive as velocity steps of
  // their own and are not capped here. A car that has just launched has
  // nothing under its wheels to be jolted by.
  const jolt = car.airborne ? 0 : groundJolt(car, prevVy, prevWheelVy);
  stepSuspension(spec, car, jolt, (car.u - prevU) / dt);
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
  settleWheelspin(spec, car, wheelspinShare(spec, car, surfaceGrip, input.throttle * shiftCut), dt);
}

/** One airborne physics step. The velocity vector is committed; the nose
 * answers only faintly and turbulence rolls the car — flight is flight.
 * The landing at the end of it is where the car's weight is loudest: the
 * springs take what they can, the underside takes the rest, and a slam
 * past what either can swallow throws the whole car back off the ground. */
export function stepAirborne(
  spec: CarSpec,
  car: CarState,
  input: CarInput,
  ctx: GroundContext,
  events: GameEvent[],
  stats: RunStats,
): void {
  // Nothing is thrown across a car whose wheels are off the ground: the
  // flick's load settles out in the air rather than waiting to be spent on
  // whatever the landing finds. The rear a move had unstuck settles with
  // it — there is nothing under it to be stuck to.
  car.flick = Math.max(0, car.flick - T.steering.flickSettle * T.dt);
  car.provoked = Math.max(0, car.provoked - D.provokeSettle * T.dt);
  // The chain the last corner left cools in the air like everything else the
  // tires are carrying — a jump between two corners is rubber getting a rest
  // — and nothing off the ground is spinning: a car crossed up in flight is
  // a car crossed up in flight, and the tires decide again when it lands.
  car.chain = Math.max(0, car.chain - D.linkFade * T.dt);
  car.spun = false;
  const dt = T.dt;
  const descent = car.vy;
  car.airTime += dt;
  if (!car.settling) stats.airTime += dt;
  car.steer += (input.steer - car.steer) * clamp(T.steering.rackRate * dt, 0, 1);
  car.braking = false;
  car.locked = false; // ...and nothing under the wheels to drag them across
  car.reversing = false; // nothing to back out of in the air

  car.yawRate += car.steer * T.air.yawAuthority * dt;
  // A bounce is not a flight: the car is settling onto the ground it has
  // already hit, so the air's own hands stay off it.
  const air = car.settling ? 0 : 1;
  car.yawRate += (ctx.rng.next() - 0.5) * 2 * T.air.turbulence * air * dt;
  // The body keeps rolling the way the take-off sent it — the wheel does
  // nothing about it, which is the whole point of being in the air.
  car.rollRate += (ctx.rng.next() - 0.5) * 2 * T.air.rollTurbulence * air * dt;
  car.rollRate *= Math.exp(-T.air.rollDamp * dt);
  car.roll += car.rollRate * dt;
  const delta = car.yawRate * dt;
  car.heading += delta;
  rotateFrame(car, delta);
  car.u -= T.air.drag * car.u * dt;
  updateSlip(car);

  // Nothing is holding the driven wheels back off the ground, so they answer
  // the throttle alone and wind straight to the limiter — the undriven pair
  // keeps turning at whatever the road handed them at take-off. It goes after
  // the yaw: a car spinning in the air trades sideways speed for forward
  // speed every step, and a spin sized against the old one would leave the
  // wheels turning faster than the engine driving them.
  settleWheelspin(spec, car, input.throttle > 0 ? 1 : 0, dt);

  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const carry = windCarry(car);
  car.x += (sinH * car.u + cosH * car.w + ctx.windX * carry) * dt;
  car.z += (cosH * car.u - sinH * car.w + ctx.windZ * carry) * dt;
  car.vy -= T.air.gravity * dt;
  car.y += car.vy * dt;
  // In the air the nose follows the arc: up over the launch, down into the
  // landing. The speed floor keeps a near-vertical plunge from reading as a
  // right angle when the forward speed has all but gone.
  settlePitch(car, Math.atan2(car.vy, Math.max(6, Math.hypot(car.u, car.w))));

  // The ground under where the car has just moved TO — the road's profile
  // or the terrain, whichever the step is over, read there and not carried
  // forward from where the flight began: on a steep descent a stale height
  // is already above the road, which lands the car in mid-air.
  const groundNow = ctx.groundAt(car.x, car.z);
  // A hop or a bounce that finds the ground gone from under it — the body
  // bobbed over a brow and the far side was a lip, or the edge — is a
  // flight from here on: it draws the air's turbulence, books its air, and
  // is the jump the takeoff never announced.
  if (car.settling && car.airTime > T.air.hopTime) {
    car.settling = false;
    events.push({ type: "takeoff", vy: car.vy });
    stats.jumps += 1;
  }
  // WHERE THE CAR MEETS THE GROUND. Its wheels on an ordinary flight; a
  // corner of the shell on one that is going over (roll.ts, `rollStand` —
  // exactly zero for any car that is not rolling, so a jump is unchanged
  // by its being here).
  const meets = groundNow + rollStand(car);
  if (car.y <= meets && (car.rolling || !onItsWheels(car.roll))) {
    // Nothing for the tyres to do: it is a corner of the body arriving,
    // and the roll that put it there carries on from the contact.
    landRolled(spec, car, groundNow, ctx.rng, events, stats);
    return;
  }
  if (car.y <= meets) {
    car.y = meets;
    car.airborne = false;
    // The wheels arrive at the ground's own speed along the path — read off
    // the ground itself over the last step's travel, never off the smoothed
    // grade: at the foot of a cliff the grade over a wheelbase says the car
    // is climbing at absurd speed, and a first grounded step handed that as
    // the wheels' momentum reads the slope it landed on as an edge and
    // throws the car straight back off it. The landing below is the jolt;
    // this only says what the wheels are doing from here on.
    const behind = ctx.groundAt(
      car.x - (sinH * car.u + cosH * car.w) * dt,
      car.z - (cosH * car.u - sinH * car.w) * dt,
    );
    car.wheelVy = (groundNow - behind) / dt;
    // ...and the foot the next grounded step measures its wheels from,
    // moving at the speed the ground here is: the flight's own speed is
    // what the springs get, not what the body carries on with.
    car.foot = footOn(car, ctx.groundAt) - groundNow;
    car.footVy = car.wheelVy;
    car.footMean = car.wheelVy;
    // A SOFT touchdown — the chassis coming back down off its own bounce,
    // or a hop's few centimetres of lift closing again — is one landing
    // still happening, not a new arrival: it pays no speed, unsettles no
    // tyres and trips nothing, and the springs are the whole of it.
    const soft = car.settling;
    // Straight nose AND upright: coming down on your side is never clean,
    // however well the nose was lined up.
    const clean =
      soft ||
      (Math.abs(car.slip) <= T.air.cleanSlipLimit &&
        Math.abs(rollTilt(car.roll)) < T.air.rollLandLimit);
    if (soft) {
      // Nothing to pay.
    } else if (clean) {
      car.u *= T.air.cleanKeep;
      stats.cleanLandings += 1;
    } else {
      car.u *= T.air.sloppyKeep;
      // Shot dampers let the whole car skip and hunt on a bad touchdown.
      const wobble = 1 + T.collision.systems.wobble * car.damage.systems.suspension;
      car.yawRate += -Math.sign(car.slip) * T.air.sloppyWobble * wobble;
    }
    // ...and a car that came down going SIDEWAYS may not be coming down on
    // its wheels for long: the tyres bite, the body does not, and it trips.
    const tumbling = !soft && tripOnLanding(spec, car, ctx.surface, events, stats);
    // The ground hits back: descent the suspension cannot absorb crushes
    // the underside (collision.ts).
    const slam = car.u * ctx.slope - car.vy;
    // ...and the wheels start hopping on their own tires. That is what the
    // car is doing for the next half second, and until it stops the tires
    // are only intermittently holding anything (`tyreLoad`). It takes the
    // HARDEST arrival so far rather than adding: a slam followed by its own
    // small rebound is ONE landing, and a chassis bounce must not stack its
    // way into a car with no grip at all.
    if (!soft) car.settle = Math.max(car.settle, clamp(slam / T.suspension.settleSlam, 0, 1));
    landingDamage(spec, car, slam, events, stats);
    // Pick the road's own vertical speed back up instead of zeroing: land on
    // a brow and the car may be off the ground again next step, and a stale
    // zero there is a bounce where there should be a flight.
    car.vy = car.u * ctx.slope;
    events.push({ type: "landing", airTime: car.airTime, slam, clean });
    car.airTime = 0;
    if (tumbling) {
      // OVER IT GOES: the trip is worth more than the lift up over the
      // body's own sill corner, so the centre carries past it and nothing
      // brings the car back. Neither a bounce nor a flight — the roll owns
      // it from the next step, on the ground, turning (roll.ts).
      car.settling = false;
    } else {
      // Past what the springs can travel through, the CHASSIS comes back
      // off the ground — a real bounce, small and capped, that lands again
      // a beat later. Each rebound is a fraction of the last, so a slam
      // bounces once or twice and is done; it can never turn into a second
      // jump.
      const rebound = slam - T.suspension.bounceSpeed;
      if (rebound > 0) {
        car.airborne = true;
        car.settling = true;
        car.vy += Math.min(rebound * T.suspension.bounceKeep, T.suspension.bounceMax);
      } else {
        car.settling = false;
      }
    }
    // The springs take the whole descent as one jolt whether the chassis
    // came back up or not: this is the squat a landing travels through.
    stepSuspension(spec, car, car.vy - descent, 0);
    return;
  }
  stepSuspension(spec, car, 0, 0);
}

/** THE TRIP. A car that touches down with the body still travelling
 * sideways has tyres that stop and a roof that does not: the bottom of the
 * car catches on the ground it has just been handed and the top keeps
 * going, over the outside wheels. Below `air.tripSlide` of sideways speed
 * the tyres spend it as a skip; past it, every further m/s is roll put
 * into the body.
 *
 * Whether that is a LEAN or a ROLL is not decided here and is not a number
 * anywhere: `goesOver` weighs the roll the body has just been handed
 * against the lift up to its own sill corner (roll.ts). Under it the
 * springs take the lurch back (`leanDamp`, `rollRecover`) and the car
 * drives on; over it the car is past its outside wheels and the roll owns
 * it — which is why the same landing can be survivable at one attitude and
 * not at another.
 *
 * WHAT THE TYRES ARE STANDING ON decides how hard it is, because the trip
 * IS the tyre biting: rubber that grips checks the bottom of the car hard
 * and sends the top over it, rubber that ploughs lets the whole car wash
 * sideways instead. It scales the ROLL the bite puts in and not the
 * sideways speed that is spent skipping first — that one is the tyre
 * failing to bite at all, which is the same speed whatever it is failing
 * to bite on, and scaling both would price the surface into the trip
 * twice. Read against gravel, which is the surface the numbers above are
 * written for: a crossed-up landing on tarmac is the one that goes over,
 * and the same landing in a sand section is a long ugly slide that stays
 * on its wheels. Returns true when the car is going over. */
function tripOnLanding(
  spec: CarSpec,
  car: CarState,
  surface: Surface | "nature",
  events: GameEvent[],
  stats: RunStats,
): boolean {
  const A = T.air;
  const bite = surfaceGripFor(spec, surface) / surfaceGripFor(spec, "gravel");
  const over = Math.abs(car.w) - A.tripSlide;
  if (over > 0) {
    // Sliding to the right, the right wheels dig in and the body goes over
    // them: the right side down, which is negative roll.
    car.rollRate -= Math.sign(car.w) * Math.min(over * A.tripRoll * bite, A.tripMax);
    car.w *= A.tripKeep;
    updateSlip(car);
  }
  if (!goesOver(car.roll, car.rollRate)) return false;
  beginRoll(car, events, stats);
  return true;
}
