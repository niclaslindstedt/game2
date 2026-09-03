// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A HEAT — the whole grid down one road at once, with nobody special on it.
//
// The neighbouring harnesses each answer a different question, and none of
// them answers this one:
//
//   `simulate.ts`  one bot, no field, a balance table. The right instrument
//                  for handling and for the generator: a lone car's time is
//                  the road and the physics and nothing else.
//   `race.ts`      one run — a bot's or a person's, off a tape — placed
//                  against a field that drove the stage without it. The
//                  right instrument for "what is a difficulty worth".
//   HERE           every car on the grid racing every other one, and what
//                  they did TO EACH OTHER on the way.
//
// It exists because the bot's traffic eyes and the crews' tempers (`AGGRO`
// in bot.ts) only fire when there is somebody in the way, and a lone run has
// nobody. No amount of `make sim` can say what a difficulty's MANNERS are
// worth; this is the table that can.
//
// The two columns that carry it are DEALT and TAKEN, and they only mean
// anything because the panel is booked to whoever DROVE IN. Two equal cars
// in a shunt fold about the same amount each, so an unattributed damage
// column would say nothing more than "was in a crash": a crew that deals and
// never takes is bullying the field, one that takes and never deals is being
// bullied by it, and a difficulty where everybody deals nothing is a
// difficulty whose manners do not exist.

import { TUNING } from "../game/defs/tuning.ts";
import type { RunStats, Weather } from "../game/state.ts";
import {
  compileStage,
  finishAt,
  type FiniteStageLength,
  type StageKnobs,
} from "../mapgen/index.ts";
import { createField, onRoad, stepField, type RivalField, type RivalRun } from "./field.ts";
import { gridSize } from "./grid.ts";
import type { RivalCrew } from "./rivals.ts";
import type { Difficulty } from "./skill.ts";

/** How long two cars have to be clear of each other, in steps, before the
 * next time they touch is a NEW racing incident. Half a second: two cars
 * leaning on each other down a rutted road break and remake the contact
 * dozens of times, and every one of those is the same moment of the race. */
const RUB_GRACE = 60;

export type HeatOptions = {
  seed: number;
  difficulty: Difficulty;
  /** The grid the game would stand up, clamped to what the apron will hold
   * (`gridSize`); defaults to the game's own eight-car grid. The PLAYER's
   * slot stands empty here — there is nobody in it — so `cars - 1` crews
   * actually race. */
  cars?: number;
  /** Stage length band. Defaults to medium, as `simulateStage` does. */
  length?: FiniteStageLength;
  weather?: Weather;
  knobs?: Partial<StageKnobs>;
  /** Give up on the stragglers after this much race time, seconds. */
  maxTime?: number;
};

/** How one crew's heat went. */
export type HeatEntry = {
  crew: RivalCrew;
  /** Grid slot, 1-based. 1 is pole, and on this grid pole is the SLOWEST
   * crew on it (`headsUpField`). */
  number: number;
  carId: string;
  /** What they were racing it with, straight off the profile: how hard they
   * go for a move, and what they are willing to do to get it. */
  overtake: number;
  aggression: number;
  finished: boolean;
  /** Race time at the line, or the clock where the run was called off. */
  time: number;
  /** Finishing position, 1 for the win. Retirements are classified behind
   * every finisher, in grid order. */
  place: number;
  stats: RunStats;
  /** How many times this crew MET another car — one per contact, however
   * long the two stayed alongside. A scrape down a flank is one rub. */
  rubs: number;
  /** …and how many of those this crew was the one who drove in. */
  shunts: number;
  /** Metres of panel this crew folded into other cars, counting only the
   * contacts it drove into. */
  dealt: number;
  /** …and metres somebody else folded into theirs, the same way round.
   * Bodywork only: what the trees and the ground cost them is in `stats`. */
  taken: number;
};

export type HeatResult = {
  seed: number;
  difficulty: Difficulty;
  /** One raced lap of the road, m. */
  trackLength: number;
  /** Every crew, in finishing order. */
  entries: HeatEntry[];
};

/** Race one grid of the real field down one real stage. Deterministic in the
 * seed, the difficulty and the grid size: the same three always produce the
 * same heat, contacts and all.
 *
 * There is no player here, so every slot on the grid is a crew — `cars` is
 * the whole entry list rather than the entry list plus one. */
export function simulateHeat(options: HeatOptions): HeatResult {
  const cars = gridSize(options.cars ?? 8);
  const track = compileStage(options.seed, options.length ?? "medium");
  // The game's own heads-up field, exactly: `createField` stands `cars - 1`
  // crews on a `cars`-deep grid and leaves the back slot for the player.
  // Nobody is in it here, so the crews race the grid they would have raced.
  const field: RivalField = createField(
    track,
    { difficulty: options.difficulty, cars, massStart: true, contact: true },
    {
      seed: options.seed,
      laps: 1,
      timeOfDay: "day",
      weather: options.weather ?? "clear",
      season: "summer",
    },
  );

  const books = new Map<RivalRun, HeatEntry>();
  field.runs.forEach((run) =>
    books.set(run, {
      crew: run.entry.crew,
      number: run.entry.number,
      carId: run.entry.crew.carId,
      overtake: run.entry.profile.overtake,
      aggression: run.entry.profile.aggression,
      finished: false,
      time: 0,
      place: 0,
      stats: run.state.stats,
      rubs: 0,
      shunts: 0,
      dealt: 0,
      taken: 0,
    }),
  );

  // When each pair was last resolved. A contact is reported on every step the
  // two are touching, so a rub is booked when a pair meets after `RUB_GRACE`
  // clear of each other and everything inside that window is the same racing
  // incident still happening.
  const met = new Map<RivalRun, Map<RivalRun, number>>();
  let now = 0;

  const onContact = (
    a: RivalRun,
    b: RivalRun,
    by: RivalRun | null,
    crushA: number,
    crushB: number,
  ): void => {
    let seen = met.get(a);
    if (!seen) met.set(a, (seen = new Map()));
    const last = seen.get(b);
    seen.set(b, now);
    if (last === undefined || now - last > RUB_GRACE) {
      books.get(a)!.rubs += 1;
      books.get(b)!.rubs += 1;
      if (by) books.get(by)!.shunts += 1;
    }
    // The panel goes on the ledger of whoever drove in: they DEALT what the
    // other one lost and TOOK what they lost themselves. A contact neither
    // drove into — two cars shoved together by the road — is nobody's to
    // answer for, and counts as a rub and nothing else.
    if (by === a) {
      books.get(a)!.taken += crushA;
      books.get(a)!.dealt += crushB;
    } else if (by === b) {
      books.get(b)!.taken += crushB;
      books.get(b)!.dealt += crushA;
    }
  };

  const maxSteps = Math.ceil((options.maxTime ?? 400) / TUNING.dt);
  for (now = 0; now < maxSteps; now++) {
    if (!field.runs.some(onRoad)) break;
    stepField(field, null, undefined, onContact);
  }

  for (const [run, book] of books) {
    book.finished = run.time !== null;
    book.time = run.time ?? run.state.raceTime;
  }
  // Times first, quickest first; anybody without one is out of the results
  // and keeps the order they were stood on the grid in.
  const entries = [...books.values()].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return a.finished ? a.time - b.time : a.number - b.number;
  });
  entries.forEach((entry, index) => {
    entry.place = index + 1;
  });
  return {
    seed: options.seed,
    difficulty: options.difficulty,
    // The road the RACE covered: up to the finish line and no further, so a
    // pace worked out from it is not diluted by R25's run-out.
    trackLength: finishAt(track) ?? track.length,
    entries,
  };
}
