// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A cache of built stages, for the test files that assert a dozen separate
// rules over ONE corpus of them.
//
// Generating and compiling a stage is the most expensive thing the engine
// does — a long wet stage is a second of search, terrain and geometry — and
// the R-rule suites are written the way rules read: one `it` per rule, each
// walking the same spread of seeds. Written literally that is the same
// twenty-four stages built seven times over, and it was the whole reason the
// suite's slowest file took the best part of four minutes on its own, which
// put a floor under CI that no number of shards could get below.
//
// The generator is deterministic per seed (`mapgen_test` asserts it first
// thing), so the second build of a seed can only ever return what the first
// one did. This hands out the first one.
//
// The bargain: what comes back is SHARED, so a test must treat it as
// read-only. Anything that needs a track of its own — an endless stage it
// will `extend()`, or a determinism check that has to see two independent
// builds — calls the engine directly and skips this module. That is why
// `endless` is refused here rather than merely discouraged.
import {
  compileStage,
  createTerrain,
  generateStage,
  type FiniteStageLength,
  type SegmentPlan,
  type StageKnobs,
  type StageShape,
  type TerrainField,
  type Track,
} from "@engine";

type Build = {
  length: FiniteStageLength;
  knobs: Partial<StageKnobs>;
  shape: StageShape;
};

const key = (seed: number, b: Build): string =>
  `${seed}|${b.length}|${b.shape}|${JSON.stringify(b.knobs, Object.keys(b.knobs).sort())}`;

const plans = new Map<string, SegmentPlan[]>();
const tracks = new Map<string, Track>();

function build(
  seed: number,
  length: FiniteStageLength,
  knobs: Partial<StageKnobs>,
  shape: StageShape,
): { k: string; b: Build } {
  const b = { length, knobs, shape };
  return { k: key(seed, b), b };
}

/** The segment plans of a stage, built once per (seed, length, dials, shape).
 * Read-only: several tests hold the same array. */
export function stagePlans(
  seed: number,
  length: FiniteStageLength = "medium",
  knobs: Partial<StageKnobs> = {},
  shape: StageShape = "sprint",
): SegmentPlan[] {
  const { k } = build(seed, length, knobs, shape);
  let hit = plans.get(k);
  if (hit === undefined) {
    hit = generateStage(seed, length, knobs, shape);
    plans.set(k, hit);
  }
  return hit;
}

/** A compiled stage — the road, its samples, its features and its terrain
 * inputs — built once per (seed, length, dials, shape). Read-only: several
 * tests hold the same track. Endless stages are not cached, because their
 * `extend()` mutates the very thing that would be shared. */
export function stageTrack(
  seed: number,
  length: FiniteStageLength = "medium",
  knobs: Partial<StageKnobs> = {},
  shape: StageShape = "sprint",
): Track {
  const { k } = build(seed, length, knobs, shape);
  let hit = tracks.get(k);
  if (hit === undefined) {
    hit = compileStage(seed, length, knobs, shape);
    tracks.set(k, hit);
  }
  return hit;
}

const terrains = new WeakMap<Track, TerrainField>();

/** The terrain field of a track, built once per track. Building one is a
 * quarter of what building the track cost and the rule suites do it as
 * often, so it caches on the same terms: read-only, shared, and keyed on
 * the track object — which works for an uncached endless track too. */
export function stageTerrain(track: Track): TerrainField {
  let hit = terrains.get(track);
  if (hit === undefined) {
    hit = createTerrain(track);
    terrains.set(track, hit);
  }
  return hit;
}
