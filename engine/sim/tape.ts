// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RUN TAPE — a whole run written down as the controls that drove it,
// in a file anybody (a person, a script, a model) can read.
//
// It exists to answer one question honestly: is HARD hard? A difficulty is
// not a number in a table, it is what happens when a human's driving meets
// the field at that setting — and until this file existed there was no way
// to put the same driving in front of a different field twice. A tape is
// that: one recorded drive, replayable against any field, as many times as
// the question needs asking.
//
// The trick is the same one the ghost is built on. The engine is
// deterministic — a fixed 120 Hz step, no `Math.random`, every draw from the
// state's seeded stream — so the same stage, the same car and the same
// sequence of inputs put the car through the same metre of road every time.
// Write down what the engine was HANDED and the run comes back exactly,
// crashes and all, because it is the same physics doing it.
//
// WHY JSONL AND NOT THE GHOST'S PACKED BYTES. A ghost is written for a
// browser and read by nothing else; a tape is written to be looked at. One
// JSON object per line means `grep`, `head`, `jq` and a diff all work on it,
// a truncated file still parses up to the truncation, and a line can be
// edited by hand to ask "what if I had lifted here". The cost is size, and
// the delta encoding below is what pays it: a line is written only when a
// control actually MOVES, so a pedal buried down a straight is one line and
// not nine hundred.
//
// WHAT IS IN THE FILE, in order:
//
//   run     one header: the stage, the car, the field, how it started
//   in      the controls, each line holding until the next one
//   skip    the driver cutting the establishing shot short (it moves the
//           whole field's clock, so a replay has to do it at the same step)
//   sample  where the car actually was, once a second — the checksum
//   result  what the run scored
//   rival   one line per crew in the field, and what they scored
//
// The samples are what makes a stale tape say so rather than lie. A replay
// re-drives the inputs and compares; if the handling has moved under the
// recording, the car is somewhere else by the first corner and the tool
// reports the drift instead of a result nobody should trust.

import { NEUTRAL_INPUT, type CarInput, type GameState, type RunStats } from "../game/state.ts";
import { TUNING } from "../game/defs/tuning.ts";
import type { GearboxMode } from "../game/defs/cars.ts";
import type { Season, TimeOfDay, Weather } from "../game/state.ts";
import type { StageKnobs, StageLength, StageShape } from "../mapgen/index.ts";
import type { GridSlot } from "./grid.ts";
import type { Difficulty } from "./skill.ts";
import type { FieldPlan } from "./field.ts";

/** Bump when the layout changes, OR when what the engine DOES with a tape
 * changes: the same buttons under different physics drive a different metre
 * of road. A tape whose samples no longer match is reported rather than
 * refused — the drift is the interesting part — but a tape from a format
 * that no longer parses is refused outright. */
export const TAPE_FORMAT = 1;

/** How often a verification sample is written, steps. One a second is a
 * hundred-odd lines on a stage and enough resolution to say WHERE a replay
 * started to diverge, which is the only useful thing to know about a
 * divergence. */
export const SAMPLE_EVERY = Math.round(1 / TUNING.dt);

/** Everything that decides which stage a run happened on. All of it has to
 * be rebuilt before the tape goes back on the road. */
export type TapeStage = {
  seed: number;
  length: StageLength;
  shape: StageShape;
  laps: number;
  knobs: StageKnobs;
  timeOfDay: TimeOfDay;
  weather: Weather;
  season: Season;
};

/** Who was driving, in what. */
export type TapeCar = { id: string; gearbox: GearboxMode };

/** Where the driver was stood when the tape started, and whether they sat
 * through the ceremony. A mass start's back-row slot changes where the car
 * IS on step 0, so it is part of the recording and not of the replay's
 * options. */
export type TapeStart = { skipCountdown: boolean; grid: GridSlot | null };

/** The header: one line, and the whole of what a replay needs to rebuild
 * the world the tape was driven in. */
export type TapeHeader = {
  kind: "run";
  format: number;
  /** The engine build that recorded it — the first thing to check when a
   * replay drifts. */
  engine: string;
  /** ISO 8601, for a human sorting a folder of these. */
  recorded: string;
  /** Whether a person drove it or the bot did. */
  source: "player" | "bot";
  /** What kind of run it was, in the app's own words (`campaign`,
   * `headsup`, `timetrial`, `roam`), or `sim` for a recorded bot run. */
  mode: string;
  /** The campaign/time-trial stage id, when the run was on one. */
  levelId?: string;
  stage: TapeStage;
  car: TapeCar;
  /** The field that was on the road, or null when the run was alone. */
  field: FieldPlan | null;
  start: TapeStart;
  /** The physics timestep the tape was recorded at. A tape recorded at
   * another one is not replayable and says so on the first line. */
  dt: number;
};

