// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The bot driver — a deterministic player stand-in that reads the same
// GameState the HUD reads and produces the same CarInput a thumb produces.
// It follows a lookahead point on the centerline, brakes for the curvature
// ahead, pulls the handbrake to rotate into hard corners (so bots drift like
// players do), and shifts a manual box. Used by the simulation harness, the
// balance CLI, and the tests; it must never reach into physics internals.
//
// It also races. Handed the cars near it, it moves its aim off the crown to
// go round them, sits in behind when there is nowhere to go, and — if that
// is the sort of crew it is — leans on them on the way past. See THE OTHER
// CARS at the bottom of the file.

import { angleDiff, clamp } from "../lib/math.ts";
import { damageEffects } from "../game/damage.ts";
import { latCeiling, slideFloor, surfaceGripFor, wheelSlide } from "../game/limits.ts";
import { TUNING } from "../game/defs/tuning.ts";
import type { CarSpec } from "../game/defs/cars.ts";
import {
  builtTerrain,
  flatTrack,
  SURFACES,
  type TerrainField,
  type Track,
} from "../mapgen/index.ts";
import { scarPlan, scarsFor } from "./scars.ts";
import { startsIn } from "../game/step.ts";
import type { CarInput, GameState } from "../game/state.ts";
import {
  browAhead,
  gridInput,
  gridRev,
  NO_TRAFFIC,
  readTraffic,
  type TrafficCar,
} from "./bot-traffic.ts";

export { gridRev, type TrafficCar } from "./bot-traffic.ts";

/** The sample `ahead` steps down the road. On a CIRCUIT (R22) the road runs
 * on past its last sample into its first, so the lookahead runs on with it
 * — a bot that clamped at the finish line would brake for a wall that is
 * really the next lap's start straight. On a sprint the clamp is right:
 * past the finish there is nothing to plan for. */
function aheadOf(track: Track, index: number, ahead: number): number {
  const at = index + ahead;
  const last = track.samples.length - 1;
  if (!track.circuit) return Math.min(last, at);
  return at % track.samples.length;
}

export type BotProfile = {
  /** How much of the car's TRACTION CEILING the bot plans corners around —
   * a fraction of `limits.ts`'s `latCeiling`, which is the same number the
   * tires will actually deliver when the car gets there. Read against that
   * and not against `gripAccel`: planning off the spec sheet's grip while
   * the rubber delivers `latCeiling` times it is not a driver misjudging a
   * corner, it is a driver in a different car. Well under 1, because the
   * ceiling is where the tires are OUT: a driver who planned at 1 would
   * arrive at every corner with nothing left, and the margin between this
   * and the ceiling is what a rally driver spends on the slide. */
  latFraction: number;
  /** Steering proportional gain on the lookahead angle error. */
  steerGain: number;
  /** Lookahead time toward the aim point, seconds. */
  lookahead: number;
  /** How far ahead the bot scans for braking targets, seconds. */
  planHorizon: number;
  /** Curvature (1/m) above which an approach earns a handbrake flick. */
  hardCurvature: number;
  /** How much over the geometric corner speed a hard corner is entered at,
   * m/s — scaled by how freely the car rotates (see `rotationRef`). */
  hotEntry: number;
  /** The rotational authority (`spec.driftYaw`) that `hotEntry` is quoted
   * at, in a car whose wheel finds a full slide (`limits.ts`'s `wheelSlide`
   * of 1 — the rear-driver). A car that rotates more freely than that is
   * trusted with proportionally more of it, one that rotates less — or one
   * that has to be ASKED before it rotates at all — with less. */
  rotationRef: number;
  /** How much a corner with NOWHERE TO GO takes off the plan, 0..1 — the
   * share of the geometric corner speed a driver gives up where running
   * wide would end the run rather than cost a second.
   *
   * The rest of this plan reads the road and nothing beside it, which is
   * fine while the answer to running wide is always "a bit of grass". It
   * stops being fine the moment the stage is laid along the country (R34):
   * a road down a valley floor runs past open water, and a road forced over
   * a shoulder runs between rock. A driver looks at that and lifts. One who
   * does not drives into the same lake until the clock runs out — which is
   * exactly what this bot did, three hundred times in one run, on the first
   * seed that put a tarn on the outside of a fast corner.
   *
   * It is a fraction and not a flat margin because what it is protecting
   * scales with the corner: giving up 2 m/s means nothing at 160 km/h and
   * is the whole corner at 40. */
  exposure: number;
  /** Margin over the corner speed that triggers braking, m/s. */
  brakeMargin: number;
  /** How much of the car's braking the corner plan assumes it will get —
   * the fraction of `2 · spec.brake` the distance-discount is worked out
   * with. A driver who trusts the brakes stays on the throttle later and
   * hauls the car down at the corner; one who does not starts lifting a
   * long way out. Under 1 for everybody: the plan is a driver's estimate,
   * and one that assumed every last newton would arrive at the apex having
   * run out of road. */
  brakeUse: number;
  /** Seconds pinned against something with the throttle buried before the
   * bot stops pushing and backs out of it instead. Under the engine's own
   * wedge rescue (TUNING.offTrack.stuck.after) on purpose: reversing is
   * what a driver tries first, and the respawn is what happens when it
   * turns out the car is pinned both ways. */
  reverseAfter: number;
  /** Reverse speed that ends the manoeuvre, m/s. Reached it, the car is off
   * whatever it was against and has room for another run at the line. */
  reverseSpeed: number;
  /** ...and how long that run gets before the wedge test may fire again, s.
   * A car that has just backed three metres out of a bank is not wedged
   * again the moment it slows to turn around — it is going nowhere because
   * it is coming through zero and building speed, which is the whole point
   * of having backed out. Without the hold-off the same car backs out,
   * crawls forward at walking pace, is declared wedged there and backs out
   * again: a loop that walks it further from the road every cycle and never
   * takes the run at all. Long enough to cover a standing start on the
   * nature surface, which is the slowest ground it can happen on. */
  runUp: number;
  /** Seconds out in the wild before the bot stops trying to drive back and
   * takes the reset instead. Knowing when an excursion is over is a skill:
   * a driver who ploughs on through the trees for a quarter of a minute
   * loses more than the reset would have cost. */
  offRoadGiveUp: number;
  /** How hard they go for a move on the car in front, 0..1 — how close they
   * run alongside it, and how long they will sit in its dust before
   * deciding the gap is good enough. */
  overtake: number;
  /** What they are prepared to DO to that car, 0..1. See `AGGRO`: under
   * `AGGRO.clean` they leave a car's width of air and lift rather than
   * touch anybody, past it they lean on whatever is beside them, and past
   * `AGGRO.dirty` they stop passing cars and start removing them. */
  aggression: number;
  /** Where in its own grid ritual this car is, 0..1 of one blip (see
   * `GRID`). It is not a skill and not even a temperament — it is a phase,
   * and it exists for one reason: fourteen crews all revving to the same
   * clock is one loud engine, where fourteen crews a fifth of a blip apart
   * is a START LINE. It comes off the START NUMBER rather than the crew
   * (`rivals.ts`), because two identical drivers stood side by side should
   * still not blip in unison. */
  gridPhase: number;
};

