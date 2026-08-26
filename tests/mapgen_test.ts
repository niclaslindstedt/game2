// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Generator invariants: every R-rule from engine/mapgen/rules.ts is asserted
// here across a spread of seeds — determinism, bounds, braking zones,
// same-direction caps, feature placement, and self-intersection.
import { describe, expect, it } from "vitest";

import { STAGE_RULES as R, compileTrack, generateStage } from "@engine";

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 37 + 1);

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

  it("R5 — never more than two same-direction turns in a row", () => {
    for (const seed of SEEDS) {
      let dir = 0;
      let run = 0;
      for (const plan of generateStage(seed)) {
        if (plan.kind !== "turn") {
          dir = 0;
          run = 0;
          continue;
        }
        if (plan.dir === dir) run += 1;
        else {
          dir = plan.dir ?? 0;
          run = 1;
        }
        expect(run).toBeLessThanOrEqual(R.maxSameDirectionTurns);
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

  it("R7 — fords sit on straights only", () => {
    for (const seed of SEEDS) {
      for (const plan of generateStage(seed)) {
        if (plan.feature === "water") expect(plan.kind).toBe("straight");
      }
    }
  });

  it("R9 — the whole centerline stays inside the world bounds", () => {
    for (const seed of SEEDS) {
      const track = compileTrack(seed);
      expect(track.bounds.minX).toBeGreaterThanOrEqual(-R.worldBound);
      expect(track.bounds.maxX).toBeLessThanOrEqual(R.worldBound);
      expect(track.bounds.minZ).toBeGreaterThanOrEqual(-R.worldBound);
      expect(track.bounds.maxZ).toBeLessThanOrEqual(R.worldBound);
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

  it("R11 — stage length lands in the mandated band", () => {
    for (const seed of SEEDS) {
      const track = compileTrack(seed);
      expect(track.length).toBeGreaterThanOrEqual(R.minStageLength - R.closingStraight);
      expect(track.length).toBeLessThanOrEqual(R.maxStageLength + R.closingStraight);
    }
  });

  it("compiles continuous, finite samples with a jump lip per jump segment", () => {
    for (const seed of SEEDS.slice(0, 10)) {
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
