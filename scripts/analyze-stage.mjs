#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// STAGE ANALYSIS CLI — the generator's scoreboard, on the command line.
//
// `make track` renders a stage so it can be LOOKED at; this measures one so
// it can be ITERATED on. The loop it exists for:
//
//   1. change the generator
//   2. `make analyze SEEDS=7` — one seed, everything it can say about it
//   3. fix the worst finding
//   4. re-run the same seed; when it comes up clean, take another seed
//   5. `make analyze COUNT=24` — the sweep, before shipping
//
// The score is a compass, not a grade: read the FINDINGS. A run that scores
// 92 with one error in it needs the error fixed, not the score improved.
//
//   npm run analyze                       # seeds 1..8, medium sprints
//   npm run analyze -- --seeds 42,99      # specific seeds
//   npm run analyze -- --count 24         # a sweep
//   npm run analyze -- --length long --shape circuit
//   npm run analyze -- --water 1 --elevation 1   # the generator's dials
//   npm run analyze -- --biome desert            # ...and the country (R40)
//   npm run analyze -- --steepness 1 --asphalt 1 # R34: rock, and roads cut through it
//   npm run analyze -- --checks           # every check, not just the metrics
//   npm run analyze -- --findings 40      # how many findings to print a seed
//   npm run analyze -- --no-perf          # skip the cold-build timing
//   npm run analyze -- --json out.json    # the whole report, machine-readable
//
// Exits non-zero when any seed reports an ERROR or scores under --floor, so
// it can gate a change rather than only describe one.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { analyzeSeed, STAGE_RULES } = await import(join(root, "engine/index.ts"));

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const has = (name) => args.includes(`--${name}`);

const seeds = flag("seeds")
  ? flag("seeds").split(",").map(Number)
  : Array.from({ length: Number(flag("count") ?? 8) }, (_, i) => i + 1);
const length = flag("length") ?? "medium";
const shape = flag("shape") ?? "sprint";
const floor = Number(flag("floor") ?? 0);
const maxFindings = Number(flag("findings") ?? 8);
const showChecks = has("checks");
const perf = !has("no-perf");
const knobs = {};
for (const dial of ["elevation", "water", "trees", "asphalt", "width", "steepness"]) {
  const value = flag(dial);
  if (value !== undefined) knobs[dial] = Number(value);
}
if (flag("biome") !== undefined) knobs.biome = flag("biome");

if (!(length in STAGE_RULES.stageLengths)) {
  console.error(`unknown length "${length}" (${Object.keys(STAGE_RULES.stageLengths).join(", ")})`);
  process.exit(2);
}
if (shape !== "sprint" && shape !== "circuit") {
  console.error(`unknown shape "${shape}" (sprint, circuit)`);
  process.exit(2);
}

const pad = (v, n) => String(v).padStart(n);
const padEnd = (v, n) => String(v).padEnd(n);
/** A metric's score as a two-character bar, so a table of six reads as a
 * shape rather than as a row of decimals. */
const bar = (score) => {
  const blocks = " ▁▂▃▄▅▆▇█";
  return blocks[Math.min(8, Math.max(0, Math.round(score * 8)))];
};
const mark = { error: "!!", warn: " !", note: "  " };

const reports = [];
const columns = [
  "rollers",
  "water",
  "roads",
  "junctions",
  "drive",
  "jumps",
  "ends",
  "ground",
  "lanes",
  "perf",
];

console.log(
  [
    padEnd("seed", 6),
    pad("score", 6),
    pad("km", 6),
    ...columns.map((c) => pad(c.slice(0, 7), 8)),
    pad("err", 4),
    pad("warn", 5),
    pad("ms", 6),
  ].join(" "),
);

