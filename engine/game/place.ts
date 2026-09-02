// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PLACING A RUN AT A MOMENT instead of driving to it. A results card only
// exists once a stage has been driven end to end, a retirement only once
// the engine has been killed, and a screenshot of either used to cost the
// whole drive — ten minutes of software rendering for a frame of a card.
// This module stands the run where the drive would have left it: the car
// on the road at an arc position, at pace, with the clock, the progress,
// the split boards and the lap book all reading as though it had driven
// there.
//
// THE MOMENT ITSELF IS STILL THE ENGINE'S TO EMIT. A finish placement
// stands the car a metre and a half short of the gate, at speed, and the
// next `step` drives it through the line and fires `finish` the way every
// finish fires; a retirement stands it at rest with a dead engine, and the
// next `step` retires it. Nothing here sets `finished` or `retired` by
// hand, because everything downstream — the card, the salute, the field's
// run-out, the campaign's book — hangs off the events, and a phase written
// without its event is a card nobody put up. Place, then step.
//
// Nothing random is drawn: a placed run is as deterministic as a driven
// one, so a placed moment reproduces from its URL exactly as a driven
// frame reproduces from its seed.

import { finishAt, finishIndex, type Track } from "../mapgen/index.ts";
import { warn } from "../output.ts";
import { TUNING as T } from "./defs/tuning.ts";
import { stillCar, WHEEL_PARTS, type GameState, type RetireReason } from "./state.ts";
import { locatePoint } from "./track.ts";

/** Where on the run to stand the car.
 *
 * `racing` is the stage in progress: the car on the road at `s` metres
 * along it (the start line by default), on the first lap, at pace.
 *
 * `finish` is one step short of the line, on the last lap, every board
 * taken: the next `step` crosses it.
 *
 * `retire` is a car that is never going to move again — the engine dead
 * or two wheels gone (`reason`, the engine by default) — stood at `s` at
 * rest, so the next `step` retires it where it stands.
 *
 * `time` is the race clock the moment is stood at, seconds; left out, it is
 * written from the road covered at `PLACE_PACE`. `speed` is how fast the
 * car is going when it is put down, m/s (`PLACE_SPEED`); a retirement is
 * always at rest. */
export type RunMoment =
  | { at: "racing"; s?: number; time?: number; speed?: number }
  | { at: "finish"; time?: number; speed?: number }
  | { at: "retire"; reason?: RetireReason; s?: number; time?: number };

/** The pace a placed clock is written from when the moment names no time,
 * m/s — a plausible stage average rather than anybody's actual one. It
 * decides how a placed finish reads against the field (a rival's real
 * time is a real time) and how long the run-out gives the stragglers
 * (`settleLimit` is a multiple of the player's), so it is a middling
 * number on purpose: a placed time that beat every crew would photograph
 * a card that always says STAGE CLEAR. */
const PLACE_PACE = 22;

/** How fast the car is going when it is put down on the road, m/s — rally
 * pace, so a placed finish is a FLYING finish with a roll-out to coast
 * down and a placed mid-stage frame is a car being driven, not parked. */
const PLACE_SPEED = 30;

/** How far short of the finish gate a finish placement stands the car, m.
 * Far enough that the gate is crossed by a MOVE the line test can see
 * (`crossedFinish` reads the step's before and after), near enough that
 * it happens within a handful of steps at `PLACE_SPEED`. */
const SHORT_OF_LINE = 1.5;

/** The sample nearest arc position `s`. A search rather than `s / step`:
 * sample spacing is only approximately the step, and the slack adds up to
 * metres over a long stage (see `finishIndex`). */
function sampleAt(track: Track, s: number): number {
  const samples = track.samples;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s < s) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && s - samples[lo - 1].s < samples[lo].s - s) return lo - 1;
  return lo;
}

/** The gear a car doing `speed` would be in: the lowest whose top covers
 * it, or the top gear past the last one. */
function gearFor(state: GameState, speed: number): number {
  const tops = state.spec.gearTop;
  for (let g = 0; g < tops.length; g++) if (tops[g] >= speed) return g;
  return tops.length - 1;
}

/** Stand the run at `moment`. Returns the seconds of sim the run's clock
 * jumped — what everything else on the road owes to stay in step with it
 * (`placeField` in sim/field.ts), exactly as `skipIntro` reports its own
 * jump. Zero, and nothing moved, on a run that is already over or a moment
 * the stage cannot hold (a finish on an endless stage). */
