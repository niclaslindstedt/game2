// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD snapshot: everything the instruments read, derived from a
// GameState once per HUD tick (~12 Hz — the canvas is the 60 fps surface,
// the HUD is not). This is also where the app layer's SIGN BOUNDARY is
// paid: the rendered world mirrors the engine's map view, so the co-driver
// calls, the wind arrow and the damage ledger are all flipped into SCREEN
// space here, once, exactly as input.ts flips steering once.

import { DAMAGE_ZONES, TUNING, wayHome, type GameState } from "@engine";

import { buildMinimap } from "./minimap.tsx";
import { classify } from "./standings.ts";
import type { HudDamage, HudPacenote, HudSnapshot } from "./hud.tsx";

/** The two instruments the ~12 Hz snapshot cannot carry, and why they are
 * their own channel:
 *
 *   the CLOCK, whose hundredths digit is the entire point of it — read off
 *   a 12 Hz snapshot it steps in jumps of eight or more, which reads as a
 *   clock that has stopped rather than one that is running;
 *
 *   the START LIGHTS, which have to change on the same frame as the sound
 *   that goes with them, and the sound is on the frame loop.
 *
 * One object, rewritten IN PLACE by the frame loop and read by those two
 * components on their own animation frame, so a 60 Hz instrument costs a
 * text node instead of a re-render of every dial on the screen. */
export type LiveRun = {
  phase: GameState["phase"];
  /** Seconds left before the off; 0 once the lights are out. */
  countdown: number;
  /** Total race time and the current lap's, seconds. */
  time: number;
  lapTime: number;
};

export function createLive(): LiveRun {
  return { phase: "countdown", countdown: TUNING.countdown, time: 0, lapTime: 0 };
}

/** Re-read the live face from the run. In place, every frame: the object's
 * identity is what the HUD holds on to. */
export function readLive(live: LiveRun, state: GameState): void {
  live.phase = state.phase;
  live.countdown = Math.max(0, TUNING.countdown - state.t);
  live.time = state.raceTime;
  live.lapTime = state.raceTime - state.lapStart;
}

/** How far ahead the co-driver calls, meters — four seconds at pace, with a
 * floor so slow corners still get called and a ceiling so a long straight
 * is not spent staring at the far end's turn. */
function callDistance(u: number): number {
  return Math.min(320, Math.max(150, u * 4));
}

/** Turn angle past which a call earns the LONG modifier, radians (~100°). */
const LONG_NOTE_ANGLE = 1.75;

/** The next co-driver calls: the note under or ahead of the car plus the
 * one after it (so combinations read as "hard left INTO easy right"). The
 * engine's positive dir grows the heading, which the mirrored screen shows
 * as a LEFT turn — the same one-flip rule input.ts applies to steering. */
function upcomingPacenotes(state: GameState): HudPacenote[] {
  const out: HudPacenote[] = [];
  for (const note of state.track.pacenotes) {
    if (note.endS <= state.progressS) continue;
    if (note.s - state.progressS > callDistance(state.car.u)) break;
    out.push({
      dir: note.dir > 0 ? "left" : "right",
      severity: note.severity,
      long: note.angle > LONG_NOTE_ANGLE,
      distance: Math.max(0, note.s - state.progressS),
    });
    if (out.length >= 2) break;
  }
  return out;
}

/** Tach reading, 0..1 of the dial: the engine's own revs over an idle floor
 * so the needle never falls off the bottom. The revs themselves are the
 * engine's (`car.rev`) — gearing plus forward speed on the move, and the
 * throttle itself on the grid, where a driver waiting for the lights can
 * still blip it. */
function tachometer(state: GameState): number {
  return Math.min(1, 0.18 + 0.82 * state.car.rev);
}

/** The damage ledger flipped into SCREEN space for the HUD's 2D car: the
 * rendered world mirrors the engine's map view (the same one-flip rule as
 * steering and the wind arrow), so the engine's right-side zones — and its
 * right mirror — sit on the LEFT of the car the player sees. */
