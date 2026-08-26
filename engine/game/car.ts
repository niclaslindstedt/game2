// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The handling model — one grounded step and one airborne step of the car.
// Everything here serves three moments: the drift (enter with a flick or the
// handbrake, hold it sideways against counter-steer, exit clean for a
// boost), the jump (the lip throws you, the air is committed — velocity is
// fixed, the nose barely answers), and the landing (aligned keeps your
// speed, sideways scrubs it and wobbles). Numbers live in defs/, not here.

import { clamp } from "../lib/math.ts";
import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import type { CarInput, CarState, GameEvent, RunStats } from "./state.ts";
import type { Rng } from "../lib/prng.ts";

const T = TUNING;

/** Rotate the car-frame velocity when the nose turns by `delta`. The world
 * velocity is unchanged — this is what makes yawing at speed build slip. */
function rotateFrame(car: CarState, delta: number): void {
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  const u = car.u * cos + car.w * sin;
  const w = -car.u * sin + car.w * cos;
  car.u = u;
  car.w = w;
}

function engineAccel(spec: CarSpec, car: CarState): number {
  // Full torque through most of the gear, smoothly tapering to zero at the
  // gear's top speed. The taper starts late (last ~18%) so the equilibrium
  // against rolling drag sits close to gearTop and the shift-up threshold
  // is actually reachable — a long asymptotic curve would stall below it.
  const top = spec.gearTop[car.gear];
  const headroom = clamp((top - car.u) / (top * 0.18), 0, 1);
  const taper = headroom * headroom * (3 - 2 * headroom);
  return spec.gearAccel[car.gear] * taper;
}

function stepGearbox(
  spec: CarSpec,
  car: CarState,
  input: CarInput,
  t: number,
  events: GameEvent[],
): void {
  const maxGear = spec.gearTop.length - 1;
  if (spec.gearbox === "auto") {
    if (car.gear < maxGear && car.u > spec.gearTop[car.gear] * T.gearbox.upAt) {
      car.gear += 1;
      events.push({ type: "shift", gear: car.gear });
    } else if (car.gear > 0 && car.u < spec.gearTop[car.gear - 1] * T.gearbox.downAt) {
      car.gear -= 1;
      events.push({ type: "shift", gear: car.gear });
    }
    return;
  }
  if (input.shiftUp && car.gear < maxGear) {
    car.gear += 1;
    car.shiftCutUntil = t + T.gearbox.shiftCut;
    events.push({ type: "shift", gear: car.gear });
  } else if (input.shiftDown && car.gear > 0) {
    car.gear -= 1;
    car.shiftCutUntil = t + T.gearbox.shiftCut;
    events.push({ type: "shift", gear: car.gear });
  }
}

function updateSlip(car: CarState): void {
  car.slip = Math.atan2(car.w, Math.max(1, Math.abs(car.u)));
}

function startDrift(car: CarState, dir: number, kick: number): void {
  car.drifting = true;
  car.driftTime = 0;
  car.driftSlipSum = 0;
  // The entry kick throws the tail out of the steered direction and gives
  // the nose a matching rotation. At full scale (the handbrake) the car
  // snaps sideways immediately; the speed entry uses a fraction so the
  // rear steps out instead of snapping.
  car.w -= dir * T.drift.kick * kick;
  car.yawRate += dir * T.drift.yawKick * kick;
}

function endDrift(spec: CarSpec, car: CarState, events: GameEvent[], stats: RunStats): void {
  const duration = car.driftTime;
  const avgSlip = duration > 0 ? car.driftSlipSum / duration : 0;
  const clean = duration >= T.drift.minDuration && avgSlip >= T.drift.cleanSlip;
  const boost = clean ? Math.min(T.drift.boostCap, spec.driftBoostRate * duration) : 0;
  car.drifting = false;
  car.u += boost;
  if (clean) stats.cleanDrifts += 1;
  events.push({ type: "driftEnd", duration, avgSlip, clean, boost });
}