/** How much brake a driver carries PAST the turn-in of a corner the car
 * will not rotate into on its own, 0..1. Enough to keep the weight on the
 * nose (`CarState.brakeLoad`, and `drift.brakeDepth` off it) and not so
 * much that the corner is arrived at stopped: a trail, not a stop. */
const TRAIL_BRAKE = 0.35;

/** How many m/s under the corner plan the throttle is already easing off
 * over, and how many over it the brake comes in across. The throttle's is
 * the wider of the two — a driver eases up to a corner speed over a good
 * few km/h and then leans on the middle pedal decisively — and neither is
 * wide enough to be a driver who never fully commits to either. */
const THROTTLE_BAND = 4;
const BRAKE_BAND = 2.5;

/** The slip angle a drift is carried on full throttle up to, rad, the band
 * over which the pedal is then breathed back, and how little of it is left
 * at the deepest angle the bot will hold. Never zero: the drive is what
 * keeps a slide open. */
const DRIFT_HOLD = 0.35;
const DRIFT_BAND = 0.45;
const DRIFT_FLOOR = 0.45;

/** How much landing skitter (`CarState.settle`) the bot will still throw a
 * move on. A hard landing writes 1 and it fades out over about half a
 * second; under this the tyres are back enough to be asked for a slide. */
const SETTLED = 0.4;

/** How far ahead a driver reads the road for a BROW, s of travel, and the
 * share of what the ground can hold (`air.hold`) at which one starts to
 * count. A crest the ground cannot hold the car to at this pace is a
 * flight, and a car that flies sideways keeps every bit of the rotation it
 * took off with — so the slide is shut, and no move is thrown, before the
 * car gets there. The read is graded rather than switched: it comes in
 * over the last fifth of the hold, so a brow the car will merely go light
 * over straightens it a little and one it will leave the ground over
 * straightens it fully. */
export const BROW_LOOK = 0.8;

/** How far over a corner's speed the car may still be, m/s, for the LEVER
 * to be the answer rather than the brake. The lever is a deliberate
 * overspeed the slide scrubs, and a slide scrubs about this much: yanked
 * at ninety over the corner, the rotation it starts is one the tyres
 * never catch (`drift.overYaw`), and the car arrives at the hairpin
 * backwards. Past it the driver stands on the brake, and the lever comes
 * a few tenths later, once the speed is down to something a slide can
 * carry. */
const LEVER_HOT = 12;
/** Where a crew starts nursing the temperature, 0..1 of the gauge — the
 * cooling system's own first warning, so the bot acts on the same line the
 * player is told about (`TUNING.collision.cooling.warnAt`)... */
const COOL_FROM = TUNING.collision.cooling.warnAt;
/** ...and the most of the pedal it will give up, at the red line. Enough to
 * hold the needle on a hurt core at a stage's pace, and short of a crawl:
 * a crew that gives up the whole throttle gives up the ram air with it. */
const COOL_PEDAL = 0.35;

