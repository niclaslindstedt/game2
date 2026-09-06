// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE SUN IS — the one piece of astronomy the whole atmosphere hangs
// off. A stage is not driven at "dusk"; it is driven at 19:40 in September
// at 62°N, and dusk is what that turns out to be. Three numbers decide the
// sun's place in the sky, and every one of them is already a fact about the
// stage: the HOUR (`RaceEnv.hour`, run on with the race clock — one minute
// of racing is one hour of sun), the SEASON (the sun's declination) and the
// COUNTRY (its latitude, R40). Nothing here is art-directed; the art
// direction is sky.ts's, keyed on what comes out of here.
//
// The consequences are the point, and they are all real:
//
//   * a taiga stage at 16:00 in winter is driven in the dark, because at
//     62°N the December sun is 8° under the horizon by then;
//   * a midsummer "night" there never gets darker than civil twilight, the
//     sun dipping 4.6° under the horizon at midnight and no further;
//   * a stage started at sunset ends in the dark, and one started in the
//     small hours drives into the dawn;
//   * the sun rises in the north-east in June and the south-east in
//     December, so where the light comes from is the season's, not a
//     constant's.
//
// DOM-free and three-free on purpose: the menu reads it to label an hour,
// the audio reads it to know whether it is night, the tests read all of it.

import { biomeRules, sunHourAt, type BiomeId, type RaceEnv, type Season } from "@engine";

const DEG = Math.PI / 180;

/** Which of the four kinds of light a moment is — what the audio, the
 * music and the menu's hour glyph key on. The sky itself never reads the
 * word: it reads the elevation, and this is that elevation binned. */
export type Daylight = "dawn" | "day" | "dusk" | "night";

/** Where the sun stands at noon, as a WORLD HEADING (radians, the engine's
 * convention: 0 down +z, growing toward +x) — the south, at the latitudes
 * every country here is at. It is the one bearing anything in the world
 * can be stated against, and the compass the migrating birds fly by
 * (skein.ts). Fixed for every stage so that stages, which bend, always
 * cross the light somewhere. */
export const SOUTH = 0.9;

/** The sun's declination in the middle of each season, degrees — mid-May,
 * the June solstice, the last week of September (when "ruska", the north's
 * autumn colour, peaks) and the December solstice. */
export const DECLINATION: Record<Season, number> = {
  spring: 17.5,
  summer: 23.4,
  autumn: -1.8,
  winter: -23.4,
};

/** Below this the sun is NIGHT: the end of civil twilight, six degrees
 * under, radians — the point a real day stops being usable without a lamp.
 * Above `DAY_ABOVE` it is plain day; between the two the word is dawn or
 * dusk by which way the sun is going. */
export const NIGHT_BELOW = -6 * DEG;
export const DAY_ABOVE = 10 * DEG;

export type SunPlace = {
  /** Radians above the horizon; negative under it. */
  elevation: number;
  /** World heading the sun stands at (see `SOUTH`). */
  azimuth: number;
  /** Whether it is on its way up — before solar noon. */
  rising: boolean;
  /** The hour it was read at, 0..24. */
  hour: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Where the sun is at `hour` (local solar time, 0..24) in `season` over
 * `biome`. The textbook solar position: the hour angle runs 15° an hour
 * either side of noon, and the elevation and azimuth fall out of it with
 * the latitude and the declination. */
export function sunAt(hour: number, season: Season, biome: BiomeId): SunPlace {
  const lat = biomeRules(biome).latitude * DEG;
  const dec = DECLINATION[season] * DEG;
  const h = ((((hour % 24) + 24) % 24) - 12) * 15 * DEG;
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  const elevation = Math.asin(clamp(sinEl, -1, 1));
  // Azimuth measured from the south, positive toward the west — so it is
  // negative all morning and swings through zero at noon.
  const fromSouth = Math.atan2(
    Math.sin(h),
    Math.cos(h) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat),
  );
  return { elevation, azimuth: SOUTH + fromSouth, rising: h < 0, hour };
}

/** The sun's place at race time `t` on a run's conditions. */
export function sunNow(env: Pick<RaceEnv, "hour" | "season">, t: number, biome: BiomeId): SunPlace {
  return sunAt(sunHourAt(env, t), env.season, biome);
}

/** The full moon's place — dead opposite the sun, which is what a full moon
 * IS: high at midnight in winter, barely over the horizon on a midsummer
 * night, and the key light every dark stage is driven under. */
export function moonAt(sun: SunPlace): { elevation: number; azimuth: number } {
  return { elevation: -sun.elevation, azimuth: sun.azimuth + Math.PI };
}

/** The word for this much sun. */
export function daylightOf(sun: Pick<SunPlace, "elevation" | "rising">): Daylight {
  if (sun.elevation < NIGHT_BELOW) return "night";
  if (sun.elevation >= DAY_ABOVE) return "day";
  return sun.rising ? "dawn" : "dusk";
}

