// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ATTRACT SCREEN's readiness rule and its suppression rules — the halves
// of `pwa/src/game/splash.ts` a renderer is not needed to check, and the ones
// that are easiest to get wrong in a way nobody notices until a release.
//
// Readiness is a policy with three inputs and one trap: the LOAD wins over the
// clock. A card that invited a press while a stage's terrain was still being
// built would hand the player exactly the empty blue screen it was added to
// hide — and since nothing lifts the card on a timer any more, a rule that let
// the clock alone open it up would be the only way back to that bug.
//
// The suppression half is worth a test because it is the difference between
// the screenshot harness capturing the game and it capturing a card that waits
// forever for a keypress nobody is there to give it.

import { describe, expect, it } from "vitest";

import {
  SPLASH_MIN_MS,
  SPLASH_STUCK_MS,
  splashReady,
  splashSkipped,
} from "../pwa/src/game/splash.ts";

describe("splashReady", () => {
  it("holds every launch for the minimum, so the house's name is read", () => {
    expect(splashReady(0, true)).toBe(false);
    expect(splashReady(SPLASH_MIN_MS - 1, true)).toBe(false);
    expect(splashReady(0, false)).toBe(false);
  });

  it("opens up the moment the game is standing", () => {
    expect(splashReady(SPLASH_MIN_MS, true)).toBe(true);
    expect(splashReady(SPLASH_MIN_MS * 4, true)).toBe(true);
  });

  it("keeps waiting while the game is still loading", () => {
    // The whole reason the card exists: no amount of elapsed time short of the
    // dead man's handle invites a press onto a half-built menu.
    expect(splashReady(SPLASH_MIN_MS, false)).toBe(false);
    expect(splashReady(SPLASH_STUCK_MS - 1, false)).toBe(false);
  });

  it("lets the player through on a boot that never reported in", () => {
    expect(splashReady(SPLASH_STUCK_MS, false)).toBe(true);
    expect(splashReady(SPLASH_STUCK_MS * 10, false)).toBe(true);
  });

  it("keeps the minimum inside the dead man's handle", () => {
    // Inverted, the card would open up before it had held its own minimum.
    expect(SPLASH_MIN_MS).toBeLessThan(SPLASH_STUCK_MS);
  });
});

describe("splashSkipped", () => {
  it("shows the card on a plain launch", () => {
    expect(splashSkipped("")).toBe(false);
    expect(splashSkipped("?seed=42")).toBe(false);
  });

  it("suppresses it for a pinned run — the screenshot harness's launch", () => {
    expect(splashSkipped("?start=1")).toBe(true);
    expect(splashSkipped("?seed=42&start=1")).toBe(true);
    expect(splashSkipped("?splash=0")).toBe(true);
  });

  it("lets the card be forced back for looking at the card itself", () => {
    expect(splashSkipped("?splash=1")).toBe(false);
    expect(splashSkipped("?start=1&splash=1")).toBe(false);
  });
});
