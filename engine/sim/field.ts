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
// compiled track, each driven by the real bot with its own skill profile
// (rivals.ts) in its own car. They brake for the corners the player brakes
// for, they get it wrong on the corners their profile is bad at, and the
// ones who go off lose the same seconds anybody loses. The track is shared,
// so a rival is a car and a terrain index and nothing more — and it buys a
// field that cannot drift away from the handling, because it IS the handling.
//
// THE CAMPAIGN'S FIELD IS A FIELD OF GHOSTS (`contact: false`). A real
// rally starts its cars minutes apart and nobody ever meets; this one
// starts them ten seconds apart so the road ahead is never empty, and the
// price of that is that catching a crew has to mean nothing. So every
// campaign crew drives its stage ALONE — blind to the player and to each
// other — and their whole run is written down before the lights go green
// (trace.ts) and played back by the clock: during the race a rival costs a
// lookup, not a step, and nothing on the road can touch it or be touched by
// it. Only that field can be looked up, because only a car nobody can
// disturb drives the same run twice.
//
// A HEADS-UP RACE IS THE OTHER DISCIPLINE, and the one where the cars are
// SOLID. Same crews, same bot, same road — but everybody leaves on one green
// off a grid (grid.ts), so there is no stagger to pay off, nobody is owed a
// head start, and a place read mid-stage is the actual order of the road
// rather than a count of better split times. The player is on the back row,
// and the metres that costs come back as the drive to take them back with;
// that is the whole of the catch-up and there is no other. The crews see
// each other and the player, lean on whoever their temper says, and are
// resolved through the contact model both against the player and among
// themselves. Everything here is shared between the two: one field, one
// classification, one set of cars on the road.
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
import { botInput, type TrafficCar } from "./bot.ts";
import { gridSize, headsUpField, massStartGrid, type GridSlot } from "./grid.ts";
import { FIELD_SIZE, GRID_STAGGER, START_INTERVAL, rivalField } from "./rivals.ts";
import type { RivalEntry } from "./rivals.ts";
import type { Difficulty } from "./skill.ts";
import {
  createPlayback,
  createTrace,
  playTo,
  recordStep,
  shadowState,
  type Playback,
  type RunTrace,
} from "./trace.ts";

/** One rival's run: their game, and the times it has posted so far. */
export type RivalRun = {
  entry: RivalEntry;
  /** The crew's game as the world reads it: what is drawn, hit, spectated
   * and classified. On a solid field it is the game being stepped; on a
   * field of ghosts it is a SHOWN copy, posed off the trace by the clock. */
  state: GameState;
  /** The game the bot actually drives. The same object as `state` on a
   * solid field; on a field of ghosts it runs ahead of the clock — through
   * the whole stage before the green — and is never read by anybody but
   * the trace. */
  sim: GameState;
  /** The crew's run written down, on a field of ghosts; null where the
   * crews are stepped live. */
  trace: RunTrace | null;
  /** Where the trace's playback has got to. */
  play: Playback;
  /** The crew's own step index at the field's clock zero — the head start
   * their start number gives them, in steps. Zero on a live field and on a
   * grid, where everybody's clock is the player's. */
  offset: number;
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
   * left the start control and is not anywhere the world can reach. On a
   * field of ghosts it is the same debt read off the trace: how far the
   * clock has run past what has been written down. */
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
  /** Whether the cars on this field are SOLID — see `FieldPlan.contact`. */
  contact: boolean;
  /** The player's own clock, in steps since the establishing shot opened.
   * What a field of ghosts is played back by; a solid field steps its own
   * games and only counts it. */
  clock: number;
};

/** How a field is entered: how good it is, how many cars are on it,
 * whether they leave together, and whether they can be touched. */
