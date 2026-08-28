// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The compiled road as flat typed arrays, cached per track.
//
// A stage is a few thousand `TrackSample` OBJECTS, which is the right shape
// for building and drawing one. It is the wrong shape for the two searches
// the run does on every one of its 120 physics steps — locating the car
// against the centerline (game/track.ts) and scanning the corners ahead
// (sim/bot.ts). Both walk dozens of consecutive samples reading two or
// three numbers from each, and object-per-sample turns that into dozens of
// pointer chases through the heap plus, for the surface, a string key into
// a lookup table.
//
// None of these values ever changes once a sample is compiled, so they are
// unpacked once per stage into arrays the CPU can stream.

import type { Surface, Track } from "./compile.ts";

/** Surface codes, as stored in `FlatTrack.surface`. The order is this
 * table's own — index it through `SURFACES`, never by a literal. */
export const SURFACES: readonly Surface[] = ["gravel", "asphalt", "water"];

const CODE_OF: Record<Surface, number> = { gravel: 0, asphalt: 1, water: 2 };

export type FlatTrack = {
  x: Float64Array;
  z: Float64Array;
  /** Arc position along the road, m (`sample.s`). */
  arc: Float64Array;
  /** |curvature|, 1/m — the plan only ever asks how tight, not which way. */
  curvature: Float64Array;
  /** Road height on the crown, m. */
  elevation: Float64Array;
  /** The sample's forward vector, `(sin heading, cos heading)` — and with
   * the signs swapped, its right axis. Projecting a car onto the road needs
   * both on every locate, and a transcendental pair per call is real money
   * at 120 Hz. */
  sinHeading: Float64Array;
  cosHeading: Float64Array;
  /** Index into `SURFACES`. */
  surface: Uint8Array;
};

const CACHE = new WeakMap<Track, FlatTrack>();

// A run drives ONE road, and asks for its arrays half a dozen times per
// physics step — from the locate before the move, the locate after it, the
// finish-line test and the bot's corner scan. A reference compare in front
// of the map turns all of those into two loads.
let lastTrack: Track | null = null;
let lastFlat: FlatTrack | null = null;

/** The flat arrays for a track, built on first use.
 *
 * An endless stage only ever APPENDS samples (compile.ts never removes
 * one), so a longer road extends the arrays and leaves everything already
 * unpacked alone. */
export function flatTrack(track: Track): FlatTrack {
  const samples = track.samples;
  const n = samples.length;
  if (track === lastTrack && lastFlat !== null && lastFlat.x.length === n) return lastFlat;
  const cached = CACHE.get(track);
  if (cached && cached.x.length === n) {
    lastTrack = track;
    lastFlat = cached;
    return cached;
  }
  const flat: FlatTrack = {
    x: new Float64Array(n),
    z: new Float64Array(n),
    arc: new Float64Array(n),
    curvature: new Float64Array(n),
    elevation: new Float64Array(n),
    sinHeading: new Float64Array(n),
    cosHeading: new Float64Array(n),
    surface: new Uint8Array(n),
  };
  let from = 0;
  if (cached) {
    from = cached.x.length;
    flat.x.set(cached.x);
    flat.z.set(cached.z);
    flat.arc.set(cached.arc);
    flat.curvature.set(cached.curvature);
    flat.elevation.set(cached.elevation);
    flat.sinHeading.set(cached.sinHeading);
    flat.cosHeading.set(cached.cosHeading);
    flat.surface.set(cached.surface);
  }
  for (let i = from; i < n; i++) {
    const s = samples[i];
    flat.x[i] = s.x;
    flat.z[i] = s.z;
    flat.arc[i] = s.s;
    flat.curvature[i] = Math.abs(s.curvature);
    flat.elevation[i] = s.elevation;
    flat.sinHeading[i] = Math.sin(s.heading);
    flat.cosHeading[i] = Math.cos(s.heading);
    flat.surface[i] = CODE_OF[s.surface];
  }
  CACHE.set(track, flat);
  lastTrack = track;
  lastFlat = flat;
  return flat;
}
