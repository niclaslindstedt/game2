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
  createKerbField,
  createTerrain,
  STAGE_RULES,
  type StageKnobs,
  type StageLength,
  type StageShape,
  type Surface,
} from "../mapgen/index.ts";
import { carById, gearedSpec, type GearboxMode } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import {
  clutchDump,
  launch,
  seatOn,
  spinHeadroom,
  stepAirborne,
  stepGrounded,
  type GroundContext,
} from "./car.ts";
import { clipKerbs, collideCar } from "./collision.ts";
import {
  crossedFinish,
  crossedLip,
  locate,
  locatePoint,
  lastCheckpoint,
  pathCurvature,
  slopeAt,
  stageDirection,
  trackLost,
  wayHome,
  type TrackPoint,
  type WayHome,
} from "./track.ts";
import {
  DAMAGE_ZONES,
  NEUTRAL_INPUT,
  updateSlip,
  type CarInput,
  type CarState,
  type CatchUp,
  type GameEvent,
  type GameState,
  type RaceEnv,
  type RunStats,
  type Season,
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
    spins: 0,
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

/** A car at rest at the origin, every field at the value a run starts it
 * at. Exported because anything that has to put a car somewhere WITHOUT
 * starting a run — the analysis driving the reference car over an apex, a
 * test staging one contact — needs the same zero state a real run gets, and
 * a hand-rolled partial is a field somebody forgot. */
export function freshCar(): CarState {
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
    settle: 0,
    weight: 1,
    pitchLoad: 0,
    kerbFrom: 0,
    slide: 0,
    drifting: false,
    chain: 0,
    spun: false,
    wheelspin: 0,
    launchSpin: 0,
    flick: 0,
    flickDir: 1,
    lift: 0,
    brakeLoad: 0,
    provoked: 0,
    gear: 0,
    rev: 0,
    gearbox: "auto",
    shiftCutUntil: 0,
    steer: 0,
    braking: false,
    locked: false,
    reversing: false,
    damage: {
      zones: new Array(DAMAGE_ZONES).fill(0),
      belly: 0,
      wear: 0,
      systems: { engine: 0, suspension: 0, gearbox: 0, steering: 0 },
      broken: [],
      version: 0,
    },
    damageScale: 1,
  };
}

export type CreateGameOptions = {
  seed: number;
  carId?: string;
  /** Which box to hand the driver, for any car. Defaults to the automatic:
   * a player who has not chosen has not asked to be given something to
   * manage. */
  gearbox?: GearboxMode;
  /** Menu stage length (finite band or endless); defaults to medium. */
  length?: StageLength;
  /** R22 — sprint (default) or circuit. Ignored when a pre-compiled
   * `track` is handed in: that track already knows which it is. */
  shape?: StageShape;
  /** How many laps of a CIRCUIT the run is raced over; defaults to
   * `STAGE_RULES.circuit.laps`. A stage that does not come back to its own
   * start line is always a single lap, whatever is asked for here. */
  laps?: number;
  /** Skip the whole start control — the establishing shot AND the lights.
   * Sim runs, the menu's demo and every rival in the field start racing on
   * their first step; only the run a player is sat in is worth a ceremony. */
  skipCountdown?: boolean;
  /** Inject a pre-compiled track (tests and tooling); defaults to the
   * generated stage for `seed` at `length`. */
  track?: ReturnType<typeof compileTrack>;
  /** Race conditions. Time of day and season are presentation-only;
   * weather sets the wind band (TUNING.wind.speed). Defaults: day, clear,
   * summer. */
  env?: { timeOfDay?: TimeOfDay; weather?: Weather; season?: Season };
  /** The generator's dials (rules.ts) for the stage this run compiles.
   * Ignored when a pre-compiled `track` is handed in — that track carries
   * the dials it was built with. */
  knobs?: Partial<StageKnobs>;
  /** Build without announcing the stage. A run the player is IN is worth a
   * line in the log; the fourteen rival games built beside it on the same
   * road are the same line fourteen more times, which is the log saying
   * nothing loudly. */
  quiet?: boolean;
  /** Where on the start line this car is stood, metres to the RIGHT of the
   * road's centre; defaults to the centre itself.
   *
   * A start control holds more than one car, and two of them cannot be on
   * the same square metre of road — the crew being counted down is stood
   * beside the crew waiting behind it. The player takes the centre and the
   * field is entered off to one side (`GRID_STAGGER`), which is why the car
   * in front pulls away from ALONGSIDE rather than out of the player's own
   * bodywork. It is a starting position and nothing more: the road is
   * driven from it, so a bot is back on its line within a corner. */
  gridOffset?: number;
  /** How far BEHIND the start gate this car is stood, meters back along the
   * apron; defaults to the line itself.
   *
   * A mass start is a grid and a grid has depth, and all of it goes on the
   * RUN-UP: R24 lays `startZone.apron` metres of flat dirt road off the back
   * of the first sample for exactly this, with the terrain shelf held flat
   * under it, so a car stood there is on the road, is not off the stage
   * (`pastApron`), and drives THROUGH the gate when the lights go green.
   * The apron is straight — it is the first sample's heading extrapolated —
   * so a slot is placed by walking back along it rather than by hunting a
   * sample, and it lands exactly where the grid said rather than snapped to
   * the sample spacing. The metres a row gives away come back through
   * `catchUp` (sim/grid.ts). */
  gridBack?: number;
  /** The metres this slot is owed, as extra drive to take them back with
   * (TUNING.massStart). Only a mass start hands one in. */
  catchUp?: CatchUp;
  /** How much of every hit this car keeps, 0..1 (`CarState.damageScale`).
   * Defaults to the whole of it: the difficulty's assist is asked for by
   * the run a player is sat in, and nothing else — the sim, the field and
   * the tests all drive cars that are marked exactly as they are hit. */
  damageScale?: number;
};