/** A control change: from `step` until the next one of these, the engine was
 * handed exactly this. Only the axes are always written; the buttons are
 * omitted when they are off, which is most of the time. */
export type TapeInput = {
  kind: "in";
  step: number;
  /** Seconds since the first step — what a person reads the file by. */
  t: number;
  steer: number;
  throttle: number;
  brake: number;
  hand?: boolean;
  up?: boolean;
  down?: boolean;
  reset?: boolean;
};

/** The driver cutting the establishing shot short. Not an input — it is the
 * app jumping the clock — but it moves the field, so a replay that missed it
 * would race a stagger nobody drove. */
export type TapeSkip = { kind: "skip"; step: number; t: number };

/** Where the car actually was. The tape's checksum against the code that
 * replays it. */
export type TapeSample = {
  kind: "sample";
  step: number;
  t: number;
  x: number;
  z: number;
  /** Forward speed, m/s. */
  u: number;
};

/** What the run scored. */
export type TapeResult = {
  kind: "result";
  finished: boolean;
  /** Stage time at the line, or the clock where the recording stopped. */
  time: number;
  laps: number;
  lapTimes: number[];
  /** R28 — the race clock at every split board driven through. */
  splits: number[];
  /** Where the run placed, and out of how many. Null when nobody else was
   * entered. */
  place: number | null;
  of: number | null;
  stats: RunStats;
};

/** One crew's line of the classification the run actually produced. This is
 * what makes a tape a CALIBRATION artifact rather than just a replay: the
 * field it was driven against is written down beside it, so what the same
 * driving is worth against another field is a difference of two numbers. */
export type TapeRival = {
  kind: "rival";
  id: string;
  alias: string;
  driver: string;
  carId: string;
  time: number | null;
  place: number;
  splits: number[];
};

export type TapeLine = TapeHeader | TapeInput | TapeSkip | TapeSample | TapeResult | TapeRival;

/** A parsed tape, with the lines sorted into what reads them. */
export type RunTape = {
  header: TapeHeader;
  /** Control changes, in step order. */
  inputs: TapeInput[];
  /** Steps at which the establishing shot was cut. */
  skips: number[];
  samples: TapeSample[];
  result: TapeResult | null;
  rivals: TapeRival[];
  /** The last step the recording covers. */
  steps: number;
};

/** Round a number to a readable number of places without moving it enough to
 * matter. Axes are recorded EXACTLY — they are what the physics was handed —
 * so this is only ever used on the derived columns a human reads. */
function round(v: number, places = 3): number {
  const scale = 10 ** places;
  return Math.round(v * scale) / scale;
}

function sameInput(a: CarInput, b: CarInput): boolean {
  return (
    a.steer === b.steer &&
    a.throttle === b.throttle &&
    a.brake === b.brake &&
    a.handbrake === b.handbrake &&
    a.shiftUp === b.shiftUp &&
    a.shiftDown === b.shiftDown &&
    a.reset === b.reset
  );
}

export type TapeRecorder = {
  /** Write down the controls a step was driven on, and sample the car every
   * so often. Called with the input the engine ACTUALLY received, never the
   * one that produced it, and AFTER the step so the sample is where the car
   * ended up. */
  record: (input: CarInput, state: GameState) => void;
  /** The driver cut the establishing shot at this step. */
  skipped: () => void;
  steps: () => number;
  /** Everything written so far, as JSONL. The result and the field's sheet
   * are handed in at the end because neither exists until the run is over —
   * and on a run nobody finished, `result` is simply the clock where it
   * stopped. */
  seal: (result: Omit<TapeResult, "kind">, rivals: Omit<TapeRival, "kind">[]) => string;
};

/** Start recording. The header is fixed at the start of the run because
 * everything in it is: a tape whose stage changed halfway is not a run. */
