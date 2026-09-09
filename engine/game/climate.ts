// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLIMATE — what season a stage is driven in and how cold it is, and
// everything the two decide together: where the ground is frozen, what
// falls out of a wet sky, what the snow on the road is like and how deep
// it lies off it, and which weathers a country has in a given season.
//
// Stated once here, DOM-free, because it is read on both sides of the
// world. The compiler asks it which samples are snow (compile.ts), the
// terrain asks it how deep the blanket beside the road is (terrain.ts), the
// physics asks it how hard the snow holds (car.ts through the sample's
// `bite`), and the renderer asks the same questions again to paint the
// ground, plant the country, grey the sky and choose between rain and
// flakes — so a stage that is white to the eye is white to the wheels.
//
// TEMPERATURE IS A FIELD, NOT A NUMBER. A stage names one temperature, at
// the datum (y = 0, the valley floor), and the air gets colder with height
// at the country's lapse rate — so a mountain stage that starts beside the
// snow is warmer at the bottom of its descent than at the top, the snow
// on the pass is a different snow from the slush in the valley, and the
// same dial that makes a taiga stage a snowfield leaves a desert stage a
// wet one. The height is read off the country's bedrock, which is why the
// answer exists before anything is laid on it: the roads and the nature
// are drawn onto a ground whose temperature is already known.

import { biomeRules, type BiomeId, type BiomeLand } from "../mapgen/biomes.ts";
import { altitudeScale, lapseOf, type StageKnobs } from "../mapgen/rules.ts";
import type { Season, Weather } from "./state.ts";

export type Climate = {
  season: Season;
  /** Air temperature at the datum (y = 0), °C. */
  temperature: number;
  /** R47 — how fast this country's air cools with height, °C per metre.
   * `CLIMATE.lapse` unless the ALTITUDE dial has built a taller country
   * than the biome's row describes, in which case the rate comes down
   * with the same factor its elevation bands went up (`lapseOf`) — the
   * freezing line is a height like the treeline and the snowline, and the
   * three only mean anything against each other.
   *
   * Optional, and the constant when it is missing: a climate stated by
   * hand — a test, a preview tool, a stage from a build that had no dial
   * — is the tuned country's, which is the country it was written for. */
  lapse?: number;
};

/** What a caller may leave unsaid: the season defaults to summer, and the
 * temperature to the season's own in that country (`null` says so
 * explicitly, which is what a menu row set to AUTO stores). */
export type ClimateChoice = { season?: Season; temperature?: number | null };

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];

