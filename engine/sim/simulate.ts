// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The headless simulation harness: run the REAL engine — createGame, step,
// the bot driver — with no renderer attached, and report what happened.
// This is how handling and generator changes are measured (scripts/
// simulate-run.mjs renders the tables) and how the sim tests assert that a
// bot finishes what the generator builds. Runs are deterministic: the same
// seed, car, and profile always produce the same digest.

import { createGame, step } from "../game/step.ts";
import type { GameEvent, GameState } from "../game/state.ts";
import { botInput, RALLY_BOT, type BotProfile } from "./bot.ts";
import { TUNING } from "../game/defs/tuning.ts";

export type SimOptions = {
  seed: number;
  carId?: string;
  profile?: BotProfile;
  /** Give up after this much simulated race time, seconds. */
  maxTime?: number;
};

export type SimResult = {
  seed: number;
  carId: string;
  finished: boolean;
  /** Race time at finish (or at the timeout), seconds. */
  time: number;
  trackLength: number;
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
  const state = createGame({ seed: options.seed, carId, skipCountdown: true });

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
    trackLength: state.track.length,
    stats: state.stats,
    events,
    digest: hash.toString(16).padStart(8, "0"),
  };
}
