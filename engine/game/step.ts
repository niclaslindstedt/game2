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
  flatTrack,
  STAGE_RULES,
  trainSolidsNear,
  type StageKnobs,
  type StageLength,
  type StageShape,
  type Surface,
  type Track,
} from "../mapgen/index.ts";
import { carById, gearedSpec, type GearboxMode } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import { clutchDump, spinHeadroom, stepAirborne, stepGrounded, type GroundContext } from "./car.ts";
import { clipKerbs, clipSolids, collideCar } from "./collision.ts";
import { stepCooling } from "./cooling.ts";
import { beyondDriving } from "./damage.ts";
import { plant, seatOn } from "./ground.ts";
import { onItsWheels, stepRolling } from "./roll.ts";
import {
  boardHalfWidth,
  crossedFinish,
  crossedGate,
  crossedLip,
  locate,
  locatePoint,
  lastCheckpoint,
  pathCurvature,
  stageDirection,
  trackLost,
  wayHome,
  type TrackPoint,
  type WayHome,
} from "./track.ts";
import {
  NEUTRAL_INPUT,
  rollTilt,
  stillCar,
  updateSlip,
  type CarInput,
  type CatchUp,
  type GameEvent,
  type GameState,
  type RaceEnv,
  type Season,
  type TimeOfDay,
  type Weather,
} from "./state.ts";
import { freshCar, freshStats, healCar } from "./car-state.ts";
import { createTraffic, stepTraffic } from "./traffic.ts";
import { status } from "../output.ts";

const T = TUNING;

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
  /** R44 — whether the public roads carry traffic. On by default; the
   * rival field turns it off, since a crew on the stage never meets it and
   * fourteen fleets would be fourteen times the cost of one. */
  traffic?: boolean;
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
 * returns, because its callers run 120 times a second and already own the
 * vector they want filled: the step itself, and a traced rival's playback
 * (sim/trace.ts), whose car is placed by the clock rather than stepped. */
