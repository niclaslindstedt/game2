// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ALPINE — a high European mountain range: a massif of grey rock and
// snow over bright summer pasture, a mountain forest of spruce, larch and
// arolla pine that stops at a treeline, and a farmed valley floor with a
// turquoise lake in it (engine/mapgen/biomes.ts, R47). The types are
// biome.ts's; the grove and region ids match the engine's row for row.
//
// What separates it from the taiga in a picture is the LIGHT and the
// VERTICAL: the greens are brighter and yellower (a hay meadow at noon, not
// moss under spruce), the rock is pale grey rather than the shield's dark
// gneiss, the snow is white, and every one of them is read against the one
// above it on a flank. The zones the engine states (`BiomeLand.zones`) are
// what the terrain paints them at; this file says what colour each is.

import type { Biome } from "./biome.ts";

export const ALPINE: Biome = {
  id: "alpine",
  ground: {
    // Alp pasture: a saturated, slightly yellow green — a hay meadow in
    // July, grazed short.
    base: 0x7fbf3e,
    baseDark: 0x5f9c2f,
    // The damp accent is the shaded green under a north-facing wall.
    damp: 0x6fa84a,
    // Alpenrose and bilberry scrub: a dull dark green.
    scrub: 0x546b34,
    // The needle litter of a spruce forest floor.
    litter: 0x5a5a32,
    // Cured pasture grass on a dry knoll.
    straw: 0xc2b46a,
    // The thin brown earth of a cattle track.
    soil: 0x8a6d48,
    // Grey limestone and gneiss, pale in the sun.
    bedrock: 0xa3a5a4,
    bedrockDark: 0x767a7c,
    // A grey gravel shore, and a lake bed the glacier flour turns
    // turquoise.
    shore: 0xb9b6a8,
    bed: 0x3c8f96,
  },
  seasons: {
    // June: the alp is at its greenest and the flowers are out; the straw
    // is last year's on the high ground only.
    spring: {
      base: 0x82c247,
      baseDark: 0x639f36,
      damp: 0x74ad50,
      straw: 0xbdb476,
    },
    summer: {},
    // October: the larches turn gold, the pasture goes to straw, and the
    // bilberry on the forest floor reddens.
    autumn: {
      base: 0xa8ad4a,
      baseDark: 0x8a9040,
      damp: 0x86a04c,
      scrub: 0x7d5a35,
      litter: 0x8a5a2f,
      straw: 0xd0b85a,
    },
    // January on the alp: no grass at all — the pasture is under the snow
    // (terrain.ts lays it wherever the climate freezes the ground, which
    // in a winter is the whole flank), and what the paint carries is the
    // dead straw and the dark earth the wind scours bare on a crest, in
    // the cold grey of a mountain with no sun on it.
    winter: {
      base: 0x9a9684,
      baseDark: 0x76746a,
      damp: 0x7a7e72,
      scrub: 0x5a5a4c,
      litter: 0x4e4e40,
      straw: 0xc2bca8,
      soil: 0x6e6658,
    },
  },
  regions: {
    // Rock, scree and snow: nearly all of the paint is the bedrock's.
    highAlpine: { soil: 0x9a9c9a, soilMix: 0.45, moss: 0, dry: 0.12, bare: 0.1 },
    // The summer pasture: the plain bright meadow the palette was written
    // for, with the odd bare cattle track.
    alp: { soil: 0x7fbf3e, soilMix: 0, moss: 0.02, dry: 0.06, bare: 0.03 },
    // Under the conifers: darker, needle litter, shade.
    subalpine: { soil: 0x556a30, soilMix: 0.32, moss: 0.12, dry: 0, bare: 0.04 },
    // The farmed floor: mown, greener, tidier.
    valley: { soil: 0x74b53c, soilMix: 0.1, moss: 0.04, dry: 0.02, bare: 0.02 },
    // A forested ravine: wet, dark, mossy.
    gorge: { soil: 0x4f6a30, soilMix: 0.4, moss: 0.2, dry: 0, bare: 0.06 },
  },
  // The species are the taiga's below the treeline (a Norway spruce is a
  // Norway spruce) and the alpine roster's (flora-alpine.ts) from where the
  // spruce wood opens out: arolla and flagged larch at the treeline,
  // mountain pine lying on the rock over it, alpenrose and flowers on the
  // alp. The soft ones (`SOFT_FLORA` in planting.ts) are app-placed and
  // driven over; the rest dress the engine's solid trunks.
  communities: [
    {
      // The montane spruce forest: closed, dark, straight trunks, with
      // the odd larch in it and the alpenrose starting under the gaps.
      id: "spruceForest",
      weight: 3,
      density: 1.05,
      trees: {
        spruceTall: 12,
        spruceDark: 7,
        spruceOld: 4,
        spruceLean: 2,
        spruceYoung: 4,
        spruceSapling: 3,
        firSlim: 4,
        firDense: 2,
        larch: 2,
        deadSnag: 1.5,
        brokenTrunk: 1,
        spruceGiant: 0.3,
      },
      undergrowth: {
        mossPatch: 8,
        fern: 5,
        berryBush: 4,
        alpenrose: 3,
        heathShrub: 1,
        fallenBranch: 2,
      },
    },
    {
      // The larch and arolla wood toward the treeline: open, light, gold
      // in October, with the black-green stone pines standing through it
      // and the silver snags of the ones that died.
      id: "larchWood",
      weight: 2.5,
      density: 0.7,
      trees: {
        larch: 6,
        larchOld: 4,
        larchAlpine: 6,
        arolla: 6,
        arollaOld: 3,
        arollaYoung: 3,
        spruceSquat: 2,
        deadArolla: 1.5,
        juniper: 2,
      },
      undergrowth: {
        alpineGrass: 8,
        alpenrose: 6,
        berryBush: 4,
        alpineFlowers: 2,
        juniper: 2,
        heathShrub: 1,
      },
      groundCover: 1.2,
    },
    {
      // The krummholz belt: mountain pine and juniper crawling over the
      // rock at the very top of the trees, a stone pine or a flagged larch
      // standing alone in it.
      id: "krummholz",
      weight: 1.2,
      density: 0.28,
      trees: {
        mountainPine: 12,
        juniper: 6,
        arollaYoung: 3,
        arolla: 1.5,
        larchAlpine: 1.5,
        spruceSquat: 1,
        deadArolla: 2,
      },
      undergrowth: {
        mountainPine: 5,
        alpenrose: 6,
        juniper: 3,
        alpineGrass: 5,
        heathShrub: 2,
        cairn: 0.4,
      },
      groundCover: 0.9,
    },
    {
      // The alp: short pasture full of flowers above the trees, a lone
      // arolla, a cairn on the path over it.
      id: "alpMeadow",
      weight: 3,
      density: 0.05,
      trees: { arollaOld: 2, larchAlpine: 3, mountainPine: 3, juniper: 2, spruceSquat: 1 },
      undergrowth: {
        alpineGrass: 12,
        alpineFlowers: 6,
        gentianPatch: 5,
        alpenrose: 3,
        tallGrass: 3,
        cairn: 0.4,
      },
      groundCover: 1.5,
    },
    {
      // The valley's hay meadows and grazing, with a fruit tree and a
      // maple at the field edge — the one place the grass grows long.
      id: "pasture",
      weight: 2.5,
      density: 0.08,
      trees: { maple: 4, rowan: 3, spruceYoung: 2, oak: 1, birch: 2, larch: 1 },
      undergrowth: { tallGrass: 12, alpineFlowers: 4, alpineGrass: 3, fern: 1 },
      groundCover: 1.4,
    },
    {
      // Scree: loose stone, the cairns marking the way over it, and
      // nothing that stands but the odd dead tree.
      id: "scree",
      weight: 1.5,
      density: 0,
      trees: { mountainPine: 1, juniper: 1, deadArolla: 0.5 },
      undergrowth: { cairn: 3, alpineGrass: 3, mossPatch: 2, gentianPatch: 1 },
      groundCover: 0.35,
    },
    {
      // A fen on the alp: sedge, cotton grass, a stunted spruce.
      id: "fen",
      weight: 0.8,
      density: 0.12,
      trees: { spruceSquat: 4, bogPine: 3, willowShrub: 6, deadSnag: 1 },
      undergrowth: { sedgeTuft: 8, cottonGrass: 6, tussock: 5, bogMoss: 4, alpineGrass: 2 },
      groundCover: 1.2,
    },
  ],
  lakeshoreTrees: {
    willowShrub: 10,
    alder: 7,
    willow: 5,
    birchLean: 3,
    spruceYoung: 3,
    driftwood: 2,
  },
  shoreCover: { reeds: 6, sedgeTuft: 6, tussock: 4, tallGrass: 3, cottonGrass: 2 },
  riparianTrees: { alder: 8, willowShrub: 8, birchYoung: 4, spruceYoung: 4, rowan: 2 },
  // Above the treeline: the mountain pine mats, the last arollas and the
  // snags of the ones before them, then nothing.
  highlandTrees: {
    mountainPine: 10,
    juniper: 5,
    arollaOld: 2,
    larchAlpine: 3,
    spruceSquat: 1,
    deadArolla: 3,
  },
  undergrowth: {
    alpineGrass: 8,
    tallGrass: 5,
    alpenrose: 3,
    alpineFlowers: 2,
    heathShrub: 2,
    mossPatch: 3,
    fern: 2,
    berryBush: 2,
  },
  undergrowthDensity: 1.0,
  vergeCover: { alpineGrass: 3, tallGrass: 2, alpineFlowers: 1 },
  // Lichen rather than moss: a mountain stone is grey with a green-grey
  // crust, and most of them lie bare.
  mossyStone: 0.2,
  // The road's stone is the mountain's: grey granite chippings, and grey
  // dust on the verge.
  grit: 0x9b9c96,
};
