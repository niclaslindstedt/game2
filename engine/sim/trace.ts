// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RUN TRACE — a crew's whole stage written down before the green, and
// read back by the clock.
//
// The campaign's rivals never meet anybody (field.ts, `contact: false`): a
// crew drives its stage alone, blind to the player and to the rest of the
// entry list, so its run is a pure function of the seed, the car and the
// profile — and a pure function can be computed once, in advance, and
// merely LOOKED UP for the rest of the race. That is what this module is.
// The real bot drives the real engine to the line (or the retirement), and
// what it did is kept as:
//
//   SAMPLES  the pose the world reads — where the car is, which way it
//            points, how it sits on its springs, what the needle says —
//            once every `TRACE_EVERY` steps, in one flat Float32Array.
//            Between samples the pose is interpolated, which at thirty a
//            second is smoother than any display the game runs on.
//   EVENTS   every event the run emitted, with the step it happened on. The
//            boards and the line for the classification; the impacts and
//            the parts coming off for the body being drawn.
//   MARKS    the damage ledger, cloned each time it changed. A rival that
//            met a tree a minute up the road is folded when you pass it,
//            and pristine while it was still ahead of the tree.
//
// Playback writes those back into a SHOWN `GameState` — a shallow copy of
// the sim's, with its own car — so everything that reads a rival (the
// renderer, the results, a spectator's HUD) reads the same shape it always
// did. What the pose does not carry (`vy`, the springs' rates, the launch
// spin, the alerts) reads whatever the sim's own state ended at, which is
// nothing the road ever shows.
//
// WHY NOT KEEP STEPPING THEM. A live field costs about a percent of a frame
// for fourteen cars and was never the phone's problem — the draw calls are
// — but a race that can be looked up costs nothing during the race, and
// the seconds it costs instead are spent under the establishing shot, or
// in a loading beat before the lights (App.tsx) when the shot was not long
// enough. The one thing a trace cannot do is answer for a car that was not
// there when it was recorded, which is exactly why it is only ever used on
// a field nothing can touch.

import { TUNING } from "../game/defs/tuning.ts";
import type { CarDamage, GameEvent, GamePhase, GameState } from "../game/state.ts";
import { blowWind } from "../game/step.ts";
import { angleDiff, clamp, lerp } from "../lib/math.ts";

/** Steps between two samples. Four at 120 Hz is thirty a second: a car
 * passing at 30 m/s moves a metre between samples, and a straight line
 * across a metre of a rally car's path is not something a frame can see. A
 * medium stage's fourteen crews come to a few megabytes at this rate; every
 * step would be four times that for nothing. */
export const TRACE_EVERY = 4;

/** The floats of one sample, by column. Everything the field's renderer,
 * the classification and a spectator's instruments read off a rival's car
 * — and nothing else, because every column is paid for fourteen times over
 * on every sample of every stage. */
const X = 0;
const Z = 1;
const Y = 2;
const HEADING = 3;
const U = 4;
const W = 5;
const ROLL = 6;
const PITCH = 7;
const PITCH_LOAD = 8;
const RIDE = 9;
const LOFT = 10;
const REV = 11;
const WHEELSPIN = 12;
const SLIDE = 13;
const STEER = 14;
const PROGRESS = 15;
const RACE_TIME = 16;
/** …and the one packed word: gear, surface, phase, lap and the flags. */
const BITS = 17;
const STRIDE = 18;

/** How the packed word is laid out, low bits first. */
const GEAR_BITS = 4;
const SURFACE_BITS = 3;
const PHASE_BITS = 3;
const LAP_BITS = 8;
const SURFACE_SHIFT = GEAR_BITS;
const PHASE_SHIFT = SURFACE_SHIFT + SURFACE_BITS;
const LAP_SHIFT = PHASE_SHIFT + PHASE_BITS;
const FLAG_SHIFT = LAP_SHIFT + LAP_BITS;
const AIRBORNE = 1 << 0;
const DRIFTING = 1 << 1;
const BRAKING = 1 << 2;
const LOCKED = 1 << 3;
const REVERSING = 1 << 4;
const SETTLING = 1 << 5;
const ROLLING = 1 << 6;
const SPUN = 1 << 7;
const SLIDING = 1 << 8;

/** The surfaces, numbered. A `Record` over the state's own union so a new
 * surface fails to compile here rather than silently reading as gravel. */
const SURFACE_INDEX: Record<GameState["surface"], number> = {
  gravel: 0,
  sand: 1,
  asphalt: 2,
  water: 3,
  nature: 4,
};
const SURFACES = Object.keys(SURFACE_INDEX) as GameState["surface"][];
const PHASES: GamePhase[] = ["intro", "countdown", "racing", "rollout", "finished", "retired"];
const PHASE_INDEX: Record<GamePhase, number> = {
  intro: 0,
  countdown: 1,
  racing: 2,
  rollout: 3,
  finished: 4,
  retired: 5,
};

