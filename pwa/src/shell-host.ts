// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which SHELL is showing the page, if any — the page's whole view of the
// desktop app (tauri/) and of the store app (native/). Each shell's
// initialization script defines one frozen global before the game's own
// scripts run, and this is the only place that reads it. What differs in a
// shell is small and stated here in full: the bundle IS the update, so the
// PWA update lifecycle stays off; the desktop window has a fullscreen a
// browser tab keeps for itself, so the page may ask for it; a phone has
// haptics a WebView cannot reach, so the page may ask for a pulse; and a Mac
// window has a MENU BAR, so the shell may press the game's own buttons by
// name (all three below).
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

/** A PULSE THE PLAYER CAN FEEL, handed out. The third thing the page may
 * know about a shell, and the second thing it may ask one to DO.
 *
 * A browser has the Vibration API and the game uses it where it exists
 * (`game/haptics.ts`); an iOS WebView has nothing of the kind, and the phone
 * it is running on has the best haptics in the game. So the page describes
 * the pulse it wants — how long, and how hard, 0..1 — and the shell spends
 * that on whatever its platform actually has. Told rather than asked: there
 * is no answer, and a pulse nobody is listening for is a pulse that did not
 * happen, which is exactly what a browser with no motor should do. */
export const SHELL_RUMBLE = "sf-shell-rumble";

/** Ask the shell for one pulse. A no-op in a browser. */
export function askShellRumble(ms: number, strength: number): void {
  const target = globalThis as { dispatchEvent?: (event: Event) => boolean };
  if (typeof CustomEvent !== "function" || typeof target.dispatchEvent !== "function") return;
  target.dispatchEvent(new CustomEvent(SHELL_RUMBLE, { detail: { ms, strength } }));
}

/** A MENU ROW, PRESSED — the fourth thing the page may know about a shell,
 * and the only one where the shell speaks first.
 *
 * A macOS app has a menu bar whether or not it wants one: with no menu of its
 * own the window gets a bare default, which on the Mac App Store reads as an
 * app that was ported rather than written. So the desktop shell draws a real
 * one — and a menu bar is only worth drawing if its rows DO something, which
 * means the shell needs a way to press the game's own buttons.
 *
 * It presses them by NAME, on one event, and the names are the whole
 * protocol: `tauri/shell/src/menu.rs` spells the same words and
 * `tests/tauri_test.ts` holds the two lists together. Nothing is handed over
 * and nothing is returned — a command the game cannot serve right now (a
 * GALLERY row pressed mid-race) is a command that does nothing, exactly as a
 * button that is not on screen does nothing.
 *
 * EVERY ROW IS A THING THE WEBSITE ALREADY DOES. The menu is a second way to
 * reach the game's own buttons, never a place a feature lives — a shell-only
 * feature is the one thing the shells may not have. */
export const SHELL_COMMAND = "sf-shell-command";

/** What a menu row may ask the game to do. Every word is a button the player
 * can already press without a menu bar. */
export type ShellCommand =
  "restart" | "pause" | "menu" | "photo" | "gallery" | "settings" | "controls";

/** The words above, as a value, so the shell's list can be held to them. */
export const SHELL_COMMANDS: readonly ShellCommand[] = [
  "restart",
  "pause",
  "menu",
  "photo",
  "gallery",
  "settings",
  "controls",
];

/** Hear every menu row the shell presses, until the hand-back is called. A
 * no-op in a browser, where no menu bar exists to press one. */
export function onShellCommand(told: (command: ShellCommand) => void): () => void {
  const target = globalThis as {
    addEventListener?: (type: string, listener: (event: Event) => void) => void;
    removeEventListener?: (type: string, listener: (event: Event) => void) => void;
  };
  if (typeof target.addEventListener !== "function") return () => {};
  const listen = (event: Event): void => {
    const detail = (event as CustomEvent<{ command?: unknown }>).detail;
    const command = detail?.command;
    if (typeof command === "string" && (SHELL_COMMANDS as readonly string[]).includes(command)) {
      told(command as ShellCommand);
    }
  };
  target.addEventListener(SHELL_COMMAND, listen);
  return () => target.removeEventListener?.(SHELL_COMMAND, listen);
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