/** Wind direction, mean speed, and gust phase are seeded on their own
 * stream so adding weather never shifts the in-run RNG the physics draws
 * from. The same seed and weather always blow the same wind. */
function buildEnv(seed: number, timeOfDay: TimeOfDay, weather: Weather, season: Season): RaceEnv {
  const rng = createRng((seed ^ 0x51ab3d75) >>> 0);
  const [minSpeed, maxSpeed] = T.wind.speed[weather];
  return {
    timeOfDay,
    weather,
    season,
    windDir: rng.range(0, Math.PI * 2),
    windSpeed: rng.range(minSpeed, maxSpeed),
    gustPhase: rng.range(0, Math.PI * 2),
  };
}

/** Blow the wind at sim time `t` into `into`: the mean vector breathing
 * through two slow sine gusts and veering a little around its bearing —
 * deterministic, so replays and sim digests hold. Writes rather than
 * returns, because the only caller is the step that runs 120 times a
 * second and already owns the vector it wants filled. */
function blowWind(env: RaceEnv, t: number, into: { x: number; z: number }): void {
  const gust =
    1 +
    T.wind.gust *
      (0.7 * Math.sin(t * 0.9 + env.gustPhase) + 0.3 * Math.sin(t * 2.3 + env.gustPhase * 1.7));
  const dir = env.windDir + T.wind.veer * Math.sin(t * 0.13 + env.gustPhase);
  const speed = env.windSpeed * gust;
  into.x = Math.sin(dir) * speed;
  into.z = Math.cos(dir) * speed;
}

