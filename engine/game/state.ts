// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The engine's state and event types. The renderer, the HUD, and the bots
// all read this shape; only car.ts and step.ts write it. Sign conventions:
// heading 0 points down +z and grows clockwise seen from above (so positive
// steer turns the nose clockwise in map view); `u` is forward speed, `w` is
// sideways speed along the car's right axis, so negative `w` means the car
// slides out to the left of its nose — a drift out of a clockwise turn.

import type { CarSpec, GearboxMode } from "./defs/cars.ts";
import type { KerbField, Surface, TerrainField, Track, WildObstacle } from "../mapgen/index.ts";
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
  /** Edge-triggered: put the car back on the road at its last checkpoint
   * (R28) — the way home from a wedged rock or the bottom of a valley,
   * since exploring never times out on its own. It costs the road since
   * that board, which is what makes driving back yourself worth doing. */
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
export type DamagePart =
  "bumperF" | "bumperR" | "mirrorL" | "mirrorR" | "spoiler" | "hood" | "hatch";

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
  /** Structural wear, 0..1 — reaching 1 is the wreck: a car with nothing
   * left to give, still driveable, patched back to a fraction of its life
   * the next time it is put back on the road. */
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
  /** True while the car is off the ground because it BOUNCED, not because
   * it jumped — the rebound of a slam too hard for the springs. It flies
   * the same way, but it is one landing continuing to happen, so it draws
   * no turbulence and never counts as a flight of its own. */
  settling: boolean;
  /** Body roll, radians — positive lifts the car's right side. The air puts
   * the tumble in; on the ground it settles onto the camber of whatever the
   * wheels are standing on, which off-road is the hillside itself. */
  roll: number;
  /** Roll rate, rad/s — set by the take-off, spent in the air. */
  rollRate: number;
  /** Nose attitude, radians — positive lifts the nose. Grounded it is the
   * grade under the wheels (the road's, or the terrain's out in the wild);
   * airborne it is the angle of the flight itself. Renderer readout: the
   * physics never reads it back. */
  pitch: number;
  /** Suspension heave: how far the BODY sits from where the wheels put it,
   * m — negative is compressed, positive is the springs topped out on the
   * rebound. The wheels are always ON the ground (`y`); this is the sprung
   * mass lagging behind them, and it is what a landing, a dip or a bank
   * actually LOOKS like. Renderer readout: the physics never reads it back
   * into the handling. */
  ride: number;
  /** ...and the speed it is travelling at, m/s. */
  rideRate: number;
  /** Load pitch, rad — the dive under brakes, the squat on the power and
   * the nose-dip a hit throws in, positive lifting the nose. Kept apart
   * from `pitch` (the ground's own attitude) because only the BODY takes
   * it: the wheels stay on the ground and so does the shadow. */
  pitchLoad: number;
  /** Sim time the body may next be jolted by an anti-cut block, s. A block
   * is 0.6 m of road and the car is inside one for several steps at any
   * speed: without a floor between bites, one block costs what a whole
   * apex should (`TUNING.collision.kerb.again`). */
  kerbFrom: number;
  /** How sideways the car is this step, 0..1 — 0 gripping, 1 fully sliding
   * (renderer/HUD readout; the handling model computes it every step). */
  slide: number;
  /** True while `slide` reads as a drift at pace — dust, HUD, stats. */
  drifting: boolean;
  /** How far the DRIVEN wheels are outrunning the road, m/s — 0 hooked up,
   * and never more than the headroom between the road and what the current
   * gear gives at the limiter, because a wheel with a gear engaged cannot
   * turn faster than the engine can spin it. Which wheels those are is the
   * car's `drive` layout: an undriven wheel has nothing to spin it, so it
   * only ever turns at the speed of the ground under it. `rev` is this same
   * wheel speed read back through the gearing, so the needle, the engine
   * note and the drawn wheels are one number. Presentation readout (the
   * handling has already spent the same spin as torque that never reached
   * the road); the physics never reads it back. */
  wheelspin: number;
  /** How much weight is currently thrown across the car by a flick, 0..1.
   * The hands are only over the other side for a few frames; the LOAD they
   * threw is what the tires feel for the next half second, so it is held
   * and decayed here rather than read off the rack every step. Set by the
   * grounded step, read by nothing else. */
  flick: number;
  /** ...and which way that weight was sent, -1 or 1. Latched with the load
   * above: by the time the tires feel the throw the rack has arrived on
   * the new lock, and reading the sign off the wheel then would throw the
   * car back the way it came. */
  flickDir: number;
  /** How far the weight has moved FORWARD off the driven axle, 0..1 — the
   * lift, as the tires feel it rather than as the pedal reports it. The
   * throttle is a switch on a keyboard and a thing a driver breathes on a
   * pad, but the mass it moves takes a couple of tenths to arrive and the
   * same to go back; read straight off the pedal, a lift deep enough to
   * rotate the car turns every dab into a wobble and every corner into a
   * dozen flickering little drifts. Same reasoning as `flick` above, and
   * the same treatment. Set by the grounded step, read by nothing else. */
  lift: number;
  gear: number;
  /** Engine revs, 0 at idle and 1 at the redline (a shade over is the
   * limiter). On the move it is the DRIVEN WHEELS through the gearing:
   * road speed plus whatever `wheelspin` the axle is carrying, so the
   * needle flares when the tyres light up and the engine note flares with
   * it. The GEARBOX shifts on road speed alone, so a flare is never
   * mistaken for a gear that has run out. On the GRID, where the car
   * is not moving and no gear is selected yet, the throttle blips it
   * directly: a driver waiting for the lights revs the engine, and both the
   * tachometer and the engine bed read it here. HUD and audio readout — the
   * handling never reads it back. */
  rev: number;
  /** Which box this car is being driven with for the run. A player SETTING,
   * not a property of the car: every car in the roster can be handed over
   * either way, and the choice belongs to whoever is driving it. */
  gearbox: GearboxMode;
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
  /** True while the brake pedal is backing the car out rather than slowing
   * it — the car has stopped (or is already rolling back) and the pedal is
   * still down. The HUD reads it for the reverse gear. */
  reversing: boolean;
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
/** Which season a stage is driven in. The taiga has three: the boreal
 * forest under snow is a different biome (arctic), not a fourth season of
 * this one, so winter is not on this list and the presentation would have
 * nothing truthful to draw for it. */
