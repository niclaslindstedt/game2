// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The WATER, and the rules of nature it obeys (R18) — plus the crossings
// the road makes over it (R13). The point of these is that water in a
// generated world is the thing players read as "real" or "fake" fastest: a
// river that runs uphill, or three parallel rivers where a valley would
// hold one, gives the whole landscape away.
import { describe, expect, it } from "vitest";

import {
  LAKE_Y,
  STAGE_RULES as R,
  collectAnchors,
  compileStage,
  createTerrain,
  traceRivers,
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
