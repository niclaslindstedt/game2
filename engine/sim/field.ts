// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FIELD — the other cars on the stage, and what "first, second, third"
// means once they are all home.
//
// It means what it means in a real rally: the cars leave the start control
// one at a time, `START_INTERVAL` seconds apart, everybody drives the same
// road alone against the clock, and the result is the order of the times.
// The player is always the LAST car out (R29).
//
// THE STAGGER IS REAL, not a story told over a simultaneous start. Car 1
// leaves thirteen intervals before the player, car 14 leaves exactly one —
// on the first frame of the establishing shot, which is why the player
// WATCHES the crew in front go. Everybody is therefore genuinely up the
// road, and that is what makes a split readable: any rival whose split time
// beats yours went through that board before you got to it, so the place is
// a straight count of the better times and never a provisional one.
//
// THE RIVALS ARE REAL. There is no table of authored times here and no
// curve fitted to a par: the field is fourteen more `GameState`s on the same
// compiled track, stepped beside the player's, each driven by the real bot
// with its own skill profile (rivals.ts) in its own car. They brake for the
// corners the player brakes for, they get it wrong on the corners their
// profile is bad at, and the ones who go off lose the same seconds anybody
// loses. That costs about a percent of a frame — the track is shared, so a
// rival is a car and a terrain index and nothing more — and it buys a field
// that cannot drift away from the handling, because it IS the handling.
//
// A HEADS-UP RACE IS THE OTHER DISCIPLINE. Same crews, same bot, same road —
// but everybody leaves on one green off a grid (grid.ts), so there is no
// stagger to pay off, nobody is owed a head start, and a place read
// mid-stage is the actual order of the road rather than a count of better
// split times. The player is on the back row, and the metres that costs come
// back as the drive to take them back with; that is the whole of the catch-up
// and there is no other. Everything here is shared between the two: one
// field, one classification, one set of cars on the road.
//
// This module is the field as the ENGINE runs it: building it, stepping it,
// rubbing it against the player, and classifying it. The app's own
// `standings.ts` owns the half that only a frame has an opinion about — how
// much of THIS frame the head start may spend — and the renderer's cars hang
// off the same `RivalRun`s.

import { collideCars } from "../game/collision.ts";
import { TUNING } from "../game/defs/tuning.ts";
import type { GameEvent, GameState, Season, TimeOfDay, Weather } from "../game/state.ts";
import { createGame, skipIntro, step } from "../game/step.ts";
import type { Track } from "../mapgen/index.ts";
import { botInput } from "./bot.ts";
import { gridSize, headsUpField, massStartGrid, type GridSlot } from "./grid.ts";
import { FIELD_SIZE, GRID_STAGGER, START_INTERVAL, rivalField } from "./rivals.ts";
import type { RivalEntry } from "./rivals.ts";
import type { Difficulty } from "./skill.ts";

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
  /** Seconds of head start still to be simulated. It counts down as the
   * catch-up spends its budget; until it reaches zero this crew has not
   * left the start control and is not anywhere the world can reach. */
  owed: number;
};

/** The field entered for one stage. */
export type RivalField = {
  runs: RivalRun[];
  difficulty: Difficulty;
  /** Everybody on the start list, the player included. */
  of: number;
  /** The player's start number — last car on the road either way: the back
   * of a rally's running order, or the back row of a grid. */
  playerNumber: number;
  /** Seconds between cars leaving the start control. Zero on a mass start,
   * where nobody is owed anything and the whole field leaves together. */
  interval: number;
  /** Everybody on one grid, on one green (`grid.ts`). It changes what a
   * start MEANS, so it is carried on the field rather than inferred: a mass
   * start has no stagger to pay off, its rivals sit through the same
   * ceremony the player does, and a place read mid-stage is the real order
   * of the road rather than a count of better split times. */
  massStart: boolean;
};

/** How a field is entered: how good it is, how many cars are on it, and
 * whether they leave together. */
export type FieldPlan = {
  difficulty: Difficulty;
  /** Cars on the entry list, the player included. */
  cars: number;
  massStart: boolean;
};