export function createGame(options: CreateGameOptions): GameState {
  // The box is folded into the spec once, here: everything that reads
  // `state.spec` — the shift points, the bot, the rev counter, the engine
  // note — then drives the gears the player chose.
  const gearbox = options.gearbox ?? "auto";
  const spec = gearedSpec(carById(options.carId ?? "compact"), gearbox);
  const track =
    options.track ??
    compileStage(options.seed, options.length ?? "medium", options.knobs, options.shape);
  // R22 — only a road that comes back to its own start line can be lapped.
  const laps = track.circuit
    ? Math.max(1, Math.round(options.laps ?? STAGE_RULES.circuit.laps))
    : 1;
  // The start grid is the first sample, not the world origin: the stage's
  // rolling elevation puts the road metres above or below zero right from
  // the line, and a car left at zero spends the countdown buried in the
  // gravel (or hovering over it) until the first step snaps it onto the road.
  const grid = track.samples[0];
  const car = freshCar();
  // Where on the start zone this car was entered: across the road, and back
  // down the apron. The right axis is the sample's heading turned a quarter —
  // the same one `locate` measures a signed `lateral` along, so a positive
  // offset is a car to the driver's right and reads back as one — and the
  // forward axis is the heading itself, walked backwards.
  const slot = options.gridOffset ?? 0;
  const back = Math.max(0, options.gridBack ?? 0);
  car.x = grid.x + Math.cos(grid.heading) * slot - Math.sin(grid.heading) * back;
  car.z = grid.z - Math.sin(grid.heading) * slot - Math.cos(grid.heading) * back;
  // The apron is flat under the corridor it carries (terrain.ts), so the
  // gate's own height is the height of every row behind it.
  car.y = grid.elevation;
  car.heading = grid.heading;
  car.gearbox = gearbox;
  car.damageScale = clamp(options.damageScale ?? 1, 0, 1);
  const env = buildEnv(
    options.seed,
    options.env?.timeOfDay ?? "day",
    options.env?.weather ?? "clear",
    options.env?.season ?? "summer",
  );
  // The grid already stands in the wind — its flags and fumes drift before
  // the lights go green, so the vector starts at its t = 0 value.
  const wind = { x: 0, z: 0 };
  blowWind(env, 0, wind);
  if (!options.quiet) {
    status(
      track.endless
        ? `Stage ${options.seed}: endless — ${spec.name}`
        : `Stage ${options.seed}: ${(track.length / 1000).toFixed(1)} km` +
            `${laps > 1 ? ` × ${laps} laps` : ""}, ` +
            `${track.segments.filter((p) => p.kind === "turn").length} turns, ` +
            `${track.segments.filter((p) => p.feature === "jump").length} jumps — ${spec.name}`,
    );
  }
  return {
    seed: options.seed,
    spec,
    track,
    terrain: createTerrain(track),
    kerbs: createKerbField(track),
    car,
    phase: options.skipCountdown ? "racing" : "intro",
    t: 0,
    raceTime: 0,
    lap: 1,
    laps,
    lapTimes: [],
    lapStart: 0,
    rollout: 0,
    cheeredS: 0,
    checkpointsPassed: 0,
    checkpointS: 0,
    checkpointTimes: [],
    progressIndex: 0,
    progressS: 0,
    lateral: slot,
    offRoad: false,
    offRoadSince: 0,
    lost: false,
    wrongWay: false,
    wrongWayFor: 0,
    wrongWayAt: 0,
    stuck: { x: car.x, z: car.z, since: 0 },
    drowning: null,
    surface: "gravel",
    env,
    wind,
    catchUp: options.catchUp ?? null,
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

/** Put the car back on the road at `home`, and wind progress back with it:
 * the road between there and wherever the car got to is road the run has to
 * drive again, and leaving progress out there would credit it twice and
 * hand the ghost gap a jump it never drove.
 *
 * WHICH place that is says what happened. A drowning and a press of the
 * reset button are both the run being GIVEN UP on, so they cost the road
 * back to the last split board (R28) — which is the whole reason the boards
 * sit just past the corners worth being sent back through. The wedge rescue
 * is neither: nobody asked for it, the car is pinned against a trunk
 * through no decision of the driver's, and a rescue that costs a checkpoint
 * would put the car back at a board it has already proved it can drive from
 * into the same trunk, forever. That one goes to the road where the car
 * stands, exactly as it always has. */
function respawn(state: GameState, events: GameEvent[], home: WayHome): void {
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
  car.settle = 0;
  car.weight = 1;
  car.pitchLoad = 0;
  car.slide = 0;
  car.drifting = false;
  car.chain = 0;
  car.spun = false;
  car.wheelspin = 0;
  car.launchSpin = 0;
  // The service crew get to a wreck the moment it is back at the road: the
  // chassis is patched to a drivable fraction, and the dents, the torn-off
  // parts and the hurt systems all stay.
  if (car.damage.wear >= 1) car.damage.wear = T.collision.repairTo;
  state.drowning = null;
  state.progressIndex = home.index;
  state.progressS = state.track.samples[home.index].s;
  // The board the car is standing on has already been checked in, so the
  // window opens where it stands: driving off it again must not book the
  // same split twice.
  state.checkpointS = state.progressS;
  state.cheeredS = state.progressS;
  state.offRoad = false;
  // A respawn sets the car down facing down the stage, so whatever the
  // TURN AROUND sign was telling the driver has been done for them — and
  // its search cursor goes with the car, the one move on the stage that no
  // amount of local searching could follow.
  state.wrongWay = false;
  state.wrongWayFor = 0;
  state.wrongWayAt = home.index;
  state.stuck.x = car.x;
  state.stuck.z = car.z;
  state.stuck.since = state.t;
  state.stats.respawns += 1;
  events.push({ type: "respawn" });
}

/** The water has the car. It is a crash the moment it goes in — the entry
 * costs the run whatever happens next — but the car is not lifted off the
 * lake until it has gone down: `stepDrowning` owns the seconds in between,
 * and the respawn is at the far end of them. The far end is not the only
 * end: a car whose entry carries it back onto a bank drives out instead
 * (`beach`), and pays only the seconds it spent swimming. */
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
  car.chain = 0;
  car.spun = false;
  car.slide = 0;
  car.braking = false;
  car.locked = false;
  car.reversing = false;
  // A body arriving fast enough to reach the bed before it has floated at
  // all skips the whole beat, so the water is allowed to swallow only so
  // much of a plunge — and none of a bounce. A car that arrives off a bank
  // still RISING keeps that climb through the entry otherwise, and the
  // buoyancy spring pays it straight back as a dip: the hull ducks under
  // its own waterline on a moment the water should have taken.
  car.vy = Math.min(0, Math.max(car.vy, -T.crash.drown.plunge));
}

/** Is the car over ground it could drive away from? Measured as the water
 * standing over the GROUND, not over the car: a drowning hull is being held
 * at its waterline, so asking how deep the water is over the body would
 * answer "deep" on a car sitting on a beach with its wheels in a puddle.
 * The bar is `crash.deepWater` less `drown.shallows` — under the one that
 * put the car in, so a hull bobbing on that bar cannot beach and drown
 * again on alternate steps. */
function aground(state: GameState): boolean {
  const car = state.car;
  const water = state.terrain.waterAt(car.x, car.z);
  if (water === null) return true;
  return water - state.terrain.groundAt(car.x, car.z) <= T.crash.deepWater - T.crash.drown.shallows;
}

/** The car drives itself out. No respawn and no checkpoint to pay: the run
 * is exactly where the car left it, wet and pointing wherever the water
 * swung it. What this owes is a car the driving model can take back — the
 * wheels on the ground rather than on a waterline that is now behind it,
 * and the wedge clock re-anchored where it stands, or the two seconds it
 * takes to crawl off a beach look to that rule like a car pinned against a
 * trunk. */
function beach(state: GameState, events: GameEvent[]): void {
  const car = state.car;
  const terrain = state.terrain;
  state.drowning = null;
  car.y = seatOn(car, terrain.groundAt(car.x, car.z), terrain.groundAt);
  car.vy = 0;
  state.stuck.x = car.x;
  state.stuck.z = car.z;
  state.stuck.since = state.t;
  // A shallow splash, not the deep one: this is the car heaving itself out
  // rather than the water closing over it, and the beat needs a sound or
  // the run simply resumes as though nothing had it.
  events.push({ type: "splash", speed: Math.abs(car.u), deep: false });
}

/** One step of a car going down. Nothing else in the run advances while
 * this is running — no progress, no surface, no wedge clock, and no input:
 * the seconds ARE the penalty, and a driver who could steer out of them
 * would not be paying it. Unless the car drives itself out — see `beach`. */
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

  // ...and that line is the car's one way out. A lake has a shore, a river
  // has a far bank, and an entry taken at pace can carry the car up one
  // before the water has it: a hull that reaches ground it could drive
  // from was WADING, and the run goes on. Only while it still floats —
  // past that the water is already taking it down and there is nothing
  // left to drive with. Checked before the depth maths below, which is
  // what would otherwise pull a car standing on a beach down to a
  // waterline metres out from under it and bury it in the bank.
  if (age < D.float && aground(state)) {
    beach(state, events);
    return;
  }

  // Where the hull wants to sit. For the first `float` seconds that is its
  // waterline; after it, the waterline itself walks down to the bed and
  // takes the car with it. Smoothstepped, so the water starts winning
  // gradually rather than the car dropping on a cue.
  const going = Math.min(1, Math.max(0, (age - D.float) / (D.duration - D.float)));
  const gone = going * going * (3 - 2 * going);
  // Both halves are held off the LAND. The float rides the waterline or the
  // ground under it, whichever is higher — a car carrying its entry up a
  // shoal rides the shoal, and holding it at a waterline half a metre
  // inside that is the hull sinking through the beach rather than into the
  // lake. It is also what makes the hand-back a step rather than a jump:
  // by the time the car is aground it is already standing at the height it
  // will drive away from.
  const ground = state.terrain.groundAt(car.x, car.z);
  const afloat = Math.max(d.waterY - D.draft, ground);
  // ...and the sink can only go as deep as there is water: a shallow tarn
  // is a car settled on the bottom with its roof awash, not a car sinking
  // through the landscape.
  const bottom = Math.max(ground - D.draft, d.waterY - D.depth);
  const rest = (1 - gone) * afloat + gone * bottom;

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

  if (age >= D.duration) respawn(state, events, lastCheckpoint(state));
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
  // The distance is only ever needed to decide whether a car that IS asking
  // has got anywhere, so a car that is not asking never measures it.
  if (
    !asking ||
    Math.hypot(car.x - state.stuck.x, car.z - state.stuck.z) > T.offTrack.stuck.radius
  ) {
    state.stuck.x = car.x;
    state.stuck.z = car.z;
    state.stuck.since = state.t;
  } else if (state.t - state.stuck.since >= T.offTrack.stuck.after) {
    respawn(state, events, wayHome(state));
  }
}

