// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The game orchestrator: createGame builds a run (stage + car at the start
// grid), step advances it one fixed timestep and returns the events that
// step emitted. The app's render loop and the headless simulator drive this
// same function — there is no other way to advance a run.

import { clamp } from "../lib/math.ts";
import { createRng } from "../lib/prng.ts";
import {
  compileStage,
  compileTrack,
  createTerrain,
  STAGE_RULES,
  type StageKnobs,
  type StageLength,
  type Surface,
} from "../mapgen/index.ts";
import { carById } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import { launch, stepAirborne, stepGrounded, type GroundContext } from "./car.ts";
import { collideCar } from "./collision.ts";
import {
  crossedFinish,
  crossedLip,
  curvatureAt,
  locate,
  slopeAt,
  trackLost,
  wayHome,
} from "./track.ts";
import {
  DAMAGE_ZONES,
  updateSlip,
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
    settling: false,
    roll: 0,
    rollRate: 0,
    pitch: 0,
    ride: 0,
    rideRate: 0,
    pitchLoad: 0,
    slide: 0,
    drifting: false,
    gear: 0,
    rev: 0,
    shiftCutUntil: 0,
    boostLeft: T.boost.capacity,
    boosting: false,
    steer: 0,
    braking: false,
    reversing: false,
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
    lost: false,
    stuck: { x: car.x, z: car.z, since: 0 },
    drowning: null,
    surface: "gravel",
    env,
    wind: windAt(env, 0),
    stats: freshStats(),
    rng: createRng((options.seed ^ 0x9e3779b9) >>> 0),
  };
}

/** What the car is driving on when it is not on the stage road: water it
 * has waded into, one of the branches the route abandons at its junctions
 * (R17), or plain nature. A spur is a REAL road, sealed or graded, and it
 * keeps its own surface here: collapsing a gravel branch into `nature`
 * gives a car driving down a drawn gravel road a field's grip, a field's
 * speed cap, and a rooster tail of torn grass. */
function offRoadSurface(state: GameState, x: number, z: number): Surface | "nature" {
  if (state.terrain.waterAt(x, z) !== null) return "water";
  return state.terrain.spurSurfaceAt(x, z) ?? "nature";
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
  car.settling = false;
  car.roll = 0;
  car.rollRate = 0;
  car.pitch = 0;
  car.ride = 0;
  car.rideRate = 0;
  car.pitchLoad = 0;
  car.slide = 0;
  car.drifting = false;
  // The service crew get to a wreck the moment it is back at the road: the
  // chassis is patched to a drivable fraction, and the dents, the torn-off
  // parts and the hurt systems all stay.
  if (car.damage.wear >= 1) car.damage.wear = T.collision.repairTo;
  state.drowning = null;
  state.offRoad = false;
  state.stuck.x = car.x;
  state.stuck.z = car.z;
  state.stuck.since = state.t;
  state.stats.respawns += 1;
  events.push({ type: "respawn" });
}

/** The water takes the car. The run is lost here and the crew are already
 * on their way, but the car is not lifted off the lake until it has gone
 * down: `stepDrowning` owns the seconds in between, and the respawn is at
 * the far end of them. */
function drown(state: GameState, events: GameEvent[], waterY: number): void {
  const car = state.car;
  state.stats.crashes += 1;
  events.push({ type: "crash" });
  state.drowning = { since: state.t, waterY, under: false };
  // Whatever the entry was — a wade off the verge or a plunge off a deck —
  // it is a swim from here: the springs, the slide and the flight all stop
  // being things that are happening to this car.
  car.airborne = false;
  car.settling = false;
  car.airTime = 0;
  car.drifting = false;
  car.slide = 0;
  car.braking = false;
  car.boosting = false;
  car.reversing = false;
  // A body arriving fast enough to reach the bed before it has floated at
  // all skips the whole beat, so the water is allowed to swallow only so
  // much of a plunge.
  car.vy = Math.max(car.vy, -T.crash.drown.plunge);
}

/** One step of a car going down. Nothing else in the run advances while
 * this is running — no progress, no surface, no wedge clock, and no input:
 * the seconds ARE the penalty, and a driver who could steer out of them
 * would not be paying it. */
