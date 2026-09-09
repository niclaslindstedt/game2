// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R48 — THE ICE: standing water frozen solid by the cold (climate.ts), the
// ground it becomes, and the rally routed across it.
//
// Its own topic rather than more of `winter_test.ts`, because it is the one
// thing about a winter that moves the ROAD: everything in that file is a
// claim about a stage whose line the season left alone, and everything here
// is a claim about a line the cold redrew.

import { describe, expect, it } from "vitest";

import {
  BIOMES,
  CLIMATE,
  NEUTRAL_INPUT,
  STAGE_RULES,
  TUNING,
  createGame,
  createLandField,
  icyCountry,
  resolveClimate,
  resolveKnobs,
  simulateStage,
  step,
  streamFrozen,
  temperatureAt,
  waterFrozen,
  type Track,
} from "@engine";

import { stageTerrain, stageTrack } from "./support/stages.ts";

/** Cold enough for the MOVING water too (`CLIMATE.river`) — a river asks
 * for a good deal more than a lake, so the reaches only start closing well
 * under `DEEP`. Wet, so there is river to close: the water dial buys the
 * courses the freeze is about. */
const HARD = { season: "winter" as const, temperature: -25 };
const WET = { biome: "taiga" as const, water: 0.8 };

/** Cold enough that every body in the taiga is over: the country's ceiling
 * stands 52 m over the datum, so a datum at -20 puts the whole of it — and
 * every lake in it — a long way under `CLIMATE.ice`. */
const DEEP = { season: "winter" as const, temperature: -20 };
const KNOBS = { biome: "taiga" as const };

/** The seeds the crossings are looked for over. A wide sweep on purpose:
 * whether a given country HAS a lake the route wants is the country's
 * business, and a list holding one qualifying seed is a pinned seed wearing
 * a search's clothes. */
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Every stage in the sweep that ended up with ice under it, and the first
 * of them — which is what most of the road tests below want. */
function icyStages(): Track[] {
  return SEEDS.map((seed) => stageTrack(seed, "medium", KNOBS, "sprint", DEEP)).filter((track) =>
    track.samples.some((s) => s.surface === "ice"),
  );
}

/** The road's own radius at a sample, m — the centreline's heading turned
 * over the arc either side of it. Infinity on a straight. Measured over ten
 * metres, which is well inside one segment, so a reading is that segment's
 * corner and never a blend of two. */
function radiusAt(track: Track, i: number): number {
  const w = 5;
  const a = track.samples[i - w];
  const b = track.samples[i + w];
  let turned = b.heading - a.heading;
  while (turned > Math.PI) turned -= 2 * Math.PI;
  while (turned < -Math.PI) turned += 2 * Math.PI;
  return turned === 0 ? Infinity : Math.abs((b.s - a.s) / turned);
}

describe("the freeze", () => {
  it("takes a body at CLIMATE.ice and leaves it alone a degree warmer", () => {
    const climate = { season: "winter" as const, temperature: 0 };
    // The air at the datum is 0; the ice line is where it reaches -5.
    const line = -CLIMATE.ice / CLIMATE.lapse;
    expect(temperatureAt(climate, line)).toBeCloseTo(CLIMATE.ice, 9);
    expect(waterFrozen(climate, line)).toBe(true);
    expect(waterFrozen(climate, line + 1)).toBe(true);
    expect(waterFrozen(climate, line - 1)).toBe(false);
  });

  it("is asked of the BODY's own height, so a tarn goes over before the lake below it", () => {
    // A datum warm enough to leave a low body open and a high one frozen:
    // the freeze is a field, not a switch on the stage.
    const climate = resolveClimate(
      { season: "winter", temperature: -4 },
      resolveKnobs({ biome: "alpine" }),
    );
    expect(waterFrozen(climate, 0)).toBe(false);
    expect(waterFrozen(climate, 300)).toBe(true);
  });

  it("leaves every summer country's water open", () => {
    for (const id of Object.keys(BIOMES) as (keyof typeof BIOMES)[]) {
      const climate = resolveClimate({ season: "summer" }, resolveKnobs({ biome: id }));
      expect(icyCountry(climate, BIOMES[id].land.zones)).toBe(false);
    }
  });
});

