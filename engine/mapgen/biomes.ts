// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R40 — THE BIOME: which COUNTRY a stage is built in, as data.
//
// A biome is everything about a landscape that is not the road: what kind
// of ground it is made of and how it stands, whether there is water in it,
// what grows on it and in what company, and what the weather over it can
// be. Three exist — the boreal taiga the game launched with, a hot desert,
// and a high alpine range — and the difference between them is stated
// here, once, as rows the rest of the generator reads. Nothing else in
// `mapgen/` knows the word "desert" or "alpine": the geology asks the biome
// whether the country holds water, whether the wind has piled it into
// dunes and whether a massif stands over it, the prop field asks it which
// communities quilt the ground and whether a forest sheds timber, the
// search asks it whether a straight may cross water at all, how hard to
// read the country when it picks which way a corner turns, and whether a
// cut too deep to blast is bored through instead.
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

export type BiomeId = "taiga" | "desert" | "alpine";

/** Every biome, in the order they are offered. */
export const BIOME_IDS: readonly BiomeId[] = ["taiga", "desert", "alpine"];

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
   * the period of the slow mask that says where the sand sea is at all.
   *
   * The row is the country at the DUNE dial's rest position, and the dial
   * builds every other one out of it (`STAGE_RULES.dunes`, `landOf`): a
   * caller reading this row rather than `landOf(knobs).dunes` is reading
   * the sand the row was written for and not the sand the player asked
   * for. Never null on a row a dial can move: a country whose sand has
   * been dialled away comes back with `dunes: null`, and that is what
   * "there is no sand here" means everywhere downstream. */
  dunes: { amp: number; scale: number; stretch: number; field: number } | null;
  /** A soft FLOOR under the rock, m over the lake table, or null. Where a
   * country has no water its hollows do not fill — they flatten into pans,
   * and this is the level they flatten to. It also keeps the whole of a dry
   * country above the table, so nothing downstream mistakes a low plain
   * for a lake bed. In a mountain country it is the VALLEY FLOOR: the flat
   * a glacier left, with the lakes cut into it and the villages on it. */
  floor: number | null;
  /** THE MASSIF (R47): a mountain range the whole country is made of, or
   * null where the country has only the taiga's low chains. `scale` is the
   * period of the main ridge system across the map, m — a valley and the
   * ridge beside it; `height` how high a crest stands over the valley
   * floor before the `elevation` dial and the seed's smoothness scale it,
   * m; `sharp` the exponent on the folded ridge noise that bends a flank
   * concave — gentle at the foot, steep under the crest, which is the
   * profile a real mountain has and the one that leaves a valley floor a
   * road can be laid along; `valley` the share of the folded noise under
   * which the ground is VALLEY FLOOR rather than flank — value noise
   * seldom reaches its own extremes, so without it the fold's low ground
   * is a broad upland and its crests never stand full height, and with it
   * the floors are flat and the flanks climb the whole `height` between
   * one floor and the next crest (the `peaks` dial reads both the period
   * and the floor share across `STAGE_RULES.massif.peaks`; the row's own
   * numbers are what the dial's middle builds); `spurs` how much of a second and third
   * octave of ridges stand on the first, the side ridges and gullies that
   * break a flank into shoulders; `flankRef` the grade, m per m, at which
   * the flank counts as fully scoured — steeper than the taiga's hills,
   * because a mountain forest stands on ground the taiga's soil rule would
   * call bare; `swell` and `hills` scale the taiga's own two layers down
   * under the massif, so a valley floor is a floor and not a rolling
   * plain with a mountain on it. */
  massif: {
    scale: number;
    height: number;
    sharp: number;
    valley: number;
    spurs: number;
    flankRef: number;
    swell: number;
    hills: number;
  } | null;
  /** THE ELEVATION ZONES, m of world height (the lake table is `LAKE_Y`,
   * a valley floor a few metres over it). `treeline` is where the soil
   * thins to nothing and the trunks stop; `rock` the band over which the
   * ground paint goes from meadow to bare stone; `snow` where the stone
   * goes under snow on anything but a face, or null in a country that has
   * none. The taiga's are the numbers its paint and its planting were
   * written against; the alpine's are what the massif's height makes of
   * them, and every side of the world reads them from here. */
  zones: { treeline: number; rock: { from: number; to: number }; snow: number | null };
  /** R47 — how hard the route search READS THE COUNTRY when it chooses
   * which way a corner turns, 0 (the dice) to 1 (always the side the
   * road can follow). A road in a mountain country is laid along its
   * contours and turns back on itself where it cannot; the search that
   * built the taiga draws its corners blind and rejects what will not
   * sit, which on a flank finds nothing. */
  steer: number;
  /** R47 — whether a cut deeper than a road would be blasted is BORED
   * instead: the straight goes through the shoulder as a tunnel, the
   * country stands over it, and the search accepts what it would
   * otherwise refuse. */
  tunnels: boolean;
  /** Multiplier on the grade a road may follow the country at
   * (`elevation.follow.grade`). A mountain pass is built steeper than a
   * forest road because it has further to climb. */
  grade: number;
  /** Multiplier on how far a road may stand OFF the country (R34's
   * `maxFill` and `maxCut`). A mountain road is built on bigger
   * earthworks than a forest road — a retaining wall under it, a face
   * blasted over it — and held to the taiga's caps the search refuses
   * nearly every line across a flank and walks a pocket for seconds. */
  earthworks: number;
  /** R35 — whether the stage STARTS ON THE HIGH GROUND: the origin is
   * sited on the highest shoulder the start's footprint will sit on, so
   * the stage runs down off the mountain rather than across a valley. */
  startHigh: boolean;
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
   * that is `blown` below rather than this. */
  rain: boolean;
  /** Whether THE WIND PICKS THIS COUNTRY UP AND CARRIES IT: whether a
   * front here is a wall of its own ground in the air
   * (`game/sandstorm.ts`). It takes loose dry material and nothing holding
   * it down, which is the desert and only the desert — a taiga gale blows
   * through a forest that is rooted, and an alpine one over rock and snow.
   *
   * It is the flag the SANDSTORM row is offered on, so a fourth country
   * made of sand would be offered it without anybody having to come back
   * here. */
  blown: boolean;
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
  /** R40 — what kind of HOUSE stands on its yards and along its streets:
   * the Nordic timber house, or the alpine chalet (`HouseStyle`). A country
   * nobody lives in still names one, so the type has no hole in it. */
  houses: "nordic" | "chalet";
  /** R41 — whether the country carries a RAILWAY: a single track laid across
   * the map before the rally, that the route may cross square on a ramp and
   * that a train runs down every so often. */
  railway: boolean;
  /** R43 — whether the country MAKES POWER: the wind farms on its high
   * ground and the solar farms on its flats. A modern, settled country
   * does; a desert road a hundred kilometres from anywhere carries no grid
   * to feed. */
  energy: boolean;
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
  land: {
    relief: 1,
    mountains: 1,
    dunes: null,
    floor: null,
    massif: null,
    // The rock line the taiga's paint was written against, and the height
    // the ice scoured its high ground bare at — in effect the treeline of
    // a country that never has one, since its hills barely reach it.
    zones: { treeline: 46, rock: { from: 26, to: 52 }, snow: null },
    steer: 0,
    tunnels: false,
    grade: 1,
    earthworks: 1,
    startHigh: false,
  },
  weathers: ["clear", "rain", "storm"],
  rain: true,
  // A gale through a forest is a gale through a forest: the ground under
  // it is rooted, wet for most of the year, and goes nowhere.
  blown: false,
  latitude: 62,
  settled: true,
  farms: true,
  houses: "nordic",
  railway: true,
  energy: true,
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
    // THE SAND IS THE COUNTRY. A dune every 300 m across the wind,
    // standing twenty-two metres over the trough and running four times as
    // long as it is wide — the same size of shape the taiga's hills are
    // (`geology.bedrock.hills`, 21 m over 130 m), because the sand has to
    // be to this country what the hills are to that one: the layer a
    // DRIVER reads, the thing crested and dropped into. A road laid along
    // the wind rides a crest for hundreds of metres; one laid across it
    // climbs a face and comes over the top blind. The mask puts them in
    // ergs a kilometre and a half across with flat pans between, so a
    // stage crosses sand sea and open pan rather than being laid in one or
    // the other.
    //
    // The DUNE dial moves all three together (`STAGE_RULES.dunes`): this
    // row is the country at its rest position and nothing more.
    dunes: { amp: 22, scale: 300, stretch: 4, field: 1500 },
    // Fourteen metres over the lake table. The ROAD rides its own rolling
    // profile on top of the country (`elevation.amplitude`, up to ten
    // metres here at the top of the dial), so the pans have to stand high
    // enough that a road dipping through one never reaches the table: below
    // it the previews paint water and the flora keeps off the "shore". The
    // rock line that paints the high ground as bare stone is still well
    // above the pans, and the ranges still stand over them.
    floor: 14,
    massif: null,
    zones: { treeline: 46, rock: { from: 26, to: 52 }, snow: null },
    steer: 0,
    tunnels: false,
    grade: 1,
    earthworks: 1,
    startHigh: false,
  },
  weathers: ["clear", "storm"],
  rain: false,
  // The whole country is loose and dry, so the storm here is made of the
  // country: a haboob, and the one weather in this game that arrives.
  blown: true,
  latitude: 33,
  // Nobody lives out here and nothing is farmed: no homestead, no town, and
  // no barn. The railway that does cross a desert is a different railway
  // from the one through the forest and is not laid yet.
  settled: false,
  farms: false,
  houses: "nordic",
  railway: false,
  // No grid out here to feed a wind farm into, and nobody to fence a
  // solar farm for: the desert is not a place for the modern country's
  // machinery.
  energy: false,
};

