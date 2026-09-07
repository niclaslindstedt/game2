// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BENCHMARK'S HISTORY, and the SCORE SHEET it is copied out as
// (pwa/src/game/benchmark-history.ts, benchmark-sheet.ts).
//
// The benchmark is a comparison instrument: the number means nothing on its
// own and everything against a second number taken on the same machine with
// one row of OPTIONS ▸ VIDEO moved. So what is held here is what that
// comparison needs to survive being written down and pasted somewhere else:
//
//   * a run kept is the RUN — every reading, so the graph can be redrawn and
//     the debug report copied months later — and a run read back out of a
//     store anybody can edit is either a run or nothing;
//   * the newest run is kept even when the store is full, because a cap that
//     dropped the run just measured would be a cap on the wrong end;
//   * the settings on a line are the settings that produced it, off the same
//     ladders OPTIONS ▸ VIDEO walks, so a code cannot describe a picture the
//     game does not have;
//   * two runs that differ by one row differ by one glyph, which is the only
//     reason the code is on the line at all;
//   * the legend explains every ladder the sheet used and none it did not.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RUNS_KEPT,
  benchmarkRuns,
  clearBenchmarks,
  rememberBenchmark,
  type BenchmarkRecord,
} from "../pwa/src/game/benchmark-history.ts";
import {
  RUNGS,
  benchmarkSheet,
  pictureCode,
  pictureGlyph,
  pictureLegend,
  runDraws,
  runWhen,
} from "../pwa/src/game/benchmark-sheet.ts";
import {
  DISTANCE_STOPS,
  PICTURE_ROWS,
  RESOLUTION_STOPS,
  type PictureRow,
} from "../pwa/src/game/settings.ts";
import { renderHeightStops } from "../pwa/src/game/desktop-video.ts";

/** A localStorage that lives for one test — the same stand-in the campaign
 * and odometer suites use. */
function stubStorage(): void {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** The four rows as a browser reports them, at whichever stops are asked
 * for — the same labels `pictureRows` writes down. */
function picture(resolution: string, detail: string, distance: string, sky: string): PictureRow[] {
  return [
    { label: PICTURE_ROWS.resolution, value: resolution },
    { label: PICTURE_ROWS.detail, value: detail },
    { label: PICTURE_ROWS.distance, value: distance },
    { label: PICTURE_ROWS.sky, value: sky },
  ];
}

/** A finished run, with everything a record carries. */
function run(over: Partial<BenchmarkRecord> = {}): BenchmarkRecord {
  return {
    at: 1_760_000_000_000,
    index: 180,
    stage: "Creosote Flats",
    cars: 15,
    width: 2556,
    height: 1179,
    pixelRatio: 3,
    picture: picture("HIGH", "MEDIUM", "NEAR", "LAYERED"),
    plan: [{ label: "car", value: "compact" }],
    frames: 1800,
    step: 1 / 60,
    samples: [
      { frame: 15, index: 210, fps: 126 },
      { frame: 1800, index: 180, fps: 108 },
    ],
    costs: [
      { calls: 515, triangles: 1_284_933, programs: 41, geometries: 912, textures: 33 },
      { calls: 365, triangles: 903_120, programs: 41, geometries: 912, textures: 33 },
    ],
    scene: [{ name: "world", objects: 300, triangles: 900_000 }],
    ...over,
  };
}

describe("the benchmark's history", () => {
  beforeEach(stubStorage);
  afterEach(() => clearBenchmarks());

  it("keeps a run whole, so the graph and the report can be drawn again", () => {
    const one = run();
    rememberBenchmark(one);
    const [back] = benchmarkRuns();
    // Not a summary: the readings ARE the run, and without them a stored
    // score is a number with nothing behind it.
    expect(back.samples).toEqual(one.samples);
    expect(back.costs).toEqual(one.costs);
    expect(back.scene).toEqual(one.scene);
    expect(back.picture).toEqual(one.picture);
    expect(back.plan).toEqual(one.plan);
    // …including the scale it was measured on, so an old run is never
    // redrawn on today's plan.
    expect(back.frames).toBe(1800);
    expect(back.step).toBeCloseTo(1 / 60, 9);
  });

  it("reads newest first, which is the order a comparison is made in", () => {
    rememberBenchmark(run({ at: 1000, index: 100 }));
    rememberBenchmark(run({ at: 3000, index: 300 }));
    rememberBenchmark(run({ at: 2000, index: 200 }));
    expect(benchmarkRuns().map((r) => r.index)).toEqual([300, 200, 100]);
  });

  it("drops the OLDEST when the cap is reached, never the run just measured", () => {
    for (let i = 0; i <= RUNS_KEPT; i++) rememberBenchmark(run({ at: 1000 + i, index: i }));
    const kept = benchmarkRuns();
    expect(kept).toHaveLength(RUNS_KEPT);
    expect(kept[0].index).toBe(RUNS_KEPT);
    expect(kept.map((r) => r.index)).not.toContain(0);
  });

  it("keeps the newest run even when the store refuses all but one write", () => {
    // A full origin is the oldest runs asking to go, not a reason to lose the
    // one that has just been measured.
    const map = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (v.length > 900) throw new Error("QuotaExceededError");
        map.set(k, v);
      },
      removeItem: (k: string) => void map.delete(k),
    };
    rememberBenchmark(run({ at: 1000, index: 100 }));
    rememberBenchmark(run({ at: 2000, index: 200 }));
    const kept = benchmarkRuns();
    expect(kept.length).toBeGreaterThanOrEqual(1);
    expect(kept[0].index).toBe(200);
  });

  it("reads nothing rather than throwing on a store somebody has edited", () => {
    localStorage.setItem("scandi-flick-benchmarks", "{not json");
    expect(benchmarkRuns()).toEqual([]);
    localStorage.setItem("scandi-flick-benchmarks", JSON.stringify({ runs: 3 }));
    expect(benchmarkRuns()).toEqual([]);
    // A row that is not a run is dropped; the rest of the store still reads.
    localStorage.setItem(
      "scandi-flick-benchmarks",
      JSON.stringify([run(), null, { at: "yesterday" }, 7]),
    );
    expect(benchmarkRuns()).toHaveLength(1);
  });

  it("never hands a NaN to the graph", () => {
    localStorage.setItem(
      "scandi-flick-benchmarks",
      JSON.stringify([
        { ...run(), index: "fast", samples: [{ frame: null, index: {}, fps: NaN }] },
      ]),
    );
    const [back] = benchmarkRuns();
    expect(back.index).toBe(0);
    expect(back.samples[0]).toEqual({ frame: 0, index: 0, fps: 0 });
  });

  it("clears", () => {
    rememberBenchmark(run());
    clearBenchmarks();
    expect(benchmarkRuns()).toEqual([]);
  });
});

