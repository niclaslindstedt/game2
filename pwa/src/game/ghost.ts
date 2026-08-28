// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ghost: your best run on a stage, kept as the CONTROLS that drove it.
//
// The engine is deterministic — a fixed 120 Hz step, no `Math.random`, every
// draw from the state's seeded stream — so the same stage, the same car and
// the same sequence of inputs put the car through the same metre of road
// every time. That makes a ghost a tape of button presses rather than a
// path: a few tens of kilobytes for a whole stage, and a car that flies,
// crashes and slides EXACTLY the way it did, because it is the same physics
// doing it rather than an interpolation of where it ended up.
//
// The bargain that buys it is one number: the steering axis is snapped to a
// fixed grid before the engine ever sees it (`snapSteer`, applied in
// input.ts). Write down anything the engine did not receive and the replay
// walks off the road a corner later. The pedals go through the same gate so
// an analog throttle would be recorded as honestly as a key is.
//
// Storage is one localStorage key per level — a driven stage costs about a
// character a step, so the ladder's longest is some 60 kB, and reading one
// ghost must not mean parsing all of them. Storage can be unavailable
// (private mode) or full: a ghost that cannot be kept is simply not kept,
// and the best time still records.

import {
  NEUTRAL_INPUT,
  resolveKnobs,
  type CarInput,
  type FiniteStageLength,
  type StageKnobs,
  type TimeOfDay,
  type Weather,
} from "@engine";

import { clamp } from "../lib/util.ts";

/** Steering positions each side of centre. The wheel is snapped to this
 * grid at the one place it is produced, so the number the engine drives on
 * is the number the tape writes down and a replay is exact rather than
 * merely close. 1/127 of full lock is finer than a thumb or a key ramp can
 * resolve, and it makes a step of the tape one byte. */
const STEER_STEPS = 127;

/** Pedal positions. Keys and touch buttons only ever ask for 0 or 1, but a
 * pedal is an axis in `CarInput` and one day may be driven like one. */
const PEDAL_STEPS = 255;

/** Bump when the tape's layout changes — an old recording decodes into
 * different driving, which is worse than no ghost at all. */
const GHOST_FORMAT = 2;

const KEY_PREFIX = "scandi-flick-ghost:";

/** Snap an axis onto a recorded grid. Centre is returned as a POSITIVE
 * zero: rounding a hair below it yields -0, which the tape has no way to
 * write down and which JavaScript then carries through the physics as a
 * sign the replay would not have. */
function snap(v: number, steps: number): number {
  const index = Math.round(v * steps);
  return index === 0 ? 0 : index / steps;
}

/** Snap a steering request onto the recorded grid. */
export function snapSteer(v: number): number {
  return snap(clamp(v, -1, 1), STEER_STEPS);
}

/** Snap a pedal onto the recorded grid. */
export function snapPedal(v: number): number {
  return snap(clamp(v, 0, 1), PEDAL_STEPS);
}

/** Everything that decides WHICH stage a run happened on — the same list
 * the app rebuilds a run from. All of it has to match before a tape is put
 * back on the road: a ghost recorded on another seed, another length or
 * another wind is a car driving a stage that is no longer there. */
export type GhostStage = {
  seed: number;
  length: FiniteStageLength;
  knobs: StageKnobs;
  timeOfDay: TimeOfDay;
  weather: Weather;
};

export type GhostRun = GhostStage & {
  format: number;
  /** The car the time was set in — the ghost drives its own, not yours. */
  carId: string;
  /** The finish time it recorded, seconds. */
  time: number;
  /** R28 — the race clock at every checkpoint the run drove through, in
   * order. Written down rather than read back off the replay: the player
   * reaches a board whenever they reach it, and a split that only appeared
   * once the ghost had got there too would be blank exactly when the run is
   * quick. */
  splits: number[];
  /** Steps on the tape: the whole run, countdown included, so replay and
   * run advance in lockstep from the first step of the game. */
  steps: number;
  /** One RLE'd, base64'd byte per step, per control. */
  steer: string;
  throttle: string;
  brake: string;
  flags: string;
};

const FLAG_HANDBRAKE = 1;
const FLAG_BOOST = 2;
const FLAG_SHIFT_UP = 4;
const FLAG_SHIFT_DOWN = 8;
const FLAG_RESET = 16;

/** `String.fromCharCode` takes its bytes as arguments, and a whole stage's
 * worth of them at once overflows the call stack. */
const BASE64_CHUNK = 0x8000;

function toBase64(bytes: number[]): string {
  let raw = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    raw += String.fromCharCode(...bytes.slice(i, i + BASE64_CHUNK));
  }
  return btoa(raw);
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Run-length encode a byte per step, then base64 it. A control held still
 * is what makes a tape small — a pedal buried down a straight is two bytes
 * per 255 steps, and even the wheel spends most of a stage on a value it
 * held last step. A run caps at 255 steps and simply continues in the next
 * pair, so the worst case is two bytes per step rather than a failure. */
function encodeStream(values: number[]): string {
  const out: number[] = [];
  let i = 0;
  while (i < values.length) {
    const value = values[i];
    let run = 1;
    while (run < 255 && i + run < values.length && values[i + run] === value) run++;
    out.push(run, value);
    i += run;
  }
  return toBase64(out);
}

