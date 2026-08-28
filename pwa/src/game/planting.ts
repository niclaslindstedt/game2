// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How a biome's plant mixes become placements: which species grows where,
// which of them read as solid trees and which as brush the car drives
// through, and how one of the engine's trunks is dressed as a species.
//
// Shared by the two things that plant a stage — the band of scenery each
// road chunk carries (world.ts) and the open country beyond it (wild.ts) —
// so both answer "what grows here" the same way.

import { GROVES, type WildObstacle } from "@engine";

import type { Biome, Community, FloraMix } from "./biome.ts";
import type { FloraPlacement } from "./flora.ts";
import { LAKE_Y } from "./terrain.ts";

/** The community a grove-quilt index names — the quilt itself lives in the
 * ENGINE's terrain field now (terrain.field.groveAt), because the trunks it
 * places are solid; the biome only supplies what grows in each patch. */
export function communityByGrove(biome: Biome, grove: number): Community {
  const id = GROVES[grove]?.id;
  return biome.communities.find((c) => c.id === id) ?? biome.communities[0];
}

/** Brush the car drives THROUGH: the only flora still planted app-side,
 * because nothing about it stands over the middle of the hood. Everything
 * else that reads as solid — trunks, stumps, fallen logs — comes from the
 * engine's prop fields, where the physics can collide with it. */
const SOFT_FLORA = new Set(["heathShrub", "juniper", "willowShrub"]);

/** ...and what a solid TRUNK may never be dressed as: the brush above plus
 * the dead wood the engine plants as props of its own. */
const NOT_A_TRUNK = new Set([...SOFT_FLORA, "stump", "fallenLog"]);

/** A mix stripped to the species that read as solid trees (falls back to
 * the whole mix if nothing tall grows there). */
export function solidMix(mix: FloraMix): FloraMix {
  const out: FloraMix = {};
  for (const id in mix) if (!NOT_A_TRUNK.has(id)) out[id] = mix[id];
  return Object.keys(out).length > 0 ? out : mix;
}

/** ...and the complement: the low soft stuff of a community's tree mix. */
export function softMix(mix: FloraMix): FloraMix | null {
  const out: FloraMix = {};
  for (const id in mix) if (SOFT_FLORA.has(id)) out[id] = mix[id];
  return Object.keys(out).length > 0 ? out : null;
}

/** Dress one engine trunk as the tree the biome grows there. The engine
 * owns WHERE a solid tree stands and how thick its trunk is; which species
 * it IS stays the biome's call — with the same overrides as ever: willow
 * and birch crowd the shores, only the tough survive the high bedrock. */
export function treePlacement(tree: WildObstacle, biome: Biome): FloraPlacement {
  let mix: FloraMix;
  if (tree.y < LAKE_Y + 4) mix = biome.lakeshoreTrees;
  else if (tree.y > 26) mix = biome.highlandTrees;
  else mix = communityByGrove(biome, tree.grove ?? 0).trees;
  return {
    id: pickFlora(solidMix(mix), tree.roll ?? 0),
    x: tree.x,
    y: tree.y,
    z: tree.z,
    scale: tree.size,
    spin: tree.spin,
  };
}

/** Draw one flora variant id from a weighted mix. */
export function pickFlora(mix: FloraMix, roll: number): string {
  let total = 0;
  for (const id in mix) total += mix[id];
  let t = roll * total;
  let last = "";
  for (const id in mix) {
    last = id;
    t -= mix[id];
    if (t <= 0) return id;
  }
  return last;
}