// ── The alpine ────────────────────────────────────────────────────────────

/** The five kinds of mountain country, and they are ZONES more than they
 * are places: which one a patch falls in is re-weighted by its height as
 * well as by the region noise (`props.ts` reads the zones), so a stage
 * that starts on a pass and ends in a valley crosses all five in order.
 * The HIGH ALPINE is rock, scree and snow with nothing on it that stands;
 * the ALP is the summer pasture above the trees — bright grass, boulders,
 * a hut, cattle; the SUBALPINE is the mountain forest, larch and arolla
 * pine opening out toward the top and spruce closing in below; the
 * VALLEY is the farmed floor, and the GORGE the forested ravine a stream
 * has cut down a flank. */
const ALPINE_REGIONS: readonly Region[] = [
  {
    id: "highAlpine",
    weight: 2,
    forest: 0.25,
    groves: {
      scree: 5,
      alpMeadow: 1.2,
      krummholz: 0.8,
      larchWood: 0,
      spruceForest: 0,
      pasture: 0,
      fen: 0.1,
    },
  },
  {
    id: "alp",
    weight: 2.5,
    forest: 0.5,
    groves: {
      alpMeadow: 6,
      krummholz: 2,
      scree: 1.2,
      larchWood: 0.8,
      spruceForest: 0,
      pasture: 0.2,
      fen: 0.6,
    },
  },
  {
    id: "subalpine",
    weight: 3,
    forest: 1.1,
    groves: {
      larchWood: 4,
      spruceForest: 3,
      krummholz: 0.6,
      alpMeadow: 1.5,
      scree: 0.4,
      pasture: 0.3,
      fen: 0.3,
    },
  },
  {
    id: "valley",
    weight: 2.5,
    forest: 0.7,
    groves: {
      pasture: 6,
      spruceForest: 1.6,
      larchWood: 0.4,
      alpMeadow: 0.8,
      fen: 0.8,
      scree: 0,
      krummholz: 0,
    },
  },
  {
    id: "gorge",
    weight: 1,
    forest: 1.3,
    groves: {
      spruceForest: 6,
      larchWood: 1.5,
      scree: 1,
      alpMeadow: 0.2,
      pasture: 0,
      krummholz: 0.2,
      fen: 0.4,
    },
  },
];

