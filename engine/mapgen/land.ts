// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The BARE LANDSCAPE: the country before anybody laid a road across it —
// the ground surface of the layered geology (R32), read the way a road
// builder reads a map.
//
// It lives on its own, apart from the terrain field that shapes itself
// around the road, because two things need it and only one of them is the
// terrain. The other is the road NETWORK: a branch leaving a junction has
// to know where the water is before it drives into it, and a road built on
// an embankment across a lake — ending in mid-air over open water — is a
// mistake you can see from a kilometer up. Deterministic in the seed and
// the dials, and nothing else: the same country every time.
//
// What it adds to the geology underneath it is the road builder's two
// questions: how high is the ground, and can I build here. The LAYERS —
// which of rock, soil and groundwater is showing — belong to `geology.ts`,
// and everything that cares (what grows, what surfaces, what the ground is
// painted) asks that.

import { createGeology, LAKE_Y, type GeologyField } from "./geology.ts";
import type { StageKnobs } from "./rules.ts";

export { LAKE_Y };

export type LandField = {
  /** Ground height of the bare landscape at a point, m. */
  heightAt: (x: number, z: number) => number;
  /** True where the bare landscape is under water — with a margin, so a
   * road keeps off the shallows and the shoreline as well as the lake. */
  flooded: (x: number, z: number, margin?: number) => boolean;
  /** The layers under it (R32) — what the ground is MADE of here, for
   * everything that plants, paints or judges rather than builds. */
  geology: GeologyField;
};

/** The country a seed's stage is laid across, at its dial positions. */
export function createLandField(seed: number, knobs: StageKnobs): LandField {
  const geology = createGeology(seed, knobs);
  const heightAt = geology.surfaceAt;
  return {
    heightAt,
    // Standing water, and only standing water: a road may not be built
    // into a lake. Waterlogged GROUND is a different question — a mire is
    // ground you can lay a road over, and `geology.wetAt` is where that is
    // asked.
    flooded: (x, z, margin = 0) => heightAt(x, z) < LAKE_Y + margin,
    geology,
  };
}
