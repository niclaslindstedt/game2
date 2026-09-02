// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TAIGA — the boreal forest the game launched with: spruce woods and
// pine heaths quilted with birch groves, clearings, logging blocks and
// bogs, birch and willow at the shorelines, bedrock shouldering through
// thin soil. The types it fills in are biome.ts's; the quilt it dresses is
// the engine's (engine/mapgen/biomes.ts), whose grove and region ids every
// row here has to match.

import type { Biome } from "./biome.ts";

export const TAIGA: Biome = {
  id: "taiga",
  ground: {
    base: 0x74b23c,
    baseDark: 0x578f2b,
    damp: 0x8aa848,
    scrub: 0x6f5f30,
    litter: 0x4f5a2a,
    straw: 0xb9a862,
    soil: 0x87643c,
    bedrock: 0x8d8f94,
    bedrockDark: 0x6f7278,
    shore: 0xc2a878,
    bed: 0x3f6c8e,
  },
  seasons: {
    // May at 62°N. The grass is coming, but last year's straw is still the
    // loudest thing on the ground and stays that way for weeks — a spring
    // painted as a brighter summer is the commonest way to get it wrong.
    spring: {
      base: 0x7fae44,
      baseDark: 0x63913a,
      damp: 0x8ba84c,
      scrub: 0x6d6238,
      litter: 0x556035,
      straw: 0xbdae72,
      soil: 0x8a6a44,
    },
    // The authored baseline: everything deep and saturated.
    summer: {},
    // Ruska. The grass has gone over to straw, the heather is browning,
    // and the forest floor is bilberry — which turns a real crimson, and
    // is the reason a September spruce wood has a red carpet under a black
    // canopy.
    autumn: {
      base: 0x9aa53f,
      baseDark: 0x7d8a37,
      damp: 0x86a049,
      scrub: 0x8a5f38,
      litter: 0x92572f,
      straw: 0xcbb257,
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
      // Peat, standing water and a century-old pine four metres tall. The
      // drowned trunks and the willows are what separate a bog from a
      // clearing that happens to be damp: dead wood standing IN water, and
      // the one tree that likes it there.
      id: "bog",
      weight: 1,
      density: 0.3,
      trees: {
        bogPine: 10,
        bogShrub: 8,
        willowYoung: 5,
        drownedTrunk: 4,
        deadSnag: 3,
        willow: 3,
        spruceSquat: 2,
        willowShrub: 2,
      },
      undergrowth: {
        sedgeTuft: 12,
        tussock: 9,
        bogMoss: 7,
        cottonGrass: 6,
        bogShrub: 4,
        bulrush: 3,
        mossPatch: 3,
      },
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
    // The two trees that actually stand at a waterline rather than near
    // one: a willow leaning out over it and an alder with its feet in it.
    willow: 8,
    alder: 7,
    willowYoung: 5,
    aspen: 4,
    drownedTrunk: 3,
    spruceYoung: 3,
    driftwood: 3,
  },
  shoreCover: {
    reeds: 10,
    sedgeTuft: 6,
    bulrush: 5,
    tussock: 4,
    tallGrass: 3,
    bogMoss: 3,
    waterLily: 2,
    cottonGrass: 1,
  },
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
  vergeCover: { tallGrass: 3, heathShrub: 1 },
  // Nothing in a boreal forest stays bare for long: a stone lying in the
  // shade for fifty years is a green stone with grey sides, and the
  // difference between rock that has been there and rock that was PUT
  // there is most of what makes a hillside read as old.
  mossyStone: 0.45,
};
