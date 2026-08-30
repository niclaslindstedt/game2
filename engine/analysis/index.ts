// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// STAGE ANALYSIS — the generator's scoreboard.
//
// The development loop this exists to close:
//
//   1. change the generator
//   2. generate a stage from a fixed seed
//   3. run this, read the score and the findings
//   4. fix what it found
//   5. ask whether the ANALYZER was measuring the right thing — a finding
//      that is not a defect is a threshold that needs moving, and a defect
//      nobody flagged is a check that needs writing
//   6. repeat on that seed until it scores clean, then take a different
//      seed and do it again
//
// Step 5 is the one that is easy to skip and the one that makes the rest
// worth doing. A score is only as honest as its checks, and the fastest way
// to a hundred out of a hundred is to measure things that were never going
// to fail. Every threshold lives in `budgets.ts` for exactly this reason:
// moving one is a visible change to the definition of good, in a diff,
// rather than a number quietly widened inside a check.
//
// The score is a weighted mean of six metrics, each a weighted mean of its
// own checks. It is a COMPASS, not a grade: what it is for is the direction
// of the difference between two runs, and no single number can tell you a
// stage is good. The findings are what you act on.

import { compileStage, type Track } from "../mapgen/compile.ts";
import { createTerrain, type TerrainField } from "../mapgen/terrain.ts";
import type { FiniteStageLength, StageKnobs, StageShape } from "../mapgen/rules.ts";
import { analyzeDrive } from "./drive.ts";
import { analyzeEnds } from "./ends.ts";
import { analyzeGround } from "./ground.ts";
import { analyzeJumps } from "./jumps.ts";
import { analyzeJunctions } from "./junctions.ts";
import { analyzePerf } from "./perf.ts";
import { analyzeRoads } from "./roads.ts";
import { analyzeRollers } from "./rollers.ts";
import { speedProfile } from "./speed.ts";
import { analyzeWater } from "./water.ts";
import { rank, type MetricReport, type StageReport } from "./types.ts";

export { ANALYSIS } from "./budgets.ts";
export type { Check, Finding, MetricReport, Severity, StageReport } from "./types.ts";

export type AnalyzeOptions = {
  length?: FiniteStageLength;
  shape?: StageShape;
  knobs?: Partial<StageKnobs>;
  /** Skip the cost metric. It regenerates the stage from scratch to time a
   * cold build, which roughly doubles the analysis — worth it when the
   * question is "did my change cost anything" and pure overhead when it is
   * "does this seed hold water". */
  perf?: boolean;
};

/** Analyze a track that has already been built, with a terrain field over
 * it. The entry point for tests and for anything that has the stage in
 * hand; `analyzeSeed` is the one the tooling uses. */
export function analyzeTrack(
  track: Track,
  terrain: TerrainField,
  options: AnalyzeOptions = {},
): StageReport {
  const started = Date.now();
  // Computed once and shared: half the checks are meaningless without a
  // speed, and two metrics computing their own would be two answers to the
  // same question.
  const speeds = speedProfile(track);
  const metrics: MetricReport[] = [
    analyzeRollers(track, terrain),
    analyzeWater(track, terrain),
    analyzeRoads(track),
    analyzeJunctions(track, terrain),
    analyzeDrive(track, speeds),
    analyzeJumps(track, terrain, speeds),
    analyzeEnds(track, terrain),
    analyzeGround(track, terrain),
  ];
  if (options.perf !== false && options.length) {
    metrics.push(analyzePerf(track, track.seed, options.length, options.knobs ?? {}));
  }

  let sum = 0;
  let weight = 0;
  const findings = [];
  for (const metric of metrics) {
    sum += metric.score * metric.weight;
    weight += metric.weight;
    findings.push(...metric.findings);
  }
  const ranked = rank(findings);
  return {
    seed: track.seed,
    length: options.length ?? "medium",
    shape: options.shape ?? (track.circuit ? "circuit" : "sprint"),
    knobs: { ...track.knobs },
    distance: track.finishS ?? track.length,
    metrics,
    findings: ranked,
    score: weight > 0 ? Math.round((sum / weight) * 1000) / 10 : 0,
    errors: ranked.filter((f) => f.severity === "error").length,
    warns: ranked.filter((f) => f.severity === "warn").length,
    ms: Date.now() - started,
  };
}

/** Build a stage from a seed and analyze it — the whole loop in one call. */
export function analyzeSeed(seed: number, options: AnalyzeOptions = {}): StageReport {
  const length = options.length ?? "medium";
  const track = compileStage(seed, length, options.knobs, options.shape);
  const terrain = createTerrain(track);
  // The field builds its streams, guards, stands and props lazily as the
  // road is synced. Nothing is analyzable until it has caught up with the
  // whole stage, and an unsynced field reports a stage with no water in it.
  terrain.sync(0);
  return analyzeTrack(track, terrain, { ...options, length });
}
