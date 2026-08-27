// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STUDIO CARD's timing and its suppression rules — the two halves of
// `pwa/src/game/splash.ts` a renderer is not needed to check, and the two
// that are easiest to get wrong in a way nobody notices until a release.
//
// The timing half is a policy with three inputs and one trap: the LOAD wins
// over both clocks. A card that lifted on its auto-dismiss while a stage's
// terrain was still being built would hand the player exactly the empty blue
// screen it was added to hide.
//
// The suppression half is worth a test because it is the difference between
// the screenshot harness capturing the game and it capturing three seconds
// of a publisher's name.

import { describe, expect, it } from "vitest";

import {
  SPLASH_AUTO_MS,
  SPLASH_MIN_MS,
  splashPhase,
  splashSkipped,
} from "../pwa/src/game/splash.ts";

describe("splashPhase", () => {
  it("never lifts ITSELF while the game is still loading", () => {
    // Past the auto-dismiss and still not warm: the card does not clear on
    // its own. This is the whole reason it exists.
    expect(splashPhase(SPLASH_AUTO_MS, false)).not.toBe("done");
    expect(splashPhase(SPLASH_AUTO_MS * 10, false)).not.toBe("done");
  });

  it("holds every launch for the minimum, so the name is read", () => {
    expect(splashPhase(0, true)).toBe("holding");
    expect(splashPhase(SPLASH_MIN_MS - 1, true)).toBe("holding");
    expect(splashPhase(0, false)).toBe("holding");
  });

  it("takes a press at the minimum whether or not the game is ready", () => {
    // A press is the player saying they are done reading; making them wait
    // on the world builder reads as a hung app.
    expect(splashPhase(SPLASH_MIN_MS, true)).toBe("skippable");
    expect(splashPhase(SPLASH_MIN_MS, false)).toBe("skippable");
    expect(splashPhase(SPLASH_AUTO_MS * 4, false)).toBe("skippable");
  });

  it("clears itself once the game is ready and the auto-dismiss is served", () => {
    expect(splashPhase(SPLASH_AUTO_MS, true)).toBe("done");
    expect(splashPhase(SPLASH_AUTO_MS + 1, true)).toBe("done");
  });

  it("keeps the minimum inside the auto-dismiss", () => {
    // Inverted, the card would be unskippable right up to the moment it
    // vanished on its own.
    expect(SPLASH_MIN_MS).toBeLessThan(SPLASH_AUTO_MS);
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
