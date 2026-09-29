// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SCREENSHOTS — the parts of taking a picture that are this game's own. The
// roll, the stamp, the picture's size and name and the HUD layer are the
// framework's (`@niclaslindstedt/oss-game-framework/shots`), held by its own
// suite; what is left here is the developer picture's caption, which only
// this game draws, and the switches the settings blob keeps.

import { describe, expect, it } from "vitest";

import { NOTE_MIN, noteFont, notesFit, notesLayout } from "../pwa/src/game/shot-notes.ts";
import { DEFAULT_SETTINGS, loadSettings } from "../pwa/src/game/settings.ts";

describe("the developer picture's notes", () => {
  it("leaves the middle of the frame alone", () => {
    // The caption is context; the thing being reported is the picture. Half
    // the width would make it the other way round.
    for (const [width, height] of [
      [1280, 720],
      [1920, 1080],
      [3840, 2160],
      [844, 390],
    ]) {
      expect(notesLayout(width, height).width).toBeLessThan(width / 2);
    }
  });

  it("keeps a row legible on a small picture and modest on a huge one", () => {
    expect(notesLayout(844, 390).font).toBeGreaterThanOrEqual(11);
    // A 4K frame captioned in headlines is a caption nobody asked for.
    expect(notesLayout(3840, 2160).font).toBeLessThanOrEqual(24);
  });

  it("is measured off the SHORT side, so a wide window does not enlarge it", () => {
    expect(notesLayout(3840, 1080).font).toBe(notesLayout(1920, 1080).font);
  });

  it("keeps a key column the value can be read beside", () => {
    for (const [width, height] of [
      [1280, 720],
      [3840, 2160],
    ]) {
      const layout = notesLayout(width, height);
      // Whatever is left over after the key column and the panel's own
      // inset is where the values wrap, and a column narrower than the keys
      // is a caption that wraps every row.
      expect(layout.width - layout.inset * 2 - layout.key).toBeGreaterThan(layout.key);
      expect(layout.line).toBeGreaterThan(layout.font);
    }
  });

  it("stands aside on a picture too small to caption", () => {
    expect(notesFit(1280, 720)).toBe(true);
    expect(notesFit(240, 135)).toBe(false);
  });

  // The whole panel follows the row's own size, which is what lets a caption
  // be stepped down until four boxes fit a 720p frame without any part of it
  // coming apart at a size nobody tested.
  it("takes a row size down with every proportion in step", () => {
    const natural = notesLayout(1280, 720);
    const smaller = notesLayout(1280, 720, natural.font - 2);
    expect(smaller.font).toBe(natural.font - 2);
    for (const key of ["line", "pad", "inset", "key", "chip"] as const) {
      expect(smaller[key]).toBeLessThan(natural[key]);
    }
    expect(smaller.line).toBeGreaterThan(smaller.font);
    expect(smaller.width - smaller.inset * 2 - smaller.key).toBeGreaterThan(smaller.key);
  });

  it("has a floor a caption is never stepped below", () => {
    expect(noteFont(1280, 720)).toBeGreaterThan(NOTE_MIN);
    expect(noteFont(240, 135)).toBe(NOTE_MIN);
  });
});

describe("the setting", () => {
  it("ships on, and on ENTER", () => {
    expect(DEFAULT_SETTINGS.screenshots).toBe(true);
    expect(DEFAULT_SETTINGS.keys.screenshot).toEqual(["Enter"]);
  });

  it("defaults on for a player whose stored options predate it", () => {
    expect(loadSettings().screenshots).toBe(true);
  });

  // The clipboard is the shortest road from the shutter to somebody else, so
  // it ships on — and it is its OWN switch: a player who wants the pictures
  // and not their clipboard touched must be able to have exactly that.
  it("copies to the clipboard by default, and separately", () => {
    expect(DEFAULT_SETTINGS.copyShots).toBe(true);
    expect(loadSettings().copyShots).toBe(true);
  });
});
