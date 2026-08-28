// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLASSIFICATION — what "first, second, third" means on a stage.
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
// THE HEAD START HAS TO BE PAID FOR. Thirteen intervals of driving is about
// a second of CPU, so it is spent in BUDGETED slices from the moment the
// field is entered — under the establishing shot, which is exactly long
// enough to hide it. A crew still owing time has not left the control yet:
// nothing draws it and nothing can hit it, so a whole field standing on one
// start line is invisible rather than a fifteen-car pile-up.
//
// They ARE drawn now, and they are solid (field-cars.ts, collideCars): with
// ten seconds between cars there is usually nothing on the road to see, but
// catch the crew in front and it is a car — one you can lean on, and one you
// can put off the road.
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
  GRID_STAGGER,
  TUNING,
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

/** How long the catch-up may spend per frame, ms. Sized against the beat it
 * runs under: the establishing shot is `TUNING.intro` long, so even a
 * device managing 30 fps has a couple of hundred slices to spend the
 * field's head start in, and nothing the player can see is waiting on it. */
const CATCHUP_MS = 4;

/** Steps taken between two readings of the clock inside the catch-up. Long
 * enough that the timing costs nothing, short enough that the budget is
 * still honoured on a slow device. */
const CATCHUP_GRAIN = 64;

/** Enter the field for a stage. The compiled track is SHARED with the
 * player's run: it is read-only, so fourteen more cars on it cost fourteen
 * cars and not fourteen worlds. */
export function createField(track: Track, difficulty: Difficulty, stage: FieldStage): RivalField {
  const runs = rivalField(difficulty).map((entry) => ({
    entry,
    // The rivals' clocks start at their own green light, not the player's,
    // so they skip the whole start control: their stage time is measured
    // from their first step, and the offset between the fifteen clocks is
    // carried by `owed` instead.
    state: createGame({
      seed: stage.seed,
      carId: entry.crew.carId,
      // The crews with the hands take their own gears (`gearboxFor`), which
      // is where the head of a hard field finds its top end.
      gearbox: entry.gearbox,
      track,
      laps: stage.laps,
      skipCountdown: true,
      quiet: true,
      // Off to one side of the line, because the player is on it. Only the
      // crew immediately in front is ever visible from the control, and
      // this is the metre and a bit of road that has them pulling away
      // ALONGSIDE the player instead of out from inside their bodywork.
      gridOffset: GRID_STAGGER,
      env: { timeOfDay: stage.timeOfDay, weather: stage.weather, season: stage.season },
    }),
    splits: [] as number[],
    time: null as number | null,
    done: false,
    // Car 14 leaves as the establishing shot opens and owes nothing; every
    // car ahead of them owes another interval.
    owed: (PLAYER_NUMBER - 1 - entry.number) * START_INTERVAL,
  }));
  return {
    runs,
    difficulty,
    of: FIELD_SIZE,
    playerNumber: PLAYER_NUMBER,
    interval: START_INTERVAL,
  };
}

/** A crew the world can reach: out of the control, still on the stage. What
 * is drawn, and what the player's car can hit. A run past the finish line is
 * off the road for the same reason a run that has not started is — there is
 * nowhere on a rally stage for a finished car to stand. */
export function onRoad(run: RivalRun): boolean {
  return !run.done && run.owed <= 0;
}

/** Advance one rival by one step and book whatever they went through. */
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
  for (const run of field.runs) if (onRoad(run)) advance(run);
}

/** Spend a slice of this frame on the head start the field is still owed.
 * Runs every frame from the moment the field is entered; a no-op the moment
 * everybody is out of the control. Returns true while there is more to do,
 * which is what the debug overlay reads. */
export function catchUpField(field: RivalField, budgetMs = CATCHUP_MS): boolean {
  const deadline = performance.now() + budgetMs;
  let owing = true;
  while (owing) {
    owing = false;
    for (const run of field.runs) {
      if (run.done || run.owed <= 0) continue;
      owing = true;
      for (let i = 0; i < CATCHUP_GRAIN && run.owed > 0 && !run.done; i++) {
        advance(run);
        run.owed -= TUNING.dt;
      }
    }
    if (performance.now() >= deadline) return owing;
  }
  return false;
}

/** Pay the WHOLE head start now, however long it takes. The classification
 * cannot be read while a crew is still owed road — their splits and their
 * time are simply missing — so anything that reads it drains what is left
 * rather than placing the player against a field that has not finished
 * driving. */
export function drainField(field: RivalField): void {
  while (catchUpField(field, Infinity));
}

/** Push the player's own clock forward — what skipping the establishing
 * shot does. Everybody on the road owes the same seconds, or the stagger
 * the whole classification rests on quietly shrinks. */
export function advanceField(field: RivalField, seconds: number): void {
  if (seconds <= 0) return;
  const steps = Math.round(seconds / TUNING.dt);
  for (const run of field.runs) {
    if (run.done) continue;
    // A crew still in the control takes it as more time owed; one already on
    // the road drives it, because taking it as debt would put a car that is
    // visibly out there back into the control.
    if (run.owed > 0) run.owed += seconds;
    else for (let i = 0; i < steps && !run.done; i++) advance(run);
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
      advance(run);
      stepped = true;
      if (--budget <= 0) break;
    }
    // Nobody moved: everybody is home, retired, or stopped.
    if (!stepped) break;
  }
  return field.runs.every((run) => run.done);
}

/** Stop the field where it stands. Nothing is classified off this — a run
 * abandoned for the menu is not a result — so unlike `settleField` it asks
 * nobody to finish, and unlike `drainField` it pays nobody's head start. */
export function stopField(field: RivalField): void {
  for (const run of field.runs) run.done = true;
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
