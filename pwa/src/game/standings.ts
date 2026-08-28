// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLASSIFICATION — what "first, second, third" means on a stage.
//
// It means what it means in a real rally: the cars leave the start control
// one at a time, `START_INTERVAL` seconds apart, everybody drives the same
// road alone against the clock, and the result is the order of the times.
// The player is always the LAST car out (R29), which is what makes a
// position readable at all — everybody ahead has already been through the
// board you are arriving at, so your place at a split is simply how many of
// them got there before you did, plus one.
//
// THE RIVALS ARE REAL. There is no table of authored times here and no
// curve fitted to a par: the campaign builds fourteen more `GameState`s on
// the same compiled track and steps them beside the player's, each driven by
// the real bot with its own skill profile (engine/sim/rivals.ts) in its own
// car. They brake for the corners the player brakes for, they get it wrong
// on the corners their profile is bad at, and the ones who go off lose the
// same seconds anybody loses. That costs about a percent of a frame — the
// track is shared, so a rival is a car and a terrain index and nothing more —
// and it buys a field that cannot drift away from the handling, because it
// IS the handling.
//
// Nobody DRAWS them: with ten seconds between cars there is nothing on the
// road to see, exactly as there is nothing to see in a rally. What the
// player gets is the position in the corner of the screen, moving at every
// split board.
//
// Time trial and Roam have no field — nobody else is entered — so the one
// judgement those runs still need, how big R25's finish salute should be,
// comes from the derived start list at the bottom of this file.

import {
  botInput,
  createGame,
  finishAt,
  createRng,
  rivalField,
  step,
  FIELD_SIZE,
  PLAYER_NUMBER,
  START_INTERVAL,
  type Difficulty,
  type GameState,
  type RivalEntry,
  type Season,
  type TimeOfDay,
  type Track,
  type Weather,
} from "@engine";

/** One rival's run: their game, and the times it has posted so far. */
export type RivalRun = {
  entry: RivalEntry;
  state: GameState;
  /** Race time at each split board passed, in order. On a circuit this runs
   * on across the laps, exactly as the player's `checkpointTimes` does, so
   * the two are compared index for index. */
  splits: number[];
  /** Stage time once they are through the finish; null while they are still
   * out there. */
  time: number | null;
  /** Nothing left to step — they have finished, or the stage has. */
  done: boolean;
};

/** The field entered for one stage. */
export type RivalField = {
  runs: RivalRun[];
  difficulty: Difficulty;
  /** Everybody on the start list, the player included. */
  of: number;
  /** The player's start number — last car on the road. */
  playerNumber: number;
  /** Seconds between cars leaving the start control. */
  interval: number;
};

/** The conditions a rival is entered under: the player's, exactly. The
 * whole field runs the same seed, the same weather and the same laps —
 * a stage everybody drives in a different wind is not a result. */
export type FieldStage = {
  seed: number;
  laps: number;
  timeOfDay: TimeOfDay;
  weather: Weather;
  season: Season;
};

/** Enter the field for a stage. The compiled track is SHARED with the
 * player's run: it is read-only, so fourteen more cars on it cost fourteen
 * cars and not fourteen worlds. */
export function createField(track: Track, difficulty: Difficulty, stage: FieldStage): RivalField {
  const runs = rivalField(difficulty).map((entry) => ({
    entry,
    // The rivals' clocks start at their own green light, not the player's,
    // so they skip the countdown and the app holds them until the player's
    // lights go out. From there both clocks run on the same steps.
    state: createGame({
      seed: stage.seed,
      carId: entry.crew.carId,
      track,
      laps: stage.laps,
      skipCountdown: true,
      quiet: true,
      env: { timeOfDay: stage.timeOfDay, weather: stage.weather, season: stage.season },
    }),
    splits: [] as number[],
    time: null as number | null,
    done: false,
  }));
  return {
    runs,
    difficulty,
    of: FIELD_SIZE,
    playerNumber: PLAYER_NUMBER,
    interval: START_INTERVAL,
  };
}

/** One rival, one physics step, with whatever they went through booked. */
function advance(run: RivalRun): void {
  const events = step(run.state, botInput(run.state, run.entry.profile));
  for (const event of events) {
    if (event.type === "checkpoint") run.splits.push(event.time);
    else if (event.type === "finish") {
      run.time = event.time;
      // Past the line their run tells the classification nothing more, and
      // R25's roll-out is a celebration nobody is watching.
      run.done = true;
    }
  }
}

/** Drive the whole field one physics step, and book whatever they went
 * through. Called from the app's fixed-timestep loop BEFORE the player's own
 * step: the player is last on the road, so a rival reaching a board on the
 * same tick reached it first. */
export function stepField(field: RivalField): void {
  for (const run of field.runs) {
    if (run.done) continue;
    advance(run);
  }
}

/** RUN THE STRAGGLERS HOME. The player is across the line and the card is
 * up, but a classification needs everybody's time, not just the times of the
 * crews who beat them — R30's points are handed out to a finishing ORDER, and
 * the two places behind the player are worth two and one to somebody.
 *
 * So the cars still out there are driven home off the results card's frames,
 * `steps` at a time so the card never hitches: nothing is being rendered but
 * a run-out, and a rival is one car on a track that is already compiled.
 * Anybody still going at `limit` seconds of race time is RETIRED where they
 * stand — a bot wedged nose-first against a trunk would otherwise hold the
 * results open for as long as the player was prepared to watch it.
 *
 * Returns true once nobody is left running. */
