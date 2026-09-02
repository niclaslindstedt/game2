// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player's options as the menu offers them: two HUD switches spread
// over the whole panel, one picture preset standing in for six video levers,
// and a stored blob from an older build landing on something the page can
// still show.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  QUALITY_PRESETS,
  freshSettings,
  hudShow,
  loadSettings,
  qualityOf,
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

describe("the picture presets", () => {
  it("name every set of levers they define", () => {
    for (const id of ["low", "medium", "high"] as const) {
      expect(qualityOf(QUALITY_PRESETS[id])).toBe(id);
    }
  });

  it("ship MEDIUM, which is the design point", () => {
    expect(DEFAULT_SETTINGS.video).toEqual(QUALITY_PRESETS.medium);
  });

  // A blob written when the six were six rows can stand anywhere; what it
  // most feels like is decided by the lever that decides most of the frame.
  it("land a custom set of levers on the preset its resolution belongs to", () => {
    expect(qualityOf({ ...QUALITY_PRESETS.medium, resolution: "high" })).toBe("high");
    expect(qualityOf({ resolution: "low" })).toBe("low");
    expect(qualityOf({})).toBe("medium");
  });

  it("snap a stored blob onto a preset, so the page can always show it", () => {
    stored({ video: { ...QUALITY_PRESETS.high, flora: "sparse" } });
    expect(loadSettings().video).toEqual(QUALITY_PRESETS.high);
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
