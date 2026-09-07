// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERY RUN THIS MACHINE HAS SCORED — kept, so a score can be compared with
// the one before it instead of with somebody's memory of it.
//
// The benchmark is a comparison instrument and nothing else (benchmark.ts):
// the number means nothing on its own, and everything against a second
// number taken on the same machine with one row of OPTIONS ▸ VIDEO moved.
// Run it, walk to the options, move DISTANCE, run it again — and by then the
// first card is gone, which left the whole method resting on somebody having
// written the number down or screenshotted it. So every finished run is kept
// here, and the difference between two settings is a thing you can read off
// a list rather than a thing you have to have planned for.
//
// IT KEEPS THE WHOLE RUN, not the score. A score alone would make the list a
// scoreboard, and what is wanted is the run back: the graph redrawn, the sag
// found at the frame it happened on, the debug report copied out weeks after
// the machine that drew it was warm. The readings are what all three are made
// of, so the readings are what is stored.
//
// It is per MACHINE and cannot be anything else — a phone and a desktop are a
// factor of ten apart on exactly this work — so it lives in local storage
// beside the player's own settings, like `load-times.ts` and for the same
// reason.
//
// DOM-free apart from the store itself, so the tests hold the format.

import type { BenchSample } from "./benchmark-index.ts";
import type { FrameCost, SceneShare } from "./benchmark-report.ts";
import type { PictureRow } from "./settings.ts";

const KEY = "scandi-flick-benchmarks";

/** How many runs are kept, newest first.
 *
 * A run is its readings, and there are `frames / SAMPLE_EVERY` of them — a
 * hundred and twenty at the shipped length, each carrying a reading and the
 * frame cost beside it, which is about 15 kB of JSON. Twenty of those is some
 * 300 kB against an origin that also holds four ghosts inside the browser's
 * five megabytes, and twenty is far more than the two or three a comparison
 * is ever actually made across. */
export const RUNS_KEPT = 20;

/** Decimals kept on a reading. A score is read to the unit and drawn in a box
 * 150 units tall, so a third decimal is bytes spent on a difference no graph
 * can show and no report prints. */
const READING_DP = 1;

/** One finished run, as it is written down. Everything the card, the graph
 * and the debug report are drawn from — a record is the run, not a summary of
 * it. */
export type BenchmarkRecord = {
  /** When it finished, ms since the epoch. The list's identity as well as its
   * date: two runs a second apart are two runs. */
  at: number;
  /** The score, which is the last reading's index — carried on the record so
   * a list can be drawn without walking every run's readings. */
  index: number;
  /** THE CONDITIONS. The stage and the field are pinned by the plan and are
   * still written down per run, because a record from a build whose plan said
   * something else has to say so rather than silently read as this one. */
  stage: string;
  cars: number;
  width: number;
  height: number;
  pixelRatio: number;
  /** OPTIONS ▸ VIDEO as it stood — the rows the benchmark deliberately does
   * not pin, and therefore the whole reason a second run exists. */
  picture: PictureRow[];
  /** …and the rows it did pin, so a run from another build is comparable
   * rather than assumed. */
  plan: { label: string; value: string }[];
  /** Frames the run was long, and the seconds of game each one advanced —
   * the graph's x axis and the fps conversion both need them, and a record
   * that took them from today's plan would redraw an old run on a scale it
   * was never measured on. */
  frames: number;
  step: number;
  samples: BenchSample[];
  costs: FrameCost[];
  scene: SceneShare[];
};

/** Round to `READING_DP`, dropping anything that is not a number: a reading
 * out of a hand-edited store must not reach the graph as a NaN, which draws
 * as a line that vanishes. */
function reading(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const scale = 10 ** READING_DP;
  return Math.round(value * scale) / scale;
}

/** A whole non-negative count, or zero. Every figure in a `FrameCost` and a
 * `SceneShare` is one. */
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

/** A positive number kept EXACTLY, or zero. The step is a sixtieth of a
 * second, which `reading` would round to nothing: it is not a reading but the
 * scale the readings were taken on, and the graph and the fps axis are both
 * divisions by it. */
function exact(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function rows(value: unknown): PictureRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is PictureRow => {
      const r = row as Partial<PictureRow> | null;
      return !!r && typeof r.label === "string" && typeof r.value === "string";
    })
    .map((row) => ({ label: row.label, value: row.value }));
}

/** One stored run, read back defensively. A stored blob is a file anybody can
 * edit and a build from before a field existed, so anything that is not a run
 * comes back as null and is dropped rather than drawn. */
function record(value: unknown): BenchmarkRecord | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Partial<BenchmarkRecord>;
  if (typeof r.at !== "number" || !Number.isFinite(r.at) || r.at <= 0) return null;
  const samples = Array.isArray(r.samples) ? r.samples : [];
  const costs = Array.isArray(r.costs) ? r.costs : [];
  const scene = Array.isArray(r.scene) ? r.scene : [];
  return {
    at: r.at,
    index: reading(r.index),
    stage: typeof r.stage === "string" ? r.stage : "",
    cars: count(r.cars),
    width: count(r.width),
    height: count(r.height),
    pixelRatio: reading(r.pixelRatio),
    picture: rows(r.picture),
    plan: rows(r.plan),
    frames: count(r.frames),
    // A step of zero would divide the fps axis by nothing; a run that cannot
    // say what a frame advanced has no rate to report and says so as one.
    step: exact(r.step),
    samples: samples.map((s: Partial<BenchSample>) => ({
      frame: count(s?.frame),
      index: reading(s?.index),
      fps: reading(s?.fps),
    })),
    costs: costs.map((c: Partial<FrameCost>) => ({
      calls: count(c?.calls),
      triangles: count(c?.triangles),
      programs: count(c?.programs),
      geometries: count(c?.geometries),
      textures: count(c?.textures),
    })),
    scene: scene
      .filter((s: Partial<SceneShare>) => typeof s?.name === "string")
      .map((s: Partial<SceneShare>) => ({
        name: s.name as string,
        objects: count(s.objects),
        triangles: count(s.triangles),
      })),
  };
}

/** Newest first, which is the order the list is read in and the order the cap
 * cuts from. */
function newestFirst(runs: BenchmarkRecord[]): BenchmarkRecord[] {
  return [...runs].sort((a, b) => b.at - a.at);
}

/** Every run this machine has kept, newest first. An unreadable store reads
 * as no history rather than throwing: a corrupt key must not cost the page
 * that is about to draw it. */
export function benchmarkRuns(): BenchmarkRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const runs: BenchmarkRecord[] = [];
    for (const row of parsed) {
      const kept = record(row);
      if (kept) runs.push(kept);
    }
    return newestFirst(runs).slice(0, RUNS_KEPT);
  } catch {
    return [];
  }
}

/** Write a run down and return the history it makes.
 *
 * A full store is not a failure worth losing the newest run over — it is the
 * oldest runs asking to go — so a refused write drops the tail and tries
 * again, down to the run just finished on its own. */
export function rememberBenchmark(run: BenchmarkRecord): BenchmarkRecord[] {
  const kept = newestFirst([run, ...benchmarkRuns()]).slice(0, RUNS_KEPT);
  for (let keep = kept.length; keep >= 1; keep--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(kept.slice(0, keep)));
      return kept.slice(0, keep);
    } catch {
      // Out of room, or a store that refuses every write. Either way the next
      // pass asks for less; the last one asks for one run, and if that is
      // refused too the history stands as it was for this session.
    }
  }
  return kept;
}

/** Wipe the history. The developer menu's own button owns this; nothing in
 * the game reaches it. */
export function clearBenchmarks(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — there was nothing to clear */
  }
}
