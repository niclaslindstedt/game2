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

  // R49 — a POPULATION property, and it has to be: the dial moves where the
  // stage starts, and one seed's country can put high ground anywhere. A
  // per-seed assertion here would be a fixture pinned to a noise field.
  it("R49 — the tilt dial decides which way a stage runs through its country", () => {
    const meanDrop = (tilt: number): number => {
      let total = 0;
      for (const seed of SEEDS) {
        const samples = compileStage(seed, "short", { tilt }).samples;
        total += samples[0].elevation - samples[samples.length - 1].elevation;
      }
      return total / SEEDS.length;
    };
    const climbs = meanDrop(0.15);
    const level = meanDrop(0.5);
    const descends = meanDrop(0.85);
    // Every stop asks for more descent than the one under it, and the two
    // ends are far enough apart to be a different stage rather than noise.
    expect(climbs).toBeLessThan(level);
    expect(level).toBeLessThan(descends);
    expect(descends - climbs).toBeGreaterThan(20);
  });

  it("R49 — the middle of the tilt dial is the stage that was built before it", () => {
    // The one position that must change nothing: `siteBiasOf` comes out at
    // zero in a country that does not start high, and R35's plain spiral
    // runs exactly as it always did.
    for (const seed of [4, 7, 19]) {
      expect(compileStage(seed, "medium", { tilt: 0.5 }).samples).toEqual(
        compileStage(seed, "medium").samples,
      );
    }
  });

  // R49/R22 — a lap comes back to its own start line, so there is no net
  // drop to ask for. Stated as a test because the dial is offered on every
  // stage and a circuit is the one shape it cannot move.
  it("R49 — a circuit cannot be tilted", () => {
    for (const tilt of [0.15, 0.5, 0.85]) {
      const samples = compileStage(11, "medium", { tilt }, "circuit").samples;
      expect(samples[0].elevation - samples[samples.length - 1].elevation).toBeCloseTo(0, 1);
    }
  });

  // R49 — a POPULATION property, and it has to be: the dial moves where the
  // stage starts, and one seed's country can put high ground anywhere. A
  // per-seed assertion here would be a fixture pinned to a noise field.
  it("R49 — the tilt dial decides which way a stage runs through its country", () => {
    const meanDrop = (tilt: number): number => {
      let total = 0;
      for (const seed of SEEDS) {
        const samples = compileStage(seed, "short", { tilt }).samples;
        total += samples[0].elevation - samples[samples.length - 1].elevation;
      }
      return total / SEEDS.length;
    };
    const climbs = meanDrop(0.15);
    const level = meanDrop(0.5);
    const descends = meanDrop(0.85);
    // Every stop asks for more descent than the one under it, and the two
    // ends are far enough apart to be a different stage rather than noise.
    expect(climbs).toBeLessThan(level);
    expect(level).toBeLessThan(descends);
    expect(descends - climbs).toBeGreaterThan(20);
  });

  it("R49 — the middle of the tilt dial is the stage that was built before it", () => {
    // The one position that must change nothing: `siteBiasOf` comes out at
    // zero in a country that does not start high, so R35's plain spiral
    // runs exactly as it always did.
    for (const seed of [4, 7, 19]) {
      expect(compileStage(seed, "medium", { tilt: 0.5 }).samples).toEqual(
        compileStage(seed, "medium").samples,
      );
    }
  });

  // R49/R22 — a lap comes back to its own start line, so there is no net
  // drop to ask for. Stated as a test because the dial is offered on every
  // stage and a circuit is the one shape it cannot move.
  it("R49 — a circuit cannot be tilted", () => {
    for (const tilt of [0.15, 0.5, 0.85]) {
      const samples = compileStage(11, "medium", { tilt }, "circuit").samples;
      expect(samples[0].elevation - samples[samples.length - 1].elevation).toBeCloseTo(0, 1);
    }
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
