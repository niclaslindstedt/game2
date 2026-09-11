// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WINTER, and the cold under every season (engine/game/climate.ts): the
// temperature as a field over the country, the snow it brings down onto the
// road and lays beside it, what that snow is like to drive on, and what
// falls out of a wet sky under it.

import { describe, expect, it } from "vitest";

import {
  type BiomeId,
  BIOMES,
  CLIMATE,
  NEUTRAL_INPUT,
  SEASONS,
  TUNING,
  blanketDepth,
  packedDepth,
  permanentPack,
  GROUND_CELL,
  createGame,
  defaultTemperature,
  fallsAsSnow,
  frostLine,
  icyCountry,
  isLoose,
  rainsIn,
  resolveClimate,
  resolveKnobs,
  simulateStage,
  rollSnowHabit,
  SNOW_HABITS,
  snowBite,
  wearAt,
  snowHabits,
  snowlineOf,
  step,
  temperatureAt,
  weathersIn,
  type Track,
} from "@engine";

import { stageTerrain, stageTrack } from "./support/stages.ts";

/** A country's dials at their defaults — what `resolveClimate` and the zone
 * readers now take, since R47's ALTITUDE moves both the bands and the rate
 * the air cools at. */
const dials = (biome: BiomeId) => resolveKnobs({ biome });

/** The grip the old alpine ice had — the floor the brief puts under every
 * snow: a winter road slides MORE than gravel and LESS than that. */
const OLD_ICE = 0.58;

const WINTER = { season: "winter" as const };

/** A winter cold enough to whiten the taiga and NOT cold enough to freeze
 * its water (R48): the ice line stands clear over the country's own
 * ceiling, so every body on it is still open and the route is the summer's.
 * Derived from the country rather than named, because the claim the tests
 * below make — "the same road, made of snow" — is only true on this side of
 * `CLIMATE.ice`, and a hard-coded degree would quietly stop meaning it.
 * The ice itself is `tests/ice_test.ts`. */
const MILD = {
  season: "winter" as const,
  temperature: CLIMATE.ice + CLIMATE.lapse * (BIOMES.taiga.land.zones.rock.to + 20),
};

/** A point beside the road, `out` metres to the driver's right of sample
 * `i`, on dry land — searched for rather than named, because a seed's
 * verge may be a lake. */
function beside(track: Track, out: number): { x: number; z: number; i: number } {
  const terrain = stageTerrain(track);
  for (let i = 40; i < track.samples.length - 40; i += 7) {
    const s = track.samples[i];
    const x = s.x + Math.cos(s.heading) * out;
    const z = s.z - Math.sin(s.heading) * out;
    if (terrain.waterAt(x, z) !== null || terrain.iceAt(x, z) !== null) continue;
    if (terrain.spurClearance(x, z) < CLIMATE.blanket.verge + 2) continue;
    if (terrain.roadDistanceAt(x, z) < out - 1) continue;
    return { x, z, i };
  }
  throw new Error("no dry ground beside the road");
}

