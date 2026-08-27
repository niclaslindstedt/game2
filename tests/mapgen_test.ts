// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Generator invariants: every R-rule from engine/mapgen/rules.ts is asserted
// here across a spread of seeds — determinism, bounds, braking zones,
// same-direction caps, feature placement, self-intersection, the length
// bands, the pacenote book, the ford dips, and the endless stream.
import { describe, expect, it } from "vitest";

import {
  STAGE_RULES as R,
  compileStage,
  compileTrack,
  generateStage,
  type FiniteStageLength,
  type Track,
  type TurnSeverity,
} from "@engine";

const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 1);
const SEVERITY_RANK: Record<TurnSeverity, number> = { soft: 0, medium: 1, hard: 2 };

describe("stage generator", () => {
  it("is deterministic per seed", () => {
    for (const seed of [1, 99, 4711]) {
      const a = generateStage(seed);
      const b = generateStage(seed);
      expect(a).toEqual(b);
    }
  });

  it("produces different stages for different seeds", () => {
    expect(generateStage(1)).not.toEqual(generateStage(2));
  });

  it("R1/R2 — opens and closes with a featureless straight", () => {
    for (const seed of SEEDS) {
      const plans = generateStage(seed);
      const first = plans[0];
      const last = plans[plans.length - 1];
      expect(first.kind).toBe("straight");
      expect(first.feature).toBe("none");
      expect(first.length).toBeGreaterThanOrEqual(R.openingStraight);
      expect(last.kind).toBe("straight");
      expect(last.feature).toBe("none");
      expect(last.length).toBeGreaterThanOrEqual(R.closingStraight);
    }
  });

  it("R3 — turns stay inside their severity vocabulary", () => {
    for (const seed of SEEDS) {
      for (const plan of generateStage(seed)) {
        if (plan.kind !== "turn") continue;
        const vocab = R.turn[plan.severity ?? "soft"];
        expect(plan.radius).toBeGreaterThanOrEqual(vocab.radius.min);
        expect(plan.radius).toBeLessThanOrEqual(vocab.radius.max);
        const angle = plan.length / (plan.radius ?? 1);
        expect(angle).toBeGreaterThanOrEqual(vocab.angle.min - 1e-9);
        expect(angle).toBeLessThanOrEqual(vocab.angle.max + 1e-9);
      }
    }
  });

  it("R4 — every hard turn follows a straight", () => {
    for (const seed of SEEDS) {
      const plans = generateStage(seed);
      for (let i = 0; i < plans.length; i++) {
        if (plans[i].kind === "turn" && plans[i].severity === "hard") {
          expect(i).toBeGreaterThan(0);
          expect(plans[i - 1].kind).toBe("straight");
        }
      }
    }
  });

  it("R5 — same-direction runs stay under the count and angle caps", () => {
    for (const seed of SEEDS) {
      let dir = 0;
      let run = 0;
      let angle = 0;
      for (const plan of generateStage(seed)) {
        if (plan.kind !== "turn") {
          dir = 0;
          run = 0;
          angle = 0;
          continue;
        }
        if (plan.dir === dir) {
          run += 1;
          angle += plan.length / (plan.radius ?? 1);
        } else {
          dir = plan.dir ?? 0;
          run = 1;
          angle = plan.length / (plan.radius ?? 1);
        }
        expect(run).toBeLessThanOrEqual(R.maxSameDirectionTurns);
        expect(angle).toBeLessThanOrEqual(R.maxSameDirectionAngle + 1e-9);
      }
    }
  });

  it("R6 — jumps sit on long straights with run-up and landing room", () => {
    for (const seed of SEEDS) {
      for (const plan of generateStage(seed)) {
        if (plan.feature !== "jump") continue;
        expect(plan.kind).toBe("straight");
        expect(plan.length).toBeGreaterThanOrEqual(R.jump.minStraight);
        expect(plan.featureStart ?? 0).toBeGreaterThanOrEqual(R.jump.runUp);
        expect(plan.length - (plan.featureEnd ?? 0)).toBeGreaterThanOrEqual(R.jump.landing);
      }
    }
  });

  it("R7/R13 — crossings sit on straights, clear of the ends by their own margin", () => {
    for (const seed of SEEDS) {
      for (const plan of generateStage(seed)) {
        if (plan.feature !== "water") continue;
        expect(plan.kind).toBe("straight");
        // A ford needs its dip's aprons; a deck needs its level run-on.
        const margin = plan.crossing === "ford" ? R.water.apron : R.bridge.margin;
        expect(plan.featureStart ?? 0).toBeGreaterThanOrEqual(margin);
        expect(plan.length - (plan.featureEnd ?? 0)).toBeGreaterThanOrEqual(margin);
      }
    }
  });

  it("R13 — the span decides the architecture: wade it, plank it, or pour it", () => {
    let fords = 0;
    let timber = 0;
    let concrete = 0;
    for (const seed of SEEDS) {
      for (const plan of generateStage(seed, "long", { water: 0.85 })) {
        if (plan.feature !== "water") continue;
        const span = (plan.featureEnd ?? 0) - (plan.featureStart ?? 0);
        if (plan.crossing === "ford") {
          fords += 1;
          expect(span).toBeLessThanOrEqual(R.water.fordMax);
        } else if (plan.crossing === "timber") {
          timber += 1;
          expect(span).toBeGreaterThan(R.water.fordMax);
          expect(span).toBeLessThanOrEqual(R.bridge.timberMax);
        } else {
          concrete += 1;
          expect(span).toBeGreaterThan(R.bridge.timberMax);
        }
      }
    }
    // A wet stage band has to actually produce all three, or the rule is
    // only theory.
    expect(fords).toBeGreaterThan(0);
    expect(timber).toBeGreaterThan(0);
    expect(concrete).toBeGreaterThan(0);
  });

  it("R15 — the asphalt dial is the share of the stage that comes out sealed", () => {
    const share = (asphalt: number): number => {
      let paved = 0;
      let total = 0;
      for (const seed of SEEDS.slice(0, 8)) {
        const track = compileStage(seed, "long", { asphalt });
        paved += track.samples.filter((s) => s.surface === "asphalt").length;
        total += track.samples.length;
      }
      return paved / total;
    };
    expect(share(0)).toBe(0);
    // Every sealed run is hundreds of meters long, so a single stage lands
    // near the dial rather than on it; across eight it should be close.
    expect(share(0.25)).toBeGreaterThan(0.15);
    expect(share(0.25)).toBeLessThan(0.36);
    expect(share(0.5)).toBeGreaterThan(share(0.25));
    expect(share(1)).toBeGreaterThan(0.95);
  });

  it("the dials are deterministic, and different dials build different stages", () => {
    const dials = { elevation: 0.8, water: 0.2, trees: 0.9, asphalt: 0.4 };
    expect(compileStage(7, "medium", dials).samples).toEqual(
      compileStage(7, "medium", dials).samples,
    );
    expect(compileStage(7, "medium", dials).samples).not.toEqual(
      compileStage(7, "medium", { ...dials, elevation: 0.1 }).samples,
    );
  });

  it("the elevation dial is the road's own relief", () => {
    const swing = (elevation: number): number => {
      const ys = compileStage(4, "medium", { elevation }).samples.map((s) => s.elevation);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(swing(0)).toBeLessThan(swing(0.5));
    expect(swing(0.5)).toBeLessThan(swing(1));
  });

  it("R9 — the centerline stays inside each length's world bounds", () => {
    for (const length of ["short", "medium", "long"] as FiniteStageLength[]) {
      const bound = R.stageLengths[length].worldBound;
      for (const seed of SEEDS.slice(0, 6)) {
        const track = compileStage(seed, length);
        expect(track.bounds.minX).toBeGreaterThanOrEqual(-bound);
        expect(track.bounds.maxX).toBeLessThanOrEqual(bound);
        expect(track.bounds.minZ).toBeGreaterThanOrEqual(-bound);
        expect(track.bounds.maxZ).toBeLessThanOrEqual(bound);
      }
    }
  });

  it("R10 — the centerline never comes close to crossing itself", () => {
    // Compare coarsely (every 3rd sample) for test speed; ignore route
    // neighbours within 100 m of arc length — the generator's guarantee
    // starts at its 80 m ignore window plus probe coarseness. The
    // guarantee itself is minSelfDistance at 6 m probe spacing, so the
    // continuous line can dip up to ~one probe step closer. Violations are
    // collected in plain code (an expect() per pair would time the test out)
    // and asserted once.
    const min2 = (R.minSelfDistance - 7) ** 2;
    const violations: string[] = [];
    for (const seed of SEEDS) {
      const pts = compileTrack(seed).samples;
      for (let i = 0; i < pts.length; i += 3) {
        for (let j = i + 3; j < pts.length; j += 3) {
          if (pts[j].s - pts[i].s < 100) continue;
          const dx = pts[i].x - pts[j].x;
          const dz = pts[i].z - pts[j].z;
          if (dx * dx + dz * dz < min2) {
            violations.push(
              `seed ${seed}: s=${pts[i].s.toFixed(0)} vs s=${pts[j].s.toFixed(0)} at ` +
                `${Math.sqrt(dx * dx + dz * dz).toFixed(1)} m`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("R11 — every finite length lands in its band", () => {
    for (const length of ["short", "medium", "long", "xlong"] as FiniteStageLength[]) {
      const band = R.stageLengths[length].band;
      for (const seed of SEEDS.slice(0, 4)) {
        const track = compileStage(seed, length);
        expect(track.length).toBeGreaterThanOrEqual(band.min - R.closingStraight);
        expect(track.length).toBeLessThanOrEqual(band.max + R.closingStraight);
      }
    }
  });

  it("compiles continuous, finite samples with a jump lip per jump segment", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const track = compileTrack(seed);
      let prev = track.samples[0];
      for (const sample of track.samples) {
        expect(Number.isFinite(sample.x)).toBe(true);
        expect(Number.isFinite(sample.z)).toBe(true);
        expect(Number.isFinite(sample.elevation)).toBe(true);
        const dx = sample.x - prev.x;
        const dz = sample.z - prev.z;
        expect(Math.sqrt(dx * dx + dz * dz)).toBeLessThanOrEqual(track.step * 1.5 + 1e-6);
        prev = sample;
      }
      const jumpSegments = track.segments.filter((p) => p.feature === "jump").length;
      const lips = track.samples.filter((s) => s.jump).length;
      expect(lips).toBe(jumpSegments);
    }
  });
});

describe("pacenotes", () => {
  it("covers every turn segment with a matching call", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const track = compileTrack(seed);
      let s = 0;
      for (const plan of track.segments) {
        if (plan.kind === "turn") {
          const mid = s + plan.length / 2;
          const note = track.pacenotes.find((n) => n.s <= mid && n.endS >= mid);
          expect(note).toBeDefined();
          expect(note?.dir).toBe(plan.dir);
          // A note's severity is the tightest of the turns it merged.
          expect(SEVERITY_RANK[note?.severity ?? "soft"]).toBeGreaterThanOrEqual(
            SEVERITY_RANK[plan.severity ?? "soft"],
          );
        }
        s += plan.length;
      }
    }
  });

  it("merges contiguous same-direction turns into one call", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const track = compileTrack(seed);
      for (let i = 1; i < track.pacenotes.length; i++) {
        const prev = track.pacenotes[i - 1];
        const next = track.pacenotes[i];
        expect(next.s).toBeGreaterThanOrEqual(prev.endS - 1e-6);
        // Back-to-back notes only exist across a direction change; a
        // same-direction continuation would have merged.
        if (next.s - prev.endS < 1e-6) expect(next.dir).not.toBe(prev.dir);
      }
    }
  });

  it("notes carry the summed turn angle", () => {
    const track = compileTrack(SEEDS[0]);
    for (const note of track.pacenotes) {
      expect(note.angle).toBeGreaterThan(0);
      expect(note.endS).toBeGreaterThan(note.s);
    }
  });
});

describe("ford dips (R12)", () => {
  it("water lies flat, below every approach within the apron", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const track = compileTrack(seed);
      const samples = track.samples;
      for (let i = 0; i < samples.length; i++) {
        if (samples[i].surface !== "water") continue;
        // Flat across the run…
        let j = i;
        while (j < samples.length && samples[j].surface === "water") j++;
        for (let k = i; k < j; k++) {
          expect(Math.abs(samples[k].elevation - samples[i].elevation)).toBeLessThan(1e-6);
        }
        // …and a local low: nothing within an apron of either end dips
        // below the water line.
        const reach = Math.round(R.water.apron / track.step);
        for (let k = Math.max(0, i - reach); k < Math.min(samples.length, j + reach); k++) {
          expect(samples[k].elevation).toBeGreaterThanOrEqual(samples[i].elevation - 1e-6);
        }
        i = j;
      }
    }
  });
});

