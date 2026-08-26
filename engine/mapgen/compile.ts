// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Compiles a stage plan (segment list) into the sampled centerline the
// physics and the renderer both consume: evenly spaced samples carrying
// position, heading, elevation, surface, and the jump lip flags. One
// compilation is the single geometric truth for a stage — the car's ground
// height, the road mesh, and the bot's racing line all read these samples.

import type { SegmentPlan } from "./rules.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { generateStage } from "./generate.ts";

export type Surface = "gravel" | "water";

export type TrackSample = {
  x: number;
  z: number;
  /** Direction of travel at this sample, radians. */
  heading: number;
  /** Ground height of the road at this sample, meters. */
  elevation: number;
  surface: Surface;
  /** True on the takeoff lip — the sample where the ramp ends in a drop. */
  jump: boolean;
  /** Arc length from the stage start, meters. */
  s: number;
  /** Signed curvature (1/radius, positive turning left), for the bot. */
  curvature: number;
};

export type Track = {
  seed: number;
  segments: SegmentPlan[];
  samples: TrackSample[];
  /** Sample spacing, meters. */
  step: number;
  /** Total stage length, meters. */
  length: number;
  /** Full road width, meters. */
  width: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

/** Sample spacing along the centerline, meters. */
export const SAMPLE_STEP = 2;

function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Elevation profile within one segment at local arc position `u`. */
function segmentElevation(plan: SegmentPlan, u: number): number {
  if (plan.feature === "jump" && plan.featureStart !== undefined && plan.featureEnd !== undefined) {
    // Ramp rises to the lip, then the ground drops back to grade — the drop
    // is what throws the car. Past the lip the road is flat landing zone.
    if (u >= plan.featureStart && u < plan.featureEnd) {
      const t = (u - plan.featureStart) / (plan.featureEnd - plan.featureStart);
      return (plan.lipHeight ?? 2) * smoothstep(t);
    }
    return 0;
  }
  if (
    plan.feature === "crest" &&
    plan.featureStart !== undefined &&
    plan.featureEnd !== undefined
  ) {
    if (u >= plan.featureStart && u <= plan.featureEnd) {
      const t = (u - plan.featureStart) / (plan.featureEnd - plan.featureStart);
      return (plan.crestHeight ?? 2) * Math.sin(t * Math.PI) ** 2;
    }
    return 0;
  }
  return 0;
}

function segmentSurface(plan: SegmentPlan, u: number): Surface {
  if (
    plan.feature === "water" &&
    plan.featureStart !== undefined &&
    plan.featureEnd !== undefined &&
    u >= plan.featureStart &&
    u <= plan.featureEnd
  ) {
    return "water";
  }
  return "gravel";
}

export function compileTrack(seed: number, segments = generateStage(seed)): Track {
  const samples: TrackSample[] = [];
  let x = 0;
  let z = 0;
  let heading = 0;
  let s = 0;
  let minX = 0;
  let maxX = 0;
  let minZ = 0;
  let maxZ = 0;

  for (const plan of segments) {
    const steps = Math.max(1, Math.round(plan.length / SAMPLE_STEP));
    const step = plan.length / steps;
    const curvature = plan.kind === "turn" && plan.radius ? (plan.dir ?? 1) / plan.radius : 0;
    const lipAt = plan.feature === "jump" ? (plan.featureEnd ?? -1) : -1;
    for (let i = 0; i < steps; i++) {
      const uPrev = i * step;
      const u = uPrev + step;
      if (curvature !== 0) heading += curvature * step;
      x += Math.sin(heading) * step;
      z += Math.cos(heading) * step;
      s += step;
      // The lip flag lands on the last ramp sample: the one the car leaves.
      // That sample sits at full lip height; past it the road is back at
      // grade, which is the drop that throws the car.
      const jump = lipAt >= 0 && uPrev < lipAt && u >= lipAt;
      samples.push({
        x,
        z,
        heading,
        elevation: jump ? (plan.lipHeight ?? 2) : segmentElevation(plan, u),
        surface: segmentSurface(plan, u),
        jump,
        s,
        curvature,
      });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }

  return {
    seed,
    segments,
    samples,
    step: SAMPLE_STEP,
    length: s,
    width: R.roadWidth,
    bounds: { minX, maxX, minZ, maxZ },
  };
}

/** Ground elevation of the road at arc position `s` (clamped). */
export function elevationAt(track: Track, s: number): number {
  const i = Math.min(track.samples.length - 1, Math.max(0, Math.floor(s / track.step)));
  return track.samples[i].elevation;
}
