// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How a biome's plant mixes become placements: which species grows where,
// which of them read as solid trees and which as brush the car drives
// through, and how one of the engine's props is dressed as a species.
//
// Shared by the two things that plant a stage — the band of scenery each
// road chunk carries (world.ts) and the open country beyond it (wild.ts) —
// so both answer "what grows here" the same way.

import { biomeRules, type WildObstacle } from "@engine";

import type { Biome, Community, FloraMix } from "./biome.ts";
import type { FloraPlacement } from "./flora.ts";
import { LAKE_Y } from "./terrain.ts";

/** The community a grove-quilt index names — the quilt itself lives in the
 * ENGINE's prop field (terrain.field.groveAt), because the trunks it
 * places are solid; the biome only supplies what grows in each patch. The
 * index is into the engine's grove table for THIS country (R40). */
export function communityByGrove(biome: Biome, grove: number): Community {
  const id = biomeRules(biome.id).groves[grove]?.id;
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
  // The desert's scrub and its spiky middle storey: a barrel cactus is
  // knee-high, an ocotillo is whips, a cholla is spines on a stick — every
  // one of them something a rally car goes over rather than into. The
  // saguaros, the Joshua trees and the wash trees are the trunks.
  "barrelCactus",
  "pricklyPear",
  "cholla",
  "ocotillo",
  "creosote",
  "brittlebush",
  "sagebrush",
  "agave",
  "yucca",
  "deadBrush",
  "tumbleweed",
  "bunchGrass",
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
  // R40 — a country with no water has no shoreline, however low its pans
  // lie: the height test is only a shoreline where there is water to
  // stand at.
  if (biomeRules(biome.id).water && ground.y < LAKE_Y + 4) return biome.lakeshoreTrees;
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

/** The two variants that are AUTHORED lying down along their own −x (the
 * fallen trunks). For those the engine's `spin` is not a free yaw but the
 * compass BEARING the trunk lies along — it puts a blown-over tree down the
 * fall line — and the yaw that points a −x axis along a bearing is π minus
 * it. Everything else spins freely and the two are the same number. */
const LAID_ALONG_X = new Set(["fallenLog", "rootLog"]);

export function propPlacement(ob: WildObstacle): FloraPlacement | null {
  const id = WOODEN[ob.kind];
  if (!id) return null;
  const spin = LAID_ALONG_X.has(id) ? Math.PI - ob.spin : ob.spin;
  return { id, x: ob.x, y: ob.y, z: ob.z, scale: ob.size, spin };
}

/** The share of mature trunks that carry a skirt of low growth, and the most
 * plants one carries. A wood where every trunk stands in mown grass is the
 * same lawn-with-poles the ground cover was widened to fix, one scale in:
 * what actually grows at the foot of a spruce is its own seedlings, a
 * juniper and a cushion of moss, and it is the thing the eye reads as depth
 * when the car is close enough to see the bottom two metres of a forest. */
const UNDERSTORY_SHARE = 0.45;
const UNDERSTORY_MAX = 2;
/** How far out from the trunk's own rim it stands, m — inside the crown's
 * drip line, which is exactly where a real one is. */
const UNDERSTORY_NEAR = 1.2;
const UNDERSTORY_FAR = 4.2;
/** How much of the skirt is young TREES rather than ground cover. */
const UNDERSTORY_SAPLINGS = 0.55;

/** What the ground under one trunk has to say about whether a plant may
 * stand on it, and everything the skirt needs to place one. */
export type Understory = {
  biome: Biome;
  rng: () => number;
  groundAt: (x: number, z: number) => number;
  /** Ground nothing may grow on — the road with its aprons, the streams. */
  blocked: (x: number, z: number) => boolean;
};

/** The saplings, junipers and moss growing in the shelter of one mature
 * trunk. Soft to a car, like every other app-side plant: what is solid here
 * is the trunk it grows around, which the engine placed. */
export function understoryAround(
  tree: WildObstacle,
  riparian: boolean,
  ctx: Understory,
): FloraPlacement[] {
  const { biome, rng, groundAt, blocked } = ctx;
  const out: FloraPlacement[] = [];
  if (rng() > UNDERSTORY_SHARE) return out;
  const grove = tree.grove ?? 0;
  const soft = softMix(mixAt(biome, { y: tree.y, riparian, grove }));
  const cover = communityByGrove(biome, grove).undergrowth ?? biome.undergrowth;
  const count = 1 + Math.floor(rng() * UNDERSTORY_MAX);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const d = tree.radius + UNDERSTORY_NEAR + rng() * (UNDERSTORY_FAR - UNDERSTORY_NEAR);
    const x = tree.x + Math.cos(a) * d;
    const z = tree.z + Math.sin(a) * d;
    const mix = soft && rng() < UNDERSTORY_SAPLINGS ? soft : cover;
    const roll = rng();
    const scale = 0.7 + rng() * 0.55;
    const spin = rng() * Math.PI * 2;
    if (blocked(x, z)) continue;
    const y = groundAt(x, z);
    if (y < LAKE_Y + 1.2) continue;
    out.push({ id: pickFlora(mix, roll), x, y, z, scale, spin });
  }
  return out;
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