describe("the land under a frozen country", () => {
  const knobs = resolveKnobs(KNOBS);

  it("hands the route a floor where the summer handed it a lake", () => {
    const cold = createLandField(7, knobs, resolveClimate(DEEP, knobs));
    const warm = createLandField(7, knobs);
    let onWater = 0;
    for (let x = -1200; x <= 1200; x += 40) {
      for (let z = -1200; z <= 1200; z += 40) {
        if (!warm.flooded(x, z)) continue;
        onWater++;
        // The same water, at the same level — the cold changes what it IS,
        // never where it is or how high it stands.
        expect(cold.iceAt(x, z)).toBe(warm.water.levelAt(x, z));
        // ...so the setback that keeps a road off open water no longer
        // sees it, while the plain one still does.
        // The pour works on 32 m cells, so the radius has to clear one for
        // the contrast to be about the FREEZE rather than about a point
        // that happens to sit between two wet cells.
        expect(cold.nearOpenWater(x, z, 64)).toBe(false);
        expect(cold.nearWater(x, z, 64)).toBe(true);
      }
    }
    expect(onWater).toBeGreaterThan(0);
    expect(warm.iceAt(0, 0)).toBe(null);
  });

  it("lays the road ON the sheet rather than filling up off the bed", () => {
    const cold = createLandField(7, knobs, resolveClimate(DEEP, knobs));
    for (let x = -1200; x <= 1200; x += 40) {
      for (let z = -1200; z <= 1200; z += 40) {
        const ice = cold.iceAt(x, z);
        if (ice === null) continue;
        // The bed is under the sheet, and the sheet is what a road stands
        // on: measured against the bed, a crossing would read as an
        // embankment nobody built.
        expect(cold.heightAt(x, z)).toBeLessThan(ice);
        expect(cold.openShoreLevelAt(x, z)).toBe(null);
        return;
      }
    }
    throw new Error("no frozen water in the sweep");
  });
});

