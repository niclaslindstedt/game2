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

import {
  HUD_LAYER_ROOT,
  NOTE_MIN,
  hudLayerSvg,
  noteFont,
  notesFit,
  notesLayout,
  shotFileName,
  shotSize,
  stampFits,
  stampLayout,
  stampLift,
  type HudCover,
} from "../pwa/src/game/shot-plan.ts";
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

// The HUD goes into the picture, and it goes in as the browser's own layout
// of the game's own stylesheet rather than as a second HUD drawn in
// Canvas2D. That makes the document assembled here the whole contract: an
// SVG that does not parse, or one whose colours and pinning are lost on the
// way in, is a screenshot with the instruments missing or piled in a corner
// — and none of it is visible from a test that only reads pixels.
describe("the HUD layer", () => {
  const layer = (over: Partial<Parameters<typeof hudLayerSvg>[0]> = {}): string =>
    hudLayerSvg({
      markup: '<div xmlns="http://www.w3.org/1999/xhtml" class="hud">120</div>',
      css: ":root { --hud-ink: #fff; }\n.hud { color: var(--hud-ink); }",
      width: 1280,
      height: 720,
      inherited: "font-family:Arial Narrow;font-size:16px",
      ...over,
    });

  it("is one SVG the size of the window, so the picture is only ever scaled", () => {
    const svg = layer();
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('width="1280" height="720"');
    expect(svg).toContain('viewBox="0 0 1280 720"');
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  // Every instrument on the HUD is pinned with `position: absolute` against
  // the app-root around it. Without a positioned box of the window's own
  // size standing in for it, the whole panel collapses into the corner.
  it("stands the instruments in a box the shape of the app-root", () => {
    expect(layer()).toContain("position:relative;width:1280px;height:720px");
  });

  // The HUD's ink, its shadow and its steer blue are all declared on
  // `:root`, and inside an SVG the root element is the `<svg>` — so a sheet
  // taken in verbatim would style nothing and the HUD would come out black.
  it("points every :root rule at the wrapper the HUD actually hangs on", () => {
    const svg = layer();
    expect(svg).toContain(`.${HUD_LAYER_ROOT} { --hud-ink: #fff; }`);
    expect(svg).not.toContain(":root");
  });

  // The font is set on `body` (styles.css), which is not coming with the
  // HUD — a layer that lost it would come back in the browser's default
  // serif at the browser's default size.
  it("carries what the HUD was inheriting from above", () => {
    expect(layer()).toContain("font-family:Arial Narrow;font-size:16px");
  });

  // A `<foreignObject>` is parsed as XML, so the stylesheet cannot be
  // escaped (`&` is a nesting selector) and cannot be raw (`>` is a
  // combinator). CDATA is the only door, and its own terminator is the one
  // sequence it cannot carry.
  it("takes a stylesheet in verbatim, combinators and all", () => {
    const svg = layer({ css: ".a > .b { color: red } .c { &:hover { color: blue } }" });
    expect(svg).toContain("<![CDATA[.a > .b { color: red }");
    expect(svg).toContain("&:hover");
  });

  it("splits a CDATA close out of a stylesheet rather than ending the section on it", () => {
    const svg = layer({ css: '.a[x="]]>"] { color: red }' });
    expect(svg).toContain("]]]]><![CDATA[>");
    expect(svg.match(/<!\[CDATA\[/g)).toHaveLength(2);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("never emits a picture with no area to it", () => {
    expect(layer({ width: 0, height: -4 })).toContain('width="1" height="1"');
  });
});

// With the HUD in the picture the bottom-right corner is no longer reliably
// empty: a phone held upright runs the whole instrument cluster along the
// foot, and a signature dropped on it takes the speedo with it.
describe("the stamp, over instruments", () => {
  const cols = 32;
  const rows = 64;
  /** A cover with the bottom `band` rows filled right across. */
  const along = (band: number): HudCover => {
    const on = new Uint8Array(cols * rows);
    for (let row = rows - band; row < rows; row++) on.fill(1, row * cols, row * cols + cols);
    return { cols, rows, on };
  };
  const badge = { left: 900, right: 1260, top: 660, bottom: 700 };

  it("stays where it was when the corner is empty", () => {
    expect(stampLift(along(0), badge, 1280, 720)).toBe(0);
    expect(stampLift(null, badge, 1280, 720)).toBe(0);
  });

  it("lifts clear of a cluster along the foot", () => {
    // Four rows of a 64-row map over a 720-tall picture is 45 px of
    // instruments; the badge has to end up above all of them.
    const lift = stampLift(along(4), badge, 1280, 720);
    expect(lift).toBeGreaterThanOrEqual(45);
    expect(badge.bottom - lift).toBeLessThanOrEqual(720 - 45);
  });

  // The cluster is over on the LEFT on a window held sideways, and a badge
  // that climbed anyway would be a signature hovering in the middle of a
  // frame for no reason at all.
  it("ignores instruments outside its own column", () => {
    const on = new Uint8Array(cols * rows);
    for (let row = rows - 6; row < rows; row++) on.fill(1, row * cols, row * cols + 8);
    expect(stampLift({ cols, rows, on }, badge, 1280, 720)).toBe(0);
  });

  // The results card covers the frame corner to corner. There is nowhere
  // better to be, and a signature floating in the middle of the picture is
  // worse than one on the card.
  it("stays put when the whole picture is covered", () => {
    expect(stampLift(along(rows), badge, 1280, 720)).toBe(0);
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
