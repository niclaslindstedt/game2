// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IT COSTS. The one metric that measures the generator rather than the
// stage it produced.
//
// The two halves of this loop have opposite budgets, and keeping that
// straight is the whole reason this file exists. The ANALYSIS runs at
// development time, on a workstation, a handful of seeds at a time: it may
// take seconds, and several of the checks in this module deliberately do.
// The GENERATOR runs in the game, on a phone, behind a loading card, every
// single time a stage starts — and then its terrain field is queried some
// thousands of times a second for as long as the run lasts.
//
// So a generator change that buys a nicer landscape with four times the
// per-query cost is a regression, and it is one nothing else here would
// catch: every geometric check would come back greener than before. That is
// what this measures, in two parts.
//
//   THE BUILD — plan, compile, terrain field. Wall time, once, cold.
//   THE QUERIES — `groundAt`, `waterAt` and `obstaclesNear`, timed per call
//   over a warm batch along the road, because those three are what the
//   physics step and the renderer's world actually spend their time in.
//
// Timings are wall time on whatever machine is running, so they are a
// RELATIVE instrument: the number to act on is the one that moved since the
// last run, not the one against the budget on somebody else's laptop.

import { compileStage, type Track } from "../mapgen/compile.ts";
import { generateStage } from "../mapgen/generate.ts";
import { createTerrain } from "../mapgen/terrain.ts";
import type { FiniteStageLength, StageKnobs } from "../mapgen/rules.ts";
import { ANALYSIS } from "./budgets.ts";
import { metricScore, under, type Check, type Finding, type MetricReport } from "./types.ts";

/** Microseconds per call, averaged over a batch. The clock is read once
 * either side of the whole batch rather than per call: at a few
 * microseconds a call, reading the clock around each one measures the
 * clock. */
function perCall(calls: number, run: () => void): number {
  const started = process.hrtime.bigint();
  run();
  const ns = Number(process.hrtime.bigint() - started);
  return ns / 1000 / Math.max(1, calls);
}

export function analyzePerf(
  track: Track,
  seed: number,
  length: FiniteStageLength,
  knobs: Partial<StageKnobs>,
): MetricReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const P = ANALYSIS.perf;

  // ── The build, cold. Timed on a fresh generation rather than on the
  // track that was handed in, because the track handed in was built once
  // already and the caches it warmed are not the ones a player gets.
  const planStart = Date.now();
  generateStage(seed, length, knobs);
  const planMs = Date.now() - planStart;

  const compileStart = Date.now();
  const built = compileStage(seed, length, knobs);
  const compileMs = Date.now() - compileStart;

  const terrainStart = Date.now();
  const field = createTerrain(built);
  // Building the field is lazy — the streams, the guards and the props are
  // cut when the road is first synced — so the sync is part of the build
  // cost and timing the constructor alone measures nothing.
  field.sync(0);
  const terrainMs = Date.now() - terrainStart;
  const buildMs = planMs + compileMs + terrainMs;

  // ── The queries, warm, along the road the car will actually drive. A
  // batch over the corridor rather than over the whole map: that is where
  // every query the run makes is taken, and it is also where the field's
  // spatial index is doing the most work.
  const n = P.samples;
  const samples = built.samples;
  const spots: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const sample = samples[Math.floor((i / n) * samples.length)];
    // Off the centerline by a car's width or two, spread across the
    // corridor — a query column down the middle would hit one cache line.
    const rx = Math.cos(sample.heading);
    const rz = -Math.sin(sample.heading);
    const off = ((i % 17) / 17 - 0.5) * built.width * 1.8;
    spots.push({ x: sample.x + rx * off, z: sample.z + rz * off });
  }
  // Warm the JIT and the field's own caches before the clock starts.
  for (const spot of spots) field.groundAt(spot.x, spot.z);

  let sink = 0;
  const groundUs = perCall(n, () => {
    for (const spot of spots) sink += field.groundAt(spot.x, spot.z);
  });
  const waterUs = perCall(n, () => {
    for (const spot of spots) sink += field.waterAt(spot.x, spot.z) ?? 0;
  });
  const obstacleUs = perCall(n, () => {
    for (const spot of spots) sink += field.obstaclesNear(spot.x, spot.z, 6).length;
  });
  // Keeps the batches from being optimized away without costing anything
  // measurable inside them.
  if (!Number.isFinite(sink)) throw new Error("perf batch produced no work");

  if (buildMs > P.build.budget) {
    findings.push({
      code: "perf.build",
      severity: buildMs > P.build.fail ? "error" : "warn",
      message: `building the stage took ${buildMs} ms (plan ${planMs}, compile ${compileMs}, terrain ${terrainMs}) against a ${P.build.budget} ms budget`,
      value: buildMs,
    });
  }
  const queries: [string, number, { budget: number; fail: number }][] = [
    ["groundAt", groundUs, P.query.ground],
    ["waterAt", waterUs, P.query.water],
    ["obstaclesNear", obstacleUs, P.query.obstacles],
  ];
  for (const [name, us, budget] of queries) {
    if (us <= budget.budget) continue;
    findings.push({
      code: "perf.query",
      severity: us > budget.fail ? "error" : "warn",
      message: `${name} costs ${us.toFixed(1)} µs a call against a ${budget.budget} µs budget — the physics reads it every step`,
      value: us,
    });
  }

  const checks: Check[] = [
    {
      id: "build",
      label: "a stage builds behind a loading card",
      score: under(buildMs, P.build.budget, P.build.fail),
      weight: 2,
      value: buildMs,
      budget: P.build.budget,
    },
    {
      id: "plan",
      label: "the search finds a stage without fighting for it",
      score: under(planMs, P.plan.budget, P.plan.fail),
      weight: 1,
      value: planMs,
      budget: P.plan.budget,
    },
    {
      id: "ground",
      label: "the ground is cheap to ask about",
      score: under(groundUs, P.query.ground.budget, P.query.ground.fail),
      weight: 2,
      value: groundUs,
      budget: P.query.ground.budget,
    },
    {
      id: "water",
      label: "the water is cheap to ask about",
      score: under(waterUs, P.query.water.budget, P.query.water.fail),
      weight: 1,
      value: waterUs,
      budget: P.query.water.budget,
    },
    {
      id: "obstacles",
      label: "the solids are cheap to ask about",
      score: under(obstacleUs, P.query.obstacles.budget, P.query.obstacles.fail),
      weight: 1,
      value: obstacleUs,
      budget: P.query.obstacles.budget,
    },
  ];

  return {
    id: "perf",
    label: "cost",
    score: metricScore(checks),
    weight: ANALYSIS.weights.perf,
    checks,
    findings,
    stats: {
      buildMs,
      planMs,
      compileMs,
      terrainMs,
      groundUs,
      waterUs,
      obstacleUs,
      samples: track.samples.length,
    },
    ms: Date.now() - started,
  };
}
