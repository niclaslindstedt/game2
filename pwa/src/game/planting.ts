// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How a biome's plant mixes become placements: which species grows where,
// which of them read as solid trees and which as brush the car drives
// through, and how one of the engine's props is dressed as a species.
//
// Shared by the two things that plant a stage — the band of scenery each
// road chunk carries (world.ts) and the open country beyond it (wild.ts) —
// so both answer "what grows here" the same way.

import { GROVES, type WildObstacle } from "@engine";

import type { Biome, Community, FloraMix } from "./biome.ts";
import type { FloraPlacement } from "./flora.ts";
import { LAKE_Y } from "./terrain.ts";

/** The community a grove-quilt index names — the quilt itself lives in the
 * ENGINE's prop field now (terrain.field.groveAt), because the trunks it
 * places are solid; the biome only supplies what grows in each patch. */
export function communityByGrove(biome: Biome, grove: number): Community {
  const id = GROVES[grove]?.id;
  return biome.communities.find((c) => c.id === id) ?? biome.communities[0];
}

/** Brush the car drives THROUGH: the only flora still planted app-side,
 * because nothing about it stands over the middle of the hood. Everything
 * else that reads as solid — trunks, stumps, fallen logs, timber stacks —
 * comes from the engine's prop fields, where the physics can collide with
 * it. Saplings are on this list on purpose: a knee-high spruce is
 * something a rally car flattens, and the middle storey is worth far more
 * as scenery than it would be as a wall of new collision. */
const SOFT_FLORA = new Set([
  "heathShrub",
  "juniper",
  "willowShrub",
  "bogShrub",
  "berryBush",
  "spruceSapling",
  "pineSapling",
  "fallenBranch",
  "driftwood",
]);

/** ...and what a solid TRUNK may never be dressed as: the brush above plus
 * the dead and cut wood the engine plants as props of its own. */
const NOT_A_TRUNK = new Set([...SOFT_FLORA, "stump", "fallenLog", "rootLog", "logPile"]);

/** How far from a stream's water the riparian mix still wins, m. Wide
 * enough to read as a green seam from the road, narrow enough that a
 * stream crossing a spruce wood does not turn the wood into willows. */
export const RIPARIAN_BAND = 14;

/** Terrain altitude above which only the tough survive, m. Mirrors the
 * terrain paint's own rock line, so the flora and the ground always tell
 * the same story about how high up this is. */
const HIGHLAND_Y = 26;

/** Where a plant stands, as much of it as decides WHAT it is. */
export type Ground = {
  /** Terrain height at its foot, m. */
  y: number;
  /** Inside the band along a stream (R18). */
  riparian: boolean;
  /** Grove index into the engine's quilt. */
  grove: number;
};

/** The mix that owns a patch of ground. Context beats community: the water
 * decides the shoreline and the stream banks, the altitude decides the
 * highland, and only the ground that is none of those grows whatever the
 * quilt says it grows. */
export function mixAt(biome: Biome, ground: Ground): FloraMix {
  if (ground.y < LAKE_Y + 4) return biome.lakeshoreTrees;
  if (ground.riparian) return biome.riparianTrees;
  if (ground.y > HIGHLAND_Y) return biome.highlandTrees;
  return communityByGrove(biome, ground.grove).trees;
}

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
 * it IS stays the biome's call. */
export function treePlacement(tree: WildObstacle, biome: Biome, riparian = false): FloraPlacement {
  const mix = mixAt(biome, { y: tree.y, riparian, grove: tree.grove ?? 0 });
  return {
    id: pickFlora(solidMix(mix), tree.roll ?? 0),
    x: tree.x,
    y: tree.y,
    z: tree.z,
    scale: tree.size,
    spin: tree.spin,
  };
}

/** ...and the same for the engine's WOODEN props, which are not trunks:
 * the fallen timber, the cut stumps and the logging blocks' stacks. Stone
 * props are drawn as rock instead (wild.ts) and never come through here.
 * Returns null for a prop this renderer draws some other way. */
const WOODEN: Partial<Record<WildObstacle["kind"], string>> = {
  // A trunk that came down in a gale still holds its root plate up on end;
  // one that rotted off its stump lies plain. They are two KINDS in the
  // engine, not one kind with a flag, because the plate is a metre and a
  // half of wood standing over a thing you could otherwise drive across —
  // so the collision shape differs and both sides have to agree on which
  // is standing there.
  log: "fallenLog",
  rootlog: "rootLog",
  stump: "stump",
  timber: "logPile",
};

export function propPlacement(ob: WildObstacle): FloraPlacement | null {
  const id = WOODEN[ob.kind];
  if (!id) return null;
  return { id, x: ob.x, y: ob.y, z: ob.z, scale: ob.size, spin: ob.spin };
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

/** Whether two placements are the SAME thing standing in the same spot. The
 * engine hands a felled solid back by position, and every side of the world
 * planted it from the same seeded coordinate, so this is an identity test
 * with room only for the float error of passing through a few objects. */
export function samePlace(ax: number, az: number, bx: number, bz: number): boolean {
  return Math.abs(ax - bx) < 0.01 && Math.abs(az - bz) < 0.01;
}
