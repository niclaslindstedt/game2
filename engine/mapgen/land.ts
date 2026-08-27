// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The BARE LANDSCAPE: the country before anybody laid a road across it.
// Broad rises, hills, close texture; mountain chains where a slow mask
// says one stands; sea basins and ponds sunk under the water table.
//
// It lives on its own, apart from the terrain field that shapes itself
// around the road, because two things need it and only one of them is the
// terrain. The other is the road NETWORK: a branch leaving a junction has
// to know where the water is before it drives into it, and a road built on
// an embankment across a lake — ending in mid-air over open water — is a
// mistake you can see from a kilometer up. Deterministic in the seed and
// the dials, and nothing else: the same country every time.

import { smooth, valueNoise } from "../lib/noise.ts";
import { createRng } from "../lib/prng.ts";
import { STAGE_RULES as R, knobScale, type StageKnobs } from "./rules.ts";

/** The water table: ground below this floods into lakes and seas, m. */
export const LAKE_Y = -11;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export type LandField = {
  /** Ground height of the bare landscape at a point, m. */
  heightAt: (x: number, z: number) => number;
  /** True where the bare landscape is under water — with a margin, so a
   * road keeps off the shallows and the shoreline as well as the lake. */
  flooded: (x: number, z: number, margin?: number) => boolean;
};

/** The country a seed's stage is laid across, at its dial positions. */
export function createLandField(seed: number, knobs: StageKnobs): LandField {
  const rng = createRng((seed ^ 0x1b873593) >>> 0);
  const noiseSeed = rng.int(1, 1 << 30);
  // How hard the landscape's own relief is turned up, and how much of it
  // stands under water — the `elevation` and `water` dials reach the world
  // beside the road here, exactly as they reach the road itself in the
  // compiler's rolling profile.
  const relief = knobScale(knobs.elevation, R.elevation.knob);
  const ponds = knobScale(knobs.water, R.wet.ponds);

  const heightAt = (x: number, z: number): number => {
    const rolling =
      (valueNoise(x, z, 430, noiseSeed) - 0.5) * 52 +
      (valueNoise(x, z, 150, noiseSeed + 7) - 0.5) * 16 +
      (valueNoise(x, z, 46, noiseSeed + 13) - 0.5) * 4;
    const mountainMask = smooth(clamp01((valueNoise(x, z, 1150, noiseSeed + 17) - 0.58) / 0.42));
    const ridge = 1 - Math.abs(2 * valueNoise(x, z, 300, noiseSeed + 19) - 1);
    // The sea basins answer the `water` dial too — a DRY stage that still
    // ran between lakes would make the dial a liar. Half a dial reproduces
    // the threshold and depth the world had before it existed.
    const seaMask = smooth(
      clamp01((valueNoise(x, z, 1600, noiseSeed + 23) - (0.86 - ponds * 0.3)) / 0.34),
    );
    // Escarpments: a wandering fault line where the ground steps down a
    // dozen meters over a few — the cliff edges the wild's spontaneous
    // jumps launch off. Recentered so the water table stays put.
    const esc = smooth(clamp01((valueNoise(x, z, 520, noiseSeed + 29) - 0.52) / 0.05));
    // Ponds: hollows on a tighter scale than the sea basins, sunk just far
    // enough under the water table to fill. They are what puts water IN the
    // nature — a lake the road runs past, a tarn behind the treeline, water
    // to be driven into and drowned in, rather than only crossed.
    const pond =
      ponds > 0
        ? smooth(clamp01((valueNoise(x, z, 340, noiseSeed + 31) - (0.9 - ponds * 0.14)) / 0.1))
        : 0;
    return (
      (rolling + mountainMask * ridge * ridge * 70 + esc * 13) * relief -
      seaMask * (30 + ponds * 26) -
      pond * (10 + ponds * 8) -
      6
    );
  };

  return {
    heightAt,
    flooded: (x, z, margin = 0) => heightAt(x, z) < LAKE_Y + margin,
  };
}