export function placeRun(state: GameState, moment: RunMoment): number {
  // Past the line is past placing: the clock has stopped, the card is up,
  // and a run stood back on the road behind it would be two runs.
  if (state.phase === "rollout" || state.phase === "finished" || state.phase === "retired") {
    warn(`Stage ${state.seed}: cannot place a run that is already over`);
    return 0;
  }
  const track = state.track;
  const gateS = finishAt(track);
  if (moment.at === "finish" && gateS === null) {
    warn(`Stage ${state.seed}: an endless stage has no finish to place at`);
    return 0;
  }
  const car = state.car;
  const was = state.t;

  // WHERE. The finish stands the car short of the gate's own sample; the
  // other two stand it ON the sample nearest `s`, held back from the gate
  // so a car placed "at the end" still has a line to cross.
  const index =
    moment.at === "finish"
      ? finishIndex(track)
      : sampleAt(
          track,
          Math.max(
            0,
            Math.min(moment.s ?? 0, gateS === null ? Infinity : gateS - SHORT_OF_LINE * 2),
          ),
        );
  const short = moment.at === "finish" ? SHORT_OF_LINE : 0;
  const sample = track.samples[index];
  car.x = sample.x - Math.sin(sample.heading) * short;
  car.z = sample.z - Math.cos(sample.heading) * short;
  car.y = sample.elevation;
  car.heading = sample.heading;
  stillCar(car);
  car.airTime = 0;

  // HOW FAST. A retirement is at rest by definition — the retire rule waits
  // for the car to stop. Everything else is a car being driven, in the gear
  // it would be in.
  const speed = moment.at === "retire" ? 0 : Math.max(0, moment.speed ?? PLACE_SPEED);
  car.u = speed;
  car.gear = gearFor(state, speed);
  car.rev = Math.min(T.revs.limiter, speed / state.spec.gearTop[car.gear]);
  state.stats.topSpeed = Math.max(state.stats.topSpeed, speed);
  if (moment.at === "retire") {
    if ((moment.reason ?? "engine") === "engine") car.damage.systems.engine = 1;
    else {
      // Two wheels off the same axle: the front pair, in `WHEEL_PARTS`
      // order, torn off and on the road behind the car.
      for (const wheel of [0, 1]) {
        car.damage.wheels[wheel] = 1;
        if (!car.damage.broken.includes(WHEEL_PARTS[wheel])) {
          car.damage.broken.push(WHEEL_PARTS[wheel]);
        }
      }
    }
    car.damage.version += 1;
  }

  // THE ROAD COVERED, and the clock it took. On a circuit the finish is the
  // LAST crossing of the line, so the distance is every lap; a mid-stage
  // moment is on the first lap. The time is proportional along the whole of
  // it, which is what every split and every lap is written from.
  const lapS = gateS ?? sample.s;
  const lap = moment.at === "finish" ? state.laps : 1;
  const here = moment.at === "finish" ? (gateS ?? 0) : sample.s;
  const covered = lapS * (lap - 1) + here;
  const time = Math.max(state.raceTime, moment.time ?? covered / PLACE_PACE);
  const clockAt = (distance: number): number => (covered > 0 ? (time * distance) / covered : 0);

  // R22 — the lap book: every lap before this one, and where this one began.
  state.lap = lap;
  state.lapTimes = [];
  for (let l = 1; l < lap; l++) state.lapTimes.push(clockAt(lapS * l) - clockAt(lapS * (l - 1)));
  state.lapStart = clockAt(lapS * (lap - 1));
  // R28 — every board behind the car, on every lap driven, in the order
  // they were driven through; the times run on across the laps exactly as
  // a driven run's do.
  state.checkpointTimes = [];
  for (let l = 1; l < lap; l++) {
    for (const board of track.checkpoints)
      state.checkpointTimes.push(clockAt(lapS * (l - 1) + board.s));
  }
  let passed = 0;
  for (const board of track.checkpoints) {
    if (board.s > here) break;
    state.checkpointTimes.push(clockAt(lapS * (lap - 1) + board.s));
    passed += 1;
  }
  state.checkpointsPassed = passed;

  // THE FIX: where the car actually stands against the samples, so the
  // next step's search starts from the truth rather than from the grid.
  const fix = locatePoint(track, car.x, car.z, index);
  state.progressIndex = fix.index;
  state.nearIndex = fix.index;
  state.progressS = track.samples[fix.index].s;
  state.lateral = 0;
  state.offRoad = false;
  state.lost = false;
  state.wrongWay = false;
  state.wrongWayFor = 0;
  state.wrongWayAt = fix.index;
  state.surface = sample.surface;
  state.drowning = null;
  // R27 — the crowd behind the car has been passed, not skipped: nobody
  // cheers on the first step for every stand between here and the line.
  state.cheeredS = state.progressS;

  // THE CLOCK. Out of the start control if the run was still in it — the
  // lights went out `time` seconds ago — and then on to the moment. Sim
  // time moves by exactly what the race clock did, so a run that skipped
  // its countdown and one that sat through it both land with the same
  // race time and their own sim time.
  if (state.phase !== "racing") {
    state.t = T.intro + T.countdown;
    state.phase = "racing";
  }
  state.t += time - state.raceTime;
  state.raceTime = time;
  state.stuck = { x: car.x, z: car.z, since: state.t };
  return state.t - was;
}
