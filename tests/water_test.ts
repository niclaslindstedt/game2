// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The WATER, and the rules of nature it obeys (R18) — plus the crossings
// the road makes over it (R13). The point of these is that water in a
// generated world is the thing players read as "real" or "fake" fastest: a
// river that runs uphill, or three parallel rivers where a valley would
// hold one, gives the whole landscape away.
import { describe, expect, it } from "vitest";

import {
  LAKE_Y,
  NEUTRAL_INPUT,
  STAGE_RULES as R,
  TUNING,
  collectAnchors,
  compileStage,
  createGame,
  createTerrain,
  step,
  traceRivers,
  type GameEvent,
  type GameState,
} from "@engine";

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34];

describe("crossings (R13)", () => {
  it("wades the narrow ones and decks the wide ones", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.8 });
      for (const s of track.samples) {
        if (s.deck !== null) {
          // A deck is ROAD, not water: the wheels stay dry and the surface
          // keeps its grip.
          expect(s.surface).not.toBe("water");
        }
      }
      // A deck holds the road LEVEL across the gap — that is what makes it
      // a bridge instead of a dip with a river in it.
      let i = 0;
      while (i < track.samples.length) {
        if (track.samples[i].deck === null) {
          i++;
          continue;
        }
        let j = i;
        while (j < track.samples.length && track.samples[j].deck !== null) j++;
        const heights = track.samples.slice(i, j).map((s) => s.elevation);
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.01);
        i = j;
      }
    }
  });

  it("runs the water far enough under a deck to drown a car that goes over the side", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.9 });
      const anchors = collectAnchors(track, 0);
      for (const anchor of anchors.filter((a) => a.bridged)) {
        const deck = track.samples.find((s) => Math.abs(s.s - anchor.s) < 2);
        expect(deck).toBeDefined();
        const clearance = (deck?.elevation ?? 0) - anchor.waterY;
        expect(clearance).toBeGreaterThanOrEqual(R.bridge.clearance.timber - 0.01);
        expect(anchor.depth).toBeGreaterThan(0.9); // TUNING.crash.deepWater
      }
    }
  });
});

