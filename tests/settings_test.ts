// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player's options as the menu offers them: two HUD switches spread
// over the whole panel, ten video levers on three independent picture rows,
// and a stored blob from an older build landing on something the page can
// still show.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  DEFAULT_VIDEO,
  DETAIL_PRESETS,
  GLASS_RAIN,
  GLASS_SEEN_THROUGH,
  DRAW_DISTANCE_SCALE,
  DUST_LAMP_CARS,
  DUST_RAISED,
  EXHAUST_SEEN,
  fogRangeFor,
  freshSettings,
  detailOf,
  hudShow,
  LAMP_BEAMS,
  loadSettings,
  MIN_FOG_FAR,
  SKY_LOOK,
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

describe("the HUD's three switches", () => {
  it("spread over every instrument", () => {
    const on = hudShow({ on: true, mirror: true, fps: true });
    for (const flag of Object.values(on)) expect(flag).toBe(true);
  });

  it("take the whole panel down together", () => {
    const off = hudShow({ on: false, mirror: false, fps: false });
    for (const flag of Object.values(off)) expect(flag).toBe(false);
  });

  // The glass is the CAR's, not the panel's: a driver who wants a clean
  // frame and the road behind them gets exactly that.
  it("keep the mirror apart from the panel", () => {
    const clean = hudShow({ on: false, mirror: true, fps: false });
    expect(clean.mirror).toBe(true);
    expect(clean.minimap).toBe(false);
    expect(clean.cluster).toBe(false);
    const noGlass = hudShow({ on: true, mirror: false, fps: false });
    expect(noGlass.mirror).toBe(false);
    expect(noGlass.timer).toBe(true);
  });

  // The frame rate is the other way round: it hangs off the stage label, so
  // it is panel furniture and a clean frame loses it with everything else.
  it("keep the frame rate inside the panel", () => {
    const asked = hudShow({ on: true, mirror: true, fps: true });
    expect(asked.fps).toBe(true);
    const clean = hudShow({ on: false, mirror: true, fps: true });
    expect(clean.fps).toBe(false);
    const unasked = hudShow({ on: true, mirror: true, fps: false });
    expect(unasked.fps).toBe(false);
  });

  it("leave the frame rate off until somebody asks for it", () => {
    expect(DEFAULT_SETTINGS.hud.fps).toBe(false);
    expect(hudShow(DEFAULT_SETTINGS.hud).fps).toBe(false);
  });

  it("gate everything the HUD draws that a clean frame must lose", () => {
    const keys: (keyof HudShow)[] = [
      "minimap",
      "timer",
      "cluster",
      "stage",
      "position",
      "nameTags",
      "fps",
    ];
    const off = hudShow({ on: false, mirror: true, fps: true });
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
    // Most of HIGH's own levers given back to MEDIUM, which is what a
    // player stepping down the row and a half-migrated blob both look like.
    expect(
      detailOf({
        ...DETAIL_PRESETS.high,
        ground: "normal",
        dust: "player",
        glass: "player",
        sky: "layered",
      }),
    ).toBe("medium");
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

  // ...which is also how a lever ADDED to the row reaches a player who has
  // been driving since before it existed: their blob has no opinion about
  // the new one, so the stop the rest of it lands on brings its own answer
  // rather than leaving the renderer reading an undefined knob.
  it("give a blob from before a lever existed that lever's answer", () => {
    const before = { ...DEFAULT_VIDEO, ...DETAIL_PRESETS.high } as Record<string, unknown>;
    delete before.exhaust;
    stored({ video: before });
    expect(loadSettings().video.exhaust).toBe(DETAIL_PRESETS.high.exhaust);
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

// The EXHAUST row asks the same WHO question the dust does, of a different
// substance, and the two are read at the same two call sites — so what each
// stop is worth is asserted the same way. The rain is the reason they are
// not one row and cannot be folded into one: it settles the towed cloud and
// leaves the pipes smoking, so their answers are free to differ.
describe("whose pipe smokes at each DETAIL stop", () => {
  it("takes the exhaust off every car on LOW", () => {
    expect(EXHAUST_SEEN[DETAIL_PRESETS.low.exhaust]).toEqual({ player: false, field: false });
  });

  it("leaves it to the car being driven on MEDIUM", () => {
    expect(EXHAUST_SEEN[DETAIL_PRESETS.medium.exhaust]).toEqual({ player: true, field: false });
  });

  it("gives the whole entry list a pipe on HIGH", () => {
    expect(EXHAUST_SEEN[DETAIL_PRESETS.high.exhaust]).toEqual({ player: true, field: true });
  });

  // A rival steaming behind a car whose own pipe is off reads as a bug in
  // the car, exactly as it does with the dust, so no stop may do it.
  it("never smokes a rival the driven car is not", () => {
    for (const audience of Object.values(EXHAUST_SEEN)) {
      expect(audience.field && !audience.player).toBe(false);
    }
  });

  // ...and the ladder only ever goes one way: cheaper stop, no more smoke.
  it("walks the ladder monotonically", () => {
    const walk = (["low", "medium", "high"] as const).map(
      (id) => EXHAUST_SEEN[DETAIL_PRESETS[id].exhaust],
    );
    for (let i = 1; i < walk.length; i++) {
      const under = walk[i - 1]!;
      const over = walk[i]!;
      expect(over.player || !under.player).toBe(true);
      expect(over.field || !under.field).toBe(true);
    }
  });
});

describe("the rain on the driver's glass at each DETAIL stop", () => {
  // The dearest pass in the frame — a copy of the whole picture and five
  // layers of beading solved per pixel — so the stop that exists for a
  // phone that stutters must never run it, whatever the glass is doing.
  it("is not drawn on LOW", () => {
    expect(GLASS_RAIN[DETAIL_PRESETS.low.effects]).toBe(false);
  });

  it("is drawn on the design point and above", () => {
    expect(GLASS_RAIN[DETAIL_PRESETS.medium.effects]).toBe(true);
    expect(GLASS_RAIN[DETAIL_PRESETS.high.effects]).toBe(true);
  });

  // The effects budget is one ladder: turning it down alone, on any
  // preset, takes the pass with it.
  it("goes with the effects budget, not only the preset", () => {
    expect(GLASS_RAIN.off).toBe(false);
    expect(GLASS_RAIN.low).toBe(false);
    expect(GLASS_RAIN.full).toBe(true);
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
    expect(loaded.hud).toEqual({ on: true, mirror: false, fps: false });
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

// The GLASS row asks the WHO question of the cabins: which cars get the
// INTERIOR row's cabin behind their windows, and the wiper arms and the film
// that go with it. A rival is read at range, where a furnished cabin is a
// second body's worth of triangles and three more draw calls for a dark
// shape, so it is the field's share that the cheaper stops give up.
describe("whose windows can be seen through at each DETAIL stop", () => {
  it("builds every car solid on LOW", () => {
    // The row keeps the cabins to the driven car, and the INTERIOR row then
    // takes even that one away: nothing on the road has glass or wipers.
    expect(GLASS_SEEN_THROUGH[DETAIL_PRESETS.low.glass].field).toBe(false);
    expect(DETAIL_PRESETS.low.interior).toBe("off");
  });

  it("furnishes only the car being driven on MEDIUM", () => {
    expect(GLASS_SEEN_THROUGH[DETAIL_PRESETS.medium.glass]).toEqual({
      player: true,
      field: false,
    });
    expect(DETAIL_PRESETS.medium.interior).not.toBe("off");
  });

  it("furnishes the whole entry list on HIGH", () => {
    expect(GLASS_SEEN_THROUGH[DETAIL_PRESETS.high.glass]).toEqual({ player: true, field: true });
  });

  // A grid of glass cabins around a solid car would read as a bug in the
  // car rather than as a setting, so no stop may do it.
  it("never furnishes a rival the driven car is not", () => {
    for (const audience of Object.values(GLASS_SEEN_THROUGH)) {
      expect(audience.field && !audience.player).toBe(false);
    }
  });

  it("walks the ladder monotonically", () => {
    const walk = (["low", "medium", "high"] as const).map(
      (id) => GLASS_SEEN_THROUGH[DETAIL_PRESETS[id].glass],
    );
    for (let i = 1; i < walk.length; i++) {
      const under = walk[i - 1]!;
      const over = walk[i]!;
      expect(over.player || !under.player).toBe(true);
      expect(over.field || !under.field).toBe(true);
    }
  });
});

// The LIGHTING row is the one lever on DETAIL that is paid for on every
// pixel rather than per thing drawn: a spotlight is evaluated by every lit
// surface in the frame whether the beam reaches it or not, and the sun's
// shadow is a pass plus a lookup on all of the ground. So what each stop
// throws is worth holding: the ladder has to come down from the tail lamp
// first, and never leave a night stage with no light on the road at all.
describe("what the car's lamps throw at each DETAIL stop", () => {
  it("throws the car's whole complement on HIGH, and lights the field", () => {
    expect(LAMP_BEAMS[DETAIL_PRESETS.high.lighting]).toEqual({
      head: 4,
      tail: 2,
      brakes: true,
      field: true,
    });
  });

  it("throws one pair per end on MEDIUM, and nobody else's lamps", () => {
    expect(LAMP_BEAMS[DETAIL_PRESETS.medium.lighting]).toEqual({
      head: 2,
      tail: 2,
      brakes: true,
      field: false,
    });
  });

  it("keeps one headlamp beam and no tail beam at all on LOW", () => {
    expect(LAMP_BEAMS[DETAIL_PRESETS.low.lighting]).toEqual({
      head: 1,
      tail: 0,
      brakes: false,
      field: false,
    });
  });

  // A tail lamp is a marker; the headlamp is what a night stage is driven
  // by. No stop may keep the marker and lose the road.
  it("never throws a tail beam without a headlamp beam, and never darkens the road", () => {
    for (const beams of Object.values(LAMP_BEAMS)) {
      expect(beams.head).toBeGreaterThanOrEqual(1);
      expect(beams.tail).toBeLessThanOrEqual(beams.head);
    }
  });

  // A brake light IS the tail lamps burning harder, so a stop with no tail
  // beam has nothing to burn — and one that lights the tail has to let the
  // pedal say so, or the car ahead never reads as stopping.
  it("lights the brakes exactly where there is a tail lamp to light", () => {
    for (const beams of Object.values(LAMP_BEAMS)) {
      expect(beams.brakes).toBe(beams.tail > 0);
    }
  });

  it("throws every head beam in PAIRS above the single-beam floor", () => {
    for (const beams of Object.values(LAMP_BEAMS)) {
      if (beams.head > 1) expect(beams.head % 2).toBe(0);
      expect(beams.tail % 2).toBe(0);
    }
  });

  it("walks both ladders monotonically, cheapest first", () => {
    const stops = (["low", "medium", "high"] as const).map((id) => DETAIL_PRESETS[id].lighting);
    for (let i = 1; i < stops.length; i++) {
      const cheaper = LAMP_BEAMS[stops[i - 1]];
      const richer = LAMP_BEAMS[stops[i]];
      expect(richer.head + richer.tail).toBeGreaterThan(cheaper.head + cheaper.tail);
      expect(DUST_LAMP_CARS[stops[i]]).toBeGreaterThanOrEqual(DUST_LAMP_CARS[stops[i - 1]]);
    }
    // The player's own lamps are always on the dust, whatever the row.
    expect(DUST_LAMP_CARS[stops[0]]).toBeGreaterThanOrEqual(1);
  });

  // The rivals' lamps on the dust register are the only light anything but
  // the driven car casts, so the two have to say the same thing: a stop that
  // does not light the field has room for the player alone.
  it("agrees with the dust register about whether the field lights anything", () => {
    for (const stop of Object.keys(LAMP_BEAMS) as (keyof typeof LAMP_BEAMS)[]) {
      if (LAMP_BEAMS[stop].field) expect(DUST_LAMP_CARS[stop]).toBeGreaterThan(1);
      else expect(DUST_LAMP_CARS[stop]).toBe(1);
    }
  });
});

// The SKY row is paid per sky pixel — every octave of cloud noise over a
// third of the frame — so which stop draws which sky is worth holding: the
// design point gets the layered sky a stop short of everything, the floor
// keeps the arcade one, and the ladder only ever adds.
describe("what sky each DETAIL stop draws", () => {
  it("keeps the arcade sky on LOW and draws the shader on the two above", () => {
    expect(SKY_LOOK[DETAIL_PRESETS.low.sky].shader).toBe(false);
    expect(SKY_LOOK[DETAIL_PRESETS.medium.sky].shader).toBe(true);
    expect(SKY_LOOK[DETAIL_PRESETS.high.sky].shader).toBe(true);
  });

  it("saves the cloud shadows and the sunlit edges for HIGH", () => {
    expect(SKY_LOOK[DETAIL_PRESETS.medium.sky].cloudShadow).toBe(false);
    expect(SKY_LOOK[DETAIL_PRESETS.medium.sky].sunlit).toBe(false);
    expect(SKY_LOOK[DETAIL_PRESETS.high.sky].cloudShadow).toBe(true);
    expect(SKY_LOOK[DETAIL_PRESETS.high.sky].sunlit).toBe(true);
  });

  it("walks the ladder monotonically, cheapest first", () => {
    const stops = (["low", "medium", "high"] as const).map(
      (id) => SKY_LOOK[DETAIL_PRESETS[id].sky],
    );
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].octaves).toBeGreaterThanOrEqual(stops[i - 1].octaves);
      expect(Number(stops[i].mist)).toBeGreaterThanOrEqual(Number(stops[i - 1].mist));
      expect(Number(stops[i].mountainShadow)).toBeGreaterThanOrEqual(
        Number(stops[i - 1].mountainShadow),
      );
    }
    // A sky that is a shader at all reads its clouds at some octaves.
    for (const look of Object.values(SKY_LOOK)) expect(look.shader).toBe(look.octaves > 0);
  });
});
