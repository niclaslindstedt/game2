// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Biomes: the nature a stage runs through, as data. A biome names the
// ground-color vocabulary the terrain paints with and the plant COMMUNITIES
// the scenery scatters — a real forest is groves, not confetti, so trees
// arrive as spruce woods, birch groves, dead stands and logging blocks,
// each a weighted mix of a few species with its own ground cover.
//
// Three scales, and the engine owns the placement of all three because the
// trunks are solid (engine/mapgen/props.ts):
//
//   REGION  what kind of country this is — dense forest, open taiga, a
//           logging block, a bog, an old burn. It re-weights the groves
//           and, here, leans the ground's whole colour toward its own soil.
//   GROVE   which community owns this patch — the rows in `communities`.
//   STAND   the clumping inside one community, which is placement only.
//
// The geometry lives in flora-species.ts, the painting in terrain.ts, the
// species choice in planting.ts, and the placement in world.ts and wild.ts.
// Today every stage is taiga; new biomes are new rows here, not new systems.

import { GROVES, REGIONS, type Season } from "@engine";

/** Relative pick weights per flora variant id (see flora-species.ts for the
 * ids). Unlisted variants never appear in that context. */
export type FloraMix = Record<string, number>;

/** One plant community — what grows together in one patch of the world.
 * Which community owns a spot is decided by the engine's grove quilt, so
 * each stretch of a stage reads as ONE kind of place. */
export type Community = {
  id: string;
  /** Share of the landscape this community claims, relative. The engine's
   * GROVES row of the same id carries the same number; a region then
   * re-weights it. */
  weight: number;
  /** How much of the community's ground actually carries a tree, 0–1 —
   * near 0 is open land, 1 is closed forest, above 1 a wall. Mirrors the
   * engine's GROVES row. */
  density: number;
  trees: FloraMix;
  /** Ground cover specific to this community (falls back to the biome's). */
  undergrowth?: FloraMix;
  /** Multiplier on the biome's ground-cover chance — meadows overgrow. */
  groundCover?: number;
};

/** How one sub-region colors the ground it owns. The terrain paints the
 * biome's usual meadow-and-accents everywhere; the region then leans the
 * whole thing toward its own soil and widens the accent patches that belong
 * to it. All three biases are subtracted from a noise threshold, so 0
 * leaves the biome's own patchwork exactly as it is and 0.2 turns a
 * scattering of patches into most of the ground. */
export type RegionGround = {
  /** The soil showing through here, hex, and how far the meadow leans
   * toward it (0–1) before any accent patch is laid over the top. */
  soil: number;
  soilMix: number;
  /** More moss — shade and wet ground. */
  moss: number;
  /** More dry grass — thin soil, exposure, an old burn. */
  dry: number;
  /** More bare EARTH showing through — churned, felled or burnt over. */
  bare: number;
};

/** The ground colours one season paints with. Only the keys a year
 * actually moves are listed; everything else (the bedrock, the shore, the
 * lake bed) is rock and water and stays where it is. */
export type SeasonGround = Partial<Biome["ground"]>;

export type Biome = {
  id: string;
  /** The terrain's ground palette, hex. `grass`/`grassDark` carry the base
   * meadow, `moss`/`heath`/`forestFloor`/`dryGrass` are the noise-band
   * accents that keep big fields from reading flat, `bedrock`/`bedrockDark`
   * surface on steep slopes and road cuts, `shore`/`lakeBed` ring the water
   * table. */
  ground: {
    grass: number;
    grassDark: number;
    moss: number;
    heath: number;
    forestFloor: number;
    dryGrass: number;
    soil: number;
    bedrock: number;
    bedrockDark: number;
    shore: number;
    lakeBed: number;
  };
  /** What the year does to that palette. `summer` is the authored one
   * above, so it carries no overrides. */
  seasons: Record<Season, SeasonGround>;
  /** The groves and open lands the stage is quilted from. */
  communities: Community[];
  /** How each of the engine's sub-regions paints its ground, by region id.
   * A region with no row here paints the biome's plain palette. */
  regions: Record<string, RegionGround>;
  /** What grows within a few meters of the water table (overrides the
   * community there). */
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
};

/** The boreal forest the game launched with: spruce woods and pine heaths
 * quilted with birch groves, clearings, logging blocks and bogs, birch and
 * willow at the shorelines, bedrock shouldering through thin soil. */
