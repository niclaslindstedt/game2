// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD BED'S SCHEDULER — the half that reads the live `GameState` and
// decides WHEN a grain is booked. What a grain IS lives in `engine-bed.ts`
// (the machinery) and `road-grain.ts` (the tyres, the wind and the slide).
//
// SCHEDULED AHEAD, NOT FIRED ON THE FRAME. Grains are booked on the audio
// clock a fifth of a second in advance, so the bed keeps its cadence through a
// frame drop, a garbage-collection pause or a phone throttling itself. A bed
// fired straight from `requestAnimationFrame` breathes with the frame rate,
// and a breathing engine is the most obvious tell there is that a game's audio
// is being generated rather than played.

import { TUNING, type GameState } from "@engine";

import type { Synth } from "../../lib/voice.ts";

import { RUN_BANK } from "./bank.ts";
import { GRAIN_MS, noteHz, playEngineGrain, rpmAt } from "./engine-bed.ts";
import { playSound } from "./play.ts";
import { playRoadGrain } from "./road-grain.ts";

/** How far ahead grains are booked, seconds. Two cadences plus a margin: far
 * enough that a dropped frame cannot open a hole, near enough that the
 * parameters a grain is built from are still roughly true when it sounds. */
const LOOKAHEAD_S = 0.24;

/** Where the anchor is put down when the bed re-times itself, seconds ahead of
 * the clock. Far enough that the first grain is still in the future by the time
 * the browser has built it. */
const ANCHOR_S = 0.05;

/**
 * HOW HARD THE TYRES ARE BEING ASKED TO TURN THE CAR, as a lateral
 * acceleration, m/s² — the point at which they are working flat out.
 *
 * Lateral acceleration (`u * yawRate`) is the honest signal for cornering and
 * it costs a multiply: it is zero on a straight at any speed, zero at a
 * standstill with the wheel on full lock, and largest exactly where a tyre is
 * loudest. Measured over bot-driven stages, a stage's straights sit under
 * 1.5 m/s² and its corners run 8–15, so this is where "at the limit" is.
 */
const LAT_LIMIT = 14;

/** How quickly the smoothed signals follow, as time constants in seconds.
 * Written as taus rather than as per-frame fractions because a fraction is
 * only true at the frame rate it was tuned at — the same engine would pick up
 * load twice as fast on a 120 Hz display as on a phone at 40. */
const RISE_TAU = 0.039;
const FALL_TAU = 0.13;

/** One step of an asymmetric one-pole filter: quick to rise, slower to fall.
 * A tyre loads up the instant the car turns in and unloads over the following
 * moment, and an engine picks up load the instant the throttle opens. */
function follow(previous: number, target: number, dt: number): number {
  const tau = target > previous ? RISE_TAU : FALL_TAU;
  return previous + (target - previous) * (1 - Math.exp(-dt / tau));
}

/** The bed's own memory between grains. */
type BedState = {
  /** Absolute audio time the next grain is due. 0 = not anchored yet. */
  nextAt: number;
  /** Where the clatter's next tick falls inside the next grain, ms. */
  tickMs: number;
  /** The firing note the last grain started on, so the next one can glide on
   * from where the pitch was actually going. */
  lastHz: number;
  /** Smoothed engine load, 0..1 — see `loadFrom`. */
  load: number;
  /** Smoothed lateral work, 0..1 — see `LAT_LIMIT`. Smoothed because the raw
   * yaw rate twitches over every rut, and a bed whose level twitches with it
   * is the flutter this whole module exists to avoid. */
  corner: number;
  /** The countdown second last announced, so each light sounds once. */
  lastLight: number;
};

/** The road bed, for the whole life of one app. */
export type DriveBed = {
  /**
   * Book whatever grains are due. Call once per rendered frame with the live
   * state and the frame's own elapsed time; it is cheap when nothing is due
   * and silent when the context is locked or the effects are muted.
   */
  update: (state: GameState, dt: number) => void;
  /** The run is over or the player left it: forget the phase so the next
   * run's first grain does not glide away from this one's last. */
  reset: () => void;
};

/**
 * HOW HARD THE ENGINE IS WORKING, 0..1 — and the state has no throttle in it,
 * so it is inferred.
 *
 * A car that is accelerating is on the power; one holding speed is
 * part-throttle; one slowing down is off it. Acceleration is the honest signal
 * for all three and it is available. Braking forces it to nothing outright,
 * because a car on the brakes is never under load however fast it is going.
 *
 * SMOOTHED through `follow`, because the raw number is noisy enough to make the
 * engine flutter over every bump — and its slower fall is also what stops a
 * shift's speed dip from reading as a lift.
 */
