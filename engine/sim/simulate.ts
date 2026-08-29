// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The headless simulation harness: run the REAL engine — createGame, step,
// the bot driver — with no renderer attached, and report what happened.
// This is how handling and generator changes are measured (scripts/
// simulate-run.mjs renders the tables) and how the sim tests assert that a
// bot finishes what the generator builds. Runs are deterministic: the same
// seed, car, and profile always produce the same digest.

import { createGame, step } from "../game/step.ts";
import type { GameEvent, GameState, Weather } from "../game/state.ts";
import {
  finishAt,
  type FiniteStageLength,
  type StageKnobs,
  type StageShape,
} from "../mapgen/index.ts";
import { botInput, RALLY_BOT, type BotProfile } from "./bot.ts";
import { TUNING } from "../game/defs/tuning.ts";
import type { GearboxMode } from "../game/defs/cars.ts";

export type SimOptions = {
  seed: number;
  carId?: string;
  /** Which box the bot drives with. Defaults to the automatic, so a sweep
   * compares CARS rather than gearboxes. */
  gearbox?: GearboxMode;
  profile?: BotProfile;
  /** Stage length band to race (finite only — an endless stage has no
   * finish for a sim run to reach). Defaults to medium. */
  length?: FiniteStageLength;
  /** R22 — sprint (default) or circuit. */
  shape?: StageShape;
  /** Laps to race a circuit over; defaults to the rule book's. */
  laps?: number;
  /** Give up after this much simulated race time, seconds. */
  maxTime?: number;
  /** Weather to race in (sets the wind band). Defaults to clear. */
  weather?: Weather;
  /** The generator's dials for the stage (rules.ts). Defaults to the
   * middle of every one. */
  knobs?: Partial<StageKnobs>;
};

export type SimResult = {
  seed: number;
  carId: string;
  finished: boolean;
  /** Race time at finish (or at the timeout), seconds. */
  time: number;
  /** R22 — the laps raced, and the time each of them took, seconds. */
  laps: number;
  lapTimes: number[];
  /** One RACED lap of the road, meters: the road up to the finish line and
   * no further. R25's run-out past a sprint's gate is driven after the
   * clock has stopped, and counting it would inflate every pace below. */
  trackLength: number;
  /** Ground actually covered by the race: the lap times the laps. */
  raceLength: number;
  stats: GameState["stats"];
  /** WHAT THE RUN COST THE CAR, in metres of folded panel: every damage zone
   * plus the floorpan. `stats.impacts` counts the hits; this is what they
   * actually did, and it is the number that separates a run that clipped
   * three trees from one that hit a boulder. */
  crush: number;
  /** …and its structural wear, 0 (sound) to 1 (the wreck). */
  wear: number;
  events: GameEvent[];
  /** FNV-1a hash over sampled car positions — the determinism fingerprint. */
  digest: string;
};

/** How much bodywork a car has lost in total, m — every zone plus the
 * floorpan taking what the springs could not. */
function crushOf(state: GameState): number {
  const damage = state.car.damage;
  let total = damage.belly;
  for (const zone of damage.zones) total += zone;
  return total;
}

/** Drive one stage headlessly with the bot. */
export function simulateStage(options: SimOptions): SimResult {
  const carId = options.carId ?? "compact";
  const profile = options.profile ?? RALLY_BOT;
  const maxTime = options.maxTime ?? 300;
  const state = createGame({
    seed: options.seed,
    carId,
    gearbox: options.gearbox,
    length: options.length,
    shape: options.shape,
    laps: options.laps,
    skipCountdown: true,
    env: { weather: options.weather ?? "clear" },
    knobs: options.knobs,
  });

  const events: GameEvent[] = [];
  let hash = 0x811c9dc5;
  const mix = (v: number): void => {
    hash ^= Math.round(v * 100) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };

  let steps = 0;
  const maxSteps = Math.ceil(maxTime / TUNING.dt);
  // The run is over for measurement purposes at the LINE. R25's roll-out
  // past it is the car being driven home with nobody at the wheel — road
  // that costs the sim wall-clock and tells it nothing, and that would
  // fold a coast-down into every pace and top-speed column.
  while (state.phase !== "rollout" && state.phase !== "finished" && steps < maxSteps) {
    const input = botInput(state, profile);
    // Copied across rather than spread: a spread of the step's (usually
    // empty) event list allocates and walks an iterator on every one of a
    // run's tens of thousands of steps.
    const emitted = step(state, input);
    for (let i = 0; i < emitted.length; i++) events.push(emitted[i]);
    steps += 1;
    if (steps % 30 === 0) {
      mix(state.car.x);
      mix(state.car.z);
      mix(state.car.u);
    }
  }

  const raced = finishAt(state.track) ?? state.track.length;
  return {
    seed: options.seed,
    carId,
    finished: state.phase === "rollout" || state.phase === "finished",
    time: state.raceTime,
    laps: state.laps,
    lapTimes: state.lapTimes,
    trackLength: raced,
    raceLength: raced * state.laps,
    stats: state.stats,
    crush: crushOf(state),
    wear: state.car.damage.wear,
    events,
    digest: hash.toString(16).padStart(8, "0"),
  };
}