describe("the climate", () => {
  it("has a winter, and every season has its own temperature in every country", () => {
    expect(SEASONS).toContain("winter");
    for (const biome of Object.keys(BIOMES)) {
      for (const season of SEASONS) {
        expect(Number.isFinite(defaultTemperature(biome, season))).toBe(true);
      }
      expect(defaultTemperature(biome, "winter")).toBeLessThan(defaultTemperature(biome, "summer"));
    }
    expect(defaultTemperature("taiga", "winter")).toBeLessThan(CLIMATE.freeze);
    expect(defaultTemperature("desert", "winter")).toBeGreaterThan(CLIMATE.freeze);
  });

  it("resolves what was chosen, and fills the rest in from the country's year", () => {
    // R47 — it takes the whole set of DIALS rather than a country's name,
    // because the lapse rate it resolves is the ALTITUDE dial's as much as
    // the biome's: a country stood up a mountain cools over its own bands.
    expect(resolveClimate(undefined, dials("taiga"))).toEqual({
      season: "summer",
      temperature: 18,
      lapse: CLIMATE.lapse,
    });
    expect(resolveClimate({ season: "winter" }, dials("alpine")).temperature).toBe(
      defaultTemperature("alpine", "winter"),
    );
    expect(
      resolveClimate({ season: "winter", temperature: null }, dials("taiga")).temperature,
    ).toBe(defaultTemperature("taiga", "winter"));
    expect(resolveClimate({ season: "summer", temperature: -12 }, dials("desert"))).toEqual({
      season: "summer",
      temperature: -12,
      lapse: CLIMATE.lapse,
    });
  });

  it("gets colder with height, and freezes the ground from the frost line up", () => {
    const climate = { season: "summer" as const, temperature: 6 };
    expect(temperatureAt(climate, 0)).toBe(6);
    expect(temperatureAt(climate, 300)).toBeLessThan(temperatureAt(climate, 100));
    expect(temperatureAt(climate, frostLine(climate))).toBeCloseTo(CLIMATE.freeze, 9);
    // A frozen datum puts the line under the whole country.
    expect(frostLine({ season: "winter", temperature: -8 })).toBeLessThan(0);
  });

  it("brings the snowline down with the cold, and never lifts the country's own", () => {
    const taiga = BIOMES.taiga.land.zones;
    const alpine = BIOMES.alpine.land.zones;
    // A summer taiga's line stands over the whole country: no snow anywhere.
    expect(snowlineOf(resolveClimate(undefined, dials("taiga")), taiga)).toBeGreaterThan(
      taiga.rock.to,
    );
    // A winter one is white from the valley floor.
    expect(snowlineOf(resolveClimate(WINTER, dials("taiga")), taiga)).toBeLessThan(0);
    // The alpine's permanent snow stands where it always stood in every
    // season that is not winter — the campaign's stages are unchanged...
    for (const season of ["spring", "summer", "autumn"] as const) {
      expect(snowlineOf(resolveClimate({ season }, dials("alpine")), alpine)).toBe(alpine.snow);
    }
    // ...and a cold snap brings it down the flank.
    expect(snowlineOf({ season: "autumn", temperature: 2 }, alpine)).toBeLessThan(
      alpine.snow as number,
    );
    expect(snowlineOf(resolveClimate(WINTER, dials("alpine")), alpine)).toBeLessThan(0);
  });

  it("keeps every snow between gravel and the old ice, glazed near freezing and sharp in the cold", () => {
    const S = TUNING.surfaces;
    expect(S.grip.snow).toBeGreaterThan(OLD_ICE);
    expect(S.grip.snow).toBeLessThan(S.grip.gravel);
    expect(S.breakaway.snow).toBeGreaterThan(S.breakaway.gravel);
    for (let t = -30; t <= 30; t += 1) {
      const grip = S.grip.snow * snowBite(t);
      expect(grip).toBeGreaterThan(OLD_ICE);
      expect(grip).toBeLessThan(S.grip.gravel);
    }
    // The glaze is the worst of it, and the cold the best.
    expect(snowBite(CLIMATE.bite.glazeAt)).toBeLessThan(snowBite(4));
    expect(snowBite(CLIMATE.bite.glazeAt)).toBeLessThan(snowBite(CLIMATE.bite.at));
    expect(snowBite(-20)).toBeGreaterThan(snowBite(CLIMATE.bite.at));
    expect(snowBite(-40)).toBe(snowBite(CLIMATE.bite.coldAt));
    // The row itself is the cold winter's snow.
    expect(snowBite(CLIMATE.bite.at)).toBe(1);
    // Deep snow is a place to be slow rather than loose.
    expect(S.drag.snowfield).toBeGreaterThan(S.drag.nature);
    expect(S.grip.snowfield).toBeGreaterThan(S.grip.water);
    expect(S.give.snowfield).toBeGreaterThan(S.give.snow);
  });

  it("lays half a metre of snow at freezing and a metre in the deep cold", () => {
    expect(blanketDepth(5)).toBe(CLIMATE.blanket.shallow);
    expect(blanketDepth(0)).toBe(CLIMATE.blanket.shallow);
    expect(blanketDepth(-7.5)).toBeGreaterThan(CLIMATE.blanket.shallow);
    expect(blanketDepth(-7.5)).toBeLessThan(CLIMATE.blanket.deep);
    expect(blanketDepth(-15)).toBe(CLIMATE.blanket.deep);
    expect(blanketDepth(-40)).toBe(CLIMATE.blanket.deep);
    expect(CLIMATE.blanket.shallow).toBeGreaterThanOrEqual(0.5);
    expect(CLIMATE.blanket.deep).toBeLessThanOrEqual(1);
  });

  it("lays a PERMANENT snowfield metres deep, whatever the air over it is", () => {
    // The air above a summer snowfield is well over freezing, so the
    // winter's own rule answers with its floor — and a permanent field is
    // still metres deep, because what is on it never melted.
    expect(blanketDepth(6)).toBe(CLIMATE.blanket.shallow);
    expect(permanentPack(0)).toBe(0);
    expect(permanentPack(CLIMATE.blanket.pileAt)).toBe(CLIMATE.blanket.pile);
    expect(permanentPack(CLIMATE.blanket.pileAt * 5)).toBe(CLIMATE.blanket.pile);
    expect(permanentPack(CLIMATE.blanket.pileAt / 2)).toBeCloseTo(CLIMATE.blanket.pile / 2, 6);
    // ...and it is the DEEPER of the two that a country wears, so the pile
    // is worth having at all.
    expect(CLIMATE.blanket.pile).toBeGreaterThan(CLIMATE.blanket.deep);
  });

  /** The campaign's own alpine circuit (`campaign-locations.ts`, "First
   * Light") — a country with a PERMANENT snowfield beside the road, which
   * is the one thing the three cases below are about. */
  const white = (): Track =>
    stageTrack(
      30,
      "medium",
      { biome: "alpine", elevation: 0.6, steepness: 0.6, asphalt: 0.5, altitude: 0.35 },
      "circuit",
      { season: "spring" },
    );

  it("gives the blanket an EDGE the ground lattice could never hold", () => {
    // R47 — the bank at a ploughed road's lip stands up over `verge`
    // metres, which is a fraction of a ground cell. Sampled on the ground's
    // own lattice it falls between two corners and is erased, and a winter
    // stage is flat white ground; on the snow's own grid it is a wall.
    const track = white();
    const terrain = stageTerrain(track);
    expect(terrain.snowy).toBe(true);
    const s = track.samples[40];
    const rx = Math.cos(s.heading);
    const rz = -Math.sin(s.heading);
    const blanketOut = (d: number): number => terrain.blanketAt(s.x - rx * d, s.z - rz * d);
    // Bare at the lip, and deep well inside ONE ground cell of it.
    let lip = -1;
    for (let d = 0; d < 40 && lip < 0; d += 0.5) if (blanketOut(d) > 0.05) lip = d;
    expect(lip).toBeGreaterThan(0);
    expect(blanketOut(lip + CLIMATE.blanket.verge * 1.5)).toBeGreaterThan(0.4);
    // The whole rise happens inside a fraction of a ground cell — which is
    // the property the blanket's own grid exists to buy.
    expect(CLIMATE.blanket.verge * 1.5).toBeLessThan(GROUND_CELL);
  });

  it("stands the car INSIDE the snow the world draws, at any sampling rate", () => {
    // The drawn coat and the surface the wheels are on compose the same two
    // numbers (`terrain-ground.ts`), so a finer mesh can never float over
    // the physics or sink under it.
    const track = white();
    const terrain = stageTerrain(track);
    const s = track.samples[40];
    const rx = Math.cos(s.heading);
    const rz = -Math.sin(s.heading);
    let checked = 0;
    for (let d = 30; d <= 60; d += 3) {
      const x = s.x - rx * d;
      const z = s.z - rz * d;
      const rest = terrain.blanketAt(x, z);
      if (rest < 0.2) continue;
      checked++;
      const drawn = terrain.latticeAt(x, z);
      const stood = terrain.groundAt(x, z);
      // The coat's top is the bare ground plus the whole blanket...
      expect(drawn).toBeCloseTo(terrain.bareLatticeAt(x, z) + rest, 6);
      // ...and the wheels stand `ride` of the way up it, ploughing the rest.
      expect(drawn - stood).toBeCloseTo(rest * (1 - CLIMATE.blanket.ride), 3);
    }
    expect(checked).toBeGreaterThan(3);
  });

  it("swallows a solid the snow has all but taken, not only one it has covered", () => {
    // R47 — a stone the blanket has swallowed is under the surface the car
    // is driving on, so it is neither hit nor drawn. The bar is what STANDS
    // OVER the drawn snow (`CLIMATE.blanket.bury`) rather than what the snow
    // happens to have covered: a stone with its last hand's breadth out of a
    // drift is white on white at rally pace, and a country that stops a car
    // on something it never showed is not a country anybody wants to drive.
    // The one list the contact model and the renderer's planting both read
    // is where it goes.
    const track = white();
    const terrain = stageTerrain(track);
    let seen = 0;
    let inSnow = 0;
    for (const s of track.samples) {
      terrain.sync(s.s);
      for (const ob of terrain.obstaclesNear(s.x, s.z, 60)) {
        seen++;
        if (terrain.blanketAt(ob.x, ob.z) <= 0) continue;
        inSnow++;
        expect(ob.y + ob.height - terrain.latticeAt(ob.x, ob.z)).toBeGreaterThanOrEqual(
          CLIMATE.blanket.bury,
        );
      }
    }
    expect(seen).toBeGreaterThan(10);
    expect(inSnow).toBeGreaterThan(10);
  });

  it("leaves nothing in the snow low enough to TRIP the car", () => {
    // The whole point of the bar: a solid whose top sits under the car's own
    // centre of mass catches the floor and rolls the car rather than
    // stopping it (`TUNING.collision.solids.tripTop`). On a green hillside
    // that is a dark lump with a line round it; under snow it is invisible,
    // so the survivors have to clear the trip height by construction.
    expect(CLIMATE.blanket.bury).toBeGreaterThan(TUNING.collision.solids.tripTop);
  });

  it("turns the rain to snow under freezing, and gives the desert a wet season", () => {
    expect(fallsAsSnow(2)).toBe(false);
    expect(fallsAsSnow(0)).toBe(true);
    expect(fallsAsSnow(-5)).toBe(true);
    expect(rainsIn("desert", "summer")).toBe(false);
    expect(rainsIn("desert", "winter")).toBe(true);
    expect(rainsIn("taiga", "summer")).toBe(true);
    expect(weathersIn("desert", "summer")).not.toContain("rain");
    expect(weathersIn("desert", "winter")).toContain("rain");
    expect(weathersIn("desert", "winter")).toContain("storm");
    expect(weathersIn("taiga", "winter")).toEqual(BIOMES.taiga.weathers);
  });

  it("grows the crystal the temperature asks for — Nakaya's ladder", () => {
    /** How much of the fall at `t` is one habit, 0..1. */
    const share = (t: number, habit: (typeof SNOW_HABITS)[number]): number =>
      snowHabits(t)[SNOW_HABITS.indexOf(habit)];
    /** …and how much of it is rods rather than plates and stars. */
    const rods = (t: number): number =>
      share(t, "needle") + share(t, "column") + share(t, "capped");

    for (const t of [1, 0, -2, -6, -10, -15, -20, -30, -60]) {
      const w = snowHabits(t);
      expect(w).toHaveLength(SNOW_HABITS.length);
      expect(w.reduce((sum, v) => sum + v, 0)).toBeCloseTo(1, 6);
      expect(Math.min(...w)).toBeGreaterThanOrEqual(0);
    }

    // The three rungs of the diagram, each judged against its neighbours
    // rather than against a number: just under freezing the air makes
    // plates, the rod band in the middle makes needles and columns, and
    // around -15 it makes the six-armed crystals of the word.
    expect(share(-1, "plate")).toBeGreaterThan(share(-1, "dendrite"));
    expect(rods(-6.5)).toBeGreaterThan(0.5);
    expect(rods(-6.5)).toBeGreaterThan(rods(-1));
    expect(rods(-6.5)).toBeGreaterThan(rods(-15));
    expect(share(-15, "dendrite") + share(-15, "fern")).toBeGreaterThan(
      share(-6.5, "dendrite") + share(-6.5, "fern"),
    );
    // The flip back at the bitter end: no branches left, and what falls is
    // the diamond dust of small plates and columns.
    expect(share(-30, "fern")).toBe(0);
    expect(share(-30, "plate") + share(-30, "column")).toBeCloseTo(1, 6);

    // No band is ever ONE SHAPE — the crystals landing together grew
    // through several degrees of the same cloud — so a sheet at any
    // temperature is a mix rather than a repeated sprite. Three habits is
    // the floor, and it holds at the bitter end too.
    for (const t of [0, -2, -6, -10, -15, -20, -30, -50]) {
      expect(snowHabits(t).filter((v) => v > 0.02).length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...snowHabits(t))).toBeLessThan(0.75);
    }
    // …and the rod band overlaps its neighbours on both sides rather than
    // switching on at an edge, which is what stops a stage a degree either
    // side of it looking like a different game.
    for (const t of [-2, -6, -10]) expect(rods(t)).toBeGreaterThan(0);

    // The roll walks the same weights: every roll lands on a real habit,
    // and a habit with no weight is never drawn.
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const at = rollSnowHabit(-15, roll);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(SNOW_HABITS.length);
      expect(snowHabits(-15)[at]).toBeGreaterThan(0);
    }
  });
});

