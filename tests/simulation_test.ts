// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The simulation slice: bots drive generated stages end to end through the
// real engine, deterministically. These are the wide-net checks that keep
// the generator and the handling honest with each other — if a rule change
// builds a stage a decent driver cannot finish, this is what goes red.
import { describe, expect, it } from "vitest";

import { compileTrack, simulateStage } from "@engine";

const SEEDS = [1, 2, 3, 7, 42, 99];

describe("bot simulations", () => {
  it("the bot finishes every stage with either car, without getting lost", () => {
    for (const seed of SEEDS) {
      for (const carId of ["compact", "classic"]) {
        const result = simulateStage({ seed, carId, maxTime: 240 });
        expect(result.finished, `seed ${seed} / ${carId}`).toBe(true);
        // A lost car means the generator built something undrivable (or the
        // handling broke): allow a single recovery, never a pattern.
        expect(result.stats.respawns, `seed ${seed} / ${carId}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("stage pace lands in rally territory", () => {
    for (const seed of SEEDS) {
      const result = simulateStage({ seed, carId: "classic", maxTime: 240 });
      const avgKmh = (result.trackLength / result.time) * 3.6;
      expect(avgKmh, `seed ${seed}`).toBeGreaterThan(55);
      expect(avgKmh, `seed ${seed}`).toBeLessThan(160);
    }
  });

  it("the bot drifts stages that have hard corners", () => {
    let hardStages = 0;
    let driftingStages = 0;
    for (const seed of SEEDS) {
      const track = compileTrack(seed);
      const hasHard = track.segments.some((p) => p.severity === "hard");
      if (!hasHard) continue;
      hardStages += 1;
      const result = simulateStage({ seed, carId: "classic", maxTime: 240 });
      if (result.stats.driftCount > 0) driftingStages += 1;
    }
    expect(hardStages).toBeGreaterThan(0);
    expect(driftingStages).toBe(hardStages);
  });

  it("the bot flies stages that have jumps", () => {
    for (const seed of SEEDS) {
      const track = compileTrack(seed);
      const jumps = track.segments.filter((p) => p.feature === "jump").length;
      if (jumps === 0) continue;
      const result = simulateStage({ seed, carId: "compact", maxTime: 240 });
      expect(result.stats.jumps, `seed ${seed}`).toBeGreaterThanOrEqual(jumps);
      expect(result.stats.airTime, `seed ${seed}`).toBeGreaterThan(0.3);
    }
  });

  it("runs are deterministic — same seed, same digest, same stats", () => {
    for (const seed of [3, 42]) {
      const a = simulateStage({ seed, carId: "classic" });
      const b = simulateStage({ seed, carId: "classic" });
      expect(a.digest).toBe(b.digest);
      expect(a.time).toBe(b.time);
      expect(a.stats).toEqual(b.stats);
    }
  });

  it("different cars produce different runs", () => {
    const a = simulateStage({ seed: 42, carId: "compact" });
    const b = simulateStage({ seed: 42, carId: "classic" });
    expect(a.digest).not.toBe(b.digest);
  });
});
