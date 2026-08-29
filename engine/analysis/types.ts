// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shape of a stage ANALYSIS: what a check is, what it may report, and
// how the checks add up to one number.
//
// The generator is a search that only knows whether a candidate broke a
// rule. That is enough to keep a stage legal and nowhere near enough to
// keep it GOOD: a stage can satisfy every R-rule and still run its water
// uphill, stop a branch in a field, drop a step into the racing line, or
// take four seconds to build. Those are all measurable, and this module is
// where they get measured — so that tuning the generator is a loop with a
// number at the end of it rather than a picture and an opinion.
//
// The unit is the CHECK: one property, scored 0..1, carrying its own
// weight. Checks group into METRICS (water, roads, the road surface, how
// hard it is to drive, the ground, the cost of building it), and the
// metrics weight into the stage's score out of 100. A finding is the
// EXPLANATION of a score below 1 — where it happened and how bad it was —
// never the score itself, so a check that cannot name a place still counts.

/** How much a finding matters. `error` is a defect — something a player
 * would see and call a bug. `warn` is a plausibility or quality problem.
 * `note` is information the loop wants and nobody has to fix. */
export type Severity = "error" | "warn" | "note";

export type Finding = {
  /** `<metric>.<check>` — stable, so a fix can be pointed at one string. */
  code: string;
  severity: Severity;
  message: string;
  /** Where on the map it is, when it has a place. */
  at?: { x: number; z: number };
  /** Where along the stage it is, m — when it is on the road. */
  s?: number;
  /** How bad, in the check's own units (m, m/s², degrees, …). */
  value?: number;
};

/** One measured property of a stage. */
export type Check = {
  id: string;
  /** What the check is asking, in one line — the CLI prints this. */
  label: string;
  /** 0..1; 1 is a stage this check has nothing to say about. */
  score: number;
  /** Its share of the metric it belongs to. */
  weight: number;
  /** The measurement behind the score, in the check's own units. */
  value?: number;
  /** ...and the threshold it was scored against. */
  budget?: number;
};

export type MetricReport = {
  id: string;
  label: string;
  /** Weighted mean of the checks, 0..1. */
  score: number;
  /** Its share of the stage score. */
  weight: number;
  checks: Check[];
  findings: Finding[];
  /** Numbers worth reading even when nothing is wrong. */
  stats: Record<string, number>;
  /** What measuring this cost, ms — the analyzer keeping itself honest
   * about its own budget, since the whole point is to iterate with it. */
  ms: number;
};

export type StageReport = {
  seed: number;
  length: string;
  shape: string;
  knobs: Record<string, number>;
  /** Stage length, m — the road, not the run-out. */
  distance: number;
  metrics: MetricReport[];
  /** Every finding, worst first. */
  findings: Finding[];
  /** 0..100. 100 with no findings is the target the loop iterates toward. */
  score: number;
  errors: number;
  warns: number;
  /** Wall time of the whole analysis, ms. */
  ms: number;
};

/** Score a measurement that should stay UNDER a budget: 1 while it is
 * inside, falling to 0 by `fail`. Linear on purpose — a curve makes the
 * number harder to reason about than the thing it is measuring. */
export function under(value: number, budget: number, fail: number): number {
  if (value <= budget) return 1;
  if (value >= fail) return 0;
  return 1 - (value - budget) / (fail - budget);
}

/** Score a RATE — how many of `total` came out wrong. An empty population
 * scores 1: a stage with no bridges has no bad bridges. */
export function rate(bad: number, total: number, tolerated = 0): number {
  if (total <= 0) return 1;
  const share = Math.max(0, bad / total - tolerated);
  return Math.max(0, 1 - share / Math.max(1e-6, 1 - tolerated));
}

/** Score a measurement that should sit INSIDE a band, falling off outside
 * it over `slack` in the measurement's own units. What "a stage should be
 * a fifth forest" and "no more than a third of it under water" both are. */
export function within(value: number, band: { min: number; max: number }, slack: number): number {
  if (value >= band.min && value <= band.max) return 1;
  const off = value < band.min ? band.min - value : value - band.max;
  return Math.max(0, 1 - off / Math.max(1e-6, slack));
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, note: 2 };

/** Findings worst first, and the worst of each code first inside that —
 * a run of two hundred identical steps in one hillside should lead with
 * the deepest one, because that is the one worth standing in front of. */
export function rank(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0);
  });
}

/** Roll a metric's checks up into its score. */
export function metricScore(checks: Check[]): number {
  let sum = 0;
  let weight = 0;
  for (const check of checks) {
    sum += check.score * check.weight;
    weight += check.weight;
  }
  return weight > 0 ? sum / weight : 1;
}
