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
import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import {
  updateSlip,
  type CarInput,
  type CarState,
  type GameEvent,
  type RunStats,
} from "./state.ts";
import { collideSlope, landingDamage } from "./collision.ts";
import type { Rng } from "../lib/prng.ts";
import type { Surface } from "../mapgen/index.ts";

const T = TUNING;
/** The drift group, used on nearly every line below. */
const D = TUNING.drift;

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
 * of. The turn being ASKED for costs more lateral grip than the tires have,
 * and what was asked a moment ago has not fully let go yet, which is what
 * keeps a slide alive through the instant the wheel passes centre and makes
 * the transition between two corners one continuous motion.
 *
 * Demand is the turn the WHEEL commands — speed times the gripping steer
 * gain — never the yaw the car ended up with. That distinction is the whole
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
};

function slideFactor(car: CarState, commandedYaw: number, ceiling: number): SlideState {
  const demand = Math.abs(car.u * commandedYaw) / ceiling;
  // SMOOTHSTEP, not a clamped line: the ramp has to leave zero and reach one
  // with no corner in it. A linear clamp puts a kink in the car's response
  // exactly at the limit, and a kink is an event — the moment a player feels
  // the car "change into" a drift. Starting below the limit (`entryAt`) and
  // easing in means nothing happens AT the limit at all.
  const t = clamp((demand - D.entryAt) / D.entrySpread, 0, 1);
  const asked = t * t * (3 - 2 * t);
  // A slide the wheel has stopped asking for lets go over a beat instead of
  // in a step: last step's slide decays, and the wheel can take it straight
  // back up. Holding it up on the ANGLE instead — which is the one thing a
  // sideways car always has — is a feedback loop: more angle is more slide,
  // more slide is less lateral grip, and the car inflates its own drift well
  // past anything the driver asked for.
  const released = car.slide - D.release * T.dt;
  return { asked, sliding: Math.max(asked, released) };
}

/** Leave the ground. A car that launches crossed up trips over its outside
 * wheels, so the roll it carries into the air is the slide the tires were
 * fighting plus the rotation already in the body: straight and level flies
 * flat, properly sideways goes a long way over, and once in a while it goes
 * all the way round. Physics decides — nothing here aims for it. */
