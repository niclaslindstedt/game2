// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which SHELL is showing the page, if any — the page's whole view of the
// desktop app (tauri/). The shell's initialization script defines one frozen
// global before the game's own scripts run, and this is the only place that
// reads it. Everything else about the page is the same in a browser tab, an
// installed PWA and the desktop window; what differs is that the bundle IS the
// update in there, so the PWA update lifecycle stays off.
//
// DOM-free — the probe goes through `globalThis`, which Node has too — so the
// root suite can import it and hold the name to the Rust constant it mirrors
// (tests/tauri_test.ts).

/** The global the desktop shell defines — the same word as `SHELL_GLOBAL` in
 * `tauri/shell/src/config.rs`. Change one, change both. */
export const SHELL_GLOBAL = "__SF_SHELL__";

/** The shells the page knows how to name. */
export type ShellHost = "tauri";

/** Which shell is showing the page, or `null` in a browser. */
export function shellHost(): ShellHost | null {
  const value = (globalThis as unknown as Record<string, unknown>)[SHELL_GLOBAL];
  return value === "tauri" ? value : null;
}
