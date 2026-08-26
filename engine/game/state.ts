// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The engine's state and event types. The renderer, the HUD, and the bots
// all read this shape; only car.ts and step.ts write it. Sign conventions:
// heading 0 points down +z and grows clockwise seen from above (so positive
// steer turns the nose clockwise in map view); `u` is forward speed, `w` is
// sideways speed along the car's right axis, so negative `w` means the car
// slides out to the left of its nose — a drift out of a clockwise turn.

import type { CarSpec } from "./defs/cars.ts";
import type { Track } from "../mapgen/index.ts";
import type { Rng } from "../lib/prng.ts";

export type CarInput = {
  /** -1..1; positive steers clockwise (right in map view). */
  steer: number;
  /** 0..1. */
  throttle: number;
  /** 0..1. */
  brake: number;
  handbrake: boolean;
  /** Hold to burn the finite booster (TUNING.boost); no-op when the tank
   * is dry or the car is airborne. */
  boost: boolean;
  /** Edge-triggered: consumed by the step they arrive in (manual box). */
  shiftUp: boolean;
  shiftDown: boolean;
};

export const NEUTRAL_INPUT: CarInput = {
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  boost: false,
  shiftUp: false,
  shiftDown: false,
};

export type CarState = {
  x: number;
  z: number;
  /** Height above the base plane; equals ground height while grounded. */
  y: number;
  heading: number;
  /** Forward speed, m/s. */
  u: number;
  /** Sideways speed along the right axis, m/s. */
  w: number;
  vy: number;
  yawRate: number;
  /** Current slip angle, radians (atan2(w, |u|)). */
  slip: number;
  airborne: boolean;
  airTime: number;
  /** Body roll, radians — positive lifts the car's right side. Only the air
   * ever puts any in: the ground unwinds it. */
  roll: number;
  /** Roll rate, rad/s — set by the take-off, spent in the air. */
  rollRate: number;
  /** How sideways the car is this step, 0..1 — 0 gripping, 1 fully sliding
   * (renderer/HUD readout; the handling model computes it every step). */
  slide: number;
  /** True while `slide` reads as a drift at pace — dust, HUD, stats. */
  drifting: boolean;
  gear: number;
  /** Sim time until which throttle is cut by an engaging shift. */
  shiftCutUntil: number;
  /** Boost seconds left in the tank — finite for the whole run. */
  boostLeft: number;
  /** True while the booster is burning this step (renderer/HUD readout). */
  boosting: boolean;
  /** Steer input applied this step, -1..1 (renderer readout: the front
   * wheels point where the driver points them). */
  steer: number;
  /** True while the brakes bite this step (renderer readout: brake FX). */
  braking: boolean;
};

/** When the stage is driven — presentation picks lighting from it; the
 * engine itself only cares about weather (which sets the wind). */
export type TimeOfDay = "dawn" | "day" | "dusk" | "night";
export type Weather = "clear" | "rain" | "storm";

export type RaceEnv = {
  timeOfDay: TimeOfDay;
  weather: Weather;
  /** Mean bearing the air moves TOWARD, radians (heading convention). */
  windDir: number;
  /** Mean wind speed, m/s — gusts breathe around it (TUNING.wind.gust). */
  windSpeed: number;
  /** Seeded phase offset for the gust oscillators, radians. */
  gustPhase: number;
};

export type GameEvent =
  | { type: "go" }
  | { type: "takeoff"; vy: number }
  | { type: "landing"; airTime: number; clean: boolean }
  | { type: "splash" }
  | { type: "shift"; gear: number }
  | { type: "boostStart" }
  | { type: "boostEmpty" }
  | { type: "offRoad"; off: boolean }
  | { type: "respawn" }
  | { type: "finish"; time: number };

export type RunStats = {
  driftCount: number;
  driftTime: number;
  driftScore: number;
  jumps: number;
  airTime: number;
  cleanLandings: number;
  splashes: number;
  offRoadTime: number;
  respawns: number;
  topSpeed: number;
};

export type GamePhase = "countdown" | "racing" | "finished";

export type GameState = {
  seed: number;
  spec: CarSpec;
  track: Track;
  car: CarState;
  phase: GamePhase;
  /** Sim time since creation, seconds. */
  t: number;
  /** Time spent racing (excludes countdown), seconds. */
  raceTime: number;
  /** Index into track.samples the car is nearest to. */
  progressIndex: number;
  /** Arc position along the stage, meters. */
  progressS: number;
  /** Signed lateral offset from the centerline, meters (positive right). */
  lateral: number;
  offRoad: boolean;
  offRoadSince: number;
  /** The stage's conditions (fixed for the run). */
  env: RaceEnv;
  /** Current gusting wind velocity, world space m/s — updated every step;
   * the renderer reads it for fumes/rain and the HUD for its indicator. */
  wind: { x: number; z: number };
  stats: RunStats;
  /** Seeded stream for in-run randomness (airborne turbulence only). */
  rng: Rng;
};
