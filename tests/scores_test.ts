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
  erase,
  moveCaret,
  nameOf,
  startEntry,
  toSlot,
  typeChar,
  wheel,
  WHEEL,
  type InitialsState,
} from "../pwa/src/game/initials-entry.ts";
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

  it("defaults to ONE letter and then offers back whatever was last entered", () => {
    expect(lastInitials()).toBe(DEFAULT_INITIALS);
    expect(DEFAULT_INITIALS.trim()).toBe("A"); // not AAA — a name nobody typed
    rememberInitials("NIC");
    expect(lastInitials()).toBe("NIC");
  });

  it("stores exactly three characters the alphabet has, whatever it is handed", () => {
    expect(normalizeInitials("nic")).toBe("NIC");
    // Padded so the board never has to align ragged rows — with BLANKS, so a
    // one-letter name stays a one-letter name.
    expect(normalizeInitials("N")).toBe("N  ");
    expect(normalizeInitials("")).toBe(DEFAULT_INITIALS);
    expect(normalizeInitials("TOOLONG")).toBe("TOO");
    // Anything off the alphabet is dropped rather than stored as itself.
    expect(normalizeInitials("é!x")).toBe("X  ");
    for (const c of normalizeInitials("💥💥💥")) expect(ALPHABET).toContain(c);
    // A hole is not a name a slot can be put back on: it closes up.
    expect(normalizeInitials("N C")).toBe("NC ");
    expect(normalizeInitials("   ")).toBe(DEFAULT_INITIALS);
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

// The entry is two controls over one name — a keyboard and a wheel — and the
// whole design is in what each of them does to the slot the caret moves ONTO.
// Every case below is a player entering their own initials, so getting one
// wrong is a name somebody has to fight the card to correct.
describe("entering the letters", () => {
  /** Type a whole string, one character at a time. */
  const type = (state: InitialsState, chars: string): InitialsState =>
    [...chars].reduce(typeChar, state);

  /** Turn the wheel, one press at a time. */
  const turn = (state: InitialsState, by: number, times = 1): InitialsState => {
    let now = state;
    for (let i = 0; i < times; i += 1) now = wheel(now, by);
    return now;
  };

  it("opens on ONE letter, with the caret on it", () => {
    const open = startEntry(DEFAULT_INITIALS);
    expect(nameOf(open)).toBe("A  ");
    expect(open.caret).toBe(0);
    expect(open.fresh).toBe(true);
  });

  it("never repeats a letter under a keyboard", () => {
    // The thing the card is for: NLM is typed as NLM and reads back as NLM.
    expect(nameOf(type(startEntry(DEFAULT_INITIALS), "NLM"))).toBe("NLM");
    // …and a name shorter than the slots simply stops.
    const two = type(startEntry(DEFAULT_INITIALS), "NL");
    expect(nameOf(two)).toBe("NL ");
    expect(two.caret).toBe(2);
  });

  it("throws the offered name away on the first character typed", () => {
    const offered = startEntry("NIC");
    expect(nameOf(offered)).toBe("NIC");
    // X is a player called X, not one called XIC.
    expect(nameOf(typeChar(offered, "x"))).toBe("X  ");
    // Wheeling and tapping are EDITS of the offered name, not a fresh start.
    expect(nameOf(toSlot(offered, 2))).toBe("NIC");
    expect(nameOf(turn(offered, 1))).toBe("OIC");
  });

  it("wakes an empty slot holding the letter to its left", () => {
    // The arcade's own way in: wheel to N, step across, and the next slot is
    // already N — so L and M are two presses away instead of eleven.
    const n = turn(startEntry(DEFAULT_INITIALS), 1, 13);
    expect(nameOf(n)).toBe("N  ");
    const second = moveCaret(n, 1);
    expect(nameOf(second)).toBe("NN ");
    expect(second.caret).toBe(1);
    const nl = turn(second, -1, 2);
    expect(nameOf(nl)).toBe("NL ");
    expect(nameOf(turn(moveCaret(nl, 1), 1))).toBe("NLM");
  });

  it("wakes on the first wheel press against a blank, and steps from the second", () => {
    // Typed N, then reached for the wheel: the press that finds an empty slot
    // fills it rather than stepping through it, so a mixed entry gets the
    // same head start a wheeled one does.
    const typed = type(startEntry(DEFAULT_INITIALS), "N");
    expect(nameOf(wheel(typed, 1))).toBe("NN ");
    expect(nameOf(turn(typed, 1, 2))).toBe("NO ");
  });

  it("has no space on the wheel — A goes down to 9, and 9 up to A", () => {
    expect(WHEEL).not.toContain(" ");
    const open = startEntry(DEFAULT_INITIALS);
    expect(nameOf(turn(open, -1))).toBe("9  ");
    expect(nameOf(turn(open, -1, 2))).toBe("8  ");
    expect(nameOf(turn(open, -1, 11))).toBe("Z  ");
    expect(nameOf(turn(turn(open, -1), 1))).toBe("A  ");
  });

  it("never leaves a hole for the caret to fall into", () => {
    // Tapping the third slot of a one-letter name lands on the second: a name
    // is entered left to right, and "A_N" is not a name a slot can hold.
    const open = startEntry(DEFAULT_INITIALS);
    const tapped = toSlot(open, 2);
    expect(tapped.caret).toBe(1);
    expect(nameOf(tapped)).toBe("AA ");
    // Right off the end of a full name stays on the last slot.
    expect(moveCaret(type(open, "NLM"), 1).caret).toBe(INITIALS_LENGTH - 1);
    expect(moveCaret(open, -1).caret).toBe(0);
  });

  it("erases from the caret back, and always leaves a name behind", () => {
    const three = type(startEntry(DEFAULT_INITIALS), "NLM");
    const two = erase(three);
    expect(nameOf(two)).toBe("NL ");
    expect(two.caret).toBe(2);
    // The caret is now on a blank, so the next press takes the slot before it.
    expect(nameOf(erase(two))).toBe("N  ");
    // …and the last letter cannot be deleted into nothing: a board row with
    // no name on it is not a state the card is allowed to reach.
    const bare = erase(erase(erase(three)));
    expect(nameOf(bare)).toBe("A  ");
    expect(bare.caret).toBe(0);
  });

  it("only ever makes a name the board can store", () => {
    let now = startEntry("NIC");
    for (const press of ["type:9", "wheel:1", "move:1", "erase", "tap:2", "wheel:-1", "type:Q"]) {
      const [what, arg] = press.split(":");
      if (what === "type") now = typeChar(now, arg as string);
      else if (what === "wheel") now = wheel(now, Number(arg));
      else if (what === "move") now = moveCaret(now, Number(arg));
      else if (what === "tap") now = toSlot(now, Number(arg));
      else now = erase(now);
      const name = nameOf(now);
      expect(name.length).toBe(INITIALS_LENGTH);
      expect(normalizeInitials(name)).toBe(name);
      for (const c of name) expect(ALPHABET).toContain(c);
    }
  });
});
