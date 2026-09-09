// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// STANDING A RUN UP. What a caller asks for (`CreateGameOptions`), the
// weather and the wind the seed blows over it, and the `GameState` the
// first step is handed: the stage compiled, the car on the grid, the field
// beside it, the traffic already moving on the public roads.
//
// Everything here happens once. What happens 120 times a second is
// `step.ts`'s.

import { clamp } from "../lib/math.ts";
import { createRng } from "../lib/prng.ts";
import {
  biomeRules,
  compileStage,
  compileTrack,
  createKerbField,
  createTerrain,
  STAGE_RULES,
  type BiomeId,
  type StageKnobs,
  type StageLength,
  type StageShape,
} from "../mapgen/index.ts";
import { carById, gearedSpec, type GearboxMode } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import { createSnowpack, type Snowpack } from "./snowpack.ts";
import { calmSand, sandAt, sandWindSpeed, type SandState } from "./sandstorm.ts";
import { plant } from "./ground.ts";
import { type CatchUp, type GameState, type RaceEnv, type Season, type Weather } from "./state.ts";
import { freshCar, freshStats } from "./car-state.ts";
import { createTraffic } from "./traffic.ts";
import { status } from "../output.ts";

const T = TUNING;

/** The hour a run starts at when nobody says: noon, the arcade baseline
 * every light in the game was authored against. */
export const DEFAULT_HOUR = 12;

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
  /** R47 — SHARE ONE STAGE'S SNOW with the runs already on it
   * (`snowpack.ts`). A field of cars is a field of worlds — each crew has
   * its own terrain, its own fallen trees, its own everything — but the
   * snow is the one part of the world worth holding in common, because a
   * trail nobody else can see is not a trail somebody left. Handed in, a
   * crew drives the ruts the cars ahead of it cut and cuts its own for the
   * cars behind; left out, the run gets a pack of its own. Only ever
   * shared between crews that are STEPPED TOGETHER — a ghost's trace is
   * written ahead of the clock, and its tracks would appear on a road
   * nobody has reached yet. */
  snow?: Snowpack;
  /** Race conditions. The start hour is presentation-only; weather sets the
   * wind band (TUNING.wind.speed); the season and the temperature are the
   * CLIMATE (climate.ts) — they reach the road, so a run handed a compiled
   * `track` takes them from it and one that compiles its own hands them to
   * the compiler. Defaults: noon, clear, the track's own climate (summer,
   * at the country's temperature). */
  env?: {
    hour?: number;
    weather?: Weather;
    season?: Season;
    temperature?: number | null;
    /** How often the sandstorms come, 0..1 (`game/sandstorm.ts`) — read
     * only in a country whose wind lifts the ground. */
    sandstorms?: number;
  };
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

/** HOW OFTEN THE SANDSTORMS COME when nobody has said: a shade under
 * halfway, which at `sand.period`'s band is a front every six minutes or
 * so — about an even chance that any one stage meets one. A desert run
 * ought to be able to bring back the weather its country is famous for,
 * and it ought not to be a certainty: a wall of sand that turns up every
 * single time is scenery, and the whole of this feature is that it is an
 * EVENT. */
export const DEFAULT_SANDSTORMS = 0.45;

/** Wind direction, mean speed, and gust phase are seeded on their own
 * stream so adding weather never shifts the in-run RNG the physics draws
 * from. The same seed and weather always blow the same wind. */
export function buildEnv(
  seed: number,
  hour: number,
  weather: Weather,
  season: Season,
  temperature: number,
  biome: BiomeId,
  sandstorms: number,
): RaceEnv {
  const rng = createRng((seed ^ 0x51ab3d75) >>> 0);
  const [minSpeed, maxSpeed] = T.wind.speed[weather];
  return {
    hour,
    weather,
    season,
    temperature,
    windDir: rng.range(0, Math.PI * 2),
    windSpeed: rng.range(minSpeed, maxSpeed),
    gustPhase: rng.range(0, Math.PI * 2),
    sand: biomeRules(biome).blown,
    sandstorms,
    // Drawn AFTER the wind's three, so a build that carries no storms
    // draws the same wind every seed always had.
    sandSeed: rng.int(0, 0xffffffff),
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
  // A SANDSTORM IS A WIND (`sandstorm.ts`), so it belongs here rather than
  // beside here: everything already reading the wind — the push down the
  // straight, the carry off a jump, the sheet on the glass, the road's own
  // voice, a rival's traced car — is then telling the player about the
  // same front, in step, for nothing.
  sandAt(env, t, SAND);
  const speed = sandWindSpeed(env.windSpeed, SAND.sand) * gust;
  into.x = Math.sin(dir) * speed;
  into.z = Math.cos(dir) * speed;
}

/** The storm reading `blowWind` fills to size its own gust. It is scratch:
 * the STATE's copy is written by the step (`state.sand`), which is what
 * every reader outside this function is looking at. One shared record
 * because `blowWind` is called 120 times a second and never re-entered. */
export const SAND: SandState = calmSand();

export function createGame(options: CreateGameOptions): GameState {
  // The box is folded into the spec once, here: everything that reads
  // `state.spec` — the shift points, the bot, the rev counter, the engine
  // note — then drives the gears the player chose.
  const gearbox = options.gearbox ?? "auto";
  const spec = gearedSpec(carById(options.carId ?? "compact"), gearbox);
  const track =
    options.track ??
    compileStage(options.seed, options.length ?? "medium", options.knobs, options.shape, {
      season: options.env?.season,
      temperature: options.env?.temperature,
    });
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
    options.env?.hour ?? DEFAULT_HOUR,
    options.env?.weather ?? "clear",
    track.climate.season,
    track.climate.temperature,
    track.knobs.biome,
    options.env?.sandstorms ?? DEFAULT_SANDSTORMS,
  );
  // The grid already stands in the wind — its flags and fumes drift before
  // the lights go green, so the vector starts at its t = 0 value.
  const wind = { x: 0, z: 0 };
  const sand = calmSand();
  sandAt(env, 0, sand);
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
    // R47 — the snow this run works down as it drives (`snowpack.ts`).
    // White is the terrain's own answer plus the road's: a stage can run
    // over a snowline without its country lying under a blanket, and the
    // road it does that on still ruts.
    snow: options.snow ?? createSnowpack(terrain.snowy || track.samples.some((s) => s.snow > 0)),
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
    sand,
    catchUp: options.catchUp ?? null,
    stats: freshStats(),
    rng: createRng((options.seed ^ 0x9e3779b9) >>> 0),
  };
}
