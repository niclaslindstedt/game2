// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The compiled road as flat typed arrays, cached per track.
//
// A stage is a few thousand `TrackSample` OBJECTS, which is the right shape
// for building and drawing one. It is the wrong shape for the two searches
// the run does on every one of its physics steps — locating the car
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
export const SURFACES: readonly Surface[] = ["gravel", "asphalt", "water", "sand"];

const CODE_OF: Record<Surface, number> = { gravel: 0, asphalt: 1, water: 2, sand: 3 };

/** Samples per bounding group, as a power of two: the walk tests alignment
 * with a mask and picks a group with a shift, both on every step it takes. */
export const GROUP_SHIFT = 3;
export const GROUP = 1 << GROUP_SHIFT;

/** Groups per BLOCK — the coarse tier over the groups, for the one search
 * that has the whole road to get through rather than a window of it.
 *
 * A window walk starts from a hint and only ever reads sixty samples, so
 * group circles alone are all it can use. The walk that goes looking for a
 * car whose hint has gone stale has no window to start from, and testing a
 * circle per eight samples down a stage that an endless run never stops
 * appending to is a cost that grows with the length of the run. One tier up
 * divides that by eight again, and against a bound as tight as a car's
 * distance to the road every block but the one it is standing in fails on
 * its first test. */
export const BLOCK_SHIFT = 3;
export const BLOCK = 1 << BLOCK_SHIFT;

/** Below this, a sample is straight: no corner plan has anything to say
 * about it. The same threshold the bot's scan used inline. */
export const STRAIGHT = 1e-4;

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
   * at every step of every car on the road. */
  sinHeading: Float64Array;
  cosHeading: Float64Array;
  /** Index into `SURFACES`. */
  surface: Uint8Array;
  /** How many samples ahead the next one that actually BENDS is; 0 at a
   * sample that bends itself. Two fifths of a stage is dead straight and a
   * corner plan skips every one of those, so it skips them in one jump
   * rather than one at a time. Cyclic on a circuit, where the road runs on
   * into its own start line; on a sprint a value of `samples.length` or
   * more means there is no corner left before the finish. */
  toNextCurve: Int32Array;
  /** Bounding circles over runs of `GROUP` consecutive samples: centre and
   * a radius that reaches every sample in the run.
   *
   * Locating the car searches a sixty-sample window, twice per physics
   * step, and almost all of that window is road the car is nowhere near.
   * A group whose whole circle lies further off than the nearest sample
   * found so far cannot contain a nearer one, so the walk steps over it
   * whole. The radius carries a hair of slack, so the test can only ever
   * decline to skip a group it could have skipped — never the reverse. */
  groupX: Float64Array;
  groupZ: Float64Array;
  groupR: Float64Array;
  /** The same, one tier coarser: a circle over every `BLOCK` groups, for a
   * search with the whole road to cover. See `BLOCK_SHIFT`. */
  blockX: Float64Array;
  blockZ: Float64Array;
  blockR: Float64Array;
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
    toNextCurve: new Int32Array(n),
    groupX: new Float64Array(Math.ceil(n / GROUP)),
    groupZ: new Float64Array(Math.ceil(n / GROUP)),
    groupR: new Float64Array(Math.ceil(n / GROUP)),
    blockX: new Float64Array(Math.ceil(n / (GROUP * BLOCK))),
    blockZ: new Float64Array(Math.ceil(n / (GROUP * BLOCK))),
    blockR: new Float64Array(Math.ceil(n / (GROUP * BLOCK))),
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
    // ...and the circles over them. The rebuilds below start at the group
    // and the block the extension lands IN, because those are the only ones
    // whose samples changed — which means every circle BEHIND the frontier
    // has to be carried over here or it stays at the zero this array was
    // allocated with: a circle of no radius, standing at the world origin.
    // A search then skips it, having proved that nothing three hundred
    // metres away can be the nearest sample — and the road an endless run
    // has already driven quietly stops being findable at all.
    flat.groupX.set(cached.groupX);
    flat.groupZ.set(cached.groupZ);
    flat.groupR.set(cached.groupR);
    flat.blockX.set(cached.blockX);
    flat.blockZ.set(cached.blockZ);
    flat.blockR.set(cached.blockR);
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
  // The group circles, over the samples this build added. A group is only
  // ever finished once, but the last one of a growing endless road is not,
  // so rebuild from the group the extension starts in.
  for (let g = (from / GROUP) | 0; g < flat.groupX.length; g++) {
    const start = g * GROUP;
    const end = Math.min(n, start + GROUP);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = start; i < end; i++) {
      if (flat.x[i] < minX) minX = flat.x[i];
      if (flat.x[i] > maxX) maxX = flat.x[i];
      if (flat.z[i] < minZ) minZ = flat.z[i];
      if (flat.z[i] > maxZ) maxZ = flat.z[i];
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    let r2 = 0;
    for (let i = start; i < end; i++) {
      const dx = flat.x[i] - cx;
      const dz = flat.z[i] - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) r2 = d2;
    }
    flat.groupX[g] = cx;
    flat.groupZ[g] = cz;
    // Slack, so rounding can never shrink the circle below the samples it
    // is standing in for.
    flat.groupR[g] = Math.sqrt(r2) * (1 + 1e-9) + 1e-6;
  }
  // ...and the blocks over them, from the block the extension starts in for
  // the same reason. Built off the SAMPLES rather than off the group
  // circles: a circle around a set of circles has to be grown to reach the
  // furthest point of each, and taking the extremes of the points
  // themselves gives a tighter one for the same work.
  const perBlock = GROUP * BLOCK;
  for (let b = (from / perBlock) | 0; b < flat.blockX.length; b++) {
    const start = b * perBlock;
    const end = Math.min(n, start + perBlock);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = start; i < end; i++) {
      if (flat.x[i] < minX) minX = flat.x[i];
      if (flat.x[i] > maxX) maxX = flat.x[i];
      if (flat.z[i] < minZ) minZ = flat.z[i];
      if (flat.z[i] > maxZ) maxZ = flat.z[i];
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    let r2 = 0;
    for (let i = start; i < end; i++) {
      const dx = flat.x[i] - cx;
      const dz = flat.z[i] - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) r2 = d2;
    }
    flat.blockX[b] = cx;
    flat.blockZ[b] = cz;
    flat.blockR[b] = Math.sqrt(r2) * (1 + 1e-9) + 1e-6;
  }
  // Rebuilt whole rather than extended: a straight tail that a later
  // section puts a corner on has a different answer than it had before.
  let gap = n;
  for (let i = n - 1; i >= 0; i--) {
    if (flat.curvature[i] >= STRAIGHT) gap = 0;
    else gap = gap >= n ? n : gap + 1;
    flat.toNextCurve[i] = gap;
  }
  if (track.circuit) {
    let first = -1;
    for (let i = 0; i < n; i++) {
      if (flat.curvature[i] >= STRAIGHT) {
        first = i;
        break;
      }
    }
    // The straight run at the end of the lap carries on into the start.
    if (first >= 0) {
      for (let i = n - 1; i >= 0 && flat.toNextCurve[i] >= n; i--) {
        flat.toNextCurve[i] = n - i + first;
      }
    }
  }
  CACHE.set(track, flat);
  lastTrack = track;
  lastFlat = flat;
  return flat;
}
