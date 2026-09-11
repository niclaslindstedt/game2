// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PORTRAIT IS TURNED OFF. The game is played across the screen and nowhere
// else. The road runs to a horizon, the rear-view glass hangs off the top of
// it and the co-driver's calls sit under that; held upright the frame is
// mostly sky and dashboard, and the one thing the player is steering by — the
// corner arriving — is a band an inch deep. The touch controls make it worse
// rather than better: a wheel and a pedal want the two bottom corners of a
// WIDE frame, and upright they crowd into the same thumb's reach.
//
// Nothing about the upright layout has been removed. `styles.css` still
// carries its whole `@media (orientation: portrait)` HUD, the shot recipes
// still ask for it, and `camera.ts` still frames for it. This module is the
// SWITCH in front of all of it: `PORTRAIT_ALLOWED` back to `true` and the
// game is playable upright again, exactly as it was.
//
// Two other places say the same thing to the layers above the page, and both
// have to keep agreeing with the switch: the web app manifest's `orientation`
// (`pwa/pwa-plugin.ts`) and the store app's (`native/app.config.js`). Those
// two are what stop an installed or packaged build ROTATING at all; this one
// is what covers the case they cannot reach — a browser tab, where the
// manifest has no say.
//
// DOM-free on purpose, so `tests/orientation_test.ts` can hold the rules
// without a browser. `orientation-gate.tsx` is the only thing that watches
// the media query and draws the card.

import { APP_NAME } from "../identity.ts";

/**
 * THE SWITCH. `false` bars the upright layout everywhere the page can bar it;
 * `true` restores it with no other edit anywhere.
 */
export const PORTRAIT_ALLOWED = false;

/**
 * The media query the entire portrait HUD is written behind in `styles.css`.
 * The gate watches THIS string rather than comparing `innerWidth` against
 * `innerHeight` itself, because CSS counts a square viewport as portrait and
 * a hand-rolled comparison is one `>=` away from disagreeing with every rule
 * it is meant to be covering.
 */
export const PORTRAIT_QUERY = "(orientation: portrait)";

/** Whether the cover goes up over a viewport the browser reports as portrait. */
export function portraitBarred(portrait: boolean): boolean {
  return portrait && !PORTRAIT_ALLOWED;
}

/**
 * A RUN CANNOT BE DRIVEN BEHIND A COVER. Same rule the lost-GPU path obeys
 * (`run-loop.ts`): the player can no longer see the road, so the run goes on
 * the pause card and waits there rather than running on into the scenery. A
 * menu needs none of it — the stage under a menu is a drone shot the bot is
 * driving, and there is nothing to lose.
 */
export function mustPause(barred: boolean, inMenu: boolean): boolean {
  return barred && !inMenu;
}

/**
 * Which way round the reader can fix it. A phone or a tablet is TURNED; a
 * desktop window that happens to be taller than it is wide is DRAGGED, and
 * telling somebody at a laptop to rotate their screen is the kind of detail
 * that makes a game feel ported rather than made.
 */
export type GateKind = "device" | "window";

/** What the cover says, in the words of the thing being read on. */
export function gateCopy(kind: GateKind): { head: string; line: string } {
  return kind === "device"
    ? {
        head: "TURN YOUR DEVICE",
        line: `${APP_NAME} is played sideways.`,
      }
    : {
        head: "WIDEN THE WINDOW",
        line: `${APP_NAME} is played in a window wider than it is tall.`,
      };
}
