// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The BARE LANDSCAPE: the country before anybody laid a road across it —
// the ground surface of the layered geology (R32), the water standing on
// it (R35), and both read the way a road builder reads a map.
//
// It lives on its own, apart from the terrain field that shapes itself
// around the road, because two things need it and only one of them is the
// terrain. The other is the road NETWORK: a branch leaving a junction has
// to know where the water is before it drives into it, and a road built on
// an embankment across a lake — ending in mid-air over open water — is a
// mistake you can see from a kilometer up. Deterministic in the seed and
// the dials, and nothing else: the same country every time.
//
// The ORDER here is the point. The geology makes the ground, the pour
// works out what water stands on it, and only then does anything ask where
// a road could go. Water that is decided after the road — or worse, BY the
// road — agrees with the road by construction, and a generator arranged
// that way cannot tell the difference between a stage that runs along a
// lake shore and one that runs straight through the lake.
//
// What it adds to the geology underneath it is the road builder's two
// questions: how high is the ground, and can I build here. The LAYERS —
// which of rock, soil and groundwater is showing — belong to `geology.ts`,
// and everything that cares (what grows, what surfaces, what the ground is
// painted) asks that.

import { createGeology, type GeologyField } from "./geology.ts";
import { createWaterField, SEA, type WaterField } from "./water.ts";
import type { StageKnobs } from "./rules.ts";

/** The sea's own table, m. The name the rest of the generator has always
 * known it by; `SEA` is where it is defined and what the pour treats as
 * the floor under every body it finds. */
export const LAKE_Y = SEA;

export type LandField = {
  /** Ground height of the bare landscape at a point, m. */
  heightAt: (x: number, z: number) => number;
  /** True where the bare landscape is under water — with a margin, so a
   * road keeps off the shallows and the shoreline as well as the lake.
   *
   * Measured against the level of the water actually standing HERE, not
   * against one table for the whole world: the shore of a tarn three
   * hundred metres up is as much a shore as the sea's, and a builder that
   * only knows the sea walks straight into it. */
  flooded: (x: number, z: number, margin?: number) => boolean;
  /** True where standing water lies within `within` metres of a point —
   * a SETBACK from the waterline, measured across the ground.
   *
   * This and `flooded` are asked by different callers for different
   * reasons, and the difference is the whole point. `flooded`'s margin is
   * a HEIGHT: it answers "would a thing at this height be in the water",
   * which is what something deciding how high to build wants. A setback is
   * a DISTANCE, and it is what a route wants — because a height margin, on
   * a shore, puts a road exactly where the ground is steepest. Water is
   * flat and shores are not: a metre of freeboard is a stride on a beach
   * and a hundred metres up a cliff, so a rule that keeps a road "3 m
   * above the lake" is a rule that pins it to the top of the bank on
   * anything steep, which is the one place a verge cannot be cut.
   * Measuring the room the road actually needs, in the units it needs it
   * in, puts it back on the flat instead. */
  nearWater: (x: number, z: number, within: number) => boolean;
  /** The standing water itself (R35) — levels, depths and bodies, poured
   * onto the bare ground before any road exists. */
  water: WaterField;
  /** The layers under it (R32) — what the ground is MADE of here, for
   * everything that plants, paints or judges rather than builds. */
  geology: GeologyField;
};

/** How many countries are kept built. The same seed's land is asked for by
 * the route search, the country the plan is sized against, the compiler and
 * the terrain field — four times over, for one stage — and each of those
 * would otherwise pour the same water again from scratch. Two is enough to
 * hold a stage while a menu builds the next one behind it. */
const MEMO = 2;
const memo: { key: string; land: LandField }[] = [];

/** The country a seed's stage is laid across, at its dial positions.
 *
 * Memoized, because it is a pure function of exactly those two things and
 * because the pour inside it is the most expensive thing in the generator.
 * Everything it hands out is read-only, so sharing one field between the
 * search, the compiler and the terrain is sharing a value, not state. */
export function createLandField(seed: number, knobs: StageKnobs): LandField {
  const key = `${seed}|${knobs.elevation}|${knobs.steepness}|${knobs.water}|${knobs.trees}|${knobs.asphalt}|${knobs.width}`;
  const had = memo.find((entry) => entry.key === key);
  if (had) return had.land;
  const land = buildLandField(seed, knobs);
  memo.push({ key, land });
  if (memo.length > MEMO) memo.shift();
  return land;
}

function buildLandField(seed: number, knobs: StageKnobs): LandField {
  const geology = createGeology(seed, knobs);
  const heightAt = geology.surfaceAt;
  const water = createWaterField(geology.groundAt, heightAt);
  return {
    heightAt,
    // Standing water, and only standing water: a road may not be built
    // into a lake. Waterlogged GROUND is a different question — a mire is
    // ground you can lay a road over, and `geology.wetAt` is where that is
    // asked.
    flooded: (x, z, margin = 0) => {
      const level = water.shoreLevelAt(x, z);
      return level !== null && heightAt(x, z) < level + margin;
    },
    nearWater: (x, z, within) => water.nearestAt(x, z, within) !== null,
    water,
    geology,
  };
}
