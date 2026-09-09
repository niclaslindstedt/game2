// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE REPLAY ROLL'S POLICY — what a kept replay is, what a listing reads off
// one, what order the roll is in and how many it keeps. No storage of any
// kind: replay-store.ts is the IndexedDB around this, and App.tsx is what
// puts a tape back on the road.
//
// A REPLAY IS A RUN TAPE AND NOTHING ELSE (game/run-tape.ts,
// engine/sim/tape.ts). Not a recording of pixels, not a path the car took —
// the controls the engine was handed, step by step, and the header that says
// which world it was handed them in. The engine is deterministic, so driving
// those controls through the same stage in the same car reproduces the run
// exactly: the same slides, the same dented wing, the same time on the clock.
// That is why a replay costs a hundred kilobytes rather than a hundred
// megabytes, and why it can be watched from ANY camera — the TV gallery
// included — instead of from the one the run was driven in.
//
// Split out and DOM-free because this is the half that can be wrong in a way
// nobody notices. A roll that quietly stopped capping is an unbounded pile of
// megabytes in a browser profile; the tests read it here.

import { CARS, fieldAt, type FieldPlan, type RunTape, type TapeHeader } from "@engine";

import { formatTime, ordinal } from "../lib/util.ts";
import type { StageSpec } from "./stage-spec.ts";

/** How many replays the roll keeps before the oldest falls off.
 *
 * A tape is JSONL, one line per control CHANGE, and an analogue stick moves
 * on most steps — so a two-minute stage is of the order of a megabyte of
 * text. Twelve is a dozen runs worth coming back to and a budget an
 * IndexedDB store can hold without ever being the reason a browser starts
 * asking about storage. */
export const REPLAY_LIMIT = 12;

/** Everything a listing needs about a kept replay, without the tape itself:
 * enough to name it, date it, and say how the run went. Derived from the tape
 * at the moment it is filed (`readReplayMeta`) and stored beside it, so the
 * replays page can draw a list without parsing a megabyte per row. */
export type ReplayMeta = {
  /** Sortable and unique: when it was minted, then a counter for the same ms. */
  id: string;
  /** When the player KEPT it (epoch ms) — what the roll is ordered by — and
   * 0 on a recording that has not been kept, which is what the run just
   * driven is until the disk in the replay bar is pressed. The store stamps
   * it; nothing else may. */
  savedAt: number;
  /** ...and when it was DRIVEN, ISO 8601, off the tape's own header. The two
   * differ whenever a run is watched before it is saved. */
  recorded: string;
  /** What kind of run it was, in the app's own words (`campaign`,
   * `timetrial`, `headsup`, `roam`, `training`). */
  mode: string;
  /** The campaign/time-trial stage it was driven on, or null on a stage that
   * has no name in the ladder. */
  levelId: string | null;
  seed: number;
  carId: string;
  /** Whether the run reached the line. A retirement is still worth keeping —
   * it is usually the more interesting recording — so it is filed with the
   * clock where it stopped and this flag saying so. */
  finished: boolean;
  time: number;
  /** Where it placed and out of how many, or null when nobody else was on
   * the road. */
  place: number | null;
  of: number | null;
  /** How long the recording runs, in steps. */
  steps: number;
};

/** A kept replay, as the store holds one: the listing and the tape as JSONL,
 * side by side rather than in one flat record, so a read that only wants the
 * listing can drop the megabyte without picking a record apart. */
export type StoredReplay = { meta: ReplayMeta; tape: string };

/** A replay's id. The timestamp leads so a plain string sort is a sort by
 * age, and the counter breaks the tie two of them minted in the same
 * millisecond would otherwise be. */
export function replayId(at: number, counter: number): string {
  return `${at}-${counter.toString().padStart(6, "0")}`;
}

/** Read a parsed tape down to what a listing shows. A tape with no `result`
 * line on it — one sealed while the run was still going — is not a broken
 * tape: it is a recording whose clock is simply the last step of it. */
export function readReplayMeta(tape: RunTape, id: string): ReplayMeta {
  const { header, result, steps } = tape;
  return {
    id,
    savedAt: 0,
    recorded: header.recorded,
    mode: header.mode,
    levelId: header.levelId ?? null,
    seed: header.stage.seed,
    carId: header.car.id,
    finished: result?.finished ?? false,
    time: result?.time ?? steps * header.dt,
    place: result?.place ?? null,
    of: result?.of ?? null,
    steps,
  };
}

