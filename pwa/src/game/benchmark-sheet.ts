// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCORE SHEET — every run this machine has kept, on one line each, in
// text somebody can paste.
//
// The debug report (benchmark-report.ts) is ONE run in full: its conditions,
// its hundred and twenty readings, the scene behind them. This is the other
// half of the same idea — every run against every other one, which is the
// question the benchmark actually exists to answer. Nobody wants to know what
// their machine scores; they want to know what DISTANCE costs on it, and that
// is a difference between two lines rather than anything on either.
//
// WHICH IS WHY THE SETTINGS ARE ON THE LINE. A table of scores with the
// conditions somewhere else is a table that cannot be read: the eye has to
// hold a number while it goes and looks up what produced it, and by the third
// run it has stopped. So each run carries OPTIONS ▸ VIDEO as it stood, beside
// its own score, and two lines are then a comparison at a glance.
//
// AND WHY THEY ARE GLYPHS. Spelled out, the four rows are `HIGH · MEDIUM ·
// NEAR · LAYERED` — sixty characters that push the score off the left of any
// column and wrap the moment the sheet is pasted anywhere narrow. As a rung
// on a ladder each row is ONE character, the four fit in the width of a word,
// and the shape of a line is legible before any of it is read: `████` is
// everything up, `▁▁▁▁` everything down, and the run that moved one row is
// the line with one glyph out of place.
//
// The ladder is `▁▂▃▄▅▆▇█` — a bar that grows with what the row costs, so
// cheapest is lowest and there is nothing to memorise. It is TEXT, which is
// the whole point: it survives a copy into a chat window, a commit message or
// a GitHub comment, where a colour does not. On screen the same code is
// tinted as well (menu-bench.tsx), because a screen can afford both — but
// nothing is said in the colour that the glyph does not already say.
//
// THE LEGEND IS AT THE BOTTOM, and it is generated from the ladders the sheet
// actually used rather than written out here. A legend restating the stops
// would be a second copy of them and would go stale the first time a row
// gained a rung — so both the code and the legend read `PICTURE_LADDERS`,
// which sits beside `pictureRows` in settings.ts precisely so that a row
// added to the picture is added to the thing that decodes it in the same
// breath. Restated here, a new row reports a value this file cannot read, and
// every stored run draws it as "a stop this build does not have".
//
// DOM-free: numbers and records in, a string out.

import { fpsOfIndex } from "./benchmark-index.ts";
import { big, median, pad } from "./benchmark-report.ts";
import type { BenchmarkRecord } from "./benchmark-history.ts";
import { PICTURE_LADDERS, type PictureRow } from "./settings.ts";

/** The ladder, cheapest first. Eight rungs because the longest row the
 * picture has is eight stops — the desktop RESOLUTION row, NATIVE over the
 * seven heights under it — so every stop of every row gets a rung of its own
 * and no two settings can share a glyph. */
export const RUNGS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** What a value not on any ladder reads as: a build that has since renamed a
 * stop, or a store somebody edited. It keeps the column's width so the sheet
 * still reads down, and the legend names it. */
const UNKNOWN = "?";

/** The rung a stop stands on, spread over the eight so a three-stop row uses
 * the bottom, the middle and the top of the same bar every other row is drawn
 * against. A one-stop ladder is the top of it: there is nothing for it to be
 * cheaper than. */
function rungAt(at: number, stops: number): number {
  if (stops <= 1) return RUNGS.length - 1;
  return Math.round((at * (RUNGS.length - 1)) / (stops - 1));
}

/** One row of the picture, read.
 *
 * `rung` is where it stands on the eight, or -1 for a value no ladder has —
 * the on-screen sheet tints by it, and the tint has to mean the same thing
 * the glyph does or the page is saying two things at once. `stops` is the
 * ladder it was read on, which is what the legend explains. */
export type GlyphRead = { glyph: string; rung: number; stops: string[] | null };

export function pictureGlyph(row: PictureRow): GlyphRead {
  for (const ladder of PICTURE_LADDERS) {
    if (ladder.label !== row.label) continue;
    for (const stops of ladder.ladders) {
      const at = stops.indexOf(row.value);
      if (at < 0) continue;
      const rung = rungAt(at, stops.length);
      return { glyph: RUNGS[rung], rung, stops };
    }
  }
  return { glyph: UNKNOWN, rung: -1, stops: null };
}

/** A whole picture, read row by row — the order the rows were written down,
 * which is the order OPTIONS ▸ VIDEO offers them. */
export function pictureGlyphs(picture: readonly PictureRow[]): GlyphRead[] {
  return picture.map(pictureGlyph);
}

/** …and the same thing as the code that goes on a line of the sheet. */
export function pictureCode(picture: readonly PictureRow[]): string {
  return pictureGlyphs(picture)
    .map((read) => read.glyph)
    .join("");
}

/** A run's median frame, in draw calls — the same figure the debug report
 * prints, so the sheet's DRAWS column and a pasted report agree. Zero for a
 * run that kept no costs. */
export function runDraws(run: BenchmarkRecord): number {
  return median(run.costs.map((c) => c.calls));
}

/** The date as `YYYY-MM-DD HH:MM`, in the machine's own time — this is a
 * local log of a local machine, and a UTC stamp on it would be a timestamp
 * nobody can match against what they remember doing. Shared with the page the
 * sheet is copied from, so a row and its line are stamped alike. */
