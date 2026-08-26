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
  surface: "gravel" | "water" | "grass";
  elevation: number;
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
  const surface = offRoad ? "grass" : s.surface;
  // Interpolate elevation toward the neighbour the car is actually between:
  // on a graded road the nearest sample alone quantizes ground height to the
  // sample grid, and that stairstep reads as the ground falling away — a
  // phantom launch at every sample crossing.
  const ahead = dx * Math.sin(s.heading) + dz * Math.cos(s.heading);
  let elevation = s.elevation;
  const towards = ahead > 0 ? best + 1 : best - 1;
  if (towards >= 0 && towards < samples.length) {
    const t = Math.min(1, Math.abs(ahead) / track.step);
    elevation += (samples[towards].elevation - s.elevation) * t;
  }
  return { index: best, s: s.s, lateral, offRoad, surface, elevation };
}

/** True when a jump lip sits between the two progress positions. */
export function crossedLip(track: Track, fromIndex: number, toIndex: number): number {
  for (let i = fromIndex + 1; i <= toIndex && i < track.samples.length; i++) {
    if (track.samples[i].jump) return i;
  }
  return -1;
}

/** Approximate road slope (dy/ds) at a sample, from its neighbours. */
export function slopeAt(track: Track, index: number): number {
  const samples = track.samples;
  const i1 = Math.max(0, index - 2);
  const rise = samples[index].elevation - samples[i1].elevation;
  const run = Math.max(1e-6, samples[index].s - samples[i1].s);
  return rise / run;
}