function stepDrowning(state: GameState, events: GameEvent[]): void {
  const car = state.car;
  const d = state.drowning as NonNullable<GameState["drowning"]>;
  const D = T.crash.drown;
  const age = state.t - d.since;

  // The water takes the momentum, but not instantly: the car carries its
  // entry line a few metres into the lake, and keeps swinging on its yaw
  // long after it has stopped going anywhere.
  car.u *= Math.exp(-T.dt / D.stopIn);
  car.w *= Math.exp(-T.dt / D.stopIn);
  car.yawRate *= Math.exp(-T.dt / D.slewIn);
  car.heading += car.yawRate * T.dt;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  car.x += (sinH * car.u + cosH * car.w) * T.dt;
  car.z += (cosH * car.u - sinH * car.w) * T.dt;
  updateSlip(car);

  // Where the hull wants to sit. For the first `float` seconds that is its
  // waterline; after it, the waterline itself walks down to the bed and
  // takes the car with it. Smoothstepped, so the water starts winning
  // gradually rather than the car dropping on a cue.
  const going = Math.min(1, Math.max(0, (age - D.float) / (D.duration - D.float)));
  const gone = going * going * (3 - 2 * going);
  // ...and it can only go as deep as there is water: a shallow tarn is a
  // car settled on the bottom with its roof awash, not a car sinking
  // through the landscape.
  const bed = state.terrain.groundAt(car.x, car.z) - D.draft;
  const bottom = Math.max(bed, d.waterY - D.depth);
  const rest = (1 - gone) * (d.waterY - D.draft) + gone * bottom;

  // Buoyancy, as an underdamped spring: the entry is swallowed, the hull
  // corks back up past its waterline, and the rocking dies out over the
  // float. That bob is the whole difference between a car settling in a
  // lake and a car waiting on a timer.
  car.vy += (rest - car.y) * D.buoyancy * T.dt;
  car.vy -= car.vy * Math.min(1, D.damping * T.dt);
  car.y += car.vy * T.dt;

  // The attitude forgets the crash and takes the water's: level while it
  // floats, rocking as it settles, nose down once the heavy end starts to
  // go. The springs unload — nothing is standing on them any more.
  const follow = Math.min(1, D.settle * T.dt);
  const swell = D.rock * Math.exp(-age / D.calm) * Math.sin(age * D.rockRate);
  car.roll += (swell - car.roll) * follow;
  car.rollRate = 0;
  car.pitch += (-D.noseDown * gone - car.pitch) * follow;
  car.ride += (0 - car.ride) * follow;
  car.rideRate = 0;
  car.pitchLoad += (0 - car.pitchLoad) * follow;

  // The gulp: the water closing over the roof for good. Not the entry —
  // a fast plunge ducks the whole car under on the way in and corks it
  // straight back up, and calling that the sinking spends the moment
  // three seconds before the car actually goes.
  if (!d.under && gone > 0 && car.y + D.roof <= d.waterY) {
    d.under = true;
    events.push({ type: "sink" });
  }

  if (age >= D.duration) respawn(state, events);
}

/** The wedge check: a car pinned against a trunk with the throttle buried
 * is not driving out of it, and since nothing else brings a car home any
 * more, this is the one thing that does. The anchor moves whenever the car
 * covers real ground, so only genuinely going nowhere accumulates. */
