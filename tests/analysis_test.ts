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

/** One report, built the way the tooling builds one — and then KEPT. Perf is
 * off: it times a cold rebuild, which doubles the suite and measures the
 * machine rather than the generator.
 *
 * The cache is what makes this file affordable. A dozen tests below ask about
 * the same handful of seeds, and without it every one of them regenerates
 * every stage from nothing — the same work, over and over, for an instrument
 * that is a pure function of its seed. Which is not an assumption here: it is
 * the claim `freshReport` exists to check. Nothing below mutates a report.
 *
 * The tests that sweep seeds carry an explicit 20 s timeout for the same
 * reason `circuit_test` does. Building a stage and rolling a rank of balls
 * down it is a second of real work on a quiet machine and rather more on a
 * shared runner, so vitest's 5 s default is not a timeout on this file — it is
 * a coin toss, and it came up tails on CI. */
const kept = new Map<string, StageReport>();

function freshReport(seed: number, knobs?: Record<string, number>): StageReport {
  return analyzeSeed(seed, { length: "medium", knobs, perf: false });
}

function report(seed: number, knobs?: Record<string, number>): StageReport {
  const key = `${seed}:${JSON.stringify(knobs ?? null)}`;
  let held = kept.get(key);
  if (!held) {
    held = freshReport(seed, knobs);
    kept.set(key, held);
  }
  return held;
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
  }, 20_000);

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
  }, 20_000);

  it("is deterministic: the same seed scores the same twice", () => {
    // The one test that must not take the cache — handing back the same
    // object twice would prove nothing except that a Map works.
    for (const seed of [1, 7]) {
      const a = freshReport(seed);
      const b = freshReport(seed);
      expect(a.score, `seed ${seed}`).toBe(b.score);
      expect(a.findings.map((f) => f.code).join(), `seed ${seed}`).toBe(
        b.findings.map((f) => f.code).join(),
      );
    }
  }, 20_000);

  it("reads the dials: a wet stage measures as wetter than a dry one", () => {
    const dry = report(4, { water: 0 });
    const wet = report(4, { water: 1 });
    const share = (r: StageReport): number =>
      (r.metrics.find((m) => m.id === "ground")?.stats.waterShare ?? 0) as number;
    expect(share(wet)).toBeGreaterThan(share(dry));
  }, 20_000);
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
  }, 20_000);

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
  }, 20_000);

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
  }, 20_000);

  it("finds every crossing with water under it", () => {
    for (const seed of SEEDS) {
      const water = report(seed, { water: 0.9 }).metrics.find((m) => m.id === "water");
      expect(water?.stats.dryCrossings, `seed ${seed}`).toBe(0);
    }
  }, 20_000);
});

describe("the ground's water (R32)", () => {
  it("makes both lakes and swamps, and the swamps are the shallow ones", () => {
    for (const seed of SEEDS) {
      const ground = report(seed, { water: 0.6 }).metrics.find((m) => m.id === "ground");
      const swampShare = (ground?.stats.swampShare ?? 0) as number;
      const lakeShare = (ground?.stats.lakeShare ?? 0) as number;
      // A country with lakes and no shallow water has no reed beds in it.
      expect(swampShare, `seed ${seed}`).toBeGreaterThan(0);
      expect(lakeShare, `seed ${seed}`).toBeGreaterThan(0);
      // ...and a swamp is shallow BY DEFINITION, which is the whole basis
      // of the classification: it is the same water, sorted by depth.
      const mean = (ground?.stats.meanSwampDepth ?? 0) as number;
      expect(mean, `seed ${seed}`).toBeGreaterThan(0);
      expect(mean, `seed ${seed}`).toBeLessThan(ANALYSIS.ground.swamp.deep);
    }
  }, 20_000);

  it("does not drown the country at the top of the water dial", () => {
    // The dial has to stay a dial. A position that turns the map into a sea
    // with a causeway across it is not a wet stage, and no dial position
    // should be able to reach one.
    for (const seed of [1, 4]) {
      const ground = report(seed, { water: 1 }).metrics.find((m) => m.id === "ground");
      expect(ground?.stats.waterShare, `seed ${seed}`).toBeLessThan(ANALYSIS.ground.drowned);
    }
  }, 20_000);
});

describe("the road's surface (R33)", () => {
  it("puts bumps in the gravel here and there, and not everywhere", () => {
    // The floor of this band is the point of it. A generated road comes out
    // of the compiler as a plane unless something roughens it, and a plane
    // is the loudest tell there is — so the check that would catch that is
    // worth pinning against the road actually shipping.
    for (const seed of SEEDS) {
      const bumpy = report(seed)
        .metrics.find((m) => m.id === "rollers")
        ?.checks.find((c) => c.id === "bumpy");
      expect(bumpy?.value, `seed ${seed}`).toBeGreaterThan(ANALYSIS.rollers.bumpy.min);
      expect(bumpy?.value, `seed ${seed}`).toBeLessThan(ANALYSIS.rollers.bumpy.max);
    }
  }, 20_000);

  it("wanders the gravel's width and holds the tarmac's exactly", () => {
    // R33 — a blade cuts a road wider on one pass than the next; a paving
    // machine does not. So the two surfaces make opposite claims, and both
    // are worth pinning: one that the gravel actually USES its band rather
    // than sitting near the nominal, and one that the tarmac does not move
    // at all.
    const track = compileStage(2, "long", { asphalt: 0.6 });
    const band = STAGE_RULES.roughness.width.vary;
    let lo = Infinity;
    let hi = 0;
    for (const s of track.samples) {
      if (s.deck !== null) continue;
      if (s.surface === "asphalt") {
        // Laid, not bladed: exactly the nominal, to the millimetre.
        expect(s.width).toBeCloseTo(track.width, 6);
        continue;
      }
      if (s.surface !== "gravel") continue;
      lo = Math.min(lo, s.width);
      hi = Math.max(hi, s.width);
    }
    // Inside the authored band...
    expect(lo).toBeGreaterThanOrEqual(track.width * (1 - band) - 1e-6);
    expect(hi).toBeLessThanOrEqual(track.width * (1 + band) + 1e-6);
    // ...and actually using it. A width that never leaves the middle of its
    // band is a constant width with extra arithmetic.
    expect(hi - lo).toBeGreaterThan(track.width * band);
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
  }, 20_000);
});
