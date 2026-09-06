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
import type { Season, Weather } from "./state.ts";

export type Climate = {
  season: Season;
  /** Air temperature at the datum (y = 0), °C. */
  temperature: number;
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
 * temperature named or the season's own in this country. */
export function resolveClimate(
  choice: ClimateChoice | undefined,
  biome: BiomeId | string | undefined,
): Climate {
  const season = choice?.season ?? "summer";
  const named = choice?.temperature;
  const temperature =
    named !== null && named !== undefined && Number.isFinite(named)
      ? named
      : defaultTemperature(biome, season);
  return { season, temperature };
}

/** The air at a height, °C. */
export function temperatureAt(climate: Climate, y: number): number {
  return climate.temperature - CLIMATE.lapse * y;
}

/** The height the air freezes at, m — every height above it is at or
 * under `CLIMATE.freeze`. Below the whole country when the datum itself
 * is frozen. */
export function frostLine(climate: Climate): number {
  return (climate.temperature - CLIMATE.freeze) / CLIMATE.lapse;
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
