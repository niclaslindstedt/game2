// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLOUD SAVE — the driver's BOARDS, SPLITS, CAMPAIGN and ODOMETERS, carried
// between their own devices by the platform's cloud (iCloud key-value storage
// on iOS).
//
// NATIVE APP ONLY. A browser has no platform cloud, so the shell bridge
// reports unavailable and every entry point here is a no-op — the website
// keeps writing localStorage exactly as it did.
//
// WHAT TRAVELS, AND WHAT DOES NOT:
//
//   boards      YES. A stage time with your initials against it is the thing
//               a driver would be sorriest to lose with a phone.
//   splits      YES. Same, and smaller: one array of sector times per stage.
//   campaign    YES. A ladder climbed half on one device and half on another
//               is the case this file exists for.
//   odometers   YES. Distance is a lifetime figure, and a grow-only counter
//               is the easiest thing in here to merge honestly.
//   ghosts      NO. A control tape per run, against a store that gives the
//               whole app a megabyte.
//   benchmarks  NO. They measure THIS device's frame times; carrying a
//               phone's numbers onto an iPad would make the graph a lie.
//   load times  NO. Same reason.
//   settings    NO. The box, the difficulty and the dials are a fact about
//               the machine in your hands.
//
// THE MERGE IS MECHANICAL, NEVER A JUDGEMENT CALL. Two devices that both
// drove while offline must both keep their work, and running the merge twice
// must change nothing:
//
//   boards      BEST PER COURSE, generalised to a leaderboard: both devices'
//               rows, sorted by the board's own order (time, then who got
//               there first), deduplicated, cut to the same ten.
//   splits      Per sector, the faster of the two — and a sector only one
//               device has ever reached is kept.
//   campaign    FURTHEST PROGRESS: every stage either device finished, the
//               better time, the better place PER DIFFICULTY (a place is
//               only meaningful against the field that produced it), and the
//               points table from whichever run actually paid the driver
//               more.
//   odometers   Per car, the larger figure. Distance never comes back down.
//
// Initials are the one thing with no better-or-worse to it, so they are not
// contested: this device keeps its own unless it never set any.

import {
  BOARD_SIZE,
  DEFAULT_INITIALS,
  lastInitials,
  loadBoard,
  rememberInitials,
  saveBoard,
  type ScoreEntry,
} from "./scores.ts";
import { loadProgress, saveProgress, type CampaignProgress, type StageScores } from "./campaign.ts";
import { PLAYER_ID } from "./standings.ts";
import { loadSplitRecords, saveSplitRecords, type SplitRecords } from "./split-records.ts";
import { loadOdometer, saveOdometer } from "./odometer.ts";
import type { Difficulty } from "@engine";

/** The key prefixes the stores use. Spelled out here because the payload is
 * built by SCANNING them: a board's level id and a split's stage id are
 * generated from the road, not listed in a catalog, so there is nothing to
 * enumerate except the keys themselves. */
const BOARD_PREFIX = "scandi-flick-scores:";
const SPLIT_PREFIX = "scandi-flick-splits:";
const ODOMETER_PREFIX = "sf.odometer.";

export const CLOUD_SAVE_VERSION = 1;

export type CloudSave = {
  v: 1;
  /** Unix ms of the write. Informational — the merge never breaks a tie with
   * it, because two clocks on two devices are not one clock. */
  at: number;
  initials: string;
  boards: Record<string, ScoreEntry[]>;
  splits: Record<string, SplitRecords>;
  campaign: CampaignProgress;
  odometers: Record<string, number>;
};

/** Every key under a prefix, with the prefix taken off. */
function idsUnder(prefix: string): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) out.push(key.slice(prefix.length));
    }
  } catch {
    /* storage unavailable — an empty save is a save */
  }
  return out;
}

