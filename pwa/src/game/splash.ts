// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STUDIO CARD — the policy behind `splash-screen.tsx`: how long the card
// is held, and when the app is being driven by something that must not see a
// card at all.
//
// The card is not decoration. The app opens onto the main menu, and that menu
// is a LIVE STAGE: the render stack's chunk has to come down the wire, the
// world builder has to lay a whole stage's terrain, forest and lakes, and the
// bot has to start driving it. All of that is spent BEHIND the card — the menu
// mounts under it and is running by the time it lifts.
//
// Kept apart from the component so the timing rules are testable without a
// renderer (see `tests/splash_test.ts`), which is also why this module takes
// the query string as an argument instead of reading `location` itself.

/**
 * How long the card is held before ANY press can clear it. Short enough not to
 * stand between a player and the menu, long enough that the name is read
 * rather than glimpsed — and it doubles as the guard against the press that
 * launched the app (a tap that opened the PWA) arriving as the press that
 * dismisses the card.
 */
export const SPLASH_MIN_MS = 1000;

/** …and when the card clears itself, for a player who touches nothing. */
export const SPLASH_AUTO_MS = 2800;

/**
 * Where the card is in its life:
 *
 * - `holding` — inside {@link SPLASH_MIN_MS}. Presses are swallowed.
 * - `skippable` — the minimum is served: the next press clears it.
 * - `done` — it is leaving, either because a press cleared it or because
 *   {@link SPLASH_AUTO_MS} came and went on a game that is ready.
 */
export type SplashPhase = "holding" | "skippable" | "done";

/**
 * The phase for a card that has been up `elapsedMs` with the game `warm` or
 * not. The two clocks answer to `warm` differently, and the difference is the
 * difference between a player who is waiting and a player who is not:
 *
 * - **THE AUTO-DISMISS WAITS FOR THE LOAD.** A card that lifted itself while
 *   the world was still being built would hand a player who touched nothing
 *   exactly the empty blue screen it was added to hide, so a slow device holds
 *   it past {@link SPLASH_AUTO_MS} instead. That is the whole reason the card
 *   exists.
 * - **A PRESS DOES NOT.** The player has told us they are done reading, and a
 *   card that answers by ignoring them reads as a hung app. Only the minimum
 *   is still enforced, and that one is not about the load at all.
 */
export function splashPhase(elapsedMs: number, warm: boolean): SplashPhase {
  if (elapsedMs < SPLASH_MIN_MS) return "holding";
  return warm && elapsedMs >= SPLASH_AUTO_MS ? "done" : "skippable";
}

/**
 * True when the app is being DRIVEN and no card belongs in front of it: the
 * screenshot tool and the pinned-run URLs (`?start=1`) want the game, not the
 * house's name. `?splash=1` forces it back for looking at the card itself.
 */
export function splashSkipped(search: string): boolean {
  const params = new URLSearchParams(search);
  if (params.get("splash") === "1") return false;
  return params.get("start") === "1" || params.get("splash") === "0";
}
