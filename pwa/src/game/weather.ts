// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW BAD THE WEATHER IS — the two numbers everything wet is scaled by, and
// both of them are read off the WIND rather than invented.
//
// The engine seeds a mean wind speed inside a band per weather and then
// breathes gusts around it (`TUNING.wind`), which is exactly the shape
// weather has: a stage is heavier or lighter than its neighbours, and
// inside one stage the rain arrives in squalls. Taking both from the wind
// means the sky, the sheet of rain, the road bed and the car being shoved
// sideways are all telling the player about the same gust — and that the
// same seed always brings the same weather back.
//
// DOM-free and three-free on purpose: `sky.ts` is a renderer module and
// `drive-bed.ts` is an audio one, and they need the same two numbers.

import { TUNING, biomeRules, type BiomeId, type RaceEnv, type Weather } from "@engine";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** How wet each of the three skies leaves the stage, 0..1 — what picks a
 * surface's wet twin, how loud the rain itself is, and whether the wheels
 * throw clods or dust. Rain is deliberately a good way past half: drizzle
 * is not a weather this game has, and a stage billed as wet that sounds a
 * shade damp is worse than no weather at all. */
const WETNESS: Record<Weather, number> = { clear: 0, rain: 0.6, storm: 1 };

/**
 * HOW WET THE STAGE IS, 0..1 — the weather read against the COUNTRY it is
 * over (R40). A storm in the taiga is a downpour; the same storm in the
 * desert is wind and sand and puts nothing on the road at all. Everything
 * that swaps a dry thing for a wet one (the road's voice, the plume for the
 * clods, the film on the glass) asks this rather than the weather, so no
 * desert stage is ever a wet one however the sky is set.
 */
export function wetnessOf(env: Pick<RaceEnv, "weather">, biome: BiomeId): number {
  return biomeRules(biome).rain ? WETNESS[env.weather] : 0;
}

/**
 * HOW HEAVY THIS STAGE'S WEATHER IS, 0..1 — where its own seeded wind sits
 * inside the band its weather allows.
 *
 * The stage with more wind in it is the stage with the lower, darker,
 * harder-raining ceiling, every time. A single authored grey is what makes
 * every wet stage in a game look like the same wet stage.
 */
export function coverOf(env: RaceEnv): number {
  const [lo, hi] = TUNING.wind.speed[env.weather];
  return hi > lo ? clamp01((env.windSpeed - lo) / (hi - lo)) : 0;
}

/**
 * HOW HARD IT IS COMING DOWN RIGHT NOW, 0..1 of the stage's own downpour.
 *
 * A squall IS a gust: the downdraught that carries the water is the
 * downdraught that shoves the car. So this is the live wind vector read
 * against the stage's mean, which means the sheet thickens exactly as the
 * car is pushed — for free, and in step.
 */
export function squallOf(wind: { x: number; z: number }, meanSpeed: number): number {
  if (meanSpeed <= 0.01) return 0.5;
  const gust = Math.hypot(wind.x, wind.z) / meanSpeed;
  // `blowWind` breathes between (1 − gust) and (1 + gust) of the mean, so
  // TUNING's own swing is the range this has to spread over.
  const swing = TUNING.wind.gust;
  return clamp01((gust - (1 - swing)) / (2 * swing));
}

/**
 * ONE CLAP OF THUNDER, on its way from the strike that made it.
 *
 * The storm draws the flash and knows how far off it was; the audio decides
 * what that sounds like by the time it arrives. This is the whole channel
 * between them, and it carries the distance rather than a loudness — how
 * much of a strike survives a journey is the sound designer's call, not the
 * renderer's.
 */
export type Clap = {
  /** How far the strike was, m. */
  distance: number;
  /** Where it was, -1..1 across the stereo stage. */
  pan: number;
};
