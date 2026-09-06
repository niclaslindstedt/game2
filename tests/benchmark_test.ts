// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BENCHMARK'S SCORE, and the graph it is drawn on
// (pwa/src/game/benchmark-index.ts).
//
// Tested rather than looked at because the whole value of an index is that
// it is COMPARABLE, and every way that goes wrong is arithmetic nobody can
// see in a screenshot: a scale whose 100 is not real time, a graph that
// says a run is further along than it is, an axis that clips the line it
// exists to show. The claims are the ones the number has to keep for two
// machines' scores to divide into each other honestly:
//
//   * 100 IS REAL TIME, and the scale is a ratio — half the wall clock is
//     twice the index, whatever the run's length happens to be;
//   * the score reads the same over fifteen frames as over eighteen
//     hundred, which is what lets the run draw its own answer as it goes;
//   * the line ends ON the score, because a graph whose last point is not
//     the result is two numbers for one thing;
//   * the axis keeps headroom over the score and never clips a reading,
//     including the wild ones a cold machine starts with.

import { describe, expect, it } from "vitest";

import {
  INDEX_REAL,
  SAMPLE_EVERY,
  benchIndex,
  benchPlot,
  type BenchSample,
} from "../pwa/src/game/benchmark-index.ts";

// The shape of a run, restated here rather than imported: the plan lives in
// `benchmark.ts`, which reaches for a canvas and a WebGL context, and this
// suite runs on plain Node with no DOM in its type graph. Nothing is being
// held to these numbers — the index is a ratio and the plot takes its span
// as an argument, so both are correct for any run the plan states. They are
// the shipped one because a test that reads like the real thing is worth
// more than one driven by 7 and 13.
/** Frames the run is long, and seconds of game each one advances. */
const FRAMES = 1800;
const STEP = 1 / 60;

/** The whole run, in seconds of racing — what the machine has to draw. */
const RACE = FRAMES * STEP;

/** A run scored at one steady pace: the readings a machine that held
 * `rate` x real time would have produced. */
function steady(rate: number): BenchSample[] {
  const out: BenchSample[] = [];
  for (let f = SAMPLE_EVERY; f <= FRAMES; f += SAMPLE_EVERY) {
    out.push({ frame: f, index: benchIndex(f * STEP, (f * STEP) / rate) });
  }
  return out;
}

describe("the benchmark's index", () => {
  it("scores 100 for drawing the race in the time it takes to drive", () => {
    expect(benchIndex(RACE, RACE)).toBeCloseTo(100, 6);
    // Thirty seconds of racing, which is what the card reports.
    expect(RACE).toBeCloseTo(30, 6);
    expect(benchIndex(RACE, 30)).toBeCloseTo(100, 6);
  });

  it("doubles when the wall clock halves", () => {
    expect(benchIndex(RACE, 15)).toBeCloseTo(200, 6);
    expect(benchIndex(RACE, 7.5)).toBeCloseTo(400, 6);
    expect(benchIndex(RACE, 60)).toBeCloseTo(50, 6);
  });

  it("reads the same over one sample as over the whole run", () => {
    // Fifteen frames is a quarter of a second of racing; a machine that
    // draws it in a quarter of a second is at real time, and one that
    // takes twice as long is at half.
    const window = SAMPLE_EVERY * STEP;
    expect(benchIndex(window, 0.25)).toBeCloseTo(INDEX_REAL, 6);
    expect(benchIndex(window, 0.5)).toBeCloseTo(50, 6);
    expect(benchIndex(window, 0.25)).toBeCloseTo(benchIndex(RACE, 30), 6);
  });

  it("has no score before there is anything to divide", () => {
    expect(benchIndex(0, 0)).toBe(0);
    expect(benchIndex(RACE, 0)).toBe(0);
    expect(benchIndex(0, 1)).toBe(0);
  });
});

describe("the benchmark's graph", () => {
  it("walks the run across the box and ends on the score", () => {
    const samples = steady(3);
    const plot = benchPlot(samples, FRAMES);
    expect(plot.points).toHaveLength(samples.length);
    expect(plot.points[0].x).toBeCloseTo(SAMPLE_EVERY / FRAMES, 6);
    // The x axis is the RUN, not the readings: the last frame of the run is
    // the right-hand edge, and the score there is the run's score.
    expect(plot.points[plot.points.length - 1].x).toBeCloseTo(1, 6);
    expect(plot.index).toBeCloseTo(300, 6);
    expect(plot.index).toBeCloseTo(samples[samples.length - 1].index, 6);
  });

  it("puts a run half drawn half way across", () => {
    const half = steady(2).filter((s) => s.frame <= FRAMES / 2);
    const plot = benchPlot(half, FRAMES);
    expect(plot.points[plot.points.length - 1].x).toBeCloseTo(0.5, 6);
  });

  it("keeps headroom over the score, so the line never draws on the ceiling", () => {
    for (const rate of [0.4, 1, 1.73, 4, 11]) {
      const plot = benchPlot(steady(rate), FRAMES);
      expect(plot.top).toBeGreaterThanOrEqual(plot.index + 25);
      expect(plot.top).toBeLessThanOrEqual(plot.index + 75);
      // y is measured DOWN from the top of the box, so the line sitting
      // below the ceiling means a positive y.
      for (const p of plot.points) expect(p.y).toBeGreaterThan(0);
    }
  });

  it("holds the axis still while a converging score drifts", () => {
    // What a settling run does: the same score, a point or two either way.
    const tops = [180, 183, 179, 186].map(
      (index) => benchPlot([{ frame: 900, index }], FRAMES).top,
    );
    expect(new Set(tops).size).toBe(1);
  });

  it("does not clip a reading the score has since fallen away from", () => {
    // A cold machine's first readings are its wildest, and the one worth
    // looking at is the spike.
    const plot = benchPlot(
      [
        { frame: 15, index: 400 },
        { frame: 30, index: 150 },
        { frame: 45, index: 120 },
      ],
      FRAMES,
    );
    expect(plot.top).toBeGreaterThanOrEqual(400);
    for (const p of plot.points) expect(p.y).toBeGreaterThanOrEqual(0);
  });

  it("marks real time only where the axis reaches it", () => {
    const fast = benchPlot([{ frame: 900, index: 250 }], FRAMES);
    expect(fast.real).not.toBeNull();
    // 100 sits proportionally up an axis measured from zero.
    expect(fast.real).toBeCloseTo(1 - INDEX_REAL / fast.top, 6);
    // A machine well under real time has no 100 on its axis to point at.
    const slow = benchPlot([{ frame: 900, index: 20 }], FRAMES);
    expect(slow.top).toBeLessThan(INDEX_REAL);
    expect(slow.real).toBeNull();
  });

  it("draws an empty box before the first reading", () => {
    const plot = benchPlot([], FRAMES);
    expect(plot.points).toHaveLength(0);
    expect(plot.index).toBe(0);
    expect(plot.top).toBeGreaterThan(0);
  });
});