/** Samples the buffer is first sized for. Doubled as the run outgrows it,
 * so a stage costs a handful of copies rather than one per second. */
const FIRST_SAMPLES = 2048;

/** One event, and the step of the crew's own run it happened on. */
export type TracedEvent = { step: number; event: GameEvent };

/** The damage ledger as it stood from `step` on. */
export type DamageMark = { step: number; damage: CarDamage };

export type RunTrace = {
  floats: Float32Array;
  /** The same buffer, read as words, for the `BITS` column. */
  bits: Uint32Array;
  /** Samples written so far. */
  samples: number;
  /** Steps of the run recorded so far — the sim's own step count. */
  steps: number;
  /** The run is over: across the line, retired, or out of time (`cap`).
   * Nothing is ever recorded past this. */
  sealed: boolean;
  /** Steps the run is given before it is sealed where it stands. */
  cap: number;
  events: TracedEvent[];
  marks: DamageMark[];
  /** The damage version the last mark was taken at. */
  version: number;
};

/** Where one playback has got to in a trace: the next event and the next
 * mark still to be handed out. A trace has one reader, but the cursors are
 * the reader's and not the recording's. */
export type Playback = { event: number; mark: number };

export function createPlayback(): Playback {
  return { event: 0, mark: 0 };
}

/** A copy of the ledger nothing will write to again. */
export function cloneDamage(damage: CarDamage): CarDamage {
  return {
    zones: [...damage.zones],
    belly: damage.belly,
    roof: damage.roof,
    wear: damage.wear,
    systems: { ...damage.systems },
    wheels: [...damage.wheels],
    broken: [...damage.broken],
    version: damage.version,
  };
}

/** THE SHOWN STATE for a traced run: the sim's, shallow, with a car of its
 * own to be posed and its own lap and board books to be filled as the clock
 * passes them. Everything else — the track, the terrain, the spec, the
 * conditions — is shared read-only with the sim and with the player. */
export function shadowState(sim: GameState): GameState {
  return {
    ...sim,
    car: { ...sim.car, damage: cloneDamage(sim.car.damage) },
    wind: { ...sim.wind },
    checkpointsPassed: 0,
    checkpointTimes: [],
    lapTimes: [],
    lapStart: 0,
    lap: 1,
  };
}

/** Start a trace on a run that has not taken a step: sample 0 is the car
 * where it was entered. */
export function createTrace(sim: GameState, cap: number): RunTrace {
  const buffer = new ArrayBuffer(FIRST_SAMPLES * STRIDE * 4);
  const trace: RunTrace = {
    floats: new Float32Array(buffer),
    bits: new Uint32Array(buffer),
    samples: 0,
    steps: 0,
    sealed: false,
    cap,
    events: [],
    marks: [],
    version: sim.car.damage.version,
  };
  sample(trace, sim);
  return trace;
}

function sample(trace: RunTrace, sim: GameState): void {
  if (trace.samples * STRIDE >= trace.floats.length) {
    const grown = new ArrayBuffer(trace.floats.byteLength * 2);
    const floats = new Float32Array(grown);
    floats.set(trace.floats);
    trace.floats = floats;
    trace.bits = new Uint32Array(grown);
  }
  const car = sim.car;
  const f = trace.floats;
  const i = trace.samples * STRIDE;
  f[i + X] = car.x;
  f[i + Z] = car.z;
  f[i + Y] = car.y;
  f[i + HEADING] = car.heading;
  f[i + U] = car.u;
  f[i + W] = car.w;
  f[i + ROLL] = car.roll;
  f[i + PITCH] = car.pitch;
  f[i + PITCH_LOAD] = car.pitchLoad;
  f[i + RIDE] = car.ride;
  f[i + LOFT] = car.loft;
  f[i + REV] = car.rev;
  f[i + WHEELSPIN] = car.wheelspin;
  f[i + SLIDE] = car.slide;
  f[i + STEER] = car.steer;
  f[i + PROGRESS] = sim.progressS;
  f[i + RACE_TIME] = sim.raceTime;
  let flags = 0;
  if (car.airborne) flags |= AIRBORNE;
  if (car.drifting) flags |= DRIFTING;
  if (car.braking) flags |= BRAKING;
  if (car.locked) flags |= LOCKED;
  if (car.reversing) flags |= REVERSING;
  if (car.settling) flags |= SETTLING;
  if (car.rolling) flags |= ROLLING;
  if (car.sliding) flags |= SLIDING;
  if (car.spun) flags |= SPUN;
  trace.bits[i + BITS] =
    (clamp(car.gear, 0, (1 << GEAR_BITS) - 1) |
      (SURFACE_INDEX[sim.surface] << SURFACE_SHIFT) |
      (PHASE_INDEX[sim.phase] << PHASE_SHIFT) |
      (clamp(sim.lap, 0, (1 << LAP_BITS) - 1) << LAP_SHIFT) |
      (flags << FLAG_SHIFT)) >>>
    0;
  trace.samples += 1;
}

