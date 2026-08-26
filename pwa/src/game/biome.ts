// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Biomes: the nature a stage runs through, as data. A biome names the
// ground-color vocabulary the terrain paints with and the flora mix the
// scenery scatters (which trees, how much undergrowth) — the geometry
// itself lives in flora.ts, the painting in terrain.ts, the placement in
// world.ts. Today every stage is taiga; new biomes are new rows here, not
// new systems.

/** Relative pick weights per flora variant id (see flora.ts for the ids).
 * Unlisted variants never appear in that context. */
export type FloraMix = Record<string, number>;

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
  /** The default forest mix, away from water and above the tree line. */
  trees: FloraMix;
  /** What grows within a few meters of the water table. */
  lakeshoreTrees: FloraMix;
  /** What survives up on the high rocky ground (terrain altitude > 26 m). */
  highlandTrees: FloraMix;
  /** The ground-cover mix scattered along the road verge and under trees. */
  undergrowth: FloraMix;
  /** Undergrowth clumps attempted per road sample, 0–2. */
  undergrowthDensity: number;
};

/** The boreal forest the game launched with: spruce-dark and pine-bright,
 * birches at the shorelines, bedrock shouldering through thin soil. */
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
  trees: {
    spruceTall: 14,
    spruceOld: 6,
    spruceYoung: 8,
    spruceSquat: 5,
    spruceDark: 7,
    pineTall: 10,
    pineCrooked: 4,
    pineYoung: 5,
    firSlim: 6,
    firDense: 5,
    birch: 7,
    birchPair: 3,
    birchYoung: 4,
    aspen: 4,
    larch: 4,
    larchOld: 2,
    rowan: 2,
    juniper: 3,
    deadSnag: 3,
    stump: 2,
    fallenLog: 2,
  },
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