export type Season = "spring" | "summer" | "autumn";

export type RaceEnv = {
  timeOfDay: TimeOfDay;
  weather: Weather;
  season: Season;
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
  /** Water taken at speed. `speed` is how fast the car went in, m/s;
   * `deep` marks water it will not be driving out of — the entry that
   * starts a drowning, as opposed to a ford crossed on the way past. */
  | { type: "splash"; speed: number; deep: boolean }
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
  /** R26 — the car has ridden over an anti-cut block on the inside of a
   * corner. `speed` is the closing speed into it, m/s. Not an `impact`:
   * nothing folded, nothing broke, and the car drives on — what it cost
   * was the line and a share of the speed carried through the apex. */
  | { type: "kerbHit"; speed: number }
  /** A SOLID THE CAR TOOK OUT OF THE WORLD: a trunk snapped through, a
   * rock knocked off its bed. The field has already stopped standing it,
   * so this is the renderer's one chance to catch it — it retires whatever
   * it was drawing there and tumbles the piece away along (`vx`, `vy`,
   * `vz`), the velocity the contact actually gave it. `broke` separates
   * the two: a snapped trunk comes down where it stood, an uprooted rock
   * leaves at speed. */
  | { type: "solidBreak"; solid: WildObstacle; broke: boolean; vx: number; vy: number; vz: number }
  /** The car has gone somewhere it cannot drive out of — deep water. A
   * solid never crashes the car: trees and rocks bend it and let it drive
   * on, and a wedge is answered by the stuck rule, not by a crash. The
   * respawn does NOT follow immediately: `state.drowning` runs first. */
  | { type: "crash" }
  /** The water has closed over the roof. Emitted once per drowning, part
   * way through it — the gulp, not the entry. */
  | { type: "sink" }
  | { type: "respawn" }
  /** R22 — a lap of a circuit is in the book. `lap` is the lap that was
   * just completed (1-based), `time` how long it took, and `best` says it
   * is the quickest of the run so far. */
  | { type: "lap"; lap: number; time: number; best: boolean }
  /** R28 — the car has driven through a split board. `index` is which one it
   * was on the LAP (0-based) and `count` how many the lap has — together
   * they are what a driver reads. `split` is where the time landed in
   * `checkpointTimes`, which on a circuit runs on across the laps: the two
   * differ from the second lap onward, and measuring against a ghost with
   * the lap index would put lap two's board against lap one's time. `time`
   * is the race clock as it went through — the split itself. */
  | { type: "checkpoint"; index: number; count: number; split: number; time: number }
  /** R27 — the car has come past a stand of spectators at a pace worth
   * cheering. `size` is how big that crowd is, 0..1, so one voice route
   * covers a knot of six at a corner and the bank at the finish. */
  | { type: "cheer"; size: number }
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

/** The run's arc.
 *
 * `intro` is the beat BEFORE the lights: the car is in the start control,
 * the camera is circling the start area, and the crew in front is pulling
 * away down the road. It runs for `TUNING.intro` and is the reason the
 * player's green light lands exactly one `START_INTERVAL` after theirs.
 *
 * `rollout` is the beat after the flying finish: the clock has stopped and
 * the result is already on screen, but the car is still doing what a car
 * crossing a finish line at 180 km/h does — carrying on down R22's run-out
 * road, off the throttle, slowing to a stop. Nothing the player does
 * reaches the car any more; it is being driven home. */
export type GamePhase = "intro" | "countdown" | "racing" | "rollout" | "finished";

/** A car in the water it cannot drive out of. While this is set the run is
 * not being driven: input is ignored, nothing progresses, and the only
 * thing happening is the water taking the car (TUNING.crash.drown). It
 * clears on the respawn at the far end. */
export type DrownState = {
  /** Sim time the water took it, s. */
  since: number;
  /** The water's surface height there, m — everything else is measured
   * down from this, so the hull floats on the lake rather than on a
   * remembered height. */
  waterY: number;
  /** Whether the water has already closed over the roof — the `sink` event
   * fires once, on the edge. */
  under: boolean;
};

export type GameState = {
  seed: number;
  /** The car as the run's GEARBOX delivers it — the catalog row with the
   * chosen box's ratios and losses already in it (`gearedSpec`). Read this,
   * never `carById`, for anything that cares how fast the car goes. */
  spec: CarSpec;
  track: Track;
  /** The landscape around the road — the ground the car rides once it
   * leaves the samples, with its water and its solid wild props. */
  terrain: TerrainField;
  /** R26 — the marking standing beside the road: the posts the car flattens
   * and the anti-cut blocks it is thrown by. Placed here rather than by the
   * renderer because one of the two is SOLID, and a block the car is thrown
   * by has to be a block the player can see. */
  kerbs: KerbField;
  car: CarState;
  phase: GamePhase;
  /** Set while the car is going down in deep water; null while it drives.
   * The renderer reads it to boil the surface around the hull, and the bot
   * and the HUD to know that nothing they ask for is being listened to. */
  drowning: DrownState | null;
  /** Sim time since creation, seconds. */
  t: number;
  /** Time spent racing (excludes countdown), seconds — it stops at the
   * finish line, so the roll-out past it is free. */
  raceTime: number;
  /** R22 — which lap the run is on, 1-based, and how many it is raced
   * over. A sprint is one lap of a road that never comes back, so it sits
   * at 1 of 1 and the lap clock and the total clock read the same. */
  lap: number;
  laps: number;
  /** The laps already in the book, seconds, in the order they were set. */
  lapTimes: number[];
  /** Race time the current lap started at, seconds — the lap clock is
   * `raceTime - lapStart`, so there is only ever one clock running. */
  lapStart: number;
  /** Seconds since the car crossed the finish line; 0 until it does. The
   * camera plants itself on the first of them and the finish's cannons
   * fire off it. */
  rollout: number;
  /** R27 — how far along the stage the crowd has already been heard from,
   * meters. Stands are kept in stage order, so the window between this and
   * `progressS` is exactly the crowds this step drove past — and an arc
   * position, unlike an index, survives an endless stage pruning the stands
   * it has left behind. */
  cheeredS: number;
  /** R28 — how many split boards the car has driven through THIS LAP; 0 on
   * the grid, and back to 0 when a circuit starts the next one. It is also
   * which checkpoint a respawn puts the car back at: board `n - 1`, or the
   * start line while it is still 0. */
  checkpointsPassed: number;
  /** R28 — how far along the stage the car has already been checked in,
   * meters. The window between this and `progressS` is exactly the boards
   * this step drove through, which is what keeps a board from firing twice
   * when a respawn puts the car back on top of it. */
  checkpointS: number;
  /** R28 — the race clock at every board passed this RUN, laps included, in
   * the order they were passed. The splits a ghost is measured against, and
   * what a sealed ghost writes down for the next run to chase. */
  checkpointTimes: number[];
  /** Index into track.samples the car is nearest to. A respawn is the one
   * thing that moves it BACKWARDS: it puts the car at a checkpoint, and
   * progress has to come back with it or the run would be credited with
   * road it is about to drive again. */
  progressIndex: number;
  /** Arc position along the stage, meters. */
  progressS: number;
  /** Signed lateral offset from the centerline, meters (positive right). */
  lateral: number;
  offRoad: boolean;
  offRoadSince: number;
  /** True while the car is LOST — off the road, far enough from it, and
   * pointed away rather than merely beside it (TUNING.offTrack.guide). It
   * is what the way-home guidance waits for: two wheels on the verge and a
   * clearing crossed perpendicular to the stage are both off the road and
   * neither is a driver who needs telling where the road went. */
  lost: boolean;
  /** Where and when the car last actually got somewhere. A car pinned
   * against a trunk with the throttle buried never leaves this anchor, and
   * that is what puts it back on the road (TUNING.offTrack.stuck). */
  stuck: { x: number; z: number; since: number };
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