/** How long a car is NOT BRAKING after a jump lip, s: the flight itself and
 * the skitter of the landing after it (`CarState.settle`), neither of which
 * slows the car. A corner past a lip has to be braked for BEFORE the lip,
 * and the plan takes that road out of the braking it counts on: without
 * it a car lands a jump at full pace a few car lengths from a hairpin and
 * has nothing left but the slide, which at that speed is a spin. */
const LIP_GLIDE = 1.5;
export const BROW_FROM = 0.8;
export const BROW_BAND = 0.4;

/** The default rally brain: quick hands, plans ~3 s ahead, drifts hairpins. */
export const RALLY_BOT: BotProfile = {
  latFraction: 0.5,
  steerGain: 2.2,
  lookahead: 0.65,
  planHorizon: 3.0,
  hardCurvature: 1 / 30,
  hotEntry: 2.5,
  rotationRef: 2.5,
  exposure: 0.45,
  brakeMargin: 2.5,
  brakeUse: 0.7,
  reverseAfter: 0.8,
  reverseSpeed: 4,
  runUp: 2.5,
  offRoadGiveUp: 8,
  overtake: 0.6,
  aggression: 0.15,
  gridPhase: 0,
};

/** The lateral grip multiplier this car has on each surface, by surface
 * code — the surface's own times the rubber the car sits on, exactly as the
 * handling model reads it (car.ts). The bot plans corners off this, so the
 * catalog's tires are felt as PACE and not merely as a number nobody
 * drives.
 *
 * Resolved once per car rather than per sample: the corner scan below asks
 * for it dozens of times on every step a run decides on, and the answer
 * only depends on the car's rubber. */
const GRIP_BY_CAR = new WeakMap<CarSpec, readonly number[]>();

/** WHAT IS BESIDE THE ROAD, per centerline sample: 0 where running wide
 * costs a moment on the grass, 1 where it ends the run.
 *
 * Cached per terrain field and filled LAZILY, one sample at a time, because
 * the corner scan below is the bot's whole cost and a terrain query is far
 * more expensive than anything else in it. Only the samples the scan
 * actually reaches are ever asked — the corners, which are a fraction of a
 * stage — and each of them once per race rather than once per physics step.
 * `NaN` is "not asked yet"; the field never returns one.
 *
 * KEYED ON THE TRACK where the terrain is one the mapgen actually built,
 * and on the terrain itself where it is not.
 *
 * The exposure is a fact about the country, so the key has to be whatever
 * decides the country — and `createTerrain` takes the track and nothing
 * else, so two genuine fields off one track ARE one country and answer
 * identically. That matters because a field is fifteen games on one shared
 * track, each with its own terrain (they need their own: the field caches
 * the block its last query landed in, and fifteen cars in fifteen places
 * would miss that cache every time). Keyed on the terrain, those fifteen
 * cars fill fifteen identical copies of this table — a whole stage of
 * water and rock lookups, done fourteen times for nothing.
 *
 * The terrain stays the key for anything the mapgen did not build, which is
 * what keeps the other half of the old rule: a test that spreads its own
 * `waterAt` over a field gets its own table rather than the real country's
 * answers. `builtTerrain` is a `WeakSet` membership test for exactly that
 * reason — a spread produces a new object, so it cannot inherit the mark. */
const EXPOSURE = new WeakMap<TerrainField | Track, Float32Array>();

/** How far off the centerline a car that has run wide ends up, m — where
 * the question "and then what" is actually asked. Two probes: the first is
 * just past R31's flat bench, which is as far as a small mistake carries;
 * the second is out where a real one does. */
const RUNOFF = [18, 28, 42];

/** ...and what each hazard is WORTH, 0..1. Water is the whole run: a car in
 * it drowns and is fetched, and it is the one thing out there that cannot
 * be driven off again. Rock (R34's cut faces) is a hard stop that usually
 * ends in a wedge and a fetch, so it is most of a run rather than all of
 * it — and a driver treats it accordingly, which is to say still lifts. */
const HAZARD = { water: 1, rock: 0.7 };

function exposureAt(terrain: TerrainField, track: Track, index: number): number {
  const key = builtTerrain(terrain) ? track : terrain;
  let table = EXPOSURE.get(key);
  if (!table) {
    table = new Float32Array(track.samples.length).fill(NaN);
    EXPOSURE.set(key, table);
  }
  // An endless stage grows its samples under the table it was built with.
  if (index >= table.length) return 0;
  const cached = table[index];
  if (cached === cached) return cached;
  const s = track.samples[index];
  const cos = Math.cos(s.heading);
  const sin = Math.sin(s.heading);
  let worst = 0;
  for (const side of [-1, 1]) {
    for (const out of RUNOFF) {
      const x = s.x + side * out * cos;
      const z = s.z - side * out * sin;
      if (terrain.waterAt(x, z) !== null) worst = Math.max(worst, HAZARD.water);
      else if (terrain.cutAt(x, z) > 0.35) worst = Math.max(worst, HAZARD.rock);
    }
  }
  table[index] = worst;
  return worst;
}

function gripBySurface(spec: CarSpec): readonly number[] {
  let grip = GRIP_BY_CAR.get(spec);
  if (grip) return grip;
  grip = SURFACES.map((kind) => surfaceGripFor(spec, kind));
  GRIP_BY_CAR.set(spec, grip);
  return grip;
}

