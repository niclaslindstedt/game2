// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The game orchestrator: createGame builds a run (stage + car at the start
// grid), step advances it one fixed timestep and returns the events that
// step emitted. The app's render loop and the headless simulator drive this
// same function — there is no other way to advance a run.

import { createRng } from "../lib/prng.ts";
import {
  compileStage,
  compileTrack,
  createTerrain,
  STAGE_RULES,
  type StageKnobs,
  type StageLength,
} from "../mapgen/index.ts";
import { carById } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import { launch, stepAirborne, stepGrounded, type GroundContext } from "./car.ts";
import { collideCar } from "./collision.ts";
import { crossedLip, curvatureAt, locate, slopeAt, wayHome } from "./track.ts";
import {
  DAMAGE_ZONES,
  type CarInput,
  type CarState,
  type GameEvent,
  type GameState,
  type RaceEnv,
  type RunStats,
  type TimeOfDay,
  type Weather,
} from "./state.ts";
import { status } from "../output.ts";

const T = TUNING;

function freshStats(): RunStats {
  return {
    driftCount: 0,
    driftTime: 0,
    driftScore: 0,
    jumps: 0,
    airTime: 0,
    cleanLandings: 0,
    splashes: 0,
    offRoadTime: 0,
    impacts: 0,
    crashes: 0,
    respawns: 0,
    topSpeed: 0,
  };
}

function freshCar(): CarState {
  return {
    x: 0,
    z: 0,
    y: 0,
    heading: 0,
    u: 0,
    w: 0,
    vy: 0,
    yawRate: 0,
    slip: 0,
    airborne: false,
    airTime: 0,
    roll: 0,
    rollRate: 0,
    pitch: 0,
    slide: 0,
    drifting: false,
    gear: 0,
    shiftCutUntil: 0,
    boostLeft: T.boost.capacity,
    boosting: false,
    steer: 0,
    braking: false,
    damage: {
      zones: new Array(DAMAGE_ZONES).fill(0),
      belly: 0,
      wear: 0,
      systems: { engine: 0, suspension: 0, gearbox: 0, steering: 0 },
      broken: [],
      version: 0,
    },
  };
}

export type CreateGameOptions = {
  seed: number;
  carId?: string;
  /** Menu stage length (finite band or endless); defaults to medium. */
  length?: StageLength;
  /** Skip the countdown (sim runs start racing immediately). */
  skipCountdown?: boolean;
  /** Inject a pre-compiled track (tests and tooling); defaults to the
   * generated stage for `seed` at `length`. */
  track?: ReturnType<typeof compileTrack>;
  /** Race conditions. Time of day is presentation-only; weather sets the
   * wind band (TUNING.wind.speed). Defaults: day, clear. */
  env?: { timeOfDay?: TimeOfDay; weather?: Weather };
  /** The generator's dials (rules.ts) for the stage this run compiles.
   * Ignored when a pre-compiled `track` is handed in — that track carries
   * the dials it was built with. */
  knobs?: Partial<StageKnobs>;
};

/** Wind direction, mean speed, and gust phase are seeded on their own
 * stream so adding weather never shifts the in-run RNG the physics draws
 * from. The same seed and weather always blow the same wind. */
function buildEnv(seed: number, timeOfDay: TimeOfDay, weather: Weather): RaceEnv {
  const rng = createRng((seed ^ 0x51ab3d75) >>> 0);
  const [minSpeed, maxSpeed] = T.wind.speed[weather];
  return {
    timeOfDay,
    weather,
    windDir: rng.range(0, Math.PI * 2),
    windSpeed: rng.range(minSpeed, maxSpeed),
    gustPhase: rng.range(0, Math.PI * 2),
  };
}

/** The wind at sim time `t`: the mean vector breathing through two slow
 * sine gusts and veering a little around its bearing — deterministic, so
 * replays and sim digests hold. */
