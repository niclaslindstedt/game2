// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BENCHMARK'S REPORT — a run written down, in text somebody can paste.
//
// The card shows a score and two lines, which is what a person needs to know
// whether their machine is coping. This is the other audience: whoever is
// going to make the game faster, who needs to know WHAT THE FRAME WAS DOING
// rather than how fast it went. A number without its conditions cannot be
// acted on, and a number without a breakdown cannot be acted on WELL — "it
// is slow" and "it is submitting nine hundred draw calls, six hundred of
// them undergrowth" are different bug reports.
//
// So the report carries three things, in the order somebody reads them:
//
//   THE CONDITIONS — the stage, the field, the buffer, and every row of
//   OPTIONS ▸ VIDEO. Without these two runs cannot be compared at all, and
//   the whole use of the tool is comparing two runs.
//
//   THE RUN — every reading: how far in, the score so far, the rate of that
//   frame, and what that frame cost the renderer. This is where a thermal
//   sag is told from a scene that got heavier, because the draw calls are
//   sitting in the same table as the frame rate.
//
//   THE SCENE — what was actually standing there on the last frame, by
//   subsystem. This is the part that says where to look.
//
// DOM-free on purpose: it takes numbers and returns a string, so the tests
// hold the format and the card only has to put it on the clipboard.

import { fpsOfIndex, type BenchSample } from "./benchmark-index.ts";
import type { PictureRow } from "./settings.ts";

/** What one frame cost the renderer, read off three's own counters. */
export type FrameCost = {
  /** Draw calls in the WHOLE frame — every pass, not one `render()`. */
  calls: number;
  triangles: number;
  /** Compiled programs, geometries and textures resident. Not per frame:
   * what the stage is holding, which is what a memory problem looks like. */
  programs: number;
  geometries: number;
  textures: number;
};

/** One subsystem's share of the scene, as the renderer tallied it. */
export type SceneShare = {
  /** The named group it hangs under — `world`, `field`, `car`… */
  name: string;
  /** Objects that would be drawn: visible meshes, points and lines. */
  objects: number;
  triangles: number;
};

/** Everything the report needs that is not a reading. */
export type BenchmarkConditions = {
  stage: string;
  cars: number;
  width: number;
  height: number;
  /** Device pixels per CSS pixel — the buffer above is the product of this
   * and the page's own size, so a buffer without it cannot be reproduced. */
  pixelRatio: number;
  /** The rows the run did NOT pin, which are the ones worth reporting. */
  picture: PictureRow[];
  /** The rows it DID pin, so a report from another build is comparable. */
  plan: { label: string; value: string }[];
};

/** A run, ready to paste. */
export type BenchmarkRun = {
  conditions: BenchmarkConditions;
  samples: readonly BenchSample[];
  costs: readonly FrameCost[];
  scene: readonly SceneShare[];
  /** Seconds of game each frame advanced, for the fps conversion. */
  step: number;
  /** Frames the run is long, so a reading can say how far through it is. */
  frames: number;
};

/** Thousands separators, because a triangle count is read at a glance and
 * `1284933` is not. Shared with the score sheet (benchmark-sheet.ts), which
 * is the other thing a run gets pasted as: two of them in one comment have to
 * spell a triangle count the same way. */
export function big(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** The middle reading rather than the mean: one stalled frame — a chunk
 * built, a shader compiled, another program waking up — moves a mean of a
 * hundred readings and moves a median not at all, and what this line is for
 * is what the frame USUALLY costs. Exported because the score sheet's DRAWS
 * column is this same figure — a run's median frame — and two numbers under
 * one name have to be one number. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const half = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

/** A fixed-width column, so the table reads down as well as across when it
 * lands in a comment nobody has re-formatted. Shared with the score sheet for
 * the same reason `big` is. */
export function pad(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

export function benchmarkReport(run: BenchmarkRun): string {
  const { conditions: c, samples, costs, scene, step, frames } = run;
  const last = samples.length > 0 ? samples[samples.length - 1] : null;
  const index = last?.index ?? 0;
  const out: string[] = [];

  out.push(`BENCHMARK — ${c.stage} · ${c.cars} cars · ${c.width}×${c.height} @ ${c.pixelRatio}x`);
  out.push(
    `INDEX ${Math.round(index)} · ${Math.round(fpsOfIndex(index, step))} fps average · ` +
      `${samples.length} readings over ${frames} frames`,
  );
  out.push("");
  out.push(`VIDEO   ${c.picture.map((r) => `${r.label} ${r.value}`).join(" · ")}`);
  out.push(`PINNED  ${c.plan.map((r) => `${r.label} ${r.value}`).join(" · ")}`);

  if (costs.length > 0) {
    out.push("");
    out.push("PER FRAME, MEDIAN OVER THE RUN");
    out.push(`  draw calls   ${big(median(costs.map((f) => f.calls)))}`);
    out.push(`  triangles    ${big(median(costs.map((f) => f.triangles)))}`);
    const held = costs[costs.length - 1];
    out.push(`  programs     ${big(held.programs)}`);
    out.push(`  geometries   ${big(held.geometries)}`);
    out.push(`  textures     ${big(held.textures)}`);
  }

  if (scene.length > 0) {
    out.push("");
    out.push("WHAT WAS STANDING THERE, LAST FRAME");
    out.push(`  ${pad("objects", 9)} ${pad("triangles", 12)}  where`);
    for (const share of [...scene].sort((a, b) => b.triangles - a.triangles)) {
      out.push(`  ${pad(big(share.objects), 9)} ${pad(big(share.triangles), 12)}  ${share.name}`);
    }
  }

  out.push("");
  out.push("THE RUN, READING BY READING");
  out.push(
    `  ${pad("at", 5)} ${pad("frame", 6)} ${pad("index", 6)} ${pad("fps", 5)} ` +
      `${pad("draws", 7)} ${pad("triangles", 11)}`,
  );
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const cost = costs[i];
    const at = frames > 0 ? `${Math.round((s.frame / frames) * 100)}%` : "";
    out.push(
      `  ${pad(at, 5)} ${pad(String(s.frame), 6)} ${pad(String(Math.round(s.index)), 6)} ` +
        `${pad(String(Math.round(s.fps)), 5)} ` +
        `${pad(cost ? big(cost.calls) : "", 7)} ${pad(cost ? big(cost.triangles) : "", 11)}`,
    );
  }
  return out.join("\n");
}