describe("the river (R18)", () => {
  it("never runs uphill", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.8 });
      const terrain = createTerrain(track);
      const rivers = traceRivers(track.seed, collectAnchors(track, 0), terrain.heightAt, LAKE_Y);
      for (const river of rivers) {
        for (let i = 1; i < river.points.length; i++) {
          expect(river.points[i].y).toBeLessThanOrEqual(river.points[i - 1].y + 1e-9);
        }
      }
    }
  });

  it("gathers as it goes: a river is wider at its mouth than at its spring", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.8 });
      const terrain = createTerrain(track);
      for (const river of traceRivers(
        track.seed,
        collectAnchors(track, 0),
        terrain.heightAt,
        LAKE_Y,
      )) {
        const spring = river.points[0];
        const mouth = river.points[river.points.length - 1];
        expect(mouth.halfWidth).toBeGreaterThan(spring.halfWidth);
      }
    }
  });

  it("crosses the road at the level the road was built for", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "medium", { water: 0.8 });
      const terrain = createTerrain(track);
      for (const anchor of collectAnchors(track, 0)) {
        const water = terrain.waterAt(anchor.x, anchor.z);
        expect(water).not.toBeNull();
        // ...unless the crossing stands in country already under the water
        // table, where the lake IS the water the road crosses.
        const level = water ?? 0;
        expect(Math.abs(level - anchor.waterY) < 1.2 || level === LAKE_Y).toBe(true);
      }
    }
  });

  it("meets each crossing ONCE: the road's water is one course, not a fan of them", () => {
    // Every crossing belongs to exactly one traced watercourse, and a
    // stage's crossings collapse into far fewer courses than crossings —
    // which is the difference between a river a road meets three times and
    // three rivers that happen to be parallel.
    let crossings = 0;
    let courses = 0;
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.9 });
      const terrain = createTerrain(track);
      const anchors = collectAnchors(track, 0);
      const rivers = traceRivers(track.seed, anchors, terrain.heightAt, LAKE_Y);
      const claimed = rivers.flatMap((r) => r.anchors);
      expect(claimed.length).toBe(anchors.length);
      crossings += anchors.length;
      courses += rivers.length;
    }
    expect(crossings).toBeGreaterThan(courses);
  });

  it("crosses a road where the road crosses it, and nowhere else", () => {
    // A watercourse routed under the corridor between two crossings carves
    // the ground out from under the ribbon and draws a sheet of water
    // through it — the road standing on a bank of nothing, which is what
    // "the water is below the road" looks like from the driver's seat.
    let flooded = 0;
    let dry = 0;
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.9 });
      const terrain = createTerrain(track);
      const anchors = collectAnchors(track, 0);
      for (const s of track.samples) {
        // The crossings themselves are water at the road ON PURPOSE, and
        // so is the last of the road that eases down into a ford.
        if (s.surface === "water" || s.deck !== null) continue;
        const toCrossing = Math.min(
          ...anchors.map((a) => Math.hypot(a.x - s.x, a.z - s.z)),
          Infinity,
        );
        if (toCrossing < 60) continue;
        if (terrain.waterAt(s.x, s.z) !== null) flooded += 1;
        else dry += 1;
      }
    }
    expect(dry).toBeGreaterThan(1000);
    expect(flooded).toBe(0);
  });

  it("keeps the water under the ground the car rides, never over it", () => {
    // The physics and the renderer both ask the field what is water. A
    // channel too narrow for the ground lattice to hold runs UNDER a
    // hillside the tiles never dip into: answering "water" up there drowns
    // a car driving over a mountain, and draws a slab of water on it.
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.9 });
      const terrain = createTerrain(track);
      const b = track.bounds;
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 40; j++) {
          const x = b.minX + ((b.maxX - b.minX) * i) / 39;
          const z = b.minZ + ((b.maxZ - b.minZ) * j) / 39;
          const water = terrain.waterAt(x, z);
          if (water === null) continue;
          // Out in the country, where the ground the car rides IS the
          // ground: over a road the surface under the wheels is the
          // ribbon, and a bridge deck stands metres over the river it
          // spans on purpose (R13).
          if (terrain.roadDistanceAt(x, z) < track.width / 2 + 12) continue;
          expect(terrain.groundAt(x, z)).toBeLessThan(water + 0.25);
        }
      }
    }
  });

  it("answers the water dial, from dry country to lakeland", () => {
    const wetness = (water: number): number => {
      let wet = 0;
      let n = 0;
      for (const seed of [1, 3, 5]) {
        const track = compileStage(seed, "medium", { water });
        const terrain = createTerrain(track);
        const b = track.bounds;
        for (let i = 0; i < 24; i++) {
          for (let j = 0; j < 24; j++) {
            const x = b.minX + ((b.maxX - b.minX) * i) / 23;
            const z = b.minZ + ((b.maxZ - b.minZ) * j) / 23;
            n += 1;
            if (terrain.heightAt(x, z) < LAKE_Y) wet += 1;
          }
        }
      }
      return wet / n;
    };
    const dry = wetness(0);
    const middling = wetness(0.5);
    const lakeland = wetness(1);
    expect(dry).toBeLessThan(middling);
    expect(middling).toBeLessThan(lakeland);
  });
});