export function launch(car: CarState, vy: number, events: GameEvent[], stats: RunStats): void {
  car.airborne = true;
  car.settling = false;
  car.airTime = 0;
  car.vy = vy;
  car.rollRate = -(car.w * T.air.rollFromSlide + car.yawRate * T.air.rollFromYaw);
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
    accel -= car.rideRate * S.stopDamp;
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

export type GroundContext = {
  surface: Surface | "nature";
  /** Ground elevation under the car before this step's move. */
  groundY: number;
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
  const prevVy = car.vy;
  const prevU = car.u;
  const surfaceGrip = T.surfaces.grip[ctx.surface];
  const surfaceDrag = T.surfaces.drag[ctx.surface];
  const surfacePower = T.surfaces.power[ctx.surface];

  car.steer = input.steer;
  // Brake lights, so only a car being SLOWED lights them — a car backing out
  // of a ditch is under power, not under the brake.
  car.braking = input.brake > 0.2 && car.u > 3;
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

  stepGearbox(spec, car, input, ctx.t, events);

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
  const rack = 1 - T.collision.systems.steerLoss * car.damage.systems.steering;
  const steerGain = (spec.steerRate / (1 + speed / T.steering.fadeSpeed)) * speedFactor * rack;
  // The lateral grip the tires have to spend, and the turn the wheel is
  // asking them for: the handbrake unsticks the rear by lowering the
  // ceiling, so the same lock asks far more of what is left.
  const gripCeiling = spec.gripAccel * surfaceGrip * (input.handbrake ? T.grip.handbrakeGrip : 1);
  const { asked, sliding } = slideFactor(car, input.steer * steerGain, gripCeiling);
  // The wheel does not just unstick the car — it NAMES the angle. Every
  // force that deepens a slide fades as the slip approaches what this much
  // lock is asking for at this speed, and is gone once the car is past it.
  // The setpoint has to MOVE with the wheel: a fade band at a fixed angle
  // leaves the deepening forces with no equilibrium below it, which is the
  // same two-state car the commanded demand above exists to avoid.
  const askedSlip = D.angleSpan * asked;
  const sat = clamp(1 - (Math.abs(car.slip) - askedSlip) / D.angleBand, 0, 1);
  const deepening = Math.sign(input.steer) === -Math.sign(car.slip) && car.slip !== 0;
  const steerTerm = input.steer * backwards * (steerGain + spec.driftYaw * speedFactor * asked);
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
    ? Math.sign(input.steer) * backwards * T.grip.handbrakeYaw * speedFactor
    : 0;
  // RWD power oversteer: the driven rear keeps feeding the slide — but only
  // once the wheel stops asking for the angle. Steered into the slide the
  // corner behaves classically (saturation parks it); released after the
  // turn, the tail lingers out for a beat before grip gathers the car up —
  // and a counter-steer settles it faster still. The soft sign keeps the
  // term from chattering through the instant the slip crosses centre.
  const tailDir = clamp(-car.slip / T.steering.tailSoftSlip, -1, 1);
  const powerYaw =
    tailDir * T.grip.powerYaw * input.throttle * sliding * speedFactor * (1 - intoSlide);
  // The rotation does not stop when the hands do. While the slide is letting
  // go, the yaw answers its target more slowly, so the nose keeps swinging
  // for a beat after the lock comes off and can carry a little PAST centre —
  // which is the dab of opposite lock on the way out of a big drift. It is
  // exactly zero while the wheel is still asking for the angle it has.
  const releasing = clamp(sliding - asked, 0, 1);
  // ...and as it lets go the rear bites again and WEATHERVANES the car:
  // a torque pulling the nose back toward the direction the car is actually
  // travelling. That, against the yaw's own lag above, is a spring with
  // damping — which is what lets the nose swing back through centre and a
  // little past it instead of easing to zero and stopping there.
  const straighten = car.slip * D.releaseSnap * releasing * speedFactor;
  // Saturation gates EVERYTHING that deepens the slide except the power's
  // own oversteer; counter-steer keeps full authority, because it always
  // has somewhere to go.
  const yawTarget =
    (deepening ? steerTerm * sat : steerTerm) +
    handbrakeYaw +
    powerYaw +
    straighten -
    car.slip * T.grip.slipYaw * commitment * sat * sliding;
  const yawResponse =
    (T.grip.yawResponse.grip + (T.grip.yawResponse.slide - T.grip.yawResponse.grip) * sliding) *
    (1 - D.releaseHang * releasing);
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
    car.u -= spec.brake * input.brake * Math.sign(car.u) * dt;
  }
  car.u -= surfaceDrag * car.u * dt;
  if (ctx.surface === "nature") {
    // The rough-ground cap: open nature is fast but never road-fast.
    car.u -= Math.max(0, car.u - T.surfaces.natureTop) * T.surfaces.natureOverDrag * dt;
  }
  // Grade: gravity along the road — the hills push back (or push on).
  car.u -= 9.8 * T.hills.gravityAlong * ctx.slope * dt;
  // The standstill snap, which is also what stops a car creeping on a slope.
  // It has to stand down while the car is backing out, or reverse never gets
  // past its own first tick.
  if (Math.abs(car.u) < T.standstill && input.throttle === 0 && !car.reversing) car.u = 0;

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
  const lift = 1 + T.grip.liftGrip * (1 - input.throttle) * sliding;
  const handbrakeGrip = input.handbrake ? T.grip.handbrakeGrip : 1;
  // Bent arms hold the tires at the wrong angles: suspension damage costs
  // lateral grip across the board.
  const arms = 1 - T.collision.systems.gripLoss * car.damage.systems.suspension;
  const latRate =
    (spec.gripLat + (spec.driftLat - spec.gripLat) * sliding) *
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
  car.rollRate = 0;
  const upright = Math.round(car.roll / (Math.PI * 2)) * Math.PI * 2;
  const camber = ctx.slopeLat ? Math.atan(ctx.slopeLat) : 0;
  car.roll += (upright + camber - car.roll) * clamp(T.air.rollRecover * dt, 0, 1);
  settlePitch(car, Math.atan(ctx.slope));

  // ── Drift readout ────────────────────────────────────────────────────────
  // Nothing in the model above branches on this: it is what the dust, the
  // HUD and the balance table read off a car that happens to be sideways.
  car.slide = sliding;
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
      // The ground can also be a WALL. How far it rose over the ground the
      // car just covered IS the face's grade, read exactly where the bumper
      // is rather than over the wide baseline the grade term uses — a cliff
      // is metres wide, and a smoothed slope would let the car drive up the
      // side of a mountain at pace.
      const run = Math.hypot(car.x - fromX, car.z - fromZ);
      if (run > 1e-4 && gy - car.y > run * T.collision.climbLimit) {
        hitFace(spec, car, ctx.groundAt, (gy - car.y) / run, fromX, fromZ, events, stats);
      }
      car.y = ctx.groundAt(car.x, car.z);
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

  // ── Suspension ───────────────────────────────────────────────────────────
  // Whatever the ground just did to the wheels, the body has to catch up
  // with. A dip flattening out, a crest falling away, a bank stopping the
  // nose: all of it arrives here as one number.
  stepSuspension(spec, car, car.airborne ? 0 : car.vy - prevVy, (car.u - prevU) / dt);
}