describe("the picture as a code", () => {
  it("puts every stop of a row on a rung of its own", () => {
    const glyphs = RESOLUTION_STOPS.map(
      (stop) => pictureGlyph({ label: PICTURE_ROWS.resolution, value: stop.label }).glyph,
    );
    expect(new Set(glyphs).size).toBe(RESOLUTION_STOPS.length);
    // Cheapest at the bottom of the bar, dearest at the top — the whole of
    // what there is to memorise.
    expect(glyphs[0]).toBe(RUNGS[0]);
    expect(glyphs[glyphs.length - 1]).toBe(RUNGS[RUNGS.length - 1]);
  });

  it("has a rung for every stop of the LONGEST row there is", () => {
    // The desktop RESOLUTION row is NATIVE over seven heights, which is what
    // the eight rungs are sized for: a ladder longer than the bar would put
    // two settings on one glyph and the code would stop being readable.
    const desktop = renderHeightStops(0);
    expect(desktop.length).toBeLessThanOrEqual(RUNGS.length);
    const glyphs = desktop.map(
      (stop) => pictureGlyph({ label: PICTURE_ROWS.resolution, value: stop.label }).glyph,
    );
    expect(new Set(glyphs).size).toBe(desktop.length);
    // NATIVE is the top of that ladder, however the row is walked on screen.
    expect(glyphs[0]).toBe(RUNGS[RUNGS.length - 1]);
  });

  it("moves ONE glyph when one row moves, which is the point of the code", () => {
    const near = pictureCode(picture("HIGH", "MEDIUM", "NEAR", "LAYERED"));
    const far = pictureCode(picture("HIGH", "MEDIUM", "FAR", "LAYERED"));
    expect(near).toHaveLength(4);
    expect(far).toHaveLength(4);
    const moved = [...near].filter((glyph, i) => glyph !== [...far][i]);
    expect(moved).toHaveLength(1);
    // …and it moves UP, because FAR is the dear end of DISTANCE.
    expect(RUNGS.indexOf([...far][2])).toBeGreaterThan(RUNGS.indexOf([...near][2]));
    expect(DISTANCE_STOPS[DISTANCE_STOPS.length - 1].label).toBe("FAR");
  });

  it("says so rather than guessing at a stop this build does not have", () => {
    const read = pictureGlyph({ label: PICTURE_ROWS.sky, value: "PAINTED" });
    expect(read.rung).toBe(-1);
    expect(read.stops).toBeNull();
    // Still one character wide, so a sheet with an old run in it reads down.
    expect(read.glyph).toHaveLength(1);
  });
});

