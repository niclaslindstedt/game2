// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE SHUTTER TAKES AT THE PRESS — the two things that cannot wait for
// the picture, which does not exist yet (the drawing buffer is read frames
// later, in the animation callback that filled it — screenshots.ts): the
// HUD as it stands this instant, and a claim on the clipboard; and the
// receipt's bounded wait on that claim.
//
// The claim itself is the framework's `copyWhenReady`
// (`@niclaslindstedt/oss-game-framework/shots/share-image`): the write is
// issued inside the press, while the gesture's transient activation is still
// live, with a PROMISE of the blob in the `ClipboardItem` — awaiting the
// encode first and writing afterwards is the same call outside its
// activation, which Safari refuses outright.
//
// What this adds is the fallback this game has always had: where the promise
// form is not taken — the item refused, or the constructor throwing on a
// promise value — the finished blob is written once it arrives, which works
// in Chrome, whose activation outlives the encode. The worst case is a copy
// that silently did not happen on one browser rather than one that throws on
// all of them.

import { readHudLayer, type HudLayer } from "@niclaslindstedt/oss-game-framework/shots/shot-hud";
import {
  canCopyImage,
  copyImage,
  copyWhenReady,
  type PendingCopy,
} from "@niclaslindstedt/oss-game-framework/shots/share-image";

/** A clipboard write claimed before its picture existed: hand the PNG over
 * with `ready` once it is encoded (or null, when there was no picture —
 * which releases the claim rather than pasting something stale); `done`
 * says whether the clipboard took it. */
export type ShotCopy = PendingCopy;

/** Claim the clipboard for a picture that has not been taken yet — CALL
 * THIS INSIDE THE PRESS. Null where this browser cannot put a PNG on the
 * clipboard at all. */
export function claimShotCopy(): ShotCopy | null {
  if (!canCopyImage()) return null;
  let arrive: (blob: Blob | null) => void = () => {};
  const arrived = new Promise<Blob | null>((resolve) => {
    arrive = resolve;
  });
  // A browser that took the item and then refused the promise still has an
  // ordinary blob write left to try.
  const later = (): Promise<boolean> => arrived.then((blob) => (blob ? copyImage(blob) : false));
  let claim: PendingCopy | null = null;
  try {
    claim = copyWhenReady();
  } catch {
    claim = null;
  }
  return {
    ready: (blob) => {
      claim?.ready(blob);
      arrive(blob);
    },
    done: claim ? claim.done.then((copied) => copied || later()) : later(),
  };
}

/** How long a RECEIPT waits for the clipboard before it goes out saying only
 * what it already knows, ms.
 *
 * The wait itself is right — a picture the player meant to paste is not
 * really taken until it is pasteable, and one line for one press beats two.
 * What is not right is the wait being unbounded: `clipboard.write` does not
 * always answer. A window that is not focused, a permission the browser
 * decides to sit on, an automated pass with no clipboard at all — in each of
 * those the promise simply never settles, and a shutter whose only receipt
 * hangs off it tells the player NOTHING about a picture that is already in
 * the roll. A press always gets an answer; the clipboard gets a moment to be
 * part of it. */
export const COPY_WAIT = 1200;

/** Whether the clipboard took the picture, ANSWERING EITHER WAY within
 * `COPY_WAIT`. A late yes is reported as a plain save — the picture is on
 * the clipboard regardless, and the receipt for one press has already gone
 * out. */
export function copiedWithin(copy: ShotCopy, ms = COPY_WAIT): Promise<boolean> {
  return Promise.race([
    copy.done,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}

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