export const TAIGA: Biome = {
  id: "taiga",
  ground: {
    grass: 0x74b23c,
    grassDark: 0x578f2b,
    moss: 0x8aa848,
    heath: 0x6f5f30,
    forestFloor: 0x4f5a2a,
    dryGrass: 0xb9a862,
    soil: 0x87643c,
    bedrock: 0x8d8f94,
    bedrockDark: 0x6f7278,
    shore: 0xc2a878,
    lakeBed: 0x3f6c8e,
  },
  seasons: {
    // May at 62°N. The grass is coming, but last year's straw is still the
    // loudest thing on the ground and stays that way for weeks — a spring
    // painted as a brighter summer is the commonest way to get it wrong.
    spring: {
      grass: 0x7fae44,
      grassDark: 0x63913a,
      moss: 0x8ba84c,
      heath: 0x6d6238,
      forestFloor: 0x556035,
      dryGrass: 0xbdae72,
      soil: 0x8a6a44,
    },
    // The authored baseline: everything deep and saturated.
    summer: {},
    // Ruska. The grass has gone over to straw, the heather is browning,
    // and the forest floor is bilberry — which turns a real crimson, and
    // is the reason a September spruce wood has a red carpet under a black
    // canopy.
    autumn: {
      grass: 0x9aa53f,
      grassDark: 0x7d8a37,
      moss: 0x86a049,
      heath: 0x8a5f38,
      forestFloor: 0x92572f,
      dryGrass: 0xcbb257,
      soil: 0x8f6738,
    },
  },
  regions: {
    // Deep shade, wet needles, moss over everything that stops moving.
    denseForest: { soil: 0x54702c, soilMix: 0.38, moss: 0.16, dry: 0, bare: 0.05 },
    // The plain taiga the rest of the palette was written for.
    openTaiga: { soil: 0x74b23c, soilMix: 0, moss: 0, dry: 0.04, bare: 0 },
    // Churned by machines and dragged over by timber: soil, ruts, dry grass
    // coming back through the brash.
    logging: { soil: 0x8a7442, soilMix: 0.42, moss: 0, dry: 0.13, bare: 0.2 },
    // Peat. Nearly black where it is wet, straw where the sedge has taken.
    bog: { soil: 0x4c4a2c, soilMix: 0.58, moss: 0.18, dry: 0.15, bare: 0.06 },
    // An old burn: ash and bare ground, dry grass first back into it.
    burn: { soil: 0x776b4a, soilMix: 0.38, moss: 0, dry: 0.22, bare: 0.22 },
  },
  communities: [
    {
      id: "spruceWood",
      weight: 3,
      density: 1,
      trees: {
        spruceTall: 12,
        spruceDark: 6,
        spruceOld: 4,
        spruceYoung: 5,
        spruceSapling: 4,
        firDense: 2,
        deadSnag: 2,
        brokenTrunk: 1,
        leaningSnag: 1,
      },
      undergrowth: {
        fern: 8,
        largeFern: 3,
        mossPatch: 5,
        berryBush: 3,
        heathShrub: 2,
        tallGrass: 2,
      },
    },
    {
      // The wall: closed canopy, nothing but spruce and fir, moss underfoot
      // because nothing else gets the light. The `denseForest` region is
      // mostly made of these, and they are what "the forest closed in" means.
      id: "denseStand",
      weight: 1.4,
      density: 1.7,
      trees: {
        spruceTall: 14,
        spruceDark: 10,
        spruceOld: 5,
        firSlim: 5,
        firDense: 4,
        spruceSapling: 3,
        leaningSnag: 2,
        deadSnag: 1,
      },
      undergrowth: { mossPatch: 10, fern: 5, largeFern: 3, fallenBranch: 2 },
      groundCover: 0.75,
    },
    {
      id: "pineHeath",
      weight: 2.5,
      density: 0.8,
      trees: {
        pineTall: 12,
        pineYoung: 5,
        pineSapling: 4,
        pineCrooked: 3,
        juniper: 3,
        deadSnag: 1,
        brokenTrunk: 1,
      },
      undergrowth: { heathShrub: 8, tallGrass: 5, berryBush: 3, fern: 2 },
    },
    {
      id: "birchGrove",
      weight: 2,
      density: 0.9,
      trees: {
        birch: 10,
        birchPair: 5,
        birchYoung: 6,
        rowan: 2,
        aspen: 2,
        spruceSapling: 2,
        deadSnag: 1,
      },
      undergrowth: { tallGrass: 8, fern: 4, largeFern: 2, mossPatch: 2 },
    },
    {
      id: "oldGrowth",
      weight: 2,
      density: 1,
      trees: {
        spruceOld: 6,
        firSlim: 5,
        firDense: 4,
        larch: 3,
        larchOld: 2,
        deadSnag: 3,
        leaningSnag: 2,
        brokenTrunk: 2,
      },
      undergrowth: { largeFern: 6, fern: 6, mossPatch: 5, fallenBranch: 3, heathShrub: 2 },
    },
    {
      id: "broadleafGrove",
      weight: 1.5,
      density: 0.85,
      trees: { oak: 6, maple: 6, birch: 4, aspen: 4, rowan: 3, brokenTrunk: 1 },
      undergrowth: { tallGrass: 7, fern: 4, mossPatch: 2 },
    },
    {
      id: "larchStand",
      weight: 1,
      density: 0.85,
      trees: { larch: 10, larchOld: 4, birchYoung: 2, juniper: 1, deadSnag: 1 },
      undergrowth: { tallGrass: 6, heathShrub: 3, berryBush: 2 },
    },
    {
      // Regrowth: a felled block twenty years on, thick with young stems
      // barely taller than the car and nothing above them yet.
      id: "youngStand",
      weight: 1.2,
      density: 1.35,
      trees: {
        spruceYoung: 10,
        spruceSapling: 8,
        pineYoung: 6,
        pineSapling: 5,
        birchYoung: 6,
      },
      undergrowth: { tallGrass: 9, heathShrub: 4, fern: 3, berryBush: 2 },
      groundCover: 1.2,
    },
    {
      // An old burn or a spruce-beetle kill: grey standing stems, trunks
      // down across each other, and the first birch coming back through.
      id: "deadStand",
      weight: 0.8,
      density: 0.5,
      trees: {
        deadSnag: 10,
        brokenTrunk: 7,
        leaningSnag: 5,
        birchYoung: 3,
        spruceSapling: 2,
      },
      undergrowth: { tallGrass: 8, fallenBranch: 5, heathShrub: 3, mossPatch: 2 },
      groundCover: 1.3,
    },
    {
      // The hole in the wood: open sky, saplings, and the litter of
      // whatever stood here. What makes the dense stands read as dense.
      id: "clearing",
      weight: 1.4,
      density: 0.14,
      trees: { spruceSapling: 8, pineSapling: 5, birchYoung: 4, juniper: 4, rowan: 2 },
      undergrowth: { tallGrass: 12, heathShrub: 5, fern: 3, fallenBranch: 2, berryBush: 2 },
      groundCover: 1.7,
    },
    {
      // A working block: cut over, stumps everywhere, the timber stacked
      // and waiting. The stacks themselves are engine props (they are solid);
      // this is what grows between them.
      id: "logging",
      weight: 0.9,
      density: 0.22,
      trees: { spruceSapling: 5, birchYoung: 3, fallenBranch: 3, spruceYoung: 2 },
      undergrowth: { tallGrass: 10, fallenBranch: 6, heathShrub: 3 },
      groundCover: 1.4,
    },
    {
      // Peat, standing water and a century-old pine four metres tall.
      id: "bog",
      weight: 1,
      density: 0.3,
      trees: { bogPine: 10, bogShrub: 8, deadSnag: 3, spruceSquat: 2, willowShrub: 2 },
      undergrowth: { sedgeTuft: 12, cottonGrass: 6, bogShrub: 4, mossPatch: 3 },
      groundCover: 1.6,
    },
    {
      id: "meadow",
      weight: 2.5,
      density: 0.06,
      trees: { juniper: 3, rowan: 2, birchYoung: 2, heathShrub: 3 },
      undergrowth: { tallGrass: 14, heathShrub: 3, berryBush: 2, fern: 1 },
      groundCover: 1.9,
    },
  ],
  lakeshoreTrees: {
    birch: 10,
    birchPair: 5,
    birchYoung: 6,
    willowShrub: 12,
    aspen: 4,
    spruceYoung: 3,
    driftwood: 3,
  },
  shoreCover: { reeds: 10, sedgeTuft: 6, tallGrass: 3, cottonGrass: 1 },
  riparianTrees: {
    willowShrub: 10,
    birchYoung: 6,
    birch: 5,
    aspen: 4,
    spruceYoung: 4,
    rowan: 3,
  },
  highlandTrees: {
    spruceSquat: 8,
    spruceYoung: 5,
    pineCrooked: 6,
    juniper: 8,
    deadSnag: 5,
    brokenTrunk: 3,
    leaningSnag: 2,
  },
  undergrowth: {
    tallGrass: 12,
    fern: 7,
    largeFern: 3,
    heathShrub: 5,
    mossPatch: 3,
    berryBush: 2,
  },
  undergrowthDensity: 1.1,
};

/** The biome a stage is set in. One biome exists today; when more arrive
 * this is where the seed (or the stage rules) picks between them. */
export function biomeFor(): Biome {
  return TAIGA;
}

/** Every grove the engine can quilt with must have a community here, or a
 * stretch of a stage would fall back to whatever row happens to be first
 * and quietly grow the wrong wood. Same for the regions and their ground.
 * Checked once at import: a mismatch is a typo, and a typo that only shows
 * up on the one seed that rolls that grove is the worst kind. */
for (const grove of GROVES) {
  if (!TAIGA.communities.some((c) => c.id === grove.id)) {
    throw new Error(`biome ${TAIGA.id} has no community for grove "${grove.id}"`);
  }
}
for (const region of REGIONS) {
  if (!TAIGA.regions[region.id]) {
    throw new Error(`biome ${TAIGA.id} has no ground for region "${region.id}"`);
  }
}