export function settleField(field: RivalField, steps: number, limit: number): boolean {
  let budget = steps;
  while (budget > 0) {
    let stepped = false;
    for (const run of field.runs) {
      if (run.done) continue;
      if (run.state.raceTime >= limit) {
        run.done = true;
        continue;
      }
      advance(run);
      stepped = true;
      if (--budget <= 0) break;
    }
    // Nobody moved: everybody is home, retired, or stopped.
    if (!stepped) break;
  }
  return field.runs.every((run) => run.done);
}

/** Stop the field. The player's run is over — anybody still out there is
 * behind, and stepping them on costs frames the results card wants. */
export function stopField(field: RivalField): void {
  for (const run of field.runs) run.done = true;
}

/** Where the player stands at split board `split` (0-based): one place for
 * every car already through it, plus their own. */
export function placeAtSplit(field: RivalField, split: number): number {
  let ahead = 0;
  for (const run of field.runs) if (run.splits.length > split) ahead += 1;
  return ahead + 1;
}

/** …and at the finish line, by the same count. */
export function placeAtFinish(field: RivalField): number {
  let ahead = 0;
  for (const run of field.runs) if (run.time !== null) ahead += 1;
  return ahead + 1;
}

/** What the classification calls the player's own run. A crew id nobody in
 * `RIVALS` can ever hold, because the championship files points under it. */
export const PLAYER_ID = "you";

/** One line of a stage's classification: who, in what, how long it took. */
export type ClassRow = {
  /** The crew's id, or `PLAYER_ID`. */
  id: string;
  /** What the timing screen calls them — one word wide. */
  alias: string;
  driver: string;
  carId: string;
  /** Stage time, or null for a crew who never reached the line. */
  time: number | null;
  /** 1 is the stage win. Retirements are classified behind every finisher. */
  place: number;
  you: boolean;
};

/** THE STAGE'S RESULT SHEET — everybody who started, in the order they
 * finished, with the retirements at the bottom in start order. Only honest
 * once `settleField` says the road is clear: a rival still out there has no
 * time yet, and would be classified as a retirement they never made. */
export function fieldResults(
  field: RivalField,
  player: { time: number; carId: string },
): ClassRow[] {
  const rows: Omit<ClassRow, "place">[] = field.runs.map((run) => ({
    id: run.entry.crew.id,
    alias: run.entry.crew.alias,
    driver: run.entry.crew.driver,
    carId: run.entry.crew.carId,
    time: run.time,
    you: false,
  }));
  rows.push({
    id: PLAYER_ID,
    alias: "YOU",
    driver: "You",
    carId: player.carId,
    time: player.time,
    you: true,
  });
  // Times first, quickest first; anybody without one is out of the results
  // and stays in the order they left the start control.
  rows.sort((a, b) => {
    if (a.time === null || b.time === null) return a.time === null ? (b.time === null ? 0 : 1) : -1;
    return a.time - b.time;
  });
  return rows.map((row, index) => ({ ...row, place: index + 1 }));
}

/** THE CAR THE SPLIT IS MEASURED AGAINST: the leader through that board, or
 * — when the player IS the leader and nobody has been through it — nobody.
 * The number a driver needs is always the one that says how much of the
 * stage is theirs to lose. Null when the player is leading the split. */
export function splitLeader(
  field: RivalField,
  split: number,
): { time: number; alias: string } | null {
  let best: RivalRun | null = null;
  for (const run of field.runs) {
    const at = run.splits[split];
    if (at === undefined) continue;
    if (best === null || at < best.splits[split]) best = run;
  }
  return best === null ? null : { time: best.splits[split], alias: best.entry.crew.alias };
}

// ── The derived start list ────────────────────────────────────────────────
// For the runs with nobody else entered. A time trial and a Roam stage still
// end with R25's cannons, and how big the salute is IS how good the time was;
// with no field to place against, the honest stand-in is where the time would
// have slotted into a list of times the pace of this stage produces. It is
// derived rather than authored, so it moves with the handling and with the
// stage's length, and it is deterministic in the seed — a time that was worth
// third is worth third tomorrow.

/** Crews on the derived list, INCLUDING the player. */
const PAR_FIELD = 12;

/** Par pace, m/s — the pace this game's cars and stages actually produce,
 * measured with `make sim` (~97 km/h across the seeds and the three cars). */
const PAR_PACE = 25.8;

/** The list's spread, as multiples of par time. The fast end is deliberately
 * just UNDER par: a clean run is a podium and a scruffy one is not. */
const SPREAD = { fastest: 0.93, slowest: 1.26 };

/** How far a crew's own time wanders off its slot, as a fraction of the gap
 * between slots. Under half a slot, so the order still broadly holds. */
const JITTER = 0.42;

/** A stage's result: where the time placed, and out of how many. */
export type Standing = {
  /** 1 is a win. Never below 1, never above `of`. */
  place: number;
  of: number;
};

/** The derived times on a stage, quickest first. */
function parList(track: Track): number[] {
  const raced = finishAt(track) ?? track.length;
  const par = raced / PAR_PACE;
  const rivals = PAR_FIELD - 1;
  // A stream of its own, mixed off the seed: adding a start list must not
  // shift a single number the stage geometry or the physics draws.
  const rng = createRng((track.seed ^ 0x3c6ef372) >>> 0);
  const step = (SPREAD.slowest - SPREAD.fastest) / Math.max(1, rivals - 1);
  const times: number[] = [];
  for (let i = 0; i < rivals; i++) {
    const slot = SPREAD.fastest + step * i;
    times.push(par * (slot + step * rng.range(-JITTER, JITTER)));
  }
  return times.sort((a, b) => a - b);
}

/** Where `time` places on that derived list. */
export function classify(track: Track, time: number): Standing {
  const rivals = parList(track);
  let ahead = 0;
  while (ahead < rivals.length && rivals[ahead] < time) ahead += 1;
  return { place: ahead + 1, of: rivals.length + 1 };
}
