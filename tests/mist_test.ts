// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MIST IN THE VALLEYS — when it lies there, how deep, and where its top
// is. A rule (mist.ts), so a rule's claims: thickest at dawn, burnt off by
// mid-morning, most in autumn, none in a dry desert, a cloud sea in the
// Alps and a sheet over the taiga's bogs.

import { describe, expect, it } from "vitest";

import { mistFor } from "../pwa/src/game/mist.ts";

const DEG = Math.PI / 180;

function at(over: Partial<Parameters<typeof mistFor>[0]>) {
  return mistFor({
    sunUp: 0,
    rising: true,
    season: "autumn",
    biome: "taiga",
    weather: "clear",
    wet: true,
    floor: 20,
    peak: 120,
    ...over,
  });
}

describe("when the mist lies", () => {
  it("is thickest around sunrise and gone by mid-morning", () => {
    const beforeDawn = at({ sunUp: -4 * DEG }).density;
    const sunrise = at({ sunUp: 1 * DEG }).density;
    const midMorning = at({ sunUp: 8 * DEG }).density;
    const noon = at({ sunUp: 26 * DEG }).density;
    expect(sunrise).toBeGreaterThan(0.8);
    expect(beforeDawn).toBeGreaterThan(0.8);
    expect(midMorning).toBeLessThan(sunrise);
    expect(midMorning).toBeGreaterThan(0);
    expect(noon).toBe(0);
  });

  it("forms again after the ground has cooled in the evening", () => {
    expect(at({ rising: false, sunUp: 3 * DEG }).density).toBe(0);
    const dusk = at({ rising: false, sunUp: -5 * DEG }).density;
    const night = at({ rising: false, sunUp: -20 * DEG }).density;
    expect(dusk).toBeGreaterThan(0);
    expect(night).toBeGreaterThan(dusk);
    // …but never as much as the dawn's.
    expect(night).toBeLessThan(at({ sunUp: 0 }).density);
  });

  it("has the most in autumn and the least in summer", () => {
    const by = (season: "spring" | "summer" | "autumn" | "winter"): number =>
      at({ season }).density;
    expect(by("autumn")).toBeGreaterThan(by("spring"));
    expect(by("spring")).toBeGreaterThan(by("summer"));
    expect(by("winter")).toBeLessThan(by("autumn"));
  });

  it("keeps cloud in the valleys all day under rain, and none in a dry storm", () => {
    expect(at({ weather: "rain", sunUp: 30 * DEG }).density).toBeGreaterThan(0);
    expect(at({ weather: "storm", sunUp: 30 * DEG }).density).toBeGreaterThan(0);
    expect(at({ weather: "rain", sunUp: 30 * DEG }).density).toBeGreaterThan(
      at({ weather: "storm", sunUp: 30 * DEG }).density,
    );
    expect(at({ biome: "desert", wet: false, weather: "storm" }).density).toBe(0);
  });

  it("has nothing in a dry desert and a haze in its wet season", () => {
    expect(at({ biome: "desert", wet: false }).density).toBe(0);
    const wet = at({ biome: "desert", wet: true, season: "winter" });
    expect(wet.density).toBeGreaterThan(0);
    expect(wet.density).toBeLessThan(at({ season: "winter" }).density);
  });
});

describe("where the mist lies", () => {
  it("pools at the valley floor, a sheet over the taiga and a sea in the Alps", () => {
    const taiga = at({ floor: 20, peak: 120 });
    const alps = at({ biome: "alpine", floor: 300, peak: 900 });
    expect(taiga.top).toBeGreaterThan(20);
    expect(taiga.top - 20).toBeLessThan(30);
    expect(alps.top).toBeGreaterThan(300);
    expect(alps.top - 300).toBeGreaterThan(taiga.top - 20);
    expect(alps.top).toBeLessThan(900);
    expect(alps.depth).toBeGreaterThan(taiga.depth);
  });

  it("never fills a valley past its ceiling, however deep the relief", () => {
    const deep = at({ biome: "alpine", floor: 0, peak: 5000 });
    expect(deep.top).toBeLessThanOrEqual(0 + 280);
    const flat = at({ floor: 5, peak: 5 });
    expect(flat.top).toBeGreaterThan(5);
  });
});