describe("the score sheet", () => {
  it("puts the score, the picture and the frame on one line each", () => {
    const sheet = benchmarkSheet([run({ index: 248 })]);
    const line = sheet.split("\n").find((l) => l.includes("248"));
    expect(line).toBeDefined();
    // The score, the same figure in fps, the median frame beside it, and the
    // settings that produced all three.
    expect(line).toContain("149");
    expect(line).toContain(pictureCode(picture("HIGH", "MEDIUM", "NEAR", "LAYERED")));
    expect(line).toContain("440");
    expect(line).toContain("2556×1179 @3x");
    expect(line).toContain(runWhen(1_760_000_000_000));
  });

  it("reports the same median frame the debug report does", () => {
    // 515 and 365 — the sheet's DRAWS column and the report's `draw calls`
    // line are one figure, and two numbers under one name would be a bug
    // nobody could see without running both.
    expect(runDraws(run())).toBe(440);
  });

  it("lifts the conditions into the header when every run shares them", () => {
    const sheet = benchmarkSheet([run({ at: 2000 }), run({ at: 1000 })]);
    expect(sheet).toContain("Creosote Flats · 15 cars");
    expect(sheet.split("\n").filter((l) => l.includes("Creosote Flats"))).toHaveLength(1);
  });

  it("names the stage per run when they do not, so two are never compared blind", () => {
    const sheet = benchmarkSheet([run({ at: 2000 }), run({ at: 1000, stage: "Bajada", cars: 8 })]);
    expect(sheet).toContain("STAGE");
    expect(sheet).toContain("Bajada · 8 cars");
    expect(sheet).toContain("Creosote Flats · 15 cars");
  });

  it("reads newest first, as it was handed them", () => {
    const sheet = benchmarkSheet([run({ at: 2000, index: 200 }), run({ at: 1000, index: 100 })]);
    // The rows only — the legend below is numbered too, and it is not a run.
    const scores = sheet
      .split("\n")
      .slice(
        0,
        sheet.split("\n").findIndex((l) => l.startsWith("LEGEND")),
      )
      .filter((l) => /^\s+\d/.test(l))
      .map((l) => l.trim().split(/\s+/)[0]);
    expect(scores).toEqual(["200", "100"]);
  });

  it("carries a legend for every ladder it used, and none it did not", () => {
    const sheet = benchmarkSheet([run()]);
    for (const stop of RESOLUTION_STOPS) expect(sheet).toContain(stop.label);
    for (const stop of DISTANCE_STOPS) expect(sheet).toContain(stop.label);
    // A browser's sheet has no business explaining the desktop app's heights.
    expect(sheet).not.toContain("NATIVE");
    expect(sheet).not.toContain("1080P");
  });

  it("explains a row read on two ladders when a machine has run both", () => {
    const columns = pictureLegend([
      run(),
      run({ at: 2000, picture: picture("1080P", "HIGH", "FAR", "FULL") }),
    ]);
    const resolution = columns.find((c) => c.label === PICTURE_ROWS.resolution);
    expect(resolution?.ladders).toHaveLength(2);
    expect(
      benchmarkSheet([run(), run({ at: 2000, picture: picture("1080P", "HIGH", "FAR", "FULL") })]),
    ).toContain("1080P");
  });

  it("orders the legend the way the code is read", () => {
    const columns = pictureLegend([run()]);
    expect(columns.map((c) => c.label)).toEqual([
      PICTURE_ROWS.resolution,
      PICTURE_ROWS.detail,
      PICTURE_ROWS.distance,
      PICTURE_ROWS.sky,
    ]);
  });

  it("says something useful with nothing to say", () => {
    expect(benchmarkSheet([])).toContain("no runs kept");
  });
});
