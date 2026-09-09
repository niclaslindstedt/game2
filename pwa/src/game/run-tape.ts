// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RECORDING THE RUN THE PLAYER IS SAT IN, so it can be driven again by
// something that is not a player.
//
// The engine owns the format and the replay (engine/sim/tape.ts,
// engine/sim/race.ts); this is the browser's half of it — the header built
// out of the app's own StageSpec, and the file put on a disk.
//
// EVERY REAL RUN IS RECORDED. A tape is the only thing in the game that can
// put a drive back on the road exactly as it happened, so it is what REPLAYS
// are made of (replay.ts): the run just driven is always in hand, whether or
// not the player ever asks to see it, because a recorder armed after the fact
// records nothing. Nothing is armed behind the menu, where the stage is
// scenery a bot is driving.
//
// IT IS ALSO THE CALIBRATION ARTIFACT. A human drive is the only honest
// measuring stick for a difficulty: `npm run tape -- replay <file>
// --difficulty easy,medium,hard` puts the SAME driving in front of all three
// fields and prints where it placed in each. Hard being hard is a thing you
// can then read off a table instead of arguing about — which is what the
// developer switch (COLLECT RACE DATA) still buys: the results card's press
// that puts the same tape on a disk as a file.
//
// WHAT A HEADER OWES. Everything the engine was handed that a rebuild cannot
// re-derive: the stage AND the conditions crossing it, the car and its box,
// the field's plan, where the driver stood on the grid, and `damageScale` —
// the one difficulty setting that reaches the physics. Anything missing here
// is a replay that is somewhere else by the first corner.

import {
  TUNING,
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
  type Weather,
} from "@engine";

import type { ClassRow } from "./standings.ts";

/** THE MOST A RECORDING MAY RUN TO, steps — twenty minutes at the physics
 * rate. Every stage the game generates is well inside it (the longest band is
 * about eight minutes of driving), and what the ceiling is actually for is
 * the ENDLESS road: it has no finish line to stop the recorder at, so without
 * one a tape would go on taking lines for as long as somebody kept driving.
 * Past it the recorder simply stops, and the replay is the first twenty
 * minutes of the run. */
export const MAX_TAPE_STEPS = Math.round((20 * 60) / TUNING.dt);

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
  hour: number;
  weather: Weather;
  season: Season;
  /** The air at the datum, °C, or null for the season's own (climate.ts). */
  temperature?: number | null;
  /** How often the sandstorms come, 0..1, or absent for the country's own. */
  sandstorms?: number;
  /** The training ground rather than a generated stage. */
  arena?: boolean;
  /** What a hit costs this car, 0..1 — the one difficulty setting that
   * reaches the physics, so a replay owes it. */
  damageScale: number;
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
      hour: start.hour,
      weather: start.weather,
      season: start.season,
      temperature: start.temperature ?? null,
      ...(start.sandstorms === undefined ? {} : { sandstorms: start.sandstorms }),
      ...(start.arena ? { arena: true } : {}),
    },
    car: { id: start.carId, gearbox: start.gearbox },
    field: start.field,
    start: { skipCountdown: start.skipCountdown, grid: start.grid },
    damageScale: start.damageScale,
  });
  return {
    // Past the ceiling the recorder is simply not called again: the tape
    // stops where it stops rather than growing for the life of the tab.
    record: (input, state) => {
      if (tape.steps() >= MAX_TAPE_STEPS) return;
      tape.record(input, state);
    },
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
