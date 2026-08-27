// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RAISING an interface sound. The bank itself is `bank-ui.ts`; this is the
// funnel every menu noise passes through, and it owns the two things only a
// funnel can: the repeat cap, and the audio unlock.

import { UI_BANK, UI_SOUND, type UiCue } from "./bank-ui.ts";
import { sfx } from "./bus.ts";
import { playSound } from "./play.ts";
import type { PlayShape } from "./types.ts";

export type { UiCue } from "./bank-ui.ts";

/**
 * How fast one cue may repeat, ms.
 *
 * Held-down arrow keys and a flicked touch list both raise `move` faster than
 * a sound can be a sound, and thirty overlapping clicks is not a list scrolling
 * — it is a buzz. The cap lives here, in the one place every cue passes
 * through, so no caller can forget it. The big ones are not capped at all:
 * they cannot be raised faster than a page can change.
 */
const MIN_GAP_MS: Partial<Record<UiCue, number>> = { move: 45, toggle: 40 };

const lastAt = new Map<UiCue, number>();

/**
 * Make the interface's noise for `cue`.
 *
 * IT DOES NOT UNLOCK, and must not. Some of these are raised by a HOVER, and
 * building an AudioContext outside a real user gesture leaves it in a state
 * iOS Safari will not resume — so a mouse crossing a menu row would poison
 * the one context the whole game has. The unlock is hung off actual gestures
 * instead: the menu's own pointer-down, the canvas, and the document-wide
 * arrival listeners `armMenuMusic` puts up while the clock is still stopped.
 * A cue raised before any of those simply makes no sound, which is what the
 * browser was insisting on anyway.
 */
export function playUi(cue: UiCue, shape?: PlayShape): void {
  const gap = MIN_GAP_MS[cue];
  if (gap !== undefined) {
    const now = typeof performance === "undefined" ? Date.now() : performance.now();
    const last = lastAt.get(cue);
    if (last !== undefined && now - last < gap) return;
    lastAt.set(cue, now);
  }
  playSound(sfx, UI_BANK, UI_SOUND[cue], shape);
}

/** A switch changing state: up for on, down for off. */
export function playToggle(on: boolean): void {
  playUi("toggle", { pitch: on ? 1.18 : 0.84 });
}