function damageSnapshot(state: GameState): HudDamage {
  const damage = state.car.damage;
  const zoneMax = TUNING.collision.zoneMax;
  const zones = Array.from(
    { length: DAMAGE_ZONES },
    (_, k) => damage.zones[(DAMAGE_ZONES - k) % DAMAGE_ZONES] / zoneMax,
  );
  const broken = damage.broken;
  return {
    zones,
    belly: damage.belly / zoneMax,
    wear: damage.wear,
    systems: { ...damage.systems },
    broken: {
      bumperF: broken.includes("bumperF"),
      bumperR: broken.includes("bumperR"),
      mirrorL: broken.includes("mirrorR"),
      mirrorR: broken.includes("mirrorL"),
      spoiler: broken.includes("spoiler"),
      hood: broken.includes("hood"),
      hatch: broken.includes("hatch"),
    },
  };
}

/** Whether this run is being TIMED against anything — campaign and time
 * trial keep a book on every stage, Roam keeps none — and, if it is, the
 * record standing in it before this run started. Passed in rather than read
 * here because progress is the app's to own, not the engine's. Null is a
 * run nobody is keeping score of, which is not the same as a stage nobody
 * has set a time on yet (`{ best: null }`). */
export type RunBook = { best: number | null };

/** `ghostS` is how far the run is up the road on the ghost, and whether
 * there is one to be up the road on. Both cars run the same stage, so the
 * arc position they have each reached IS the gap, in the one unit that
 * needs no lookup table and reads instantly at speed: metres of road. */
export function takeSnapshot(
  state: GameState,
  finishTime: number | null,
  ghostS: number | null = null,
  book: RunBook | null = null,
): HudSnapshot {
  const rpm = tachometer(state);
  // The rendered world is a mirror of the engine's map view, so the wind
  // arrow's screen angle is the NEGATED car-relative bearing (the same
  // one-flip rule input.ts applies to steering).
  const windKmh = Math.hypot(state.wind.x, state.wind.z) * 3.6;
  const windScreenAngle =
    -(Math.atan2(state.wind.x, state.wind.z) - state.car.heading) * (180 / Math.PI);
  return {
    phase: state.phase,
    time: state.raceTime,
    lap: state.lap,
    laps: state.laps,
    lapTime: state.raceTime - state.lapStart,
    lapTimes: state.lapTimes,
    bestTime: book?.best ?? null,
    // The speedo reads GROUND speed, not forward speed: a car crossed up
    // at 140 km/h is doing 140 km/h, and a needle that dips every time the
    // nose swings would tell the player the slide is costing them.
    speedKmh: Math.max(0, Math.hypot(state.car.u, state.car.w) * 3.6),
    gear: state.car.gear,
    reversing: state.car.reversing,
    gearbox: state.car.gearbox,
    rpm,
    // Nothing to shift on the grid, however hard the driver leans on it.
    shiftUp:
      state.phase === "racing" && rpm > 0.83 && state.car.gear < state.spec.gearTop.length - 1,
    airborne: state.car.airborne,
    minimap: buildMinimap(state),
    // The co-driver stops calling corners the moment the car is in the
    // water: the next one is not going to be taken, and reading it out
    // over a sinking car is the same wrong note as the way-home prompt.
    pacenotes: state.phase === "racing" && !state.drowning ? upcomingPacenotes(state) : [],
    standing: finishTime === null ? null : classify(state.track, finishTime),
    seed: state.seed,
    carName: state.spec.name,
    // Both of these are DRIVING aids — the co-driver's way-home call, and
    // the button that takes it there — so a car the water has already
    // taken is neither off-road nor lost as far as the HUD is concerned:
    // nothing the player asks for over the next few seconds reaches it.
    offRoad: state.offRoad && !state.drowning,
    lost: state.lost && !state.drowning,
    homeDistance: state.lost && !state.drowning ? wayHome(state).distance : 0,
    finishTime,
    record: book !== null && finishTime !== null && (book.best === null || finishTime < book.best),
    boostLeft: state.car.boostLeft,
    boostMax: TUNING.boost.capacity,
    boosting: state.car.boosting,
    windKmh,
    windScreenAngle,
    damage: damageSnapshot(state),
    ghostGap: ghostS === null ? null : state.progressS - ghostS,
  };
}
