// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SPECTATOR MODE — the run-out WATCHED instead of read.
//
// A rally stage does not end when your car crosses the line. Most of the
// field is still out there, and the two places behind you are worth points to
// somebody: R30 already drives them home behind the results card
// (`settleField`), it just does it at eight hundred steps a frame, with the
// cars off the road and nothing on screen but the card.
//
// This is the other way to spend those seconds. The same crews, the same run,
// driven at RACE SPEED (`watchField`) with the camera on one of them — the
// broadcast the card is standing in for. It changes nothing about the result:
// every crew is driven alone either way, and a time is that crew's own clock
// at their own line, so the sheet a spectator watches being decided is the
// sheet they would have been handed anyway.
//
// WHEN THERE IS ANYTHING TO WATCH is a question worth answering here, because
// the answer is counter-intuitive and every reading below is null without it.
// A HEADS-UP race always has a run-out: everybody leaves on one green and the
// player is on the back row, so finishing means the field behind them is still
// driving. A STAGGERED RALLY usually has none at all — every rival left the
// control before the player and has been driving that much longer, and
// `catchUpField` pays the whole stagger off under the establishing shot, so by
// the time the player crosses the line the entry list is normally home. What
// is left out there on a rally is a crew who went off, or a field slow enough
// that its head start did not cover the difference. That is not a bug in this
// module or in the field: it is what a ten-second interval over a
// ninety-second stage actually means.
//
// This module is the FEED: who is on screen, how NEXT and PREVIOUS walk the
// field, and the readings the picture is captioned with. It is DOM-free — the
// banner that draws it is `hud-spectate.tsx`, and the frame loop that steps
// the run-out under it is App.tsx.
//
// What it does NOT carry is the crew's clock, speed, gearbox, damage or
// route: those are a car being driven, and the HUD already has a whole
// layout for reading one. App points that layout at the watched crew's own
// `GameState` (`takeSnapshot`) instead of the player's, so a spectator reads
// the same dials they raced under. What is left here is the handful of
// numbers only a SPECTATOR has — who this is, and where they stand against
// the time already on the sheet.

import {
  livePlace,
  onRoad,
  placeAtSplit,
  stillRunning,
  type RivalField,
  type RivalRun,
} from "./standings.ts";

/** The crew on screen, and everything the banner over them reads. Rebuilt on
 * the HUD's own tick rather than carried, because every number in it is a
 * reading of a car that is still driving. */
export type Watched = {
  run: RivalRun;
  /** The plate over the car, as text: who is in it, who is driving, and the
   * number on its doors. */
  alias: string;
  driver: string;
  number: number;
  /** Where they stand, out of everybody who started — and null while nothing
   * honestly knows, which on a staggered rally is until their first board. */
  place: number | null;
  of: number;
  /** Whether `place` is the LIVE order of the road. Only a mass start can
   * give that (R29): everybody left together, so the car in front is the car
   * in front. On a staggered rally it is the classification at board
   * `board` instead — the one moment a rally knows where anybody is. */
  live: boolean;
  /** The last split board this crew and the player have BOTH been through,
   * 1-based, and 0 before there is one. Both `gap` and a staggered `place`
   * are readings off it. */
  board: number;
  /** Their own race clock, s. */
  time: number;
  /** Seconds they are DOWN (positive) or UP (negative) on the player at that
   * board — the only honest read on whether the car being watched is about
   * to take a place off you. Null before they reach the first one. */
  gap: number | null;
  /** How many crews are still out there — the length of the list NEXT and
   * PREVIOUS walk — and where this one stands in it, 0-based. */
  running: number;
  at: number;
};

/** THE CAR THE FEED OPENS ON: the leader of what is left of the race. Null
 * when the road is already clear, which is the answer that says there is
 * nothing to spectate. */
export function watchLeader(field: RivalField): RivalRun | null {
  return stillRunning(field)[0] ?? null;
}

/** Walk the feed `by` places down the road (+1) or back up it (-1), wrapping
 * at both ends so neither button is ever a dead press.
 *
 * `from` is where the feed is now, and it is allowed to be a crew who has
 * just come home under the camera: the list is rebuilt off the road every
 * time, so a car that finished between two presses simply is not on it, and
 * the walk falls to the leader rather than to nothing. */
export function walkWatch(field: RivalField, from: RivalRun | null, by: number): RivalRun | null {
  const running = stillRunning(field);
  if (running.length === 0) return null;
  const at = from ? running.indexOf(from) : -1;
  if (at < 0) return running[0];
  const next = (at + by) % running.length;
  return running[next < 0 ? next + running.length : next];
}

/** Read the feed. `splits` is the PLAYER's own board times, in board order:
 * the crew being watched is racing a time that is already on the sheet, and
 * the gap to it at the last board they share is the number a spectator
 * actually came for. Null once the crew is no longer on the road — the
 * caller's answer to that is to cut to whoever is still driving. */
export function readWatch(
  field: RivalField,
  run: RivalRun,
  splits: readonly number[],
): Watched | null {
  if (!onRoad(run)) return null;
  const running = stillRunning(field);
  // The last board they have been through that the player has a time for.
  const boards = Math.min(run.splits.length, splits.length);
  const at = boards > 0 ? run.splits[boards - 1] : 0;
  // A mass start knows the road order on every frame; a staggered rally
  // knows it at the boards and nowhere else.
  const live = field.massStart;
  const place = live
    ? livePlace(field, run.state)
    : boards > 0
      ? // `placeAtSplit` counts the RIVALS through that board quicker; the
        // player is on the same sheet and has to be counted too.
        placeAtSplit(field, boards - 1, at) + (splits[boards - 1] < at ? 1 : 0)
      : null;
  return {
    run,
    alias: run.entry.crew.alias,
    driver: run.entry.crew.driver,
    number: run.entry.number,
    place,
    of: field.of,
    live,
    board: boards,
    time: run.state.raceTime,
    gap: boards > 0 ? at - splits[boards - 1] : null,
    running: running.length,
    at: Math.max(0, running.indexOf(run)),
  };
}
