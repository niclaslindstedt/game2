// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R40 — THE BIOME: which COUNTRY a stage is built in, as data.
//
// A biome is everything about a landscape that is not the road: what kind
// of ground it is made of and how it stands, whether there is water in it,
// what grows on it and in what company, and what the weather over it can
// be. Two exist — the boreal taiga the game launched with, and a hot
// desert — and the difference between them is stated here, once, as rows
// the rest of the generator reads. Nothing else in `mapgen/` knows the
// word "desert": the geology asks the biome whether the country holds
// water and whether the wind has piled it into dunes, the prop field asks
// it which communities quilt the ground and whether a forest sheds timber,
// the search asks it whether a straight may cross water at all.
//
// The quilt lives HERE rather than in the renderer because what it places
// is solid: the trunks the car collides with are drawn from these rows on
// both sides of the world (props.ts), and the renderer's own biome table
// (pwa/src/game/biome-*.ts) supplies the species for each id. That table
// is checked against this one at import, so a community named on one side
// and not the other fails on the first stage built rather than on the one
// seed that rolls it.
//
// The biome is a DIAL like the others (`StageKnobs.biome`): a campaign
// location is a biome, Roam offers it beside the hills and the water, and
// a track carries it in `track.knobs` so the terrain field, the renderer
// and the tooling all build the same country without being told twice.

import type { Weather } from "../game/state.ts";

export type BiomeId = "taiga" | "desert";

/** Every biome, in the order they are offered. */
export const BIOME_IDS: readonly BiomeId[] = ["taiga", "desert"];

// ── The sub-regions ───────────────────────────────────────────────────────

/** One kind of country. `forest` scales the trunk density across the whole
 * region; `groves` multiplies each community's share of the quilt inside
 * it (a community not named keeps its own weight, one at 0 never appears
 * there at all). */
export type Region = {
  id: string;
  weight: number;
  forest: number;
  groves: Record<string, number>;
};

/** One plant community's PLACEMENT data: its share of the landscape (before
 * the region re-weights it) and how much of its ground carries a solid tree
 * (0 open, 1 closed forest, above 1 a wall). */
export type GroveCommunity = { id: string; weight: number; density: number };

/** Meters of region-noise period — how big one kind of country is. Several
 * hundred metres of stage, so a run crosses a handful of them. */
export const REGION_SCALE = 900;

/** Meters of grove-noise period — how big one community's patch is. */
export const GROVE_SCALE = 150;

/** How the bare rock of a country stands, and what lies on it. */
export type BiomeLand = {
  /** Multiplier on the whole of the relief the `elevation` dial asks for.
   * Under 1 is a country that has been worn flatter than the taiga's. */
  relief: number;
  /** Multiplier on the mountain chains alone — how much of that relief is
   * allowed to stand up as a range rather than roll. */
  mountains: number;
  /** DUNES: wind-blown sand piled on the rock as a ridged field, or null
   * where the country has none. `amp` is how high a ridge stands over the
   * trough beside it, m; `scale` the period across the wind, m; `stretch`
   * how much longer a dune runs along the wind than it is wide; `field`
   * the period of the slow mask that says where the sand sea is at all. */
  dunes: { amp: number; scale: number; stretch: number; field: number } | null;
  /** A soft FLOOR under the rock, m over the lake table, or null. Where a
   * country has no water its hollows do not fill — they flatten into pans,
   * and this is the level they flatten to. It also keeps the whole of a dry
   * country above the table, so nothing downstream mistakes a low plain
   * for a lake bed. */
  floor: number | null;
};

export type BiomeRules = {
  id: BiomeId;
  /** What the menus and the previews call it. */
  label: string;
  /** The kinds of country the stage is quilted from, coarsest scale. */
  regions: readonly Region[];
  /** The plant communities inside them. */
  groves: readonly GroveCommunity[];
  /** R32 — the community that owns any ground within a boot's depth of the
   * water table whatever the quilt rolled, or null in a country whose
   * groundwater never reaches the surface. */
  wetGrove: string | null;
  /** Communities that are ALL stumps whatever their density says, because
   * being cut over is what they are. */
  felled: readonly string[];
  /** The community whose blocks get cut timber stacked at the roadside. */
  timber: string | null;
  /** What an unsealed road in this country is bladed out of: graded stone,
   * or the sand the country is made of. The physics tells the two apart
   * (`TUNING.surfaces`); everything about the road's SHAPE treats them the
   * same (`isLoose`). */
  loose: "gravel" | "sand";
  /** Whether the country carries WATER at all: a groundwater table that
   * surfaces, basins that fill, fords and bridges on the route, and the
   * watercourses R18 traces through them. A dry country has none of it. */
  water: boolean;
  /** Whether the forest sheds DEAD WOOD — blowdowns down the fall line,
   * root plates, cut stumps. A country with no trees to fall has none. */
  deadwood: boolean;
  land: BiomeLand;
  /** The weathers the sky over this country can be in. */
  weathers: readonly Weather[];
  /** Whether its weather is WET: whether rain and a storm here put water
   * on the road and on the glass. A desert's storm is wind and sand, and
   * the engine's wind is all of it that reaches the car. */
  rain: boolean;
  /** Where on earth it is, degrees north — what the sun's height and the
   * warmth of its light are derived from (pwa/src/game/sky.ts). */
  latitude: number;
  /** R37/R39 — whether anybody LIVES in this country: the homesteads off
   * the stage and the towns along its tarmac. A desert road runs for a
   * hundred kilometres between one place and the next, and a stage is four
   * of them — so a desert stage is empty country, and the tarmac it meets
   * is going somewhere the rally never sees. */
  settled: boolean;
  /** R37 — whether a homestead here may be a FARM: a barn bigger than the
   * house, a fenced paddock with stock in it, a field, and the machinery
   * outside the barn. Only where the country is farmed at all. */
  farms: boolean;
  /** R41 — whether the country carries a RAILWAY: a single track laid across
   * the map before the rally, that the route may cross square on a ramp and
   * that a train runs down every so often. */
  railway: boolean;
};