describe("a stage over frozen water", () => {
  it("crosses lakes a summer would have gone round", () => {
    // A handful of the sweep, not all of it: whether a country has a lake
    // where the route wants one, low enough at its shore to go on at
    // (`STAGE_RULES.ice.lift`), is the country's business. What is being
    // asserted is that the crossings happen at all and that the cold is
    // what makes them.
    const icy = icyStages();
    expect(icy.length).toBeGreaterThanOrEqual(3);
    // ...and a summer's stages cross none: the ice is what changed the line.
    for (const seed of SEEDS) {
      const warm = stageTrack(seed, "medium", KNOBS);
      expect(warm.samples.some((s) => s.surface === "ice")).toBe(false);
    }
  });

  it("stands its ice samples ON the sheet, not on fill over it", () => {
    const track = icyStages()[0];
    const land = createLandField(track.seed, track.knobs, track.climate);
    let checked = 0;
    for (const s of track.samples) {
      if (s.surface !== "ice") continue;
      checked++;
      const sheet = land.iceAt(s.x, s.z);
      expect(sheet).not.toBe(null);
      expect(land.frozen(sheet as number)).toBe(true);
      // The sheet is FLAT and the road is on it, within the band the rule
      // book calls being on it rather than banked over it.
      expect(Math.abs(s.elevation - (sheet as number))).toBeLessThanOrEqual(
        STAGE_RULES.ice.onSheet,
      );
      // Ice is a surface of its own, so the snow's temperature multiplier
      // has nothing to say about it.
      expect(s.bite).toBe(1);
      expect(s.deck).toBe(null);
      expect(s.tunnel).toBe(false);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("is a floor to the terrain beside the road, with nothing left to drown in", () => {
    const track = icyStages()[0];
    const terrain = stageTerrain(track);
    const land = createLandField(track.seed, track.knobs, track.climate);
    let checked = 0;
    for (const s of track.samples) {
      if (s.surface !== "ice") continue;
      // Out past the road's own shoulder, where the corridor has stopped
      // shaping the ground and the lake is the lake again.
      for (const out of [40, -40]) {
        const x = s.x + Math.cos(s.heading) * out;
        const z = s.z - Math.sin(s.heading) * out;
        const sheet = land.iceAt(x, z);
        if (sheet === null) continue;
        checked++;
        expect(terrain.iceAt(x, z)).toBe(sheet);
        expect(terrain.frozenWater(sheet)).toBe(true);
        // Nothing to drown in, and the car stands on the sheet rather than
        // on the bed metres under it.
        expect(terrain.waterAt(x, z)).toBe(null);
        // To a few centimetres: R16's hand-over still leans the ground a
        // little toward the ribbon at this distance, and that seam is the
        // one thing about the surface under the car that is not the sheet.
        expect(terrain.groundAt(x, z)).toBeCloseTo(sheet, 1);
        expect(land.heightAt(x, z)).toBeLessThan(sheet);
        // The blanket keeps off it: a lake is swept by the wind, not
        // white. What is left is the lattice interpolating across the
        // shore — centimetres, well under the depth at which the ground
        // starts counting as a snowfield.
        expect(terrain.blanketAt(x, z)).toBeLessThan(0.1);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("keeps every hard corner off the sheet", () => {
    let onIce = 0;
    for (const track of icyStages()) {
      for (let i = 5; i < track.samples.length - 5; i++) {
        if (track.samples[i].surface !== "ice") continue;
        onIce++;
        expect(radiusAt(track, i)).toBeGreaterThanOrEqual(STAGE_RULES.ice.minRadius - 1);
      }
    }
    expect(onIce).toBeGreaterThan(0);
    // The rule is a real constraint and not a vacuous one: the stages it is
    // holding do draw corners far tighter than this, off the ice.
    expect(STAGE_RULES.ice.minRadius).toBeGreaterThan(STAGE_RULES.turn.medium.radius.max);
    expect(STAGE_RULES.ice.minRadius).toBeLessThanOrEqual(STAGE_RULES.turn.soft.radius.max);
  });

  it("is a surface the car stands on, and the slipperiest one there is", () => {
    const track = icyStages()[0];
    const i = track.samples.findIndex((s) => s.surface === "ice");
    const state = createGame({ seed: 1, track, skipCountdown: true });
    const s = track.samples[i];
    state.car.x = s.x;
    state.car.z = s.z;
    state.car.heading = s.heading;
    state.car.y = state.terrain.groundAt(s.x, s.z);
    state.car.vy = 0;
    for (let k = 0; k < 30; k++) step(state, NEUTRAL_INPUT);
    expect(state.surface).toBe("ice");
    expect(state.drowning).toBe(null);
    const G = TUNING.surfaces;
    expect(G.grip.ice).toBeLessThan(G.grip.snow);
    expect(G.grip.ice).toBeLessThan(G.grip.snowfield);
    expect(G.breakaway.ice).toBeGreaterThan(G.breakaway.snow);
    // A lake is a floor: it takes almost nothing out of a car that comes
    // down on it, where the snow beside it takes most.
    expect(G.give.ice).toBeLessThan(G.give.snow);
  });

  it("is still a stage the bot finishes", () => {
    const seed = SEEDS.find((s) =>
      stageTrack(s, "medium", KNOBS, "sprint", DEEP).samples.some((x) => x.surface === "ice"),
    ) as number;
    const r = simulateStage({
      seed,
      length: "medium",
      knobs: KNOBS,
      season: "winter",
      temperature: DEEP.temperature,
      maxTime: 600,
    });
    expect(r.finished).toBe(true);
    expect(r.time).toBeGreaterThan(30);
  });
});

describe("R48 — the moving water", () => {
  const R = CLIMATE.river;

  it("asks a POOL for more cold than a lake, and gets it at river.quiet", () => {
    const climate = { season: "winter" as const, temperature: 0 };
    const quiet = -R.quiet / CLIMATE.lapse;
    expect(temperatureAt(climate, quiet)).toBeCloseTo(R.quiet, 9);
    expect(streamFrozen(climate, quiet, 0)).toBe(true);
    expect(streamFrozen(climate, quiet - 1, 0)).toBe(false);
    // ...and the lake at the same height went over long before it did: a
    // river is stirred, and stirred water gives its heat up slowly.
    expect(waterFrozen(climate, quiet)).toBe(true);
    expect(R.quiet).toBeLessThan(CLIMATE.ice);
  });

  it("wants it colder the faster the reach runs, and never closes a rapid", () => {
    const deep = { season: "winter" as const, temperature: R.hard };
    const middling = { season: "winter" as const, temperature: (R.quiet + R.hard) / 2 };
    // At the bottom of the ladder everything under the open fall goes.
    expect(streamFrozen(deep, 0, 0)).toBe(true);
    expect(streamFrozen(deep, 0, R.open * 0.99)).toBe(true);
    // Halfway down it, only the gentler half of that.
    expect(streamFrozen(middling, 0, R.open * 0.4)).toBe(true);
    expect(streamFrozen(middling, 0, R.open * 0.7)).toBe(false);
    // ...and a rapid stands open however cold the air gets, which is what
    // an open lead below a drop is.
    expect(streamFrozen({ season: "winter", temperature: -80 }, 0, R.open)).toBe(false);
    expect(streamFrozen({ season: "winter", temperature: -80 }, 0, R.open * 2)).toBe(false);
  });

  it("is asked at the water's own level, so a reach on a shoulder goes first", () => {
    const climate = resolveClimate(
      { season: "winter", temperature: R.quiet + 4 },
      resolveKnobs({ biome: "alpine" }),
    );
    expect(streamFrozen(climate, 0, 0)).toBe(false);
    expect(streamFrozen(climate, 300, 0)).toBe(true);
  });
});

/** Every stage in the sweep whose river the cold actually closed, with the
 * reaches it closed — searched rather than pinned, because whether a seed
 * has a slow reach is the country's business (see SEEDS above). */
function frozenReaches(): { track: Track; frozen: number; open: number }[] {
  const out: { track: Track; frozen: number; open: number }[] = [];
  for (const seed of SEEDS) {
    const track = stageTrack(seed, "medium", WET, "sprint", HARD);
    const streams = stageTerrain(track).streams;
    const frozen = streams.filter((s) => s.frozen).length;
    if (frozen > 0) out.push({ track, frozen, open: streams.length - frozen });
  }
  return out;
}

describe("a river under a hard winter", () => {
  it("closes its slow reaches and leaves its fast ones running", () => {
    const iced = frozenReaches();
    expect(iced.length).toBeGreaterThanOrEqual(3);
    // Not ALL of it: a stage whose every reach went over would mean the
    // fall had stopped mattering, which is the half of the rule that keeps
    // a waterfall from being a pavement.
    expect(iced.some((r) => r.open > 0)).toBe(true);
    // ...and a summer closes nothing at all, on any of them.
    for (const seed of SEEDS) {
      const warm = stageTerrain(stageTrack(seed, "medium", WET));
      expect(warm.streams.some((s) => s.frozen)).toBe(false);
    }
  });

  it("turns a closed reach into ground with nothing left to drown in", () => {
    const { track } = frozenReaches()[0];
    const terrain = stageTerrain(track);
    let checked = 0;
    for (const stream of terrain.streams) {
      if (!stream.frozen) continue;
      for (const p of stream.points) {
        const sheet = terrain.iceAt(p.x, p.z);
        if (sheet === null) continue;
        checked++;
        // The sheet stands at the water's own surface — the freeze changes
        // what the reach IS, never where it runs or how high it lies.
        expect(sheet).toBeCloseTo(p.y, 6);
        expect(terrain.waterAt(p.x, p.z)).toBe(null);
        expect(terrain.groundAt(p.x, p.z)).toBeCloseTo(sheet, 1);
        // Swept, like a lake: the blanket keeps off the channel.
        expect(terrain.blanketAt(p.x, p.z)).toBeLessThan(0.1);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("holds the FORD open, so the road the compiler called water still is", () => {
    // A crossing the stage wades is broken open by whatever uses it, and
    // the road laid through it is water to the compiler: a sheet the
    // physics called ground there would be a car driving on ice down a
    // road that says it is wading.
    let fords = 0;
    for (const { track } of frozenReaches()) {
      const terrain = stageTerrain(track);
      for (const s of track.samples) {
        if (s.surface !== "water") continue;
        fords++;
        expect(terrain.iceAt(s.x, s.z)).toBe(null);
      }
    }
    expect(fords).toBeGreaterThan(0);
  });

  it("is still a stage the bot finishes", () => {
    const { track } = frozenReaches()[0];
    const r = simulateStage({
      seed: track.seed,
      length: "medium",
      knobs: WET,
      season: "winter",
      temperature: HARD.temperature,
      maxTime: 600,
    });
    expect(r.finished).toBe(true);
  });
});