export function runWhen(at: number): string {
  const d = new Date(at);
  const two = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ` +
    `${two(d.getHours())}:${two(d.getMinutes())}`
  );
}

/** What a run was measured ON, as one phrase. Two runs that do not share it
 * are two runs that cannot be compared, which is why it is computed per run
 * and only lifted into the header when every run agrees. */
function conditions(run: BenchmarkRecord): string {
  return `${run.stage || "?"} · ${run.cars} cars`;
}

/** The buffer, which a score means nothing without: the drawing buffer in
 * device pixels and the ratio it was reached at. */
function buffer(run: BenchmarkRecord): string {
  return `${run.width}×${run.height} @${run.pixelRatio}x`;
}

/** One column of the legend: a picture row, and every ladder the sheet read
 * it on. A row read on two of them is a history carrying browser runs and
 * desktop ones, which is a real thing on a machine that runs both. */
export type LegendColumn = {
  label: string;
  ladders: { glyph: string; rung: number; label: string }[][];
  /** A value on none of them — a build that has since renamed a stop, or a
   * store somebody edited. Named rather than left as a bare `?`. */
  unknown: boolean;
};

/** THE LEGEND — every column the sheet used, with the rungs it was read on.
 *
 * Only the ladders that actually appear: a browser's sheet has no business
 * explaining the desktop app's heights, and a legend nobody needs is a legend
 * that gets skipped along with the one they did.
 *
 * Structured rather than text, because the same legend is printed under the
 * pasted sheet AND drawn under the page it was copied from (menu-bench.tsx),
 * and one of those wants colour. Two legends written separately would be two
 * legends, and the day a ladder gains a rung only one of them would say so. */
export function pictureLegend(runs: readonly BenchmarkRecord[]): LegendColumn[] {
  /** A Map so first-seen order survives — which is the order of the code the
   * reader is decoding. */
  const columns = new Map<string, { stops: string[][]; unknown: boolean }>();
  for (const run of runs) {
    for (const row of run.picture) {
      const column = columns.get(row.label) ?? { stops: [], unknown: false };
      const { stops } = pictureGlyph(row);
      if (!stops) column.unknown = true;
      else if (!column.stops.includes(stops)) column.stops.push(stops);
      columns.set(row.label, column);
    }
  }
  return [...columns].map(([label, column]) => ({
    label,
    ladders: column.stops.map((stops) =>
      stops.map((stop, i) => {
        const rung = rungAt(i, stops.length);
        return { glyph: RUNGS[rung], rung, label: stop };
      }),
    ),
    unknown: column.unknown,
  }));
}

/** …and the same legend as the lines that go under a pasted sheet. */
function legendLines(runs: readonly BenchmarkRecord[]): string[] {
  const columns = pictureLegend(runs);
  if (columns.length === 0) return [];
  const width = Math.max(...columns.map((column) => column.label.length));
  const out: string[] = [
    "",
    `LEGEND — PICTURE is one glyph a row, ${RUNGS[0]} cheapest to ` +
      `${RUNGS[RUNGS.length - 1]} dearest, in this order:`,
  ];
  columns.forEach((column, at) => {
    const ladders = column.ladders.map((rungs) =>
      rungs.map((r) => `${r.glyph} ${r.label}`).join(" · "),
    );
    if (column.unknown) ladders.push(`${UNKNOWN} a stop this build does not have`);
    // A second ladder is indented under the row's own name rather than run
    // onto the same line, which nobody can find the break in.
    out.push(`  ${at + 1} ${column.label.padEnd(width)}  ${ladders[0] ?? ""}`);
    for (const extra of ladders.slice(1)) out.push(`  ${" ".repeat(width + 2)}  ${extra}`);
  });
  return out;
}

/** THE SHEET: every run, newest first, ready to paste. */
export function benchmarkSheet(runs: readonly BenchmarkRecord[]): string {
  if (runs.length === 0) {
    return "BENCHMARK HISTORY — no runs kept on this machine yet.";
  }
  const shared = new Set(runs.map(conditions));
  const out: string[] = [];
  out.push(
    shared.size === 1
      ? `BENCHMARK HISTORY — ${[...shared][0]}`
      : "BENCHMARK HISTORY — several stages, named per run",
  );
  out.push(
    `${runs.length} run${runs.length === 1 ? "" : "s"} on this machine, newest first · ` +
      "100 is real time, higher is better",
  );
  out.push("");

  /** The widest code in the sheet, so the column is as narrow as it can be
   * and still square. A build with four picture rows gives four. */
  const code = Math.max(7, ...runs.map((run) => pictureCode(run.picture).length));
  const stage = shared.size === 1 ? 0 : Math.max(...runs.map((r) => conditions(r).length));
  const buffers = Math.max(...runs.map((r) => buffer(r).length));
  const head =
    `  ${pad("INDEX", 5)} ${pad("FPS", 5)} ${pad("DRAWS", 6)}  ` +
    `${"PICTURE".padEnd(code)}  ${"BUFFER".padEnd(buffers)}  ` +
    (stage > 0 ? `${"STAGE".padEnd(stage)}  ` : "") +
    "WHEN";
  out.push(head);
  for (const run of runs) {
    out.push(
      `  ${pad(String(Math.round(run.index)), 5)} ` +
        `${pad(String(Math.round(fpsOfIndex(run.index, run.step))), 5)} ` +
        `${pad(big(runDraws(run)), 6)}  ` +
        `${pictureCode(run.picture).padEnd(code)}  ${buffer(run).padEnd(buffers)}  ` +
        (stage > 0 ? `${conditions(run).padEnd(stage)}  ` : "") +
        runWhen(run.at),
    );
  }
  out.push(...legendLines(runs));
  return out.join("\n");
}