/** The car meeting a face it cannot climb. Reads the terrain's gradient at
 * the bumper — that direction is the contact normal — hands the contact to
 * collision.ts, and backs the car out of however much of the step the face
 * refused. A wall gives the whole step back (the car stops against it and
 * the wedge rule in step.ts eventually fetches it); a steep bank gives some
 * of it back and the car scrabbles up the rest. */
function hitFace(
  spec: CarSpec,
  car: CarState,
  ground: (x: number, z: number) => number,
  faceSlope: number,
  fromX: number,
  fromZ: number,
  events: GameEvent[],
  stats: RunStats,
): void {
  const span = T.collision.faceSpan;
  const gradient = {
    x: (ground(car.x + span, car.z) - ground(car.x - span, car.z)) / (2 * span),
    z: (ground(car.x, car.z + span) - ground(car.x, car.z - span)) / (2 * span),
  };
  const bite = collideSlope(spec, car, faceSlope, gradient, events, stats);
  if (bite <= 0) return;
  car.x -= (car.x - fromX) * bite;
  car.z -= (car.z - fromZ) * bite;
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
  const dt = T.dt;
  const descent = car.vy;
  car.airTime += dt;
  if (!car.settling) stats.airTime += dt;
  car.boosting = false; // no thrust in the air — the velocity is committed
  car.steer = input.steer;
  car.braking = false;
  car.reversing = false; // nothing to back out of in the air

  car.yawRate += input.steer * T.air.yawAuthority * dt;
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
      if (!car.settling) stats.cleanLandings += 1;
    } else {
      car.u *= T.air.sloppyKeep;
      // Shot dampers let the whole car skip and hunt on a bad touchdown.
      const wobble = 1 + T.collision.systems.wobble * car.damage.systems.suspension;
      car.yawRate += -Math.sign(car.slip) * T.air.sloppyWobble * wobble;
    }
    // The ground hits back: descent the suspension cannot absorb crushes
    // the underside — or the flank the car came down on (collision.ts).
    const slam = car.u * ctx.slope - car.vy;
    landingDamage(spec, car, slam, events, stats);
    // Pick the road's own vertical speed back up instead of zeroing: land on
    // a brow and the car may be off the ground again next step, and a stale
    // zero there is a bounce where there should be a flight.
    car.vy = car.u * ctx.slope;
    events.push({ type: "landing", airTime: car.airTime, clean });
    car.airTime = 0;
    // Past what the springs can travel through, the CHASSIS comes back off
    // the ground — a real bounce, small and capped, that lands again a beat
    // later. Each rebound is a fraction of the last, so a slam bounces once
    // or twice and is done; it can never turn into a second jump.
    const rebound = slam - T.suspension.bounceSpeed;
    if (rebound > 0) {
      car.airborne = true;
      car.settling = true;
      car.vy += Math.min(rebound * T.suspension.bounceKeep, T.suspension.bounceMax);
    } else {
      car.settling = false;
    }
    // The springs take the whole descent as one jolt whether the chassis
    // came back up or not: this is the squat a landing travels through.
    stepSuspension(spec, car, car.vy - descent, 0);
    return;
  }
  stepSuspension(spec, car, 0, 0);
}
