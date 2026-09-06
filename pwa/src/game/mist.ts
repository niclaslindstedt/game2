// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MIST IN THE VALLEYS — the one cloud that lies on the ground, and
// when it does.
//
// Radiation fog forms on a clear, calm night: the ground radiates its heat
// away, the air on it cools past its dew point, and the water in it comes
// out as a sheet a few metres to a few tens of metres deep that pools in
// the low ground because cold air runs downhill. It is thickest at dawn,
// the sun burns it off over the first hour or two of the morning, and in a
// mountain country it is a whole CLOUD SEA: a pass at six hundred metres
// looks down onto a white floor filling the valley at three, with the
// peaks standing out of it like islands. An autumn morning has the most of
// it (long cold nights, damp ground), a summer one the least, and a desert
// none at all outside its wet season.
//
// DOM-free: this is a RULE, read by environment.ts into the fog's uniforms
// (height-fog.ts) and by the tests.

import type { BiomeId, Season, Weather } from "@engine";

const DEG = Math.PI / 180;

export type Mist = {
  /** How thick it is, 0..1 of a whiteout — the fog's own density is
   * `density × DENSITY_PER_M` per metre inside the layer. */
  density: number;
  /** Where the sheet's top lies, m over the sea. */
  top: number;
  /** How far above the top it thins out over, m — the softness of the
   * upper surface. A shallow ground mist has a hard top a driver looks
   * over; a cloud sea has a soft one. */
  depth: number;
};

/** The extinction inside a full-density layer, per metre: at this a car
 * a hundred metres into the mist is a shape and nothing further is. */
export const DENSITY_PER_M = 0.028;

/** What each season's nights leave in the valleys, 0..1. */
const SEASON_MIST: Record<Season, number> = {
  spring: 0.7,
  summer: 0.5,
  autumn: 1,
  winter: 0.45,
};

/** How each country's valleys hold it: how deep a sheet lies (as a
 * fraction of the stage's own relief, between a floor and a ceiling in
 * metres), how soft its top is, and how much of the season's mist the
 * country gets at all. */
const COUNTRY_MIST: Record<
  BiomeId,
  { share: number; fill: number; least: number; most: number; depth: number }
> = {
  // Shallow sheets over the bogs and the lakes, a few metres deep, with a
  // top the road climbs out of on every rise.
  taiga: { share: 1, fill: 0.12, least: 6, most: 24, depth: 10 },
  // Only in the wet season, and then barely: a haze on the flats at dawn.
  desert: { share: 0.25, fill: 0.05, least: 3, most: 8, depth: 6 },
  // THE CLOUD SEA: the valley fills, and the pass looks down on it.
  alpine: { share: 1.15, fill: 0.32, least: 60, most: 280, depth: 45 },
};

/** How much of a clear day's mist is there at this much sun, 0..1, for a
 * sun on its way up. It is thickest in the hour before sunrise, holds
 * through it, and the sun burns it off by the time it stands ten or
 * twelve degrees up. */
function morningOf(sunUp: number): number {
  const el = sunUp / DEG;
  if (el < -14) return 0.55;
  if (el < -2) return 0.55 + (0.45 * (el + 14)) / 12;
  if (el < 3) return 1;
  if (el < 13) return 1 - (el - 3) / 10;
  return 0;
}

/** …and for a sun on its way down: nothing until the ground has cooled a
 * while after sunset, then the night's sheet forming. */
function eveningOf(sunUp: number): number {
  const el = sunUp / DEG;
  if (el > 0) return 0;
  if (el > -10) return (0.45 * -el) / 10;
  return 0.55;
}

export function mistFor(conditions: {
  /** The real sun's elevation, rad, and whether it is rising. */
  sunUp: number;
  rising: boolean;
  season: Season;
  biome: BiomeId;
  weather: Weather;
  /** Whether the weather here is WET (`rainsIn`): the desert's rain is a
   * haze, not water, and leaves nothing in the valleys. */
  wet: boolean;
  /** The lowest the road goes and the highest, m over the sea — the
   * valley the mist pools in, and the relief it is sized against. */
  floor: number;
  peak: number;
}): Mist {
  const country = COUNTRY_MIST[conditions.biome];
  const relief = Math.max(0, conditions.peak - conditions.floor);
  const top =
    conditions.floor +
    Math.max(country.least, Math.min(country.most, relief * country.fill + country.least));
  let strength: number;
  if (conditions.weather === "clear") {
    strength = conditions.rising ? morningOf(conditions.sunUp) : eveningOf(conditions.sunUp);
    strength *= SEASON_MIST[conditions.season];
  } else if (conditions.wet) {
    // Wet weather keeps cloud in the valleys all day — thinner than the
    // dawn's sheet and never burnt off, because there is no sun to do it.
    strength = conditions.weather === "rain" ? 0.4 : 0.22;
  } else {
    strength = 0;
  }
  // A desert outside its wet season has no water to make a mist of.
  const dry = conditions.biome === "desert" && !conditions.wet;
  const density = dry ? 0 : Math.min(1, strength * country.share);
  return { density, top, depth: country.depth };
}
