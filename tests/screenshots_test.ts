// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SCREENSHOTS — the parts of taking a picture that are arithmetic rather
// than graphics, and can therefore be held to a promise with no canvas
// anywhere near them. Both modules under test are DOM-free on purpose, and
// this file is what that buys.
//
// Three things are load-bearing. The ROLL must stay capped and newest
// first, because a roll that quietly stopped capping is an unbounded pile
// of megabytes in somebody's browser profile, and nothing in a game ever
// prompts a player to prune one. The STAMP must stay a signature at every
// size a window can be, because it is drawn into the corner of a picture
// that leaves the game and nobody sees it before it does. And the PICTURE
// must never be blown UP: a screenshot is worth exactly what the renderer
// drew, and not one interpolated pixel more.

import { describe, expect, it } from "vitest";

import { shotFileName, shotSize, stampFits, stampLayout } from "../pwa/src/game/shot-plan.ts";
import { shotId, shotMeta, withShot, withStored, type Shot } from "../pwa/src/lib/shot-roll.ts";
import { DEFAULT_SETTINGS, loadSettings } from "../pwa/src/game/settings.ts";

/** A picture. Node has Blob, and the roll never looks inside one — it is
 * pixels to everything but the browser that encoded them. */
const shotAt = (takenAt: number, label = "taiga"): Shot => ({
  id: shotId(takenAt, takenAt),
  takenAt,
  width: 1920,
  height: 1080,
  label,
  blob: new Blob(["png"], { type: "image/png" }),
});

describe("the roll", () => {
  it("puts the newest picture at the head", () => {
    const roll = withShot(withShot([], shotAt(1000, "first"), 5), shotAt(2000, "second"), 5);
    expect(roll.map((entry) => entry.label)).toEqual(["second", "first"]);
  });

  it("drops the oldest past the cap", () => {
    let roll: Shot[] = [];
    for (let n = 1; n <= 5; n++) roll = withShot(roll, shotAt(n * 1000, `shot ${n}`), 3);
    expect(roll.map((entry) => entry.label)).toEqual(["shot 5", "shot 4", "shot 3"]);
  });

  it("keeps at least the picture just taken, whatever the cap says", () => {
    expect(withShot([], shotAt(1000), 0)).toHaveLength(1);
  });

  it("gives ids that sort by age even inside one millisecond", () => {
    expect(shotId(1000, 1) < shotId(1000, 2)).toBe(true);
    expect(shotId(1000, 9) < shotId(2000, 1)).toBe(true);
  });

  it("puts a read off disk under what is already in hand, newest first", () => {
    const captured = shotAt(5000, "just taken");
    const joined = withStored([captured], [shotAt(1000, "old"), shotAt(3000, "newer")]);
    expect(joined.map((entry) => entry.label)).toEqual(["just taken", "newer", "old"]);
  });

  it("never lets a stored copy displace the one already in memory", () => {
    const held = shotAt(1000, "in hand");
    const stale = { ...shotAt(1000, "on disk"), id: held.id };
    expect(withStored([held], [stale]).map((entry) => entry.label)).toEqual(["in hand"]);
  });

  it("leaves the pixels out of a listing", () => {
    expect(shotMeta([shotAt(1000)])[0]).not.toHaveProperty("blob");
  });
});

describe("the file name", () => {
  it("is sortable, lowercase and has no spaces in it", () => {
    const name = shotFileName("Flick", "Kaamos Ridge", Date.UTC(2026, 1, 3, 14, 5, 9));
    expect(name).toBe("flick-kaamos-ridge-2026-02-03-14-05-09.png");
  });

  it("drops an apostrophe rather than breaking a word on it", () => {
    expect(shotFileName("Flick", "Devil's Elbow", 0)).toContain("devils-elbow");
  });

  it("still names a picture taken somewhere with no name", () => {
    expect(shotFileName("Flick", "", 0)).toMatch(/^flick-shot-/);
  });
});

describe("the picture's size", () => {
  it("keeps a frame under the cap exactly as it was drawn", () => {
    expect(shotSize(1688, 780)).toEqual({ width: 1688, height: 780 });
  });

  it("never blows a small frame up", () => {
    expect(shotSize(640, 360)).toEqual({ width: 640, height: 360 });
  });

  it("brings a huge frame down without changing its shape", () => {
    const size = shotSize(7680, 4320);
    expect(Math.max(size.width, size.height)).toBe(2560);
    expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
  });

  it("measures the cap against the LONG side, whichever way up the frame is", () => {
    const upright = shotSize(4320, 7680);
    const sideways = shotSize(7680, 4320);
    expect(upright).toEqual({ width: sideways.height, height: sideways.width });
  });
});

describe("the stamp", () => {
  it("stays a signature rather than a logo on a huge picture", () => {
    // A twentieth of the short side is what "in the corner" has to mean.
    expect(stampLayout(3840, 2160).mark / 2160).toBeLessThan(0.05);
  });

  it("stays legible on a small one", () => {
    expect(stampLayout(640, 360).mark).toBeGreaterThanOrEqual(26);
  });

  it("is measured off the SHORT side, so a wide window does not enlarge it", () => {
    expect(stampLayout(3840, 1080).mark).toBe(stampLayout(1920, 1080).mark);
  });

  it("keeps its proportions at every size", () => {
    for (const [width, height] of [
      [640, 360],
      [1920, 1080],
      [1080, 1920],
      [3840, 2160],
    ]) {
      const layout = stampLayout(width, height);
      expect(layout.font).toBeLessThan(layout.mark);
      expect(layout.gap).toBeLessThan(layout.mark);
      expect(layout.pad).toBeGreaterThan(0);
      // The badge and its margins have to leave the picture room to still
      // be a picture, on the short side as well as the long one.
      expect(layout.mark * 2 + layout.pad * 2).toBeLessThan(Math.min(width, height));
    }
  });

  it("stands aside on a picture too small to sign", () => {
    expect(stampFits(1920, 1080)).toBe(true);
    expect(stampFits(120, 68)).toBe(false);
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
});
