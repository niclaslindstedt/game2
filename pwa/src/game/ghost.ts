// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ghost: your best run on a stage, kept as the CONTROLS that drove it.
//
// The engine is deterministic — a fixed step (`TUNING.physicsHz`), no `Math.random`, every
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
// The other half of that bargain is the OPENING. A tape starts at step 0 of
// the game, ceremony included, so the two runs advance in lockstep — which
// means the replay has to sit through exactly the ceremony the run sat
// through. A driver cutting the establishing shot short moves every corner
// after it seconds up the tape, so the cut is written down as a step index
// (`skips`) and taken again on that step, exactly as the run tape does it
// (engine/sim/tape.ts). A run that had no countdown at all — god mode, a
// placed link — records that too, so the replay's game is built the way the
// run's was rather than the way the menu would build one now.
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
  type Season,
  type StageKnobs,
  type Weather,
} from "@engine";

import {
  createTapeRecorder,
  readTape,
  snapAxis,
  type TapeSchema,
} from "@niclaslindstedt/oss-game-framework/racing/tape";

/** The tape's layout: one byte per step per control, RLE'd and base64'd by
 * the framework's control tape (`racing/tape`). The steering is a SIGNED
 * axis — 127 positions each side of centre, finer than a thumb or a key ramp
 * can resolve — and the pedals are LEVERS of 255, because a pedal is an axis
 * in `CarInput` and one day may be driven like one. The four buttons share
 * one byte of flags. The keys are the stored field names, so this IS the
 * stored format. */
type GhostStream = "steer" | "throttle" | "brake" | "flags";
const SCHEMA: TapeSchema<GhostStream> = {
  steer: "signed",
  throttle: "lever",
  brake: "lever",
  flags: "flags",
};

/** Bump when the tape's layout changes, OR when what the engine DOES with a
 * tape changes: the same buttons under different physics put the car through
 * a different metre of road, and a ghost that replays every corner at the
 * wrong time is worse than no ghost at all. What step 0 MEANS counts as the
 * layout — a recording whose first step was a different moment of the start
 * control is out by the whole opening. */
const GHOST_FORMAT = 5;

const KEY_PREFIX = "scandi-flick-ghost:";

/** Snap a steering request onto the recorded grid. Centre is returned as a
 * POSITIVE zero: rounding a hair below it yields -0, which the tape has no
 * way to write down and which JavaScript then carries through the physics as
 * a sign the replay would not have. */
export function snapSteer(v: number): number {
  return snapAxis(v, SCHEMA.steer);
}

/** Snap a pedal onto the recorded grid. */
export function snapPedal(v: number): number {
  return snapAxis(v, SCHEMA.brake);
}

/** Everything that decides WHICH stage a run happened on — the same list
 * the app rebuilds a run from. All of it has to match before a tape is put
 * back on the road: a ghost recorded on another seed, another length or
 * another wind is a car driving a stage that is no longer there. */
export type GhostStage = {
  seed: number;
  length: FiniteStageLength;
  knobs: StageKnobs;
  /** The hour the run started at (`RaceEnv.hour`). A run written when a
   * stage was set by a word instead carries none, and never matches. */
  hour: number;
  weather: Weather;
  /** The climate (climate.ts) — part of the road since a winter is snow on
   * it, so a run set on the summer's gravel is not a ghost for the winter's
   * snow. Absent on a record written before there was a winter, which is a
   * summer at the season's own temperature. */
  season?: Season;
  temperature?: number | null;
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
  /** Whether the run's game was built without a countdown at all — god mode,
   * or a link that stood the run at a moment. The replay's game is built the
   * same way or its lights run over the tape's first ten seconds of
   * driving. */
  skipCountdown: boolean;
  /** The steps the driver cut the establishing shot on, in order. Normally
   * one or none; a list because the tape writes down what happened rather
   * than what is supposed to. */
  skips: number[];
  /** Steps on the tape: the whole run, the start control included, so
   * replay and run advance in lockstep from the first step of the game.
   * Which is why `GHOST_FORMAT` moves when the start control does — step 0
   * has to mean the same moment in both. */
  steps: number;
  /** One RLE'd, base64'd byte per step, per control. */
  steer: string;
  throttle: string;
  brake: string;
  flags: string;
};