/** WHAT THE HANDS ARE STILL DOING, per run.
 *
 * Keyed on the state because that is what a run IS here, and the field
 * hands this function fifteen different ones a step. Weak, so a stage that
 * ends takes its drivers with it. */
const HELD = new WeakMap<GameState, CarInput>();

/** WHEN THIS RUN LAST CAME OFF SOMETHING, s on the run's clock — the start of
 * the run-up `profile.runUp` protects. Kept the same way and for the same
 * reason as `HELD`: it is a fact about one driver in one run, and the field
 * hands this function a dozen of both. */
const BACKED_OFF = new WeakMap<GameState, number>();

/** Whether the driver re-reads the road on this step, or drives on with the
 * lock and the pedals it last chose (`TUNING.botHz`). Off the run's own
 * clock, so it is the same answer on the same step of the same stage however
 * it is being driven — a replay, a headless sim and the live game all decide
 * together. The interval is worked out per call rather than once at load:
 * one divide against a whole corner scan is nothing, and it keeps both rates
 * answerable at runtime, which is what lets the sweep drive them. */
function looksUp(state: GameState): boolean {
  const every = Math.max(1, Math.round(TUNING.physicsHz / TUNING.botHz));
  if (every === 1) return true;
  return Math.round(state.t / TUNING.dt) % every === 0;
}

/** Compute this step's input for the current state.
 *
 * Everything the bot knows is in the GameState and in `traffic`, which is
 * the other cars near enough to matter, handed in by whoever is running the
 * field. An empty list is a stage driven alone, and produces exactly the
 * input a bot with no eyes for traffic always produced.
 *
 * It is not quite stateless: on the steps between decisions (`BOT_HZ`) it
 * answers with the input it last chose for this run rather than reading the
 * road again. That is held HERE rather than at the call sites because the
 * rate is a fact about the driver, not about who is asking — and a caller
 * that forgot would silently be the one car on the stage thinking twice as
 * hard as the rest. A fresh object every time regardless: the held one is
 * this module's, and a caller that stored what it was given (a run tape
 * does) must never find it changing underneath. */
export function botInput(
  state: GameState,
  profile: BotProfile = RALLY_BOT,
  traffic: readonly TrafficCar[] = NO_TRAFFIC,
): CarInput {
  const held = HELD.get(state);
  if (held && !looksUp(state)) return { ...held };
  const fresh = decide(state, profile, traffic);
  HELD.set(state, fresh);
  return { ...fresh };
}

