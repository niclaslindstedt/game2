// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which SHELL is showing the page, if any — the page's whole view of the
// desktop app (tauri/) and of the store app (native/). Each shell's
// initialization script defines one frozen global before the game's own
// scripts run, and this is the only place that reads it. What differs in a
// shell is small and stated here in full: the bundle IS the update, so the
// PWA update lifecycle stays off; and the desktop window has a fullscreen a
// browser tab keeps for itself, so the page may ask for it (below).
//
// DOM-free where it can be: the probe goes through `globalThis`, which Node
// has too, and the fullscreen bridge below guards every DOM call it makes —
// so the root suite can import it and hold the names to the Rust constants
// they mirror (tests/tauri_test.ts) and to the script the store app injects
// (tests/shell_navigation_test.ts).

/** The global every shell defines — the same word as `SHELL_GLOBAL` in
 * `tauri/shell/src/config.rs` and in `native/src/injected.ts`. Change one,
 * change all. */
export const SHELL_GLOBAL = "__SF_SHELL__";

/** The shells the page knows how to name. */
export type ShellHost = "tauri" | "native";

/** Which shell is showing the page, or `null` in a browser. */
export function shellHost(): ShellHost | null {
  const value = (globalThis as unknown as Record<string, unknown>)[SHELL_GLOBAL];
  return value === "tauri" || value === "native" ? value : null;
}

/** THE WINDOW'S FULLSCREEN, ASKED FOR AND ANSWERED — the second thing the
 * page may know about a shell, and the only thing it may ask one to DO.
 *
 * A browser tab has the Fullscreen API and the browser chrome to drive it
 * with; the desktop window has neither, so the game's own FULLSCREEN switch
 * has to reach the native side. It does it through two DOM events rather
 * than a handle: the page dispatches an ASK, the shell answers by
 * dispatching the STATE, and nothing the game holds can outlive the frame
 * it was asked in. In a browser nothing is listening, the ask goes nowhere,
 * and no state ever arrives — which is exactly what the switch not being
 * offered in there looks like.
 *
 * The state is pushed rather than returned because the window is not the
 * page's to know: F11, the window manager and the macOS green button all
 * change it without the game asking, and every one of them comes back
 * through the same event. */
export const SHELL_FULLSCREEN_ASK = "sf-shell-fullscreen-ask";

/** ...and the shell's answer, carrying `{ on: boolean }`. */
export const SHELL_FULLSCREEN_STATE = "sf-shell-fullscreen";

/** What the page may ask of the window. `"state"` asks for nothing and is
 * answered like the rest, which is how a switch learns where it stands. */
export type FullscreenAsk = "on" | "off" | "toggle" | "state";

/** Ask the shell about its window. A no-op in a browser. */
export function askShellFullscreen(want: FullscreenAsk): void {
  const target = globalThis as { dispatchEvent?: (event: Event) => boolean };
  if (typeof CustomEvent !== "function" || typeof target.dispatchEvent !== "function") return;
  target.dispatchEvent(new CustomEvent(SHELL_FULLSCREEN_ASK, { detail: { want } }));
}

/** Hear every answer, until the returned hand-back is called. */
export function onShellFullscreen(told: (on: boolean) => void): () => void {
  const target = globalThis as {
    addEventListener?: (type: string, listener: (event: Event) => void) => void;
    removeEventListener?: (type: string, listener: (event: Event) => void) => void;
  };
  if (typeof target.addEventListener !== "function") return () => {};
  const listen = (event: Event): void => {
    const detail = (event as CustomEvent<{ on?: unknown }>).detail;
    if (typeof detail?.on === "boolean") told(detail.on);
  };
  target.addEventListener(SHELL_FULLSCREEN_STATE, listen);
  return () => target.removeEventListener?.(SHELL_FULLSCREEN_STATE, listen);
}