/** This device's save, as it would go up. */
export function localSave(): CloudSave {
  const boards: Record<string, ScoreEntry[]> = {};
  for (const id of idsUnder(BOARD_PREFIX)) boards[id] = [...loadBoard(id)];
  const splits: Record<string, SplitRecords> = {};
  for (const id of idsUnder(SPLIT_PREFIX)) splits[id] = loadSplitRecords(id);
  const odometers: Record<string, number> = {};
  for (const id of idsUnder(ODOMETER_PREFIX)) odometers[id] = loadOdometer(id);
  return {
    v: CLOUD_SAVE_VERSION,
    at: Date.now(),
    initials: lastInitials(),
    boards,
    splits,
    campaign: loadProgress(),
    odometers,
  };
}

/** One board from both devices: every row, the board's own order, no
 * duplicates, the same ten. A row is the same row when every field of it is —
 * which is what makes running this twice a no-op. */
export function mergeBoard(
  mine: readonly ScoreEntry[],
  theirs: readonly ScoreEntry[],
): ScoreEntry[] {
  const seen = new Set<string>();
  const rows: ScoreEntry[] = [];
  for (const row of [...mine, ...theirs]) {
    const id = `${row.who}|${row.time}|${row.carId}|${row.gearbox}|${row.difficulty}|${row.at}`;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(row);
  }
  return rows.sort((a, b) => a.time - b.time || a.at - b.at).slice(0, BOARD_SIZE);
}

/** Per sector, the faster of the two — and a sector only one device has ever
 * reached is kept rather than dropped for being absent on the other. */
export function mergeSplits(mine: SplitRecords, theirs: SplitRecords): SplitRecords {
  const length = Math.max(mine.length, theirs.length);
  const out: SplitRecords = [];
  for (let i = 0; i < length; i += 1) {
    const a = mine[i] ?? null;
    const b = theirs[i] ?? null;
    out.push(a === null ? b : b === null ? a : Math.min(a, b));
  }
  return out;
}

/** The points table from whichever run paid the driver more. Taken or left
 * whole: a table is one afternoon's whole field, and blending two would be a
 * season no afternoon produced. */
function betterTable(mine: StageScores | undefined, theirs: StageScores | undefined) {
  if (mine === undefined) return theirs;
  if (theirs === undefined) return mine;
  return (theirs[PLAYER_ID] ?? 0) > (mine[PLAYER_ID] ?? 0) ? theirs : mine;
}

/** FURTHEST PROGRESS, field by field. */
export function mergeCampaign(mine: CampaignProgress, theirs: CampaignProgress): CampaignProgress {
  // SORTED, so the merged record is identical whichever device produced it.
  // Both devices upload what they merged; an order-only difference would read
  // as a change to the other one and bounce the save back and forth.
  const finished = [...new Set([...mine.finished, ...theirs.finished])].sort();

  const points: Record<string, StageScores> = { ...mine.points };
  for (const id of Object.keys(theirs.points)) {
    const better = betterTable(mine.points[id], theirs.points[id]);
    if (better) points[id] = better;
  }

  const best: Record<string, number> = { ...mine.best };
  for (const [id, time] of Object.entries(theirs.best)) {
    const standing = best[id];
    if (standing === undefined || time < standing) best[id] = time;
  }

  // A PLACE IS ONLY MEANINGFUL AGAINST THE FIELD THAT PRODUCED IT, which is
  // why the game files it per difficulty — so the merge does too, rather
  // than letting a third place on EASY overwrite a fourth on HARD.
  const places: Record<string, Partial<Record<Difficulty, number>>> = {};
  for (const id of new Set([...Object.keys(mine.places), ...Object.keys(theirs.places)])) {
    const a = mine.places[id] ?? {};
    const b = theirs.places[id] ?? {};
    const row: Partial<Record<Difficulty, number>> = { ...a };
    for (const [key, place] of Object.entries(b) as [Difficulty, number][]) {
      const standing = row[key];
      if (standing === undefined || place < standing) row[key] = place;
    }
    places[id] = row;
  }

  return { finished, points, best, places };
}