/** The alpine communities. The mountain forest is a real forest and its
 * density says so; everything above the treeline is open by definition,
 * and the scree carries nothing that stands at all. */
const ALPINE_GROVES: readonly GroveCommunity[] = [
  { id: "spruceForest", weight: 3, density: 1.05 },
  { id: "larchWood", weight: 2.5, density: 0.7 },
  { id: "krummholz", weight: 1.2, density: 0.28 },
  { id: "alpMeadow", weight: 3, density: 0.05 },
  { id: "pasture", weight: 2.5, density: 0.08 },
  { id: "scree", weight: 1.5, density: 0 },
  { id: "fen", weight: 0.8, density: 0.12 },
];

/** The high mountains: a massif of ridges and valleys the whole country is
 * made of, standing several hundred metres over valley floors that carry
 * the lakes, the villages and the railway. Water everywhere it can lie —
 * tarns on the shoulders, a lake in every valley — and a forest that
 * stops at a treeline, with pasture above it and bare rock and snow above
 * that. The roads are cut into the flanks, turn back on themselves where
 * a flank is too steep to take straight, and go through a shoulder where
 * they cannot go round it. The stage starts high and comes down. */
export const ALPINE: BiomeRules = {
  id: "alpine",
  label: "ALPINE",
  regions: ALPINE_REGIONS,
  groves: ALPINE_GROVES,
  wetGrove: "fen",
  felled: [],
  timber: null,
  // Graded stone, like the taiga's — but the stone is the mountain's own
  // grey granite and gneiss rather than the shield's brown, which is the
  // renderer's business (`Biome.grit`).
  loose: "gravel",
  water: true,
  deadwood: true,
  land: {
    relief: 1,
    // The taiga's low chains are not wanted under a massif.
    mountains: 0,
    dunes: null,
    // The valley floor: a flat the ice left, a few metres over the lake
    // table so the pits still cut lakes into it and a road down it never
    // reaches the water.
    floor: 6,
    massif: {
      // A valley and the ridge beside it in two and a half kilometres, so
      // a medium stage's box holds a floor with a flank up each side and
      // the crest over one of them. A crest around four hundred and fifty
      // metres over the floor at the middle of the dial, climbed over the
      // seven or eight hundred metres between the floor's edge and the
      // crest — a mean grade over a half, a quarter at the foot and near
      // one under the crest, which is a mountain a road can be got up in
      // hairpins and not a wall.
      scale: 2600,
      height: 340,
      sharp: 1.6,
      valley: 0.3,
      spurs: 0.4,
      flankRef: 0.95,
      swell: 0.3,
      hills: 0.5,
    },
    // The zones, as heights over a valley floor that stands near 0 m: the
    // forest gives out about two-fifths of the way up a full-height
    // crest, the meadow goes over to rock above that, and the tops carry
    // snow on anything but a face. R47 — the ALTITUDE dial reads them as
    // ABSOLUTE lines and subtracts the country's own base off them
    // (`landOf`), so a country standing above its snowline gets a negative
    // one and is white from its valley floor up, which is what a country
    // five kilometres up is.
    zones: { treeline: 190, rock: { from: 220, to: 320 }, snow: 340 },
    // R47 — the land is read on EVERY corner. The mirror is only taken
    // when it fits the country better by `massif.contour.margin`, so the
    // dice still have every corner the land has no opinion about; what
    // holding this under 1 bought was corners drawn blind INTO a flank,
    // and the stage contouring instead of coming down. MEASURED over seeds
    // 1,3,4,7,11,17 at the top of the dial: 0.85 descends 152 m a stage,
    // 0.95 descends 164, and 1 descends 190 at 5.5% mean grade.
    steer: 1,
    tunnels: true,
    // A mountain road climbs at up to nine per cent where a forest road
    // is held to seven and a half, and stands a third again as far off
    // the country on its walls and in its cuts.
    grade: 1.2,
    earthworks: 1.3,
    startHigh: true,
  },
  weathers: ["clear", "rain", "storm"],
  rain: true,
  // Rock, turf and snow: there is nothing up here for the wind to lift.
  blown: false,
  latitude: 46,
  settled: true,
  farms: true,
  // The chalet: stone below, dark timber above, a low roof with deep
  // eaves and a balcony across the front.
  houses: "chalet",
  railway: true,
  // No wind farm stands on a Swiss flank and no solar farm on a pasture:
  // the mountains make their power out of water, which is not laid yet.
  energy: false,
};

export const BIOMES: Record<BiomeId, BiomeRules> = { taiga: TAIGA, desert: DESERT, alpine: ALPINE };

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
