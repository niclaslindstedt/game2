// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The debug log: a ring buffer of everything worth quoting later, kept only
// while debug mode is on and copied out of the developer menu.
//
// A screenshot shows a moment. Most of what is wrong with a moment happened
// BEFORE it — the landing that bent the suspension, the respawn that put the
// car facing the wrong way, the four seconds of scraping a guard rail. So
// the overlay and this log are a pair: the picture says where, and the log
// says what led there. The two are stitched together by the RUN MARKER —
// every run opens a section headed by the same repro line the overlay
// prints, so a log pasted on its own still names the stage it happened on.
//
// It is deliberately host-side and DOM-free (nothing here touches the
// clipboard or the document): the engine's own output module feeds into it
// through output-bridge.ts, the app writes its own lines, and menu-dev.tsx
// is the only thing that renders it.

/** How many lines are kept. A run is a couple of minutes and the frame
 * trace is one line a second, so a few thousand covers several runs with
 * room for the noisy ones — and caps what a copy can dump into a chat. */
const CAP = 4000;

export type DebugEntry = {
  /** Milliseconds since the log started — a wall clock is noise in a diff,
   * and what anybody reading this wants is the gap between two lines. */
  at: number;
  /** Where the line came from: `run`, `event`, `trace`, `god`, `engine`… */
  tag: string;
  text: string;
};

const entries: DebugEntry[] = [];
/** Index of the first entry of the latest run section, or -1 before any run
 * has opened one. Kept as an index into the ring rather than a slice so the
 * cap can shift it down as old lines fall off the front. */
let runStart = -1;
let started = Date.now();
let enabled = false;

/** Debug mode's master switch. Off, `log` is a no-op and nothing
 * accumulates — the log must not be a memory leak in a shipped game that
 * nobody has turned the tools on in. */
export function setDebugLogging(on: boolean): void {
  if (on === enabled) return;
  enabled = on;
  if (!on) return;
  started = Date.now();
  log("log", "debug logging on");
}

export function debugLogging(): boolean {
  return enabled;
}

export function log(tag: string, text: string): void {
  if (!enabled) return;
  entries.push({ at: Date.now() - started, tag, text });
  if (entries.length > CAP) {
    entries.shift();
    if (runStart > 0) runStart--;
    // The whole latest run has now aged out of the buffer; what is left is
    // an older tail, and calling any of it "the latest run" would be a lie.
    else if (runStart === 0) runStart = -1;
  }
}

/** Open a new run section. `head` is the repro line for the stage being
 * started — the one thing that makes the lines under it reproducible. */
export function logRunStart(head: string): void {
  if (!enabled) return;
  log("run", `──── ${head}`);
  runStart = entries.length - 1;
}

/** Everything, or only the lines since the latest run started. */
export function debugLogText(scope: "all" | "run"): string {
  const from = scope === "run" && runStart >= 0 ? runStart : 0;
  const lines = entries.slice(from);
  if (lines.length === 0) return "(the debug log is empty)";
  const head =
    scope === "run" && runStart >= 0
      ? "# Scandinavian Flick — debug log (latest run)"
      : "# Scandinavian Flick — debug log (everything kept)";
  return [head, ...lines.map((e) => `${(e.at / 1000).toFixed(2)}s [${e.tag}] ${e.text}`)].join(
    "\n",
  );
}

/** How many lines are held, and how many belong to the latest run — what
 * the developer menu shows on its two copy buttons. */
export function debugLogCounts(): { all: number; run: number } {
  return { all: entries.length, run: runStart >= 0 ? entries.length - runStart : 0 };
}

/** The tail, newest last — the menu's preview pane, so the log can be
 * LOOKED at (and screenshotted) without going through the clipboard. */
export function debugLogTail(lines: number): DebugEntry[] {
  return entries.slice(Math.max(0, entries.length - lines));
}

export function clearDebugLog(): void {
  entries.length = 0;
  runStart = -1;
  started = Date.now();
}
