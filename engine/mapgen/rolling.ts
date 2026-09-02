// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The road's own ROLL: the undulation a stage carries on top of the country
// it follows (R34). Its own module because two walks read it and they must
// read the same one. The compiler adds it to every sample it emits; the
// route search adds it to the height it walks beside each candidate, so
// that what the search judges — how far two arms of a stage stand apart in
// height (R23), whether a ford lies in its valley (R12), how far the road
// stands off the land (R34) — is the road that gets built and not the base
// under it. A roll the search could not see was six metres of surprise at
// every crossing.

import { createRng } from "../lib/prng.ts";
import { biomeRules } from "./biomes.ts";
import { STAGE_RULES as R, knobScale, type StageKnobs } from "./rules.ts";

/** Lattice size for the elevation noise. The shortest octave's lattice is
 * tens of meters apart, so even a long stage never gets far enough along
 * the profile to notice the wrap. */
export const NOISE_LATTICE = 256;

/** Seeded 1-D value noise: random heights every `spacing` meters, joined by
 * smootherstep so the road has no kinks (a kink is a grade discontinuity,
 * which the car feels as a step). */
export function valueNoise1d(values: number[], s: number, spacing: number): number {
  const t = s / spacing;
  const i = Math.floor(t);
  const f = t - i;
  const a = values[((i % values.length) + values.length) % values.length];
  const b = values[(((i + 1) % values.length) + values.length) % values.length];
  return a + (b - a) * (f * f * f * (f * (f * 6 - 15) + 10));
}

/** The rolling ground under a generated stage: octaves of seeded value noise
 * (R.elevation) summed along arc length. Long waves put the horizon above or
 * below the hood and shorter ones load and unload the car through a
 * straight — but every wave is a different shape, because a road built from
 * sines announces itself as a machine on the first two hills. */
export function buildRolling(seed: number, knobs: StageKnobs): (s: number) => number {
  const rng = createRng((seed ^ 0x7e11a7d1) >>> 0);
  // R40 — a worn country rolls its road less too, by the same share it
  // stands its hills lower (`BiomeLand.relief`): the desert's roll rides on
  // dunes and pans, and a taiga's roll laid over a pan is a road that dips
  // under the lake table on flat ground.
  const relief = knobScale(knobs.elevation, R.elevation.knob) * biomeRules(knobs.biome).land.relief;
  const amplitude = rng.range(R.elevation.amplitude.min, R.elevation.amplitude.max) * relief;
  const wavelength = rng.range(R.elevation.wavelength.min, R.elevation.wavelength.max);
  const roughness = rng.range(R.elevation.roughness.min, R.elevation.roughness.max);
  const octaves = Array.from({ length: R.elevation.octaves }, (_, o) => ({
    values: Array.from({ length: NOISE_LATTICE }, () => rng.range(-1, 1)),
    spacing: wavelength / 2 ** o,
    amplitude: amplitude * roughness ** o,
    // Each octave reads its own lattice from a different place, so they
    // never line up into a shape that looks deliberate.
    offset: rng.range(0, 1e4),
  }));
  return (s: number): number => {
    let y = 0;
    for (const o of octaves) y += o.amplitude * valueNoise1d(o.values, s + o.offset, o.spacing);
    return y;
  };
}

/** How fast the rolling layers advance through a sample, 0–1. Grades live
 * on the straights and flatten through corners — partly stage-design taste
 * (Sega Rally climbs between turns, not through them), but load-bearing
 * too: a car cutting inside a turn sweeps whole samples of arc per physics
 * step, and any real grade across that sweep reads as the ground falling
 * away — a phantom launch. */
export function straightness(curvature: number): number {
  const c = Math.abs(curvature);
  return Math.max(0.06, Math.min(1, 1 / (1 + c * 120)));
}
