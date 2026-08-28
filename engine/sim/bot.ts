// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The bot driver — a deterministic player stand-in that reads the same
// GameState the HUD reads and produces the same CarInput a thumb produces.
// It follows a lookahead point on the centerline, brakes for the curvature
// ahead, pulls the handbrake to rotate into hard corners (so bots drift like
// players do), and shifts a manual box. Used by the simulation harness, the
// balance CLI, and the tests; it must never reach into physics internals.

import { angleDiff, clamp } from "../lib/math.ts";
import { TUNING } from "../game/defs/tuning.ts";
import type { CarSpec } from "../game/defs/cars.ts";
import { flatTrack, SURFACES, type Track } from "../mapgen/index.ts";
import type { CarInput, GameState } from "../game/state.ts";

/** The sample `ahead` steps down the road. On a CIRCUIT (R22) the road runs
 * on past its last sample into its first, so the lookahead runs on with it
 * — a bot that clamped at the finish line would brake for a wall that is
 * really the next lap's start straight. On a sprint the clamp is right:
 * past the finish there is nothing to plan for. */
function aheadOf(track: Track, index: number, ahead: number): number {
  const at = index + ahead;
  const last = track.samples.length - 1;
  if (!track.circuit) return Math.min(last, at);
  return at % track.samples.length;
}

export type BotProfile = {
  /** How much of the car's OWN lateral grip the bot plans corners around.
   * Over 1 on purpose: a rally driver arrives past what the tires can hold
   * and lets the slide carry the nose round, so a bot that plans under the
   * ceiling never drifts a corner — it only ever flicks the handbrake. */
  latFraction: number;
  /** Steering proportional gain on the lookahead angle error. */
  steerGain: number;
  /** Lookahead time toward the aim point, seconds. */
  lookahead: number;
  /** How far ahead the bot scans for braking targets, seconds. */
  planHorizon: number;
  /** Curvature (1/m) above which an approach earns a handbrake flick. */
  hardCurvature: number;
  /** How much over the geometric corner speed a hard corner is entered at,
   * m/s — scaled by how freely the car rotates (see `rotationRef`). */
  hotEntry: number;
  /** The rotational authority (`spec.driftYaw`) that `hotEntry` is quoted
   * at. A car that rotates more than this is trusted with proportionally
   * more of it, one that rotates less with less. */
  rotationRef: number;
  /** Margin over the corner speed that triggers braking, m/s. */
  brakeMargin: number;
  /** Seconds pinned against something with the throttle buried before the
   * bot stops pushing and backs out of it instead. Under the engine's own
   * wedge rescue (TUNING.offTrack.stuck.after) on purpose: reversing is
   * what a driver tries first, and the respawn is what happens when it
   * turns out the car is pinned both ways. */
  reverseAfter: number;
  /** Reverse speed that ends the manoeuvre, m/s. Reached it, the car is off
   * whatever it was against and has room for another run at the line. */
  reverseSpeed: number;
};

/** The default rally brain: quick hands, plans ~3 s ahead, drifts hairpins. */
export const RALLY_BOT: BotProfile = {
  latFraction: 0.7,
  steerGain: 2.2,
  lookahead: 0.65,
  planHorizon: 3.0,
  hardCurvature: 1 / 30,
  hotEntry: 2.5,
  rotationRef: 2.5,
  brakeMargin: 2.5,
  reverseAfter: 0.8,
  reverseSpeed: 4,
};

/** The lateral grip multiplier this car has on each surface, by surface
 * code — the surface's own times the rubber the car sits on, exactly as the
 * handling model reads it (car.ts). The bot plans corners off this, so the
 * catalog's tires are felt as PACE and not merely as a number nobody
 * drives.
 *
 * Resolved once per car rather than per sample: the corner scan below asks
 * for it dozens of times on every one of a run's 120 steps a second, and
 * the answer only depends on the car's rubber. */
const GRIP_BY_CAR = new WeakMap<CarSpec, readonly number[]>();

function gripBySurface(spec: CarSpec): readonly number[] {
  let grip = GRIP_BY_CAR.get(spec);
  if (grip) return grip;
  const tyres = spec.tyres;
  grip = SURFACES.map(
    (kind) => TUNING.surfaces.grip[kind] * (kind === "asphalt" ? tyres.sealed : tyres.loose),
  );
  GRIP_BY_CAR.set(spec, grip);
  return grip;
}

