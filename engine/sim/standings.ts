// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE EVERYBODY IS, and what it takes to get an answer. A rally field is
// not raced side by side — the rivals are driven headlessly, at their own
// pace, and the standings are read off the times they set — so the
// question "what place am I in" is answered differently at a split, at the
// finish, and while the run is still going. Settling the field far enough
// ahead to answer it, retiring the runs that never will, and the class
// table at the end are all here.

import { collideCars } from "../game/collision.ts";
import type { GameEvent, GameState } from "../game/state.ts";
import type { RivalField, RivalRun } from "./field.ts";
import { advanceRun, onRoad, RUB_RANGE, tickGhosts } from "./field.ts";

/** Retire anybody who has been out there past `limit` seconds of their own
 * race clock, and say whether that leaves the road clear. Stated once and
 * read by both run-outs below, so a sheet read off a card the player watched
 * retires exactly the crews a sheet read off one they did not. */
export function retireOverdue(field: RivalField, limit: number): boolean {
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
export function runOutGhosts(field: RivalField, ticks: number, limit: number): boolean {
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
export function covered(state: GameState): number {
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
