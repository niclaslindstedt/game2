// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STAGE ANALYSIS — the generator's scoreboard, tested as an instrument.
//
// These are not tests of whether the stages are good; `make analyze` is the
// place that question gets asked, and the answer moves every time the rules
// do. What is pinned here is that the INSTRUMENT is sound, because an
// analyzer nobody can trust is worse than none: it sends the next session
// chasing findings that are not there, or reassures it about defects that
// are.
//
// So: the report has the shape it claims, the scores are in range, the
// checks measure what their ids say, the whole thing is deterministic in the
// seed, and the pass/fail gates at the two ends of a stage actually fail
// when the thing they gate on is missing.

import { describe, expect, it } from "vitest";

import {
  ANALYSIS,
  APRON_HOLDS,
  STAGE_RULES,
  analyzeSeed,
  compileStage,
  createTerrain,
  analyzeTrack,
  type StageReport,
} from "@engine";

const SEEDS = [1, 2, 3, 5, 8];

/** One report, built the way the tooling builds one. Perf is off: it times a
 * cold rebuild, which doubles the suite and measures the machine rather than
 * the generator. */
function report(seed: number, knobs?: Record<string, number>): StageReport {
  return analyzeSeed(seed, { length: "medium", knobs, perf: false });
}

describe("the stage report", () => {
  it("scores every metric in range and rolls them into one number", () => {
    for (const seed of SEEDS) {
      const r = report(seed);
      expect(r.seed, `seed ${seed}`).toBe(seed);
      expect(r.metrics.length, `seed ${seed}`).toBeGreaterThan(4);
      for (const metric of r.metrics) {
        expect(metric.score, `${seed} ${metric.id}`).toBeGreaterThanOrEqual(0);
        expect(metric.score, `${seed} ${metric.id}`).toBeLessThanOrEqual(1);
        expect(metric.checks.length, `${seed} ${metric.id}`).toBeGreaterThan(0);
        for (const check of metric.checks) {
          expect(check.score, `${seed} ${metric.id}.${check.id}`).toBeGreaterThanOrEqual(0);
          expect(check.score, `${seed} ${metric.id}.${check.id}`).toBeLessThanOrEqual(1);
          expect(check.weight, `${seed} ${metric.id}.${check.id}`).toBeGreaterThan(0);
        }
      }
      expect(r.score, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(r.score, `seed ${seed}`).toBeLessThanOrEqual(100);
    }
  });

  it("counts its own findings, worst first", () => {
    for (const seed of SEEDS) {
      const r = report(seed);
      const fromMetrics = r.metrics.flatMap((m) => m.findings);
      expect(r.findings.length, `seed ${seed}`).toBe(fromMetrics.length);
      expect(r.errors, `seed ${seed}`).toBe(
        r.findings.filter((f) => f.severity === "error").length,
      );
      expect(r.warns, `seed ${seed}`).toBe(r.findings.filter((f) => f.severity === "warn").length);
      // Ranked: no warning may sit above an error.
      let seenWarn = false;
      for (const finding of r.findings) {
        if (finding.severity !== "error") seenWarn = true;
        else expect(seenWarn, `seed ${seed} ${finding.code}`).toBe(false);
      }
      // Every finding names the check that raised it.
      for (const finding of r.findings) {
        expect(finding.code, `seed ${seed}`).toMatch(/^[a-z]+\.[a-z]+$/);
        expect(finding.message.length, `seed ${seed} ${finding.code}`).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic: the same seed scores the same twice", () => {
    for (const seed of [1, 7]) {
      const a = report(seed);
      const b = report(seed);
      expect(a.score, `seed ${seed}`).toBe(b.score);
      expect(a.findings.map((f) => f.code).join(), `seed ${seed}`).toBe(
        b.findings.map((f) => f.code).join(),
      );
    }
  });

  it("reads the dials: a wet stage measures as wetter than a dry one", () => {
    const dry = report(4, { water: 0 });
    const wet = report(4, { water: 1 });
    const share = (r: StageReport): number =>
      (r.metrics.find((m) => m.id === "ground")?.stats.waterShare ?? 0) as number;
    expect(share(wet)).toBeGreaterThan(share(dry));
  });
});

describe("the two ends (pass or fail)", () => {
  it("passes the start only when the apron holds a heads-up field", () => {
    // The apron is the generator's half of the promise, and it is the same
    // on every seed — so this is a rule assertion wearing a report's
    // clothes, and that is exactly why it is worth having: the number is
    // derived from `STAGE_RULES.startZone.apron`, and anyone shortening
    // that would otherwise only find out in a race.
    expect(APRON_HOLDS).toBeGreaterThanOrEqual(ANALYSIS.ends.grid);
    for (const seed of SEEDS) {
      const grid = report(seed)
        .metrics.find((m) => m.id === "ends")
        ?.checks.find((c) => c.id === "grid");
      expect(grid?.score, `seed ${seed}`).toBe(1);
    }
  });

  it("passes the finish only when there is run-out past the line (R25)", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "medium");
      const terrain = createTerrain(track);
      terrain.sync(0);
      const ends = analyzeTrack(track, terrain, { perf: false }).metrics.find(
        (m) => m.id === "ends",
      );
      const runOut = ends?.checks.find((c) => c.id === "runout");
      expect(runOut?.score, `seed ${seed}`).toBe(1);
      expect(track.length - (track.finishS ?? 0), `seed ${seed}`).toBeGreaterThanOrEqual(
        STAGE_RULES.runOut * ANALYSIS.ends.runOutShare,
      );
    }
  });

  it("fails a stage whose finish gate has no road past it", () => {
    // Cut the run-out off and the check has to notice. A gate the analyzer
    // passes on a stage that ends AT the line is a gate that would pass on
    // anything.
    const track = compileStage(3, "medium");
    const cutAt = track.finishS ?? track.length;
    const truncated = {
      ...track,
      samples: track.samples.filter((s) => s.s <= cutAt),
      length: cutAt,
    };
    const terrain = createTerrain(truncated);
    terrain.sync(0);
    const ends = analyzeTrack(truncated, terrain, { perf: false }).metrics.find(
      (m) => m.id === "ends",
    );
    expect(ends?.checks.find((c) => c.id === "runout")?.score).toBe(0);
  });
});

