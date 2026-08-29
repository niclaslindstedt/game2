// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A WHOLE RACE, HEADLESSLY — one car the run belongs to, the field beside
// it, and a classification at the end. The same road the app drives, driven
// with nothing attached to it.
//
// It is the other half of the run tape (tape.ts). One function does both
// jobs, because they have to be the same job or the answer is worthless:
//
//   RECORD  the bot drives, and the run is written down as it goes. A
//           reference lap to measure a change against, made in one command.
//   REPLAY  a recorded drive — a person's, usually — is handed back to the
//           engine step for step, against the field the tape names, or
//           against a DIFFERENT one. That last clause is the whole point:
//           the same driving placed against easy, medium and hard says what
//           those words are actually worth, and no other measurement does,
//           because a bot's lap only ever says what the bot would do.
//
// The step order is the app's, exactly (App.tsx's frame loop): the field
// takes the tick first — the player is the last car on the road, so a rival
// through a board on this step was through it first — then the player's own
// step, then the one place two cars can be at once. Get that order wrong and
// a replay is a different race from the run it replays.
//
// `simulate.ts` is the neighbouring tool and stays what it is: one bot, no
// field, a balance table. This is the one that answers "what would this
// drive have been worth against that field".

import { TUNING } from "../game/defs/tuning.ts";
import type { GameEvent, RunStats } from "../game/state.ts";
import { createGame, skipIntro, step } from "../game/step.ts";
import { compileStage, STAGE_RULES, type FiniteStageLength, type Track } from "../mapgen/index.ts";
import { engineVersion } from "../version.ts";
import { RALLY_BOT, botInput, type BotProfile } from "./bot.ts";
import {
  advanceField,
  createField,
  fieldResults,
  payHeadStart,
  placeAtFinish,
  rubRivals,
  settleField,
  settleLimit,
  stepField,
  type ClassRow,
  type FieldPlan,
  type RivalField,
} from "./field.ts";
import {
  createTapeRecorder,
  readTape,
  type RunTape,
  type TapeCar,
  type TapeStage,
  type TapeStart,
} from "./tape.ts";

/** Who is at the wheel: the bot, or a recording of somebody who was. */
export type RaceDriver = { kind: "bot"; profile?: BotProfile } | { kind: "tape"; tape: RunTape };

/** How far the replayed car ended up from where the tape says it was — the
 * answer to "is this recording still valid under today's physics". Null when
 * there was nothing to check against. */
export type RaceDrift = {
  /** Metres, at the worst sample. */
  worst: number;
  /** Race time of that sample, seconds. */
  at: number;
  samples: number;
};

export type RaceOutcome = {
  finished: boolean;
  /** Stage time at the line, or the clock where the run gave up. */
  time: number;
  laps: number;
  lapTimes: number[];
  splits: number[];
  /** Where the run placed. Null when nobody else was entered. */
  place: number | null;
  of: number | null;
  stats: RunStats;
  /** The stage's result sheet, the player included. Empty when alone. */
  rows: ClassRow[];
  /** Each crew's split times, by crew id. */
  rivalSplits: Record<string, number[]>;
  drift: RaceDrift | null;
  /** The run written down, when `record` asked for it. */
  tape: string | null;
};

export type RaceOptions = {
  stage: TapeStage;
  car: TapeCar;
  /** The field to race against, or null to drive the stage alone. */
  field: FieldPlan | null;
  start: TapeStart;
  driver: RaceDriver;
  /** Give up after this much race time, seconds. Defaults to twice the
   * length band's own minutes, the same generous bound the sim CLI uses. */
  maxTime?: number;
  /** Write the run down as it is driven. */
  record?: { source: "player" | "bot"; mode: string; levelId?: string };
};

/** Everybody's head start, paid in full before the player's first step.
 * The app buys the same seconds out of the establishing shot a slice of a
 * frame at a time (standings.ts) because it has a picture to keep moving;
 * with nothing to draw there is no reason to interleave it, and paying it up
 * front is the ideal that budgeting approximates. Nothing crosses between
 * two rivals, so when the debt is paid changes nothing about what they
 * drove. */
function enterField(track: Track, options: RaceOptions): RivalField | null {
  if (!options.field) return null;
  const field = createField(track, options.field, {
    seed: options.stage.seed,
    laps: options.stage.laps,
    timeOfDay: options.stage.timeOfDay,
    weather: options.stage.weather,
    season: options.stage.season,
  });
  payHeadStart(field);
  return field;
}

/** How long a run of this length is given before it is called off. Twice
 * the band's own minutes is generous enough that only a car that is never
 * coming home hits it. */
function timeout(stage: TapeStage): number {
  if (stage.length === "endless") return 300;
  const band = STAGE_RULES.stageLengths[stage.length as FiniteStageLength];
  return Math.max(300, band.minutes * 120 * Math.max(1, stage.laps));
}

/** WHAT A TIME IS WORTH AGAINST A GIVEN FIELD — the calibration itself.
 *
 * It races the crews with NOBODY on the road with them and slots `time` into
 * the result. That is not a convenience, it is the only honest way to ask
 * the question, and the reason is worth stating: a tape is a BLIND driver.
 * It steers where it steered, so a car that was not there when it was
 * recorded is a car it drives into and never corrects for — and worse, a
 * shunt that DID happen was steered out of on the recording, so replaying
 * the same corrections without it swerves. A rally start puts the crew in
 * front alongside the player, so this bites within two seconds. Re-driving a
 * recording against a field it never met therefore measures the divergence
 * and nothing else.
 *
 * Racing the field alone has none of that in it. Rivals are never resolved
 * against each other (`rubRivals` is the player's alone), so every crew's
 * time is the same time whether or not anybody was out there with them —
 * which makes "where would this drive have placed at hard" an exact
 * question with an exact answer. */
