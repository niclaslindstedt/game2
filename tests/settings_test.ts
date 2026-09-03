// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player's options as the menu offers them: two HUD switches spread
// over the whole panel, six video levers on three independent picture rows,
// and a stored blob from an older build landing on something the page can
// still show.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  DEFAULT_VIDEO,
  DETAIL_PRESETS,
  freshSettings,
  detailOf,
  hudShow,
  loadSettings,
  type HudShow,
} from "../pwa/src/game/settings.ts";

/** A localStorage that lives for one test — the stub the gamepad and score
 * suites keep, for the same reason: settings.ts reads the player's own
 * file, and Node has no such thing. */
function stubStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const KEY = "scandi-flick-options";

function stored(blob: unknown): void {
  stubStorage();
  localStorage.setItem(KEY, JSON.stringify(blob));
}

describe("the HUD's two switches", () => {
  it("spread over every instrument", () => {
    const on = hudShow({ on: true, mirror: true });
    for (const flag of Object.values(on)) expect(flag).toBe(true);
  });

  it("take the whole panel down together", () => {
    const off = hudShow({ on: false, mirror: false });
    for (const flag of Object.values(off)) expect(flag).toBe(false);
  });

  // The glass is the CAR's, not the panel's: a driver who wants a clean
  // frame and the road behind them gets exactly that.
  it("keep the mirror apart from the panel", () => {
    const clean = hudShow({ on: false, mirror: true });
    expect(clean.mirror).toBe(true);
    expect(clean.minimap).toBe(false);
    expect(clean.cluster).toBe(false);
    const noGlass = hudShow({ on: true, mirror: false });
    expect(noGlass.mirror).toBe(false);
    expect(noGlass.timer).toBe(true);
  });

  it("gate everything the HUD draws that a clean frame must lose", () => {
    const keys: (keyof HudShow)[] = [
      "minimap",
      "timer",
      "cluster",
      "stage",
      "position",
      "nameTags",
    ];
    const off = hudShow({ on: false, mirror: true });
    for (const key of keys) expect(off[key]).toBe(false);
  });
});

describe("the three picture rows", () => {
  it("name every set of levers DETAIL defines", () => {
    for (const id of ["low", "medium", "high"] as const) {
      expect(detailOf(DETAIL_PRESETS[id])).toBe(id);
    }
  });

  it("ship the design point on all three rows", () => {
    expect(DEFAULT_SETTINGS.video).toEqual(DEFAULT_VIDEO);
    expect(detailOf(DEFAULT_SETTINGS.video)).toBe("medium");
    expect(DEFAULT_SETTINGS.video.resolution).toBe("medium");
    expect(DEFAULT_SETTINGS.video.drawDistance).toBe("normal");
  });

  // The whole point of the split: RESOLUTION and DISTANCE are separate
  // costs, so neither one may decide what DETAIL reads as.
  it("read DETAIL off its own four levers and nothing else", () => {
    const sharp = { ...DEFAULT_VIDEO, resolution: "high", drawDistance: "near" } as const;
    expect(detailOf(sharp)).toBe("medium");
    expect(detailOf({ ...DETAIL_PRESETS.low, resolution: "high" })).toBe("low");
  });

  // A blob standing between two stops lands on the one it most resembles,
  // and a tie goes to the cheaper picture rather than the dearer one.
  it("land a set of levers off the ladder on the picture it most resembles", () => {
    expect(detailOf({ ...DETAIL_PRESETS.low, effects: "full" })).toBe("low");
    expect(detailOf({ ...DETAIL_PRESETS.high, effects: "off" })).toBe("high");
    // MEDIUM and HIGH each agree with three of these four; the tie goes to
    // the picture that costs less to draw.
    expect(detailOf({ ...DETAIL_PRESETS.high, ground: "normal" })).toBe("medium");
    expect(detailOf({})).toBe("medium");
  });

  it("snap a stored blob onto a DETAIL stop, so the page can always show it", () => {
    stored({ video: { ...DEFAULT_VIDEO, ...DETAIL_PRESETS.high, flora: "sparse" } });
    expect(loadSettings().video).toEqual({ ...DEFAULT_VIDEO, ...DETAIL_PRESETS.high });
    localStorage.clear();
  });

  // The regression this whole change exists to prevent: the loader used to
  // put the six levers back on ONE preset, so a sharp-but-cheap picture was
  // a picture the player could set and never load again.
  it("keep a mixed picture across a save and a load", () => {
    const mixed = { ...DETAIL_PRESETS.low, resolution: "high", drawDistance: "near" } as const;
    stored({ video: mixed });
    expect(loadSettings().video).toEqual(mixed);
    localStorage.clear();
  });

  // A blob from the single-QUALITY build has all six on one preset, so every
  // row reads back the name the player chose.
  it("read a blob from the one-knob build as that knob on all three rows", () => {
    stored({
      video: {
        resolution: "low",
        drawDistance: "near",
        effects: "low",
        interior: "off",
        flora: "sparse",
        ground: "plain",
      },
    });
    const video = loadSettings().video;
    expect(video.resolution).toBe("low");
    expect(video.drawDistance).toBe("near");
    expect(detailOf(video)).toBe("low");
    localStorage.clear();
  });

  it("drop a lever that is off its ladder back onto the default", () => {
    stored({ video: { resolution: "ultra", drawDistance: "miles" } });
    const video = loadSettings().video;
    expect(video.resolution).toBe(DEFAULT_VIDEO.resolution);
    expect(video.drawDistance).toBe(DEFAULT_VIDEO.drawDistance);
    localStorage.clear();
  });
});

describe("a blob from the eight-switch HUD", () => {
  it("keeps the mirror's choice and nothing else", () => {
    stored({ hud: { minimap: false, mirror: false, timer: false } });
    const loaded = loadSettings();
    expect(loaded.hud).toEqual({ on: true, mirror: false });
    localStorage.clear();
  });

  it("defaults the panel on for a blob that never had the switch", () => {
    stored({ audio: { music: 0.2 } });
    const loaded = loadSettings();
    expect(loaded.hud.on).toBe(true);
    expect(loaded.audio.music).toBe(0.2);
    localStorage.clear();
  });
});

describe("the defaults", () => {
  it("come out fresh — RESTORE DEFAULTS cannot rewrite them", () => {
    const mine = freshSettings();
    mine.hud.on = false;
    mine.keys.camera = ["KeyZ"];
    mine.video.resolution = "low";
    expect(DEFAULT_SETTINGS.hud.on).toBe(true);
    expect(DEFAULT_SETTINGS.keys.camera).toEqual(["KeyC", "KeyV"]);
    expect(DEFAULT_SETTINGS.video.resolution).toBe("medium");
  });
});
