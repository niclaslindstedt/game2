// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Compiles a stage plan (segment list) into the sampled centerline the
// physics and the renderer both consume: evenly spaced samples carrying
// position, heading, elevation, surface, and the jump lip flags. One
// compilation is the single geometric truth for a stage — the car's ground
// height, the road mesh, and the bot's racing line all read these samples.

import type { SegmentPlan } from "./rules.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { generateStage } from "./generate.ts";
import { createRng } from "../lib/prng.ts";

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

/** Elevation profile within one segment at local arc position `u`. */
function segmentElevation(plan: SegmentPlan, u: number): number {
  if (plan.feature === "jump" && plan.featureStart !== undefined && plan.featureEnd !== undefined) {
    // Ramp rises to the lip, then the ground drops back to grade — the drop
    // is what throws the car. Past the lip the road is flat landing zone.
    // The rise EASES IN (steepest right at the lip): a ramp that flattens
    // as it reaches the top — a smoothstep — leaves the car with no upward
    // speed at the one moment it matters, and a jump that does not jump.
    if (u >= plan.featureStart && u < plan.featureEnd) {
      const t = (u - plan.featureStart) / (plan.featureEnd - plan.featureStart);
      return (plan.lipHeight ?? 2) * t * t;
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

/** Lattice size for the elevation noise. A stage is at most a couple of
 * kilometers and the shortest octave's lattice is tens of meters apart, so
 * the profile never gets far enough to wrap. */
const NOISE_LATTICE = 256;

/** Seeded 1-D value noise: random heights every `spacing` meters, joined by
 * smootherstep so the road has no kinks (a kink is a grade discontinuity,
 * which the car feels as a step). */
function valueNoise(values: number[], s: number, spacing: number): number {
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
function buildRolling(seed: number): (s: number) => number {
  const rng = createRng((seed ^ 0x7e11a7d1) >>> 0);
  const amplitude = rng.range(R.elevation.amplitude.min, R.elevation.amplitude.max);
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
    for (const o of octaves) y += o.amplitude * valueNoise(o.values, s + o.offset, o.spacing);
    return y;
  };
}

/** How fast the rolling layers advance through a sample, 0–1. Grades live
 * on the straights and flatten through corners — partly stage-design taste
 * (Sega Rally climbs between turns, not through them), but load-bearing
 * too: a car cutting inside a turn sweeps whole samples of arc per physics
 * step, and any real grade across that sweep reads as the ground falling
 * away — a phantom launch. */
function straightness(curvature: number): number {
  const c = Math.abs(curvature);
  return Math.max(0.06, Math.min(1, 1 / (1 + c * 120)));
}

/** Compile a stage. Omitting `segments` compiles the seed's GENERATED stage,
 * rolling hills included; passing segments builds a flat synthetic rig for
 * tests and tooling — scripted physics scenarios stay exactly scripted. */
export function compileTrack(seed: number, segments?: SegmentPlan[]): Track {
  const rolling = segments === undefined ? buildRolling(seed) : () => 0;
  segments = segments ?? generateStage(seed);
  const samples: TrackSample[] = [];
  /** Arc position as the rolling layers see it — pauses through turns. */
  let rollS = 0;
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
      rollS += step * straightness(curvature);
      // The lip flag lands on the last ramp sample: the one the car leaves.
      // That sample sits at full lip height; past it the road is back at
      // grade, which is the drop that throws the car.
      const jump = lipAt >= 0 && uPrev < lipAt && u >= lipAt;
      samples.push({
        x,
        z,
        heading,
        elevation: rolling(rollS) + (jump ? (plan.lipHeight ?? 2) : segmentElevation(plan, u)),
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