describe("a stage in winter", () => {
  const SEED = 11;
  const summer = () => stageTrack(SEED, "short", { biome: "taiga" });
  const winter = () => stageTrack(SEED, "short", { biome: "taiga" }, "sprint", MILD);

  it("is the same road, made of snow wherever it was loose", () => {
    const a = summer();
    const b = winter();
    expect(b.climate).toEqual({ ...MILD, lapse: CLIMATE.lapse });
    // The claim below is a claim about a country with no ice on it: a cold
    // that freezes the lakes moves the ROUTE (R48), which is the whole
    // point of `tests/ice_test.ts` and the reason this fixture is mild.
    expect(icyCountry(b.climate, BIOMES.taiga.land.zones)).toBe(false);
    expect(defaultTemperature("taiga", "winter")).toBeLessThan(CLIMATE.ice);
    expect(b.samples.length).toBe(a.samples.length);
    let snow = 0;
    for (let i = 0; i < a.samples.length; i++) {
      const s = a.samples[i];
      const w = b.samples[i];
      expect(w.x).toBe(s.x);
      expect(w.z).toBe(s.z);
      expect(w.elevation).toBe(s.elevation);
      if (s.surface === "water" || s.deck !== null || s.tunnel) {
        expect(w.surface).toBe(s.surface);
      } else if (s.surface === "asphalt") {
        // A sealed road is ploughed and salted: tarmac in every season.
        expect(w.surface).toBe("asphalt");
        expect(w.bite).toBe(1);
      } else {
        expect(isLoose(s.surface)).toBe(true);
        expect(w.surface).toBe("snow");
        expect(w.bite).toBeGreaterThan(CLIMATE.bite.glaze - 1e-9);
        expect(w.bite).toBeLessThan(CLIMATE.bite.cold + 1e-9);
        snow++;
      }
      expect(s.bite).toBe(1);
    }
    expect(snow).toBeGreaterThan(a.samples.length / 2);
  });

  it("lies deep beside the road and not on it, and the car rides sunk into it", () => {
    const track = winter();
    const terrain = stageTerrain(track);
    const dry = stageTerrain(summer());
    const out = track.width / 2 + 40;
    const { x, z, i } = beside(track, out);
    const depth = terrain.blanketAt(x, z);
    expect(depth).toBeGreaterThanOrEqual(CLIMATE.blanket.shallow - 1e-6);
    expect(depth).toBeLessThanOrEqual(CLIMATE.blanket.deep + 1e-6);
    // The drawn ground is the top of the snow; the wheels stand `ride` of
    // the way down into it.
    const drawn = terrain.latticeAt(x, z);
    const ridden = terrain.groundAt(x, z);
    expect(drawn - ridden).toBeCloseTo(depth * (1 - CLIMATE.blanket.ride), 6);
    // ...and the bare country under both is the summer's.
    expect(drawn - depth).toBeCloseTo(dry.latticeAt(x, z), 6);
    // On the road there is no BLANKET — that is the country's, and the
    // corridor is cleared of it. What the road carries is its own cover
    // (R47, `TrackSample.snow`): a fraction of the blanket, because it has
    // been bladed and driven, and standing over the summer's ribbon rather
    // than instead of it.
    const s = track.samples[i];
    expect(terrain.blanketAt(s.x, s.z)).toBe(0);
    expect(s.snow).toBeGreaterThan(0);
    expect(s.snow).toBeLessThan(depth);
    const lying = packedDepth(s.snow, wearAt(0, s.width));
    expect(terrain.groundAt(s.x, s.z)).toBeCloseTo(dry.groundAt(s.x, s.z) + lying, 6);
    // A summer country has none anywhere.
    expect(dry.blanketAt(x, z)).toBe(0);
  });

  it("is a snowfield to the car once it leaves the road", () => {
    const track = winter();
    const state = createGame({ seed: SEED, track, skipCountdown: true });
    const { x, z } = beside(track, track.width / 2 + 30);
    state.car.x = x;
    state.car.z = z;
    state.car.y = state.terrain.groundAt(x, z);
    state.car.vy = 0;
    for (let k = 0; k < 30; k++) step(state, NEUTRAL_INPUT);
    expect(state.offRoad).toBe(true);
    expect(state.surface).toBe("snowfield");
    // Stood on the packed snow, under the drawn surface.
    expect(state.car.y).toBeLessThan(state.terrain.latticeAt(state.car.x, state.car.z));
  });

  it("leaves the desert green, and wet", () => {
    const track = stageTrack(SEED, "short", { biome: "desert" }, "sprint", WINTER);
    const terrain = stageTerrain(track);
    expect(track.samples.some((s) => s.surface === "snow")).toBe(false);
    const { x, z } = beside(track, track.width / 2 + 40);
    expect(terrain.blanketAt(x, z)).toBe(0);
    expect(terrain.groundAt(x, z)).toBeCloseTo(terrain.latticeAt(x, z), 6);
  });

  it("is still a stage the bot finishes", () => {
    const r = simulateStage({
      seed: SEED,
      length: "short",
      knobs: { biome: "taiga" },
      season: "winter",
      maxTime: 400,
    });
    expect(r.finished).toBe(true);
    expect(r.time).toBeGreaterThan(30);
  });
});
