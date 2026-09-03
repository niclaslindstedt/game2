// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The rolling counter behind the pre-race card's figures. It is the maths
// only — the caller owns the clock — which is exactly what makes it worth a
// test: where the number stands a third of the way through a press is a
// question with an answer, and it is the answer a browser would otherwise
// have to be started to see.

import { describe, expect, it } from "vitest";

import { COUNT_SECONDS, countAt } from "../pwa/src/lib/count.ts";

describe("a figure that counts", () => {
  it("starts where it was and arrives where it is going", () => {
    expect(countAt(100, 223, 0)).toBe(100);
    expect(countAt(100, 223, COUNT_SECONDS)).toBe(223);
    // Asked past the end it is simply the target, so a caller that keeps a
    // stale frame — or a tab that comes back from the background — reads the
    // right number rather than an overshoot.
    expect(countAt(100, 223, 60)).toBe(223);
    expect(countAt(100, 223, -1)).toBe(100);
  });

  it("travels one way, and never past either end", () => {
    let last = countAt(100, 223, 0);
    for (let at = 0.02; at <= COUNT_SECONDS; at += 0.02) {
      const now = countAt(100, 223, at);
      expect(now).toBeGreaterThanOrEqual(last);
      expect(now).toBeLessThanOrEqual(223);
      last = now;
    }
    // ...and downhill just as monotonically: the transmission is a choice
    // that can be taken back, and a figure that only ever counted up would
    // snap on the way home.
    let down = countAt(223, 100, 0);
    for (let at = 0.02; at <= COUNT_SECONDS; at += 0.02) {
      const now = countAt(223, 100, at);
      expect(now).toBeLessThanOrEqual(down);
      expect(now).toBeGreaterThanOrEqual(100);
      down = now;
    }
  });

  it("leaves at once and settles", () => {
    // The ease-out is the whole reason this is not a lerp: the movement has
    // to be unmistakable at the press, and the last digits — the ones worth
    // reading — the slowest. Over half the distance is gone by the quarter
    // mark, and under a tenth is left in the last quarter.
    const half = countAt(0, 1, COUNT_SECONDS * 0.25);
    expect(half).toBeGreaterThan(0.5);
    expect(countAt(0, 1, COUNT_SECONDS * 0.75)).toBeGreaterThan(0.9);
  });

  it("does not divide by a run of no length", () => {
    expect(countAt(4, 9, 0, 0)).toBe(9);
  });
});