/** Write down one step the sim has just taken, and the events it emitted.
 * Called after EVERY step, whether or not this one is sampled: the events
 * and the ledger are booked to the step, and the run's end is read off the
 * events. Nothing is recorded once the trace is sealed. */
export function recordStep(trace: RunTrace, sim: GameState, events: readonly GameEvent[]): void {
  if (trace.sealed) return;
  trace.steps += 1;
  const step = trace.steps;
  if (step % TRACE_EVERY === 0) sample(trace, sim);
  if (sim.car.damage.version !== trace.version) {
    trace.version = sim.car.damage.version;
    trace.marks.push({ step, damage: cloneDamage(sim.car.damage) });
  }
  for (const event of events) {
    trace.events.push({ step, event });
    if (event.type === "finish" || event.type === "retire") trace.sealed = true;
  }
  if (step >= trace.cap) trace.sealed = true;
}

/** Whether the trace has step `at` of the run written down. */
export function traceCovers(trace: RunTrace, at: number): boolean {
  return at <= trace.steps;
}

/** PLAY the trace forward to step `at`: hand out every event and every
 * mark up to it that this playback has not handed out yet — into `out`,
 * and onto `into.car.damage` — and pose `into` where the run was. Past the
 * end of a sealed trace the car stays where the run ended. */
export function playTo(
  trace: RunTrace,
  play: Playback,
  at: number,
  into: GameState,
  out: GameEvent[],
): void {
  const marks = trace.marks;
  while (play.mark < marks.length && marks[play.mark].step <= at) {
    into.car.damage = marks[play.mark].damage;
    play.mark += 1;
  }
  const events = trace.events;
  while (play.event < events.length && events[play.event].step <= at) {
    out.push(events[play.event].event);
    play.event += 1;
  }
  pose(trace, Math.min(at, trace.steps), into);
}

/** Put the shown car where the run was at `step`, interpolated between the
 * two samples either side of it. The flags and the counts come off the
 * nearer sample; the rates the pose does not carry are derived from the
 * pair, which is what they were in the first place. */
function pose(trace: RunTrace, step: number, into: GameState): void {
  const last = trace.samples - 1;
  const k = step / TRACE_EVERY;
  const a = Math.min(Math.floor(k), last);
  const b = Math.min(a + 1, last);
  const f = b === a ? 0 : clamp(k - a, 0, 1);
  const ia = a * STRIDE;
  const ib = b * STRIDE;
  const fl = trace.floats;
  const at = (col: number): number => lerp(fl[ia + col], fl[ib + col], f);
  const car = into.car;
  car.x = at(X);
  car.z = at(Z);
  car.y = at(Y);
  const ha = fl[ia + HEADING];
  const turn = angleDiff(ha, fl[ib + HEADING]);
  car.heading = ha + turn * f;
  car.u = at(U);
  car.w = at(W);
  car.roll = at(ROLL);
  car.pitch = at(PITCH);
  car.pitchLoad = at(PITCH_LOAD);
  car.ride = at(RIDE);
  car.loft = at(LOFT);
  car.rev = at(REV);
  car.wheelspin = at(WHEELSPIN);
  car.slide = at(SLIDE);
  car.steer = at(STEER);
  car.slip = Math.atan2(car.w, Math.abs(car.u));
  car.yawRate = b === a ? 0 : turn / (TRACE_EVERY * TUNING.dt);
  const bits = trace.bits[(f < 0.5 ? ia : ib) + BITS];
  car.gear = bits & ((1 << GEAR_BITS) - 1);
  const flags = bits >>> FLAG_SHIFT;
  car.airborne = (flags & AIRBORNE) !== 0;
  car.drifting = (flags & DRIFTING) !== 0;
  car.braking = (flags & BRAKING) !== 0;
  car.locked = (flags & LOCKED) !== 0;
  car.reversing = (flags & REVERSING) !== 0;
  car.settling = (flags & SETTLING) !== 0;
  car.rolling = (flags & ROLLING) !== 0;
  car.sliding = (flags & SLIDING) !== 0;
  car.spun = (flags & SPUN) !== 0;
  into.surface = SURFACES[(bits >>> SURFACE_SHIFT) & ((1 << SURFACE_BITS) - 1)];
  into.phase = PHASES[(bits >>> PHASE_SHIFT) & ((1 << PHASE_BITS) - 1)];
  into.lap = (bits >>> LAP_SHIFT) & ((1 << LAP_BITS) - 1);
  into.progressS = at(PROGRESS);
  into.raceTime = at(RACE_TIME);
  into.t = step * TUNING.dt;
  blowWind(into.env, into.t, into.wind);
}

/** How much a trace holds, bytes — the samples, which are all of it that
 * is worth counting. What the debug overlay and a memory question read. */
export function traceBytes(trace: RunTrace): number {
  return trace.samples * STRIDE * 4;
}
