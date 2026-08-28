// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WEATHER'S TWO NUMBERS, AND THE SKY THEY BUILD.
//
// The atmosphere is presentation and is reviewed by LOOKING (`make sky`
// renders every weather against every time of day). What a picture cannot
// guard is the CLAIMS underneath it, and all of them are arithmetic:
//
//   * a wet stage's weight is read off the wind the engine seeded, so the
//     same seed brings back the same sky and no two stages get the same one;
//   * rain is a WHITE sky and a storm is a BLACK one — the single thing
//     that stops both collapsing into the same grey;
//   * the rain is coloured AGAINST the sky, or the sheet disappears on
//     exactly the weather with the most of it in it.
//
// No DOM: `weather.ts` is deliberately three-free (the road bed reads it
// too) and `sky.ts` is colour arithmetic over three's `Color`.

import { describe, expect, it } from "vitest";

import { TUNING, type RaceEnv } from "@engine";

import { rainTone, skyFor, type Preset } from "../pwa/src/game/sky.ts";
import { coverOf, squallOf } from "../pwa/src/game/weather.ts";

/** A stage's conditions, with the wind — which is what everything wet is
 * scaled by — set by hand. */
function conditions(over: Partial<RaceEnv>): RaceEnv {
  return {
    timeOfDay: "day",
    weather: "clear",
    season: "summer",
    windDir: 0,
    windSpeed: 0,
    gustPhase: 0,
    ...over,
  };
}

/** Rec. 709 luminance of a packed colour, 0..1 — how BRIGHT a sky is,
 * which is the whole difference between the two wet weathers. */
