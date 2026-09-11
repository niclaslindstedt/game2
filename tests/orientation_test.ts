// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PORTRAIT IS TURNED OFF — the rules behind the cover in `orientation-gate.tsx`.
//
// Two of these are load-bearing rather than arithmetic. The SWITCH has to stay
// a single boolean nothing else duplicates, because the whole point of the
// change is that the upright layout is disabled rather than deleted and can
// be handed back with one edit. And the cover has to PAUSE a live run, for
// the same reason a lost GPU context does: it is opaque, and a run nobody can
// see is a car being driven into the scenery.

import { describe, expect, it } from "vitest";

import {
  PORTRAIT_ALLOWED,
  PORTRAIT_QUERY,
  gateCopy,
  mustPause,
  portraitBarred,
} from "../pwa/src/game/orientation.ts";

describe("the portrait switch", () => {
  it("is off — the game is landscape only", () => {
    expect(PORTRAIT_ALLOWED).toBe(false);
  });

  it("bars an upright viewport and leaves a sideways one alone", () => {
    expect(portraitBarred(true)).toBe(true);
    expect(portraitBarred(false)).toBe(false);
  });

  it("watches the same media query the portrait HUD is written behind", () => {
    // CSS counts a SQUARE viewport as portrait; a hand-rolled width/height
    // comparison is one `>=` away from disagreeing with every rule the cover
    // exists to keep the player out of.
    expect(PORTRAIT_QUERY).toBe("(orientation: portrait)");
  });
});

describe("a run under the cover", () => {
  it("goes on the pause card, because the road is no longer on screen", () => {
    expect(mustPause(true, false)).toBe(true);
  });

  it("leaves a menu alone — what is driving under one is a bot", () => {
    expect(mustPause(true, true)).toBe(false);
  });

  it("pauses nothing while the screen is the right way round", () => {
    expect(mustPause(false, false)).toBe(false);
  });
});

describe("what the cover asks for", () => {
  it("tells a phone to turn and a window to widen", () => {
    expect(gateCopy("device").head).toBe("TURN YOUR DEVICE");
    expect(gateCopy("window").head).toBe("WIDEN THE WINDOW");
  });

  it("names the game in both, so the card is never anonymous", () => {
    for (const kind of ["device", "window"] as const) {
      expect(gateCopy(kind).line).toContain("Scandinavian Flick");
    }
  });
});