export const CLIMATE = {
  /** How fast the air cools with height, °C per metre. Real air loses about
   * 6.5° a kilometre; this country is drawn at a fraction of its real
   * height (the alpine's permanent snow stands at 340 m for a range whose
   * real line is nearer 2,800), so the lapse is scaled the same way — a
   * pass 340 m over its valley floor is seven degrees colder, which is
   * about what the drive up a real one buys. */
  lapse: 0.02,
  /** The temperature at and under which water is snow: what falls, and
   * what the ground holds. */
  freeze: 0,
  /** R48 — THE ICE. The air at a body's OWN SURFACE at and under which
   * standing water freezes SOLID, °C: not a skin over a lake but a floor
   * a rally car crosses at speed.
   *
   * It is five degrees under freezing rather than at it because a lake is
   * not a puddle. Water at 0° has a lid on it; what carries a car is the
   * sheet a run of hard nights builds, and -5 at the surface is the
   * shorthand for "it has been properly cold here" — the same shorthand
   * the Nordic ice roads use before they open one. Between 0 and -5 the
   * water is still water: the road glazes, the country whitens, and the
   * lakes are exactly the hazard they were in summer.
   *
   * It is asked of the air at the BODY'S level, not at the datum, because
   * the temperature is a field (see the header): a tarn on a shoulder
   * goes over while the lake in the valley below it is still open, which
   * is the order a real thaw runs in, backwards. */
  ice: -5,
  /** Metres of height over the freezing line the cover takes to reach full
   * depth — a ragged margin rather than a contour drawn round the hill.
   * The paint's own fade (`SNOW.fade`, ground-rules.ts) is this number. */
  fade: 30,
  /** THE BLANKET off the road, where nothing has driven or bladed it.
   * `shallow` metres of it at freezing, settled and wet, deepening to
   * `deep` at `deepAt` degrees and under, where the cold keeps the powder
   * standing as it fell. A car driving into it rides on the snow it has
   * packed under its wheels — `ride` of the depth — and sinks the rest,
   * which is what the sills ploughing through the surface are. It starts
   * at the road's own lip, where the blade or the traffic has cleared it,
   * and reaches full depth `verge` metres out, which is the bank a
   * ploughed road stands between. */
  blanket: { shallow: 0.5, deep: 1.0, deepAt: -15, ride: 0.6, verge: 4 },
  /** HOW HARD THE SNOW HOLDS, by temperature, as a multiplier on the
   * surface's own grip (`TUNING.surfaces.grip.snow`, which is the cold
   * winter's — `at` degrees). Around freezing a packed road glazes: the
   * film of water on the ice is the slipperiest a road ever gets, and it
   * is worst a degree or two UNDER zero, where the surface is ice rather
   * than slush. Colder, the crystals stay sharp and the tread bites them,
   * and by `coldAt` a snow road holds nearly as well as gravel. Warmer
   * than freezing the snow is wet and heavy — slush — which drags but
   * holds a little better than the glaze. Every value keeps the road
   * between gravel and the old alpine's ice, which is the brief: a winter
   * stage slides, and is still a stage somebody can drive. */
  bite: { slush: 0.9, glaze: 0.84, glazeAt: -1, at: -8, cold: 1.14, coldAt: -18 },
  /** DEEP SNOW off the road drags at the whole car as well as the driven
   * wheels: the share of the pull from a standstill it takes, faded out
   * the way the wild's own dig is (`surfaces.natureDig`). More than turf,
   * because the sump is in it. */
  dig: 0.7,
  /** The season's own temperature at the datum, per country, °C. The
   * taiga's is a boreal year at 62°N; the desert's a hot one at 33°N, its
   * winter the wet season the annuals grow on; the alpine's is the VALLEY
   * FLOOR's, seven degrees warmer than its pass. Every non-winter figure
   * keeps the freezing height above the country's own ground — so the
   * campaign's stages, which never name a temperature, are exactly the
   * stages they were before there was one. */
  seasons: {
    taiga: { spring: 8, summer: 18, autumn: 6, winter: -8 },
    desert: { spring: 24, summer: 36, autumn: 26, winter: 12 },
    alpine: { spring: 14, summer: 22, autumn: 10, winter: -4 },
  } satisfies Record<BiomeId, Record<Season, number>>,
  /** Which countries RAIN in which seasons, over and above the weathers on
   * their row: the desert's winter is its wet season. */
  wetSeasons: { desert: ["winter"] } satisfies Partial<Record<BiomeId, readonly Season[]>>,
} as const;

/** The season's own temperature in a country, °C at the datum. */
export function defaultTemperature(biome: BiomeId | string | undefined, season: Season): number {
  return CLIMATE.seasons[biomeRules(biome).id][season];
}

/** A whole climate from what was chosen: the season named or summer, the
 * temperature named or the season's own in this country, and the country's
 * own lapse rate at the altitude its dials build it at. */
export function resolveClimate(choice: ClimateChoice | undefined, knobs: StageKnobs): Climate {
  const season = choice?.season ?? "summer";
  const named = choice?.temperature;
  const lapse = lapseOf(knobs, CLIMATE.lapse);
  // R47 — the datum is y = 0, and on a country the ALTITUDE dial has
  // raised, y = 0 stands `base` metres above the sea. So the air there is
  // the season's own temperature carried up that far and cooled by the
  // country's own lapse rate — which is what puts the freezing line at the
  // same absolute height as the snowline the bands were stretched to, and
  // what makes a stage on a six-thousand-metre country cold on its valley
  // floor rather than only on its summit. A temperature named by hand is
  // the air at the datum and is taken as given.
  const raised = defaultTemperature(knobs.biome, season) - lapse * altitudeScale(knobs).base;
  const temperature =
    named !== null && named !== undefined && Number.isFinite(named) ? named : raised;
  return { season, temperature, lapse };
}

/** How fast the air cools with height under this climate, °C per metre —
 * the country's own where it carries one, and the tuned rate otherwise.
 * Stated once because all three readings below take it. */
function lapse(climate: Climate): number {
  return climate.lapse ?? CLIMATE.lapse;
}

/** The air at a height, °C. */
export function temperatureAt(climate: Climate, y: number): number {
  return climate.temperature - lapse(climate) * y;
}

/** The height the air freezes at, m — every height above it is at or
 * under `CLIMATE.freeze`. Below the whole country when the datum itself
 * is frozen. */
export function frostLine(climate: Climate): number {
  return (climate.temperature - CLIMATE.freeze) / lapse(climate);
}

/** WHERE THE SNOW LIES: the country's own permanent line, or the frost
 * line where the cold brings the snow down under it — the lower of the two.
 * `null` on a country with no permanent snow is Infinity here, so a warm
 * taiga answers "nowhere" the way it always has. */
