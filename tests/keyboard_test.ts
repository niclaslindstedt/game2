// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE KEYBOARD AS A CONTROLLER, and the promise that makes it one: a key
// bound to the car is SPENT on the car.
//
// Every surface the player presses in this game is a `<button>`, and a mouse
// press leaves the browser aiming the keyboard at the one it landed on — so
// without the rule below, the driver who reached for the HUD's way back to
// the road gets it again on the next ENTER, on top of the picture ENTER is
// actually bound to. A card is the exception, and the reason the rule is
// conditional rather than flat: there DOM focus is the menu cursor, and ENTER
// on the row it is standing on has to press that row.
//
// It imports from pwa/ because that is where the bindings live, and it can:
// the rule is a question about two values, stated beside the bindings rather
// than inside the manager that reads a real keyboard.

import { describe, expect, it } from "vitest";

import { browserKeepsKey, DEFAULT_KEYS } from "../pwa/src/game/settings-input.ts";

/** What a press of `code` resolves to, the way the manager's own map does. */
const boundTo = (code: string): string[] =>
  (Object.entries(DEFAULT_KEYS) as [string, string[]][])
    .filter(([, codes]) => codes.includes(code))
    .map(([action]) => action);

describe("the keys a driver reaches for", () => {
  it("are the three the run is steered out of trouble with", () => {
    // R puts the car back on the road at the last board, B throws the stage
    // away and starts it again, ENTER takes the picture. Three presses, three
    // separate things, and no key doing two of them.
    expect(boundTo("KeyR")).toEqual(["reset"]);
    expect(boundTo("KeyB")).toEqual(["restart"]);
    expect(boundTo("Enter")).toEqual(["screenshot"]);
  });

  it("puts the HUD on H, and gives H to nothing else", () => {
    // H for HUD, and the press flips the SAME switch OPTIONS ▸ HUD and the
    // pause card carry — so a HUD turned off mid-stage is still off on the
    // next one, and there is a row on screen saying so. That is what
    // separates it from the chrome ALT and god mode's Z take off, which is a
    // frame being photographed and comes back on its own.
    expect(boundTo("KeyH")).toEqual(["hud"]);
    // …and a letter that shares a hand with a pedal or a gear would take the
    // HUD down every time it was reached for.
    expect(DEFAULT_KEYS.hud).toEqual(["KeyH"]);
  });
});

describe("a key the game has acted on", () => {
  it("is taken off the browser while the run owns the screen", () => {
    // The bug this rule exists for: ENTER takes the picture it is bound to
    // AND, left to the browser, presses whatever the last mouse press
    // focused — the way back to the last board, if that is what the driver
    // reached for mid-stage.
    expect(browserKeepsKey(["screenshot"], false, false)).toBe(false);
    // ...and so is every other press the car answers to.
    for (const action of ["reset", "restart", "camera", "pause", "menu", "hud"] as const) {
      expect(browserKeepsKey([action], false, false)).toBe(false);
    }
  });

  it("is left to the browser while a card owns the screen", () => {
    // Take this one and a player with no pad cannot answer a card at all:
    // the cursor on a menu row IS focus, and pressing it is the browser's
    // own default.
    expect(browserKeepsKey(["screenshot"], true, false)).toBe(true);
    expect(browserKeepsKey(["camera"], true, false)).toBe(true);
  });

  it("is left to the browser when it arrived as a chord", () => {
    // ⌘R reloads and CTRL+C copies. The game acts on them either way — a key
    // is a key — but a page that PREVENTS them breaks the browser under the
    // player's hands.
    expect(browserKeepsKey(["reset"], false, true)).toBe(true);
    expect(browserKeepsKey(["camera"], false, true)).toBe(true);
    // ALT is the game's own modifier, not a chord: holding it takes the HUD
    // off, and ALT+ENTER is the documented way to a picture with no chrome in
    // it. It arrives here as an ordinary press and is spent as one.
    expect(browserKeepsKey(["screenshot"], false, false)).toBe(false);
  });

  it("never leaves the page free to scroll under the car", () => {
    // The wheel and the pedals are the exception to the exception: arrows and
    // space scroll, and a shell that jumps is a shell that jumps whether or
    // not there is a card over it.
    for (const action of ["left", "right", "throttle", "brake", "handbrake"] as const) {
      expect(browserKeepsKey([action], true, false)).toBe(false);
      expect(browserKeepsKey([action], false, false)).toBe(false);
      expect(browserKeepsKey([action], false, true)).toBe(false);
    }
    // A key bound to two actions is taken if EITHER of them scrolls — the
    // defaults ship SPACE on the handbrake and the arrows on the pedals, and
    // a second action on one of those must not hand the page back.
    expect(browserKeepsKey(["camera", "throttle"], true, false)).toBe(false);
  });
});
