// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The game orchestrator: createGame builds a run (stage + car at the start
// grid), step advances it one fixed timestep and returns the events that
// step emitted. The app's render loop and the headless simulator drive this
// same function — there is no other way to advance a run.

import { createRng } from "../lib/prng.ts";
import { compileTrack } from "../mapgen/index.ts";
import { carById } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import { stepAirborne, stepGrounded, type GroundContext } from "./car.ts";
import { crossedLip, locate, slopeAt } from "./track.ts";
import {
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
    slide: 0,
    drifting: false,
    gear: 0,
    shiftCutUntil: 0,
    boostLeft: T.boost.capacity,
    boosting: false,
    steer: 0,
    braking: false,
  };
}

export type CreateGameOptions = {
  seed: number;
  carId?: string;
  /** Skip the countdown (sim runs start racing immediately). */
  skipCountdown?: boolean;
  /** Inject a pre-compiled track (tests and tooling); defaults to the
   * generated stage for `seed`. */
  track?: ReturnType<typeof compileTrack>;
  /** Race conditions. Time of day is presentation-only; weather sets the
   * wind band (TUNING.wind.speed). Defaults: day, clear. */
  env?: { timeOfDay?: TimeOfDay; weather?: Weather };
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
  const track = options.track ?? compileTrack(options.seed);
  const env = buildEnv(
    options.seed,
    options.env?.timeOfDay ?? "day",
    options.env?.weather ?? "clear",
  );
  status(
    `Stage ${options.seed}: ${(track.length / 1000).toFixed(1)} km, ` +
      `${track.segments.filter((p) => p.kind === "turn").length} turns, ` +
      `${track.segments.filter((p) => p.feature === "jump").length} jumps — ${spec.name}`,
  );
  return {
    seed: options.seed,
    spec,
    track,
    car: freshCar(),
    phase: options.skipCountdown ? "racing" : "countdown",
    t: 0,
    raceTime: 0,
    progressIndex: 0,
    progressS: 0,
    lateral: 0,
    offRoad: false,
    offRoadSince: 0,
    env,
    wind: windAt(env, 0),
    stats: freshStats(),
    rng: createRng((options.seed ^ 0x9e3779b9) >>> 0),
  };
}

function respawn(state: GameState, events: GameEvent[]): void {
  const sample = state.track.samples[state.progressIndex];
  const car = state.car;
  car.x = sample.x;
  car.z = sample.z;
  car.y = sample.elevation;
  car.heading = sample.heading;
  car.u = T.offTrack.respawnSpeed;
  car.w = 0;
  car.vy = 0;
  car.yawRate = 0;
  car.airborne = false;
  car.slide = 0;
  car.drifting = false;
  state.offRoad = false;
  state.stats.respawns += 1;
  events.push({ type: "respawn" });
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
    // The grid: steering wiggles are allowed, the car does not move.
    return events;
  }
  if (state.phase === "finished") return events;

  state.raceTime += T.dt;
  const car = state.car;
  const track = state.track;
  const prevIndex = state.progressIndex;
  const prevSurface = track.samples[prevIndex].surface;

  // Locate against the centerline BEFORE the move to know the ground ahead;
  // the fix after the move drives progress, lip detection, and respawn.
  const preFix = locate(track, car.x, car.z, state.progressIndex);
  // The ground the car is asked to follow, now and a beat ahead — the pair
  // is what decides whether a brow throws it. A jump lip inside that
  // lookahead is NOT a brow: its drop belongs to the ramp launch below, and
  // reading it here would fire a stutter of hops on the run-up instead.
  const aheadIndex = Math.min(
    track.samples.length - 1,
    preFix.index + Math.round((car.u * T.air.crestLook) / track.step),
  );
  const lipAhead = crossedLip(track, preFix.index, aheadIndex) >= 0;
  const ctx: GroundContext = {
    surface: state.offRoad ? "grass" : preFix.surface,
    groundY: preFix.elevation,
    slope: preFix.slope,
    slopeAhead: lipAhead ? preFix.slope : slopeAt(track, aheadIndex),
    windX: state.wind.x,
    windZ: state.wind.z,
    t: state.t,
    rng: state.rng,
  };

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

  // Jump lips are keyed to progress so a lip cannot be skipped by a fast
  // step; the grounded step already applied ground-follow, so takeoff here
  // overrides it with the ramp launch.
  if (!car.airborne && fix.index > prevIndex) {
    const lipIndex = crossedLip(track, prevIndex, fix.index);
    if (lipIndex >= 0 && car.u > 6) {
      car.airborne = true;
      car.airTime = 0;
      car.y = track.samples[lipIndex].elevation;
      car.vy = Math.max(0.5, car.u * slopeAt(track, lipIndex) * T.air.launchScale);
      events.push({ type: "takeoff", vy: car.vy });
      state.stats.jumps += 1;
    }
  }

  // Water reads as an event on entry (the splash) and as a surface while in
  // it (the grounded step already slowed the car down).
  const nowSurface = track.samples[state.progressIndex].surface;
  if (!car.airborne && nowSurface === "water" && prevSurface !== "water") {
    events.push({ type: "splash" });
    state.stats.splashes += 1;
  }

  // Off-road accounting and the lost-car respawn.
  if (fix.offRoad !== state.offRoad && !car.airborne) {
    state.offRoad = fix.offRoad;
    state.offRoadSince = state.t;
    events.push({ type: "offRoad", off: fix.offRoad });
  }
  if (state.offRoad) {
    state.stats.offRoadTime += T.dt;
    const lost =
      Math.abs(fix.lateral) > T.offTrack.lostOffset ||
      state.t - state.offRoadSince > T.offTrack.lostAfter;
    if (lost && !car.airborne) respawn(state, events);
  }

  // The finish line is the last sample.
  if (state.progressIndex >= track.samples.length - 1) {
    state.phase = "finished";
    events.push({ type: "finish", time: state.raceTime });
    status(`Finished stage ${state.seed} in ${state.raceTime.toFixed(2)} s`);
  }

  return events;
}
