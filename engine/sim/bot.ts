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
import { TUNING } from "../game/defs/tuning.ts";
import type { CarSpec } from "../game/defs/cars.ts";
import { flatTrack, SURFACES, type Track } from "../mapgen/index.ts";
import type { CarInput, GameState } from "../game/state.ts";

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
  /** How much of the car's OWN lateral grip the bot plans corners around.
   * Over 1 on purpose: a rally driver arrives past what the tires can hold
   * and lets the slide carry the nose round, so a bot that plans under the
   * ceiling never drifts a corner — it only ever flicks the handbrake. */
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
   * at. A car that rotates more than this is trusted with proportionally
   * more of it, one that rotates less with less. */
  rotationRef: number;
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
};

/** The default rally brain: quick hands, plans ~3 s ahead, drifts hairpins. */
export const RALLY_BOT: BotProfile = {
  latFraction: 0.7,
  steerGain: 2.2,
  lookahead: 0.65,
  planHorizon: 3.0,
  hardCurvature: 1 / 30,
  hotEntry: 2.5,
  rotationRef: 2.5,
  brakeMargin: 2.5,
  brakeUse: 0.7,
  reverseAfter: 0.8,
  reverseSpeed: 4,
  offRoadGiveUp: 8,
  overtake: 0.6,
  aggression: 0.15,
};

/** The lateral grip multiplier this car has on each surface, by surface
 * code — the surface's own times the rubber the car sits on, exactly as the
 * handling model reads it (car.ts). The bot plans corners off this, so the
 * catalog's tires are felt as PACE and not merely as a number nobody
 * drives.
 *
 * Resolved once per car rather than per sample: the corner scan below asks
 * for it dozens of times on every one of a run's 120 steps a second, and
 * the answer only depends on the car's rubber. */
const GRIP_BY_CAR = new WeakMap<CarSpec, readonly number[]>();

function gripBySurface(spec: CarSpec): readonly number[] {
  let grip = GRIP_BY_CAR.get(spec);
  if (grip) return grip;
  const tyres = spec.tyres;
  grip = SURFACES.map(
    (kind) => TUNING.surfaces.grip[kind] * (kind === "asphalt" ? tyres.sealed : tyres.loose),
  );
  GRIP_BY_CAR.set(spec, grip);
  return grip;
}

/** Compute this step's input for the current state. Pure and stateless —
 * everything the bot knows is in the GameState and in `traffic`, which is
 * the other cars near enough to matter, handed in by whoever is running the
 * field. An empty list is a stage driven alone, and produces exactly the
 * input a bot with no eyes for traffic always produced. */