function windAt(env: RaceEnv, t: number): { x: number; z: number } {
  const gust =
    1 +
    T.wind.gust *
      (0.7 * Math.sin(t * 0.9 + env.gustPhase) + 0.3 * Math.sin(t * 2.3 + env.gustPhase * 1.7));
  const dir = env.windDir + T.wind.veer * Math.sin(t * 0.13 + env.gustPhase);
  const speed = env.windSpeed * gust;
  return { x: Math.sin(dir) * speed, z: Math.cos(dir) * speed };
}

export function createGame(options: CreateGameOptions): GameState {
  const spec = carById(options.carId ?? "compact");
  const track =
    options.track ?? compileStage(options.seed, options.length ?? "medium", options.knobs);
  // The start grid is the first sample, not the world origin: the stage's
  // rolling elevation puts the road metres above or below zero right from
  // the line, and a car left at zero spends the countdown buried in the
  // gravel (or hovering over it) until the first step snaps it onto the road.
  const grid = track.samples[0];
  const car = freshCar();
  car.x = grid.x;
  car.z = grid.z;
  car.y = grid.elevation;
  car.heading = grid.heading;
  const env = buildEnv(
    options.seed,
    options.env?.timeOfDay ?? "day",
    options.env?.weather ?? "clear",
  );
  status(
    track.endless
      ? `Stage ${options.seed}: endless — ${spec.name}`
      : `Stage ${options.seed}: ${(track.length / 1000).toFixed(1)} km, ` +
          `${track.segments.filter((p) => p.kind === "turn").length} turns, ` +
          `${track.segments.filter((p) => p.feature === "jump").length} jumps — ${spec.name}`,
  );
  return {
    seed: options.seed,
    spec,
    track,
    terrain: createTerrain(track),
    car,
    phase: options.skipCountdown ? "racing" : "countdown",
    t: 0,
    raceTime: 0,
    progressIndex: 0,
    progressS: 0,
    lateral: 0,
    offRoad: false,
    offRoadSince: 0,
    stuck: { x: car.x, z: car.z, since: 0 },
    surface: "gravel",
    env,
    wind: windAt(env, 0),
    stats: freshStats(),
    rng: createRng((options.seed ^ 0x9e3779b9) >>> 0),
  };
}

/** What the car is driving on when it is not on the stage road: water it
 * has waded into, the mat of an abandoned asphalt branch, or plain nature. */
function offRoadSurface(state: GameState, x: number, z: number): "water" | "nature" | "asphalt" {
  if (state.terrain.waterAt(x, z) !== null) return "water";
  return state.terrain.spurSurfaceAt(x, z) === "asphalt" ? "asphalt" : "nature";
}

function respawn(state: GameState, events: GameEvent[]): void {
  const home = wayHome(state);
  const car = state.car;
  car.x = home.x;
  car.z = home.z;
  car.y = home.y;
  car.heading = home.heading;
  car.u = T.offTrack.respawnSpeed;
  car.w = 0;
  car.vy = 0;
  car.yawRate = 0;
  car.airborne = false;
  car.roll = 0;
  car.rollRate = 0;
  car.pitch = 0;
  car.slide = 0;
  car.drifting = false;
  // The service crew get to a wreck the moment it is back at the road: the
  // chassis is patched to a drivable fraction, and the dents, the torn-off
  // parts and the hurt systems all stay.
  if (car.damage.wear >= 1) car.damage.wear = T.collision.repairTo;
  state.offRoad = false;
  state.stuck.x = car.x;
  state.stuck.z = car.z;
  state.stuck.since = state.t;
  state.stats.respawns += 1;
  events.push({ type: "respawn" });
}

function crash(state: GameState, events: GameEvent[]): boolean {
  state.stats.crashes += 1;
  events.push({ type: "crash" });
  respawn(state, events);
  return true;
}

/** The wedge check: a car pinned against a trunk with the throttle buried
 * is not driving out of it, and since nothing else brings a car home any
 * more, this is the one thing that does. The anchor moves whenever the car
 * covers real ground, so only genuinely going nowhere accumulates. */