/** THE TURN AROUND SIGN: the car is on the road and driving down it the
 * wrong way. Both halves of `stageDirection` have to agree before the dwell
 * timer even starts — a spin and a reverse out of a ditch each satisfy one
 * of them, and neither is a driver who has set off back up the stage.
 *
 * Off the road there is no direction to be wrong about, and the guidance
 * that is owed there is the way home instead: a car picking its way back
 * across a clearing is pointed wherever the ground lets it be pointed.
 *
 * Coming OFF is not the same threshold as coming on. TURN AROUND is an
 * instruction, and the one thing that carries it out is the nose coming
 * back round (`wrongWay.back`) — stopping does not, and neither does
 * swinging the nose just inside the angle the sign came up at, which on a
 * narrow road is a three-point turn strobing the sign at every shuffle.
 *
 * It takes its own fix whenever the car has dropped behind its progress,
 * because the run's fix cannot follow it there: that one hunts from
 * `progressIndex`, which only climbs, and its search reaches fifteen
 * samples back — so a car more than thirty metres down the road it came up
 * is pinned to the far end of that window, reading the heading of a corner
 * it is nowhere near and reported off a road it is squarely on. The extra
 * search costs a car at its own progress nothing, which is every step of a
 * run that never doubles back. */
function stepWrongWay(state: GameState, fix: TrackPoint): void {
  const W = T.wrongWay;
  const car = state.car;
  const here =
    fix.index < state.progressIndex
      ? locatePoint(state.track, car.x, car.z, state.wrongWayAt)
      : fix;
  state.wrongWayAt = here.index;
  const { facing, along } = stageDirection(state, here.index);
  if (state.wrongWay) {
    if (facing < W.back) {
      state.wrongWay = false;
      state.wrongWayFor = 0;
    }
    return;
  }
  const backwards =
    state.phase === "racing" && !here.offRoad && facing > W.away && along < -W.speed;
  state.wrongWayFor = backwards ? state.wrongWayFor + T.dt : 0;
  if (state.wrongWayFor >= W.after) state.wrongWay = true;
}