/** The driving itself — everything below is one decision, taken fresh. */
function decide(state: GameState, profile: BotProfile, traffic: readonly TrafficCar[]): CarInput {
  const { car, track } = state;
  // THE START CONTROL. Nothing the hands do reaches the car while the lights
  // are up, so the corner plan below has nothing to say here — and running it
  // anyway is a scan of the road, per car, for every one of the ten seconds
  // the field spends stood still. What a driver is doing is the pedal, and
  // that is THE GRID RITUAL at the bottom of the file.
  if (state.phase === "intro" || state.phase === "countdown") {
    return gridInput(gridRev(startsIn(state), profile.aggression, profile.gridPhase));
  }
  // How freely this car rotates, against the profile's reference — and it
  // is TWO things, because a car arrives at a hot corner on both of them:
  // how much authority a developed slide hands the wheel (`driftYaw`) and
  // how much slide the wheel finds there in the first place (`wheelSlide`,
  // 0..1 against the rear-driver, which is the layout the reference is
  // quoted at). A front-driver has most of the first and little of the
  // second, and a driver who read only the first would carry a rear-driver's
  // entry speed into a car that answers by washing straight on.
  const rotation = (state.spec.driftYaw / profile.rotationRef) * wheelSlide(state.spec);
  const samples = track.samples;
  const step = track.step;

  // The road as flat arrays (mapgen/flat.ts). The scan below walks dozens
  // of samples on EVERY physics step, so both the sample objects and the
  // string key into the tuning table are worth staying out of.
  const {
    curvature,
    surface,
    arc,
    elevation,
    toNextCurve,
    x: roadX,
    z: roadZ,
    sinHeading,
    cosHeading,
  } = flatTrack(track);

  // Aim point: a speed-scaled distance down the centerline — moved off the
  // crown by however far round the car in front the move is going.
  const aheadMeters = Math.max(8, car.u * profile.lookahead);
  // What the cars around it are asking the hands and the feet to do.
  const near = readTraffic(state, profile, traffic, aheadMeters);
  const aim = aheadOf(track, state.nearIndex, Math.round(aheadMeters / step));
  // The road's right axis at the aim, which is its forward vector with the
  // signs swapped: (cos, -sin).
  const aimX = roadX[aim] + cosHeading[aim] * near.offset;
  const aimZ = roadZ[aim] - sinHeading[aim] * near.offset;
  const desired = Math.atan2(aimX - car.x, aimZ - car.z);
  const error = angleDiff(car.heading, desired);
  let steer = clamp(error * profile.steerGain, -1, 1);

  // What this stage has already done to this driver (`scars.ts`) — read
  // every step, because the reading is also the booking: a respawn is only
  // visible as the counter moving, and the place worth remembering is where
  // the car was standing before it moved.
  const scars = scarsFor(state);

  // Corner-speed plan: the tightest curvature over the horizon caps speed at
  // sqrt(a_lat / κ); the nearest cap that requires braking wins.
  const horizonMeters = Math.max(20, car.u * profile.planHorizon);
  const scan = Math.min(
    Math.round(horizonMeters / step),
    track.circuit ? samples.length - 1 : samples.length - 1 - state.nearIndex,
  );
  // ...AND WHAT IS LEFT OF THE CAR. `damageEffects` is the same reading
  // `car.ts` takes every step, and the two numbers below are the two it
  // multiplies straight into the grip and the brake pedal — so a driver who
  // plans without them is planning for a car they are no longer sitting in.
  // That is exactly the failure `game/limits.ts` was written to end, and a
  // rolled car is where it bites: it arrives at the corner that caught it
  // out at the speed a SOUND car could hold, goes off at the same metre, is
  // put back at the same board, and does it again.
  const hurt = damageEffects(car, Math.abs(car.u), state.t);
  // What the tires will actually give at a corner, off the handling model's
  // own ceiling rather than a second guess at it (`game/limits.ts`), taken
  // at the driver's own fraction of it. `gripBySurface` below scales it for
  // what the corner is paved with.
  const latAccel = latCeiling(state.spec, 1) * profile.latFraction * hurt.grip;
  let targetSpeed = state.spec.gearTop[state.spec.gearTop.length - 1];
  let hardDistance = Infinity;
  let hardCap = 0;
  const gripOf = gripBySurface(state.spec);
  const braking = 2 * state.spec.brake * profile.brakeUse * hurt.brake;
  const hotEntry = profile.hotEntry * rotation;
  const progressS = state.progressS;
  const trackLength = track.length;
  const count = samples.length;
  const from = state.nearIndex;
  // How near a hard corner has to be before the flick below can fire. Past
  // it the scan has nothing left to learn about the handbrake, which is
  // what lets the plan stop early.
  const flickReach = Math.max(12, car.u * 0.5);
  // The nearest jump lip in the horizon, as arc length: the road past it is
  // road the car cannot brake on (`LIP_GLIDE`). A plain walk — the corner
  // scan below steps over whole straights, and a lip sits on one.
  let lipS = Infinity;
  for (let ahead = 1; ahead <= scan; ahead++) {
    let i = from + ahead;
    if (i >= count) i = track.circuit ? i - count : count - 1;
    if (samples[i].jump) {
      lipS = arc[i] - progressS + (arc[i] < progressS ? trackLength : 0);
      break;
    }
  }
  const glide = car.u * LIP_GLIDE;
  let ahead = 1;
  while (ahead <= scan) {
    // The sample `ahead` down the road — see `aheadOf`, inlined because
    // this loop is the bot's whole cost. `scan` never exceeds one lap, so
    // a circuit wraps at most once.
    let i = from + ahead;
    if (i >= count) i = track.circuit ? i - count : count - 1;
    // Straight road has nothing to plan around, and two fifths of a stage
    // is straight — so the scan steps over a whole straight at once instead
    // of asking each of its samples in turn.
    const straight = toNextCurve[i];
    if (straight > 0) {
      ahead += straight;
      continue;
    }
    // Arc distance to it — round the lap on a circuit, where a sample the
    // bot is planning for can sit at a smaller `s` than the car does.
    const s = arc[i];
    const distance = s - progressS + (s < progressS ? trackLength : 0);
    // Nothing further out can lower the plan or move the flick: `distance`
    // only grows from here, and by the far end of the scan the car has room
    // to brake to any corner speed at all. The 1e-9 slack keeps the bound
    // strictly conservative against the squaring's rounding, so this can
    // only ever stop the scan LATER than the exact test would.
    if (
      (hardDistance < Infinity || distance > flickReach) &&
      braking * (distance - 10) > targetSpeed * targetSpeed * (1 + 1e-9)
    ) {
      break;
    }
    const k = curvature[i];
    // The grip the car will actually HAVE at that corner, not the number on
    // its spec sheet: the surface it is paved with and the rubber this car
    // is on both scale it, and a driver reads the road ahead. Without this
    // the plan is blind to the whole surface half of a car's character — a
    // road-tired car would brake for a sealed corner as if it were gravel,
    // and no amount of tire in the catalog would ever show up as pace.
    const cap = Math.sqrt((latAccel * gripOf[surface[i]]) / k);
    // ...and then what is BESIDE that corner. A driver plans a corner off
    // the grip he expects to have AND off what happens if he does not get
    // it, and those are different questions: the same bend is taken one way
    // with a field on the outside of it and another with a lake. Where
    // there is nowhere to go the plan gives up a share of the corner speed
    // and, below, refuses the hot entry outright — because the hot entry is
    // a deliberate overspeed paid for by running wide, and running wide is
    // the thing that is not available here.
    const exposed = exposureAt(state.terrain, track, i);
    const safe = exposed > 0 ? cap * (1 - profile.exposure * exposed) : cap;
    // Rally style: a hard corner is entered HOT — the plan deliberately
    // carries extra speed there and the drift scrubs it, instead of braking
    // down to the geometric cap like a grip line would.
    const hard = k > profile.hardCurvature;
    // Hot entry is ADDITIVE: a fixed margin over the geometric cap. A ratio
    // would overcook exactly the tightest hairpins, where the cap is
    // smallest. How much of it a car is trusted with is its ROTATION: the
    // slide is what brings the nose round in there, so a car that rotates
    // freely can carry more in than one that pushes.
    // ...and the hot entry is SCALED by the exposure rather than switched
    // off by it. A driver beside a lake still flicks the car into the
    // hairpin — that is how the corner is driven, and the technique is not
    // the danger — he simply asks for less of it. Taking it away outright
    // costs the quick crews the whole rally half of their pace on any stage
    // with water on it, and a difficulty ladder built on quick crews stops
    // being one.
    const planCap = hard ? safe + hotEntry * (1 - exposed) : safe;
    // Distance-discounted: a far corner allows more speed now than a near
    // one — over the road the car can actually brake on, which past a lip
    // is short of the whole distance by the flight and the landing.
    const room = distance > lipS ? Math.max(lipS, distance - glide) : distance;
    const allowed = Math.sqrt(planCap * planCap + braking * Math.max(0, room - 10));
    if (allowed < targetSpeed) targetSpeed = allowed;
    if (hard && distance < hardDistance) {
      hardDistance = distance;
      hardCap = safe;
    }
    ahead += 1;
  }

  // ...and over the top of the road ahead, the road BEHIND: a stretch that
  // has already ended this run is planned at a fraction of the speed it
  // ended it at, and at a smaller fraction every time it does it again. The
  // corner scan cannot see this — a place that catches a car out need not be
  // a corner at all, and the corner it is was legal at that speed for
  // everybody who got through it — so it is a cap in its own right, and the
  // plan takes whichever of the two is lower.
  const scarred = scarPlan(scars, state, braking);
  if (scarred < targetSpeed) targetSpeed = scarred;
  // ...and the driver KNOWS it, which is a different thing from the plan
  // having a number in it. Everything below that overrules the pedals —
  // the flick, and the throttle that holds a slide open — is a decision
  // taken on the assumption that running wide costs a moment. Arriving at
  // the place that ended the last run, it costs the run again.
  const wary = car.u > scarred;

  // THE PEDALS, and they are pedals rather than switches. Both used to be
  // on or off, which is not how either one is driven: a car held at a corner
  // speed by a throttle snapping between the floor and nothing pitches on
  // its springs every time it crosses the target, and the tires spend the
  // corner answering the pedal instead of the road. What a driver does is
  // squeeze — hard while there is a long way to go, feathering as the plan
  // is approached, and holding a maintenance throttle at it.
  //
  // The bands are the width of the squeeze in m/s. Both are narrow: this is
  // the last few km/h before the plan, not a slow ramp, and outside them the
  // pedal is where it always was — flat on the way to a distant corner, hard
  // on the middle one when the car is genuinely far too fast.
  const over = car.u - targetSpeed;
  let throttle = clamp(-over / THROTTLE_BAND, 0, 1);
  let brake = clamp((over - profile.brakeMargin) / BRAKE_BAND, 0, 1);

  // THE BROW AHEAD: the crest the car will fly at this pace, 0..1 (see
  // `BROW_LOOK`). Read off the road's own profile the way `car.ts` reads
  // the ground under the car, over the same baseline (`air.crestSpan`).
  const brow = browAhead(elevation, arc, from, count, track.circuit, step, car.u);

  // DRIFT ENTRY. Arriving hot at a hard corner, rotate the car — and WHICH
  // WAY is the car's own answer, not a rule of the bot's: `game/limits.ts`
  // says how much slide this layout finds on the wheel alone and how far
  // under the speed floor a move can still reach, which is exactly what a
  // driver knows about the car they are sitting in.
  // ...and not on tyres still hopping from a landing: a car that has just
  // come down hard is skittering (`car.settle`) and holds a fraction of its
  // grip, and a move thrown on that — the lever, the flick, the trailed
  // brake — is a spin, not a drift. A driver lets the car settle first.
  // ...nor over a brow: a move thrown into a crest is thrown into the air.
  const nearHard = !car.airborne && car.settle < SETTLED && brow < 0.5 && hardDistance < flickReach;
  // A car that already rotates on the wheel needs nothing but the speed to
  // do it with — that is the rear-driver, and this is the old rule. One that
  // does not has to be ASKED, and is asked in the corners the wheel would
  // otherwise wash straight out of.
  const rotates = wheelSlide(state.spec) > 0.8;
  const hot = car.u > hardCap + 2;
  // The LEVER, for a corner too slow for anything else: it is the one move
  // that reaches under the floor, so the test is whether the slide would be
  // open at all with it — and, for a car that rotates on its own, whether
  // the corner is quick enough to be worth one. Yanked to START a rotation
  // and let go the moment there is one, which is why this one reads
  // `car.drifting` and the trail below does not.
  // ...and nobody flicks a car into the corner that has just ended their
  // run. The lever is a deliberate overspeed the slide is trusted to scrub;
  // `wary` is the driver having already been shown what happens when it
  // does not, so the corner gets driven rather than attacked.
  const handbrake =
    nearHard &&
    !car.drifting &&
    !wary &&
    car.u < hardCap + LEVER_HOT &&
    (rotates ? hot : car.u > slideFloor(state.spec, 1) + 1);
  // ...and the TRAILED BRAKE, which is the same ask made with the pedal that
  // is already down. The plan has the car braking for the corner anyway; a
  // driver in a car that will not rotate carries some of that brake PAST the
  // turn-in instead of releasing it at the target speed, and arrives pointed.
  //
  // It is held through the corner and not only into it. Dropped the moment
  // the car reads as drifting, it takes the weight off the nose, the slide
  // it just bought shuts, the car is no longer drifting, and the pedal goes
  // back down: one corner comes out as a dozen quarter-second drifts and a
  // hatch shuddering through the apex. The move is the whole corner.
  const trailing = nearHard && !rotates && hot;
  if (trailing) brake = Math.max(brake, TRAIL_BRAKE);
  // ...keyed on the ANGLE as well as the engine's own flag: a car light over
  // a bump mid-slide reads as not drifting for a few steps, and a driver
  // who took that as leave to lift and brake at forty degrees of slip fed
  // the run (`drift.overYaw` reads a lift) and spun the car.
  if (car.drifting || Math.abs(car.slip) > DRIFT_HOLD) {
    // Sideways, the throttle is the thing holding the angle where it is, and
    // it is BREATHED rather than switched: full while the slide is still
    // building, easing as the angle gets deep enough to be running out of
    // road, never off — lifting entirely mid-drift takes the drive off the
    // rear and the slide shuts. A step at one slip angle made the car take
    // its half-throttle in a lump exactly where it was least settled.
    const deep = clamp((Math.abs(car.slip) - DRIFT_HOLD) / DRIFT_BAND, 0, 1);
    throttle = 1 - (1 - DRIFT_FLOOR) * deep;
    // Unless the slide is being carried into a place that has already ended
    // this run, and it is the SLIDE that has to go. Everywhere else the
    // pedal is never lifted right off mid-drift, because the drive is what
    // holds the angle — here that is the point: the drive comes off, the
    // slide shuts, and the plan above gets a car it can actually brake with
    // back a step later. It is what a driver does when they recognise the
    // corner they are already sideways for.
    if (wary) throttle = 0;
    // Standing on the middle pedal sideways is not how a driver avoids
    // anything — but a front-driver that let the brake up here would simply
    // stop turning, so what it keeps is the trail and never more.
    brake = trailing ? TRAIL_BRAKE : 0;
    // Counter-steer only once the nose is nearly where it should be —
    // mid-hairpin the aim error is huge and the car needs every bit of
    // rotation; damping there is what runs a drift wide. Unless the slide
    // is already DEEP: past the angle the pedal is being breathed back
    // over, the tail is past the tyre's peak and keeps coming on its own
    // (`drift.overYaw`), and a driver who waits for the nose to reach the
    // aim before catching it has spun. The catch comes in with the depth,
    // whatever the aim still wants — and with the car going LIGHT: a body
    // lifting off its wheels over a brow (`car.loft`) is about to fly, and
    // a car that flies sideways keeps every bit of the rotation it took
    // off with, so a driver straightens it before the crest — and reads
    // the crest coming (`brow`) rather than waiting to feel it, because by
    // the time the body has lifted there is a tenth of a second left.
    const light = Math.max(clamp(car.loft / TUNING.air.loft, 0, 1), brow);
    const counterWeight = Math.max(clamp(1 - Math.abs(error) / 0.6, 0, 1), deep, light);
    // Sideways, the aim is where the car is GOING, not where its nose is
    // pointing: hold the nose on the lookahead through a slide and the
    // velocity leaves the road by exactly the slip angle. Steering the
    // TRAVEL direction is what puts the nose the necessary few degrees
    // further into the corner — the counter-steer above still damps the
    // rotation once the nose is nearly back on line.
    //
    // ...and the aim gives way to the catch as the slide deepens. A car
    // most of the way round has a travel direction pointing anywhere, and
    // full lock toward where the road went is full lock INTO the slide: a
    // driver at that angle is on opposite lock whatever the road is doing,
    // and finds the road again once the car is theirs.
    const pathError = angleDiff(car.heading + car.slip, desired);
    steer = clamp(
      pathError * profile.steerGain * (1 - deep) + car.slip * 0.9 * counterWeight,
      -1,
      1,
    );
  }
  // …and whatever the road plan settled on, the car in front has a veto on
  // it. The brake is held back mid-slide: standing on the middle pedal
  // sideways is not how a driver avoids anything.
  if (near.throttle < throttle) throttle = near.throttle;
  if (near.brake && !car.drifting) brake = 1;
  let reset = false;
  if (state.offRoad) {
    // Out in the wild: cruise back toward the road at a pace the nature
    // surface can steer at, and give up cleanly on an excursion that has
    // carried the car too far out for driving back to beat the reset.
    // Being WEDGED is no longer one of those — that is what reverse is for.
    throttle = car.u < 16 ? 0.8 : 0;
    brake = car.u > 22 ? 0.7 : 0;
    reset = !car.airborne && state.t - state.offRoadSince > profile.offRoadGiveUp;
  }
  // A hop over a brow and the bounce out of a landing both carry `settling`:
  // the ground has the car back before a driver would have lifted for it.
  if (car.airborne && !car.settling) {
    // Committed: line the nose up with the travel direction for the landing.
    steer = clamp(-car.slip * 2, -1, 1);
    throttle = 0;
    brake = 0;
  }

  // Wedged. A driver does not sit against a trunk with the throttle buried
  // waiting to be rescued — they back off it and take another run at the
  // line, and so does this one. The manoeuvre latches on the car's own
  // reverse state so a single wedged tick cannot flicker it: once it is
  // backing out it keeps backing out until the car is properly moving, by
  // which point it is off the thing and has room to aim.
  //
  // The wheel stays straight. Getting OFF the obstacle is the whole job;
  // where to point is the next run's problem, and it has the room to decide
  // it by then. Reversing counts as asking to move (step.ts), so a car that
  // is pinned backwards too still reaches the engine's rescue on time.
  const wedgedFor = state.t - state.stuck.since;
  const runUpFor = state.t - (BACKED_OFF.get(state) ?? -Infinity);
  const backingOut =
    !car.airborne &&
    ((wedgedFor > profile.reverseAfter && runUpFor > profile.runUp) ||
      (car.reversing && car.u > -profile.reverseSpeed));
  // The manoeuvre is over the moment the car is properly moving backwards:
  // from here the run-up is protected, whatever the wedge test makes of a
  // car turning around at walking pace.
  if (car.reversing && car.u <= -profile.reverseSpeed) BACKED_OFF.set(state, state.t);
  if (backingOut) {
    throttle = 0;
    brake = 1;
    steer = 0;
  }

  // THE NEEDLE. A holed radiator is the one piece of damage a driver can
  // DRIVE AROUND (game/cooling.ts), and a bot that cannot is a bot that
  // cooks an engine no human would have lost: heat is made by the throttle
  // and shed by the air, so the answer is to ease the pedal and keep
  // moving. Eased in from the first warning and hardest past the red line,
  // and never to zero — a car that stops making heat also stops making the
  // ram air that carries it away, and a driver who parks up boils where
  // they stand.
  //
  // Nothing else the bot does knows about this: a crew nursing a
  // temperature still brakes for the corner and still takes the line, it
  // simply arrives there slower. Which is exactly the trade the player is
  // offered, and the reason the mechanic has to be one the AI can play too.
  if (car.heat > COOL_FROM && throttle > 0 && !backingOut) {
    const hot = clamp((car.heat - COOL_FROM) / (1 - COOL_FROM), 0, 1);
    throttle = Math.min(throttle, 1 - (1 - COOL_PEDAL) * hot);
  }

  // THE LEAN. Last, because it is the one thing on this list that is not
  // about getting round the road: it goes on top of whatever the hands were
  // already doing, and only while there is a car there to lean on and the
  // wheels are on the ground to do it with.
  if (near.shove !== 0 && !car.airborne && !backingOut) {
    steer = clamp(steer + near.shove, -1, 1);
  }

  // Manual box: shift by the same speed thresholds the auto box uses.
  let shiftUp = false;
  let shiftDown = false;
  if (car.gearbox === "manual") {
    const top = state.spec.gearTop;
    if (car.gear < top.length - 1 && car.u > top[car.gear] * TUNING.gearbox.upAt) shiftUp = true;
    else if (car.gear > 0 && car.u < top[car.gear - 1] * TUNING.gearbox.downAt) shiftDown = true;
  }

  return { steer, throttle, brake, handbrake, shiftUp, shiftDown, reset };
}