function stepStuck(state: GameState, input: CarInput, events: GameEvent[]): void {
  const car = state.car;
  const asking = input.throttle > 0.5 && !car.airborne;
  const moved = Math.hypot(car.x - state.stuck.x, car.z - state.stuck.z);
  if (!asking || moved > T.offTrack.stuck.radius) {
    state.stuck.x = car.x;
    state.stuck.z = car.z;
    state.stuck.since = state.t;
  } else if (state.t - state.stuck.since >= T.offTrack.stuck.after) {
    respawn(state, events);
  }
}

/** Advance the run by one fixed timestep. Returns the events it emitted. */
export function step(state: GameState, input: CarInput): GameEvent[] {
  const events: GameEvent[] = [];
  state.t += T.dt;

  // The wind blows through every phase — the grid's flags and fumes drift
  // before the lights go green.
  const wind = windAt(state.env, state.t);
  state.wind.x = wind.x;
  state.wind.z = wind.z;

  if (state.phase === "countdown") {
    if (state.t >= T.countdown) {
      state.phase = "racing";
      events.push({ type: "go" });
    }
    // The grid: steering wiggles are allowed, the car does not move — and
    // a throttle held through the lights is revving, not being wedged, so
    // the wedge clock only starts when the flag drops.
    state.stuck.since = state.t;
    return events;
  }
  if (state.phase === "finished") return events;

  state.raceTime += T.dt;
  const car = state.car;
  const track = state.track;
  const terrain = state.terrain;
  const prevIndex = state.progressIndex;

  // Locate against the centerline BEFORE the move to know the ground ahead;
  // the fix after the move drives progress, lip detection, and respawn.
  const preFix = locate(track, car.x, car.z, state.progressIndex);
  let ctx: GroundContext;
  if (preFix.offRoad) {
    // The wild: the terrain owns the ground — the RIDDEN lattice surface
    // (terrain.groundAt), which is the exact ground the renderer draws.
    // The brow is read along the heading over the same wide baseline the
    // road uses, so the crest check fires off a mountain shoulder exactly
    // like it fires off a lip — this is where the spontaneous cliff jumps
    // come from. The grade the car stands on is read over its own short
    // baseline, along the heading AND across it: the along slope pitches
    // the nose and pushes back on a climb, the lateral slope pulls the car
    // toward the hillside's downhill side.
    const ground = terrain.groundAt;
    const span = T.air.crestSpan;
    const grade = T.hills.gradeSpan;
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    const here = ground(car.x, car.z);
    const fwd = ground(car.x + sinH * span, car.z + cosH * span);
    const back = ground(car.x - sinH * span, car.z - cosH * span);
    const ahead = ground(car.x + sinH * grade, car.z + cosH * grade);
    const behind = ground(car.x - sinH * grade, car.z - cosH * grade);
    // The car's right axis in world space is (cos h, -sin h).
    const right = ground(car.x + cosH * grade, car.z - sinH * grade);
    const left = ground(car.x - cosH * grade, car.z + sinH * grade);
    ctx = {
      // Off the stage is not always off the ROAD: the asphalt branches the
      // route abandons at its junctions (R17) are real tarmac, and a car
      // exploring one gets tarmac grip on it.
      surface: offRoadSurface(state, car.x, car.z),
      groundY: here,
      slope: (ahead - behind) / (2 * grade),
      slopeLat: (right - left) / (2 * grade),
      roadCurve: (fwd + back - 2 * here) / (span * span),
      windX: state.wind.x,
      windZ: state.wind.z,
      t: state.t,
      rng: state.rng,
      groundAt: ground,
    };
  } else {
    // How sharply the road brows under the car — what decides whether it
    // throws the car. A jump lip anywhere in that window is NOT a brow: its
    // drop belongs to the ramp launch below, and reading it here would fire
    // a stutter of hops on the run-up instead.
    const reach = Math.max(1, Math.round(T.air.crestSpan / track.step));
    const lipNear =
      crossedLip(track, Math.max(-1, preFix.index - reach - 1), preFix.index + reach) >= 0;
    ctx = {
      surface: preFix.surface,
      groundY: preFix.elevation,
      slope: preFix.slope,
      slopeLat: preFix.slopeLat,
      roadCurve: lipNear ? 0 : curvatureAt(track, preFix.index, T.air.crestSpan),
      windX: state.wind.x,
      windZ: state.wind.z,
      t: state.t,
      rng: state.rng,
    };
  }

  if (car.airborne) {
    stepAirborne(car, input, ctx, events, state.stats);
  } else {
    stepGrounded(state.spec, car, input, ctx, events, state.stats);
  }

  const fix = locate(track, car.x, car.z, state.progressIndex);
  state.progressIndex = Math.max(state.progressIndex, fix.index);
  state.progressS = track.samples[state.progressIndex].s;
  state.lateral = fix.lateral;
  state.stats.topSpeed = Math.max(state.stats.topSpeed, car.u);

  // An endless stage keeps the road materialized well past the horizon —
  // the bot's plan, the pacenotes, and the renderer all read ahead of the
  // car, and none of them may ever see the end of the world.
  if (track.endless) track.extend?.(state.progressS + STAGE_RULES.endless.horizon);
  terrain.sync(state.progressS);

  // Jump lips are keyed to progress so a lip cannot be skipped by a fast
  // step; the grounded step already applied ground-follow, so takeoff here
  // overrides it with the ramp launch.
  if (!car.airborne && fix.index > prevIndex) {
    const lipIndex = crossedLip(track, prevIndex, fix.index);
    if (lipIndex >= 0 && car.u > 6) {
      car.y = track.samples[lipIndex].elevation;
      launch(
        car,
        Math.max(0.5, car.u * slopeAt(track, lipIndex) * T.air.launchScale),
        events,
        state.stats,
      );
    }
  }

  // Water reads as an event on entry (the splash) and as a surface while
  // in it (the grounded step already slowed the car down) — on the road's
  // fords and out in the wild's lakes and streams alike.
  const nowSurface = car.airborne
    ? state.surface
    : fix.offRoad
      ? offRoadSurface(state, car.x, car.z)
      : track.samples[fix.index].surface;
  if (!car.airborne && nowSurface === "water" && state.surface !== "water") {
    events.push({ type: "splash" });
    state.stats.splashes += 1;
  }
  state.surface = nowSurface;

  // Off-road accounting. Exploring never times out: nothing but a crash —
  // or the reset input — brings a wandering car back to the track.
  if (fix.offRoad !== state.offRoad && !car.airborne) {
    state.offRoad = fix.offRoad;
    state.offRoadSince = state.t;
    events.push({ type: "offRoad", off: fix.offRoad });
  }
  if (state.offRoad) state.stats.offRoadTime += T.dt;

  // Solid contact: deep water still swallows the car whole, but the wild's
  // props and the forest's trunks BEND it instead of ending it — impulse,
  // crush and yaw kick live in collision.ts, and no amount of it ever ends
  // the excursion. Keep hitting things until the car cannot move.
  let crashed = false;
  if (fix.offRoad) {
    const water = terrain.waterAt(car.x, car.z);
    if (water !== null && water - car.y > T.crash.deepWater) {
      // A plunge straight off a cliff into the sea never grounds in the
      // shallows first — the crash IS the splash.
      if (state.surface !== "water") {
        events.push({ type: "splash" });
        state.stats.splashes += 1;
      }
      crashed = crash(state, events);
    }
    if (!crashed) {
      const solids = terrain.obstaclesNear(car.x, car.z, 2.5);
      solids.push(...terrain.treesNear(car.x, car.z, 2.5));
      if (solids.length > 0) collideCar(car, solids, events, state.stats);
    }
  }
  // A wreck is driven, not teleported: wear reaching 1 leaves a car with
  // nothing left to give still sitting where it stopped. Only the wedge
  // check below, or the reset input, ever brings it home.
  if (input.reset && !crashed) respawn(state, events);
  else if (!crashed) stepStuck(state, input, events);

  // The finish line is the last sample. An endless stage has none — the
  // stream above always keeps road ahead of the car.
  if (!track.endless && state.progressIndex >= track.samples.length - 1) {
    state.phase = "finished";
    events.push({ type: "finish", time: state.raceTime });
    status(`Finished stage ${state.seed} in ${state.raceTime.toFixed(2)} s`);
  }

  return events;
}
