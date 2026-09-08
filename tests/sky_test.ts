// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LADDER OF SKIES — the clear sky as a continuous function of where
// the sun is, and what hangs off it.
//
// The pictures are reviewed with `make sky`; what a picture cannot guard is
// that the ladder is CONTINUOUS (a stage driven from sunset into the night
// must never cut), that it keys on the real sun (a June midnight at 62°N is
// twilight, a December afternoon is dark), that the moon takes the key over
// when the sun is gone, that a deck is dark at night, and that the things
// at altitude keep the sun after the ground has lost it.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { RaceEnv } from "@engine";

import { sunAt } from "../pwa/src/game/daylight.ts";
import {
  NOON,
  beamShareOf,
  carTintFor,
  dayLight,
  highLightFor,
  skyAt,
  skyFor,
  sunHardness,
  type Preset,
} from "../pwa/src/game/sky.ts";

const DEG = Math.PI / 180;

function conditions(over: Partial<RaceEnv>): RaceEnv {
  return {
    hour: 12,
    weather: "clear",
    season: "autumn",
    temperature: 12,
    windDir: 0,
    windSpeed: 0,
    gustPhase: 0,
    sand: false,
    sandstorms: 0,
    sandSeed: 1,
    ...over,
  };
}

function lum(hex: number): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** The biggest change of any channel of a colour between two presets. */
function jump(a: number, b: number): number {
  const x = new THREE.Color(a);
  const y = new THREE.Color(b);
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
}

describe("the ladder", () => {
  it("is continuous through a whole day", () => {
    // The environment re-reads the sky every 1/240 h — a quarter of a
    // second of racing — and between two of those nothing about it may
    // move by more than an eye would forgive: the ladder's steepest rung,
    // the dark going to the afterglow, is a ramp the length of a minute.
    const STEP = 1 / 240;
    let was: Preset | null = null;
    for (let hour = 0; hour <= 24; hour += STEP) {
      const p = skyAt(conditions({}), "taiga", hour);
      if (was) {
        for (const key of ["zenith", "horizon", "fog", "sun", "hemiSky", "cloud"] as const) {
          expect(jump(was[key], p[key]), `${key} at ${hour.toFixed(3)}`).toBeLessThan(0.02);
        }
        expect(Math.abs(p.sunIntensity - was.sunIntensity)).toBeLessThan(0.02);
        expect(Math.abs(p.stars - was.stars)).toBeLessThan(0.015);
        expect(Math.abs(p.sunElevation - was.sunElevation)).toBeLessThan(0.02);
      }
      was = p;
    }
  });

  it("keys on the real sun, not on a word", () => {
    // A June midnight at 62°N is twilight; a December four o'clock is dark.
    const juneNight = skyAt(conditions({ season: "summer" }), "taiga", 0);
    const decemberFour = skyAt(conditions({ season: "winter" }), "taiga", 16);
    expect(juneNight.daylight).not.toBe("night");
    expect(decemberFour.daylight).toBe("night");
    expect(lum(juneNight.zenith)).toBeGreaterThan(lum(decemberFour.zenith));
    expect(juneNight.stars).toBeLessThan(decemberFour.stars);
    expect(decemberFour.lamps).toBe("main");
    expect(decemberFour.stars).toBeGreaterThan(0.5);
    // The same hour over the desert is a golden afternoon with the sun
    // still up: a car with its dipped beams lit, not one driving on them.
    const desertFour = skyAt(conditions({ season: "winter" }), "desert", 16);
    expect(desertFour.daylight).not.toBe("night");
    expect(desertFour.sunUp).toBeGreaterThan(0);
    expect(desertFour.stars).toBe(0);
    expect(desertFour.lamps).toBe("dipped");
  });

  it("carries the real sun's place beside the key light", () => {
    const noon = skyAt(conditions({}), "taiga", 12);
    const sun = sunAt(12, "autumn", "taiga");
    expect(noon.sunUp).toBeCloseTo(sun.elevation, 9);
    expect(noon.sunBearing).toBeCloseTo(sun.azimuth, 9);
    expect(noon.sunElevation).toBeCloseTo(sun.elevation, 9);
    expect(noon.sunAzimuth).toBeCloseTo(sun.azimuth, 9);
  });

  it("hands the key over to the moon in the dark", () => {
    const night = skyAt(conditions({}), "taiga", 0);
    expect(night.sunUp).toBeLessThan(-12 * DEG);
    // The key stands opposite the sun and above the horizon.
    expect(night.sunAzimuth).toBeCloseTo(night.sunBearing + Math.PI, 6);
    expect(night.sunElevation).toBeGreaterThan(0);
    expect(night.sunElevation).toBeCloseTo(-night.sunUp, 6);
    // …and the key never goes under the ground, even with the sun on it.
    for (let hour = 0; hour <= 24; hour += 0.25) {
      expect(skyAt(conditions({}), "taiga", hour).sunElevation).toBeGreaterThan(0);
    }
  });

  it("paints the dawn and the dusk differently at the same elevation", () => {
    const rise = skyAt(conditions({}), "taiga", 6.25);
    const set = skyAt(conditions({}), "taiga", 17.75);
    expect(Math.abs(rise.sunUp - set.sunUp)).toBeLessThan(1 * DEG);
    expect(jump(rise.horizon, set.horizon)).toBeGreaterThan(0.1);
    // Both are warm skies: more red than blue on the horizon.
    for (const p of [rise, set]) {
      const c = new THREE.Color(p.horizon);
      expect(c.r).toBeGreaterThan(c.b);
      expect(p.lamps).not.toBe("off");
    }
  });

  it("is the bright arcade day at noon", () => {
    const noon = skyAt(conditions({ season: "summer" }), "taiga", 12);
    expect(noon.stars).toBe(0);
    expect(noon.lamps).toBe("off");
    expect(noon.zenith).toBe(NOON.zenith);
    expect(dayLight(noon)).toBeGreaterThan(0.9);
    expect(sunHardness(noon)).toBeGreaterThan(0.9);
    expect(carTintFor(noon).r).toBeCloseTo(1, 1);
  });

  it("starts a stage where it says and slides on from there", () => {
    const env = conditions({ hour: 17 });
    expect(skyFor(env, "taiga")).toEqual(skyAt(env, "taiga", 17));
  });

  it("puts the lamps on well before the sun goes, and the driving beams on after", () => {
    const dipped = skyAt(conditions({}), "taiga", 16);
    // The lamps are lit with the sun still a good way up — the whole point
    // of the dipped stop is the stretch of evening BEFORE the sunset.
    expect(dipped.sunUp).toBeGreaterThan(5 * DEG);
    expect(dipped.lamps).toBe("dipped");
    // ...and the driving beams wait for the sun to have actually gone.
    const set = skyAt(conditions({}), "taiga", 17.6);
    expect(set.sunUp).toBeGreaterThan(0);
    expect(set.lamps).toBe("dipped");
    expect(skyAt(conditions({}), "taiga", 19).lamps).toBe("main");
  });

  it("never takes the lamps back down as the evening goes on", () => {
    // The ladder only ever climbs between the last of the daylight and the
    // night: a car that has switched on cannot switch off again on the way
    // down, whatever a rung's colours do in between.
    const rank = { off: 0, dipped: 1, main: 2 };
    let was = 0;
    for (let hour = 12; hour <= 23.5; hour += 0.25) {
      const now = rank[skyAt(conditions({}), "taiga", hour).lamps];
      expect(now).toBeGreaterThanOrEqual(was);
      was = now;
    }
    expect(was).toBe(rank.main);
  });
});

