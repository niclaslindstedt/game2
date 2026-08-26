// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Compiles a stage plan (segment list) into the sampled centerline the
// physics and the renderer both consume: evenly spaced samples carrying
// position, heading, elevation, surface, and the jump lip flags — plus the
// pacenote list the HUD calls from. One compilation is the single geometric
// truth for a stage — the car's ground height, the road mesh, and the bot's
// racing line all read these samples. The compiler is incremental: an
// endless stage keeps appending to the same track as its stream produces
// new sections.

import type { SegmentPlan, StageLength, TurnSeverity } from "./rules.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { createStageStream, generateStage } from "./generate.ts";
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
  /** Signed curvature (1/radius) of the plan the sample sits on, for the
   * bot and the pacenotes; positive means the heading is growing. */
  curvature: number;
};

/** One co-driver call: a turn (or a run of same-direction turns) with its
 * severity and total angle. `dir` is in ENGINE map-space — positive grows
 * the heading, which the chase cam reads as a LEFT turn (the rendered world
 * mirrors the engine's map view; the app flips once, like steering). */
export type Pacenote = {
  /** Arc position where the turn begins, meters. */
  s: number;
  /** Arc position where it ends, meters. */
  endS: number;
  dir: 1 | -1;
  severity: TurnSeverity;
  /** Total heading change through the note, radians — the LONG modifier. */
  angle: number;
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
  /** Co-driver calls, in stage order. On an endless stage the tail note can
   * still grow while its turn combination is at the streaming frontier. */
  pacenotes: Pacenote[];
  /** True when the stage streams forever instead of finishing. */
  endless: boolean;
  /** Endless only: materialize road until `length >= upToS`. Deterministic
   * in the seed — when it is called makes no difference to what it builds.
   * Returns true when new samples were appended. */
  extend?: (upToS: number) => boolean;
};

/** Sample spacing along the centerline, meters. */
export const SAMPLE_STEP = 2;

const SEVERITY_RANK: Record<TurnSeverity, number> = { soft: 0, medium: 1, hard: 2 };

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

/** Lattice size for the elevation noise. The shortest octave's lattice is
 * tens of meters apart, so even a long stage never gets far enough along
 * the profile to notice the wrap. */
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

function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** R12 — the dip a ford sits in. Water lies FLAT at `bedDepth` below the
 * lowest rolling grade around it (so it reads as collected, never perched),
 * and the road eases down to it and back out over the aprons. Fords sit on
 * straights, where the rolling profile advances 1:1 with arc, so the whole
 * dip can be shaped from local arc position alone. Returns the elevation
 * override for local position `u`, or null outside the dip. */
function fordDip(
  plan: SegmentPlan,
  u: number,
  rollS0: number,
  rolling: (s: number) => number,
): number | null {
  if (plan.feature !== "water" || plan.featureStart === undefined || plan.featureEnd === undefined)
    return null;
  const from = plan.featureStart - R.water.apron;
  const to = plan.featureEnd + R.water.apron;
  if (u < from || u > to) return null;
  let low = Infinity;
  for (let v = from; v <= to; v += 2) low = Math.min(low, rolling(rollS0 + v));
  const water = low - R.water.bedDepth;
  if (u >= plan.featureStart && u <= plan.featureEnd) return water;
  const t = u < plan.featureStart ? (u - from) / R.water.apron : (to - u) / R.water.apron;
  const base = rolling(rollS0 + u);
  return base + (water - base) * smoothstep(t);
}

type Cursor = { x: number; z: number; heading: number; s: number; rollS: number };

type Compiler = {
  append: (plans: SegmentPlan[]) => void;
};

/** The incremental heart: walks plans into samples, bounds, and pacenotes,
 * carrying the cursor (and the open pacenote, so a turn combination split
 * across two endless sections still merges into one call). */
