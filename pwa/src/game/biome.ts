// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Biomes: the nature a stage runs through, as data. A biome names the
// ground-color vocabulary the terrain paints with and the plant COMMUNITIES
// the scenery scatters — a real forest is groves, not confetti, so trees
// arrive as spruce woods, birch groves, pine heaths and open meadows, each
// a weighted mix of a few species with its own ground cover. The geometry
// lives in flora.ts, the painting in terrain.ts, the placement in
// planting.ts (which species) with world.ts and wild.ts (where).
// Today every stage is taiga; new biomes are new rows here, not new systems.

/** Relative pick weights per flora variant id (see flora.ts for the ids).
 * Unlisted variants never appear in that context. */
export type FloraMix = Record<string, number>;

/** One plant community — what grows together in one patch of the world.
 * Which community owns a spot is decided by large-scale spatial noise, so
 * each stretch of a stage reads as ONE kind of place. */
export type Community = {
  id: string;
  /** Share of the landscape this community claims, relative. */
  weight: number;
  /** How much of the community's ground actually carries a tree, 0–1 —
   * near 0 is open land, 1 is closed forest. */
  density: number;
  trees: FloraMix;
  /** Ground cover specific to this community (falls back to the biome's). */
  undergrowth?: FloraMix;
  /** Multiplier on the biome's ground-cover chance — meadows overgrow. */
  groundCover?: number;
};

export type Biome = {
  id: string;
  /** The terrain's ground palette, hex. `grass`/`grassDark` carry the base
   * meadow, `moss`/`heath`/`forestFloor` are the noise-band accents that
   * keep big fields from reading flat, `bedrock`/`bedrockDark` surface on
   * steep slopes and road cuts, `shore`/`lakeBed` ring the water table. */
  ground: {
    grass: number;
    grassDark: number;
    moss: number;
    heath: number;
    forestFloor: number;
    bedrock: number;
    bedrockDark: number;
    shore: number;
    lakeBed: number;
  };
  /** The groves and open lands the stage is quilted from. */
  communities: Community[];
  /** Meters of grove-noise period — how big one community's patch is. */
  groveScale: number;
  /** What grows within a few meters of the water table (overrides the
   * community there). */
  lakeshoreTrees: FloraMix;
  /** What survives up on the high rocky ground (terrain altitude > 26 m). */
  highlandTrees: FloraMix;
  /** The default ground-cover mix along the road verge and under trees. */
  undergrowth: FloraMix;
  /** Ground-cover clumps attempted per road sample, 0–2. */
  undergrowthDensity: number;
};

/** The boreal forest the game launched with: spruce woods and pine heaths
 * quilted with birch groves and open meadows, birch and willow at the
 * shorelines, bedrock shouldering through thin soil. */
export const TAIGA: Biome = {
  id: "taiga",
  ground: {
    grass: 0x74b23c,
    grassDark: 0x578f2b,
    moss: 0x8aa848,
    heath: 0x7d7434,
    forestFloor: 0x6b6d33,
    bedrock: 0x8d8f94,
    bedrockDark: 0x6f7278,
    shore: 0xc2a878,
    lakeBed: 0x3f6c8e,
  },
  groveScale: 150,
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
        firDense: 2,
        deadSnag: 1,
        stump: 1,
      },
      undergrowth: { fern: 8, largeFern: 3, heathShrub: 2, tallGrass: 2 },
    },
    {
      id: "pineHeath",
      weight: 2.5,
      density: 0.8,
      trees: { pineTall: 12, pineYoung: 5, pineCrooked: 3, juniper: 3, stump: 1 },
      undergrowth: { heathShrub: 8, tallGrass: 5, fern: 2 },
    },
    {
      id: "birchGrove",
      weight: 2,
      density: 0.9,
      trees: { birch: 10, birchPair: 5, birchYoung: 6, rowan: 2, aspen: 2 },
      undergrowth: { tallGrass: 8, fern: 4, largeFern: 2 },
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
        deadSnag: 2,
        fallenLog: 2,
      },
      undergrowth: { largeFern: 6, fern: 6, heathShrub: 2 },
    },
    {
      id: "broadleafGrove",
      weight: 1.5,
      density: 0.85,
      trees: { oak: 6, maple: 6, birch: 4, aspen: 4, rowan: 3 },
      undergrowth: { tallGrass: 7, fern: 4 },
    },
    {
      id: "larchStand",
      weight: 1,
      density: 0.85,
      trees: { larch: 10, larchOld: 4, birchYoung: 2, juniper: 1 },
      undergrowth: { tallGrass: 6, heathShrub: 3 },
    },
    {
      id: "meadow",
      weight: 2.5,
      density: 0.06,
      trees: { juniper: 3, rowan: 2, birchYoung: 2, heathShrub: 3 },
      undergrowth: { tallGrass: 14, heathShrub: 3, fern: 1 },
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
    stump: 1,
  },
  highlandTrees: {
    spruceSquat: 8,
    spruceYoung: 5,
    pineCrooked: 6,
    juniper: 8,
    deadSnag: 5,
    stump: 2,
    fallenLog: 2,
  },
  undergrowth: {
    tallGrass: 12,
    fern: 7,
    largeFern: 3,
    heathShrub: 5,
  },
  undergrowthDensity: 1.1,
};

/** The biome a stage is set in. One biome exists today; when more arrive
 * this is where the seed (or the stage rules) picks between them. */
export function biomeFor(): Biome {
  return TAIGA;
}
