// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The central output module (OSS_SPEC §19.4): every diagnostic line the engine
// emits goes through these semantic helpers rather than bare `console.*`
// calls. The engine runs in two hosts — the browser app and the headless
// Node simulator — so the sink is pluggable: the PWA routes lines into the
// oss-framework log store (rendered by its LogViewer), the sim CLI prints to
// stderr. The default sink buffers recent lines so early boot output is not
// lost before a host attaches.

export type OutputLevel = "status" | "info" | "warn" | "error" | "debug";
export type OutputSink = (level: OutputLevel, message: string) => void;

const RECENT_CAP = 200;
const recent: { level: OutputLevel; message: string }[] = [];

let sink: OutputSink | null = null;
let debugEnabled = false;

/** Attach the host's sink; buffered boot lines are replayed into it. */
export function setOutputSink(next: OutputSink | null): void {
  sink = next;
  if (next) for (const line of recent) next(line.level, line.message);
}

/** Lift debug-level output into the sink (the `--debug` flag / dev builds). */
export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

/** The buffered tail of everything emitted so far, oldest first. */
export function recentLogs(): readonly { level: OutputLevel; message: string }[] {
  return recent;
}

function emit(level: OutputLevel, message: string): void {
  if (level === "debug" && !debugEnabled) return;
  recent.push({ level, message });
  if (recent.length > RECENT_CAP) recent.shift();
  if (sink) sink(level, message);
}

/** A normal progress/state line ("Stage generated", "Service worker ready"). */
export function status(message: string): void {
  emit("status", message);
}

/** Supplementary detail a user only reads when digging. */
export function info(message: string): void {
  emit("info", message);
}

/** Something odd but recoverable — the game continues. */
export function warn(message: string): void {
  emit("warn", message);
}

/** A failure the player or developer should know about. */
export function error(message: string): void {
  emit("error", message);
}

/** A section marker used to group related lines in the log stream. */
export function header(message: string): void {
  emit("status", `── ${message} ──`);
}

/** Development-only detail; dropped unless `setDebugEnabled(true)` ran. */
export function debug(message: string): void {
  emit("debug", message);
}