function stepStuck(state: GameState, input: CarInput, events: GameEvent[]): void {
  const car = state.car;
  // Backing out counts as asking. A car pinned against a trunk in front and
  // a boulder behind is the wedge this rescue exists for, and a driver — or
  // a bot — working the brake to get out of it must not stop the clock by
  // trying: without this the reverse attempt is unbounded.
  const asking = (input.throttle > 0.5 || car.reversing) && !car.airborne;
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
    //
    // REVVING IS THE ONE THING THE GRID DOES. Nothing is geared yet and the
    // road speed the revs are normally read off is zero, so here they are
    // their own state: the throttle blips them up and the flywheel lets
    // them fall. It is the only thing the player can do while they wait,
    // and both the tachometer and the engine note answer it.
    const grid = state.car;
    const revTarget = clamp(input.throttle, 0, 1);
    const revRate = revTarget > grid.rev ? T.revs.blip : T.revs.settle;
    grid.rev += (revTarget - grid.rev) * clamp(revRate * T.dt, 0, 1);
    state.stuck.since = state.t;
    return events;
  }
  if (state.phase === "finished") return events;

  state.raceTime += T.dt;
  // Going down in deep water is time that still costs the run but is not
  // being driven — the clock above runs, and nothing below it does.
  if (state.drowning) {
    stepDrowning(state, events);
    return events;
  }
  const car = state.car;
  const track = state.track;
  const terrain = state.terrain;
  const prevIndex = state.progressIndex;
  const prevX = car.x;
  const prevZ = car.z;

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
    stepAirborne(state.spec, car, input, ctx, events, state.stats);
  } else {
    stepGrounded(state.spec, car, input, ctx, events, state.stats);
  }

  const fix = locate(track, car.x, car.z, state.progressIndex);
  // The finish is a LINE across the road, and the move just made is what
  // either crossed it or did not. Asked here rather than at the end of the
  // step, so a respawn cannot teleport the car over the gate and win.
  const finished = !track.endless && crossedFinish(track, prevX, prevZ, car.x, car.z);
  state.progressIndex = Math.max(state.progressIndex, fix.index);
  state.progressS = track.samples[state.progressIndex].s;
  state.lateral = fix.lateral;
  state.stats.topSpeed = Math.max(state.stats.topSpeed, car.u);
  // Revs on the move: how far up the current gear the car is. The gearbox
  // shifts on the same forward speed, so the needle and the shift light can
  // never disagree with the gear. A shade past the redline is the limiter —
  // the booster can push a gear past its own top.
  car.rev = clamp(Math.max(0, car.u) / state.spec.gearTop[car.gear], 0, 1.06);

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
    events.push({ type: "splash", speed: Math.abs(car.u), deep: false });
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
  state.lost = trackLost(state);

  // Solid contact: deep water still swallows the car whole, but the wild's
  // props and the forest's trunks BEND it instead of ending it — impulse,
  // crush and yaw kick live in collision.ts, and no amount of it ever ends
  // the excursion. Keep hitting things until the car cannot move.
  let crashed = false;
  if (fix.offRoad) {
    const water = terrain.waterAt(car.x, car.z);
    if (water !== null && water - car.y > T.crash.deepWater) {
      // The entry gets its own splash whether or not the shallows already
      // gave it one: a car going under displaces a different amount of
      // water from a car wading, and this is the big one. A plunge
      // straight off a cliff into the sea never grounds in the shallows at
      // all, so for that one this is also the only splash there is.
      events.push({
        type: "splash",
        speed: Math.hypot(car.u, car.vy),
        deep: true,
      });
      // ...but the STAT counts water ENTRIES, not splash events, and the
      // shallows this car waded through to get here already booked one.
      // Double-counting would quietly file every drowning in the sim
      // table's ford column as two fords.
      if (state.surface !== "water") state.stats.splashes += 1;
      drown(state, events, water);
      crashed = true;
    }
    if (!crashed) {
      const solids = terrain.obstaclesNear(car.x, car.z, 2.5);
      solids.push(...terrain.treesNear(car.x, car.z, 2.5));
      if (solids.length > 0) collideCar(state.spec, car, solids, events, state.stats);
    }
  }
  // A wreck is driven, not teleported: wear reaching 1 leaves a car with
  // nothing left to give still sitting where it stopped. Only the wedge
  // check below, or the reset input, ever brings it home.
  if (input.reset && !crashed) respawn(state, events);
  else if (!crashed) stepStuck(state, input, events);

  // Through the gate: the run is over. An endless stage has no finish —
  // the stream above always keeps road ahead of the car.
  if (finished) {
    state.phase = "finished";
    events.push({ type: "finish", time: state.raceTime });
    status(`Finished stage ${state.seed} in ${state.raceTime.toFixed(2)} s`);
  }

  return events;
}
