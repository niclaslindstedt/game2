// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE SUN IS, and the clock it runs on.
//
// The whole atmosphere hangs off one piece of astronomy (daylight.ts), and
// astronomy is checkable against a table: the noon sun at 62°N stands 51°
// up at midsummer and 26° at the equinox, rises in the north-east in June
// and the south-east in December, and a December afternoon there is dark
// by four. The clock is the other claim — one minute of racing is one hour
// of sun — and the words the audio and the menu key on are that elevation
// binned.

import { describe, expect, it } from "vitest";

import { SUN_SECONDS_PER_HOUR, sunHourAt } from "@engine";

import {
  DAY_ABOVE,
  HOURS,
  NIGHT_BELOW,
  SOUTH,
  daylightAt,
  horizonCrossing,
  hourLabel,
  hourOfElevation,
  hourOfStop,
  hourOfWord,
  hourStop,
  hoursToTurn,
  litAt,
  moonAt,
  nightNow,
  parseHour,
  sunApart,
  sunAt,
  LAMPS_UNDER,
} from "../pwa/src/game/daylight.ts";

/** The Alps at First Light: a spring stage started at 4:00, driven up
 * through the sunrise — the fastest the sun ever moves in this game, and
 * the case everything downstream of it has to survive. */
const FIRST_LIGHT = { hour: 4, season: "spring" as const, biome: "alpine" as const };

/** How much sun the top of that stage's cloud sea sees at race time `t`. */
function litSea(t: number): number {
  const hour = sunHourAt(FIRST_LIGHT, t);
  return litAt(1800, sunAt(hour, FIRST_LIGHT.season, FIRST_LIGHT.biome).elevation);
}

const DEG = Math.PI / 180;

describe("the sun's place", () => {
  it("stands where the tables say at noon", () => {
    // 90 − latitude + declination.
    expect(sunAt(12, "summer", "taiga").elevation / DEG).toBeCloseTo(90 - 62 + 23.4, 1);
    expect(sunAt(12, "autumn", "taiga").elevation / DEG).toBeCloseTo(90 - 62 - 1.8, 1);
    expect(sunAt(12, "winter", "taiga").elevation / DEG).toBeCloseTo(90 - 62 - 23.4, 1);
    expect(sunAt(12, "summer", "desert").elevation / DEG).toBeCloseTo(90 - 33 + 23.4, 1);
    // …and dead south, on every noon.
    for (const season of ["spring", "summer", "autumn", "winter"] as const) {
      expect(sunAt(12, season, "alpine").azimuth).toBeCloseTo(SOUTH, 6);
    }
  });

  it("rises in the east and sets in the west, further north in summer", () => {
    const juneRise = hourOfElevation(0, true, "summer", "taiga");
    const juneSet = hourOfElevation(0, false, "summer", "taiga");
    const septRise = hourOfElevation(0, true, "autumn", "taiga");
    expect(juneRise).not.toBeNull();
    expect(juneSet).not.toBeNull();
    expect(septRise).not.toBeNull();
    expect(juneRise as number).toBeLessThan(septRise as number);
    expect(juneRise as number).toBeLessThan(12);
    expect(juneSet as number).toBeGreaterThan(12);
    // Azimuth from the south: negative all morning, and a June sunrise
    // is a long way round toward the north.
    const june = sunAt(juneRise as number, "summer", "taiga").azimuth - SOUTH;
    const sept = sunAt(septRise as number, "autumn", "taiga").azimuth - SOUTH;
    expect(june).toBeLessThan(0);
    expect(Math.abs(june)).toBeGreaterThan(Math.abs(sept));
    expect(Math.abs(sept) / DEG).toBeCloseTo(90, -1);
    expect(sunAt(juneSet as number, "summer", "taiga").azimuth - SOUTH).toBeGreaterThan(0);
  });

  it("makes a taiga winter afternoon dark and a taiga summer night not", () => {
    expect(daylightAt(16, "winter", "taiga")).toBe("night");
    expect(sunAt(16, "winter", "taiga").elevation).toBeLessThan(NIGHT_BELOW);
    // Midsummer at 62°N never gets past civil twilight.
    expect(sunAt(0, "summer", "taiga").elevation).toBeGreaterThan(NIGHT_BELOW);
    expect(daylightAt(0, "summer", "taiga")).not.toBe("night");
    // The desert's night is a real one.
    expect(daylightAt(0, "summer", "desert")).toBe("night");
    expect(daylightAt(12, "winter", "taiga")).not.toBe("day");
    expect(sunAt(12, "winter", "taiga").elevation).toBeLessThan(DAY_ABOVE);
  });

  it("names the light by which way the sun is going", () => {
    // Mid-May at 62°N: up at half past three, so six is already day.
    expect(daylightAt(4.5, "spring", "taiga")).toBe("dawn");
    expect(daylightAt(6, "spring", "taiga")).toBe("day");
    expect(daylightAt(20, "spring", "taiga")).toBe("dusk");
    expect(daylightAt(12, "spring", "taiga")).toBe("day");
    expect(daylightAt(1, "spring", "desert")).toBe("night");
  });

  it("puts the full moon opposite the sun", () => {
    const sun = sunAt(0, "winter", "taiga");
    const moon = moonAt(sun);
    expect(moon.elevation).toBeCloseTo(-sun.elevation, 9);
    expect(moon.azimuth).toBeCloseTo(sun.azimuth + Math.PI, 9);
    // High at midnight in winter.
    expect(moon.elevation / DEG).toBeGreaterThan(45);
  });
});

