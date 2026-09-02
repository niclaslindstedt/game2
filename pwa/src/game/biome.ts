// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Biomes: the nature a stage runs through, as data. A biome names the
// ground-colour vocabulary the terrain paints with and the plant COMMUNITIES
// the scenery scatters — a real forest is groves, not confetti, so trees
// arrive as spruce woods, birch groves, dead stands and logging blocks,
// each a weighted mix of a few species with its own ground cover; and a
// real desert is saguaro stands, creosote flats and dune fields the same
// way.
//
// Three scales, and the engine owns the placement of all three because the
// trunks are solid (engine/mapgen/biomes.ts, read by props.ts):
//
//   REGION  what kind of country this is — dense forest, open taiga, a
//           logging block, a bog, an old burn. It re-weights the groves
//           and, here, leans the ground's whole colour toward its own soil.
//   GROVE   which community owns this patch — the rows in `communities`.
//   STAND   the clumping inside one community, which is placement only.
//
// This module is the TYPES and the registry. Each country is its own file
// beside it (biome-taiga.ts, biome-desert.ts): what each one is made of is
// a few hundred lines of rows, and two of them in one file is a file that
// scrolls past the thing being edited. The geometry lives in the flora
// modules, the painting in terrain.ts, the species choice in planting.ts,
// and the placement in world.ts and wild.ts.

import { biomeRules, type BiomeId } from "@engine";
import type { Season } from "@engine";

import { DESERT } from "./biome-desert.ts";
import { TAIGA } from "./biome-taiga.ts";

/** Relative pick weights per flora variant id (see flora-species.ts and
 * flora-desert.ts for the ids). Unlisted variants never appear in that
 * context. */
export type FloraMix = Record<string, number>;

/** One plant community — what grows together in one patch of the world.
 * Which community owns a spot is decided by the engine's grove quilt, so
 * each stretch of a stage reads as ONE kind of place. */
export type Community = {
  id: string;
  /** Share of the landscape this community claims, relative. The engine's
   * grove row of the same id carries the same number; a region then
   * re-weights it. */
  weight: number;
  /** How much of the community's ground actually carries a tree, 0–1 —
   * near 0 is open land, 1 is closed forest, above 1 a wall. Mirrors the
   * engine's grove row. */
  density: number;
  trees: FloraMix;
  /** Ground cover specific to this community (falls back to the biome's). */
  undergrowth?: FloraMix;
  /** Multiplier on the biome's ground-cover chance — meadows overgrow. */
  groundCover?: number;
};

/** How one sub-region colours the ground it owns. The terrain paints the
 * biome's usual base-and-accents everywhere; the region then leans the
 * whole thing toward its own soil and widens the accent patches that belong
 * to it. All three biases are subtracted from a noise threshold, so 0
 * leaves the biome's own patchwork exactly as it is and 0.2 turns a
 * scattering of patches into most of the ground. */
export type RegionGround = {
  /** The soil showing through here, hex, and how far the base leans
   * toward it (0–1) before any accent patch is laid over the top. */
  soil: number;
  soilMix: number;
  /** More of the DAMP accent — shade and wet ground in a taiga, the
   * cooler pavement between the sand in a desert. */
  moss: number;
  /** More of the STRAW accent — thin soil, exposure, an old burn; bleached
   * sand. */
  dry: number;
  /** More bare EARTH showing through — churned, felled or burnt over. */
  bare: number;
};

/** The terrain's ground palette, hex. The keys are ROLES the paint plays,
 * not things: `base`/`baseDark` carry the ground's own colour (a meadow, a
 * sand sheet), the four accents are the noise-band patches that keep big
 * fields from reading flat — `damp` where it is wet or shaded, `scrub`
 * where the low growth is thick, `litter` where the ground is bare under
 * something, `straw` where it is dry and pale — `bedrock`/`bedrockDark`
 * surface on steep slopes and road cuts, `shore`/`bed` ring the water
 * table where there is one and floor the pans where there is not. */
export type GroundPalette = {
  base: number;
  baseDark: number;
  damp: number;
  scrub: number;
  litter: number;
  straw: number;
  soil: number;
  bedrock: number;
  bedrockDark: number;
  shore: number;
  bed: number;
};

/** The ground colours one season paints with. Only the keys a year
 * actually moves are listed; everything else (the bedrock, the shore, the
 * lake bed) is rock and water and stays where it is. */
export type SeasonGround = Partial<GroundPalette>;

export type Biome = {
  id: BiomeId;
  ground: GroundPalette;
  /** What the year does to that palette. `summer` is the authored one
   * above, so it carries no overrides. */
  seasons: Record<Season, SeasonGround>;
  /** The groves and open lands the stage is quilted from. */
  communities: Community[];
  /** How each of the engine's sub-regions paints its ground, by region id.
   * A region with no row here paints the biome's plain palette. */
  regions: Record<string, RegionGround>;
  /** What grows within a few meters of the water table (overrides the
   * community there). Never asked in a country with no water. */
  lakeshoreTrees: FloraMix;
  /** ...and what fringes the water itself, in the band between the
   * waterline and dry land: the reeds and sedges that stop a lake ending
   * on a drawn line. */
  shoreCover: FloraMix;
  /** What crowds the banks of a stream (R18) — a watercourse in a taiga is
   * a green seam through it, whatever the surrounding community is. */
  riparianTrees: FloraMix;
  /** What survives up on the high rocky ground (terrain altitude > 26 m). */
  highlandTrees: FloraMix;
  /** The default ground-cover mix along the road verge and under trees. */
  undergrowth: FloraMix;
  /** Ground-cover clumps attempted per road sample, 0–2. */
  undergrowthDensity: number;
  /** The scrappy stuff that survives on a graded shoulder, half the size
   * of what grows a metre further out. */
  vergeCover: FloraMix;
  /** The share of the wild's loose stone that has gone over to moss. Most
   * of a boreal hillside; none of a desert's. */
  mossyStone: number;
};

/** Every biome the renderer can dress, by the engine's id. */
export const BIOMES: Record<BiomeId, Biome> = { taiga: TAIGA, desert: DESERT };

/** The biome a stage is set in — the one its dials name (`knobs.biome`).
 * An id this build does not know is the taiga, exactly as the engine
 * resolves it. */
export function biomeFor(id: BiomeId | string | undefined): Biome {
  return id !== undefined && id in BIOMES ? BIOMES[id as BiomeId] : TAIGA;
}

/** Every grove the engine can quilt a country with must have a community
 * here, or a stretch of a stage would fall back to whatever row happens to
 * be first and quietly grow the wrong wood. Same for the regions and their
 * ground. Checked once at import, for every biome: a mismatch is a typo,
 * and a typo that only shows up on the one seed that rolls that grove is
 * the worst kind. */
for (const biome of Object.values(BIOMES)) {
  const rules = biomeRules(biome.id);
  for (const grove of rules.groves) {
    if (!biome.communities.some((c) => c.id === grove.id)) {
      throw new Error(`biome ${biome.id} has no community for grove "${grove.id}"`);
    }
  }
  for (const community of biome.communities) {
    if (!rules.groves.some((g) => g.id === community.id)) {
      throw new Error(
        `biome ${biome.id} grows a community the engine never quilts: "${community.id}"`,
      );
    }
  }
  for (const region of rules.regions) {
    if (!biome.regions[region.id]) {
      throw new Error(`biome ${biome.id} has no ground for region "${region.id}"`);
    }
  }
}
