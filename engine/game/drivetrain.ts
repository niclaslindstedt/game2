// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVETRAIN — what the engine is making, what the gearbox is doing with
// it, and how much of it the driven axle is throwing away as wheelspin.
//
// One question runs through all of it: the tyres can only put down what the
// surface will take, so everything above the contact patch is a negotiation
// between the pedal, the gear the car happens to be in, and the grip under
// it. What is left over is not lost — it is SPIN, and spin is a readout the
// rest of the game draws dust and noise off.
//
// `car.ts` owns the step that calls this; the numbers are in `defs/`.

import { clamp } from "../lib/math.ts";
import { surfaceGripFor } from "./limits.ts";
import type { DamageEffects } from "./damage.ts";
import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import type { CarInput, CarState, GameEvent } from "./state.ts";
import type { Surface } from "../mapgen/index.ts";

const T = TUNING;

/** Where inside the current gear the engine is, 0 at the bottom and 1 at
 * the top. Both halves of `spec.torque` run off it — the curve that decides
 * where the shove lives, and the wheelspin that decides how much of it ever
 * reaches the ground — because both are at their most extreme where there
 * is most torque and least speed. */
export function revs(spec: CarSpec, car: CarState, speed: number): number {
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
export function settleLaunchSpin(
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
export function wheelspinShare(
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
export function settleWheelspin(spec: CarSpec, car: CarState, share: number, dt: number): void {
  const room = spinHeadroom(spec, car);
  car.wheelspin += (room * share - car.wheelspin) * clamp(T.engine.spinSettle * dt, 0, 1);
  car.wheelspin = clamp(car.wheelspin, 0, room);
}

export function engineAccel(spec: CarSpec, car: CarState, surfaceGrip: number): number {
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

export function stepGearbox(
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
