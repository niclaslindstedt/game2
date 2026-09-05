// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE DASHBOARD READS — the numbers the cockpit's instruments are
// written from, taken off the state in one place so the dials in the car
// and the cluster on the HUD can never disagree about a reading.
//
// DOM-free and three-free on purpose: the tests read it, and hud.tsx's
// snapshot takes its tachometer from here for the same reason.

import type { GameState } from "@engine";

import { shiftLightOn } from "./shift-window.ts";

/** Tach reading, 0..1 of the dial: the engine's own revs over an idle floor
 * so the needle never falls off the bottom. The revs themselves are the
 * engine's (`car.rev`) — the driven wheels through the gearing on the move,
 * so the needle flares with a lit-up axle, and the throttle itself on the
 * grid, where a driver waiting for the lights can still blip it. */
export function tachometer(state: GameState): number {
  return Math.min(1, 0.18 + 0.82 * state.car.rev);
}

/** Every reading on the dash for one frame. `beams` is whether the lamps
 * are lit — the environment's call, which the car is told (car-mesh.ts). */
export type Readings = {
  /** The rev counter, 0..1 of its dial. */
  rev: number;
  /** Ground speed, m/s — a car crossed up at 140 km/h is doing 140 km/h. */
  speed: number;
  /** The gear figure: `1`..`6`, `n` while nothing is geared on the line,
   * `r` while the brake is backing the car out. */
  gear: string;
  /** The tripmeter's windows: the stage's distance, and the distance since
   * the last split board, km to two places. */
  total: string;
  interval: string;
  shift: boolean;
  /** The six tell-tales in `TELL_TALES` order (car/cockpit-dials.ts):
   * beams, left turn, oil, charge, brake, right turn. All six light for
   * the bulb check while the car waits on the line; on the road only the
   * beams' lamp has anything to say. */
  lamps: readonly boolean[];
};

const BULB_CHECK: readonly boolean[] = [true, true, true, true, true, true];
/** ...and the row on the road, kept and rewritten rather than made per
 * frame: only its first lamp ever changes. */
const ON_THE_ROAD: boolean[] = [false, false, false, false, false, false];

export function instrumentReadings(state: GameState, beams: boolean): Readings {
  const car = state.car;
  const onTheLine = state.phase === "intro" || state.phase === "countdown";
  // Metres since the last board the car drove through this lap, measured
  // up the road the way a co-driver's interval is — from the board's own
  // arc position to the run's furthest point.
  const passed = state.checkpointsPassed;
  const board = passed > 0 ? state.track.checkpoints[passed - 1] : undefined;
  const since = Math.max(0, state.progressS - (board?.s ?? 0));
  ON_THE_ROAD[0] = beams;
  return {
    rev: tachometer(state),
    speed: Math.hypot(car.u, car.w),
    gear: car.reversing ? "r" : onTheLine ? "n" : `${car.gear + 1}`,
    total: (state.stats.distance / 1000).toFixed(2),
    interval: (since / 1000).toFixed(2),
    shift: shiftLightOn(state),
    lamps: onTheLine ? BULB_CHECK : ON_THE_ROAD,
  };
}
