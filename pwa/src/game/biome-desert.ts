// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DESERT — a hot desert of the American south-west kind: saguaro
// stands and creosote flats on the gravel fans under low ranges, Joshua
// trees on the higher, colder ground, mesquite thickets in the dry washes,
// dune fields with nothing on them but bunch grass, and the salt-white pans
// where a lake would be if there were any water — and there is none, not
// a drop, which the engine's rules for this country guarantee
// (engine/mapgen/biomes.ts). The types are biome.ts's; the grove and
// region ids match the engine's row for row.
//
// What separates it from the taiga in a picture is that almost nothing
// here is green. The ground is sand and stone in a dozen warm tones, the
// plants are grey-green, olive and silver, and the only saturated colour
// is the spring — brittlebush yellow across a whole hillside, white on the
// saguaro tips, red on the ocotillo — which is why the season table still
// matters in a place that has no autumn to speak of.

import type { Biome } from "./biome.ts";

export const DESERT: Biome = {
  id: "desert",
  ground: {
    base: 0xd9b979,
    baseDark: 0xc4a065,
    // The cooler accent is DESERT PAVEMENT: the tight mosaic of varnished
    // stone that the wind leaves where it has blown the sand off.
    damp: 0xb0a07a,
    // Grey-brown where the creosote and the bursage stand thick enough to
    // shade the ground between them.
    scrub: 0xa08b5c,
    // The dark gravel under a saguaro stand's litter.
    litter: 0xa5885a,
    // Bleached sand, sun-white.
    straw: 0xeed9a3,
    // The red earth of the badlands and the cut banks.
    soil: 0xb5744a,
    bedrock: 0xb9825a,
    bedrockDark: 0x8e5f3f,
    // The salt crust round a pan, and the pan's own floor.
    shore: 0xe8e2cc,
    bed: 0xd8ccb0,
  },
  seasons: {
    // March after a wet winter: the sand is the same sand, but the scrub
    // patches carry the annuals' green and the pavement a haze of it.
    spring: {
      damp: 0xa8a47a,
      scrub: 0x9a9a5e,
      litter: 0xa08d5e,
      straw: 0xe6d69c,
    },
    summer: {},
    // October: hotter-toned, redder, the last of the annuals gone to
    // straw. The desert's autumn is a small thing and is painted as one.
    autumn: {
      base: 0xd8b26f,
      baseDark: 0xc0955a,
      scrub: 0x9c7f4e,
      litter: 0x9e7c4e,
      straw: 0xf0d59b,
      soil: 0xb56d40,
    },
  },
  regions: {
    // The gravel fan: stone-coloured, littered, a little red where the
    // wash has cut through.
    bajada: { soil: 0xc2955f, soilMix: 0.25, moss: 0, dry: 0.05, bare: 0.1 },
    // Higher and paler, with more pavement between the Joshua trees.
    mojave: { soil: 0xc9ad7a, soilMix: 0.3, moss: 0.08, dry: 0.1, bare: 0.05 },
    // The creosote plain — the desert most of the stage runs across.
    flats: { soil: 0xdcc48a, soilMix: 0.35, moss: 0, dry: 0.2, bare: 0.02 },
    // Sand and nothing else, bleached toward white on every crest.
    sandSea: { soil: 0xe3c78c, soilMix: 0.6, moss: 0, dry: 0.3, bare: 0 },
    // Broken red rock, bare more often than not.
    badlands: { soil: 0xa87550, soilMix: 0.45, moss: 0, dry: 0.05, bare: 0.25 },
  },
  communities: [
    {
      // The Sonoran picture: columnar cacti standing well apart, the odd
      // palo verde between them, and a dead one every so often with its
      // ribs showing. The soft stuff underneath is what the car actually
      // drives through.
      id: "saguaroStand",
      weight: 2.5,
      density: 0.42,
      trees: {
        saguaro: 10,
        saguaroOld: 4,
        saguaroYoung: 6,
        deadSaguaro: 2,
        paloVerde: 4,
        barrelCactus: 4,
        cholla: 4,
        pricklyPear: 3,
        creosote: 3,
        brittlebush: 3,
      },
      undergrowth: { bunchGrass: 8, brittlebush: 4, creosote: 3, deadBrush: 2, barrelCactus: 2 },
    },
    {
      // Higher and colder: the Joshua trees, with yucca and creosote and
      // little else. Grey-green over pale ground.
      id: "joshuaWood",
      weight: 1.6,
      density: 0.38,
      trees: {
        joshuaTree: 10,
        joshuaYoung: 6,
        yucca: 4,
        creosote: 4,
        sagebrush: 3,
        cholla: 2,
        deadBrush: 1,
      },
      undergrowth: { bunchGrass: 8, sagebrush: 4, desertGrass: 3, deadBrush: 2, yucca: 1 },
    },
    {
      // A dry wash: the one place the desert's trees close up, because the
      // one place the ground holds any water at all is under it.
      id: "mesquiteBosque",
      weight: 1,
      density: 0.65,
      trees: { mesquite: 10, paloVerde: 5, deadBrush: 3, creosote: 2, tumbleweed: 1 },
      undergrowth: { bunchGrass: 6, desertGrass: 6, deadBrush: 3, tumbleweed: 1 },
      groundCover: 1.2,
    },
    {
      // The creosote plain: a bush every few metres, all the same bush, to
      // the horizon. The desert's meadow, and most of it.
      id: "creosoteFlat",
      weight: 3,
      density: 0.08,
      trees: { paloVerde: 2, creosote: 6, brittlebush: 3, cholla: 1 },
      undergrowth: { creosote: 10, bunchGrass: 6, brittlebush: 3, desertGrass: 3, deadBrush: 2 },
      groundCover: 1.5,
    },
    {
      // Mixed scrub: the spiky things — ocotillo whips, cholla, prickly
      // pear, agave — over a thinner creosote.
      id: "scrub",
      weight: 2,
      density: 0.2,
      trees: {
        paloVerde: 3,
        saguaroYoung: 1,
        ocotillo: 5,
        cholla: 5,
        pricklyPear: 4,
        agave: 3,
        creosote: 3,
      },
      undergrowth: { bunchGrass: 7, creosote: 4, pricklyPear: 2, agave: 2, deadBrush: 2 },
      groundCover: 1.2,
    },
    {
      // The broken high ground: agave and yucca in the rock, a pinyon where
      // one has found a crack, the rest of it stone.
      id: "rockyUpland",
      weight: 1.2,
      density: 0.25,
      trees: { pinyon: 5, joshuaYoung: 2, yucca: 4, agave: 5, ocotillo: 3, cholla: 2 },
      undergrowth: { bunchGrass: 5, agave: 3, desertGrass: 3, deadBrush: 2 },
      groundCover: 0.8,
    },
    {
      // Sand. A tuft of grass on the lee side of a crest, a tumbleweed
      // caught in it, and nothing with a trunk for a kilometre.
      id: "dunes",
      weight: 1.5,
      density: 0.03,
      trees: { yucca: 2, deadBrush: 3, tumbleweed: 3 },
      undergrowth: { bunchGrass: 10, desertGrass: 4, tumbleweed: 3, deadBrush: 1 },
      groundCover: 0.6,
    },
    {
      // The dry lake: crust, and the things the wind left on it.
      id: "saltPan",
      weight: 1,
      density: 0,
      trees: { tumbleweed: 2, deadBrush: 1 },
      undergrowth: { saltCrust: 8, tumbleweed: 2, deadBrush: 2, cowSkull: 1 },
      groundCover: 0.7,
    },
  ],
  // There is no water in this country, so the two waterside mixes are
  // never asked for (planting.ts checks the engine's rules before the
  // height). They are the wash's own plants, so that a dial that ever did
  // put water here would grow the right thing beside it.
  lakeshoreTrees: { mesquite: 8, paloVerde: 4, deadBrush: 2, bunchGrass: 3 },
  shoreCover: { saltCrust: 6, bunchGrass: 4, desertGrass: 3 },
  riparianTrees: { mesquite: 10, paloVerde: 4, creosote: 2, deadBrush: 2 },
  highlandTrees: {
    pinyon: 5,
    joshuaYoung: 3,
    yucca: 5,
    agave: 6,
    ocotillo: 3,
    cholla: 3,
    deadBrush: 2,
  },
  undergrowth: {
    bunchGrass: 10,
    desertGrass: 5,
    creosote: 3,
    deadBrush: 3,
    brittlebush: 2,
    tumbleweed: 1,
  },
  // Sparser than the taiga's: a desert is mostly ground, and a verge as
  // busy as a boreal one is a desert that has been watered.
  undergrowthDensity: 0.75,
  vergeCover: { bunchGrass: 3, deadBrush: 1 },
  // Nothing grows on a stone here. It varnishes instead, which is a colour
  // the bedrock already carries.
  mossyStone: 0,
};