/** …at a given hour. */
export function daylightAt(hour: number, season: Season, biome: BiomeId): Daylight {
  return daylightOf(sunAt(hour, season, biome));
}

/** How much of the sun a body `altitude` metres up still sees when the
 * sun is `elevation` radians off the horizon, 0..1. The horizon DIPS with
 * height — by about √(2h/R) — so a cirrus sheet ten kilometres up is in
 * full sun for a quarter of an hour after the ground has lost it, and a
 * contrail burns orange over a valley that has gone grey. This is the
 * whole of what a sunset sky is made of. */
export function litAt(altitude: number, elevation: number): number {
  const EARTH = 6_371_000;
  const dip = Math.sqrt((2 * Math.max(0, altitude)) / EARTH);
  // The disc is half a degree across, so the light goes over a bit more
  // than that rather than at a line.
  const t = clamp((elevation + dip) / (0.6 * DEG) + 0.5, 0, 1);
  return t * t * (3 - 2 * t);
}

/** The hour at which the sun stands at `elevation`, on its way up
 * (`rising`) or down, to within a few minutes — or null when it never
 * reaches it that day (a midsummer night at 62°N never gets down to −8°;
 * a December noon never gets up to +10°). */
export function hourOfElevation(
  elevation: number,
  rising: boolean,
  season: Season,
  biome: BiomeId,
): number | null {
  const from = rising ? 0 : 12;
  const STEP = 1 / 20;
  let was = sunAt(from, season, biome).elevation - elevation;
  for (let h = from + STEP; h <= from + 12 + 1e-9; h += STEP) {
    const now = sunAt(h, season, biome).elevation - elevation;
    if ((rising && was < 0 && now >= 0) || (!rising && was > 0 && now <= 0)) {
      // Linear between the two samples: the arc is a cosine, and a
      // twentieth of an hour of it is straight enough.
      const f = was / (was - now);
      return h - STEP + f * STEP;
    }
    was = now;
  }
  return null;
}

/** The bearing the sun stands at when it is nearest the horizon over the
 * coming hours — the sunrise, or the sunset — as a world heading. A stage
 * started in the morning gets the sunrise, one started after noon the
 * sunset; a day the sun never crosses the horizon on hands back where it
 * comes nearest. The horizon's rings open a gap toward it (environment.ts),
 * so a low sun always has a sea to sit on instead of a wall of rock. */
export function horizonCrossing(hour: number, season: Season, biome: BiomeId): number {
  const rising = sunAt(hour, season, biome).rising;
  const at = hourOfElevation(0, rising, season, biome);
  if (at !== null) return sunAt(at, season, biome).azimuth;
  // Never crosses: the closest it gets is its own extreme — the midnight
  // low of a summer night, or the noon high of a polar winter's day.
  return sunAt(rising ? 0 : 12, season, biome).azimuth;
}

/** The hour the four words a stage used to be set by mean, in THIS season
 * over THIS country — what a stored setting, a `?tod=` link or a campaign
 * level authored as a word is read as. A word names a kind of light, so
 * it is turned into the hour that light happens at: dawn is the sun eight
 * degrees up and climbing, dusk five degrees up and going, night is solar
 * midnight, day is noon. Where the day never gets that high (a December
 * sun at 62°N tops out under five degrees), the sunrise or the sunset
 * itself stands in, and where there is not even one of those, noon. */
export function hourOfWord(word: string, season: Season, biome: BiomeId): number {
  switch (word) {
    case "dawn":
      return (
        hourOfElevation(8 * DEG, true, season, biome) ??
        hourOfElevation(0, true, season, biome) ??
        12
      );
    case "dusk":
      return (
        hourOfElevation(5 * DEG, false, season, biome) ??
        hourOfElevation(0, false, season, biome) ??
        12
      );
    case "night":
      return 0;
    default:
      return 12;
  }
}

/** THE HOUR ROW's stops: every whole hour of the day, labelled as a clock
 * reads them. A stop is a string because the row is a `StepRow`;
 * `hourStop` and `hourOfStop` translate. */
export const HOURS: { id: string; label: string }[] = Array.from({ length: 24 }, (_, h) => ({
  id: String(h),
  label: hourLabel(h),
}));

/** "16:00" — and "16:30" for a half, since the clock runs on. */
export function hourLabel(hour: number): string {
  const total = Math.round((((hour % 24) + 24) % 24) * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The row's stop for a stored hour: the nearest whole one. */
export function hourStop(hour: number): string {
  return String(Math.round((((hour % 24) + 24) % 24) * 1) % 24);
}

/** …and back. Anything that is not a number on the clock is noon. */
export function hourOfStop(stop: string): number {
  const n = Number(stop);
  return Number.isFinite(n) ? ((n % 24) + 24) % 24 : 12;
}

/** A finite hour on the clock, or null — what a URL or a stored blob is
 * read through. */
export function parseHour(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return ((n % 24) + 24) % 24;
}