// ── THE OTHER CARS ────────────────────────────────────────────────────────
// Everything above drives a ROAD. This is the part that drives a RACE: what
// the bot does about the car it has caught, and about the one that has
// caught it.
//
// The traffic is FED, never found. `botInput` is handed the cars near enough
// to matter and reads three numbers off each; it never looks anything up, it
// never learns what the thing beside it is, and with an empty list it
// produces exactly the input it always did — which is what keeps `make sim`'s
// tables comparable across a change to this file.
//
// Two knobs shape it, and neither is a skill axis (skill.ts) on purpose:
// neither one is monotone in pace, and a crew who reaches the finish having
// put three cars in the trees is not a better DRIVER than one who went round
// them. They are temperament, so they come off the crew rather than off the
// difficulty's budget (rivals.ts).
//
//   OVERTAKE is how hard they go for the move: how close they run alongside,
//   and how long they will sit in somebody's dust before deciding the gap in
//   front of them is good enough.
//
//   AGGRESSION is what they are prepared to do to the car once they are
//   there. Under `AGGRO.clean` they leave a car's width of air and lift
//   rather than touch anybody. Past it the air comes out of the gap and they
//   lean on whatever is beside them. Past `AGGRO.dirty` they are not passing
//   cars any more, they are removing them: they lean hardest where the verge
//   is nearest, and they will take the hit at the REAR QUARTER, because a
//   sideways shove behind another car's centre is what puts it round.
