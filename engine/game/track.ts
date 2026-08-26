// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Car-to-track queries: progress tracking along the sampled centerline,
// signed lateral offset, and the driving surface under the car. Progress is
// found by a bounded local search around the last known sample, so the cost
// per step is constant and progress can only creep forward or slightly back
// — a car that leaves the road keeps its last on-road progress for respawn.

import type { Track } from "../mapgen/index.ts";
import { TUNING } from "./defs/tuning.ts";

export type TrackFix = {
  index: number;
  s: number;
  /** Signed lateral offset, meters; positive toward the car's map-view right
   * of the direction of travel. */
  lateral: number;
  /** True when the car is beyond the road edge plus the verge. */
  offRoad: boolean;
  surface: "gravel" | "water" | "nature";
  /** Road height under the car, interpolated between samples — the road is
   * a ramp, not a staircase. */
  elevation: number;
  /** Road slope dy/ds under the car, interpolated the same way. */
  slope: number;
};

/** Locate the car against the centerline, searching near `hint`. */
export function locate(track: Track, x: number, z: number, hint: number): TrackFix {
  const samples = track.samples;
  const lo = Math.max(0, hint - 15);
  const hi = Math.min(samples.length - 1, hint + 45);
  let best = lo;
  let bestD2 = Infinity;
  for (let i = lo; i <= hi; i++) {
    const s = samples[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  const s = samples[best];
  // Project the offset onto the sample's right axis for a signed lateral.
  const dx = x - s.x;
  const dz = z - s.z;
  const rightX = Math.cos(s.heading);
  const rightZ = -Math.sin(s.heading);
  const lateral = dx * rightX + dz * rightZ;
  const halfRoad = track.width / 2;
  const offRoad = Math.abs(lateral) > halfRoad + TUNING.offTrack.verge;
  const surface = offRoad ? "nature" : s.surface;
  // Ground height and slope come from BETWEEN the samples. The nearest
  // sample alone quantizes the road to the 2 m sample grid, and on a graded
  // road that staircase reads as the ground falling away — a car that hops
  // its way up every ramp and phantom-launches at every sample crossing.
  // Project onto the sample's forward axis, then blend toward the neighbour
  // the car is heading for.
  const along = dx * Math.sin(s.heading) + dz * Math.cos(s.heading);
  const next = clampIndex(samples, best + Math.sign(along));
  const f = Math.min(1, Math.abs(along) / track.step);
  const elevation = s.elevation + (samples[next].elevation - s.elevation) * f;
  const slope = slopeAt(track, best) + (slopeAt(track, next) - slopeAt(track, best)) * f;
  return { index: best, s: s.s, lateral, offRoad, surface, elevation, slope };
}

function clampIndex(samples: { length: number }, index: number): number {
  return Math.min(samples.length - 1, Math.max(0, index));
}

/** True when a jump lip sits between the two progress positions. */
export function crossedLip(track: Track, fromIndex: number, toIndex: number): number {
  for (let i = fromIndex + 1; i <= toIndex && i < track.samples.length; i++) {
    if (track.samples[i].jump) return i;
  }
  return -1;
}

/** Vertical curvature of the road at a sample, 1/m — negative over a brow,
 * positive through a dip. Measured over a baseline WIDER than the bump layer
 * the generator lays under every stage (`R.elevation.bump`, ~9–16 m): a
 * short window reads that road TEXTURE as a series of launches at pace, when
 * what decides a takeoff is the shape of the hill. */
export function curvatureAt(track: Track, index: number, span: number): number {
  const reach = Math.max(1, Math.round(span / track.step));
  const back = track.samples[clampIndex(track.samples, index - reach)];
  const mid = track.samples[index];
  const fwd = track.samples[clampIndex(track.samples, index + reach)];
  const behind = mid.s - back.s;
  const ahead = fwd.s - mid.s;
  if (behind < 1e-6 || ahead < 1e-6) return 0;
  const rise = (fwd.elevation - mid.elevation) / ahead;
  const fall = (mid.elevation - back.elevation) / behind;
  return (2 * (rise - fall)) / (behind + ahead);
}

/** Approximate road slope (dy/ds) at a sample, from the ground behind it —
 * backward-looking on purpose, so a jump lip reports the RAMP that throws
 * the car rather than averaging in the drop on its far side. */
export function slopeAt(track: Track, index: number): number {
  const samples = track.samples;
  const i1 = Math.max(0, index - 2);
  const rise = samples[index].elevation - samples[i1].elevation;
  const run = Math.max(1e-6, samples[index].s - samples[i1].s);
  return rise / run;
}