describe("what the ladder does to the weather", () => {
  it("darkens a deck with the day", () => {
    const noon = skyAt(conditions({ weather: "rain", windSpeed: 3.5 }), "taiga", 12);
    const night = skyAt(conditions({ weather: "rain", windSpeed: 3.5 }), "taiga", 0);
    expect(noon.deck).not.toBeNull();
    expect(night.deck).not.toBeNull();
    expect(lum(noon.deck?.overhead ?? 0)).toBeGreaterThan(0.8);
    expect(lum(night.deck?.overhead ?? 0)).toBeLessThan(0.12);
    expect(lum(night.deck?.rim ?? 0)).toBeLessThan(lum(noon.deck?.rim ?? 0));
  });

  it("throws no beam under a storm at any hour", () => {
    for (const hour of [0, 6, 12, 18]) {
      const storm = skyAt(conditions({ weather: "storm", windSpeed: 11 }), "taiga", hour);
      expect(storm.beam).toBe(0);
      expect(beamShareOf(storm)).toBe(0);
    }
  });
});

describe("what is lit at altitude", () => {
  it("keeps the sunset on a contrail after the valley has lost it", () => {
    // The sun two degrees under: the cloud tone is the afterglow's, and
    // ten kilometres up still gets all of it where a cumulus gets none.
    let after: Preset | null = null;
    for (let hour = 17.5; hour < 19; hour += 0.02) {
      const p = skyAt(conditions({}), "taiga", hour);
      if (p.sunUp < -2 * DEG) {
        after = p;
        break;
      }
    }
    expect(after).not.toBeNull();
    const p = after as Preset;
    const high = highLightFor(p, 10_000);
    const low = highLightFor(p, 1_200);
    const lit = new THREE.Color(p.cloud);
    const shade = new THREE.Color(p.cloudShade);
    const apart = (a: THREE.Color, b: THREE.Color): number =>
      Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    expect(apart(high, lit)).toBeLessThan(0.1);
    expect(apart(low, shade)).toBeLessThan(0.1);
    // …and the afterglow's lit tone is the warm one.
    expect(lit.r).toBeGreaterThan(lit.b);
  });
});
