// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ATTRACT SCREEN — the policy behind `splash-screen.tsx`: when the title
// may appear, when a press may clear the card, and when the app is being
// driven by something that must not see a card at all.
//
// The card is not decoration. The app opens onto the main menu, and that menu
// is a LIVE STAGE: the render stack's chunk has to come down the wire, the
// world builder has to lay a whole stage's terrain, forest and lakes, and the
// bot has to start driving it. All of that is spent BEHIND the card.
//
// It plays like an arcade cabinet, in two beats. First the house's name over
// an empty sky while the world is built. Then, the moment the game is
// standing, the title and its finish flags arrive and the card asks for a
// press — and waits, however long that takes. Nothing lifts the card on a
// timer: the press is the point, and it buys two things a timer cannot. The
// player enters the menu when THEY are ready, and the gesture that enters is
// also the one the browser wants before it will let the game make a sound.
//
// Kept apart from the component so the timing rules are testable without a
// renderer (see `tests/splash_test.ts`), which is also why this module takes
// the query string as an argument instead of reading `location` itself.

/**
 * How long the card is held before ANY press can clear it, and before the
 * title may arrive. Short enough not to stand between a player and the menu,
 * long enough that the house's name is read rather than glimpsed — and it
 * doubles as the guard against the press that launched the app (a tap that
 * opened the PWA) arriving as the press that dismisses the card.
 */
export const SPLASH_MIN_MS = 1000;

/**
 * The dead man's handle. Past this, the card opens up whether or not the game
 * ever reported itself ready — a boot that has taken this long has gone wrong
 * in a way the card cannot fix (a render chunk that never landed, a context
 * the GPU refused), and trapping the player on a screen that will never invite
 * them in is worse than letting them through to a menu that may be half-built.
 */
export const SPLASH_STUCK_MS = 20000;

/**
 * True once the card may show the title and take a press, given how long it
 * has been up and whether the game behind it is `warm` — the render stack
 * landed, the first stage standing, the loop turning.
 *
 * **THE READY STATE WAITS FOR THE LOAD.** A card that invited a press while
 * the world was still being built would hand the player exactly the empty blue
 * screen it was added to hide, so a slow device stays on the house's name
 * instead. That is the whole reason the card exists — and it is why nothing
 * here can be answered by the clock alone, {@link SPLASH_STUCK_MS} aside.
 */
export function splashReady(elapsedMs: number, warm: boolean): boolean {
  if (elapsedMs < SPLASH_MIN_MS) return false;
  return warm || elapsedMs >= SPLASH_STUCK_MS;
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