for (const seed of seeds) {
  const report = analyzeSeed(seed, { length, shape, knobs, perf });
  reports.push(report);
  const byId = new Map(report.metrics.map((m) => [m.id, m]));
  console.log(
    [
      padEnd(seed, 6),
      pad(report.score.toFixed(1), 6),
      pad((report.distance / 1000).toFixed(2), 6),
      ...columns.map((id) => {
        const metric = byId.get(id);
        if (!metric) return pad("—", 8);
        return pad(`${bar(metric.score)} ${(metric.score * 100).toFixed(0)}`, 8);
      }),
      pad(report.errors, 4),
      pad(report.warns, 5),
      pad(report.ms, 6),
    ].join(" "),
  );

  if (showChecks) {
    for (const metric of report.metrics) {
      console.log(
        `    ${padEnd(metric.label, 16)} ${(metric.score * 100).toFixed(0)}%  (${metric.ms} ms)`,
      );
      for (const check of metric.checks) {
        const value =
          check.value === undefined
            ? ""
            : `  ${check.value.toFixed(3)}${check.budget === undefined ? "" : ` / ${check.budget}`}`;
        console.log(
          `      ${bar(check.score)} ${padEnd(`${metric.id}.${check.id}`, 22)} ${pad(
            (check.score * 100).toFixed(0),
            3,
          )}%${value}`,
        );
      }
    }
  }

  const shown = report.findings.slice(0, maxFindings);
  for (const finding of shown) {
    const where = finding.s !== undefined ? ` @${finding.s.toFixed(0)} m` : "";
    const at = finding.at ? ` (${finding.at.x.toFixed(0)}, ${finding.at.z.toFixed(0)})` : "";
    console.log(
      `  ${mark[finding.severity]} ${padEnd(finding.code, 16)} ${finding.message}${where}${at}`,
    );
  }
  if (report.findings.length > shown.length) {
    console.log(`     … and ${report.findings.length - shown.length} more`);
  }
}

// ── The sweep's own summary: the average of each metric across the seeds,
// and the codes that came up most. A single seed says what is wrong with
// that seed; the tally says what is wrong with the GENERATOR.
if (reports.length > 1) {
  const mean = (pick) => reports.reduce((sum, r) => sum + pick(r), 0) / reports.length;
  console.log("");
  console.log(
    [
      padEnd("mean", 6),
      pad(mean((r) => r.score).toFixed(1), 6),
      pad("", 6),
      ...columns.map((id) => {
        const scores = reports
          .map((r) => r.metrics.find((m) => m.id === id))
          .filter(Boolean)
          .map((m) => m.score);
        if (scores.length === 0) return pad("—", 8);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return pad(`${bar(avg)} ${(avg * 100).toFixed(0)}`, 8);
      }),
      pad(
        reports.reduce((sum, r) => sum + r.errors, 0),
        4,
      ),
      pad(
        reports.reduce((sum, r) => sum + r.warns, 0),
        5,
      ),
      pad(
        reports.reduce((sum, r) => sum + r.ms, 0),
        6,
      ),
    ].join(" "),
  );

  const tally = new Map();
  for (const report of reports) {
    for (const finding of report.findings) {
      const key = `${mark[finding.severity]} ${finding.code}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  const worst = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (worst.length > 0) {
    console.log("");
    console.log("  most common findings across the sweep:");
    for (const [code, count] of worst) {
      console.log(
        `    ${padEnd(code, 22)} ${pad(count, 4)}  on ${
          reports.filter((r) => r.findings.some((f) => code.endsWith(f.code))).length
        } seed(s)`,
      );
    }
  }
}

const out = flag("json");
if (out) {
  writeFileSync(out, JSON.stringify(reports, null, 2));
  console.log(`\nwrote ${out}`);
}

const failed = reports.filter((r) => r.errors > 0 || r.score < floor);
if (failed.length > 0) {
  console.log(
    `\n${failed.length} of ${reports.length} seed(s) failed: ${failed
      .map((r) => r.seed)
      .join(", ")}`,
  );
  process.exit(1);
}
