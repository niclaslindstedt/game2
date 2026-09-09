// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE BOT DOES ABOUT THE OTHER CARS. Reading the road it is on is
// `bot.ts`'s; this is everything about sharing it — the car ahead, the
// gap to it, whether there is room to go round and which side, when to
// lift instead, and how much of a shove a rival is worth at this
// aggression. The start is here too, because a grid is the one moment the
// whole field is a traffic problem and nothing else.

import { clamp } from "../lib/math.ts";
import { TUNING } from "../game/defs/tuning.ts";
import type { CarInput, GameState } from "../game/state.ts";

import { BROW_BAND, BROW_FROM, BROW_LOOK, type BotProfile } from "./bot.ts";

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
export const NO_TRAFFIC: readonly TrafficCar[] = [];

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
export function readTraffic(
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

// THE GRID RITUAL — what a crew does with the throttle while the lights are
// still up.
//
// Nothing a car does on the grid moves it (`step.ts`), so the whole start
// control is one pedal and one needle. A bot that simply drove — which is
// what a corner plan does with an empty road in front of it — buried the
// throttle on the first frame of the establishing shot and held it there for
// ten seconds: fourteen cars pinned flat at the limiter, every one of them
// making exactly the same noise, and every one of them dropping the clutch
// on a full flywheel.
//
// A driver waiting for a green does not do that. They BLIP it — short stabs
// while there is time, longer and closer together as the lights come down,
// and then one held note they intend to leave on. That shape is the whole
// module: a square wave on the pedal, which `TUNING.revs` turns into a rev
// that climbs at `blip` and falls away at `settle`, so a stab reads as
// *brum* and a long one as *brmmmmmm* without anything here shaping a curve.
//
// It is TEMPERAMENT, and it comes off `aggression` for the same reason the
// leaning does (see THE OTHER CARS): it is not monotone in pace, so no skill
// axis can own it. A calm crew feathers it and waits; a wild one buries it,
// blips it oftener, and sits on the limiter at the green. And that last part
// is not decoration — `clutchDump` reads the revs the drop lands on, so a
// crew that spends the countdown screaming genuinely leaves on lit tyres and
// a crew that waits genuinely drives away. Whoever is hardest on the field
// is hardest on their own start line too.
const GRID = {
  /** Seconds before the green the ritual starts. Under the whole start
   * control (`TUNING.intro + countdown`), because a crew that began revving
   * on the first frame of the establishing shot would have nothing left to
   * build toward — the beats before this one are the field WAITING. */
  from: 8,
  /** ...and the seconds of it spent on one held note. Long enough that the
   * revs actually reach the launch figure below from wherever the last blip
   * left them (`TUNING.revs.settle` is 3.4/s, so a second covers the whole
   * range), which is what stops the drop landing on an arbitrary point of
   * the last blip — a start-line lottery rather than a character. */
  hold: 1,
  /** Blips per second at the top of the ritual and by the last one. They
   * accelerate rather than tick: the rate is read as a ramp and integrated
   * to the phase, so no blip is ever cut in half by the ramp moving. */
  rate: { first: 0.5, last: 1.6 },
  /** How much of a cycle the pedal is DOWN, first blip to last. A quarter is
   * a stab that is gone as soon as it arrives; two thirds is a note being
   * held. This is the whole of *brum* → *brmmmmmm*. */
  open: { first: 0.26, last: 0.7 },
  /** How far the pedal goes, for the mildest crew in the field and for the
   * one with the reputation. The calm end is deliberately over the fumes'
   * own floor (`EXHAUST.rev.from`) and under the body's tremble threshold
   * (`SHAKE.from` in car-shake.ts): the quiet crews smoke a little and sit
   * still, and what shakes on the line is the crews with something to
   * prove. */
  depth: { calm: 0.55, wild: 1 },
  /** How much of that depth the FIRST blip gets, 0..1 — the rest arrives
   * as the green does. A ritual that opened at full depth would have
   * nowhere to build. */
  warm: 0.55,
  /** ...and the same idea on the rate: what the blip count is multiplied by
   * at either end of the temper. A crew with a temper is not merely revving
   * harder, they are revving MORE. */
  eager: { calm: 0.7, wild: 1.35 },
  /** The held note the clutch comes out on, calm crew to wild one. Nobody
   * launches at idle, so the calm end is still a car sitting ready — but it
   * is only a little over `TUNING.engine.dumpFrom` (the most revs a drop
   * costs nothing at), so the mild crews pay a fraction of the penalty and
   * drive cleanly away. The wild end is the limiter: lit tyres, a cloud of
   * smoke, and a couple of car lengths handed to everybody who waited. */
  launch: { calm: 0.5, wild: 1 },
} as const;

/** Read one number off two: what fraction of the way from `a` to `b` `at`
 * is, as a plain lerp. Used enough below to be worth a name. */
export function mix(a: number, b: number, at: number): number {
  return a + (b - a) * at;
}

/** THE PEDAL ON THE GRID, 0..1 — `left` seconds before the green, for a crew
 * of this `aggression`, `phase` of a blip out of step with its neighbours.
 *
 * Exported because it is the one part of the bot with no road in it: a test
 * can drive the whole ritual without compiling a stage, and the shape is
 * worth asserting (a calm crew never reaches a wild one's depth; every crew
 * ends on a held note; nobody revs before `GRID.from`). */
export function gridRev(left: number, aggression: number, phase: number): number {
  const temper = clamp(aggression, 0, 1);
  // The last beat: one note, held, and the revs the clutch comes out on.
  if (left <= GRID.hold) return mix(GRID.launch.calm, GRID.launch.wild, temper);
  if (left >= GRID.from) return 0;

  // Seconds into the blipping, and how far through it that is.
  const span = GRID.from - GRID.hold;
  const t = GRID.from - left;
  const urgency = clamp(t / span, 0, 1);

  // Which blip, and how far into it. The rate ramps linearly over the span,
  // so the phase is its integral — a quadratic, which keeps the blips
  // accelerating smoothly instead of jumping whenever the rate is re-read.
  const eager = mix(GRID.eager.calm, GRID.eager.wild, temper);
  const cycles =
    eager * (GRID.rate.first * t + ((GRID.rate.last - GRID.rate.first) * t * t) / (2 * span)) +
    phase;
  const into = cycles - Math.floor(cycles);
  // Off the pedal: the flywheel is what makes the sound of a blip, and it
  // needs the gap to fall through.
  if (into >= mix(GRID.open.first, GRID.open.last, urgency)) return 0;
  return mix(GRID.depth.calm, GRID.depth.wild, temper) * mix(GRID.warm, 1, urgency);
}

/** The whole of what a bot does with a car it cannot move: a pedal, and
 * nothing else touched. */
export function gridInput(throttle: number): CarInput {
  return {
    steer: 0,
    throttle,
    brake: 0,
    handbrake: false,
    shiftUp: false,
    shiftDown: false,
    reset: false,
  };
}

/** THE BROW the road ahead will throw the car over at this pace, 0..1. The
 * road's vertical curvature over `air.crestSpan` — the baseline `car.ts`
 * judges a crest on, so the two agree on what a brow is — read over the
 * next `BROW_LOOK` seconds of travel and turned into the pull the ground
 * would need to keep the car on it (`pace²·curvature`) against what it CAN
 * hold (`air.hold` of gravity). The steepest brow in reach is the answer.
 * A circuit's samples wrap; a stage's stop at the finish. */
export function browAhead(
  elevation: Float64Array,
  arc: Float64Array,
  from: number,
  count: number,
  circuit: boolean,
  step: number,
  pace: number,
): number {
  if (pace < TUNING.air.crestSpeed) return 0;
  const hold = TUNING.air.hold * TUNING.air.gravity;
  const span = Math.max(1, Math.round(TUNING.air.crestSpan / step));
  const reach = Math.ceil((pace * BROW_LOOK) / step);
  const wrap = (i: number): number =>
    circuit ? ((i % count) + count) % count : clamp(i, 0, count - 1);
  let worst = 0;
  for (let ahead = 0; ahead <= reach; ahead++) {
    const i = wrap(from + ahead);
    const back = wrap(i - span);
    const fwd = wrap(i + span);
    // The samples sit `step` apart, so the baseline is the span except
    // where a stage's end has clamped it short (a circuit has no end).
    const behind = circuit ? span * step : arc[i] - arc[back];
    const before = circuit ? span * step : arc[fwd] - arc[i];
    if (behind < 1e-6 || before < 1e-6) continue;
    const rise = (elevation[fwd] - elevation[i]) / before;
    const fall = (elevation[i] - elevation[back]) / behind;
    const curvature = (2 * (rise - fall)) / (behind + before);
    // A crest is the road falling away: negative curvature, positive pull.
    const pull = -pace * pace * curvature;
    const share = clamp((pull / hold - BROW_FROM) / BROW_BAND, 0, 1);
    if (share > worst) worst = share;
    if (worst >= 1) break;
  }
  return worst;
}