/** The campaign's own plan — the whole roster, one at a time (R29). */
export const RALLY_FIELD: FieldPlan = {
  difficulty: "medium",
  cars: FIELD_SIZE,
  massStart: false,
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

/** How near a rival has to be before the contact model is asked about it, m.
 * Two capsules reach at most `halfLength × 2` centre to centre, and nothing
 * covers the slack in one 120 Hz step. */
const RUB_RANGE = 5;

/** Enter the field for a stage. The compiled track is SHARED with the
 * player's run: it is read-only, so more cars on it cost cars and not
 * worlds.
 *
 * Two start types, one field. A RALLY start sends them out `START_INTERVAL`
 * apart and carries the offset between their clocks as head start each one
 * still owes (`owed`); a MASS start stands them on a grid, hands every one of
 * them the same establishing shot and the same lights, and owes nobody
 * anything. Everything downstream — the classification, the splits, the
 * collision, the cars on the road — reads the same two structures either
 * way. */
export function createField(track: Track, plan: FieldPlan, stage: FieldStage): RivalField {
  const cars = plan.massStart ? gridSize(plan.cars) : FIELD_SIZE;
  const grid = plan.massStart ? massStartGrid(cars) : null;
  const entries = plan.massStart
    ? headsUpField(plan.difficulty, cars)
    : rivalField(plan.difficulty);
  const runs = entries.map((entry) => {
    // Where this crew is stood. A rally start is one slot beside the player,
    // taken in turn; a grid is a row and a column of its own.
    const slot = grid?.[entry.number - 1];
    return {
      entry,
      state: createGame({
        seed: stage.seed,
        carId: entry.crew.carId,
        // The crews with the hands take their own gears (`gearboxFor`), which
        // is where the head of a hard field finds its top end.
        gearbox: entry.gearbox,
        track,
        laps: stage.laps,
        // A rally rival's clock starts at their own green, which is why they
        // skip the whole start control and carry the offset as `owed`. A grid
        // shares ONE green, so its cars sit through the same shot and the same
        // lights the player does and every clock starts together.
        skipCountdown: !plan.massStart,
        quiet: true,
        // Off to one side of the line, because the player is on it. Only the
        // crew immediately in front is ever visible from a rally control, and
        // this is the metre and a bit of road that has them pulling away
        // ALONGSIDE the player instead of out from inside their bodywork. On a
        // grid it is the column of their row.
        gridOffset: slot ? slot.lateral : GRID_STAGGER,
        gridBack: slot?.back ?? 0,
        // …and the metres that row is giving away, as the drive to take them
        // back with. Pole is owed nothing and gets nothing.
        catchUp:
          slot && slot.gain > 0
            ? { gain: slot.gain, untilS: TUNING.massStart.catchUpS }
            : undefined,
        env: { timeOfDay: stage.timeOfDay, weather: stage.weather, season: stage.season },
      }),
      splits: [] as number[],
      time: null as number | null,
      done: false,
      // Car 14 leaves as the establishing shot opens and owes nothing; every
      // car ahead of them owes another interval. A grid owes nothing at all.
      owed: plan.massStart ? 0 : (cars - 1 - entry.number) * START_INTERVAL,
    };
  });
  return {
    runs,
    difficulty: plan.difficulty,
    of: cars,
    playerNumber: cars,
    interval: plan.massStart ? 0 : START_INTERVAL,
    massStart: plan.massStart,
  };
}

/** WHERE THE PLAYER STANDS on a grid of `cars` — the last slot, on the back
 * row and on the start line itself. The one place that reads it is the run
 * the player is sat in, and it has to agree with `createField` exactly or the
 * player would be entered in a slot somebody else is already stood on. */
export function playerSlot(cars: number): GridSlot {
  const grid = massStartGrid(cars);
  return grid[grid.length - 1];
}

/** A crew the world can reach: out of the control, still on the stage. What
 * is drawn, and what the player's car can hit. A run past the finish line is
 * off the road for the same reason a run that has not started is — there is
 * nowhere on a rally stage for a finished car to stand. */
export function onRoad(run: RivalRun): boolean {
  return !run.done && run.owed <= 0;
}

/** Advance one rival by one step and book whatever they went through. */
export function advanceRun(run: RivalRun): void {
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
 * through. Called from the frame loop BEFORE the player's own step: the
 * player is last on the road, so a rival reaching a board on the same tick
 * reached it first. */
export function stepField(field: RivalField): void {
  for (const run of field.runs) if (onRoad(run)) advanceRun(run);
}

/** Pay the head start the field is still owed, or as much of it as `budget`
 * allows. `budget` is called between slices of `grain` steps and returns
 * false when this caller has spent long enough for now — which is how the
 * app buys the whole stagger out of frames nobody is waiting on, and how a
 * headless run buys it in one go by never saying stop. Returns true while
 * there is still road owed. */
export function payHeadStart(
  field: RivalField,
  budget: () => boolean = () => true,
  grain = 64,
): boolean {
  let owing = true;
  while (owing) {
    owing = false;
    for (const run of field.runs) {
      if (run.done || run.owed <= 0) continue;
      owing = true;
      for (let i = 0; i < grain && run.owed > 0 && !run.done; i++) {
        advanceRun(run);
        run.owed -= TUNING.dt;
      }
    }
    if (!budget()) return owing;
  }
  return false;
}

/** Push the player's own clock forward — what skipping the establishing
 * shot does. Everybody on the road owes the same seconds, or the stagger
 * the whole classification rests on quietly shrinks. */
export function advanceField(field: RivalField, seconds: number): void {
  if (seconds <= 0) return;
  // A MASS START jumps the same beat the player jumped rather than driving
  // through it: the whole grid is sat in the same establishing shot, so
  // stepping them on would send the field down the road while the player is
  // still watching their own lights.
  if (field.massStart) {
    for (const run of field.runs) if (!run.done) skipIntro(run.state);
    return;
  }
  const steps = Math.round(seconds / TUNING.dt);
  for (const run of field.runs) {
    if (run.done) continue;
    // A crew still in the control takes it as more time owed; one already on
    // the road drives it, because taking it as debt would put a car that is
    // visibly out there back into the control.
    if (run.owed > 0) run.owed += seconds;
    else for (let i = 0; i < steps && !run.done; i++) advanceRun(run);
  }
}

/** RUN THE STRAGGLERS HOME. The player is across the line and the card is
 * up, but a classification needs everybody's time, not just the times of the
 * crews who beat them — R30's points are handed out to a finishing ORDER, and
 * the two places behind the player are worth two and one to somebody.
 *
 * So the cars still out there are driven home `steps` at a time, so a caller
 * with a frame to keep never hitches: nothing is being rendered but a
 * run-out, and a rival is one car on a track that is already compiled.
 * Anybody still going at `limit` seconds of race time is RETIRED where they
 * stand — a bot wedged nose-first against a trunk would otherwise hold the
 * results open for as long as the player was prepared to watch it.
 *
 * A crew still OWING their head start is driven home here too, and their
 * debt is left standing: `owed` places a car on the road relative to the
 * player, and the player has finished. Their time is their own race clock,
 * which never knew about the stagger — so the result is right and nothing
 * appears back at the start line while the card is up.
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
      advanceRun(run);
      stepped = true;
      if (--budget <= 0) break;
    }
    // Nobody moved: everybody is home, retired, or stopped.
    if (!stepped) break;
  }
  return field.runs.every((run) => run.done);
}

/** …and how long anybody is given before `settleField` retires them where
 * they stand: this many times the player's own stage time, plus a grace. A
 * bot wedged against a trunk is a car that is never coming home, and the
 * classification cannot wait for it. */
const SETTLE_SLACK = 1.8;
const SETTLE_GRACE = 45;

/** The race clock at which a crew still out there is retired, given the time
 * the player took. One rule, so a result sheet read on the card and one read
 * off a replay retire the same crews. */
export function settleLimit(playerTime: number): number {
  return playerTime * SETTLE_SLACK + SETTLE_GRACE;
}

/** Stop the field where it stands. Nothing is classified off this — a run
 * abandoned for the menu is not a result — so unlike `settleField` it asks
 * nobody to finish, and unlike `payHeadStart` it pays nobody's debt. */
export function stopField(field: RivalField): void {
  for (const run of field.runs) run.done = true;
}

/** THE ONE PLACE TWO CARS CAN BE AT ONCE. Ask the contact model about every
 * crew within reach of the player and let both halves land: the player's
 * events come back for the caller to put through whatever door an impact
 * normally goes through, and each rival's are handed to `theirs` as they
 * happen — they crumple and shed parts over there, where nothing the player
 * hears or feels is coming from. */
export function rubRivals(
  field: RivalField,
  state: GameState,
  theirs?: (run: RivalRun, events: GameEvent[]) => void,
): GameEvent[] {
  // The player is in the start control until the lights go out, and a car in
  // the control is not somewhere the world can reach: it is why the crew in
  // front can leave from the line the player is sat on.
  if (state.phase !== "racing" && state.phase !== "rollout") return [];
  const mine: GameEvent[] = [];
  for (const run of field.runs) {
    if (!onRoad(run)) continue;
    const them = run.state.car;
    if (Math.abs(them.x - state.car.x) > RUB_RANGE) continue;
    if (Math.abs(them.z - state.car.z) > RUB_RANGE) continue;
    const hits: GameEvent[] = [];
    collideCars(
      { spec: state.spec, car: state.car, events: mine, stats: state.stats },
      { spec: run.state.spec, car: them, events: hits, stats: run.state.stats },
    );
    if (hits.length > 0) theirs?.(run, hits);
  }
  return mine;
}

/** Where the player stands at split board `split` (0-based) having reached
 * it at race time `at`: one place for every crew through it quicker, plus
 * their own. The stagger is what makes this exact rather than provisional —
 * a rival with a better split time went through that board while the player
 * was still up the road. */
export function placeAtSplit(field: RivalField, split: number, at: number): number {
  let ahead = 0;
  for (const run of field.runs) {
    const time = run.splits[split];
    if (time !== undefined && time < at) ahead += 1;
  }
  return ahead + 1;
}

/** …and at the finish line, by the same count. */
export function placeAtFinish(field: RivalField, at: number): number {
  let ahead = 0;
  for (const run of field.runs) if (run.time !== null && run.time < at) ahead += 1;
  return ahead + 1;
}

/** What the classification calls the player's own run. A crew id nobody in
 * `RIVALS` can ever hold, because the campaign files points under it. */
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
  player: { time: number | null; carId: string },
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