describe("the rollers", () => {
  it("roll a rank wider than the road, and report what they touched", () => {
    const r = report(2);
    const rollers = r.metrics.find((m) => m.id === "rollers");
    expect(rollers).toBeDefined();
    const lanes = rollers?.stats.lanes ?? 0;
    // Wide enough to cover the mat and the verge either side of it, at the
    // rank's own spacing.
    const track = compileStage(2, "medium");
    const want = Math.ceil((track.width / 2 + ANALYSIS.rollers.verge) / ANALYSIS.rollers.spacing);
    expect(lanes).toBe(want * 2 + 1);
    expect(rollers?.stats.probes ?? 0).toBeGreaterThan(lanes);
  });
});

describe("the water", () => {
  it("finds no watercourse that climbs", () => {
    // The one rule of nature that is never a matter of degree. Asserted
    // through the analyzer rather than over the points directly, so a
    // change that breaks the CHECK fails here too.
    for (const seed of SEEDS) {
      const water = report(seed, { water: 0.9 }).metrics.find((m) => m.id === "water");
      expect(water?.stats.climbs, `seed ${seed}`).toBe(0);
    }
  });

  it("finds every crossing with water under it", () => {
    for (const seed of SEEDS) {
      const water = report(seed, { water: 0.9 }).metrics.find((m) => m.id === "water");
      expect(water?.stats.dryCrossings, `seed ${seed}`).toBe(0);
    }
  });
});

describe("the jumps", () => {
  it("measures every lip's flight, and lands them all on the road", () => {
    for (const seed of SEEDS) {
      const jumps = report(seed).metrics.find((m) => m.id === "jumps");
      expect(jumps?.stats.landedOff, `seed ${seed}`).toBe(0);
      if ((jumps?.stats.jumps ?? 0) === 0) continue;
      // A measured jump has a length and some air under it — a flight of
      // zero is the ballistics failing to run, not a flat lip.
      expect(jumps?.stats.maxLength, `seed ${seed}`).toBeGreaterThan(0);
      expect(jumps?.stats.maxHeight, `seed ${seed}`).toBeGreaterThan(0);
    }
  });
});
