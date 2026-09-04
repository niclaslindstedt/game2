// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player's options as the menu offers them: two HUD switches spread
// over the whole panel, seven video levers on three independent picture
// rows, and a stored blob from an older build landing on something the page
// can still show.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  DEFAULT_VIDEO,
  DETAIL_PRESETS,
  DRAW_DISTANCE_SCALE,
  DUST_RAISED,
  fogRangeFor,
  freshSettings,
  detailOf,
  hudShow,
  loadSettings,
  MIN_FOG_FAR,
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
    // Two of HIGH's three own levers given back to MEDIUM, which is what a
    // player stepping down the row and a half-migrated blob both look like.
    expect(detailOf({ ...DETAIL_PRESETS.high, ground: "normal", dust: "player" })).toBe("medium");
    // A blob carrying one lever MEDIUM and HIGH agree on is a genuine tie,
    // and it goes to the picture that costs less to draw.
    expect(detailOf({ effects: "full" })).toBe("medium");
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

// The DUST row is the one lever on DETAIL that answers a question about
// WHO rather than about how much, so what each stop is worth is worth
// asserting on its own: the renderer asks it twice a frame — once for the
// car the frame is drawn from, once for the field — and the two answers
// have to walk the ladder together.
describe("who raises dust at each DETAIL stop", () => {
  it("takes the ground off every car on LOW", () => {
    expect(DUST_RAISED[DETAIL_PRESETS.low.dust]).toEqual({ player: false, field: false });
  });

  it("leaves it to the car being driven on MEDIUM", () => {
    expect(DUST_RAISED[DETAIL_PRESETS.medium.dust]).toEqual({ player: true, field: false });
  });

  it("gives the whole entry list a cloud on HIGH", () => {
    expect(DUST_RAISED[DETAIL_PRESETS.high.dust]).toEqual({ player: true, field: true });
  });

  // A stop that took the player's dust away and left the field's would read
  // as a bug in the car rather than as a setting, so no stop may do it.
  it("never dresses a rival in dust the driven car is not raising", () => {
    for (const audience of Object.values(DUST_RAISED)) {
      expect(audience.field && !audience.player).toBe(false);
    }
  });

  // ...and the ladder only ever goes one way: cheaper stop, no more dust.
  it("walks the ladder monotonically", () => {
    const walk = (["low", "medium", "high"] as const).map(
      (id) => DUST_RAISED[DETAIL_PRESETS[id].dust],
    );
    for (let i = 1; i < walk.length; i++) {
      const under = walk[i - 1]!;
      const over = walk[i]!;
      expect(over.player || !under.player).toBe(true);
      expect(over.field || !under.field).toBe(true);
    }
  });
});

// The DISTANCE row, which is the only picture lever that decides how much
// stage is SUBMITTED — the fog's far distance is the radius the world is
// culled at, so what these numbers are worth is frames rather than looks.
describe("how far the DISTANCE row lets the player see", () => {
  it("walks one way", () => {
    expect(DRAW_DISTANCE_SCALE.near).toBeLessThan(DRAW_DISTANCE_SCALE.normal);
    expect(DRAW_DISTANCE_SCALE.normal).toBeLessThan(DRAW_DISTANCE_SCALE.far);
    expect(DRAW_DISTANCE_SCALE.normal).toBe(1);
  });

  // The regression this number was moved for: at two-thirds, NEAR looked
  // like the design point and metered like it too, so a player reaching for
  // it because the game was stuttering got nothing for the trade. It has to
  // be a stop that is plainly nearer, not a shade under.
  it("makes NEAR a real cut rather than a shade off the design point", () => {
    expect(DRAW_DISTANCE_SCALE.near).toBeLessThanOrEqual(0.5);
  });

  // A clear day is where the row is supposed to bite, and it does: the fog
  // lands where the scale puts it, nowhere near the floor.
  it("scales a long preset by the stop and nothing else", () => {
    const day = fogRangeFor(160, 520, DRAW_DISTANCE_SCALE.near);
    expect(day.far).toBeCloseTo(208);
    expect(day.near).toBeCloseTo(64);
    // ...and the fog keeps its SHAPE: near and far move by the same ratio,
    // or the setting thickens the air instead of shortening the view.
    expect(day.near / day.far).toBeCloseTo(160 / 520);
  });

  // ...and the compound case the floor exists for: the shortest stop landing
  // on weather that has already taken most of the fog (sky.ts hands a preset
  // that is pre-shortened). Without it a night downpour on NEAR is a wall.
  it("never lets the stop pull the fog inside the floor", () => {
    const wet = fogRangeFor(80 * 0.5, 380 * 0.5, DRAW_DISTANCE_SCALE.near);
    expect(wet.far).toBe(MIN_FOG_FAR);
    expect(380 * 0.5 * DRAW_DISTANCE_SCALE.near).toBeLessThan(MIN_FOG_FAR);
  });

  // The floor is on what the SETTING may take, never on what the WEATHER
  // may: a storm is as short as a storm is, and the clamp may only ever push
  // the fog back out, never pull it in.
  it("leaves a preset that is already shorter than the floor alone", () => {
    const storm = fogRangeFor(80 * 0.14, 380 * 0.16, 1);
    expect(storm.far).toBeCloseTo(380 * 0.16);
    for (const scale of Object.values(DRAW_DISTANCE_SCALE)) {
      expect(fogRangeFor(80, 380, scale).far).toBeGreaterThanOrEqual(Math.min(380, 380 * scale));
    }
  });

  // FAR is the one stop that may push past the preset, and it must not be
  // touched by the floor on its way.
  it("lets FAR open the picture up", () => {
    expect(fogRangeFor(160, 520, DRAW_DISTANCE_SCALE.far).far).toBeCloseTo(520 * 1.45);
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
