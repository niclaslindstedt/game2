// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HIGH SCORE TABLE — the rules a board has to obey, all of which are
// invisible until somebody's run is thrown away by one of them.
//
// The interesting cases are all boundaries: the tenth row under threat, a
// dead heat with a time already up there, a board read back out of a storage
// key somebody else wrote. Every one of them is a run a player drove, so
// getting it wrong is never cosmetic.
//
// No DOM: `scores.ts` reaches for `localStorage`, which Node declares and
// vitest runs without — so the store is stubbed here and the module is
// exercised through its real read/write path rather than around it.

import { beforeEach, describe, expect, it } from "vitest";

import {
  ALPHABET,
  BOARD_SIZE,
  DEFAULT_INITIALS,
  INITIALS_LENGTH,
  lastInitials,
  loadBoard,
  normalizeInitials,
  placeOn,
  recordScore,
  rememberInitials,
  type ScoreEntry,
} from "../pwa/src/game/scores.ts";

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

const entry = (who: string, time: number, at = 0): ScoreEntry => ({
  who,
  time,
  carId: "compact",
  at,
});

describe("the board", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("keeps the ten quickest, in order, and drops the eleventh", () => {
    // Put twelve times on in a deliberately unhelpful order.
    for (const t of [90, 61, 77, 105, 55, 88, 66, 99, 72, 83, 120, 58]) {
      recordScore("taiga-1", entry(`T${t}`.slice(0, INITIALS_LENGTH), t));
    }
    const board = loadBoard("taiga-1");
    expect(board.length).toBe(BOARD_SIZE);
    expect(board.map((r) => r.time)).toEqual([55, 58, 61, 66, 72, 77, 83, 88, 90, 99]);
  });

  it("places a dead heat BELOW the row it tied — you did not beat it", () => {
    const board = [entry("AAA", 60), entry("BBB", 70)];
    expect(placeOn(board, 59.9)).toBe(0);
    expect(placeOn(board, 60)).toBe(1);
    expect(placeOn(board, 70)).toBe(2);
  });

  it("says a slow run on a full board did not make it", () => {
    const full = Array.from({ length: BOARD_SIZE }, (_, i) => entry("AAA", 60 + i));
    expect(placeOn(full, 61.5)).toBe(2);
    expect(placeOn(full, 200)).toBe(-1);
    // …and a partly full one always has room.
    expect(placeOn(full.slice(0, 3), 200)).toBe(3);
  });

  it("never places a time that is not one", () => {
    expect(placeOn([], 0)).toBe(-1);
    expect(placeOn([], -3)).toBe(-1);
    expect(placeOn([], Number.NaN)).toBe(-1);
  });

  it("keeps each stage's board to itself", () => {
    recordScore("taiga-1", entry("ABC", 60));
    recordScore("taiga-2", entry("XYZ", 90));
    expect(loadBoard("taiga-1").map((r) => r.who)).toEqual(["ABC"]);
    expect(loadBoard("taiga-2").map((r) => r.who)).toEqual(["XYZ"]);
    expect(loadBoard("taiga-3")).toEqual([]);
  });

  it("reads a corrupt or hand-edited key as an empty board rather than throwing", () => {
    const store = stubStorage();
    store.set("scandi-flick-scores:taiga-1", "{ not json");
    expect(loadBoard("taiga-1")).toEqual([]);
    store.set("scandi-flick-scores:taiga-1", JSON.stringify({ who: "AAA" }));
    expect(loadBoard("taiga-1")).toEqual([]);
    // Rows that are not runs are dropped; the ones that are survive.
    store.set(
      "scandi-flick-scores:taiga-1",
      JSON.stringify([entry("AAA", 60), { who: "BBB" }, entry("CCC", 0), entry("DDD", 50)]),
    );
    expect(loadBoard("taiga-1").map((r) => r.who)).toEqual(["DDD", "AAA"]);
  });
});

describe("the three letters", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("defaults to AAA and then offers back whatever was last entered", () => {
    expect(lastInitials()).toBe(DEFAULT_INITIALS);
    rememberInitials("NIC");
    expect(lastInitials()).toBe("NIC");
  });

  it("stores exactly three characters the alphabet has, whatever it is handed", () => {
    expect(normalizeInitials("nic")).toBe("NIC");
    expect(normalizeInitials("N")).toBe("NAA"); // padded, never ragged
    expect(normalizeInitials("")).toBe(DEFAULT_INITIALS);
    expect(normalizeInitials("TOOLONG")).toBe("TOO");
    // Anything off the alphabet is dropped rather than stored as itself.
    expect(normalizeInitials("é!x")).toBe("XAA");
    for (const c of normalizeInitials("💥💥💥")) expect(ALPHABET).toContain(c);
  });

  it("survives storage being unavailable", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {
        throw new Error("private mode");
      },
      removeItem: () => undefined,
    };
    expect(lastInitials()).toBe(DEFAULT_INITIALS);
    expect(() => rememberInitials("ABC")).not.toThrow();
    expect(loadBoard("taiga-1")).toEqual([]);
    // The board still comes back so the card can show where the run landed,
    // even though nothing could be written down.
    expect(recordScore("taiga-1", entry("ABC", 60)).map((r) => r.who)).toEqual(["ABC"]);
  });
});