function luminance(hex: number): number {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const deckOf = (p: Preset): NonNullable<Preset["deck"]> => {
  expect(p.deck, "this weather should have a ceiling").not.toBeNull();
  return p.deck as NonNullable<Preset["deck"]>;
};

describe("how heavy a stage's weather is", () => {
  it("reads it off the wind the engine already seeded", () => {
    const [lo, hi] = TUNING.wind.speed.storm;
    expect(coverOf(conditions({ weather: "storm", windSpeed: lo }))).toBe(0);
    expect(coverOf(conditions({ weather: "storm", windSpeed: hi }))).toBe(1);
    expect(coverOf(conditions({ weather: "storm", windSpeed: (lo + hi) / 2 }))).toBeCloseTo(0.5, 5);
  });

  it("holds a wind outside the band inside it rather than running past", () => {
    // Nothing seeds a wind outside its own weather's band, but the map
    // preview and the sky harness both set one by hand.
    expect(coverOf(conditions({ weather: "rain", windSpeed: 0 }))).toBe(0);
    expect(coverOf(conditions({ weather: "rain", windSpeed: 40 }))).toBe(1);
  });

  it("gives a clear stage nothing to be heavy about", () => {
    const p = skyFor(conditions({ weather: "clear" }));
    expect(p.deck).toBeNull();
    expect(p.rain).toBe(0);
    expect(p.thunder).toBe(0);
  });
});

describe("the squall", () => {
  it("runs the full range across the gust the engine actually blows", () => {
    // `blowWind` breathes between (1 − gust) and (1 + gust) of the mean.
    const mean = 8;
    const swing = TUNING.wind.gust;
    expect(squallOf({ x: mean * (1 - swing), z: 0 }, mean)).toBeCloseTo(0, 5);
    expect(squallOf({ x: mean, z: 0 }, mean)).toBeCloseTo(0.5, 5);
    expect(squallOf({ x: mean * (1 + swing), z: 0 }, mean)).toBeCloseTo(1, 5);
  });

  it("reads the whole vector, not one axis", () => {
    const mean = 10;
    const along = squallOf({ x: mean, z: 0 }, mean);
    expect(squallOf({ x: mean * 0.6, z: mean * 0.8 }, mean)).toBeCloseTo(along, 5);
  });

  it("answers a still stage rather than dividing by its calm", () => {
    expect(squallOf({ x: 0, z: 0 }, 0)).toBe(0.5);
  });
});

describe("the two wet skies", () => {
  const rain = skyFor(conditions({ weather: "rain", windSpeed: 3.5 }));
  const storm = skyFor(conditions({ weather: "storm", windSpeed: 11 }));

  it("makes rain a WHITE sky and a storm a BLACK one", () => {
    // The one claim the whole model exists for. A thin rain deck is lit
    // from above and glows; a storm's is kilometres thick and sits in its
    // own shadow, and the difference is not a dimmer of the same grey.
    expect(luminance(deckOf(rain).overhead)).toBeGreaterThan(0.8);
    expect(luminance(deckOf(storm).overhead)).toBeLessThan(0.1);
    // …and an order of magnitude apart, which is the claim that survives
    // any retune of either end.
    expect(luminance(deckOf(rain).overhead)).toBeGreaterThan(
      10 * luminance(deckOf(storm).overhead),
    );
  });

  it("puts the light UNDER a storm's base and OVER a rain deck", () => {
    // Rain: brightest overhead, greying toward the rim, because that line
    // of sight runs the long way through the cloud. A storm: the reverse —
    // the only daylight left is the strip that gets in under the base.
    expect(luminance(deckOf(rain).rim)).toBeLessThan(luminance(deckOf(rain).overhead));
    expect(luminance(deckOf(storm).rim)).toBeGreaterThan(luminance(deckOf(storm).overhead));
  });

  it("hangs a storm lower, rains harder, and is the only one with real thunder", () => {
    expect(deckOf(storm).base).toBeLessThan(deckOf(rain).base);
    expect(storm.rain).toBeGreaterThan(rain.rain);
    expect(storm.thunder).toBeGreaterThan(0.9);
    expect(rain.thunder).toBe(0);
  });

  it("takes the sun's disc away under both, and the stars with it", () => {
    for (const p of [rain, storm]) {
      expect(p.discSize).toBe(0);
      expect(p.stars).toBe(0);
    }
  });
});

describe("no two wet stages get the same sky", () => {
  const light = skyFor(conditions({ weather: "storm", windSpeed: 7 }));
  const heavy = skyFor(conditions({ weather: "storm", windSpeed: 11 }));

  it("darkens, lowers and closes in as the stage's own wind rises", () => {
    expect(luminance(deckOf(heavy).overhead)).toBeLessThan(luminance(deckOf(light).overhead));
    expect(deckOf(heavy).base).toBeLessThan(deckOf(light).base);
    expect(deckOf(heavy).relief).toBeGreaterThan(deckOf(light).relief);
    expect(heavy.fogFar).toBeLessThan(light.fogFar);
    expect(heavy.rain).toBeGreaterThan(light.rain);
  });

  it("takes the daylight with it, and turns the car's lights on", () => {
    expect(heavy.sunIntensity).toBeLessThan(light.sunIntensity);
    expect(heavy.hemiIntensity).toBeLessThan(light.hemiIntensity);
    // A rally car under a black sky at noon is running lights, and a
    // daytime preset would never ask for them on its own.
    expect(skyFor(conditions({ weather: "clear" })).headlights).toBe(false);
    expect(heavy.headlights).toBe(true);
  });
});

describe("what colour the rain is", () => {
  it("is a shadow on a bright sky and a highlight on a dark one", () => {
    // A drop refracts what is behind it, so what makes a streak visible is
    // CONTRAST — and the sign of it flips between the two weathers. One
    // pale grey for both is how rain disappears on the heaviest stage.
    const white = skyFor(conditions({ weather: "rain", windSpeed: 3.5 }));
    const black = skyFor(conditions({ weather: "storm", windSpeed: 11 }));
    const against = (p: Preset): number => {
      const c = rainTone(p);
      return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    };
    expect(against(white)).toBeLessThan(luminance(deckOf(white).overhead));
    expect(against(black)).toBeGreaterThan(luminance(deckOf(black).overhead));
  });
});
