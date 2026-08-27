// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The engine's state and event types. The renderer, the HUD, and the bots
// all read this shape; only car.ts and step.ts write it. Sign conventions:
// heading 0 points down +z and grows clockwise seen from above (so positive
// steer turns the nose clockwise in map view); `u` is forward speed, `w` is
// sideways speed along the car's right axis, so negative `w` means the car
// slides out to the left of its nose — a drift out of a clockwise turn.

import type { CarSpec } from "./defs/cars.ts";
import type { Surface, TerrainField, Track } from "../mapgen/index.ts";
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
  /** Edge-triggered: put the car back on the track at its last progress —
   * the way home from a wedged rock or the bottom of a valley, since
   * exploring never times out on its own. */
  reset: boolean;
};

export const NEUTRAL_INPUT: CarInput = {
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  boost: false,
  shiftUp: false,
  shiftDown: false,
  reset: false,
};

/** How many crush zones ring the body: zone 0 is dead ahead, indices grow
 * clockwise in map view (matching the heading), 45° each — nose, front-right
 * corner, right flank, rear-right corner, tail, and round the left side. */
export const DAMAGE_ZONES = 8;

/** The pieces an impact can tear off the body. The engine decides WHEN one
 * breaks (zone crush past its bolt strength); the renderer owns what flies. */
export type DamagePart = "bumperF" | "bumperR" | "mirrorL" | "mirrorR" | "spoiler";

/** The machinery under the panels. Each system takes damage from the crush
 * landing nearest to it and degrades ITS OWN job: the engine loses power,
 * the suspension loses grip and landing tolerance, the gearbox shifts
 * slower and harsher, the steering loses authority. */
export type InternalSystem = "engine" | "suspension" | "gearbox" | "steering";

export const INTERNAL_SYSTEMS: readonly InternalSystem[] = [
  "engine",
  "suspension",
  "gearbox",
  "steering",
];

/** The car's accumulated damage — the physics writes it, the renderer bends
 * the body's polygons from it. Crashing never resets it: the dents are the
 * run's history, and only a fresh game starts clean. */
export type CarDamage = {
  /** Crush depth per zone, m — how far that side's panels have folded in. */
  zones: number[];
  /** Underside crush from slammed landings, m — the floorpan taking the
   * hit the suspension could not. The renderer sags and wrinkles the body
   * from it rather than folding a flank. */
  belly: number;
  /** Structural wear, 0..1 — reaching 1 wrecks the car (crash + respawn,
   * after which the wreck is patched back to a drivable fraction). */
  wear: number;
  /** Damage per internal system, 0 (sound) .. 1 (broken) — fed by where
   * the crush lands, read back by the handling model. Never repaired. */
  systems: Record<InternalSystem, number>;
  /** Parts already torn off, in the order they went. */
  broken: DamagePart[];
  /** Bumped on every deformation change — the renderer re-bends the body
   * when it moves, instead of re-reading nine numbers every frame. */
  version: number;
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
  damage: CarDamage;
};

/** Refresh the slip angle after anything rewrites `u`/`w` directly — the
 * grounded step's lateral-grip redirect rebuilds the velocity FROM this
 * angle, so a stale slip silently erases the change (collision impulses
 * included). This is the definition of `CarState.slip`, kept beside it. */
export function updateSlip(car: CarState): void {
  car.slip = Math.atan2(car.w, Math.max(1, Math.abs(car.u)));
}

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
  /** A contact hard enough to matter. `speed` is the closing speed into
   * the surface, m/s; `angle` is where on the body it landed, radians in
   * the car frame (0 = nose, positive toward the right side); `belly` marks
   * a slammed landing taken on the underside, where no ring angle applies. */
  | { type: "impact"; speed: number; angle: number; belly: boolean }
  /** A piece of the body tearing off — the renderer sends it flying. */
  | { type: "partBreak"; part: DamagePart }
  | { type: "crash"; into: "water" | "wreck" }
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
  /** Solid contacts that dealt damage (impact events past the scuff floor). */
  impacts: number;
  crashes: number;
  respawns: number;
  topSpeed: number;
};

export type GamePhase = "countdown" | "racing" | "finished";

export type GameState = {
  seed: number;
  spec: CarSpec;
  track: Track;
  /** The landscape around the road — the ground the car rides once it
   * leaves the samples, with its water and its solid wild props. */
  terrain: TerrainField;
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
  /** The surface driven this step — road samples on the road, the
   * terrain's call in the wild (readout for FX and the splash edge). */
  surface: Surface | "nature";
  /** The stage's conditions (fixed for the run). */
  env: RaceEnv;
  /** Current gusting wind velocity, world space m/s — updated every step;
   * the renderer reads it for fumes/rain and the HUD for its indicator. */
  wind: { x: number; z: number };
  stats: RunStats;
  /** Seeded stream for in-run randomness (airborne turbulence only). */
  rng: Rng;
};
