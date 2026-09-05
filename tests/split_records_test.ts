// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SEGMENT RECORDS — the book behind the two words that go up beside a
// split when the road since the last board has just been taken quicker than
// it has ever been taken on this machine.
//
// Everything interesting here is a run that must NOT be rewarded: a segment
// that only equalled the standing time, a board reached out of order, a key
// somebody hand-edited into holding a zero. Each of them is a "NEW RECORD!"
// on a screen that would be a lie.
//
// No DOM: `split-records.ts` reaches for `localStorage`, which Node declares
// and vitest runs without — so the store is stubbed and the module is driven
// through its real read/write path rather than around it.

import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_KNOBS } from "@engine";

import {
  loadSplitRecords,
  postSplitRecord,
  splitStageId,
  type SplitRecords,
  type SplitStage,
} from "../pwa/src/game/split-records.ts";

/** A localStorage that lives for one test. */
function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const api = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as { localStorage?: unknown }).localStorage = api;
  return store;
}

const stage = (over: Partial<SplitStage> = {}): SplitStage => ({
  seed: 4711,
  length: "medium",
  shape: "sprint",
  laps: 1,
  knobs: DEFAULT_KNOBS,
  ...over,
});

const ID = splitStageId(stage());

describe("which stage a record belongs to", () => {
  it("separates two seeds", () => {
    expect(splitStageId(stage({ seed: 1 }))).not.toBe(splitStageId(stage({ seed: 2 })));
  });

  it("separates the same seed driven at two lengths, shapes and lap counts", () => {
    expect(splitStageId(stage({ length: "long" }))).not.toBe(ID);
    expect(splitStageId(stage({ shape: "circuit" }))).not.toBe(ID);
    expect(splitStageId(stage({ laps: 3 }))).not.toBe(ID);
  });

  it("separates the same seed built on different dials", () => {
    const other = { ...DEFAULT_KNOBS, elevation: DEFAULT_KNOBS.elevation + 0.2 };
    expect(splitStageId(stage({ knobs: other }))).not.toBe(ID);
  });

  // The record is the ROAD's, not the car's. Partitioning it by everything
  // that changes a lap time would leave every partition holding one run.
  it("is the same road whoever drives it in whatever", () => {
    expect(splitStageId(stage())).toBe(ID);
  });
});

describe("the book", () => {
  let best: SplitRecords;
  beforeEach(() => {
    stubStorage();
    best = [];
  });

  it("calls the first time down a segment a record", () => {
    expect(postSplitRecord(ID, best, 0, 16.52)).toBe(true);
    expect(best[0]).toBe(16.52);
  });

  it("calls a quicker one a record and keeps it", () => {
    postSplitRecord(ID, best, 0, 16.52);
    expect(postSplitRecord(ID, best, 0, 16.51)).toBe(true);
    expect(best[0]).toBe(16.51);
  });

  it("says nothing for a slower run, and leaves the record standing", () => {
    postSplitRecord(ID, best, 0, 16.52);
    expect(postSplitRecord(ID, best, 0, 17)).toBe(false);
    expect(best[0]).toBe(16.52);
  });

  // A dead heat is not a record. Rewarding it would put the words up every
  // time a segment was repeated to the hundredth on a short, easy board.
  it("says nothing for a dead heat", () => {
    postSplitRecord(ID, best, 0, 16.52);
    expect(postSplitRecord(ID, best, 0, 16.52)).toBe(false);
  });

  // R28 — a board can be missed and the next one taken, so the book has to
  // hold a hole rather than shuffling the times it does have down onto the
  // wrong pieces of road.
  it("leaves holes for the boards nobody has reached", () => {
    postSplitRecord(ID, best, 3, 12.25);
    expect(best).toEqual([null, null, null, 12.25]);
    expect(postSplitRecord(ID, best, 1, 9.5)).toBe(true);
    expect(best).toEqual([null, 9.5, null, 12.25]);
  });

  it("refuses a segment that is not a drive", () => {
    expect(postSplitRecord(ID, best, 0, 0)).toBe(false);
    expect(postSplitRecord(ID, best, 0, -3)).toBe(false);
    expect(postSplitRecord(ID, best, 0, Number.NaN)).toBe(false);
    expect(postSplitRecord(ID, best, -1, 12)).toBe(false);
    expect(best).toEqual([]);
  });
});

describe("reading the book back", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("comes back empty for a stage nobody has driven", () => {
    expect(loadSplitRecords(ID)).toEqual([]);
  });

  it("comes back with what was banked, on this stage only", () => {
    const best: SplitRecords = [];
    postSplitRecord(ID, best, 0, 16.52);
    postSplitRecord(ID, best, 1, 12.25);
    expect(loadSplitRecords(ID)).toEqual([16.52, 12.25]);
    expect(loadSplitRecords(splitStageId(stage({ seed: 9 })))).toEqual([]);
  });

  // A key is a file on somebody's machine. Nothing read out of one is
  // trusted for what it claims — a stored zero would be a record no drive
  // could ever beat, which takes the reward off the stage for good.
  it("throws away anything a key claims that a drive could not have set", () => {
    localStorage.setItem(`scandi-flick-splits:${ID}`, JSON.stringify([0, "quick", 12.25, -1]));
    expect(loadSplitRecords(ID)).toEqual([null, null, 12.25, null]);
    localStorage.setItem(`scandi-flick-splits:${ID}`, "{}");
    expect(loadSplitRecords(ID)).toEqual([]);
    localStorage.setItem(`scandi-flick-splits:${ID}`, "not json");
    expect(loadSplitRecords(ID)).toEqual([]);
  });
});

describe("a machine with no storage at all", () => {
  it("still calls the records set this session", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const best: SplitRecords = [];
    expect(loadSplitRecords(ID)).toEqual([]);
    expect(postSplitRecord(ID, best, 0, 16.52)).toBe(true);
    expect(postSplitRecord(ID, best, 0, 17)).toBe(false);
    expect(postSplitRecord(ID, best, 0, 16.4)).toBe(true);
  });
});
