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

/** WHAT A DAMAGE CALL IS ABOUT: one of the four systems, or the shell they
 * are all bolted into. The chassis is not a system — nothing under the
 * bonnet is wearing out, the body is simply losing its shape — but it fails
 * the same way and it is said the same way, so the call carries it. */
export type DamageCall = InternalSystem | "chassis";

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
   * into the handling — see `tyreLoad` for why the grip a landing costs is
   * NOT taken off this, tempting as that looks. */
  ride: number;
  /** ...and the speed it is travelling at, m/s. */
  rideRate: number;
  /** How much the car is still SKITTERING after arriving, 0..1 — the
   * wheels themselves hopping on their own tires, which is a beat of the
   * car the body-on-springs model above has no way to hold: it has one
   * vertical mass and the real car has five. A landing writes it, sized by
   * the descent the springs had to swallow, and it fades out over about
   * half a second. While it is up the tires are only intermittently on the
   * ground, so they hold less — which is why a car that lands with any
   * angle on it, or with the wheel turned, gets away from the driver
   * instead of tracking straight out of the jump. */
  settle: number;
  /** HOW MUCH OF ITS OWN WEIGHT THE CAR IS STANDING ON, 1 on level ground.
   * The ground curving under the direction of travel takes weight off the
   * tires or presses it on: a brow, or a bank the car has ridden up and
   * then run straight off the top of, spends part of the car's weight
   * following the ground down and leaves the tires the rest; a dip's floor
   * does the opposite. Under 1 the car goes light — the slide comes easier
   * and the nose is harder to hold — and it is the SAME quantity the
   * takeoff reads, so going light and flying are one continuum. Written by
   * the grounded step, spent through `tyreLoad`, and reset to 1 by a
   * launch: in the air the tires carry nothing. */
  weight: number;
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
  /** HOW MUCH THE LAST DRIFT TOOK OUT OF THE TIRES, 0..1 — the chain a
   * sequence of corners builds up. Stepped once each time a drift BEGINS
   * (`drift.linkStep`) and cooling the whole time (`drift.linkFade`), so a
   * chicane's second corner is entered on rubber the first one has already
   * used and the third on less again. Read by the grounded step, where it
   * both deepens the slide being asked for and brings the breakaway
   * forward; nothing else may write it. */
  chain: number;
  /** True while the car is SPUN — past `drift.spinAt` of slip, where the
   * front tires point so far from the travel that neither the held lock nor
   * the catch reaches the road. Not a deep drift: a drift the driver has
   * lost. Held through its own hysteresis (`spinBack`, `spinOut`) so the
   * moment reads as one event rather than a stutter, and cleared by a
   * respawn like every other thing the car is carrying. */
  spun: boolean;
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
  /** How lit the driven axle is by more pedal than it will take, 0..1 —
   * the launch's own wheelspin, and unlike `wheelspin` above this one IS
   * the physics: it spins away a share of `gearAccel` for as long as it
   * lasts. Two things set it. Pedal past the axle's bite lights it while
   * the throttle is down, worst at the bottom of a gear and gone by the top
   * of it. And the CLUTCH COMING OUT loads it whole: the revs a driver was
   * holding when the lights went green arrive at the tyres all at once,
   * which is why a car that sat on the line screaming leaves slower than
   * one that waited with the pedal up. It hooks back up over a second or
   * so, faster for a driver who eases off. */
  launchSpin: number;
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
  /** ...and how far the BRAKE has pitched it forward, 0..1. Its own state
   * rather than a second reading of `lift`, because the two pedals are not
   * one axis: coasting into a corner takes the drive off the loaded axle,
   * standing on the brakes puts the whole car on its nose and leaves the
   * rear light enough to come round. It is what makes a trailed brake a way
   * of asking for the angle (`drift.brakeDepth`) instead of only a way of
   * losing speed. Lagged, for the reason `lift` is: the pedal is a key and
   * the mass it moves is not. Set by the grounded step, read by nothing
   * else. */
  brakeLoad: number;
  /** How far the rear has been unstuck by a MOVE rather than by the wheel,
   * 0..1 of a fully developed slide — the flick's weight, the trailed
   * brake, the lever, whichever is asking for the most. It is what a
   * layout's own `depth` is lifted toward (`drift.leverDepth` and friends),
   * and it HOLDS and decays for the reason the flick's load does: the lever
   * comes up in one tick and the weight it moved takes the better part of a
   * second to come back. Set by the grounded step, read by nothing else. */
  provoked: number;
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
  /** Steer input applied this step, -1..1 (renderer readout: the front
   * wheels point where the driver points them). */
  steer: number;
  /** True while the brakes bite this step (renderer readout: brake FX). */
  braking: boolean;
  /** True while the LEVER has the rear wheels locked and the car is moving
   * fast enough for that to mean anything (renderer readout: tire smoke).
   * A dragged tire is cooking whether or not the car has reached an angle
   * anybody would call a drift, which is the difference between this and
   * `drifting`: on tarmac the lever is the single smokiest thing a car can
   * do, and gating the smoke on angle alone left it silent through the
   * whole first half of a handbrake turn. */
  locked: boolean;
  /** True while the brake pedal is backing the car out rather than slowing
   * it — the car has stopped (or is already rolling back) and the pedal is
   * still down. The HUD reads it for the reverse gear. */
  reversing: boolean;
  damage: CarDamage;
  /** HOW MUCH OF A HIT THIS CAR ACTUALLY KEEPS, 0..1 — the one thing a
   * difficulty does to the car rather than to the field (`damageScaleFor`
   * in sim/skill.ts), handed in at `createGame` and never touched again.
   *
   * It scales the LEDGER and nothing else. The contact still happens in
   * full: the impulse, the yaw kick, the springs, the noise and the dust
   * are the world's business and are the same at every setting, so a tree
   * met at speed still spins the car and still sounds like a tree met at
   * speed. What changes is how much of the fold is written down — 1 is the
   * car as the collision model builds it, 0 is a car that cannot be
   * marked. Every car in the sim defaults to 1: this is an assist on the
   * run a player is sat in, not a change to the world. */
  damageScale: number;
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
  /** The wheels arriving. `slam` is the descent the springs had to swallow,
   * m/s — HOW HARD the car landed, which air time only ever guessed at: a
   * short hop off a two-metre lip arrives harder than a long floaty flight
   * that comes down on a slope running away from it. It is what the camera,
   * the dust and the sound are all sized off, so that a small jump is a
   * small hit rather than no hit at all. */
  | { type: "landing"; airTime: number; slam: number; clean: boolean }
  /** Water taken at speed. `speed` is how fast the car went in, m/s;
   * `deep` marks water it will not be driving out of — the entry that
   * starts a drowning, as opposed to a ford crossed on the way past. */
  | { type: "splash"; speed: number; deep: boolean }
  | { type: "shift"; gear: number }
  /** A drift gone past saving — the car is round and rotating on its own
   * momentum. `slip` is the angle it went at, rad, and `speed` how fast it
   * was travelling when it let go: together they are how big a moment it
   * was, which is what the camera, the smoke and the sound are sized off. */
  | { type: "spin"; slip: number; speed: number }
  | { type: "offRoad"; off: boolean }
  /** A contact hard enough to matter. `speed` is the closing speed into
   * the surface, m/s; `angle` is where on the body it landed, radians in
   * the car frame (0 = nose, positive toward the right side); `belly` marks
   * a slammed landing taken on the underside, where no ring angle applies. */
  | { type: "impact"; speed: number; angle: number; belly: boolean }
  /** A piece of the body tearing off — the renderer sends it flying. */
  | { type: "partBreak"; part: DamagePart }
  /** THE ONE PIECE OF DAMAGE NEWS NOBODY CAN SEE. A folded wing is on the
   * screen and a bonnet leaving on the wind announces itself; an engine
   * that has quietly lost a third of its power does not, and a driver who
   * only finds out on the next hill has been told nothing. So each system
   * (and the shell) calls out as it crosses the two lines that mean
   * something — `spent` false is the part giving, true is it gone
   * (`TUNING.collision.callAt`). Once per line: damage never heals, so a
   * line crossed stays crossed, and only the wreck's patch-up at a respawn
   * can put the chassis back under one. */
  | { type: "systemFail"; system: DamageCall; spent: boolean }
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
  /** The car has gone into deep water. A solid never crashes the car: trees
   * and rocks bend it and let it drive on, and a wedge is answered by the
   * stuck rule, not by a crash. No respawn follows immediately — and on the
   * entry that the car's own momentum carries back onto a bank, none
   * follows at all: `state.drowning` runs first and decides. */
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
  /** Drifts taken past `drift.spinAt` — the ones that got away. The counter
   * that says whether a car can be overdriven at all: a roster that never
   * spins has no upper edge to its drift, and a bot that spins on every
   * stage is being asked for angle it cannot hold. */
  spins: number;
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

