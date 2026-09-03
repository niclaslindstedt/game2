// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stage dials — what asking for water or relief actually buys, and that
// asking twice builds the same stage. Each of these sweeps a dial across its
// range and compiles a spread of stages at every stop, so unlike the rest of
// the generator's rules they cannot share a corpus with anything: the whole
// point of them is that the stages differ. That is what makes them expensive,
// and their own file. The asphalt dial (R15) is dearer again and has a file
// to itself — `mapgen_asphalt_test.ts`.
import { describe, expect, it } from "vitest";

import { STAGE_RULES as R, compileStage } from "@engine";

import { stagePlans } from "./support/stages.ts";

const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 1);

describe("the stage dials", () => {
  it("R13 — the span decides the architecture: wade it, plank it, or pour it", () => {
    let fords = 0;
    let culverts = 0;
    let timber = 0;
    let concrete = 0;
    for (const seed of SEEDS) {
      for (const plan of stagePlans(seed, "long", { water: 0.85 })) {
        if (plan.feature !== "water") continue;
        const span = (plan.featureEnd ?? 0) - (plan.featureStart ?? 0);
        if (plan.crossing === "ford") {
          fords += 1;
          expect(span).toBeLessThanOrEqual(R.water.fordMax);
        } else if (plan.crossing === "culvert") {
          // R12 — a stream the road could not dip to goes under it; the
          // crossing occupies the pipe's own span of road.
          culverts += 1;
          expect(span).toBeCloseTo(R.water.culvert.span, 5);
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
    // A wet stage band has to actually produce all four, or the rule is
    // only theory.
    expect(fords).toBeGreaterThan(0);
    expect(culverts).toBeGreaterThan(0);
    expect(timber).toBeGreaterThan(0);
    expect(concrete).toBeGreaterThan(0);
    // Twenty-four LONG stages at the wet end of the dial, which is a good
    // way over the file's own 30 s: it passed on an idle machine and timed
    // out beside the rest of the file, which is a coin toss and not a test.
  }, 90_000);

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
});
