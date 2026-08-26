// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The bot driver — a deterministic player stand-in that reads the same
// GameState the HUD reads and produces the same CarInput a thumb produces.
// It follows a lookahead point on the centerline, brakes for the curvature
// ahead, pulls the handbrake to rotate into hard corners (so bots drift like
// players do), and shifts a manual box. Used by the simulation harness, the
// balance CLI, and the tests; it must never reach into physics internals.

import { angleDiff, clamp } from "../lib/math.ts";
import { TUNING } from "../game/defs/tuning.ts";
import type { CarInput, GameState } from "../game/state.ts";

export type BotProfile = {
  /** Peak lateral acceleration the bot plans corners around, m/s². */
  latAccel: number;
  /** Steering proportional gain on the lookahead angle error. */
  steerGain: number;
  /** Lookahead time toward the aim point, seconds. */
  lookahead: number;
  /** How far ahead the bot scans for braking targets, seconds. */
  planHorizon: number;
  /** Curvature (1/m) above which an approach earns a handbrake flick. */
  hardCurvature: number;
  /** Margin over the corner speed that triggers braking, m/s. */
  brakeMargin: number;
};

/** The default rally brain: quick hands, plans ~3 s ahead, drifts hairpins. */
export const RALLY_BOT: BotProfile = {
  latAccel: 11,
  steerGain: 2.2,
  lookahead: 0.65,
  planHorizon: 3.0,
  hardCurvature: 1 / 30,
  brakeMargin: 2.5,
};

/** Compute this step's input for the current state. Pure and stateless —
 * everything the bot knows is in the GameState. */
export function botInput(state: GameState, profile: BotProfile = RALLY_BOT): CarInput {
  const { car, track } = state;
  const samples = track.samples;
  const step = track.step;

  // Aim point: a speed-scaled distance down the centerline.
  const aheadMeters = Math.max(8, car.u * profile.lookahead);
  const aimIndex = Math.min(
    samples.length - 1,
    state.progressIndex + Math.round(aheadMeters / step),
  );
  const aim = samples[aimIndex];
  const desired = Math.atan2(aim.x - car.x, aim.z - car.z);
  const error = angleDiff(car.heading, desired);
  let steer = clamp(error * profile.steerGain, -1, 1);

  // Corner-speed plan: the tightest curvature over the horizon caps speed at
  // sqrt(a_lat / κ); the nearest cap that requires braking wins.
  const horizonMeters = Math.max(20, car.u * profile.planHorizon);
  const endIndex = Math.min(
    samples.length - 1,
    state.progressIndex + Math.round(horizonMeters / step),
  );
  let targetSpeed = state.spec.gearTop[state.spec.gearTop.length - 1];
  let hardDistance = Infinity;
  let hardCap = 0;
  for (let i = state.progressIndex + 1; i <= endIndex; i++) {
    const k = Math.abs(samples[i].curvature);
    if (k < 1e-4) continue;
    const cap = Math.sqrt(profile.latAccel / k);
    const distance = samples[i].s - state.progressS;
    // Rally style: a hard corner is entered HOT — the plan deliberately
    // carries extra speed there and the drift scrubs it, instead of braking
    // down to the geometric cap like a grip line would.
    const hard = k > profile.hardCurvature;
    // Hot entry is ADDITIVE: +3.5 m/s over the geometric cap. A ratio would
    // overcook exactly the tightest hairpins, where the cap is smallest.
    const planCap = hard ? cap + 2.5 : cap;
    // Distance-discounted: a far corner allows more speed now than a near one.
    const allowed = Math.sqrt(
      planCap * planCap + 2 * state.spec.brake * 0.7 * Math.max(0, distance - 10),
    );
    if (allowed < targetSpeed) targetSpeed = allowed;
    if (hard && distance < hardDistance) {
      hardDistance = distance;
      hardCap = cap;
    }
  }

  let throttle = car.u < targetSpeed ? 1 : 0;
  let brake = car.u > targetSpeed + profile.brakeMargin ? 1 : 0;

  // Drift entry: arriving hot at a hard corner, flick the handbrake to
  // rotate. While the drift runs, manage it like a driver: power through
  // the slide, breathe when the angle gets deep, and blend counter-steer
  // into the aim so the car neither spins down nor runs wide.
  const handbrake =
    !car.drifting &&
    !car.airborne &&
    hardDistance < Math.max(12, car.u * 0.5) &&
    car.u > hardCap + 2;
  if (car.drifting) {
    throttle = Math.abs(car.slip) > 0.5 ? 0.5 : 1;
    brake = 0;
    // Counter-steer only once the nose is nearly where it should be —
    // mid-hairpin the aim error is huge and the car needs every bit of
    // rotation; damping there is what runs a drift wide.
    const counterWeight = clamp(1 - Math.abs(error) / 0.6, 0, 1);
    steer = clamp(error * profile.steerGain + car.slip * 0.9 * counterWeight, -1, 1);
  }
  if (state.offRoad) {
    // On the grass: slow right down and let the aim point pull the nose
    // back to the road — sliding along the verge at pace is how a car
    // gets lost for good.
    throttle = 0;
    if (car.u > 10) brake = 1;
  }
  if (car.airborne) {
    // Committed: line the nose up with the travel direction for the landing.
    steer = clamp(-car.slip * 2, -1, 1);
    throttle = 0;
    brake = 0;
  }

  // Manual box: shift by the same speed thresholds the auto box uses.
  let shiftUp = false;
  let shiftDown = false;
  if (state.spec.gearbox === "manual") {
    const top = state.spec.gearTop;
    if (car.gear < top.length - 1 && car.u > top[car.gear] * TUNING.gearbox.upAt) shiftUp = true;
    else if (car.gear > 0 && car.u < top[car.gear - 1] * TUNING.gearbox.downAt) shiftDown = true;
  }

  return { steer, throttle, brake, handbrake, boost: false, shiftUp, shiftDown };
}
