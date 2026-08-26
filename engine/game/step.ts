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
  type StageLength,
} from "../mapgen/index.ts";
import { carById } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import { launch, stepAirborne, stepGrounded, type GroundContext } from "./car.ts";
import { crossedLip, curvatureAt, locate, slopeAt } from "./track.ts";
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
  const track = options.track ?? compileStage(options.seed, options.length ?? "medium");
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
    car: freshCar(),
    phase: options.skipCountdown ? "racing" : "countdown",
    t: 0,
    raceTime: 0,
    progressIndex: 0,
    progressS: 0,
    lateral: 0,
    offRoad: false,
    offRoadSince: 0,
    surface: "gravel",
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
  car.roll = 0;
  car.rollRate = 0;
  car.slide = 0;
  car.drifting = false;
  state.offRoad = false;
  state.stats.respawns += 1;
  events.push({ type: "respawn" });
}

function crash(state: GameState, events: GameEvent[], into: "water" | "boulder" | "log"): boolean {
  state.stats.crashes += 1;
  events.push({ type: "crash", into });
  respawn(state, events);
  return true;
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
  const terrain = state.terrain;
  const prevIndex = state.progressIndex;

  // Locate against the centerline BEFORE the move to know the ground ahead;
  // the fix after the move drives progress, lip detection, and respawn.
  const preFix = locate(track, car.x, car.z, state.progressIndex);
  let ctx: GroundContext;
  if (preFix.offRoad) {
    // The wild: the terrain owns the ground. Slope and brow are read along
    // the heading over the same baseline the road uses, so the crest check
    // fires off a mountain shoulder exactly like it fires off a lip — this
    // is where the spontaneous cliff jumps come from.
    const span = T.air.crestSpan;
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    const here = terrain.heightAt(car.x, car.z);
    const fwd = terrain.heightAt(car.x + sinH * span, car.z + cosH * span);
    const back = terrain.heightAt(car.x - sinH * span, car.z - cosH * span);
    ctx = {
      surface: terrain.waterAt(car.x, car.z) !== null ? "water" : "nature",
      groundY: here,
      slope: (fwd - back) / (2 * span),
      roadCurve: (fwd + back - 2 * here) / (span * span),
      windX: state.wind.x,
      windZ: state.wind.z,
      t: state.t,
      rng: state.rng,
      groundAt: terrain.heightAt,
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
      ? terrain.waterAt(car.x, car.z) !== null
        ? "water"
        : "nature"
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

  // Crashes: deep water swallows the car, and the wild's solid props are
  // really solid. Crash physics is a later chapter — for now a crash puts
  // the car back on the track at its last progress.
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
      crashed = crash(state, events, "water");
    }
    if (!crashed) {
      for (const ob of terrain.obstaclesNear(car.x, car.z, 2)) {
        const dx = car.x - ob.x;
        const dz = car.z - ob.z;
        const d = Math.hypot(dx, dz);
        if (d > ob.radius || car.y > ob.y + ob.height) continue;
        if (Math.hypot(car.u, car.w) > T.crash.obstacleSpeed) {
          crashed = crash(state, events, ob.kind);
        } else if (d > 1e-3 && !car.airborne) {
          // A low-speed nudge: the prop does not move — the car stops.
          car.x = ob.x + (dx / d) * ob.radius;
          car.z = ob.z + (dz / d) * ob.radius;
          car.u = 0;
          car.w = 0;
        }
        break;
      }
    }
  }
  if (input.reset && !crashed && state.phase === "racing") respawn(state, events);

  // The finish line is the last sample. An endless stage has none — the
  // stream above always keeps road ahead of the car.
  if (!track.endless && state.progressIndex >= track.samples.length - 1) {
    state.phase = "finished";
    events.push({ type: "finish", time: state.raceTime });
    status(`Finished stage ${state.seed} in ${state.raceTime.toFixed(2)} s`);
  }

  return events;
}