export function createTapeRecorder(
  header: Omit<TapeHeader, "kind" | "format" | "dt">,
): TapeRecorder {
  const lines: TapeLine[] = [
    { kind: "run", format: TAPE_FORMAT, dt: TUNING.dt, ...header } as TapeHeader,
  ];
  let steps = 0;
  // Seeded with a neutral input so a run that begins with a foot already
  // down writes its first line at step 0 rather than inheriting nothing.
  const last: CarInput = { ...NEUTRAL_INPUT };
  return {
    record: (input, state) => {
      const step = steps++;
      if (!sameInput(input, last)) {
        Object.assign(last, input);
        const line: TapeInput = {
          kind: "in",
          step,
          t: round(step * TUNING.dt),
          steer: input.steer,
          throttle: input.throttle,
          brake: input.brake,
        };
        if (input.handbrake) line.hand = true;
        if (input.shiftUp) line.up = true;
        if (input.shiftDown) line.down = true;
        if (input.reset) line.reset = true;
        lines.push(line);
      }
      if (step % SAMPLE_EVERY === 0) {
        lines.push({
          kind: "sample",
          step,
          t: round(step * TUNING.dt),
          x: round(state.car.x, 2),
          z: round(state.car.z, 2),
          u: round(state.car.u, 2),
        });
      }
    },
    skipped: () => {
      lines.push({ kind: "skip", step: steps, t: round(steps * TUNING.dt) });
    },
    steps: () => steps,
    seal: (result, rivals) => {
      const all: TapeLine[] = [
        ...lines,
        { kind: "result", ...result },
        ...rivals.map((rival) => ({ kind: "rival" as const, ...rival })),
      ];
      return all.map((line) => JSON.stringify(line)).join("\n") + "\n";
    },
  };
}

/** Read a tape back. Throws on a file that is not one — a header that is
 * missing, from another format, or recorded at another timestep — because
 * every one of those means the replay below would be a fiction. Unknown line
 * kinds are ignored, so a tape written by a newer build still replays for
 * everything this one understands. */
export function parseTape(text: string): RunTape {
  const inputs: TapeInput[] = [];
  const skips: number[] = [];
  const samples: TapeSample[] = [];
  const rivals: TapeRival[] = [];
  let header: TapeHeader | null = null;
  let result: TapeResult | null = null;
  let steps = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === "" || raw.startsWith("#")) continue;
    let line: TapeLine;
    try {
      line = JSON.parse(raw) as TapeLine;
    } catch {
      throw new Error(`run tape: line ${i + 1} is not JSON`);
    }
    switch (line.kind) {
      case "run":
        header = line;
        break;
      case "in":
        inputs.push(line);
        steps = Math.max(steps, line.step + 1);
        break;
      case "skip":
        skips.push(line.step);
        break;
      case "sample":
        samples.push(line);
        steps = Math.max(steps, line.step + 1);
        break;
      case "result":
        result = line;
        break;
      case "rival":
        rivals.push(line);
        break;
      default:
        break;
    }
  }
  if (!header) throw new Error("run tape: no header line");
  if (header.format !== TAPE_FORMAT) {
    throw new Error(`run tape: format ${header.format}, this build reads ${TAPE_FORMAT}`);
  }
  if (Math.abs(header.dt - TUNING.dt) > 1e-9) {
    throw new Error(`run tape: recorded at dt ${header.dt}, this build steps at ${TUNING.dt}`);
  }
  inputs.sort((a, b) => a.step - b.step);
  samples.sort((a, b) => a.step - b.step);
  skips.sort((a, b) => a - b);
  return { header, inputs, skips, samples, result, rivals, steps };
}

export type TapePlayer = {
  /** How many steps the recording covers. */
  steps: number;
  /** The controls step `i` was driven on — the last line at or before it,
   * and neutral once the tape runs out, which is a car sat past a finish it
   * has already crossed. The returned object is REUSED: the engine spends an
   * input within the step it arrives in and never keeps it. */
  at: (step: number) => CarInput;
  /** Whether the driver cut the establishing shot at this step. */
  skipsAt: (step: number) => boolean;
};

/** Put a tape back on the road. */
export function readTape(tape: RunTape): TapePlayer {
  const input: CarInput = { ...NEUTRAL_INPUT };
  const skips = new Set(tape.skips);
  // The lines are in step order, so the reader walks forward with the run
  // rather than searching: a replay asks for every step, in order, once.
  let next = 0;
  let asked = -1;
  return {
    steps: tape.steps,
    at: (step) => {
      // A caller that jumped backwards (a test, a scrub) gets the walk
      // restarted rather than a wrong answer.
      if (step < asked) {
        next = 0;
        Object.assign(input, NEUTRAL_INPUT);
      }
      asked = step;
      while (next < tape.inputs.length && tape.inputs[next].step <= step) {
        const line = tape.inputs[next++];
        input.steer = line.steer;
        input.throttle = line.throttle;
        input.brake = line.brake;
        input.handbrake = line.hand === true;
        input.shiftUp = line.up === true;
        input.shiftDown = line.down === true;
        input.reset = line.reset === true;
      }
      return input;
    },
    skipsAt: (step) => skips.has(step),
  };
}

/** What a tape says the field it was driven against was. A replay against
 * ANOTHER difficulty keeps everything else — the same crews, the same size,
 * the same start type — so only the one number under test moves. */
export function fieldAt(header: TapeHeader, difficulty?: Difficulty): FieldPlan | null {
  if (!header.field) return null;
  return difficulty ? { ...header.field, difficulty } : header.field;
}