export type FieldPlan = {
  difficulty: Difficulty;
  /** Cars on the entry list, the player included. */
  cars: number;
  massStart: boolean;
  /** Whether the cars are SOLID. On, and every crew sees the road as a
   * race — the player and each other — and is resolved through the contact
   * model both ways; off, and every crew drives the stage alone, blind to
   * everybody, with its whole run written down before the green and played
   * back by the clock (trace.ts): nothing on the road can touch it or be
   * touched by it. The campaign is off — its ten-second interval is a
   * story told over a stage real rallies run minutes apart, and the price
   * of the story is that a car you catch is a car you drive through. A
   * heads-up race is on: that IS the discipline. */
  contact: boolean;
};

/** The campaign's own plan — the whole roster, one at a time (R29), and
 * nobody solid. */
export const RALLY_FIELD: FieldPlan = {
  difficulty: "medium",
  cars: FIELD_SIZE,
  massStart: false,
  contact: false,
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
 * covers the slack in one step. */
const RUB_RANGE = 5;

/** The pace a crew has to be making, on average over the whole stage, for
 * its trace to keep being written, m/s — and the grace on top. A crew
 * averaging under 30 km/h is wedged, not slow, and a trace is memory: the
 * run is sealed where it stands and the crew is a retirement. It is well
 * clear of any limit the run-out applies (`settleLimit`), which is what
 * actually decides the sheet; this only bounds what a trace can cost. */
const TRACE_PACE = 9;
const TRACE_GRACE = 120;

/** Steps a traced run is given before it is sealed where it stands. */
function traceCap(track: Track, laps: number): number {
  return Math.ceil(((laps * track.length) / TRACE_PACE + TRACE_GRACE) / TUNING.dt);
}

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
 * way.
 *
 * Two kinds of car, one field. SOLID crews are stepped live beside the
 * player; GHOSTS (`plan.contact` off) get a shown state of their own and a
 * trace their sim is written into ahead of the clock — see the module note. */
export function createField(track: Track, plan: FieldPlan, stage: FieldStage): RivalField {
  const cars = plan.massStart ? gridSize(plan.cars) : FIELD_SIZE;
  const grid = plan.massStart ? massStartGrid(cars) : null;
  const entries = plan.massStart
    ? headsUpField(plan.difficulty, cars)
    : rivalField(plan.difficulty);
  const cap = traceCap(track, stage.laps);
  const runs = entries.map((entry): RivalRun => {
    // Where this crew is stood. A rally start is one slot beside the player,
    // taken in turn; a grid is a row and a column of its own.
    const slot = grid?.[entry.number - 1];
    // Car 14 leaves as the establishing shot opens and owes nothing; every
    // car ahead of them owes another interval. A grid owes nothing at all.
    const owed = plan.massStart ? 0 : (cars - 1 - entry.number) * START_INTERVAL;
    const sim = createGame({
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
        slot && slot.gain > 0 ? { gain: slot.gain, untilS: TUNING.massStart.catchUpS } : undefined,
      env: { timeOfDay: stage.timeOfDay, weather: stage.weather, season: stage.season },
    });
    const ghost = !plan.contact;
    return {
      entry,
      state: ghost ? shadowState(sim) : sim,
      sim,
      trace: ghost ? createTrace(sim, cap) : null,
      play: createPlayback(),
      offset: ghost ? Math.round(owed / TUNING.dt) : 0,
      splits: [],
      time: null,
      done: false,
      owed,
    };
  });
  const field: RivalField = {
    runs,
    difficulty: plan.difficulty,
    of: cars,
    playerNumber: cars,
    interval: plan.massStart ? 0 : START_INTERVAL,
    massStart: plan.massStart,
    contact: plan.contact,
    clock: 0,
  };
  // A ghost is shown where its clock puts it from the first frame: car 14
  // on the line, everybody ahead of them still owed and off the road.
  if (!plan.contact) for (const run of runs) syncGhost(run, 0, false);
  return field;
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

/** Advance one rival by one step and book whatever they went through.
 * `traffic` is the cars they can see; empty is a crew driving alone, which
 * is what every path except `stepField` hands them — see the note on
 * `stepField` for why that is the only honest answer there.
 *
 * On a field of ghosts this drives the SIM, not the shown state, and what
 * it went through is written to the trace rather than booked: the sheet is
 * filled in as the clock replays it (`syncGhost`), so a ghost's splits land
 * on the classification at the moment they would have on a live field. */
export function advanceRun(run: RivalRun, traffic?: readonly TrafficCar[]): void {
  const sim = run.sim;
  const events = step(sim, botInput(sim, run.entry.profile, traffic));
  if (run.trace) recordStep(run.trace, sim, events);
  else bookRun(run, events);
}

/** Book one crew's step: the boards they went through, and the line. On a
 * ghost the shown state's own books are kept here too, since nothing steps
 * it: the board count the minimap reads, and the lap times a spectator's
 * clock is captioned with. */
function bookRun(run: RivalRun, events: readonly GameEvent[]): void {
  const shown = run.trace ? run.state : null;
  for (const event of events) {
    if (event.type === "checkpoint") {
      run.splits.push(event.time);
      if (shown) {
        shown.checkpointsPassed += 1;
        shown.checkpointTimes.push(event.time);
      }
    } else if (event.type === "lap") {
      if (shown) {
        shown.lapTimes.push(event.time);
        shown.lapStart += event.time;
      }
    } else if (event.type === "finish") {
      run.time = event.time;
      // Past the line their run tells the classification nothing more, and
      // R25's roll-out is a celebration nobody is watching.
      run.done = true;
    } else if (event.type === "retire") {
      // Stopped for good short of the line: a DNF on the sheet, with no
      // time to sort by, and off the road exactly as a finished car is.
      run.done = true;
    }
  }
}

/** Scratch for a ghost's replayed events: one list, emptied per crew per
 * tick, because this runs for every crew on every step of a stage. */
const REPLAYED: GameEvent[] = [];

/** Write a ghost's trace forward until it covers step `at` of its own run,
 * or the run is over. This is the precalculation itself, one crew at a
 * time; `payHeadStart` is what spends it in budgeted slices. */
function traceTo(run: RivalRun, at: number): void {
  const trace = run.trace!;
  while (!trace.sealed && trace.steps < at) advanceRun(run);
}

/** PUT A GHOST WHERE THE CLOCK SAYS. Its step is the clock plus its head
 * start; if the trace reaches it, the shown car is posed there and every
 * board and impact between the last sync and this one is booked and handed
 * to `theirs`. If the trace does NOT reach it the crew is owed that road —
 * off the road and untouchable, exactly as a live crew still in the control
 * — unless `extend` says to write it now, which the run-outs do and a frame
 * in the middle of a race does not.
 *
 * A trace sealed short of a finish or a retirement (the crew ran out of
 * `traceCap`) retires the crew at its end: a DNF, as the run-out's limit
 * would have made of it. */
function syncGhost(
  run: RivalRun,
  clock: number,
  extend: boolean,
  theirs?: (run: RivalRun, events: GameEvent[]) => void,
): void {
  const trace = run.trace!;
  const at = clock + run.offset;
  if (extend) traceTo(run, at);
  run.owed = Math.max(0, (at - trace.steps) * TUNING.dt);
  if (run.done) return;
  // Owed road that is still being written is a crew still in the control.
  // Owed road past a SEALED trace is not: the run ended before the clock
  // got there — car 1 is home before the shot opens on a short stage — and
  // it is played out to its end and booked, with the debt left standing on
  // the sheet exactly as a live crew's is (`settleField`).
  if (run.owed > 0 && !trace.sealed) return;
  REPLAYED.length = 0;
  playTo(trace, run.play, at, run.state, REPLAYED);
  if (REPLAYED.length > 0) {
    bookRun(run, REPLAYED);
    if (theirs) theirs(run, REPLAYED);
  }
  if (trace.sealed && at >= trace.steps) run.done = true;
}

/** One tick of the clock over a field of ghosts. */
function tickGhosts(
  field: RivalField,
  extend: boolean,
  theirs?: (run: RivalRun, events: GameEvent[]) => void,
): void {
  field.clock += 1;
  for (const run of field.runs) syncGhost(run, field.clock, extend, theirs);
}

/** Whether every crew's run is written down — true from the start on a
 * solid field, which has nothing to write. The app holds the lights on a
 * field of ghosts until this says so: a ghost the clock outruns is a car
 * that vanishes from the road, and the beat to spend the seconds in is
 * before the green rather than during the first corner. */
export function fieldTraced(field: RivalField): boolean {
  if (field.contact) return true;
  for (const run of field.runs) if (!run.trace!.sealed) return false;
  return true;
}

/** One car as a bot's eyes see it — no more than a driver reads out of a
 * mirror, and nothing at all about who is in it. */
function seenAs(state: GameState): TrafficCar {
  const car = state.car;
  return { x: car.x, z: car.z, u: car.u, lateral: state.lateral };
}

/** How much bodywork this car has lost in total, m — every zone plus the
 * floorpan. Read either side of a contact, the difference is what that
 * contact cost it. */
function folded(state: GameState): number {
  const damage = state.car.damage;
  let total = damage.belly;
  for (let i = 0; i < damage.zones.length; i++) total += damage.zones[i];
  return total;
}

/** How fast `state` is travelling toward the point `(px, pz)`, m/s. The
 * engine's forward axis is `(sin h, cos h)` and its right axis
 * `(cos h, -sin h)`, so the world velocity is both of those weighted by the
 * car's own `u` and `w`. */
function closingOn(state: GameState, px: number, pz: number): number {
  const car = state.car;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  let dx = px - car.x;
  let dz = pz - car.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return 0;
  dx /= d;
  dz /= d;
  return (car.u * sinH + car.w * cosH) * dx + (car.u * cosH - car.w * sinH) * dz;
}

/** WHO DROVE INTO WHOM — the one closing on the other faster, and only if
 * either was closing at all. Read BEFORE the impulse rewrites both
 * velocities. The crush is near enough symmetric between equal cars, so
 * this is the only thing that separates a crew who leans on the field from
 * one the field leans on. */
function drivenInto(a: RivalRun, b: RivalRun): RivalRun | null {
  const toB = closingOn(a.state, b.state.car.x, b.state.car.z);
  const toA = closingOn(b.state, a.state.car.x, a.state.car.z);
  if (toB <= 0 && toA <= 0) return null;
  return toB >= toA ? a : b;
}

/** Told about every pair of RIVALS the step resolved, who drove in, and what
 * the meeting cost each of them in metres of folded panel. Fires on every
 * step the two are touching, so counting episodes is the caller's job. */
export type FieldContact = (
  a: RivalRun,
  b: RivalRun,
  by: RivalRun | null,
  crushA: number,
  crushB: number,
) => void;

/** Scratch for `stepField`, which runs `TUNING.physicsHz` times a second for as long as a
 * stage lasts and has no business allocating three lists every time. Only
 * that function touches them, and it never re-enters itself. */
const LIVE: RivalRun[] = [];
const TRAFFIC: TrafficCar[] = [];
const EVENTS: GameEvent[][] = [];

/** Drive the whole field one physics step, and book whatever they went
 * through. Called from the frame loop BEFORE the player's own step: the
 * player is last on the road, so a rival reaching a board on the same tick
 * reached it first.
 *
 * THREE THINGS HAPPEN HERE, in this order and no other:
 *
 *   1. EVERYBODY LOOKS, off ONE snapshot. Each crew is handed the others as
 *      `TrafficCar`s read before anything moved, so no car reacts to a
 *      position another car has already been given this step — which is what
 *      makes the result independent of the order of the array. `player` is
 *      the car they are RACING: handed in so the bots can see it, never
 *      driven and never resolved here, because a thumb steers it and its
 *      contacts are `rubRivals`' on its own step.
 *   2. EVERYBODY DRIVES.
 *   3. EVERYBODY MEETS. Every pair near enough is resolved through
 *      `collideCars` — both ledgers written at once, both bodies folded.
 *
 * Step 3 happens HERE AND NOWHERE ELSE, because this is the only place the
 * whole field takes the same tick. `payHeadStart` and `settleField` drive
 * each run on its own clock: a crew being fast-forwarded through its head
 * start is at a different moment of the stage than the one beside it in the
 * array, and a shunt between those two is a shunt that never happened.
 *
 * `theirs` receives each crew's own events, for anything drawing them.
 * `contact` receives the pairs, for anything counting them (`heat.ts`).
 *
 * A FIELD OF GHOSTS does none of the three. The clock ticks and every crew
 * is placed off its trace — nobody looks, nobody drives, nobody meets — and
 * `theirs` still receives what each crew went through on that step, read
 * back off the recording. */
export function stepField(
  field: RivalField,
  player: GameState | null = null,
  theirs?: (run: RivalRun, events: GameEvent[]) => void,
  contact?: FieldContact,
): void {
  if (!field.contact) {
    tickGhosts(field, false, theirs);
    return;
  }
  field.clock += 1;
  LIVE.length = 0;
  for (const run of field.runs) if (onRoad(run)) LIVE.push(run);
  const count = LIVE.length;
  if (count === 0) return;

  // 1 — one snapshot, taken before anybody moves.
  TRAFFIC.length = 0;
  for (let i = 0; i < count; i++) TRAFFIC.push(seenAs(LIVE[i].state));
  if (player && (player.phase === "racing" || player.phase === "rollout")) {
    TRAFFIC.push(seenAs(player));
  }

  // 2 — everybody drives. Each crew is handed the list with its OWN entry
  // swapped out from under it: a fresh array per car per step is a hundred
  // and something allocations a second for a list that is the same list
  // every time.
  const last = TRAFFIC.length - 1;
  for (let i = 0; i < count; i++) {
    const run = LIVE[i];
    const self = TRAFFIC[i];
    const end = TRAFFIC[last];
    TRAFFIC[i] = end;
    TRAFFIC.length = last;
    const events = step(run.state, botInput(run.state, run.entry.profile, TRAFFIC));
    TRAFFIC.length = last + 1;
    TRAFFIC[last] = end;
    TRAFFIC[i] = self;
    bookRun(run, events);
    if (theirs && events.length > 0) theirs(run, events);
  }

  // 3 — everybody meets.
  for (let i = 0; i < count; i++) {
    const a = LIVE[i];
    for (let j = i + 1; j < count; j++) {
      const b = LIVE[j];
      if (Math.abs(a.state.car.x - b.state.car.x) > RUB_RANGE) continue;
      if (Math.abs(a.state.car.z - b.state.car.z) > RUB_RANGE) continue;
      // Read the bodywork either side only when somebody is listening: it is
      // a walk of both damage rings, and on most of the steps that get this
      // far the two cars merely passed close.
      const beforeA = contact ? folded(a.state) : 0;
      const beforeB = contact ? folded(b.state) : 0;
      const by = contact ? drivenInto(a, b) : null;
      let hersAt = EVENTS[i];
      if (!hersAt) EVENTS[i] = hersAt = [];
      let hisAt = EVENTS[j];
      if (!hisAt) EVENTS[j] = hisAt = [];
      hersAt.length = 0;
      hisAt.length = 0;
      const met = collideCars(
        { spec: a.state.spec, car: a.state.car, events: hersAt, stats: a.state.stats },
        { spec: b.state.spec, car: b.state.car, events: hisAt, stats: b.state.stats },
      );
      if (theirs) {
        if (hersAt.length > 0) theirs(a, hersAt);
        if (hisAt.length > 0) theirs(b, hisAt);
      }
      if (met && contact) {
        contact(a, b, by, folded(a.state) - beforeA, folded(b.state) - beforeB);
      }
    }
  }
}

/** Pay the head start the field is still owed, or as much of it as `budget`
 * allows. `budget` is called between slices of `grain` steps and returns
 * false when this caller has spent long enough for now — which is how the
 * app buys the whole stagger out of frames nobody is waiting on, and how a
 * headless run buys it in one go by never saying stop. Returns true while
 * there is still road owed.
 *
 * On a field of ghosts the debt is the WHOLE STAGE, and it is paid in the
 * order the road needs it: first every crew the clock has already outrun —
 * car 13 is ten seconds up the road on the first frame of the shot and has
 * to be somewhere — and only then on to the line for everybody. Returns
 * true while any crew's run is still being written. */
export function payHeadStart(
  field: RivalField,
  budget: () => boolean = () => true,
  grain = 64,
): boolean {
  if (!field.contact) return traceField(field, budget, grain);
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

/** `payHeadStart` for ghosts: write every trace to its end, the crews the
 * clock is waiting on first. Each slice re-poses the crew it wrote, so a
 * frame that spent its budget here draws what it paid for. */
function traceField(field: RivalField, budget: () => boolean, grain: number): boolean {
  let writing = true;
  while (writing) {
    writing = false;
    // Pass one: whoever the clock has outrun. Pass two: everybody else.
    for (let pass = 0; pass < 2; pass++) {
      for (const run of field.runs) {
        const trace = run.trace!;
        if (trace.sealed) continue;
        const owedNow = run.owed > 0;
        if (pass === 0 ? !owedNow : owedNow) continue;
        writing = true;
        for (let i = 0; i < grain && !trace.sealed; i++) advanceRun(run);
        syncGhost(run, field.clock, false);
        if (!budget()) return true;
      }
    }
  }
  return false;
}

/** Push the player's own clock forward — what skipping the establishing
 * shot does. Everybody on the road owes the same seconds, or the stagger
 * the whole classification rests on quietly shrinks. */
export function advanceField(field: RivalField, seconds: number): void {
  if (seconds <= 0) return;
  const steps = Math.round(seconds / TUNING.dt);
  // GHOSTS take it as clock. A crew already out on the road is written that
  // far now, so it is still there when the shot lands (the trace usually
  // covers it long since); one still in the control simply owes it, as a
  // live crew would.
  if (!field.contact) {
    const out = field.runs.map(onRoad);
    field.clock += steps;
    field.runs.forEach((run, i) => syncGhost(run, field.clock, out[i]));
    return;
  }
  field.clock += steps;
  // A MASS START jumps the same beat the player jumped rather than driving
  // through it: the whole grid is sat in the same establishing shot, so
  // stepping them on would send the field down the road while the player is
  // still watching their own lights.
  if (field.massStart) {
    for (const run of field.runs) if (!run.done) skipIntro(run.state);
    return;
  }
  for (const run of field.runs) {
    if (run.done) continue;
    // A crew still in the control takes it as more time owed; one already on
    // the road drives it, because taking it as debt would put a car that is
    // visibly out there back into the control.
    if (run.owed > 0) run.owed += seconds;
    else for (let i = 0; i < steps && !run.done; i++) advanceRun(run);
  }
}

/** THE FIELD, STOOD AT THE MOMENT THE PLAYER WAS (game/place.ts). `jumped`
 * is the sim the player's clock skipped to get there, and everybody on the
 * road has to have driven it, or the stagger the classification rests on
 * is the one thing a placed run would get wrong.
 *
 * A rally start is `advanceField`'s own rule — the crews on the road drive
 * the seconds, the crews still in the control owe them — with the debt paid
 * off HERE rather than in frame slices under an establishing shot nobody
 * placed a run to watch: a placed frame is honest from its first render.
 * A mass start shares the player's clock exactly, so its crews are driven
 * from their own lights until their sim time reaches the player's.
 *
 * Ghosts are the simplest case of all: the clock is the player's, whole
 * stage is written down, and everybody is posed off it. */
export function placeField(field: RivalField, state: GameState, jumped: number): void {
  if (!field.contact) {
    field.clock = Math.round(state.t / TUNING.dt);
    payHeadStart(field);
    for (const run of field.runs) syncGhost(run, field.clock, true);
    return;
  }
  if (field.massStart) {
    field.clock = Math.round(state.t / TUNING.dt);
    for (const run of field.runs) {
      if (run.done) continue;
      skipIntro(run.state);
      while (!run.done && run.state.t < state.t - TUNING.dt / 2) advanceRun(run);
    }
    return;
  }
  advanceField(field, jumped);
  payHeadStart(field);
}

/** Retire anybody who has been out there past `limit` seconds of their own
 * race clock, and say whether that leaves the road clear. Stated once and
 * read by both run-outs below, so a sheet read off a card the player watched
 * retires exactly the crews a sheet read off one they did not. */
function retireOverdue(field: RivalField, limit: number): boolean {
  let running = false;
  for (const run of field.runs) {
    if (run.done) continue;
    if (run.state.raceTime >= limit) run.done = true;
    else running = true;
  }
  return !running;
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
 * EVERY CREW IS DRIVEN ALONE here, and that is what makes the result
 * independent of the rate it is settled at: a time is a crew's own clock at
 * their own line, so stepping one of them more often than the one beside it
 * cannot move either time. `watchField` leans on exactly that.
 *
 * A crew still OWING their head start is driven home here too, and their
 * debt is left standing: `owed` places a car on the road relative to the
 * player, and the player has finished. Their time is their own race clock,
 * which never knew about the stagger — so the result is right and nothing
 * appears back at the start line while the card is up.
 *
 * Returns true once nobody is left running. */
export function settleField(field: RivalField, steps: number, limit: number): boolean {
  if (!field.contact) return runOutGhosts(field, steps, limit);
  let budget = steps;
  while (budget > 0) {
    if (retireOverdue(field, limit)) break;
    let stepped = false;
    for (const run of field.runs) {
      if (run.done) continue;
      advanceRun(run);
      stepped = true;
      if (--budget <= 0) break;
    }
    // Nobody moved: everybody is home, retired, or stopped.
    if (!stepped) break;
  }
  return field.runs.every((run) => run.done);
}

/** …AND THE SAME RUN-OUT AT RACE SPEED, for a player who would rather WATCH
 * the rest of the field come home than read the sheet it produces. `ticks`
 * is physics steps of their time — a frame's worth — and every crew still
 * out there takes all of them.
 *
 * It is the settle at a hundredth of the rate and nothing else: each crew is
 * driven alone, by the same `advanceRun`, retired by the same rule. So the
 * classification a spectator watches being decided is the classification
 * they would have been handed had they never looked, which is the whole
 * point — a result that depended on who was watching would not be a result.
 *
 * Returns true once nobody is left running. */
export function watchField(field: RivalField, ticks: number, limit: number): boolean {
  if (!field.contact) return runOutGhosts(field, ticks, limit);
  for (let i = 0; i < ticks; i++) {
    if (retireOverdue(field, limit)) break;
    for (const run of field.runs) if (!run.done) advanceRun(run);
  }
  return field.runs.every((run) => run.done);
}

/** BOTH RUN-OUTS, for ghosts: the clock ticks on and the crews are read
 * off their traces — written on the spot if the green came before the
 * writing was done — and retired by the same limit. Settling and watching
 * are one function here because a lookup is the same lookup however fast
 * it is asked for. */
function runOutGhosts(field: RivalField, ticks: number, limit: number): boolean {
  for (let i = 0; i < ticks; i++) {
    if (retireOverdue(field, limit)) break;
    tickGhosts(field, true);
    if (field.runs.every((run) => run.done)) break;
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
  // Ghosts are driven through. That is the whole bargain of the campaign's
  // tight interval, and it is made here and nowhere else.
  if (!field.contact) return [];
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

/** HOW FAR ROUND THE STAGE a run has got, m: the laps already in the book
 * plus the road covered on this one. `progressS` restarts at every lap, so a
 * circuit needs the laps adding back or the leader would drop to last every
 * time they crossed the line. */
function covered(state: GameState): number {
  return (state.lap - 1) * state.track.length + state.progressS;
}

/** How little road two cars can be apart and still count as level, m. Small
 * enough that it only ever fires where it is meant to — a grid, where the
 * whole field's arc position is the start gate's — and inside a car's own
 * bodywork anywhere else, where a frame settles it either way. */
const GRID_TIE = 0.05;

/** R29 — WHERE A CAR IS RIGHT NOW, on a road everybody left together.
 *
 * A staggered rally cannot answer this and does not try: the cars are minutes
 * apart, and the only moment anybody's position is actually known is a split
 * board (`placeAtSplit`). A HEADS-UP race can answer it on every frame,
 * because there is no stagger to reason about — the order of the road IS the
 * order of the race. So the position board reads live there, and a place
 * taken in a corner is on the HUD before the car is straight again.
 *
 * Everybody home is ahead of everybody still driving; everybody still driving
 * is placed by how much road they have covered, with the GRID as the
 * tie-break, because a stage's arc position is measured from the start gate
 * and a grid stands behind it: on the line every car reads the same road
 * covered, and the order there is the order they are stood in. */
export function livePlace(field: RivalField, state: GameState): number {
  const mine = covered(state);
  let ahead = 0;
  for (const run of field.runs) {
    if (!onRoad(run)) {
      // Home already, or not out of the control yet. A crew with a time is
      // ahead of anybody who has not finished; one still owed a head start
      // is not on the road at all — and a mass start owes nobody anything.
      if (run.time !== null) ahead += 1;
      continue;
    }
    const theirs = covered(run.state);
    if (theirs > mine + GRID_TIE) ahead += 1;
    else if (theirs > mine - GRID_TIE && run.entry.number < field.playerNumber) ahead += 1;
  }
  return ahead + 1;
}

/** WHO IS STILL OUT THERE, leader first — the crews a run-out can be watched
 * through, in the order the road puts them. Measured by road covered, the
 * same reading `livePlace` counts, so "the leader" is the car actually in
 * front and walking the list is walking back down the stage from them.
 *
 * A fresh array per call: it is asked for when a spectator changes car and
 * once a frame to say how many are left, never inside a step. */
export function stillRunning(field: RivalField): RivalRun[] {
  return field.runs.filter(onRoad).sort((a, b) => covered(b.state) - covered(a.state));
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
  /** The number on their doors — which, with the crew's id, is the whole of
   * what their paint scheme is read off (the app's car-livery.ts). */
  number: number;
  /** Stage time, or null for a crew who never reached the line. */
  time: number | null;
  /** 1 is the stage win. Retirements are classified behind every finisher. */
  place: number;
  /** Still on the road — a sheet read before `settleField` says the road is
   * clear carries the crews who have not finished yet as OUT rather than as
   * retirements, so a provisional table can be shown honestly. Always false
   * on a settled sheet. */
  out: boolean;
  you: boolean;
};

/** THE STAGE'S RESULT SHEET — everybody who started, in the order they
 * finished, with the retirements at the bottom in start order. FINAL only
 * once `settleField` says the road is clear; read before that, a rival still
 * out there has no time yet and is carried at the bottom flagged `out`
 * rather than as a retirement they never made. */
export function fieldResults(
  field: RivalField,
  player: { time: number | null; carId: string },
): ClassRow[] {
  const rows: Omit<ClassRow, "place">[] = field.runs.map((run) => ({
    id: run.entry.crew.id,
    alias: run.entry.crew.alias,
    driver: run.entry.crew.driver,
    carId: run.entry.crew.carId,
    number: run.entry.number,
    time: run.time,
    out: run.time === null && !run.done,
    you: false,
  }));
  rows.push({
    id: PLAYER_ID,
    alias: "YOU",
    driver: "You",
    carId: player.carId,
    number: field.playerNumber,
    time: player.time,
    out: false,
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