// ── The taiga ─────────────────────────────────────────────────────────────

/** The five kinds of country a taiga stage is quilted from. Lakeside and
 * river valley are deliberately NOT here: those are decided by where the
 * water actually is (the biome's contextual overrides), and a noise field
 * that put a lakeside where there is no lake would be lying. */
const TAIGA_REGIONS: readonly Region[] = [
  {
    id: "denseForest",
    weight: 3,
    forest: 1.3,
    groves: {
      denseStand: 5,
      spruceWood: 3,
      oldGrowth: 2.5,
      clearing: 0.6,
      meadow: 0.1,
      logging: 0,
    },
  },
  {
    id: "openTaiga",
    weight: 3,
    forest: 0.85,
    groves: {
      pineHeath: 2,
      birchGrove: 1.6,
      meadow: 2,
      clearing: 1.6,
      denseStand: 0.2,
      logging: 0,
    },
  },
  {
    id: "logging",
    weight: 1.1,
    forest: 0.75,
    groves: {
      logging: 7,
      youngStand: 4,
      clearing: 2,
      spruceWood: 1,
      denseStand: 0.4,
      oldGrowth: 0.2,
      meadow: 0.4,
    },
  },
  {
    id: "bog",
    weight: 1.1,
    forest: 0.5,
    groves: { bog: 8, meadow: 1.4, pineHeath: 0.8, spruceWood: 0.15, denseStand: 0, logging: 0 },
  },
  {
    id: "burn",
    weight: 0.8,
    forest: 0.7,
    groves: {
      deadStand: 7,
      youngStand: 2.5,
      clearing: 1.5,
      meadow: 0.8,
      denseStand: 0,
      oldGrowth: 0,
      logging: 0,
    },
  },
];

const TAIGA_GROVES: readonly GroveCommunity[] = [
  { id: "spruceWood", weight: 3, density: 1 },
  { id: "denseStand", weight: 1.4, density: 1.7 },
  { id: "pineHeath", weight: 2.5, density: 0.8 },
  { id: "birchGrove", weight: 2, density: 0.9 },
  { id: "oldGrowth", weight: 2, density: 1 },
  { id: "broadleafGrove", weight: 1.5, density: 0.85 },
  { id: "larchStand", weight: 1, density: 0.85 },
  { id: "youngStand", weight: 1.2, density: 1.35 },
  { id: "deadStand", weight: 0.8, density: 0.5 },
  { id: "clearing", weight: 1.4, density: 0.14 },
  { id: "logging", weight: 0.9, density: 0.22 },
  { id: "bog", weight: 1, density: 0.3 },
  { id: "meadow", weight: 2.5, density: 0.06 },
];

/** The boreal forest: spruce woods and pine heaths quilted with birch
 * groves, clearings, logging blocks and bogs, on glaciated rock with lakes
 * in every hollow. The country every rule was written against, so every
 * multiplier here is 1. */
export const TAIGA: BiomeRules = {
  id: "taiga",
  label: "TAIGA",
  regions: TAIGA_REGIONS,
  groves: TAIGA_GROVES,
  wetGrove: "bog",
  felled: ["logging", "deadStand"],
  timber: "logging",
  loose: "gravel",
  water: true,
  deadwood: true,
  land: { relief: 1, mountains: 1, dunes: null, floor: null },
  weathers: ["clear", "rain", "storm"],
  rain: true,
  latitude: 62,
  settled: true,
  farms: true,
  railway: true,
};

// ── The desert ────────────────────────────────────────────────────────────

/** The five kinds of desert. The BAJADA is the classic Sonoran picture —
 * the gravel fan under the hills where the saguaros stand; the MOJAVE is
 * higher and colder and grows Joshua trees instead; the FLATS are the
 * creosote plain with the odd dry lake in it; the SAND SEA is dunes and
 * next to nothing on them; the BADLANDS are the broken rock the road has
 * to climb through. As in the taiga, nothing here says where the water
 * is — there is none. */