export type GroundContext = {
  surface: "gravel" | "water" | "grass";
  /** Road elevation under the car after this step's move. */
  groundY: number;
  /** Road slope dy/ds at the car for launch computation. */
  slope: number;
  /** True when this step crossed a jump lip. */
  onLip: boolean;
  /** Current wind velocity, world space m/s. */
  windX: number;
  windZ: number;
  t: number;
  rng: Rng;
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
  const surfaceGrip = T.surfaces.grip[ctx.surface];
  const surfaceDrag = T.surfaces.drag[ctx.surface];
  const surfacePower = T.surfaces.power[ctx.surface];

  car.steer = input.steer;
  car.braking = input.brake > 0.2 && Math.abs(car.u) > 3;

  stepGearbox(spec, car, input, ctx.t, events);

  // ── Yaw ──────────────────────────────────────────────────────────────────
  // Steering authority fades with speed (stability) and with standstill
  // (you cannot pivot a parked car). Drifting adds authority and the slip
  // itself rotates the car — the tail leads, you catch it on the counter.
  const speedFactor = clamp(car.u / 6, 0, 1);
  const steerGain = (spec.steerRate / (1 + car.u / 20)) * speedFactor;
  let yawTarget = input.steer * steerGain;
  if (car.drifting) {
    // The slide is held by the wheel: the slip's self-rotation scales with
    // steering commitment, so holding into the slide sustains it, releasing
    // lets the grip straighten the car, and counter-steer exits fast. An
    // unconditional slip term would be a positive feedback loop — a car
    // that never stops rotating once sideways.
    const commitment = 0.25 + 0.75 * Math.abs(input.steer);
    // And the slide SATURATES: past ~28° of slip the deepening forces fade
    // to nothing, so a held flick parks the car at a big, stable, movie
    // drift angle instead of spinning it to a stop.
    const sat = clamp(1 - (Math.abs(car.slip) - 0.5) / 0.2, 0, 1);
    const deepening = Math.sign(input.steer) === -Math.sign(car.slip) && car.slip !== 0;
    // Saturation gates EVERYTHING that deepens the slide — held full lock
    // parks the car at the equilibrium angle; only counter-steer keeps full
    // authority, because it always has somewhere to go.
    const steerTerm = input.steer * (steerGain + spec.driftYaw * speedFactor);
    yawTarget =
      (deepening ? steerTerm * sat : steerTerm) - car.slip * T.drift.slipYaw * commitment * sat;
  }
  const yawResponse = car.drifting ? T.drift.counterDamp + 4 : 8;
  car.yawRate += (yawTarget - car.yawRate) * clamp(yawResponse * dt, 0, 1);

  const delta = car.yawRate * dt;
  car.heading += delta;
  rotateFrame(car, delta);

  // ── Longitudinal ─────────────────────────────────────────────────────────
  const shiftCut = ctx.t < car.shiftCutUntil ? 0 : 1;
  const accel = engineAccel(spec, car) * input.throttle * surfacePower * shiftCut;
  car.u += accel * dt;
  car.u -= spec.brake * input.brake * Math.sign(car.u) * dt;
  car.u -= surfaceDrag * car.u * dt;
  // Grade: gravity along the road — the hills push back (or push on).
  car.u -= 9.8 * T.hills.gravityAlong * ctx.slope * dt;
  if (input.handbrake) car.u -= 4 * Math.sign(car.u) * dt;
  if (Math.abs(car.u) < 0.05 && input.throttle === 0) car.u = 0;

  // ── Boost ────────────────────────────────────────────────────────────────
  // The finite booster: raw thrust on top of engine torque, ignoring gearing
  // and surface, fading to zero toward the overrun cap so it stretches the
  // top end rather than breaking it. The tank never refills — see freshCar.
  const burning = input.boost && car.boostLeft > 0;
  if (burning && !car.boosting) events.push({ type: "boostStart" });
  car.boosting = burning;
  if (burning) {
    const cap = spec.gearTop[spec.gearTop.length - 1] * T.boost.overrun;
    const headroom = clamp((cap - car.u) / (cap * 0.12), 0, 1);
    car.u += T.boost.accel * headroom * dt;
    car.boostLeft = Math.max(0, car.boostLeft - dt);
    if (car.boostLeft === 0) events.push({ type: "boostEmpty" });
  }

  // ── Wind ─────────────────────────────────────────────────────────────────
  // Head/tailwind on the top end; the sideways carry is applied in the move.
  {
    const along = ctx.windX * Math.sin(car.heading) + ctx.windZ * Math.cos(car.heading);
    car.u += along * T.wind.longForce * dt;
  }

  // ── Lateral grip ─────────────────────────────────────────────────────────
  // Weight transfer, arcade-sized: staying on the power keeps the rear
  // loose; lifting mid-drift tightens the line. This is the player's tool
  // against running wide — and the bot breathes the throttle the same way.
  const liftGrip = car.drifting ? 1 + 0.6 * (1 - input.throttle) : 1;
  const latRate = (car.drifting ? spec.driftLat * liftGrip : spec.gripLat) * surfaceGrip;
  car.w *= Math.exp(-latRate * dt);
  updateSlip(car);

  // ── Drift state machine ──────────────────────────────────────────────────
  if (!car.drifting) {
    const fast = car.u > T.drift.minSpeed;
    if (fast && input.handbrake) {
      startDrift(car, Math.sign(input.steer) || 1, 1);
      events.push({ type: "driftStart" });
      stats.driftCount += 1;
    } else if (fast && Math.abs(car.slip) > spec.driftEnter && Math.abs(input.steer) > 0.35) {
      startDrift(car, Math.sign(input.steer), 0);
      events.push({ type: "driftStart" });
      stats.driftCount += 1;
    } else if (car.u > T.drift.steerEnterSpeed && Math.abs(input.steer) > T.drift.steerEnterLock) {
      // The speed entry: past ~70 km/h a sharp turn IS a drift entry —
      // grip at the rear gives up before the nose does.
      startDrift(car, Math.sign(input.steer), T.drift.steerEnterKick);
      events.push({ type: "driftStart" });
      stats.driftCount += 1;
    }
  } else {
    car.driftTime += dt;
    car.driftSlipSum += Math.abs(car.slip) * dt;
    stats.driftTime += dt;
    stats.driftScore += Math.abs(car.slip) * Math.max(0, car.u) * dt;
    if (Math.abs(car.slip) < spec.driftExit && !input.handbrake) {
      endDrift(spec, car, events, stats);
    } else if (car.u < T.drift.minSpeed * 0.5) {
      // Scrubbed to a crawl mid-slide: the drift is over, and it was never
      // clean — no boost for stalling out sideways.
      car.driftSlipSum = 0;
      endDrift(spec, car, events, stats);
    }
  }

  // ── Move ─────────────────────────────────────────────────────────────────
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const carry = windCarry(car);
  car.x += (sinH * car.u + cosH * car.w + ctx.windX * carry) * dt;
  car.z += (cosH * car.u - sinH * car.w + ctx.windZ * carry) * dt;

  // ── Ground follow / takeoff ──────────────────────────────────────────────
  if (ctx.onLip) {
    // The lip throws the car: vertical speed from the ramp slope, plus the
    // drift state is frozen — you land with whatever attitude you left with.
    car.airborne = true;
    car.airTime = 0;
    car.vy = Math.max(0.5, car.u * ctx.slope * T.air.launchScale);
    events.push({ type: "takeoff", vy: car.vy });
    stats.jumps += 1;
  } else {
    const dy = ctx.groundY - car.y;
    if (dy < -0.3 && car.u > 10) {
      // The ground fell away (a crest taken flat out) — smaller flight.
      car.airborne = true;
      car.airTime = 0;
      car.vy = 0;
      events.push({ type: "takeoff", vy: 0 });
      stats.jumps += 1;
    } else {
      car.y = ctx.groundY;
      car.vy = 0;
    }
  }
}