function createCompiler(track: Track, rolling: (s: number) => number): Compiler {
  const cursor: Cursor = { x: 0, z: 0, heading: 0, s: 0, rollS: 0 };
  let openNote: Pacenote | null = null;

  const append = (plans: SegmentPlan[]): void => {
    const b = track.bounds;
    for (const plan of plans) {
      track.segments.push(plan);
      const steps = Math.max(1, Math.round(plan.length / SAMPLE_STEP));
      const step = plan.length / steps;
      const curvature = plan.kind === "turn" && plan.radius ? (plan.dir ?? 1) / plan.radius : 0;
      const lipAt = plan.feature === "jump" ? (plan.featureEnd ?? -1) : -1;
      const rollS0 = cursor.rollS;

      // The co-driver's book: a turn opens a call (or deepens the open one
      // when it continues in the same direction with no straight between);
      // a straight closes it.
      if (plan.kind === "turn" && plan.dir && plan.radius) {
        const angle = plan.length / plan.radius;
        const severity = plan.severity ?? "soft";
        if (openNote && openNote.dir === plan.dir) {
          openNote.endS = cursor.s + plan.length;
          openNote.angle += angle;
          if (SEVERITY_RANK[severity] > SEVERITY_RANK[openNote.severity]) {
            openNote.severity = severity;
          }
        } else {
          openNote = { s: cursor.s, endS: cursor.s + plan.length, dir: plan.dir, severity, angle };
          track.pacenotes.push(openNote);
        }
      } else {
        openNote = null;
      }

      for (let i = 0; i < steps; i++) {
        const uPrev = i * step;
        const u = uPrev + step;
        if (curvature !== 0) cursor.heading += curvature * step;
        cursor.x += Math.sin(cursor.heading) * step;
        cursor.z += Math.cos(cursor.heading) * step;
        cursor.s += step;
        cursor.rollS += step * straightness(curvature);
        // The lip flag lands on the last ramp sample: the one the car
        // leaves. That sample sits at full lip height; past it the road is
        // back at grade, which is the drop that throws the car.
        const jump = lipAt >= 0 && uPrev < lipAt && u >= lipAt;
        const dip = fordDip(plan, u, rollS0, rolling);
        track.samples.push({
          x: cursor.x,
          z: cursor.z,
          heading: cursor.heading,
          elevation:
            dip ??
            rolling(cursor.rollS) + (jump ? (plan.lipHeight ?? 2) : segmentElevation(plan, u)),
          surface: segmentSurface(plan, u),
          jump,
          s: cursor.s,
          curvature,
        });
        if (cursor.x < b.minX) b.minX = cursor.x;
        if (cursor.x > b.maxX) b.maxX = cursor.x;
        if (cursor.z < b.minZ) b.minZ = cursor.z;
        if (cursor.z > b.maxZ) b.maxZ = cursor.z;
      }
    }
    track.length = cursor.s;
  };

  return { append };
}

function emptyTrack(seed: number, endless: boolean): Track {
  return {
    seed,
    segments: [],
    samples: [],
    step: SAMPLE_STEP,
    length: 0,
    width: R.roadWidth,
    bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    pacenotes: [],
    endless,
  };
}

/** Compile the GENERATED stage for a seed at a menu length. Finite lengths
 * build the whole stage; `endless` builds the opening stretch and hands
 * back a track that extends itself (track.extend) as the run progresses. */
export function compileStage(seed: number, length: StageLength = "medium"): Track {
  const rolling = buildRolling(seed);
  if (length !== "endless") {
    const track = emptyTrack(seed, false);
    createCompiler(track, rolling).append(generateStage(seed, length));
    return track;
  }
  const track = emptyTrack(seed, true);
  const compiler = createCompiler(track, rolling);
  const stream = createStageStream(seed);
  track.extend = (upToS: number): boolean => {
    if (track.length >= upToS) return false;
    const plans = stream.extendTo(upToS);
    compiler.append(plans);
    return plans.length > 0;
  };
  track.extend(R.endless.initial);
  return track;
}

/** Compile a stage. Omitting `segments` compiles the seed's GENERATED stage
 * at the default (medium) length, rolling hills included; passing segments
 * builds a flat synthetic rig for tests and tooling — scripted physics
 * scenarios stay exactly scripted. */
export function compileTrack(seed: number, segments?: SegmentPlan[]): Track {
  if (segments === undefined) return compileStage(seed, "medium");
  const track = emptyTrack(seed, false);
  createCompiler(track, () => 0).append(segments);
  return track;
}

/** Ground elevation of the road at arc position `s` (clamped). */
export function elevationAt(track: Track, s: number): number {
  const i = Math.min(track.samples.length - 1, Math.max(0, Math.floor(s / track.step)));
  return track.samples[i].elevation;
}
