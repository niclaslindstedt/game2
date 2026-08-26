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
  type RunStats,
} from "./state.ts";
import { status } from "../output.ts";

const T = TUNING;

function freshStats(): RunStats {
  return {
    driftCount: 0,
    driftTime: 0,
    cleanDrifts: 0,
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
    drifting: false,
    driftTime: 0,
    driftSlipSum: 0,
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
};

export function createGame(options: CreateGameOptions): GameState {
  const spec = carById(options.carId ?? "compact");
  const track = options.track ?? compileTrack(options.seed);
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
  car.drifting = false;
  state.offRoad = false;
  state.stats.respawns += 1;
  events.push({ type: "respawn" });
}

/** Advance the run by one fixed timestep. Returns the events it emitted. */
export function step(state: GameState, input: CarInput): GameEvent[] {
  const events: GameEvent[] = [];
  state.t += T.dt;

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
  const ctx: GroundContext = {
    surface: state.offRoad ? "grass" : preFix.surface,
    groundY: preFix.elevation,
    slope: slopeAt(track, preFix.index),
    onLip: false,
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