export function blowWind(env: RaceEnv, t: number, into: { x: number; z: number }): void {
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
  const terrain = createTerrain(track);
  plant(car, terrain.groundAt);
  return {
    seed: options.seed,
    traffic: createTraffic(track, terrain.carParks, options.seed, options.traffic ?? true),
    spec,
    track,
    terrain,
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
    checkpointTimes: [],
    progressIndex: 0,
    nearIndex: 0,
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
    overturned: null,
    // What the car is stood on before its first step: the road it starts
    // on, whatever this country blades its roads out of (R40).
    surface: track.samples[0]?.surface ?? "gravel",
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
function respawn(state: GameState, events: GameEvent[], home: WayHome, whole = false): void {
  const car = state.car;
  car.x = home.x;
  car.z = home.z;
  car.y = home.y;
  car.heading = home.heading;
  stillCar(car);
  plant(car, state.terrain.groundAt);
  car.u = T.offTrack.respawnSpeed;
  // WHAT THE CREW HAND BACK. A car set down where it started with the whole
  // run still in front of it is handed the car that left the line: an
  // attempt that has driven nothing carries nothing out of the lake with it
  // (`whole`, decided by `sendBack`). Anywhere else they only ever get to a
  // WRECK — the chassis is patched to a drivable fraction, and the dents,
  // the torn-off parts and the hurt systems all stay.
  if (whole) {
    healCar(car);
    events.push({ type: "repair" });
  } else if (car.damage.wear >= 1) {
    car.damage.wear = T.collision.repairTo;
  }
  // ...and the car has been standing while they did it, so the needle is
  // back off the line. The coolant is still on the road, which is why this
  // is a reprieve and not a repair: a holed core climbs straight back.
  car.heat = 0;
  car.heatCall = 0;
  state.drowning = null;
  state.overturned = null;
  state.progressIndex = home.index;
  state.nearIndex = home.index;
  state.progressS = state.track.samples[home.index].s;
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

/** R28 — THE RUN GIVEN UP ON: a drowning, a car left lying on its roof, or
 * the reset button. All three cost the road back to the last split board,
 * and all three land here so they cost it the same way.
 *
 * WHILE THE RUN HAS TAKEN NO BOARD AT ALL — the first lap, before the first
 * one — that board is the START LINE, and being put back on it is not a
 * penalty inside a run: it is the run beginning again with nothing behind
 * it. So the car begins again too, whole, exactly as pressing RESTART hands
 * over a fresh one. A later lap of a circuit crosses the same line with a
 * lap already driven, which is why the lap is asked about as well: a free
 * rebuild every time round would be the cheapest way to drive a circuit. */
function sendBack(state: GameState, events: GameEvent[]): void {
  const fromTheLine = state.checkpointsPassed === 0 && state.lap === 1;
  respawn(state, events, lastCheckpoint(state), fromTheLine);
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
  car.loft = 0;
  car.loftRate = 0;
  car.drifting = false;
  car.chain = 0;
  car.spun = false;
  car.rolling = false;
  car.sliding = false;
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
  car.wheelVy = 0;
  plant(car, terrain.groundAt);
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

  if (age >= D.duration) sendBack(state, events);
}

/** ON ITS ROOF. The roll is over and the car is lying on a face of itself
 * that is not its wheels, which — unlike every other way a run goes wrong
 * — is not something a driver can work out of: there is no tyre on the
 * ground, so the throttle, the wheel and the lever all reach nothing. So
 * the beat is simply looked at, and then the crew are put back at the last
 * split board (R28) exactly as a drowning does.
 *
 * The car is left EXACTLY as the roll left it: nothing settles it further,
 * nothing rocks it, and nothing rights it. What is on the screen for these
 * seconds is the pose the physics chose.
 *
 * This is also how the RIVALS behave, without a line of their own: every
 * car in the field is stepped through here (sim/field.ts), so a crew that
 * rolls out is back at their own last board a beat later and drives the
 * rest of the stage from it. */
function stepOverturned(state: GameState, events: GameEvent[]): void {
  const lying = state.overturned as NonNullable<GameState["overturned"]>;
  if (state.t - lying.since < T.air.roll.lieFor) return;
  sendBack(state, events);
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

/** R28 — DID THIS MOVE TAKE THE CAR THROUGH THE BOARD IT OWES? The gate is
 * a line across the stage exactly as the finish is (`boardHalfWidth`), and
 * only ONE of them is ever armed: the next board due. That is what makes
 * the boards ordered — a car cannot take the fourth without the third — and
 * it is also what makes a missed board recoverable, since driving back down
 * the stage and through it forwards is still a crossing.
 *
 * Asked off the move the handling just made, before anything else in the
 * step can pick the car up: a respawn lands it ON the board behind it, and
 * a teleport must never be allowed to count as driving through anything.
 *
 * Progress alone would not do. Progress is the nearest sample, so a car
 * cutting the stage across country walks it past every board it never went
 * near — which is the whole thing the boards are here to catch. */
function throughBoard(state: GameState, x0: number, z0: number, x1: number, z1: number): boolean {
  const boards = state.track.checkpoints;
  const due = boards[state.checkpointsPassed];
  if (due === undefined) return false;
  return crossedGate(state.track, due.index, boardHalfWidth(state.track), x0, z0, x1, z1);
}

/** R28 — book the board the car has just driven through. */
function checkIn(state: GameState, events: GameEvent[]): void {
  const index = state.checkpointsPassed;
  state.checkpointsPassed = index + 1;
  events.push({
    type: "checkpoint",
    index,
    count: state.track.checkpoints.length,
    split: state.checkpointTimes.length,
    time: state.raceTime,
  });
  state.checkpointTimes.push(state.raceTime);
}

/** HOW MUCH OF A POINT IS OPEN COUNTRY rather than road, 0..1 — the weight
 * the terrain lattice carries against the road's own ribbon, and the weight
 * the body's corners carry against the ground under its middle (ground.ts,
 * `readSeat`).
 *
 * 0 over the mat, ramped across `offTrack.verge` and 1 from the line the
 * car counts as off the road outward, on the smoothstep R16 hands the
 * shoulder over with — so both surfaces and both seat rules meet with no
 * step and no kink at the seam the car crosses at speed. Measured against
 * the STAGE's half-width rather than the sample's, because that is the line
 * `offRoad` itself is drawn at and the two have to reach 1 together.
 *
 * A DECK has no verge to ramp across: past a parapet is air rather than a
 * shoulder leaning away, so a bridge keeps the hard edge it has always had
 * — the ribbon, clamped to the mat (track.ts, `profileOf`), for a corner
 * hanging over the parapet with the car still on the deck, and the country
 * outright for a car that has left it, which over a bridge is the river bed
 * and a car falling into it. And off the END of the road — past the apron
 * R24 shelves — the terrain owns the ground however little lateral offset
 * the fix reports.
 */
function countryShare(track: Track, fix: TrackPoint): number {
  if (track.samples[fix.index].deck != null) return fix.offRoad ? 1 : 0;
  if (fix.offRoad) return 1;
  const out = (Math.abs(fix.lateral) - track.width / 2) / T.offTrack.verge;
  const t = clamp(out, 0, 1);
  return t * t * (3 - 2 * t);
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
  lip: false,
  windX: 0,
  windZ: 0,
  t: 0,
  rng: createRng(0),
  drive: 1,
  groundAt: () => 0,
  country: 0,
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
  // R44 — and the traffic drives through every phase too: the public roads
  // do not wait for the lights. It is resolved against the car HERE, off
  // the pose the last step left, exactly as the rival field is on its own
  // tick — and the car's own step below starts from whatever it was dealt.
  stepTraffic(state, events);

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
  if (state.phase === "finished" || state.phase === "retired") return events;

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
  // ...and neither is a car lying on its roof. The roll has stopped and it
  // has stopped somewhere nobody drives away from, so the same rule holds:
  // the clock above runs and nothing below it does, until the crew are put
  // back at the last split board.
  if (state.overturned) {
    stepOverturned(state, events);
    return events;
  }
  const drive = state.phase === "rollout" ? rollOutInput(state) : input;
  const car = state.car;
  const track = state.track;
  const terrain = state.terrain;
  const prevX = car.x;
  const prevZ = car.z;

  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  // Locate against the centerline BEFORE the move to know the ground ahead;
  // the fix after the move drives progress and respawn. Both searches start
  // from where the car IS (`nearIndex`), never from how far the run has
  // GOT: progress is a monotonic score and a car that has doubled back
  // leaves it standing hundreds of metres up the road. The road's grade is
  // read from behind the CAR, so a car pointed down the stage asks for it
  // from up the stage (`locate`'s `back`).
  const hint = state.nearIndex;
  const flat = flatTrack(track);
  const back = sinH * flat.sinHeading[hint] + cosH * flat.cosHeading[hint] < 0;
  const preFix = locate(track, car.x, car.z, hint, back);
  const gain = driveGain(state);
  // WHERE THE CAR IS GOING, in world space — which sideways is nowhere near
  // where it is pointing. Everything below that asks the ground what it is
  // about to do to the car reads this rather than the heading: the shape
  // that throws a car is the shape under its PATH, and a car crossing a
  // brow in a drift meets it just as squarely as one driving straight at
  // it. (Both takeoff gates already read `pace` for the same reason — this
  // is the direction half of the same idea.)
  const dirX = sinH * car.u + cosH * car.w;
  const dirZ = cosH * car.u - sinH * car.w;
  // ONE GROUND, road and country alike — the surface every height in the
  // step below is read off, wherever it is asked about.
  //
  // The two are stated in different places: the mat is the road's own
  // ribbon (`locate` — its crown, its wheel tracks, the shoulder), and the
  // country is the terrain lattice, which is what the renderer draws and
  // what R16's hand-over leans the shoulder onto. They agree over the mat
  // and for the bare metre and a half past it, and then they part: the
  // ribbon's cross-section is a FORMULA and runs on for ever, gently, where
  // the real ground drops away down an embankment. Metres out — which is
  // where a car's own corners are asking (ground.ts, `corners`) — the
  // ribbon is a fiction worth up to a body's height.
  //
  // That fiction never stayed a height. The body's momentum is measured
  // against the ground the wheels found (`Seat.foot`), and reading the
  // fiction on one step and the truth on the next made a foot that fell at
  // tens of m/s — a whole loft opened in a single hundred-and-twentieth of
  // a second, on ground that only ever went down, and the car thrown up
  // into the air at the verge line and left riding the fiction across the
  // country. A seam between two readers is not a shape; it is a teleport.
  //
  // So the ribbon hands over to the terrain ACROSS the verge, on the same
  // smoothstep R16 draws with, and by the line where the car counts as off
  // the road the two branches below are reading the identical surface. A
  // DECK is the exception the ribbon is right about: past a parapet is air,
  // not a verge, and the lattice under a bridge is the river bed.
  const groundAt = (x: number, z: number): number => {
    const fix = locate(track, x, z, preFix.index);
    const share = countryShare(track, fix);
    if (share <= 0) return fix.elevation;
    if (share >= 1) return terrain.groundAt(x, z);
    return fix.elevation + (terrain.groundAt(x, z) - fix.elevation) * share;
  };
  const country = countryShare(track, preFix);
  // The ground under the car as the step BEGINS, read off that same one
  // surface: `wheelSpeed` divides the move by `dt`, so a pre-move height
  // from a different reader than the post-move one is the seam again.
  const groundY = country <= 0 ? preFix.elevation : groundAt(car.x, car.z);
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
    ctx.groundY = groundY;
    ctx.slope = (ahead - behind) / (2 * grade);
    ctx.slopeLat = (right - left) / (2 * grade);
    ctx.roadCurve = (fwd + back - 2 * here) / (span * span);
    // A brow out in the country is a shape the ground happens to have, and
    // the car bobs over it or is thrown by it on the strength of its own
    // momentum alone. The training ground is the one place off a road where
    // something was BUILT to throw the car (`mapgen/arena.ts`), and its
    // ramp's lip is entitled to the same launch a stage's jump gets: off
    // the top, at the speed the ramp was drawn around, rather than glued to
    // the landing face until the flight starts late and reads as a hop.
    ctx.lip = track.arena !== null && track.arena.lipAt(car.x, car.z);
    ctx.windX = state.wind.x;
    ctx.windZ = state.wind.z;
    ctx.t = state.t;
    ctx.rng = state.rng;
    ctx.drive = gain;
    // The car's own corners reach back over the mat it has just left, and a
    // corner over a road is standing on the road: the shared surface above,
    // not the bare lattice, which is why this is not `terrain.groundAt`.
    ctx.groundAt = groundAt;
    ctx.country = country;
  } else {
    // How sharply the road curves under the car ALONG ITS PATH — what
    // decides whether it throws the car, and how much of the car's weight
    // is still on the tires while it does not. Both the stage's brows and
    // the road's own cross-section, weighted by which way the car is going
    // (`pathCurvature`). A jump lip anywhere in that window is NOT a brow:
    // its drop is an EDGE the ground-follow throws the car off (car.ts,
    // `air.edgeSpeed`), and reading it here would fire a stutter of hops on
    // the run-up instead — and the lip owns the whole surface there,
    // cross-section included.
    const reach = Math.max(1, Math.round(T.air.crestSpan / track.step));
    const lipNear =
      crossedLip(track, Math.max(-1, preFix.index - reach - 1), preFix.index + reach) >= 0;
    // THE GRADE, TURNED ONTO THE CAR'S OWN AXES. The road states its shape
    // in its own frame — `slope` down the centerline, `slopeLat` across it —
    // and a car is under no obligation to agree with either. `GroundContext`
    // asks for the gradient on the CAR's axes (it is what gravity is
    // resolved along, what pitches the nose and leans the body, and what the
    // wheels' vertical speed is dotted against), and the wild's branch below
    // reads its ground that way. Handing the road's own frame over unturned
    // gave every car pointed the other way an inverted hill: gravity pushing
    // it back down a descent and hurrying it up a climb, the camber pulling
    // it toward the crown, and the nose sitting on the wrong attitude the
    // whole way. Straight down the stage `turn` is 0 and this is the
    // identity, which is why it went unnoticed.
    const fwdX = flat.sinHeading[preFix.index];
    const fwdZ = flat.cosHeading[preFix.index];
    // The car's nose against the road's, as a rotation: cos and sin of the
    // angle between them, taken off the two unit vectors rather than an
    // atan2 nobody needs the angle from.
    const turnCos = sinH * fwdX + cosH * fwdZ;
    const turnSin = sinH * fwdZ - cosH * fwdX;
    ctx = GROUND;
    ctx.surface = preFix.surface;
    ctx.groundY = groundY;
    ctx.slope = preFix.slope * turnCos + preFix.slopeLat * turnSin;
    ctx.slopeLat = preFix.slopeLat * turnCos - preFix.slope * turnSin;
    ctx.roadCurve = lipNear ? 0 : pathCurvature(track, preFix, dirX, dirZ);
    ctx.lip = lipNear;
    ctx.windX = state.wind.x;
    ctx.windZ = state.wind.z;
    ctx.t = state.t;
    ctx.rng = state.rng;
    ctx.drive = gain;
    // On the mat the road IS the ground: its own profile — crown, tracks,
    // shoulder and the grassed slope past it (R16), interpolated between
    // samples — read wherever the step lands the car, and handed over to
    // the country past the verge by the shared reader above. Nothing is
    // seated on the profile: a road is smooth across the body's length, and
    // the cross-section under the wheels is what the car is meant to ride,
    // not a face to be lifted clear of — which is what `country` says.
    ctx.groundAt = groundAt;
    ctx.country = country;
  }

  if (car.rolling) {
    // Past its outside wheels and turning: the body is a shape going over
    // (roll.ts) — including the flights BETWEEN its contacts, which belong
    // to the roll and not to the ordinary air, because a turning body flies
    // about its own centre while the wheel plane the air flies goes round
    // with it. The DRIVER is still in it: the pedals and the wheel reach the
    // world through whatever of the car is still standing on rubber, which
    // on two wheels is most of it and on a roof is none. It ends either back
    // on its wheels or lying on a flank or its roof, and `stepOverturned`
    // above is what happens in the second case.
    stepRolling(state.spec, car, drive, ctx, events, state.stats);
  } else if (car.airborne) {
    stepAirborne(state.spec, car, drive, ctx, events, state.stats);
  } else {
    stepGrounded(state.spec, car, drive, ctx, events, state.stats);
  }
  // THE TEMPERATURE, stepped after the move that made it: the engine's heat
  // comes from the pedal that was just asked for, and the air that carries
  // it away from the pace the car is actually doing. A sound car never
  // moves the needle; a holed radiator is a clock the driver is racing
  // (game/cooling.ts), and one that runs out is an engine at 1 — which is
  // the retire below.
  stepCooling(car, drive.throttle, car.u, T.dt, events);
  // ...and WHERE that roll stopped is the whole of the question. Asked of
  // a body that has finished moving, so a car mid-roll and a car in the
  // air are both still having their go: only one that is down, still and
  // past the basin its own weight could right it from has actually come to
  // rest on something that is not its wheels.
  // ...asked of the ROLL and of the BOX'S OWN PITCH, but never of the
  // springs'. `car.pitch` is two things under one name: the rotation a
  // crashing body has been left at, and the nose angle a DRIVEN car carries
  // on its suspension — and the second reaches `attitude.pitchMax` where the
  // box stops standing on its tyres at less than half of that, so reading it
  // raw declares a car merely driving down a hill to be up on its bumper,
  // `stepOverturned` returns before anything moves, and the car freezes on
  // the spot. `settlePitch` CLAMPS the springs at that number, so the two
  // meanings separate exactly: within it, it is an attitude and reads level;
  // past it, nothing but a crash can have put the car there.
  //
  // And it has to be read, because with a free pitch axis half the ways a
  // car ends up off its wheels do not show in the roll at all. A body at no
  // roll and half a turn of pitch is lying on its ROOF — and was left there
  // for good, because the run never marked it overturned and the crew were
  // never taken back. One at half a turn of BOTH is sitting squarely on its
  // tyres facing backwards, and was being teleported to the last board for
  // it.
  const nose = Math.abs(rollTilt(car.pitch)) > T.attitude.pitchMax ? car.pitch : 0;
  if (!car.rolling && !car.airborne && !onItsWheels(car.roll, nose)) {
    state.overturned = { since: state.t };
  }

  const fix = locatePoint(track, car.x, car.z, state.nearIndex);
  // The finish is a LINE across the road, and the move just made is what
  // either crossed it or did not. Asked here rather than at the end of the
  // step, so a respawn cannot teleport the car over the gate and win.
  // ...and never on the training ground, whose ribbon is an approach road
  // and not a stage: its far end is a place the car drives out of onto the
  // pad, not a line the session is over at.
  const finished =
    !track.endless && track.arena === null && crossedFinish(track, prevX, prevZ, car.x, car.z);
  // R28 — and the split board it owes, asked here for the same reason.
  const checkedIn = throughBoard(state, prevX, prevZ, car.x, car.z);
  state.nearIndex = fix.index;
  // R22 — A CIRCUIT'S ROAD RUNS BACK INTO ITS OWN START LINE, so its first
  // sample and its last are the same piece of gravel and the nearest-sample
  // search is free to answer with either. Progress only ever creeps forward,
  // which on a sprint is the whole of the rule — but on a circuit the car
  // stands ON that seam twice a lap: once on the grid, once on the line it
  // laps at. Taking the far end there pins progress at the length of the
  // road for the WHOLE of the next lap, and everything downstream reads it:
  // the pacenotes, the crowd, the gauge on the map, and the bot's plan,
  // which is why a bot that drove lap one cleanly used to spend laps two
  // and three driving a stage it thought it had already finished.
  //
  // So a jump of more than half a lap ahead is the ROAD wrapping, not the
  // run advancing, and progress ignores it. There is nothing to weigh: a
  // car cannot cover half a lap in one step, so the only thing this rule
  // can ever throw away is the seam.
  const wrapped = track.circuit && fix.index - state.progressIndex > track.samples.length / 2;
  if (!wrapped) state.progressIndex = Math.max(state.progressIndex, fix.index);
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
  // field answers an empty list off one lookup. A homestead's walls, cars
  // and lane trees (R37) come out of the same query for the same reason: a
  // car up the drive is on a road, and the trees beside it are still trees.
  const fixtures = terrain.fixturesNear(car.x, car.z, 2.5);
  if (fixtures.length > 0) {
    collideCar(state.spec, car, fixtures, events, state.stats, terrain.fell);
  }
  // R41 — and the TRAIN, wherever it is on its line this second: a run of
  // moving solids on the rails, standing only where the car is near the
  // line and a wagon is over that piece of it. Checked on the road or off
  // it, for the parapet's reason — the crossing IS the road.
  for (const crossing of state.track.rails) {
    const wagons = trainSolidsNear(crossing, state.t, car.x, car.z, 2.5);
    if (wagons.length > 0) collideCar(state.spec, car, wagons, events, state.stats);
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
      // a `solidBreak` the renderer tumbles away. What stands under the
      // ride-over bar is the WHEELS' business first (a thump and a lurch,
      // `clipSolids`); the body only meets what stands over it.
      if (solids.length > 0) {
        clipSolids(state.spec, car, state.t, solids, events, terrain.fell);
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
  //
  // Neither reaches a car that is BEYOND DRIVING — a dead engine, two
  // wheels gone. Putting one of those back on the road would only park it
  // there: the run is over, and it is over where the car comes to rest
  // (`retire` below), not at a board it will never drive away from.
  const done = beyondDriving(car);
  if (done === null) {
    if (drive.reset && !crashed) sendBack(state, events);
    else if (!crashed) stepStuck(state, drive, events);
  } else if (
    state.phase === "racing" &&
    !crashed &&
    !car.airborne &&
    Math.abs(car.u) <= T.collision.retire.restSpeed &&
    Math.abs(car.w) <= T.collision.retire.restSpeed
  ) {
    state.phase = "retired";
    car.u = 0;
    car.w = 0;
    car.yawRate = 0;
    updateSlip(car);
    events.push({ type: "retire", reason: done });
    status(`Retired from stage ${state.seed} (${done}) after ${state.raceTime.toFixed(2)} s`);
  }

  // R25 — the crowd, which only exists to be driven past.
  if (state.phase === "racing") cheerFor(state, events);
  // R28 — the split board this move drove through, if it drove through one.
  if (checkedIn && state.phase === "racing") checkIn(state, events);

  // R28 — THE STAGE IS ALL OF ITS BOARDS. A line crossed with splits still
  // owed is a stage that was cut rather than driven, so it books nothing:
  // not the lap, not the finish. The run simply carries on, and the way
  // back to the board it owes is the way it always is — turn round and
  // drive to it, or take the way-home button, which puts the car at the
  // last board it DID take and hands it the road from there.
  const owed = track.checkpoints.length - state.checkpointsPassed;
  if (finished && owed > 0 && state.phase === "racing") {
    events.push({ type: "missed", next: state.checkpointsPassed, count: track.checkpoints.length });
  }

  // Through the gate. On a circuit (R22) it is the same line the run
  // started on, so crossing it books a lap and — until the last one — puts
  // the car back at the top of the road it is already standing on. On the
  // last crossing the CLOCK is over; the car need not be, because a sprint
  // has R25's run-out behind its gate and coasts down it. Whatever has no
  // run-out — a circuit, a synthetic rig, an endless stage's absent finish
  // — is simply over at the line, having nothing to coast down.
  if (finished && owed <= 0 && state.phase === "racing") {
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