/** A car in water too deep to drive. While this is set the run is not being
 * driven: input is ignored, nothing progresses, and the only thing
 * happening is the water taking the car (TUNING.crash.drown). It clears
 * either way the beat can end — on the respawn once the car has gone down,
 * or the moment the entry's own momentum has carried it back onto ground it
 * can drive from, which costs the run the swim and nothing else. */
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
   * neither is a driver who needs telling where the road went. Never true
   * at the same time as `wrongWay`, which vetoes it: a car that call has
   * proved is on the road has not lost it. */
  lost: boolean;
  /** True while the car is driving the stage BACKWARDS — on the road, nose
   * pointed back up it and travelling that way at pace, for long enough
   * that it is a direction rather than a moment (TUNING.wrongWay). What the
   * co-driver's TURN AROUND sign waits for. Being off the road is a
   * different problem with a different sign: the way home owns that one. */
  wrongWay: boolean;
  /** How long the car has been running back up the stage without the sign
   * being up yet, s. Reset by anything that fails either half of the test,
   * so only a sustained wrong way ever reaches `wrongWay.after`. */
  wrongWayFor: number;
  /** Which centerline sample the wrong-way call is being read at — its own
   * search cursor, and the only one on the state that FOLLOWS THE CAR BACK
   * UP THE STAGE. Every other fix hunts from `progressIndex`, which only
   * ever climbs and whose search reaches fifteen samples behind it: past
   * thirty metres back, that fix is pinned to road the car has left, and
   * the road direction read there belongs to another corner. Only the sign
   * reads this; the physics keeps the progress-anchored fix it has always
   * had. */
  wrongWayAt: number;
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
  /** THE METRES THIS CAR IS OWED off a mass-start grid, as extra drive it
   * gets to take them back with (TUNING.massStart). Null on every run that
   * started level — a rally interval start, a time trial, Roam — and null
   * again the moment it is spent, which is what keeps a lapped circuit from
   * launching the whole field a second time. */
  catchUp: CatchUp | null;
  stats: RunStats;
  /** Seeded stream for in-run randomness (airborne turbulence only). */
  rng: Rng;
};

/** A grid slot's compensation: how much extra drive it gets, and the arc
 * position along the stage at which it stops getting it. */
export type CatchUp = {
  /** Extra drive as a fraction — 0.03 is three percent more acceleration. */
  gain: number;
  /** Where up the road it runs out, meters along the stage. */
  untilS: number;
};