/** Compute this step's input for the current state. Pure and stateless —
 * everything the bot knows is in the GameState. */
export function botInput(state: GameState, profile: BotProfile = RALLY_BOT): CarInput {
  const { car, track } = state;
  /** How freely this car rotates, against the profile's reference. */
  const rotation = state.spec.driftYaw / profile.rotationRef;
  const samples = track.samples;
  const step = track.step;

  // Aim point: a speed-scaled distance down the centerline.
  const aheadMeters = Math.max(8, car.u * profile.lookahead);
  const aim = samples[aheadOf(track, state.progressIndex, Math.round(aheadMeters / step))];
  const desired = Math.atan2(aim.x - car.x, aim.z - car.z);
  const error = angleDiff(car.heading, desired);
  let steer = clamp(error * profile.steerGain, -1, 1);

  // Corner-speed plan: the tightest curvature over the horizon caps speed at
  // sqrt(a_lat / κ); the nearest cap that requires braking wins.
  const horizonMeters = Math.max(20, car.u * profile.planHorizon);
  const scan = Math.min(
    Math.round(horizonMeters / step),
    track.circuit ? samples.length - 1 : samples.length - 1 - state.progressIndex,
  );
  const latAccel = state.spec.gripAccel * profile.latFraction;
  let targetSpeed = state.spec.gearTop[state.spec.gearTop.length - 1];
  let hardDistance = Infinity;
  let hardCap = 0;
  // The road as flat arrays (mapgen/flat.ts), and the car's grip per
  // surface. The scan below walks dozens of samples on EVERY physics step,
  // so both the sample objects and the string key into the tuning table are
  // worth staying out of.
  const { curvature, surface, arc, toNextCurve } = flatTrack(track);
  const gripOf = gripBySurface(state.spec);
  const braking = 2 * state.spec.brake * 0.7;
  const hotEntry = profile.hotEntry * rotation;
  const progressS = state.progressS;
  const trackLength = track.length;
  const count = samples.length;
  const from = state.progressIndex;
  // How near a hard corner has to be before the flick below can fire. Past
  // it the scan has nothing left to learn about the handbrake, which is
  // what lets the plan stop early.
  const flickReach = Math.max(12, car.u * 0.5);
  let ahead = 1;
  while (ahead <= scan) {
    // The sample `ahead` down the road — see `aheadOf`, inlined because
    // this loop is the bot's whole cost. `scan` never exceeds one lap, so
    // a circuit wraps at most once.
    let i = from + ahead;
    if (i >= count) i = track.circuit ? i - count : count - 1;
    // Straight road has nothing to plan around, and two fifths of a stage
    // is straight — so the scan steps over a whole straight at once instead
    // of asking each of its samples in turn.
    const straight = toNextCurve[i];
    if (straight > 0) {
      ahead += straight;
      continue;
    }
    // Arc distance to it — round the lap on a circuit, where a sample the
    // bot is planning for can sit at a smaller `s` than the car does.
    const s = arc[i];
    const distance = s - progressS + (s < progressS ? trackLength : 0);
    // Nothing further out can lower the plan or move the flick: `distance`
    // only grows from here, and by the far end of the scan the car has room
    // to brake to any corner speed at all. The 1e-9 slack keeps the bound
    // strictly conservative against the squaring's rounding, so this can
    // only ever stop the scan LATER than the exact test would.
    if (
      (hardDistance < Infinity || distance > flickReach) &&
      braking * (distance - 10) > targetSpeed * targetSpeed * (1 + 1e-9)
    ) {
      break;
    }
    const k = curvature[i];
    // The grip the car will actually HAVE at that corner, not the number on
    // its spec sheet: the surface it is paved with and the rubber this car
    // is on both scale it, and a driver reads the road ahead. Without this
    // the plan is blind to the whole surface half of a car's character — a
    // road-tired car would brake for a sealed corner as if it were gravel,
    // and no amount of tire in the catalog would ever show up as pace.
    const cap = Math.sqrt((latAccel * gripOf[surface[i]]) / k);
    // Rally style: a hard corner is entered HOT — the plan deliberately
    // carries extra speed there and the drift scrubs it, instead of braking
    // down to the geometric cap like a grip line would.
    const hard = k > profile.hardCurvature;
    // Hot entry is ADDITIVE: a fixed margin over the geometric cap. A ratio
    // would overcook exactly the tightest hairpins, where the cap is
    // smallest. How much of it a car is trusted with is its ROTATION: the
    // slide is what brings the nose round in there, so a car that rotates
    // freely can carry more in than one that pushes.
    const planCap = hard ? cap + hotEntry : cap;
    // Distance-discounted: a far corner allows more speed now than a near one.
    const allowed = Math.sqrt(planCap * planCap + braking * Math.max(0, distance - 10));
    if (allowed < targetSpeed) targetSpeed = allowed;
    if (hard && distance < hardDistance) {
      hardDistance = distance;
      hardCap = cap;
    }
    ahead += 1;
  }

  let throttle = car.u < targetSpeed ? 1 : 0;
  let brake = car.u > targetSpeed + profile.brakeMargin ? 1 : 0;

  // Drift entry: arriving hot at a hard corner, flick the handbrake to
  // rotate. While the drift runs, manage it like a driver: power through
  // the slide, breathe when the angle gets deep, and blend counter-steer
  // into the aim so the car neither spins down nor runs wide.
  const handbrake =
    !car.drifting && !car.airborne && hardDistance < flickReach && car.u > hardCap + 2;
  if (car.drifting) {
    throttle = Math.abs(car.slip) > 0.5 ? 0.5 : 1;
    brake = 0;
    // Counter-steer only once the nose is nearly where it should be —
    // mid-hairpin the aim error is huge and the car needs every bit of
    // rotation; damping there is what runs a drift wide.
    const counterWeight = clamp(1 - Math.abs(error) / 0.6, 0, 1);
    // Sideways, the aim is where the car is GOING, not where its nose is
    // pointing: hold the nose on the lookahead through a slide and the
    // velocity leaves the road by exactly the slip angle. Steering the
    // TRAVEL direction is what puts the nose the necessary few degrees
    // further into the corner — the counter-steer above still damps the
    // rotation once the nose is nearly back on line.
    const pathError = angleDiff(car.heading + car.slip, desired);
    steer = clamp(pathError * profile.steerGain + car.slip * 0.9 * counterWeight, -1, 1);
  }
  let reset = false;
  if (state.offRoad) {
    // Out in the wild: cruise back toward the road at a pace the nature
    // surface can steer at, and give up cleanly on an excursion that has
    // carried the car too far out for driving back to beat the reset.
    // Being WEDGED is no longer one of those — that is what reverse is for.
    throttle = car.u < 16 ? 0.8 : 0;
    brake = car.u > 22 ? 0.7 : 0;
    reset = !car.airborne && state.t - state.offRoadSince > 8;
  }
  if (car.airborne) {
    // Committed: line the nose up with the travel direction for the landing.
    steer = clamp(-car.slip * 2, -1, 1);
    throttle = 0;
    brake = 0;
  }

  // Wedged. A driver does not sit against a trunk with the throttle buried
  // waiting to be rescued — they back off it and take another run at the
  // line, and so does this one. The manoeuvre latches on the car's own
  // reverse state so a single wedged tick cannot flicker it: once it is
  // backing out it keeps backing out until the car is properly moving, by
  // which point it is off the thing and has room to aim.
  //
  // The wheel stays straight. Getting OFF the obstacle is the whole job;
  // where to point is the next run's problem, and it has the room to decide
  // it by then. Reversing counts as asking to move (step.ts), so a car that
  // is pinned backwards too still reaches the engine's rescue on time.
  const wedgedFor = state.t - state.stuck.since;
  const backingOut =
    !car.airborne &&
    (wedgedFor > profile.reverseAfter || (car.reversing && car.u > -profile.reverseSpeed));
  if (backingOut) {
    throttle = 0;
    brake = 1;
    steer = 0;
  }

  // Manual box: shift by the same speed thresholds the auto box uses.
  let shiftUp = false;
  let shiftDown = false;
  if (car.gearbox === "manual") {
    const top = state.spec.gearTop;
    if (car.gear < top.length - 1 && car.u > top[car.gear] * TUNING.gearbox.upAt) shiftUp = true;
    else if (car.gear > 0 && car.u < top[car.gear - 1] * TUNING.gearbox.downAt) shiftDown = true;
  }

  return { steer, throttle, brake, handbrake, boost: false, shiftUp, shiftDown, reset };
}