describe("the sun's clock", () => {
  it("runs an hour of sun a minute of racing, and wraps", () => {
    expect(SUN_SECONDS_PER_HOUR).toBe(60);
    expect(sunHourAt({ hour: 17 }, 60)).toBeCloseTo(18, 9);
    expect(sunHourAt({ hour: 23.5 }, 120)).toBeCloseTo(1.5, 9);
    expect(sunHourAt({ hour: 6 }, 0)).toBe(6);
  });

  it("drives a stage started at sunset into the dark", () => {
    const set = hourOfElevation(0, false, "autumn", "taiga") as number;
    expect(daylightAt(sunHourAt({ hour: set - 0.1 }, 0), "autumn", "taiga")).toBe("dusk");
    // Two and a half minutes later the sun is under nautical twilight.
    expect(daylightAt(sunHourAt({ hour: set - 0.1 }, 150), "autumn", "taiga")).toBe("night");
  });
});

describe("what the sun still reaches", () => {
  it("lights a cirrus sheet after the valley has lost the sun", () => {
    // Three degrees under: the ground is dark, ten kilometres up is lit.
    expect(litAt(0, -3 * DEG)).toBe(0);
    expect(litAt(10_000, -3 * DEG)).toBeGreaterThan(0.85);
    // A kilometre and a half up loses it a degree and a bit under.
    expect(litAt(1500, -1.5 * DEG)).toBeLessThan(0.1);
    expect(litAt(1500, -0.5 * DEG)).toBeGreaterThan(0.9);
    expect(litAt(0, 1 * DEG)).toBe(1);
  });

  it("turns a stage toward its own sunrise or sunset", () => {
    const morning = horizonCrossing(5, "autumn", "taiga");
    const evening = horizonCrossing(15, "autumn", "taiga");
    expect(morning - SOUTH).toBeLessThan(0);
    expect(evening - SOUTH).toBeGreaterThan(0);
    // A sun that never crosses hands back where it comes nearest.
    expect(Number.isFinite(horizonCrossing(23, "summer", "taiga"))).toBe(true);
  });
});

describe("the hour, as the menu and a link read it", () => {
  it("offers every whole hour, labelled as a clock", () => {
    expect(HOURS).toHaveLength(24);
    expect(HOURS[0].label).toBe("00:00");
    expect(HOURS[16].label).toBe("16:00");
    expect(hourLabel(16.5)).toBe("16:30");
    expect(hourLabel(23.999)).toBe("00:00");
  });

  it("snaps a stored hour to the row and back", () => {
    expect(hourStop(17.5)).toBe("18");
    expect(hourOfStop("18")).toBe(18);
    expect(hourOfStop("nonsense")).toBe(12);
  });

  it("reads a number on the clock and nothing else", () => {
    expect(parseHour("25")).toBe(1);
    expect(parseHour(-1)).toBe(23);
    expect(parseHour("x")).toBeNull();
    expect(parseHour(null)).toBeNull();
  });

  it("turns the old words into the hour that light happens at", () => {
    // Dawn is the sun eight degrees up and climbing: before noon, and
    // earlier in June than in September.
    const june = hourOfWord("dawn", "summer", "taiga");
    const sept = hourOfWord("dawn", "autumn", "taiga");
    expect(june).toBeLessThan(sept);
    expect(sept).toBeLessThan(12);
    expect(sunAt(sept, "autumn", "taiga").elevation / DEG).toBeCloseTo(8, 0);
    expect(hourOfWord("dusk", "autumn", "taiga")).toBeGreaterThan(12);
    expect(hourOfWord("day", "autumn", "taiga")).toBe(12);
    expect(hourOfWord("night", "autumn", "taiga")).toBe(0);
    // A December sun at 62°N never reaches eight degrees: the sunrise
    // itself stands in, which is still a morning.
    const winter = hourOfWord("dawn", "winter", "taiga");
    expect(winter).toBeGreaterThan(8);
    expect(winter).toBeLessThan(12);
  });
});