const FLAG_HANDBRAKE = 1;
const FLAG_SHIFT_UP = 4;
const FLAG_SHIFT_DOWN = 8;
const FLAG_RESET = 16;

/** What was already decided about the run before its first step — the same
 * shape of header the run tape keeps, and for the same reason: a replay is
 * only the run again if it STARTS the way the run started. */
export type GhostStart = {
  skipCountdown: boolean;
};

export type GhostRecorder = {
  /** Write down the controls a step was driven on. Called with the input
   * the engine ACTUALLY received, never the one that produced it. */
  record: (input: CarInput) => void;
  /** The driver cut the establishing shot on the step about to be recorded.
   * Called where the run takes the cut — before that step, as the replay
   * takes it. */
  skipped: () => void;
  steps: () => number;
  /** Seal the tape into a run worth keeping. `splits` is the run's
   * `checkpointTimes` — what the next attempt is measured against. */
  seal: (stage: GhostStage, carId: string, time: number, splits: number[]) => GhostRun;
};

export function createGhostRecorder(start: GhostStart): GhostRecorder {
  const tape = createTapeRecorder<GhostStream>(SCHEMA);
  const skips: number[] = [];
  return {
    record: (input) => {
      tape.record({
        steer: input.steer,
        throttle: input.throttle,
        brake: input.brake,
        flags:
          (input.handbrake ? FLAG_HANDBRAKE : 0) |
          (input.shiftUp ? FLAG_SHIFT_UP : 0) |
          (input.shiftDown ? FLAG_SHIFT_DOWN : 0) |
          (input.reset ? FLAG_RESET : 0),
      });
    },
    skipped: () => {
      skips.push(tape.steps());
    },
    steps: () => tape.steps(),
    seal: (stage, carId, time, splits) => ({
      format: GHOST_FORMAT,
      ...stage,
      knobs: resolveKnobs(stage.knobs),
      carId,
      time,
      splits: [...splits],
      skipCountdown: start.skipCountdown,
      skips: [...skips],
      ...tape.seal(),
    }),
  };
}

export type GhostTape = {
  steps: number;
  /** Whether the run cut the establishing shot on this step. Asked BEFORE
   * the step is taken, so the replay's cut lands where the run's did. */
  skipsAt: (step: number) => boolean;
  /** The controls step `i` was driven on — neutral once the tape runs out,
   * which is the ghost sitting on the finish line it already crossed. The
   * returned object is REUSED: the engine spends an input within the step
   * it arrives in and never keeps it. */
  at: (step: number) => CarInput;
};

export function readGhost(run: GhostRun): GhostTape {
  const tape = readTape<GhostStream>(run, SCHEMA);
  const controls: Record<GhostStream, number> = { steer: 0, throttle: 0, brake: 0, flags: 0 };
  const input: CarInput = { ...NEUTRAL_INPUT };
  const skips = new Set(run.skips);
  return {
    steps: tape.steps,
    skipsAt: (step) => skips.has(step),
    at: (step) => {
      if (!tape.at(step, controls)) return Object.assign(input, NEUTRAL_INPUT);
      const bits = controls.flags;
      input.steer = controls.steer;
      input.throttle = controls.throttle;
      input.brake = controls.brake;
      input.handbrake = (bits & FLAG_HANDBRAKE) !== 0;
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
    run.hour === stage.hour &&
    run.weather === stage.weather &&
    (run.season ?? "summer") === (stage.season ?? "summer") &&
    (run.temperature ?? null) === (stage.temperature ?? null) &&
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
    if (!Array.isArray(run.splits) || !Array.isArray(run.skips)) return null;
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