export function snowlineOf(climate: Climate, zones: BiomeLand["zones"]): number {
  return Math.min(zones.snow ?? Infinity, frostLine(climate));
}

/** ...and how much of the ground at a height is under it, 0..1: nothing
 * under the line, everything `CLIMATE.fade` metres over it. */
export function snowCoverAt(climate: Climate, zones: BiomeLand["zones"], y: number): number {
  return clamp01((y - snowlineOf(climate, zones)) / CLIMATE.fade);
}

/** Whether a country under this climate is white ANYWHERE its ground
 * stands — what decides whether the blanket is laid at all. */
export function snowyCountry(climate: Climate, zones: BiomeLand["zones"]): boolean {
  return zones.snow !== null || frostLine(climate) < zones.rock.to;
}

/** How hard snow at this temperature holds, as a multiplier on the snow
 * surface's own grip — `CLIMATE.bite`, drawn between its four points. */
export function snowBite(temperature: number): number {
  const B = CLIMATE.bite;
  if (temperature >= CLIMATE.freeze) return B.slush;
  if (temperature >= B.glazeAt) {
    return (
      B.slush +
      (B.glaze - B.slush) * clamp01((CLIMATE.freeze - temperature) / (CLIMATE.freeze - B.glazeAt))
    );
  }
  if (temperature >= B.at) {
    return B.glaze + (1 - B.glaze) * clamp01((B.glazeAt - temperature) / (B.glazeAt - B.at));
  }
  return 1 + (B.cold - 1) * clamp01((B.at - temperature) / (B.at - B.coldAt));
}

/** How deep the untouched snow stands at this temperature, m. */
export function blanketDepth(temperature: number): number {
  const B = CLIMATE.blanket;
  return (
    B.shallow +
    (B.deep - B.shallow) * clamp01((CLIMATE.freeze - temperature) / (CLIMATE.freeze - B.deepAt))
  );
}

/** Whether what falls at this temperature is snow. */
export function fallsAsSnow(temperature: number): boolean {
  return temperature <= CLIMATE.freeze;
}

/** WHICH CRYSTAL FALLS — the habits a snow crystal can grow into, in the
 * one order everything that draws them agrees on (`snowHabits`).
 *
 * They are the named forms of the morphology guides, and the four shapes
 * under them are what the eye actually tells apart at a windscreen: a flat
 * six-sided plate, a six-armed star, a rod, and a rod with a plate on each
 * end. */
export const SNOW_HABITS = [
  /** A plain hexagonal plate — the simplest crystal there is, and most of
   * what falls in bitter cold, where it is the "diamond dust" a clear
   * arctic night glitters with. */
  "plate",
  /** The same plate with six ridges run out to its corners. */
  "sectored",
  /** Six broad, blunt arms off a central plate: a star without branches. */
  "stellar",
  /** Six arms carrying side branches — the snowflake of the word. */
  "dendrite",
  /** …and the same crystal grown as far as it goes, the side branches
   * carrying side branches of their own. The largest thing that falls,
   * around 5 mm across. */
  "fern",
  /** A slender rod. */
  "needle",
  /** A short hollow prism — a rod with the proportions of a barrel. */
  "column",
  /** A column with a plate grown on each end: two wheels on an axle. */
  "capped",
] as const;

export type SnowHabit = (typeof SNOW_HABITS)[number];

/** WHAT THE CRYSTALS FALLING AT A TEMPERATURE LOOK LIKE: a weight per
 * habit, in `SNOW_HABITS` order, summing to 1.
 *
 * This is Nakaya's morphology diagram, which is the one fact about snow
 * that a driver can see and that a game almost never says: WHICH crystal
 * grows is decided by how cold the cloud is, and it changes completely
 * over a few degrees. Just under freezing the air makes thin plates and
 * simple stars. Colder, between about -3 and -10, the growth flips to rods
 * — needles and hollow columns, the "small bits of white hair" a guide
 * calls them, and nothing a child would draw. Colder still, and it flips
 * back: -10 to -22 is plate country again, and right around -15 it makes
 * the big six-armed dendrites and ferns everybody pictures. Past -22 the
 * air has too little water left in it for any of that and goes back to
 * small plates and columns.
 *
 * So the flakes in front of a windscreen are a fact about the stage's own
 * cold rather than a bag of sprites, a -6° stage does not look like a -15°
 * one, and the prettiest snow in the game falls in the middle of the range
 * rather than at the bottom of it.
 *
 * A MIX rather than one answer per band, because a real snowfall is never
 * one habit: the crystals in a single fall grew at different heights in
 * the cloud, and the bands blend into each other. The weights are only
 * ever read as odds to draw one crystal against another, so they are
 * shaped for what a sheet of them LOOKS like — the peaks are where the
 * diagram puts them, and no band is ever pure.
 */
