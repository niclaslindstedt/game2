// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE APP'S OWN FORMATTERS — the figures every board, sheet and clock in the
// game is read in.
//
// They are small, and every one of them is printed somewhere a player is
// comparing two numbers, so the only interesting cases are the ones where a
// naive version prints something that reads as a different value: a missing
// leading zero, a year that quietly disappears, an eleventh that says 11ST.

import { describe, expect, it } from "vitest";

import { formatDay, formatTime, ordinal } from "../pwa/src/lib/util.ts";

describe("the race clock", () => {
  it("pads to hundredths, so two times line up in a column", () => {
    expect(formatTime(0)).toBe("0'00\"00");
    expect(formatTime(69.45)).toBe("1'09\"45");
    expect(formatTime(125.5)).toBe("2'05\"50");
    // Hundredths are CUT, never rounded up: a clock that rounds can show a
    // time nobody drove, and on a board that is somebody's record. That also
    // makes a value the binary cannot hold exactly read as the hundredth
    // BELOW it — 166.85 is stored a hair short of itself and shows 84.
    expect(formatTime(59.999)).toBe("0'59\"99");
    expect(formatTime(166.85)).toBe("2'46\"84");
  });

  it("never shows a negative clock", () => {
    expect(formatTime(-5)).toBe("0'00\"00");
  });
});

describe("a finishing position", () => {
  it("gets the teens right — the three every naive version gets wrong", () => {
    expect([1, 2, 3, 4].map(ordinal)).toEqual(["1ST", "2ND", "3RD", "4TH"]);
    expect([11, 12, 13].map(ordinal)).toEqual(["11TH", "12TH", "13TH"]);
    expect([21, 22, 23].map(ordinal)).toEqual(["21ST", "22ND", "23RD"]);
  });
});

describe("the day a board row was set", () => {
  const now = new Date(2026, 8, 3).getTime(); // 3 SEP 2026

  it("leaves this year's rows undated by year, and dates every other one", () => {
    expect(formatDay(new Date(2026, 8, 12).getTime(), now)).toBe("12 SEP");
    expect(formatDay(new Date(2026, 0, 1).getTime(), now)).toBe("1 JAN");
    // A row from a previous year says so, or it ages into a lie the moment
    // the calendar turns over.
    expect(formatDay(new Date(2024, 11, 31).getTime(), now)).toBe("31 DEC 24");
    expect(formatDay(new Date(2007, 5, 9).getTime(), now)).toBe("9 JUN 07");
  });

  it("says nothing at all for a stamp nobody wrote", () => {
    // Older rows and hand-edited keys carry no stamp; the board leaves the
    // date off that row rather than printing the epoch.
    expect(formatDay(0, now)).toBe("");
    expect(formatDay(Number.NaN, now)).toBe("");
    expect(formatDay(-1, now)).toBe("");
  });
});
