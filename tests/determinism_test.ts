// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DETERMINISM, end to end: one seed and one set of inputs is one run, and a
// report ABOUT a run comes out the same twice once its clock is held still.
//
// The engine draws every random number from the seeded stream in its state,
// so a run needs nothing but its seed to be repeated. The reports are the
// other half: the analysis and the rating time themselves, and a recorded
// tape carries the date it was recorded. None of them reads the wall clock
// directly — each takes a clock (the framework's `core/clock`), so handing in a
// fixed one here makes the WHOLE report comparable, timings and stamps
// included, rather than every field but the ones that happen to move.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_KNOBS,
  analyzeSeed,
  fixedClock,
  parseTape,
  race,
  rateSeed,
  type TapeStage,
} from "@engine";

const STAGE: TapeStage = {
  seed: 42,
  length: "short",
  shape: "sprint",
  laps: 1,
  knobs: { ...DEFAULT_KNOBS },
  hour: 12,
  weather: "clear",
  season: "summer",
};

/** One bot run over the fixed stage, written down, timed by `clock`. */
function drive(clock = fixedClock(Date.UTC(2026, 0, 1))) {
  return race({
    stage: STAGE,
    car: { id: "compact", gearbox: "auto" },
    field: null,
    start: { skipCountdown: true, grid: null },
    driver: { kind: "bot" },
    record: { source: "bot", mode: "sim" },
    clock,
  });
}

describe("determinism", () => {
  it("drives the same run twice from one seed, down to the recorded tape", () => {
    const once = drive();
    const twice = drive();
    expect(once.finished).toBe(true);
    expect(twice).toEqual(once);
    expect(once.tape).not.toBeNull();
    expect(twice.tape).toBe(once.tape);
  });

  it("stamps the tape with the clock it is handed, and nothing else", () => {
    const at = Date.UTC(2026, 8, 28, 12);
    const tape = parseTape(drive(fixedClock(at)).tape ?? "");
    expect(tape.header.recorded).toBe(new Date(at).toISOString());
  });

  it("analyzes a seed to an identical report under a fixed clock, cost metric included", () => {
    const options = { length: "short" as const, clock: fixedClock() };
    const once = analyzeSeed(STAGE.seed, options);
    const twice = analyzeSeed(STAGE.seed, options);
    expect(twice).toEqual(once);
    // The fixed clock reached every pass, not only the top-level timer.
    expect(once.ms).toBe(0);
    for (const metric of once.metrics) expect(metric.ms, metric.id).toBe(0);
  });

  it("rates a seed to an identical rating under a fixed clock", () => {
    const options = { length: "short" as const, clock: fixedClock() };
    const once = rateSeed(STAGE.seed, options);
    const twice = rateSeed(STAGE.seed, options);
    expect(twice).toEqual(once);
    expect(once.ms).toBe(0);
    for (const facet of once.facets) expect(facet.ms, facet.id).toBe(0);
  });

  it("reads the wall clock nowhere — the clock seam and the output module are the framework's", () => {
    const engine = join(import.meta.dirname, "..", "engine");
    const files = readdirSync(engine, { recursive: true, encoding: "utf8" }).filter((f) =>
      f.endsWith(".ts"),
    );
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      // The prose may name what it forbids; the code may not.
      const code = readFileSync(join(engine, file), "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n");
      expect(code, file).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date\(\)|hrtime/);
    }
  });
});