export function snowHabits(temperature: number): readonly number[] {
  /** How strongly this temperature sits in a band centred on `at` and
   * `half` degrees wide either side — 1 at the middle, 0 at the edges. */
  const band = (at: number, half: number): number =>
    Math.max(0, 1 - Math.abs(temperature - at) / half);
  // The bands overlap generously, and that is not a hedge: a snowfall is
  // never one habit, because the crystals landing together grew at
  // different HEIGHTS in the same cloud, through several degrees of it, and
  // what reaches the ground is that whole column mixed. A band narrow
  // enough to be pure would be a lie about one stage and a dull one about
  // every other — no taiga winter would ever show a dendrite.
  const warm = band(-1.5, 7);
  const rods = band(-6.5, 7);
  const stars = band(-15, 9);
  const bitter = temperature > -22 ? 0 : Math.min(1, (-22 - temperature) / 8);
  const w = [
    // Plates: the warm band's own, and everything the bitter end has left.
    warm * 0.5 + bitter * 0.6 + stars * 0.15,
    warm * 0.3 + stars * 0.2,
    warm * 0.2 + stars * 0.25,
    stars * 0.25,
    stars * 0.15,
    rods * 0.5,
    rods * 0.35 + bitter * 0.4,
    rods * 0.15,
  ];
  const total = w.reduce((sum, v) => sum + v, 0);
  // Nothing at all is possible only outside every band, which the bitter
  // term rules out below and the warm one above: an even mix is the honest
  // answer there rather than a divide by zero.
  if (total <= 0) return w.map(() => 1 / w.length);
  return w.map((v) => v / total);
}

/** Draw one habit from `snowHabits` at `temperature`, given a roll 0..1 —
 * its index in `SNOW_HABITS`. Stated here beside the weights so nobody has
 * to re-derive what "in habit order, summing to 1" means to use them. */
export function rollSnowHabit(temperature: number, roll: number): number {
  const w = snowHabits(temperature);
  let seen = 0;
  for (let i = 0; i < w.length; i++) {
    seen += w[i];
    if (roll < seen) return i;
  }
  return w.length - 1;
}

/** R48 — whether standing water whose surface stands at `level` has frozen
 * SOLID under this climate: the air at that height, against `CLIMATE.ice`.
 *
 * A body is frozen or it is not — there is no half-frozen lake here. What
 * that buys is worth the simplification: once the answer is one boolean per
 * LEVEL, the pour's own bodies carry it, the route may ask "may I drive
 * across this" of a point, and the physics, the terrain and the renderer
 * all reach the same answer from the same two numbers. */
export function waterFrozen(climate: Climate, level: number): boolean {
  return temperatureAt(climate, level) <= CLIMATE.ice;
}

/** R48 — whether a country under this climate can hold ANY frozen water:
 * its ground has to reach the height the air drops to `CLIMATE.ice` at.
 *
 * A cheap NO for every warm stage, and a loose YES, because it asks about
 * the country's ceiling rather than about where the lakes actually lie —
 * and lakes lie in the hollows, well under it. Callers use it to skip the
 * ice entirely, never to conclude that a particular body is frozen; that
 * is `waterFrozen`'s answer and it needs the body's own level. */
export function icyCountry(climate: Climate, zones: BiomeLand["zones"]): boolean {
  return (climate.temperature - CLIMATE.ice) / lapse(climate) < zones.rock.to;
}

/** Whether this country's rain is WET in this season: its row's own word,
 * or a wet season the climate grants it. */
export function rainsIn(biome: BiomeId | string | undefined, season: Season): boolean {
  const rules = biomeRules(biome);
  const wet = (CLIMATE.wetSeasons as Partial<Record<BiomeId, readonly Season[]>>)[rules.id];
  return rules.rain || (wet?.includes(season) ?? false);
}

/** The weathers a country's sky can be in during a season: its row's, plus
 * rain wherever the season is a wet one. In the order the row lists them,
 * with rain slotted before the storm so the ladder still climbs. */
export function weathersIn(
  biome: BiomeId | string | undefined,
  season: Season,
): readonly Weather[] {
  const rules = biomeRules(biome);
  if (rules.weathers.includes("rain") || !rainsIn(rules.id, season)) return rules.weathers;
  const out: Weather[] = [];
  for (const w of rules.weathers) {
    if (w === "storm") out.push("rain");
    out.push(w);
  }
  if (!out.includes("rain")) out.push("rain");
  return out;
}
