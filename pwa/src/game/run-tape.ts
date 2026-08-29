// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RECORDING THE RUN THE PLAYER IS SAT IN, so it can be driven again by
// something that is not a player.
//
// The engine owns the format and the replay (engine/sim/tape.ts,
// engine/sim/race.ts); this is the browser's half of it — the header built
// out of the app's own StageSpec, and the file put on a disk. It is armed by
// a developer switch (COLLECT RACE DATA, in the developer menu) rather than
// by debug mode: collecting a drive and looking at the debug boxes are separate
// wants, and a session recorded for calibration should not have to be driven
// with an overlay across it.
//
// WHAT IT IS FOR. A tape is one human drive, and a human drive is the only
// honest measuring stick for a difficulty: `npm run tape -- replay <file>
// --difficulty easy,medium,hard` puts the SAME driving in front of all three
// fields and prints where it placed in each. Hard being hard is a thing you
// can then read off a table instead of arguing about.
//
// Nothing here costs anything when the switch is off: no recorder is built,
// and the frame loop's one call is on a null.

import {
  createTapeRecorder,
  engineVersion,
  type CarInput,
  type FieldPlan,
  type GameState,
  type GridSlot,
  type RunStats,
  type Season,
  type StageKnobs,
  type StageLength,
  type StageShape,
  type TapeRecorder,
  type TimeOfDay,
  type Weather,
} from "@engine";

import type { ClassRow } from "./standings.ts";

/** Everything about the run that is fixed before it starts — the app's
 * StageSpec, the box the car was handed, and the field that was entered. */
export type RunTapeStart = {
  seed: number;
  length: StageLength;
  shape: StageShape;
  laps: number;
  knobs: StageKnobs;
  carId: string;
  gearbox: "auto" | "manual";
  timeOfDay: TimeOfDay;
  weather: Weather;
  season: Season;
  skipCountdown: boolean;
  grid: GridSlot | null;
  /** What kind of run it is — the app's own word for it. */
  mode: string;
  levelId?: string;
  /** The field on the road, or null when nobody else is entered. */
  field: FieldPlan | null;
};

/** What the run scored, once it is over. */
export type RunTapeEnd = {
  finished: boolean;
  time: number;
  laps: number;
  lapTimes: number[];
  splits: number[];
  place: number | null;
  of: number | null;
  stats: RunStats;
  /** The stage's result sheet, once the stragglers are home. Empty while
   * they are still out there — a tape saved early is still a tape, it just
   * carries no field to compare against. */
  rows: ClassRow[];
  /** Each crew's splits, by crew id. */
  rivalSplits: Record<string, number[]>;
};

export type RunTapeRecorder = {
  record: (input: CarInput, state: GameState) => void;
  skipped: () => void;
  steps: () => number;
  /** The whole run as JSONL. */
  seal: (end: RunTapeEnd) => string;
  /** What the file should be called. */
  name: (end: RunTapeEnd) => string;
};

/** Arm a recorder for a run. Called on every start and every restart — a
 * half-written tape would replay the first attempt's corners onto the
 * second attempt's road. */
export function createRunTape(start: RunTapeStart): RunTapeRecorder {
  const tape: TapeRecorder = createTapeRecorder({
    engine: engineVersion,
    recorded: new Date().toISOString(),
    source: "player",
    mode: start.mode,
    ...(start.levelId ? { levelId: start.levelId } : {}),
    stage: {
      seed: start.seed,
      length: start.length,
      shape: start.shape,
      laps: start.laps,
      knobs: start.knobs,
      timeOfDay: start.timeOfDay,
      weather: start.weather,
      season: start.season,
    },
    car: { id: start.carId, gearbox: start.gearbox },
    field: start.field,
    start: { skipCountdown: start.skipCountdown, grid: start.grid },
  });
  return {
    record: tape.record,
    skipped: tape.skipped,
    steps: tape.steps,
    seal: (end) =>
      tape.seal(
        {
          finished: end.finished,
          time: end.time,
          laps: end.laps,
          lapTimes: end.lapTimes,
          splits: end.splits,
          place: end.place,
          of: end.of,
          stats: end.stats,
        },
        end.rows
          .filter((row) => !row.you)
          .map((row) => ({
            id: row.id,
            alias: row.alias,
            driver: row.driver,
            carId: row.carId,
            time: row.time,
            place: row.place,
            splits: end.rivalSplits[row.id] ?? [],
          })),
      ),
    // Named so a folder of them sorts into something readable: what stage,
    // in what, how long it took.
    name: (end) => `run-${start.mode}-${start.seed}-${start.carId}-${end.time.toFixed(2)}s.jsonl`,
  };
}

/** Put the tape on the player's disk. Same anchor dance as a saved
 * screenshot (lib/share-image.ts): the link goes into the document because
 * Firefox ignores a click on a detached one, and the object URL is revoked
 * on a later task because revoking it in this one races the download that
 * has only just started. Returns whether it worked. */
export function saveRunTape(text: string, name: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "application/jsonl" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
