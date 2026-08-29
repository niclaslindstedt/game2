// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a thumb on the pedal zone is ASKING FOR — read out of where it has
// dragged and how long it has been there, and nothing else.
//
// It lives beside the zone (hud-touch.tsx) rather than inside it for the
// same two reasons the thumb guard does: it is not a rendering concern, and
// it has to be TESTABLE. Nothing here touches the DOM — the zone hands it
// pixels off the anchor and the event's own timestamp, and gets back a
// direction and, on the lift, a gear.
//
// THE GEAR IS A FLICK, not a button. A gear button anywhere on the screen
// asks the driving thumb to leave the throttle for every shift, which is
// the one thing a manual box exists to let a driver keep. So a shift is the
// gesture that thumb can make without going anywhere: a stab up or down
// from where it already is, and back off the glass. Up is a gear up, down
// is a gear down, and the throttle is away only for the length of the stab.
//
// Which leaves the one collision: pulling DOWN is also how the brake is
// reached by default, and a brake is exactly the same drag. Time is what
// separates them — a brake is a HOLD and a flick is not, so a drag that is
// still down `FLICK_MS` after it arrived has stopped being a flick and is
// simply the pedal it is bound to. The brake itself is never delayed for
// this: it bites the instant the thumb crosses, because a brake that waited
// a fifth of a second to find out what the driver meant is a brake nobody
// can trust. A flick down therefore costs a blip of brake, which is what a
// downshift comes with anyway.

import type { PedalDir } from "./settings.ts";

/** Drag (px) from the anchor before a pedal gesture beats plain gas. */
export const PEDAL_DEAD_PX = 28;

/** How long after crossing the deadzone a vertical drag can still be
 * released as a gear flick, ms. Long enough for a deliberate stab —
 * crossing to lifting, not the whole gesture — and short enough that a
 * brake somebody actually wanted is a hold rather than a downshift. */
const FLICK_MS = 250;

/** What a lift was worth to the gearbox: a gear up, a gear down, or the
 * nothing that every hold and every sideways drag is. */
export type PedalFlick = -1 | 0 | 1;

export type PedalGesture = {
  /** Anchor a fresh touch: the thumb is on the pedal and nowhere else yet. */
  press: () => void;
  /** Where the thumb has got to — `dx`/`dy` px from the anchor, `at` the
   * event's own `timeStamp` in ms. Returns the direction it is pulling
   * toward, or null while it is still inside the deadzone. */
  move: (dx: number, dy: number, at: number) => PedalDir | null;
  /** The finger lifted from there, at that timestamp. Consuming: the
   * gesture is over and the next `press` starts a new one. */
  lift: (dx: number, dy: number, at: number) => PedalFlick;
};

/** Which way a thumb this far off the anchor is pulling. The dominant axis
 * picks it, so a drag that is mostly down is down however much sideways
 * came with it, and a thumb inside the deadzone is pulling nowhere. */
function dragDir(dx: number, dy: number): PedalDir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < PEDAL_DEAD_PX) return null;
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "up" : "down";
  return dx > 0 ? "right" : "left";
}

export function createPedalGesture(): PedalGesture {
  /** Whether a touch is live. A lift is CONSUMING, so the flag is what
   * stops a second one — a stray end event, a zone that ends the same
   * gesture twice — reading the same stab as a second gear. */
  let touching = false;
  let dir: PedalDir | null = null;
  /** When the thumb arrived in `dir`, ms on the event clock. A direction it
   * has only just reached is a flick; the same one held is a pedal. */
  let since = 0;

  const track = (dx: number, dy: number, at: number): PedalDir | null => {
    const next = dragDir(dx, dy);
    // Only a CHANGE restarts the clock: a thumb sitting still in a
    // direction keeps reporting it, and every one of those must age.
    if (next !== dir) {
      dir = next;
      since = at;
    }
    return dir;
  };

  return {
    press: () => {
      touching = true;
      dir = null;
      since = 0;
    },
    move: (dx, dy, at) => (touching ? track(dx, dy, at) : null),
    lift: (dx, dy, at) => {
      if (!touching) return 0;
      // The lift's own position counts: a stab quick enough that the last
      // pointermove landed inside the deadzone is still a stab, and the
      // release is where the browser finally reports it from.
      track(dx, dy, at);
      const flicked = (dir === "up" || dir === "down") && at - since <= FLICK_MS;
      const gear: PedalFlick = !flicked ? 0 : dir === "up" ? 1 : -1;
      touching = false;
      dir = null;
      since = 0;
      return gear;
    },
  };
}