function loadFrom(
  previous: number,
  accel: number,
  braking: boolean,
  boosting: boolean,
  dt: number,
): number {
  const target = braking
    ? 0.05
    : Math.min(1, Math.max(0.12, 0.2 + accel * 0.35) + (boosting ? 0.3 : 0));
  return follow(previous, target, dt);
}

export function createDriveBed(synth: Synth): DriveBed {
  const bed: BedState = { nextAt: 0, tickMs: 0, lastHz: 0, load: 0.2, corner: 0, lastLight: -1 };
  let lastU = 0;

  /** Book one grain of every bed at absolute time `at`. */
  const grain = (state: GameState, at: number): void => {
    const car = state.car;
    const spec = state.spec;
    const topSpeed = spec.gearTop[spec.gearTop.length - 1];
    const speed = Math.hypot(car.u, car.w);

    // Revs are gearing plus FORWARD speed, exactly as the tachometer reads
    // them, so the needle, the shift light and the noise can never disagree.
    const rev = Math.max(0, car.u) / spec.gearTop[car.gear];
    const rpm = rpmAt(rev);
    const hz = noteHz(rpm);
    // Glide to where the note is HEADED rather than to where it is: the three
    // grains sounding at once have to agree about the pitch, and a grain that
    // held still while the revs climbed would beat against its neighbours.
    // Clamped, so a gear change cannot fling one grain an octave.
    const toHz =
      bed.lastHz > 0 ? Math.max(hz * 0.75, Math.min(hz * 1.35, hz + (hz - bed.lastHz))) : hz;
    bed.lastHz = hz;
    bed.tickMs = playEngineGrain(
      synth,
      { hz, toHz, rpm, rev: Math.min(1, rev), load: bed.load, wear: car.damage.wear },
      at,
      bed.tickMs,
    );

    playRoadGrain(
      synth,
      {
        speed,
        air: Math.min(1, speed / topSpeed),
        surface: state.surface,
        corner: bed.corner,
        slide: car.slide,
        sideways: car.w,
        airborne: car.airborne,
      },
      at,
    );
  };

  return {
    update(state, dt) {
      const now = synth.now();
      if (now === null) {
        // Locked, suspended or muted to nothing. Nudge the context and drop
        // the anchor so the bed re-times itself rather than trying to fill in
        // however long the silence lasted.
        synth.resume();
        bed.nextAt = 0;
        return;
      }

      // The lights before the off: one per whole second remaining, and the
      // engine's own `go` event handles the last one. Done here rather than
      // from an event because the countdown is a CLOCK rather than a moment —
      // nothing happens in the simulation when a light changes.
      if (state.phase === "countdown") {
        const light = Math.ceil(TUNING.countdown - state.t);
        if (light !== bed.lastLight && light > 0) {
          bed.lastLight = light;
          playSound(synth, RUN_BANK, "countdown_tick");
        }
      } else {
        bed.lastLight = -1;
      }

      // Measured over the FRAME rather than over a step: several simulation
      // steps happen between two calls, so a step-sized divisor would read
      // every frame's speed change as five times the acceleration it was.
      const frame = Math.max(1 / 240, Math.min(0.1, dt));
      const accel = (state.car.u - lastU) / frame;
      lastU = state.car.u;
      bed.load = loadFrom(bed.load, accel, state.car.braking, state.car.boosting, frame);
      bed.corner = follow(
        bed.corner,
        Math.min(1, Math.abs(state.car.u * state.car.yawRate) / LAT_LIMIT),
        frame,
      );

      // A GRAIN BOOKED IN THE PAST DOES NOT WAIT. WebAudio starts a source
      // whose time has already gone the instant it is handed over, so a stall
      // that pushes the anchor behind the clock does not merely delay the bed:
      // every missed grain fires at once, on top of the next one, and what
      // comes out is a lurch. Re-anchor the moment the bed is late — its phase
      // means nothing and its regularity is everything.
      if (bed.nextAt < now) bed.nextAt = now + ANCHOR_S;
      while (bed.nextAt < now + LOOKAHEAD_S) {
        grain(state, bed.nextAt);
        bed.nextAt += GRAIN_MS / 1000;
      }
    },

    reset() {
      bed.nextAt = 0;
      bed.tickMs = 0;
      bed.lastHz = 0;
      bed.load = 0.2;
      bed.corner = 0;
      bed.lastLight = -1;
      lastU = 0;
    },
  };
}