describe("the dark the instruments dip for", () => {
  // The HUD's night dressing is not a threshold of its own: it is the stop
  // the car's own main beam comes on at, so the cluster and the beams can
  // never disagree about whether it is dark (daylight.ts's `nightNow`).
  it("switches with the main beam and not before it", () => {
    const at = hourOfElevation(LAMPS_UNDER.main, false, "autumn", "taiga");
    expect(at).not.toBeNull();
    const dusk = at as number;
    expect(nightNow({ hour: dusk - 0.25, season: "autumn" }, 0, "taiga")).toBe(false);
    expect(nightNow({ hour: dusk + 0.25, season: "autumn" }, 0, "taiga")).toBe(true);
  });

  it("leaves the whole golden hour bright", () => {
    // The dip switch comes on twelve degrees up — the better part of an
    // hour of daylight earlier. Taking the HUD down there would dim it
    // against the brightest part of the evening.
    const dip = hourOfElevation(LAMPS_UNDER.dipped, false, "autumn", "taiga") as number;
    expect(nightNow({ hour: dip + 0.1, season: "autumn" }, 0, "taiga")).toBe(false);
    expect(nightNow({ hour: 12, season: "summer" }, 0, "taiga")).toBe(false);
  });

  it("comes on mid-stage, because the sun runs on with the race clock", () => {
    const at = hourOfElevation(LAMPS_UNDER.main, false, "autumn", "taiga") as number;
    const env = { hour: at - 0.2, season: "autumn" as const };
    expect(nightNow(env, 0, "taiga")).toBe(false);
    // An hour of sun a minute of racing: four minutes in, the sun has gone.
    expect(nightNow(env, 4 * SUN_SECONDS_PER_HOUR, "taiga")).toBe(true);
  });
});

describe("how fast the sun moves", () => {
  it("climbs ten degrees a minute of racing through a spring sunrise", () => {
    const at = (t: number): number =>
      sunAt(sunHourAt(FIRST_LIGHT, t), FIRST_LIGHT.season, FIRST_LIGHT.biome).elevation / DEG;
    // Four in the morning is under the horizon; a minute of racing later
    // the sun is well up, which is an hour of it.
    expect(at(0)).toBeLessThan(0);
    expect(at(SUN_SECONDS_PER_HOUR) - at(0)).toBeGreaterThan(9);
  });

  it("crosses what a cloud sea reads as sunlight in a step a frame can follow", () => {
    // `litAt` is a ramp six tenths of a degree wide — a whole cloud sea
    // going from shade to lit — and that sunrise crosses it in about three
    // seconds of racing. Read once a FRAME it moves by a fiftieth at a
    // time, which is a sweep.
    let perFrame = 0;
    let perRepaint = 0;
    for (let t = 0; t < 90; t += 1 / 60) {
      perFrame = Math.max(perFrame, Math.abs(litSea(t + 1 / 60) - litSea(t)));
      perRepaint = Math.max(perRepaint, Math.abs(litSea(t + 0.25) - litSea(t)));
    }
    expect(perFrame).toBeLessThan(0.02);
    // ...and read at the cadence the sky is PAINTED at instead — a quarter
    // of a second — it arrives in tenths, which is the staircase the split
    // in environment.ts exists to keep out of the mist.
    expect(perRepaint).toBeGreaterThan(0.05);
  });

  it("hands back the step of the clock it takes to turn a given angle", () => {
    for (const hour of [4, 5, 9, 12, 18]) {
      const step = hoursToTurn(0.5 * DEG, hour, FIRST_LIGHT.season, FIRST_LIGHT.biome);
      const moved = sunApart(
        sunAt(hour, FIRST_LIGHT.season, FIRST_LIGHT.biome),
        sunAt(hour + step, FIRST_LIGHT.season, FIRST_LIGHT.biome),
      );
      // Half a degree, give or take the arc's own curvature over it —
      // unless the cap bit, which is a sun that has all but stopped.
      if (step < 1) expect(moved / DEG).toBeCloseTo(0.5, 1);
      else expect(moved / DEG).toBeLessThan(0.5);
    }
    // A sun that never moves is never chased: the cap holds.
    expect(hoursToTurn(90 * DEG, 12, "summer", "taiga")).toBe(1);
  });
});
