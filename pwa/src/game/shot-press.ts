// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE SHUTTER TAKES AT THE PRESS — the two things that cannot wait for
// the picture, which does not exist yet (the drawing buffer is read frames
// later, in the animation callback that filled it — screenshots.ts): the
// HUD as it stands this instant, and a claim on the clipboard; and the
// receipt's bounded wait on that claim.
//
// The claim and the wait are the framework's (`copyWhenReady`,
// `copiedWithin` in `@niclaslindstedt/oss-game-framework/shots/share-image`),
// which carry this game's fallback: where the promise-form write is refused
// the finished blob is written once it arrives. What is this game's is WHICH
// of the screen a picture carries.

import { readHudLayer, type HudLayer } from "@niclaslindstedt/oss-game-framework/shots/shot-hud";
import {
  copiedWithin,
  copyWhenReady,
  type PendingCopy,
} from "@niclaslindstedt/oss-game-framework/shots/share-image";

export { copiedWithin };

/** A clipboard write claimed before its picture existed. */
export type ShotCopy = PendingCopy;

/** Claim the clipboard for a picture that has not been taken yet — CALL
 * THIS INSIDE THE PRESS. Null where this browser cannot put a PNG on the
 * clipboard at all. */
export const claimShotCopy = copyWhenReady;

/** Which of the screen is the HUD a picture carries, and which of it stays
 * out: the driving HUD, less the canvas and the developer overlay (whose
 * facts go into a developer picture as drawn notes instead —
 * shot-notes.ts). */
const HUD_LAYER = { hud: ".hud", exclude: "canvas, .debug-hud" } as const;

/** The HUD over the picture about to be taken, read NOW — the frame is lifted
 * later, and by then the clock has moved on. Null when no HUD is up. */
export function readShotHud(): HudLayer | null {
  return readHudLayer(HUD_LAYER);
}