describe("going under (TUNING.crash.drown)", () => {
  /** Drive a run straight off the side until it finds water deep enough to
   * drown in, and hand back the state at the moment the water took it. The
   * lakeland dial is turned up so there IS water to find. */
  /** Seeds to look for a lake in, in order — these lead with ones whose
   * water is known to be deep enough to submerge a car, so the search below
   * usually stops at the first. It is an ORDER and not a guarantee:
   * `crash.deepWater` is a low bar a car meets in a puddle at a lakeshore,
   * and which shelf it ends up on is decided by the handling that carried
   * it there. `swallows` is what actually holds the scenario still. */
  const DROWNING_SEEDS = [34, 26, ...SEEDS];

  /** Off the road under full throttle and hard lock, until the car is in
   * water deep enough to be drowning in it. Returns the step that put it
   * there. */
  function plunge(seed: number): { state: GameState; entry: GameEvent[] } | null {
    const state = createGame({ seed, length: "long", skipCountdown: true, knobs: { water: 1 } });
    // Hard lock and full throttle: off the road, across the verge, and
    // into whatever the seed put beside it.
    const input = { ...NEUTRAL_INPUT, throttle: 1, steer: 1 };
    for (let i = 0; i < 120 * 60; i++) {
      const entry = step(state, input);
      if (state.drowning) return { state, entry };
    }
    return null;
  }

  /** ...and does that water actually close over the roof? The car sinks to
   * the BED (step.ts), so a shelf shallower than the roof leaves it settled
   * with its cabin in the air — a real outcome, and not the one these tests
   * are about. WHICH shelf it ends up on is decided by the handling that
   * carried it in there, so a scenario that does not check this silently
   * becomes a different scenario every time the car's cornering changes,
   * and "it went under, roof and all" starts failing on a car sitting in a
   * puddle. Run on a throwaway state; the drive is deterministic, so the
   * real one replays it exactly. */
  function swallows(seed: number): boolean {
    const attempt = plunge(seed);
    if (!attempt) return false;
    const { state } = attempt;
    for (let i = 0; i < Math.round(TUNING.crash.drown.duration / TUNING.dt); i++) {
      if (state.drowning?.under) return true;
      step(state, NEUTRAL_INPUT);
    }
    return false;
  }

  /** Found once and reused — the answer cannot change within a run. */
  let deepSeed: number | undefined;

  function driveIntoDeepWater(): { state: GameState; entry: GameEvent[] } {
    deepSeed ??= DROWNING_SEEDS.find(swallows);
    if (deepSeed === undefined) throw new Error("no seed put deep enough water beside the road");
    const attempt = plunge(deepSeed);
    if (!attempt) throw new Error(`seed ${deepSeed} no longer drowns the car`);
    return attempt;
  }

  it("holds the car in the water instead of teleporting it off the lake", () => {
    const { state, entry } = driveIntoDeepWater();
    const types = entry.map((e) => e.type);
    // The entry is a crash and a deep splash — and NOT a respawn, which is
    // the whole change: the run is lost, the car is still in the lake.
    expect(types).toContain("crash");
    expect(types).not.toContain("respawn");
    // A car that wades in off a shore books the shallows' splash and the
    // deep one on the SAME step, so the deep one is the one to look for
    // rather than the first one in the list.
    const splashes = entry.filter((e) => e.type === "splash");
    expect(splashes.some((e) => e.deep)).toBe(true);
    expect(state.drowning).not.toBeNull();
  });

  it("floats it at the waterline, then sinks it, and only then brings it home", () => {
    const { state } = driveIntoDeepWater();
    const D = TUNING.crash.drown;
    const waterY = state.drowning?.waterY ?? 0;
    const since = state.drowning?.since ?? 0;

    let sank = 0;
    let respawned = 0;
    let floatDepth = -Infinity;
    let deepest = Infinity;
    for (let i = 0; i < Math.round((D.duration + 0.5) / TUNING.dt); i++) {
      const age = state.t - since;
      // Through the float the hull rides its waterline: within half a metre
      // of the surface, bobbing, never gone.
      if (state.drowning && age > 0.9 && age < D.float) {
        floatDepth = Math.max(floatDepth, waterY - state.car.y);
      }
      if (state.drowning) deepest = Math.min(deepest, state.car.y);
      for (const ev of step(state, { ...NEUTRAL_INPUT, throttle: 1, steer: -1 })) {
        if (ev.type === "sink") sank += 1;
        if (ev.type === "respawn") respawned += 1;
      }
    }
    // Under the surface, but only just: sills awash, not gone. The lower
    // bound also keeps the assertion from passing on a window the loop
    // never actually visited.
    expect(floatDepth).toBeGreaterThan(0);
    expect(floatDepth).toBeLessThan(D.draft + 0.5);
    // It went under once, roof and all...
    expect(sank).toBe(1);
    expect(deepest).toBeLessThan(waterY - D.roof);
    // ...and the crew arrived exactly once, at the far end.
    expect(respawned).toBe(1);
    expect(state.drowning).toBeNull();
  });

  it("ignores the driver for the whole penalty — the seconds are the point", () => {
    const { state } = driveIntoDeepWater();
    const D = TUNING.crash.drown;
    const since = state.drowning?.since ?? 0;
    const raceAtEntry = state.raceTime;
    // Everything the panicking driver can reach, including the reset that
    // normally drags a wandering car home on the spot.
    const mashing = {
      ...NEUTRAL_INPUT,
      throttle: 1,
      brake: 1,
      handbrake: true,
      boost: true,
      reset: true,
    };
    let home = 0;
    while (state.t - since < D.duration - TUNING.dt) {
      for (const ev of step(state, mashing)) if (ev.type === "respawn") home += 1;
      expect(state.drowning, `t=${(state.t - since).toFixed(2)}`).not.toBeNull();
    }
    expect(home).toBe(0);
    // ...and the clock never stopped while it was ignoring them: the whole
    // penalty is charged to the run, which is what makes it one.
    expect(state.raceTime - raceAtEntry).toBeCloseTo(D.duration, 3);
    step(state, mashing);
    expect(state.drowning).toBeNull();
  });
});