/** Decode `steps` bytes back out. A short or damaged tape leaves the tail
 * at zero rather than throwing: a ghost is a picture, and half a picture
 * beats a crash on the first frame of a run. */
function decodeStream(text: string, steps: number): Uint8Array {
  const out = new Uint8Array(steps);
  const bytes = fromBase64(text);
  let at = 0;
  for (let i = 0; i + 1 < bytes.length && at < steps; i += 2) {
    const run = Math.min(bytes[i], steps - at);
    out.fill(bytes[i + 1], at, at + run);
    at += run;
  }
  return out;
}

export type GhostRecorder = {
  /** Write down the controls a step was driven on. Called with the input
   * the engine ACTUALLY received, never the one that produced it. */
  record: (input: CarInput) => void;
  steps: () => number;
  /** Seal the tape into a run worth keeping. `splits` is the run's
   * `checkpointTimes` — what the next attempt is measured against. */
  seal: (stage: GhostStage, carId: string, time: number, splits: number[]) => GhostRun;
};

export function createGhostRecorder(): GhostRecorder {
  const steer: number[] = [];
  const throttle: number[] = [];
  const brake: number[] = [];
  const flags: number[] = [];
  return {
    record: (input) => {
      steer.push(Math.round(clamp(input.steer, -1, 1) * STEER_STEPS) + STEER_STEPS);
      throttle.push(Math.round(clamp(input.throttle, 0, 1) * PEDAL_STEPS));
      brake.push(Math.round(clamp(input.brake, 0, 1) * PEDAL_STEPS));
      flags.push(
        (input.handbrake ? FLAG_HANDBRAKE : 0) |
          (input.boost ? FLAG_BOOST : 0) |
          (input.shiftUp ? FLAG_SHIFT_UP : 0) |
          (input.shiftDown ? FLAG_SHIFT_DOWN : 0) |
          (input.reset ? FLAG_RESET : 0),
      );
    },
    steps: () => steer.length,
    seal: (stage, carId, time, splits) => ({
      format: GHOST_FORMAT,
      ...stage,
      knobs: resolveKnobs(stage.knobs),
      carId,
      time,
      splits: [...splits],
      steps: steer.length,
      steer: encodeStream(steer),
      throttle: encodeStream(throttle),
      brake: encodeStream(brake),
      flags: encodeStream(flags),
    }),
  };
}

export type GhostTape = {
  steps: number;
  /** The controls step `i` was driven on — neutral once the tape runs out,
   * which is the ghost sitting on the finish line it already crossed. The
   * returned object is REUSED: the engine spends an input within the step
   * it arrives in and never keeps it. */
  at: (step: number) => CarInput;
};

export function readGhost(run: GhostRun): GhostTape {
  const steps = run.steps;
  const steer = decodeStream(run.steer, steps);
  const throttle = decodeStream(run.throttle, steps);
  const brake = decodeStream(run.brake, steps);
  const flags = decodeStream(run.flags, steps);
  const input: CarInput = { ...NEUTRAL_INPUT };
  return {
    steps,
    at: (step) => {
      if (step < 0 || step >= steps) return Object.assign(input, NEUTRAL_INPUT);
      const bits = flags[step];
      input.steer = (steer[step] - STEER_STEPS) / STEER_STEPS;
      input.throttle = throttle[step] / PEDAL_STEPS;
      input.brake = brake[step] / PEDAL_STEPS;
      input.handbrake = (bits & FLAG_HANDBRAKE) !== 0;
      input.boost = (bits & FLAG_BOOST) !== 0;
      input.shiftUp = (bits & FLAG_SHIFT_UP) !== 0;
      input.shiftDown = (bits & FLAG_SHIFT_DOWN) !== 0;
      input.reset = (bits & FLAG_RESET) !== 0;
      return input;
    },
  };
}

/** Whether a stored run still describes the stage about to be driven. */
export function ghostMatches(run: GhostRun, stage: GhostStage): boolean {
  const theirs = resolveKnobs(run.knobs);
  const ours = resolveKnobs(stage.knobs);
  return (
    run.format === GHOST_FORMAT &&
    run.seed === stage.seed &&
    run.length === stage.length &&
    run.timeOfDay === stage.timeOfDay &&
    run.weather === stage.weather &&
    (Object.keys(ours) as (keyof StageKnobs)[]).every((key) => theirs[key] === ours[key])
  );
}

/** The best run kept for a level, or null when there is none to race. */
export function loadGhost(levelId: string): GhostRun | null {
  try {
    const stored = localStorage.getItem(KEY_PREFIX + levelId);
    if (!stored) return null;
    const run = JSON.parse(stored) as GhostRun;
    if (run?.format !== GHOST_FORMAT) return null;
    if (!Number.isFinite(run.steps) || run.steps <= 0) return null;
    if (typeof run.steer !== "string" || typeof run.flags !== "string") return null;
    if (typeof run.throttle !== "string" || typeof run.brake !== "string") return null;
    if (!Array.isArray(run.splits)) return null;
    return run;
  } catch {
    return null;
  }
}

export function saveGhost(levelId: string, run: GhostRun): void {
  try {
    localStorage.setItem(KEY_PREFIX + levelId, JSON.stringify(run));
  } catch {
    /* storage unavailable or full — the best time is still recorded */
  }
}
