// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The headless simulation harness: run the REAL engine — createGame, step,
// the bot driver — with no renderer attached, and report what happened.
// This is how handling and generator changes are measured (scripts/
// simulate-run.mjs renders the tables) and how the sim tests assert that a
// bot finishes what the generator builds. Runs are deterministic: the same
// seed, car, and profile always produce the same digest.

import { createGame, step } from "../game/step.ts";
import type { GameEvent, GameState, Weather } from "../game/state.ts";
import type { FiniteStageLength, StageKnobs, StageShape } from "../mapgen/index.ts";
import { botInput, RALLY_BOT, type BotProfile } from "./bot.ts";
import { TUNING } from "../game/defs/tuning.ts";

export type SimOptions = {
  seed: number;
  carId?: string;
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
  /** One lap of the road, meters. */
  trackLength: number;
  /** Ground actually covered by the race: the lap times the laps. */
  raceLength: number;
  stats: GameState["stats"];
  events: GameEvent[];
  /** FNV-1a hash over sampled car positions — the determinism fingerprint. */
  digest: string;
};

/** Drive one stage headlessly with the bot. */
export function simulateStage(options: SimOptions): SimResult {
  const carId = options.carId ?? "compact";
  const profile = options.profile ?? RALLY_BOT;
  const maxTime = options.maxTime ?? 300;
  const state = createGame({
    seed: options.seed,
    carId,
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
  while (state.phase !== "finished" && steps < maxSteps) {
    const input = botInput(state, profile);
    events.push(...step(state, input));
    steps += 1;
    if (steps % 30 === 0) {
      mix(state.car.x);
      mix(state.car.z);
      mix(state.car.u);
    }
  }

  return {
    seed: options.seed,
    carId,
    finished: state.phase === "finished",
    time: state.raceTime,
    laps: state.laps,
    lapTimes: state.lapTimes,
    trackLength: state.track.length,
    raceLength: state.track.length * state.laps,
    stats: state.stats,
    events,
    digest: hash.toString(16).padStart(8, "0"),
  };
}