/** Per car, the larger figure. Distance never comes back down. */
export function mergeOdometers(
  mine: Record<string, number>,
  theirs: Record<string, number>,
): Record<string, number> {
  const out = { ...mine };
  for (const [carId, metres] of Object.entries(theirs)) {
    if (!Number.isFinite(metres) || metres < 0) continue;
    out[carId] = Math.max(out[carId] ?? 0, metres);
  }
  return out;
}

/** A blob off the cloud, trusted no further than this build's own validators
 * trust a stored one. */
export function parseSave(text: string | null): CloudSave | null {
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const blob = parsed as Record<string, unknown>;
  const record = <T>(value: unknown, keep: (row: unknown) => T | null): Record<string, T> => {
    const out: Record<string, T> = {};
    if (!value || typeof value !== "object") return out;
    for (const [id, row] of Object.entries(value as Record<string, unknown>)) {
      const kept = keep(row);
      if (kept !== null) out[id] = kept;
    }
    return out;
  };
  const progress = blob.campaign as Partial<CampaignProgress> | undefined;
  return {
    v: CLOUD_SAVE_VERSION,
    at: typeof blob.at === "number" && Number.isFinite(blob.at) ? blob.at : 0,
    initials: typeof blob.initials === "string" ? blob.initials : DEFAULT_INITIALS,
    boards: record(blob.boards, (rows) =>
      Array.isArray(rows) ? (rows as ScoreEntry[]).filter((r) => r && typeof r === "object") : null,
    ),
    splits: record(blob.splits, (rows) =>
      Array.isArray(rows)
        ? rows.map((v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null))
        : null,
    ),
    campaign: {
      finished: Array.isArray(progress?.finished)
        ? progress.finished.filter((id): id is string => typeof id === "string")
        : [],
      points: record(progress?.points, (row) =>
        row && typeof row === "object" ? (row as StageScores) : null,
      ),
      best: record(progress?.best, (v) =>
        typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null,
      ),
      places: record(progress?.places, (row) =>
        row && typeof row === "object" ? (row as Partial<Record<Difficulty, number>>) : null,
      ),
    },
    odometers: record(blob.odometers, (v) =>
      typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null,
    ),
  };
}

/** MERGE A CLOUD SAVE INTO THIS DEVICE and hand back what should go up.
 *
 * Written to local storage before it is returned: a device that merged and
 * then failed to upload has still KEPT the other device's work, which is the
 * half that cannot be recovered by trying again. */
export function applyCloudSave(remote: CloudSave | null): CloudSave {
  const mine = localSave();
  if (remote === null) return mine;

  const boards: Record<string, ScoreEntry[]> = {};
  for (const id of new Set([...Object.keys(mine.boards), ...Object.keys(remote.boards)])) {
    boards[id] = saveBoard(id, mergeBoard(mine.boards[id] ?? [], remote.boards[id] ?? []));
  }

  const splits: Record<string, SplitRecords> = {};
  for (const id of new Set([...Object.keys(mine.splits), ...Object.keys(remote.splits)])) {
    splits[id] = mergeSplits(mine.splits[id] ?? [], remote.splits[id] ?? []);
    saveSplitRecords(id, splits[id]);
  }

  const campaign = mergeCampaign(mine.campaign, remote.campaign);
  saveProgress(campaign);

  const odometers = mergeOdometers(mine.odometers, remote.odometers);
  for (const [carId, metres] of Object.entries(odometers)) saveOdometer(carId, metres);

  // Initials are not contested: a name is not better or worse than another
  // name. This device keeps its own unless it never set any.
  const initials = mine.initials === DEFAULT_INITIALS ? remote.initials : mine.initials;
  if (initials !== mine.initials) rememberInitials(initials);

  return { v: CLOUD_SAVE_VERSION, at: Date.now(), initials, boards, splits, campaign, odometers };
}