const DESERT_REGIONS: readonly Region[] = [
  {
    id: "bajada",
    weight: 3,
    forest: 1,
    groves: {
      saguaroStand: 3,
      scrub: 1.5,
      creosoteFlat: 1,
      mesquiteBosque: 0.6,
      joshuaWood: 0,
      dunes: 0.1,
      saltPan: 0,
    },
  },
  {
    id: "mojave",
    weight: 2,
    forest: 0.9,
    groves: {
      joshuaWood: 4,
      creosoteFlat: 2,
      scrub: 1,
      rockyUpland: 0.8,
      saguaroStand: 0,
      mesquiteBosque: 0,
      saltPan: 0.2,
      dunes: 0.2,
    },
  },
  {
    id: "flats",
    weight: 2.5,
    forest: 0.6,
    groves: {
      creosoteFlat: 4,
      saltPan: 1.5,
      dunes: 1,
      scrub: 1,
      saguaroStand: 0.2,
      joshuaWood: 0.2,
      mesquiteBosque: 0.3,
      rockyUpland: 0,
    },
  },
  {
    id: "sandSea",
    weight: 1.5,
    forest: 0.4,
    groves: {
      dunes: 6,
      creosoteFlat: 1,
      saltPan: 0.5,
      scrub: 0.3,
      saguaroStand: 0,
      joshuaWood: 0,
      mesquiteBosque: 0,
      rockyUpland: 0,
    },
  },
  {
    id: "badlands",
    weight: 1.3,
    forest: 0.7,
    groves: {
      rockyUpland: 4,
      scrub: 2,
      mesquiteBosque: 0.5,
      saguaroStand: 0.5,
      joshuaWood: 0.4,
      creosoteFlat: 0.5,
      dunes: 0,
      saltPan: 0,
    },
  },
];

/** The desert's communities. Densities are a fraction of a taiga wood's,
 * because a desert is open by definition: the "forest" of a saguaro stand
 * is a trunk every fifty metres, and the only place the trees close up at
 * all is a mesquite thicket in a wash. */
const DESERT_GROVES: readonly GroveCommunity[] = [
  { id: "saguaroStand", weight: 2.5, density: 0.42 },
  { id: "joshuaWood", weight: 1.6, density: 0.38 },
  { id: "mesquiteBosque", weight: 1, density: 0.65 },
  { id: "creosoteFlat", weight: 3, density: 0.08 },
  { id: "scrub", weight: 2, density: 0.2 },
  { id: "rockyUpland", weight: 1.2, density: 0.25 },
  { id: "dunes", weight: 1.5, density: 0.03 },
  { id: "saltPan", weight: 1, density: 0 },
];

/** The hot desert: saguaro and creosote on the bajadas, Joshua trees on
 * the high ground, dunes in the sand seas and dry lakes in the flats. No
 * water anywhere — no groundwater that surfaces, no basins that fill, no
 * fords, no bridges, no rivers — and no dead wood, because nothing here is
 * a forest. The relief is worn down and the ranges are low; what the
 * country has instead is the sand the wind has piled across it. */
export const DESERT: BiomeRules = {
  id: "desert",
  label: "DESERT",
  regions: DESERT_REGIONS,
  groves: DESERT_GROVES,
  wetGrove: null,
  felled: [],
  timber: null,
  // The road is bladed out of what is there, and what is there is sand: it
  // holds less than stone, gives way further sideways before it bites, and
  // drags at the car the whole way (`TUNING.surfaces.sand`).
  loose: "sand",
  water: false,
  deadwood: false,
  land: {
    relief: 0.7,
    mountains: 0.45,
    // A ridge every 150 m across the wind, standing seven metres over the
    // trough, four times as long as it is wide — a road laid along the
    // country rides them as a run of crests, and across them as a
    // washboard of blind brows, which is what a desert stage has instead of
    // hills. The mask puts them in fields a kilometre or so across with
    // flat pans between.
    dunes: { amp: 7, scale: 150, stretch: 4, field: 900 },
    // Fourteen metres over the lake table. The ROAD rides its own rolling
    // profile on top of the country (`elevation.amplitude`, up to ten
    // metres here at the top of the dial), so the pans have to stand high
    // enough that a road dipping through one never reaches the table: below
    // it the previews paint water and the flora keeps off the "shore". The
    // rock line that paints the high ground as bare stone is still well
    // above the pans, and the ranges still stand over them.
    floor: 14,
  },
  weathers: ["clear", "storm"],
  rain: false,
  latitude: 33,
  // Nobody lives out here and nothing is farmed: no homestead, no town, and
  // no barn. The railway that does cross a desert is a different railway
  // from the one through the forest and is not laid yet.
  settled: false,
  farms: false,
  railway: false,
};

export const BIOMES: Record<BiomeId, BiomeRules> = { taiga: TAIGA, desert: DESERT };

/** The rules for a biome id. An unknown id (a stale URL, a save from a
 * build that had a biome this one has not) is the taiga, which is the
 * country every seed was built in before there was a choice. */
export function biomeRules(id: string | undefined): BiomeRules {
  return id !== undefined && id in BIOMES ? BIOMES[id as BiomeId] : TAIGA;
}

/** Whether `id` names a biome this build knows. */
export function isBiomeId(id: unknown): id is BiomeId {
  return typeof id === "string" && id in BIOMES;
}
