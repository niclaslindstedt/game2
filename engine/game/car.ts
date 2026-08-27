// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The handling model — one grounded step and one airborne step of the car.
// There is no drift MODE here: a slide is simply a turn the tires cannot
// pay for, so the car rotates further than the road bends and the gravel
// starts flying. The tires REDIRECT the car rather than braking it, which
// is why going sideways costs pace but is never felt as a handbrake. The
// other two moments: the jump (the lip throws you, the air is committed —
// velocity is fixed, the nose barely answers) and the landing (aligned
// keeps your speed, sideways scrubs it and wobbles). Numbers live in
// defs/, not here.

import { clamp } from "../lib/math.ts";
import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import {
  updateSlip,
  type CarInput,
  type CarState,
  type GameEvent,
  type RunStats,
} from "./state.ts";
import { landingDamage } from "./collision.ts";
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
  // A hurt gearbox shifts harsher: the auto box, seamless when sound, cuts
  // throttle per shift as its damage grows; the manual's cut stretches.
  const gearboxDamage = car.damage.systems.gearbox;
  if (spec.gearbox === "auto") {
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
 * of. Two ways to be sliding: the turn being asked for costs more lateral
 * grip than the tires have (`u·yawRate` past the ceiling), or the car is
 * already at an angle and has not settled back yet. The second keeps a
 * slide alive through the instant the wheel passes centre, which is what
 * makes the transition between two corners one continuous motion. */
function slideFactor(
  spec: CarSpec,
  car: CarState,
  surfaceGrip: number,
  handbrake: boolean,
): number {
  const ceiling = spec.gripAccel * surfaceGrip * (handbrake ? T.grip.handbrakeGrip : 1);
  const demand = Math.abs(car.u * car.yawRate) / ceiling;
  const forced = clamp((demand - 1) / T.grip.slideRange, 0, 1);
  const held = clamp((Math.abs(car.slip) - T.grip.slideSlip) / T.grip.slipRange, 0, 1);
  return Math.max(forced, held);
}

/** Leave the ground. A car that launches crossed up trips over its outside
 * wheels, so the roll it carries into the air is the slide the tires were
 * fighting plus the rotation already in the body: straight and level flies
 * flat, properly sideways goes a long way over, and once in a while it goes
 * all the way round. Physics decides — nothing here aims for it. */
export function launch(car: CarState, vy: number, events: GameEvent[], stats: RunStats): void {
  car.airborne = true;
  car.airTime = 0;
  car.vy = vy;
  car.rollRate = -(car.w * T.air.rollFromSlide + car.yawRate * T.air.rollFromYaw);
  events.push({ type: "takeoff", vy });
  stats.jumps += 1;
}

export type GroundContext = {
  surface: "gravel" | "water" | "nature";
  /** Ground elevation under the car before this step's move. */
  groundY: number;
  /** Road slope dy/ds under the car... */
  slope: number;
  /** Off the road only: ground slope ACROSS the heading, positive when the
   * ground rises to the car's right — what pulls a car on a hillside
   * toward the downhill side. Absent (on the road) means flat. */
  slopeLat?: number;
  /** Vertical curvature of the road under the car, 1/m — negative over a
   * brow. Zero anywhere a jump lip owns the launch. */
  roadCurve: number;
  /** Current wind velocity, world space m/s. */
  windX: number;
  windZ: number;
  t: number;
  rng: Rng;
  /** Off the road only: the terrain height under any world position. When
   * set, ground-follow and landings ride this instead of extrapolating the
   * road's slope — a slide across a hillside tracks the hillside. */
  groundAt?: (x: number, z: number) => number;
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

  const slide = slideFactor(spec, car, surfaceGrip, input.handbrake);

  // ── Yaw ──────────────────────────────────────────────────────────────────
  // Steering authority fades with speed (stability) and with standstill
  // (you cannot pivot a parked car). Once the tires give up, the car gets
  // extra rotation and the slip itself turns the nose — the tail leads and
  // you catch it on the counter — both fading in with the slide so that
  // grip and slide are one continuous response, not two modes.
  const speedFactor = clamp(car.u / T.steering.deadSpeed, 0, 1);
  // A bent rack answers late and short: steering damage bleeds authority.
  const rack = 1 - T.collision.systems.steerLoss * car.damage.systems.steering;
  const steerGain = (spec.steerRate / (1 + car.u / T.steering.fadeSpeed)) * speedFactor * rack;
  // The slide SATURATES: past ~26° of slip the forces that deepen it fade
  // to nothing, so a breathed slide parks at a big, stable, movie drift
  // angle instead of spinning the car.
  const sat = clamp(1 - (Math.abs(car.slip) - T.grip.satAt) / T.grip.satWidth, 0, 1);
  const deepening = Math.sign(input.steer) === -Math.sign(car.slip) && car.slip !== 0;
  const steerTerm = input.steer * (steerGain + spec.driftYaw * speedFactor * slide);
  // The slip's self-rotation scales with steering commitment, so holding
  // into the slide sustains it, releasing lets grip straighten the car, and
  // counter-steer exits fast. An unconditional slip term would be a
  // positive feedback loop — a car that never stops rotating once sideways.
  // Full commitment on the counter too: it damps the catch, which is what
  // keeps the exit a gather-up instead of a twitch.
  const commitment =
    T.steering.commitmentFloor + (1 - T.steering.commitmentFloor) * Math.abs(input.steer);
  /** How much the wheel is steered INTO the slide, 0..1 — what gates the
   * power's oversteer off while the driver is still asking for the angle. */
  const intoSlide = clamp(input.steer * -Math.sign(car.slip), 0, 1);
  const handbrakeYaw = input.handbrake
    ? Math.sign(input.steer) * T.grip.handbrakeYaw * speedFactor
    : 0;
  // RWD power oversteer: the driven rear keeps feeding the slide — but only
  // once the wheel stops asking for the angle. Steered into the slide the
  // corner behaves classically (saturation parks it); released after the
  // turn, the tail lingers out for a beat before grip gathers the car up —
  // and a counter-steer settles it faster still. The soft sign keeps the
  // term from chattering through the instant the slip crosses centre.
  const tailDir = clamp(-car.slip / T.steering.tailSoftSlip, -1, 1);
  const powerYaw =
    tailDir * T.grip.powerYaw * input.throttle * slide * speedFactor * (1 - intoSlide);
  // Saturation gates EVERYTHING that deepens the slide except the power's
  // own oversteer; counter-steer keeps full authority, because it always
  // has somewhere to go.
  const yawTarget =
    (deepening ? steerTerm * sat : steerTerm) +
    handbrakeYaw +
    powerYaw -
    car.slip * T.grip.slipYaw * commitment * sat * slide;
  const yawResponse =
    T.grip.yawResponse.grip + (T.grip.yawResponse.slide - T.grip.yawResponse.grip) * slide;
  car.yawRate += (yawTarget - car.yawRate) * clamp(yawResponse * dt, 0, 1);

  const delta = car.yawRate * dt;
  car.heading += delta;
  rotateFrame(car, delta);
  updateSlip(car);

  // ── Longitudinal ─────────────────────────────────────────────────────────
  const shiftCut = ctx.t < car.shiftCutUntil ? 0 : 1;
  // A folded radiator starves the engine: power fades with engine damage —
  // the car limps, it never parks.
  const damagePower = 1 - T.collision.systems.powerLoss * car.damage.systems.engine;
  const accel = engineAccel(spec, car) * input.throttle * surfacePower * shiftCut * damagePower;
  car.u += accel * dt;
  car.u -= spec.brake * input.brake * Math.sign(car.u) * dt;
  car.u -= surfaceDrag * car.u * dt;
  if (ctx.surface === "nature") {
    // The rough-ground cap: open nature is fast but never road-fast.
    car.u -= Math.max(0, car.u - T.surfaces.natureTop) * T.surfaces.natureOverDrag * dt;
  }
  // Grade: gravity along the road — the hills push back (or push on).
  car.u -= 9.8 * T.hills.gravityAlong * ctx.slope * dt;
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
  const lift = 1 + T.grip.liftGrip * (1 - input.throttle) * slide;
  const handbrakeGrip = input.handbrake ? T.grip.handbrakeGrip : 1;
  // Bent arms hold the tires at the wrong angles: suspension damage costs
  // lateral grip across the board.
  const arms = 1 - T.collision.systems.gripLoss * car.damage.systems.suspension;
  const latRate =
    (spec.gripLat + (spec.driftLat - spec.gripLat) * slide) *
    surfaceGrip *
    lift *
    handbrakeGrip *
    arms;
  if (car.u > 1) {
    const swung = car.slip * Math.exp(-latRate * dt);
    const kept = Math.hypot(car.u, car.w) * Math.exp(-T.grip.scrub * Math.sin(car.slip) ** 2 * dt);
    car.u = kept * Math.cos(swung);
    car.w = kept * Math.sin(swung);
  } else {
    car.w *= Math.exp(-latRate * dt);
  }
  updateSlip(car);

  // The ground unwinds whatever roll the last flight left, toward the
  // NEAREST upright — a car most of the way over finishes the roll instead
  // of rewinding it.
  car.rollRate = 0;
  const upright = Math.round(car.roll / (Math.PI * 2)) * Math.PI * 2;
  car.roll += (upright - car.roll) * clamp(T.air.rollRecover * dt, 0, 1);

  // ── Drift readout ────────────────────────────────────────────────────────
  // Nothing in the model above branches on this: it is what the dust, the
  // HUD and the balance table read off a car that happens to be sideways.
  car.slide = slide;
  const angle = car.drifting ? T.drift.exitSlip : T.drift.enterSlip;
  const drifting = Math.abs(car.slip) > angle && car.u > T.drift.minSpeed;
  if (drifting) {
    if (!car.drifting) stats.driftCount += 1;
    stats.driftTime += dt;
    stats.driftScore += Math.abs(car.slip) * car.u * dt;
  }
  car.drifting = drifting;

  // ── Move ─────────────────────────────────────────────────────────────────
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const carry = windCarry(car);
  car.x += (sinH * car.u + cosH * car.w + ctx.windX * carry) * dt;
  car.z += (cosH * car.u - sinH * car.w + ctx.windZ * carry) * dt;

  // ── Ground follow / takeoff ──────────────────────────────────────────────
  // The car RIDES the road: its vertical speed is the road's own, so a ramp
  // pitches the nose up and a dip drops it, smoothly, with no hop (the
  // renderer reads the attitude straight off vy/u). It leaves the ground
  // only when the road falls away faster than gravity could pull it down —
  // so the same crest launches you at pace and holds you at a crawl.
  const roadVy = car.u * ctx.slope;
  const roadPull = -car.u * car.u * ctx.roadCurve;
  if (car.u > T.air.crestSpeed && roadPull > T.air.gravity * T.air.crestPull) {
    launch(car, car.vy, events, stats);
  } else if (ctx.groundAt) {
    // Open ground: ride the terrain under the wheels — a slide carries the
    // car ACROSS the slope, which the along-heading slope can't see, so the
    // height is read where the car actually is. A sharp edge (a cliff lip,
    // a cut bank) falls away faster than the smoothed crest check can read;
    // at pace it throws the car instead of gluing it down the face.
    const gy = ctx.groundAt(car.x, car.z);
    if (car.u > T.air.crestSpeed && gy < car.y - T.air.edgeDrop) {
      launch(car, car.vy, events, stats);
    } else {
      car.y = gy;
      // Attitude from the smoothed slope: the raw per-step height delta
      // would pitch-jitter the nose over every ripple of noise.
      car.vy = roadVy;
    }
  } else {
    // ctx.groundY is the elevation the step STARTED from; the slope carries
    // it forward to where the car has just moved to.
    car.y = ctx.groundY + roadVy * dt;
    car.vy = roadVy;
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
  // The body keeps rolling the way the take-off sent it — the wheel does
  // nothing about it, which is the whole point of being in the air.
  car.rollRate += (ctx.rng.next() - 0.5) * 2 * T.air.rollTurbulence * dt;
  car.rollRate *= Math.exp(-T.air.rollDamp * dt);
  car.roll += car.rollRate * dt;
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

  // The ground under where the car has just moved TO. Off the road the
  // terrain answers directly; on the road, `ctx.groundY` is where the step
  // started, and on a steep descent that stale height is already above the
  // road, which lands the car in mid-air. The road carry only ever LOWERS
  // the ground: a rising slope under a car that has just left a lip is the
  // ramp it is no longer on, and following it up would land the car the
  // instant it took off.
  const groundNow = ctx.groundAt
    ? ctx.groundAt(car.x, car.z)
    : Math.min(ctx.groundY, ctx.groundY + car.u * ctx.slope * dt);
  if (car.y <= groundNow) {
    car.y = groundNow;
    car.airborne = false;
    // Straight nose AND upright: coming down on your side is never clean,
    // however well the nose was lined up.
    const clean =
      Math.abs(car.slip) <= T.air.cleanSlipLimit && Math.abs(car.roll) < T.air.rollLandLimit;
    if (clean) {
      car.u *= T.air.cleanKeep;
      stats.cleanLandings += 1;
    } else {
      car.u *= T.air.sloppyKeep;
      // Shot dampers let the whole car skip and hunt on a bad touchdown.
      const wobble = 1 + T.collision.systems.wobble * car.damage.systems.suspension;
      car.yawRate += -Math.sign(car.slip) * T.air.sloppyWobble * wobble;
    }
    // The ground hits back: descent the suspension cannot absorb crushes
    // the underside — or the flank the car came down on (collision.ts).
    landingDamage(car, car.u * ctx.slope - car.vy, events, stats);
    // Pick the road's own vertical speed back up instead of zeroing: land on
    // a brow and the car may be off the ground again next step, and a stale
    // zero there is a bounce where there should be a flight.
    car.vy = car.u * ctx.slope;
    events.push({ type: "landing", airTime: car.airTime, clean });
    car.airTime = 0;
  }
}