/** One airborne physics step. The velocity vector is committed; the nose
 * answers only faintly and turbulence rolls the car — flight is flight. */
export function stepAirborne(
  car: CarState,
  input: CarInput,
  ctx: GroundContext,
  events: GameEvent[],
  stats: RunStats,
): void {
  const dt = T.dt;
  car.airTime += dt;
  stats.airTime += dt;
  car.boosting = false; // no thrust in the air — the velocity is committed
  car.steer = input.steer;
  car.braking = false;

  car.yawRate += input.steer * T.air.yawAuthority * dt;
  car.yawRate += (ctx.rng.next() - 0.5) * 2 * T.air.turbulence * dt;
  const delta = car.yawRate * dt;
  car.heading += delta;
  rotateFrame(car, delta);
  car.u -= T.air.drag * car.u * dt;
  updateSlip(car);

  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const carry = windCarry(car);
  car.x += (sinH * car.u + cosH * car.w + ctx.windX * carry) * dt;
  car.z += (cosH * car.u - sinH * car.w + ctx.windZ * carry) * dt;
  car.vy -= T.air.gravity * dt;
  car.y += car.vy * dt;

  if (car.y <= ctx.groundY) {
    car.y = ctx.groundY;
    car.airborne = false;
    const clean = Math.abs(car.slip) <= T.air.cleanSlipLimit;
    if (clean) {
      car.u *= T.air.cleanKeep;
      stats.cleanLandings += 1;
    } else {
      car.u *= T.air.sloppyKeep;
      car.yawRate += -Math.sign(car.slip) * T.air.sloppyWobble;
    }
    car.vy = 0;
    events.push({ type: "landing", airTime: car.airTime, clean });
    car.airTime = 0;
  }
}