/** R25 — how a car is driven once the clock has stopped. The player is out
 * of the loop from the moment the nose crosses the line, so the roll-out is
 * driven by the stage instead: off the throttle, easing onto the brakes
 * rather than standing on them (a car that stops dead at the gate never
 * looks like it CROSSED anything), and steering back toward the middle of
 * the road it is on so a car that arrived sideways straightens up and
 * coasts rather than driving off into the trees while nobody is at the
 * wheel. Deterministic: it reads the state and nothing else. */
function rollOutInput(state: GameState): CarInput {
  const roll = T.rollOut;
  // Half the road's width is the whole correction — enough to gather a car
  // that crossed the line off-line, gentle enough that it is a driver
  // straightening up and not a rail.
  const wanted = -state.lateral / (state.track.width * 0.5);
  return {
    ...NEUTRAL_INPUT,
    steer: Math.max(-roll.steer, Math.min(roll.steer, wanted * roll.steer)),
    brake: Math.min(1, state.rollout / roll.brakeRamp) * roll.brake,
  };
}

/** R27 — the crowd noise. Stands are in stage order, so passing one is
 * progress reaching its arc position: a cursor walks them, each is heard
 * exactly once, and no step ever looks at more than the stands it just went
 * by. Crawling past a crowd is not an event — nobody cheers a car being
 * driven home — so a slow pass spends the stand silently rather than
 * banking it for later. */
function cheerFor(state: GameState, events: GameEvent[]): void {
  const from = state.cheeredS;
  const to = state.progressS;
  if (to <= from) return;
  state.cheeredS = to;
  if (state.car.u < STAGE_RULES.crowd.cheerSpeed) return;
  for (const stand of state.terrain.stands) {
    if (stand.s <= from) continue;
    if (stand.s > to) break;
    events.push({ type: "cheer", size: stand.size });
  }
}

/** R28 — the split boards this step drove through. Windowed on arc position
 * exactly as the crowd is, so a respawn winding progress back re-arms the
 * boards ahead of it without ever re-booking the one it is standing on. */
function checkIn(state: GameState, events: GameEvent[]): void {
  const from = state.checkpointS;
  const to = state.progressS;
  if (to <= from) return;
  state.checkpointS = to;
  const boards = state.track.checkpoints;
  for (let i = state.checkpointsPassed; i < boards.length; i++) {
    if (boards[i].s <= from) continue;
    if (boards[i].s > to) break;
    state.checkpointsPassed = i + 1;
    events.push({
      type: "checkpoint",
      index: i,
      count: boards.length,
      split: state.checkpointTimes.length,
      time: state.raceTime,
    });
    state.checkpointTimes.push(state.raceTime);
  }
}

/** The ground under the car, refilled every step. `stepGrounded` and
 * `stepAirborne` read this and never keep a reference, and a run is 120
 * steps a second, so the whole run shares one record instead of allocating
 * one per step. Every field is written on both paths below — an off-road
 * step must not leave its terrain probe behind for the next road step. */
const GROUND: GroundContext = {
  surface: "gravel",
  groundY: 0,
  slope: 0,
  slopeLat: 0,
  roadCurve: 0,
  windX: 0,
  windZ: 0,
  t: 0,
  rng: createRng(0),
  drive: 1,
  groundAt: undefined,
};

/** What this step multiplies the drive by, and the SPENDING of the mass
 * start's catch-up: past the end of its window a slot owes nothing more and
 * the ledger is torn up, so a circuit that winds progress back to the grid
 * for its second lap cannot launch the whole field a second time. */
function driveGain(state: GameState): number {
  const owed = state.catchUp;
  if (!owed) return 1;
  if (state.progressS >= owed.untilS) {
    state.catchUp = null;
    return 1;
  }
  return 1 + owed.gain;
}

/** Seconds until the lights go out, counting down through the whole start
 * control: `intro + countdown` on the first frame, 0 the moment the stage
 * is live. The HUD's gantry and the tick on the audio bed both read it, so
 * neither has to know how the beats before the green are divided up. */
export function startsIn(state: GameState): number {
  if (state.phase !== "intro" && state.phase !== "countdown") return 0;
  return Math.max(0, T.intro + T.countdown - state.t);
}

