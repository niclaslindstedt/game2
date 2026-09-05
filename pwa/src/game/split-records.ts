// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SEGMENT RECORDS — the quickest this machine has ever covered the road
// between one split board and the next.
//
// This is not the high score table (scores.ts) and it is not the campaign's
// best time. Both of those are about a WHOLE stage and about who set it; a
// segment record is about one piece of road, it carries no name, and it is
// never shown as a number. The only thing it is for is the two words that go
// up beside the split when the board that has just gone past was taken
// quicker than it has ever been taken here — the arcade's oldest reward, and
// the reason a stage stays worth driving once its finish time is settled.
//
// A RECORD IS BANKED THE MOMENT IT IS SET, not at the finish: the segment
// that was driven was driven, and a run thrown away against a tree three
// corners later does not un-drive it.
//
// Storage is one localStorage key per stage, holding the best seconds per
// board with a hole for every board nobody has reached yet. Storage can be
// unavailable (private mode) or full; records that cannot be kept simply are
// not kept, and the run still counts for everything else. A key can also be
// hand-edited, so nothing read back out of one is trusted for what it claims.

import { NUMERIC_KNOBS, type StageKnobs } from "@engine";

const KEY_PREFIX = "scandi-flick-splits:";

/** Everything about a stage that decides WHERE the boards stand and how much
 * road runs between them. The car, the weather and the time of day are all
 * deliberately absent: a record here is the road's, and partitioning it by
 * everything that changes a lap time would leave every partition holding one
 * run — which is a stopwatch, not a record. */
export type SplitStage = {
  seed: number;
  length: string;
  shape: string;
  laps: number;
  knobs: StageKnobs;
};

/** The storage key's tail — one string per generated stage, built from the
 * same fields the generator was handed. */
export function splitStageId(stage: SplitStage): string {
  const dials = NUMERIC_KNOBS.map((key) => stage.knobs[key].toFixed(3)).join(",");
  return `${stage.seed}/${stage.length}/${stage.shape}/${stage.laps}/${stage.knobs.biome}/${dials}`;
}

/** The best seconds for each board on the lap, in board order. A hole is a
 * board that has never been reached — which is most of them, on most stages,
 * for as long as a player is still learning the road. */
export type SplitRecords = (number | null)[];

/** A stored time worth keeping: a real, positive number of seconds. A zero
 * or a negative is a hand-edited key rather than a drive, and a record that
 * can never be beaten would take the reward away from the stage for good. */
function usable(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function loadSplitRecords(stageId: string): SplitRecords {
  try {
    const stored = localStorage.getItem(KEY_PREFIX + stageId);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => (usable(value) ? value : null));
  } catch {
    return [];
  }
}

/** Offer a segment to the book. Returns whether it went in — which is what
 * the HUD flashes — and writes the whole stage's records back when it does.
 *
 * `records` is updated in place: the caller holds the run's own copy so a
 * second board does not have to read the key back off disk, and so a machine
 * with no storage at all still calls the records it has set this session. */
export function postSplitRecord(
  stageId: string,
  records: SplitRecords,
  index: number,
  seconds: number,
): boolean {
  if (!usable(seconds) || index < 0 || !Number.isInteger(index)) return false;
  const standing = records[index];
  if (usable(standing) && standing <= seconds) return false;
  // A board reached out of order leaves holes behind it rather than
  // `undefined`s, so what is written back is always JSON's own null.
  while (records.length < index) records.push(null);
  records[index] = seconds;
  try {
    localStorage.setItem(KEY_PREFIX + stageId, JSON.stringify(records));
  } catch {
    /* storage unavailable or full — the record still stands for this run */
  }
  return true;
}