export function botInput(
  state: GameState,
  profile: BotProfile = RALLY_BOT,
  traffic: readonly TrafficCar[] = NO_TRAFFIC,
): CarInput {
  const { car, track } = state;
  /** How freely this car rotates, against the profile's reference. */
  const rotation = state.spec.driftYaw / profile.rotationRef;
  const samples = track.samples;
  const step = track.step;

  // The road as flat arrays (mapgen/flat.ts). The scan below walks dozens
  // of samples on EVERY physics step, so both the sample objects and the
  // string key into the tuning table are worth staying out of.
  const {
    curvature,
    surface,
    arc,
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
  const aim = aheadOf(track, state.progressIndex, Math.round(aheadMeters / step));
  // The road's right axis at the aim, which is its forward vector with the
  // signs swapped: (cos, -sin).
  const aimX = roadX[aim] + cosHeading[aim] * near.offset;
  const aimZ = roadZ[aim] - sinHeading[aim] * near.offset;
  const desired = Math.atan2(aimX - car.x, aimZ - car.z);
  const error = angleDiff(car.heading, desired);
  let steer = clamp(error * profile.steerGain, -1, 1);

  // Corner-speed plan: the tightest curvature over the horizon caps speed at
  // sqrt(a_lat / κ); the nearest cap that requires braking wins.
  const horizonMeters = Math.max(20, car.u * profile.planHorizon);
  const scan = Math.min(
    Math.round(horizonMeters / step),
    track.circuit ? samples.length - 1 : samples.length - 1 - state.progressIndex,
  );
  const latAccel = state.spec.gripAccel * profile.latFraction;
  let targetSpeed = state.spec.gearTop[state.spec.gearTop.length - 1];
  let hardDistance = Infinity;
  let hardCap = 0;
  const gripOf = gripBySurface(state.spec);
  const braking = 2 * state.spec.brake * profile.brakeUse;
  const hotEntry = profile.hotEntry * rotation;
  const progressS = state.progressS;
  const trackLength = track.length;
  const count = samples.length;
  const from = state.progressIndex;
  // How near a hard corner has to be before the flick below can fire. Past
  // it the scan has nothing left to learn about the handbrake, which is
  // what lets the plan stop early.
  const flickReach = Math.max(12, car.u * 0.5);
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
    // Rally style: a hard corner is entered HOT — the plan deliberately
    // carries extra speed there and the drift scrubs it, instead of braking
    // down to the geometric cap like a grip line would.
    const hard = k > profile.hardCurvature;
    // Hot entry is ADDITIVE: a fixed margin over the geometric cap. A ratio
    // would overcook exactly the tightest hairpins, where the cap is
    // smallest. How much of it a car is trusted with is its ROTATION: the
    // slide is what brings the nose round in there, so a car that rotates
    // freely can carry more in than one that pushes.
    const planCap = hard ? cap + hotEntry : cap;
    // Distance-discounted: a far corner allows more speed now than a near one.
    const allowed = Math.sqrt(planCap * planCap + braking * Math.max(0, distance - 10));
    if (allowed < targetSpeed) targetSpeed = allowed;
    if (hard && distance < hardDistance) {
      hardDistance = distance;
      hardCap = cap;
    }
    ahead += 1;
  }

  let throttle = car.u < targetSpeed ? 1 : 0;
  let brake = car.u > targetSpeed + profile.brakeMargin ? 1 : 0;

  // Drift entry: arriving hot at a hard corner, flick the handbrake to
  // rotate. While the drift runs, manage it like a driver: power through
  // the slide, breathe when the angle gets deep, and blend counter-steer
  // into the aim so the car neither spins down nor runs wide.
  const handbrake =
    !car.drifting && !car.airborne && hardDistance < flickReach && car.u > hardCap + 2;
  if (car.drifting) {
    throttle = Math.abs(car.slip) > 0.5 ? 0.5 : 1;
    brake = 0;
    // Counter-steer only once the nose is nearly where it should be —
    // mid-hairpin the aim error is huge and the car needs every bit of
    // rotation; damping there is what runs a drift wide.
    const counterWeight = clamp(1 - Math.abs(error) / 0.6, 0, 1);
    // Sideways, the aim is where the car is GOING, not where its nose is
    // pointing: hold the nose on the lookahead through a slide and the
    // velocity leaves the road by exactly the slip angle. Steering the
    // TRAVEL direction is what puts the nose the necessary few degrees
    // further into the corner — the counter-steer above still damps the
    // rotation once the nose is nearly back on line.
    const pathError = angleDiff(car.heading + car.slip, desired);
    steer = clamp(pathError * profile.steerGain + car.slip * 0.9 * counterWeight, -1, 1);
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
  if (car.airborne) {
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
  const backingOut =
    !car.airborne &&
    (wedgedFor > profile.reverseAfter || (car.reversing && car.u > -profile.reverseSpeed));
  if (backingOut) {
    throttle = 0;
    brake = 1;
    steer = 0;
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

/** Another car, as a bot sees one: no more than a driver reads out of a
 * mirror. Nothing here says whose car it is or how good they are. */
export type TrafficCar = {
  x: number;
  z: number;
  /** Their speed along their own nose, m/s. */
  u: number;
  /** Their signed offset from the road's centerline, m (positive right) —
   * which is what says how much road there is either side of them. */
  lateral: number;
};

/** A stage with nobody else on it. */
const NO_TRAFFIC: readonly TrafficCar[] = [];

/** Where a temper changes what the bot is DOING, on the 0..1 scale
 * `aggression` is quoted on. Two thresholds rather than a curve because the
 * two behaviours either side of each are different in kind, not in degree:
 * giving way is not a small amount of leaning, and passing a car is not a
 * small amount of putting it in a tree. */
const AGGRO = {
  /** Under this, no contact is ever made on purpose. */
  clean: 0.35,
  /** Over this, the car in front stops being something to get past. */
  dirty: 0.75,
} as const;

/** Distance between two centres across the road at which the bodywork
 * meets, m. */
const BODY = TUNING.collision.halfWidth * 2;

/** …and the air a clean crew leaves outside that, m. */
const PASS_AIR = 1.1;

/** How far up the road another car is worth reacting to: seconds of the
 * bot's own speed, with a floor so a crawl still sees the car in front. */
const TRAFFIC_SECONDS = 1.6;
const TRAFFIC_FLOOR = 16;

/** How far off the bot's own path a car has to be to stop being in the way,
 * m. Wider than the road is at R21's floor, so a car on the far verge of a
 * narrow stage is still somebody to plan around. */
const TRAFFIC_LANE = 6;

/** Ceiling on the aim's amplification (see `pull`). Two and a bit: enough
 * that a car half a lookahead away is actually gone round, short of the
 * lock that would put the bot itself on the verge. */
const PULL_MAX = 2.4;

/** Lock spent on a deliberate shove, at the top of the temper scale. Well
 * under full: a shove is a flick of the wrists while the car is already
 * alongside, and a bot that threw the whole wheel at it would put ITSELF
 * off the road. */
const SHOVE_LOCK = 0.45;

/** What the cars around the bot are asking of it. */
type TrafficPlan = {
  /** Metres to move the aim point off the centerline, positive right. */
  offset: number;
  /** Ceiling on the throttle this step. */
  throttle: number;
  /** Ask for the brake: the car in front is nearer than this crew is
   * prepared to arrive, and there is nowhere to go round it. */
  brake: boolean;
  /** Lock added on top of the aim — the lean, and the hit. */
  shove: number;
};

const CLEAR_ROAD: TrafficPlan = { offset: 0, throttle: 1, brake: false, shove: 0 };

/** Read the nearest car in the way and decide what to do about it. Pure: it
 * reads the state and the list, and returns numbers. */
function readTraffic(
  state: GameState,
  profile: BotProfile,
  traffic: readonly TrafficCar[],
  aheadMeters: number,
): TrafficPlan {
  const car = state.car;
  // Airborne or out in the wild, there is nothing to race: the bot has its
  // own problem, and both of those branches overwrite the hands anyway.
  if (traffic.length === 0 || car.airborne || state.offRoad) return CLEAR_ROAD;

  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const half = TUNING.collision.halfLength;
  const reach = Math.max(TRAFFIC_FLOOR, car.u * TRAFFIC_SECONDS);

  // The nearest car in the way. NEAREST rather than furthest forward: the
  // one that decides what the hands do is the one about to be touched, and
  // that can be the car alongside as easily as the one up the road.
  let range = Infinity;
  let ahead = 0;
  let theirLateral = 0;
  let theirSpeed = 0;
  for (let i = 0; i < traffic.length; i++) {
    const other = traffic[i];
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    // The bot's own frame: forward is (sin h, cos h), right is (cos h, −sin h).
    const along = dx * sinH + dz * cosH;
    if (along < -half * 2 || along > reach) continue;
    const across = dx * cosH - dz * sinH;
    if (across > TRAFFIC_LANE || across < -TRAFFIC_LANE) continue;
    const at = along < 0 ? -along : along;
    if (at >= range) continue;
    range = at;
    ahead = along;
    theirLateral = other.lateral;
    theirSpeed = other.u;
  }
  if (range === Infinity) return CLEAR_ROAD;

  const aggression = clamp(profile.aggression, 0, 1);
  const overtake = clamp(profile.overtake, 0, 1);
  // Is the move still being SET UP, or are the two already level? Almost
  // everything below reads differently either side of that line.
  const setup = ahead > half * 2;
  const road = state.track.width / 2;
  // Clean road outside them, each side.
  const roomRight = road - theirLateral;
  const roomLeft = road + theirLateral;
  // WHICH SIDE THE MOVE GOES DOWN. The side the bot is already on, first and
  // always: a move that starts by crossing the car it is passing is not a
  // move, it is a shunt, and no amount of temper makes it a better one. Only
  // when that side has no road on it does the bot come back across, and then
  // it does it from behind, where there is room to.
  const mine = state.lateral >= theirLateral ? 1 : -1;
  const room = mine > 0 ? roomRight : roomLeft;
  const dir = setup && room < BODY ? -mine : mine;

  // How far apart the two centres are aimed to end up. A clean crew leaves
  // a car's width of air; the temper eats it, and past `AGGRO.clean` eats
  // into the bodywork — an aim only the contact model can stop, which is
  // exactly what leaning on somebody is. A crew going for the move runs
  // closer than one thinking about it.
  const air = PASS_AIR * (1 - 0.4 * overtake);
  const clearance =
    aggression < AGGRO.clean
      ? // Under the threshold the temper only eats the AIR: at zero there is
        // a car's width of it, and at `AGGRO.clean` exactly none, which is
        // two cars alongside each other not touching.
        BODY + air * (1 - aggression / AGGRO.clean)
      : // Over it, the aim eats into the bodywork — a target only the contact
        // model can stop, which is what leaning on somebody IS. It stops well
        // short of their far side: an aim through the middle of another car is
        // not a nastier move, it is a bot that drives into the back of
        // everybody and stops.
        BODY * (1 - 0.55 * ((aggression - AGGRO.clean) / (1 - AGGRO.clean)));
  // …and the aim that puts them there. The aim point sits a lookahead down
  // the road and the car being passed is usually a fraction of that away, so
  // an offset applied at the aim only moves the car a fraction of it by the
  // time the two are level. Scale it up by the ratio so the PASS is the
  // clearance rather than the aim, capped: a bot that answered a car in its
  // own bumper with an unbounded offset would leave the road to avoid it.
  //
  // Only while the move is still being SET UP. Once the two are alongside
  // the bot is already where it wanted to be, and an aim that kept pulling
  // wide from there would drag it off the car it has just drawn level with
  // — and, for a crew with a temper, straight back out of the lean.
  const pull = setup ? clamp(aheadMeters / Math.max(ahead, half * 2), 1, PULL_MAX) : 1;
  // Kept on the road either way — a pass that ends with the bot on the
  // verge is not one.
  const edge = road - BODY * 0.5;
  const offset = clamp(theirLateral + dir * clearance * pull, -edge, edge);

  // DOES THE MOVE FIT? Only if the aim actually ends up the clearance away
  // from them; clamped back onto the road, it often does not, and a crew
  // that will not touch anybody has to do something else about that.
  const apart = offset - theirLateral;
  const fits = (apart < 0 ? -apart : apart) >= clearance - 0.05;

  let throttle = 1;
  let brake = false;
  if (!fits && aggression < AGGRO.clean && ahead > 0) {
    // Nowhere to go, and not the sort to make somewhere: sit in behind at
    // their pace until the road opens. A committed crew sits closer to the
    // back of them than a patient one does.
    const gap = ahead - half * 2;
    const hold = 2 + 8 * (1 - overtake);
    if (gap < hold && car.u > theirSpeed) throttle = 0;
    if (gap < hold * 0.35 && car.u > theirSpeed + 1) brake = true;
  }

  // THE SHOVE. Two of them, and the difference is where the bot's nose is
  // when it comes across:
  //
  //   ALONGSIDE — doors level — it is a LEAN, and it sends them toward
  //   whatever is on their far side.
  //
  //   AT THE REAR QUARTER — the bot's nose level with their back axle — it
  //   is a spin. The contact model turns a sideways impulse into yaw by how
  //   far ahead of the struck car's centre it lands (collision.ts), so a
  //   shove behind theirs puts them round rather than sideways. It costs
  //   the bot the pass it was halfway through, which is why only the crews
  //   past `AGGRO.dirty` think it is worth doing.
  let shove = 0;
  const alongside = range < half;
  const quarter = ahead >= half && ahead < half * 2.4;
  if (aggression >= AGGRO.clean && (alongside || (quarter && aggression >= AGGRO.dirty))) {
    // How little road the other car has on the side a shove would send them
    // to. There is nothing to be won leaning on somebody in the middle of a
    // wide road and everything to be won doing it where the trees start, so
    // the same temper presses hardest exactly where it costs them most.
    const escape = dir > 0 ? roomLeft : roomRight;
    const bite = clamp(1 - escape / road, 0, 1);
    const temper = clamp((aggression - AGGRO.clean) / (1 - AGGRO.clean), 0, 1);
    // Never nothing: past `AGGRO.clean` the crew has decided the car beside
    // it is in the way, and the lightest version of that is still a nudge.
    // A pass is over in about half a second, so a lean that ramped from zero
    // would be a lean nobody ever felt.
    shove = -dir * SHOVE_LOCK * (0.35 + 0.65 * temper) * (0.55 + 0.45 * bite);
  }

  return { offset, throttle, brake, shove };
}
