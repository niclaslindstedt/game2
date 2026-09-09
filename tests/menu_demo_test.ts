// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD BEHIND THE MENU CARDS (pwa/src/game/menu-demo.ts).
//
// It is tested rather than looked at because the failure is not a picture: a
// demo that insists on a road of its own is a menu that FREEZES for the better
// part of two seconds every time the player walks out of a run or steps back
// off Roam's map, and a screenshot of it looks exactly like a screenshot of a
// menu. What has to hold is that the spec handed back keeps every field the
// app's track cache is keyed on — seed, band, dials, season, temperature and
// the apron's depth of field — so the road already compiled is the road used.

import { DEFAULT_KNOBS } from "@engine";
import { describe, expect, it } from "vitest";
import { demoStage, type DemoConditions } from "../pwa/src/game/menu-demo.ts";
import type { StageSpec } from "../pwa/src/game/stage-spec.ts";

/** What the player last chose to race in — the half of a demo that is theirs. */
const RACE: DemoConditions = {
  hour: 9,
  weather: "clear",
  season: "summer",
  temperature: null,
  sandstorms: 0.2,
  carId: "kestrel",
  knobs: { ...DEFAULT_KNOBS },
};

/** A campaign stage on the road: a different country from the player's
 * settings, raced over laps, off a grid, with a field's apron behind it. */
const STANDING: StageSpec = {
  seed: 4821,
  length: "long",
  shape: "circuit",
  laps: 3,
  knobs: { ...DEFAULT_KNOBS, biome: "alpine", steepness: 0.9 },
  carId: "boxer",
  hour: 18,
  weather: "rain",
  season: "winter",
  temperature: -6,
  cars: 14,
  skipCountdown: false,
  grid: { number: 14, lateral: 3.2, back: 130, deficit: 12, gain: 0 },
};

describe("the menu demo's road", () => {
  it("takes every field the compiled road is keyed on off the stage standing", () => {
    const demo = demoStage(RACE, 7, STANDING);
    expect(demo.seed).toBe(STANDING.seed);
    expect(demo.length).toBe(STANDING.length);
    expect(demo.shape).toBe(STANDING.shape);
    expect(demo.knobs).toEqual(STANDING.knobs);
    expect(demo.season).toBe(STANDING.season);
    expect(demo.temperature).toBe(STANDING.temperature);
    // The apron is compiled into the track, so a road built to stand a field
    // is only the cached road while it is still asked for with that field.
    expect(demo.cars).toBe(STANDING.cars);
  });

  it("dresses that road as a demo: the player's car, one lap, no grid, no lights", () => {
    const demo = demoStage(RACE, 7, STANDING);
    expect(demo.carId).toBe(RACE.carId);
    expect(demo.hour).toBe(RACE.hour);
    expect(demo.weather).toBe(RACE.weather);
    expect(demo.sandstorms).toBe(RACE.sandstorms);
    expect(demo.laps).toBe(1);
    expect(demo.grid).toBeNull();
    expect(demo.skipCountdown).toBe(true);
  });

  it("rolls a road of its own with nothing standing — the boot", () => {
    const demo = demoStage(RACE, 7, null);
    expect(demo.seed).toBe(7);
    expect(demo.length).toBe("medium");
    expect(demo.shape).toBe("sprint");
    expect(demo.knobs).toEqual(RACE.knobs);
    expect(demo.season).toBe(RACE.season);
    expect(demo.cars).toBeUndefined();
  });

  it("never adopts the training ground — a bot loose in the arena never rolls off it", () => {
    const arena: StageSpec = { ...STANDING, arena: true };
    expect(demoStage(RACE, 7, arena).seed).toBe(7);
    expect(demoStage(RACE, 7, arena).arena).toBeUndefined();
  });

  it("never adopts an endless road — it is compiled fresh however it is asked for", () => {
    const endless: StageSpec = { ...STANDING, length: "endless" };
    const demo = demoStage(RACE, 7, endless);
    expect(demo.seed).toBe(7);
    expect(demo.length).toBe("medium");
  });

  it("settles: the demo it hands back is a road it would adopt unchanged", () => {
    // The backdrop is re-asked for on every settings change behind the cards,
    // and what is standing by then is the demo itself. A rule that did not
    // reach a fixed point would rebuild the world on every press.
    const first = demoStage(RACE, 7, STANDING);
    expect(demoStage(RACE, 7, first)).toEqual(first);
    const rolled = demoStage(RACE, 7, null);
    expect(demoStage(RACE, 7, rolled)).toEqual(rolled);
  });
});