describe("endless stages", () => {
  it("streams deterministically regardless of how extends are chunked", () => {
    const a = compileStage(7, "endless");
    a.extend?.(6000);
    const b = compileStage(7, "endless");
    for (let s = 1500; s <= 6000; s += 331) b.extend?.(s);
    b.extend?.(6000);
    expect(a.samples.length).toBe(b.samples.length);
    for (let i = 0; i < a.samples.length; i += 7) {
      expect(a.samples[i].x).toBeCloseTo(b.samples[i].x, 9);
      expect(a.samples[i].elevation).toBeCloseTo(b.samples[i].elevation, 9);
      expect(a.samples[i].surface).toBe(b.samples[i].surface);
    }
    expect(a.pacenotes).toEqual(b.pacenotes);
  });

  it("keeps the R10 guarantee inside the tail window", () => {
    for (const seed of [3, 11, 42]) {
      const track = compileStage(seed, "endless");
      track.extend?.(8000);
      const pts = track.samples;
      const min2 = (R.minSelfDistance - 7) ** 2;
      const violations: string[] = [];
      for (let i = 0; i < pts.length; i += 3) {
        for (let j = i + 3; j < pts.length; j += 3) {
          const gap = pts[j].s - pts[i].s;
          if (gap < 100 || gap > R.endless.tailWindow) continue;
          const dx = pts[i].x - pts[j].x;
          const dz = pts[i].z - pts[j].z;
          if (dx * dx + dz * dz < min2) {
            violations.push(`seed ${seed}: s=${pts[i].s.toFixed(0)} vs ${pts[j].s.toFixed(0)}`);
          }
        }
      }
      expect(violations).toEqual([]);
    }
  });

  it("always keeps road materialized past what was asked for", () => {
    const track: Track = compileStage(5, "endless");
    expect(track.endless).toBe(true);
    expect(track.length).toBeGreaterThanOrEqual(R.endless.initial);
    track.extend?.(4000);
    expect(track.length).toBeGreaterThanOrEqual(4000);
    // Asking for less than what exists is a no-op.
    const before = track.samples.length;
    expect(track.extend?.(1000)).toBe(false);
    expect(track.samples.length).toBe(before);
  });
});