export function placeAmongField(options: {
  stage: TapeStage;
  field: FieldPlan;
  /** The time to place, seconds. */
  time: number;
  /** What the driver was in, for the result sheet's row. */
  carId?: string;
}): { rows: ClassRow[]; place: number; of: number; splits: Record<string, number[]> } {
  const { stage } = options;
  const track = compileStage(stage.seed, stage.length, stage.knobs, stage.shape);
  const field = createField(track, options.field, {
    seed: stage.seed,
    laps: stage.laps,
    timeOfDay: stage.timeOfDay,
    weather: stage.weather,
    season: stage.season,
  });
  payHeadStart(field);
  settleField(field, Infinity, settleLimit(options.time));
  const splits: Record<string, number[]> = {};
  for (const run of field.runs) splits[run.entry.crew.id] = run.splits;
  return {
    rows: fieldResults(field, { time: options.time, carId: options.carId ?? "" }),
    place: placeAtFinish(field, options.time),
    of: field.of,
    splits,
  };
}

/** Drive one whole race and classify it. */
export function race(options: RaceOptions): RaceOutcome {
  const { stage, car, start } = options;
  const track = compileStage(stage.seed, stage.length, stage.knobs, stage.shape);
  const state = createGame({
    seed: stage.seed,
    carId: car.id,
    gearbox: car.gearbox,
    track,
    laps: stage.laps,
    skipCountdown: start.skipCountdown,
    // The back row of a mass-start grid, and the metres it is owed — the one
    // slot `createField` does not hand out.
    gridOffset: start.grid?.lateral ?? 0,
    gridBack: start.grid?.back ?? 0,
    catchUp:
      start.grid && start.grid.gain > 0
        ? { gain: start.grid.gain, untilS: TUNING.massStart.catchUpS }
        : undefined,
    env: { timeOfDay: stage.timeOfDay, weather: stage.weather, season: stage.season },
    quiet: true,
  });
  const field = enterField(track, options);
  const player = options.driver.kind === "tape" ? readTape(options.driver.tape) : null;
  const profile = options.driver.kind === "bot" ? (options.driver.profile ?? RALLY_BOT) : RALLY_BOT;
  const recorder = options.record
    ? createTapeRecorder({
        engine: engineVersion,
        recorded: new Date().toISOString(),
        source: options.record.source,
        mode: options.record.mode,
        ...(options.record.levelId ? { levelId: options.record.levelId } : {}),
        stage,
        car,
        field: options.field,
        start,
      })
    : null;

  // The tape's samples, walked forward with the run: the recording is in
  // step order and so is the replay, so checking it costs a comparison and
  // never a search.
  const samples = options.driver.kind === "tape" ? options.driver.tape.samples : [];
  let sampleAt = 0;
  let worst = 0;
  let worstT = 0;
  let checked = 0;

  const splits: number[] = [];
  let finished = false;
  let time = 0;
  const book = (event: GameEvent): void => {
    if (event.type === "checkpoint") splits.push(event.time);
    else if (event.type === "finish") {
      finished = true;
      time = event.time;
    }
  };
  const maxSteps = Math.ceil((options.maxTime ?? timeout(stage)) / TUNING.dt);
  for (let i = 0; i < maxSteps; i++) {
    if (state.phase === "rollout" || state.phase === "finished") break;
    if (field) stepField(field);
    // The driver's own way out of the ceremony, taken before the step and
    // paid for by the field exactly as the app pays for it.
    if (player?.skipsAt(i) && state.phase === "intro") {
      const jumped = skipIntro(state);
      if (field) advanceField(field, jumped);
    }
    const input = player ? player.at(i) : botInput(state, profile);
    const events = step(state, input);
    for (const event of events) book(event);
    if (field) rubRivals(field, state);
    recorder?.record(input, state);
    while (sampleAt < samples.length && samples[sampleAt].step <= i) {
      const sample = samples[sampleAt++];
      if (sample.step !== i) continue;
      const off = Math.hypot(state.car.x - sample.x, state.car.z - sample.z);
      checked += 1;
      if (off > worst) {
        worst = off;
        worstT = sample.t;
      }
    }
  }

  if (!finished) time = state.raceTime;

  // R30 — the places BEHIND the player are worth points to somebody, so the
  // crews still out there are driven home before anything is classified.
  let rows: ClassRow[] = [];
  const rivalSplits: Record<string, number[]> = {};
  let place: number | null = null;
  if (field) {
    // Nothing is being rendered, so the whole run-out is taken in one go.
    settleField(field, Infinity, settleLimit(time));
    rows = fieldResults(field, { time: finished ? time : null, carId: car.id });
    for (const run of field.runs) rivalSplits[run.entry.crew.id] = run.splits;
    place = finished ? placeAtFinish(field, time) : null;
  }

  return {
    finished,
    time,
    laps: state.laps,
    lapTimes: state.lapTimes,
    splits,
    place,
    of: field ? field.of : null,
    stats: state.stats,
    rows,
    rivalSplits,
    drift: checked > 0 ? { worst, at: worstT, samples: checked } : null,
    tape:
      recorder?.seal(
        {
          finished,
          time,
          laps: state.laps,
          lapTimes: state.lapTimes,
          splits,
          place,
          of: field ? field.of : null,
          stats: state.stats,
        },
        rows
          .filter((row) => !row.you)
          .map((row) => ({
            id: row.id,
            alias: row.alias,
            driver: row.driver,
            carId: row.carId,
            time: row.time,
            place: row.place,
            splits: rivalSplits[row.id] ?? [],
          })),
      ) ?? null,
  };
}