/** Skip the establishing shot: hand the car straight to the start line with
 * the lights already counting. Returns the seconds of sim it jumped, which
 * is what everything ELSE on the road owes to keep the stagger — a start
 * control the player walked out of early is still a start control.
 *
 * A no-op once the lights are up: the countdown itself is the one part of
 * the start nobody gets to skip. */
export function skipIntro(state: GameState): number {
  if (state.phase !== "intro") return 0;
  const jumped = T.intro - state.t;
  state.t = T.intro;
  state.phase = "countdown";
  state.stuck.since = state.t;
  return jumped;
}

/** Advance the run by one fixed timestep. Returns the events it emitted. */
export function step(state: GameState, input: CarInput): GameEvent[] {
  const events: GameEvent[] = [];
  state.t += T.dt;

  // The wind blows through every phase — the grid's flags and fumes drift
  // before the lights go green.
  blowWind(state.env, state.t, state.wind);

  // THE START CONTROL. Two beats, one held car: the establishing shot while
  // the crew in front leaves, and then the lights. Both are the same thing
  // as far as the car is concerned — nothing it does moves it — so they
  // share the grid hold below and differ only in when they hand over.
  if (state.phase === "intro" || state.phase === "countdown") {
    if (state.phase === "intro") {
      if (state.t >= T.intro) state.phase = "countdown";
    } else if (state.t >= T.intro + T.countdown) {
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
    // ...and on the green those revs are handed to the tyres. Everything the
    // engine was carrying arrives at a standing axle in one go, so the driver
    // who spent the countdown against the limiter leaves on four spinning
    // wheels and the one who waited with the pedal up simply drives away.
    // The seed goes in on the last grid frame, which is this one: the car is
    // handed to the handling model already lit.
    if (state.phase === "racing") grid.launchSpin = clutchDump(state.spec, grid, state.surface);
    state.stuck.since = state.t;
    return events;
  }
  if (state.phase === "finished") return events;

  // R25 — the roll-out. The clock has stopped; the car has not. Nothing the
  // player is doing reaches it any more: it coasts down the run-out on a
  // trailing brake, holding the road it is on, until it is stopped.
  if (state.phase === "rollout") state.rollout += T.dt;
  else state.raceTime += T.dt;
  // Going down in deep water is time that still costs the run but is not
  // being driven — the clock above runs, and nothing below it does.
  if (state.drowning) {
    stepDrowning(state, events);
    return events;
  }
  const drive = state.phase === "rollout" ? rollOutInput(state) : input;
  const car = state.car;
  const track = state.track;
  const terrain = state.terrain;
  const prevIndex = state.progressIndex;
  const prevX = car.x;
  const prevZ = car.z;

  // Locate against the centerline BEFORE the move to know the ground ahead;
  // the fix after the move drives progress, lip detection, and respawn.
  const preFix = locate(track, car.x, car.z, state.progressIndex);
  const gain = driveGain(state);
  // WHERE THE CAR IS GOING, in world space — which sideways is nowhere near
  // where it is pointing. Everything below that asks the ground what it is
  // about to do to the car reads this rather than the heading: the shape
  // that throws a car is the shape under its PATH, and a car crossing a
  // brow in a drift meets it just as squarely as one driving straight at
  // it. (Both takeoff gates already read `pace` for the same reason — this
  // is the direction half of the same idea.)
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const dirX = sinH * car.u + cosH * car.w;
  const dirZ = cosH * car.u - sinH * car.w;
  let ctx: GroundContext;
  if (preFix.offRoad) {
    // The wild: the terrain owns the ground — the RIDDEN lattice surface
    // (terrain.groundAt), which is the exact ground the renderer draws.
    // The brow is read along the TRAVEL over the same wide baseline the
    // road uses, so the crest check fires off a mountain shoulder exactly
    // like it fires off a lip — this is where the spontaneous cliff jumps
    // come from. The grade the car stands on is read over its own short
    // baseline, along the heading AND across it: the along slope pitches
    // the nose and pushes back on a climb, the lateral slope pulls the car
    // toward the hillside's downhill side.
    const ground = terrain.groundAt;
    const span = T.air.crestSpan;
    const grade = T.hills.gradeSpan;
    const here = ground(car.x, car.z);
    // A stationary car has no path to read a brow along; the nose is the
    // only direction it has, and at a standstill nothing is launching anyway.
    const pace = Math.hypot(dirX, dirZ);
    const goX = pace > 1e-6 ? dirX / pace : sinH;
    const goZ = pace > 1e-6 ? dirZ / pace : cosH;
    const fwd = ground(car.x + goX * span, car.z + goZ * span);
    const back = ground(car.x - goX * span, car.z - goZ * span);
    const ahead = ground(car.x + sinH * grade, car.z + cosH * grade);
    const behind = ground(car.x - sinH * grade, car.z - cosH * grade);
    // The car's right axis in world space is (cos h, -sin h).
    const right = ground(car.x + cosH * grade, car.z - sinH * grade);
    const left = ground(car.x - cosH * grade, car.z + sinH * grade);
    ctx = GROUND;
    // Off the stage is not always off the ROAD: the asphalt branches the
    // route abandons at its junctions (R17) are real tarmac, and a car
    // exploring one gets tarmac grip on it.
    ctx.surface = offRoadSurface(state, car.x, car.z);
    ctx.groundY = here;
    ctx.slope = (ahead - behind) / (2 * grade);
    ctx.slopeLat = (right - left) / (2 * grade);
    ctx.roadCurve = (fwd + back - 2 * here) / (span * span);
    ctx.windX = state.wind.x;
    ctx.windZ = state.wind.z;
    ctx.t = state.t;
    ctx.rng = state.rng;
    ctx.drive = gain;
    ctx.groundAt = ground;
  } else {
    // How sharply the road curves under the car ALONG ITS PATH — what
    // decides whether it throws the car, and how much of the car's weight
    // is still on the tires while it does not. Both the stage's brows and
    // the road's own cross-section, weighted by which way the car is going
    // (`pathCurvature`). A jump lip anywhere in that window is NOT a brow:
    // its drop belongs to the ramp launch below, and reading it here would
    // fire a stutter of hops on the run-up instead — and the lip owns the
    // whole surface there, cross-section included.
    const reach = Math.max(1, Math.round(T.air.crestSpan / track.step));
    const lipNear =
      crossedLip(track, Math.max(-1, preFix.index - reach - 1), preFix.index + reach) >= 0;
    ctx = GROUND;
    ctx.surface = preFix.surface;
    ctx.groundY = preFix.elevation;
    ctx.slope = preFix.slope;
    ctx.slopeLat = preFix.slopeLat;
    ctx.roadCurve = lipNear ? 0 : pathCurvature(track, preFix, dirX, dirZ);
    ctx.windX = state.wind.x;
    ctx.windZ = state.wind.z;
    ctx.t = state.t;
    ctx.rng = state.rng;
    ctx.drive = gain;
    // On the road the road IS the ground; the wild's probe must not carry
    // over from an earlier step.
    ctx.groundAt = undefined;
  }

  if (car.airborne) {
    stepAirborne(state.spec, car, drive, ctx, events, state.stats);
  } else {
    stepGrounded(state.spec, car, drive, ctx, events, state.stats);
  }

  const fix = locatePoint(track, car.x, car.z, state.progressIndex);
  // The finish is a LINE across the road, and the move just made is what
  // either crossed it or did not. Asked here rather than at the end of the
  // step, so a respawn cannot teleport the car over the gate and win.
  const finished = !track.endless && crossedFinish(track, prevX, prevZ, car.x, car.z);
  state.progressIndex = Math.max(state.progressIndex, fix.index);
  state.progressS = track.samples[state.progressIndex].s;
  state.lateral = fix.lateral;
  state.stats.topSpeed = Math.max(state.stats.topSpeed, car.u);
  // Revs on the move: the DRIVEN WHEELS read back through the gearing, which
  // with a gear engaged is the only thing the crank can be doing. Normally
  // that is just how far up the gear the road speed is; when the axle is lit
  // up (`car.wheelspin`) the needle flares away from the road with the
  // wheels, which is what wheelspin looks and sounds like in a car. The
  // limiter caps both. The gearbox still shifts on ROAD speed, so a flare
  // can never be mistaken for a gear that has run out.
  // An endless stage keeps the road materialized well past the horizon —
  // the bot's plan, the pacenotes, and the renderer all read ahead of the
  // car, and none of them may ever see the end of the world.
  if (track.endless) track.extend?.(state.progressS + STAGE_RULES.endless.horizon);
  terrain.sync(state.progressS);
  // R26 — the marking keeps up with the road for the same reason the
  // terrain does, and an endless run forgets what it has driven past.
  state.kerbs.extend(track.samples.length);
  if (track.endless) state.kerbs.pruneBefore(state.progressS - 400);

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
  // The wrong way first, because it can VETO being lost. A car that has
  // turned round on the road is reported off it by the fix above — that
  // search cannot reach back past thirty metres — and the way-home
  // guidance believes it: RETURN TO TRACK, over a car whose wheels are on
  // the track. `stepWrongWay` takes an honest fix to answer its own
  // question, so when it says the car is on the road going backwards, it
  // is the one that knows.
  stepWrongWay(state, fix);
  state.lost = !state.wrongWay && trackLost(state);

  // Solid contact: deep water still swallows the car whole, but the wild's
  // props and the forest's trunks BEND it instead of ending it — impulse,
  // crush and yaw kick live in collision.ts, and no amount of it ever ends
  // the excursion. Keep hitting things until the car cannot move.
  let crashed = false;
  // R13 — the parapet, and it is checked whether or not the car is off the
  // road. It stands ON the deck's edge: the car it exists for is the one
  // that has only just put a wheel wide, and by the time the road is
  // willing to call that car off-road it is already through the wall and
  // into the river. Nothing to pay where there are no bridges near — the
  // field answers an empty list off one lookup.
  const parapets = terrain.parapetsNear(car.x, car.z, 2.5);
  if (parapets.length > 0) {
    collideCar(state.spec, car, parapets, events, state.stats, terrain.fell);
  }
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
      // The field is handed the right to take a solid OUT of the world: a
      // trunk the car snapped, a stone it knocked off its bed. Nothing
      // stands there afterwards on either side of the wall — the piece is
      // a `solidBreak` the renderer tumbles away.
      if (solids.length > 0) {
        collideCar(state.spec, car, solids, events, state.stats, terrain.fell);
      }
    }
  }
  // R26 — and the anti-cut blocks, which are tested WHEREVER the car is.
  // A block's inner edge sits inside the road's own edge, so the wheel that
  // mounts one belongs to a car whose centre is still on the road and whose
  // `offRoad` is still false: gating this on leaving the road would make
  // every apex on the stage free to cut by exactly the margin that matters.
  if (!crashed) {
    clipKerbs(state.spec, car, state.t, state.kerbs.blocksNear(car.x, car.z, 2.5), events);
  }
  // A wreck is driven, not teleported: wear reaching 1 leaves a car with
  // nothing left to give still sitting where it stopped. Only the wedge
  // check below, or the reset input, ever brings it home — and the two land
  // in different places (see `respawn`).
  if (drive.reset && !crashed) respawn(state, events, lastCheckpoint(state));
  else if (!crashed) stepStuck(state, drive, events);

  // R25 — the crowd, which only exists to be driven past.
  if (state.phase === "racing") cheerFor(state, events);
  // R28 — the split boards. After the respawn above, so a car put back at a
  // board does not immediately book it again.
  if (state.phase === "racing") checkIn(state, events);

  // Through the gate. On a circuit (R22) it is the same line the run
  // started on, so crossing it books a lap and — until the last one — puts
  // the car back at the top of the road it is already standing on. On the
  // last crossing the CLOCK is over; the car need not be, because a sprint
  // has R25's run-out behind its gate and coasts down it. Whatever has no
  // run-out — a circuit, a synthetic rig, an endless stage's absent finish
  // — is simply over at the line, having nothing to coast down.
  if (finished && state.phase === "racing") {
    const lapTime = state.raceTime - state.lapStart;
    const best = state.lapTimes.every((t) => lapTime < t);
    state.lapTimes.push(lapTime);
    if (state.lap < state.laps) {
      events.push({ type: "lap", lap: state.lap, time: lapTime, best });
      status(`Lap ${state.lap} of stage ${state.seed} in ${lapTime.toFixed(2)} s`);
      state.lap += 1;
      state.lapStart = state.raceTime;
      // The road carries straight on into its own opening straight, so
      // progress starts again from the grid — which is where the car
      // physically is.
      state.progressIndex = 0;
      state.progressS = track.samples[0].s;
      // R28 — the boards are the LAP's, so the next lap drives through all
      // of them again. The times stay on one list for the whole run.
      state.checkpointsPassed = 0;
      state.checkpointS = state.progressS;
      // R27's crowd is windowed on the same arc position, so it needs the
      // same rewind: a mark left at the end of the last lap is one the
      // whole of the next lap sits behind, and nobody would cheer again.
      state.cheeredS = state.progressS;
    } else {
      events.push({ type: "finish", time: state.raceTime });
      status(`Finished stage ${state.seed} in ${state.raceTime.toFixed(2)} s`);
      state.phase = track.finishS !== null ? "rollout" : "finished";
      state.rollout = 0;
    }
  }
  // ...and the end of the roll-out: stopped, or out of road to stop on.
  if (
    state.phase === "rollout" &&
    (car.u <= T.rollOut.restSpeed ||
      state.rollout >= T.rollOut.maxTime ||
      state.progressIndex >= track.samples.length - 1)
  ) {
    state.phase = "finished";
  }

  // Revs on the move: the DRIVEN WHEELS read back through the gearing, which
  // with a gear engaged is the only thing the crank can be doing. Normally
  // that is just how far up the gear the road speed is; when the axle is lit
  // up (`car.wheelspin`) the needle flares away from the road with the
  // wheels, which is what wheelspin looks and sounds like in a car. The
  // limiter caps both. The gearbox still shifts on ROAD speed, so a flare
  // can never be mistaken for a gear that has run out.
  //
  // LAST IN THE STEP, both of them, because the handling is not the last
  // thing in it to move the car: a shunt, the ground catching a car that has
  // spun round, a respawn — all land after the spin was sized against the
  // headroom the gear had at the time, and any of them can leave an axle
  // turning faster than the engine driving it, which is the one thing this
  // model exists to rule out. Cheap to re-clamp, and nothing later can undo
  // it.
  car.wheelspin = Math.min(car.wheelspin, spinHeadroom(state.spec, car));
  car.rev = clamp(
    (Math.max(0, car.u) + car.wheelspin) / state.spec.gearTop[car.gear],
    0,
    T.revs.limiter,
  );

  return events;
}