/** The roll with a new replay at its head, capped. Newest first, which is the
 * order the page wants: the replay just kept is the one the player is looking
 * for. A re-save of a replay already on the roll REPLACES it rather than
 * doubling it — the disk in the replay bar is pressable twice. */
export function withReplay<T extends ReplayMeta>(roll: readonly T[], entry: T, limit: number): T[] {
  return [entry, ...roll.filter((held) => held.id !== entry.id)].slice(0, Math.max(1, limit));
}

/** What a read off disk joins onto what is already in hand. Anything saved
 * while the read was in flight is newer than everything stored, so this is a
 * concat of the sorted remainder rather than a merge; ids already held win. */
export function withStoredReplays<T extends ReplayMeta>(
  roll: readonly T[],
  stored: readonly T[],
): T[] {
  const held = new Set(roll.map((entry) => entry.id));
  return [
    ...roll,
    ...stored.filter((entry) => !held.has(entry.id)).sort((a, b) => b.savedAt - a.savedAt),
  ];
}

/** THE WORLD THE TAPE WAS DRIVEN IN, rebuilt as the stage spec every way into
 * a run is reduced to.
 *
 * Every field here is read off the HEADER and none of it off the player's
 * current settings — that is the whole contract. The same seed, band, shape,
 * laps and dials give back the same road; the same hour, weather, season and
 * temperature give back the same surface on it; the same car, box and grid
 * slot put the same machine in the same place; and `damageScale` is what a
 * hit costs it. Substitute any one of them and the recording drives a
 * different metre of road and is somewhere else by the first corner.
 *
 * The apron is keyed on the CAR COUNT (`apronForGrid`), so a replay of a mass
 * start has to be built for the same grid it was raced off — which is why the
 * field's own plan decides it rather than the opponents slider. */
export function replayStage(header: TapeHeader): StageSpec {
  const stage = header.stage;
  return {
    seed: stage.seed,
    length: stage.length,
    shape: stage.shape,
    laps: stage.laps,
    knobs: stage.knobs,
    carId: header.car.id,
    gearbox: header.car.gearbox,
    hour: stage.hour,
    weather: stage.weather,
    season: stage.season,
    temperature: stage.temperature ?? null,
    ...(stage.sandstorms === undefined ? {} : { sandstorms: stage.sandstorms }),
    ...(stage.arena ? { arena: true } : {}),
    ...(header.damageScale === undefined ? {} : { damageScale: header.damageScale }),
    skipCountdown: header.start.skipCountdown,
    grid: header.start.grid,
    cars: header.field?.cars ?? 1,
  };
}

/** ...and the field that was on the road with it, or null when the run was
 * alone. `fieldAt` is the engine's own reader, so a header written before
 * fields could be ghosts still reads as the solid field it was. */
export function replayField(header: TapeHeader): FieldPlan | null {
  return fieldAt(header);
}

/** How a mode is written on a replay row. The listing's own words rather than
 * the tape's, which are ids. */
const MODE_WORD: Record<string, string> = {
  campaign: "CAMPAIGN",
  timetrial: "TIME TRIAL",
  headsup: "HEADS UP",
  roam: "ROAM",
  training: "TRAINING",
  sim: "SIM",
};

export function replayMode(meta: ReplayMeta): string {
  return MODE_WORD[meta.mode] ?? meta.mode.toUpperCase();
}

/** WHAT THE ROW IS CALLED. The stage's own name where the ladder has one —
 * the caller resolves it, because the campaign's catalog reads storage and
 * this module is read by the DOM-free suite — and the seed otherwise, which
 * is the only name a Roam stage has ever had. */
export function replayTitle(meta: ReplayMeta, stageName: string | null): string {
  return (stageName ?? `SEED ${meta.seed}`).toUpperCase();
}

/** ...and the line under it: what it was driven in, how it went, and how long
 * the recording is. A retirement says so instead of printing a stage time
 * nobody set. */
export function replayLine(meta: ReplayMeta): string {
  // The catalog is asked rather than told: a replay kept in a build that has
  // since dropped a car is still a replay worth listing, and a row that threw
  // would take the whole page down with it.
  const car = CARS.find((spec) => spec.id === meta.carId);
  return [
    replayMode(meta),
    car ? car.name.toUpperCase() : meta.carId.toUpperCase(),
    meta.finished ? formatTime(meta.time) : "RETIRED",
    meta.place !== null && meta.of !== null ? `${ordinal(meta.place)} OF ${meta.of}` : null,
  ]
    .filter((word): word is string => Boolean(word))
    .join(" · ");
}
