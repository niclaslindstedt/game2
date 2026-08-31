// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GLASS, AS A SWITCH — the strip of rear view at the top of the frame is
// something the player can put a finger on.
//
// The mirror is a second pass over the whole scene (mirror.ts) and the most
// expensive thing in a driving frame, so the press that stands it down
// belongs on the thing itself rather than three cards deep in the options:
// tap the glass and it folds away, tap the strip it folds down to and it
// comes back.
//
// TWO SWITCHES, AND THEY ARE NOT THE SAME SWITCH:
//   * OPTIONS ▸ HUD ▸ REAR VIEW is whether the game has a mirror at all.
//     Off, there is no glass, no strip, and nothing here to press.
//   * The fold is what the mirror is DOING, for this session. Nothing is
//     saved: a player who folded it away over one jump is not saying what
//     they want the next time the game is opened.
// Which is why the fold only ever hides the RENDERING. To be rid of the
// mirror, switch it off in the menu.
//
// UP, the switch is placed off the same three numbers styles.css restates
// from mirror.ts (`--glass-*`) — see the parity note there — so it sits
// exactly on the glass in every viewport. It keeps that place in the views
// that put the picture somewhere else: from the cockpit the rear view is in
// the mirror hanging in the windscreen, and the switch for it still stands
// where the strip would be. One mirror, one place to reach for it.
//
// FOLDED, it goes to the top edge of the frame instead — the mirror shut flat
// against the roof. That is where a strip of chrome belongs when it is not
// being read, and it is what makes the way back a PULL: swipe it down, or
// press it, and the glass comes with you.

import { useRef } from "react";

import { capturePointer } from "./hud-touch.tsx";

/** Where the co-driver's slot hangs, which is whatever the mirror is doing
 * over it: the full glass, the strip it folds down to, or nothing at all. */
export type GlassSlot = "up" | "folded" | "off";

/** The class that drops a `.hud-pace` strip clear of the mirror. Only the
 * glass needs clearing: folded, the strip is against the top edge of the
 * frame and out of the co-driver's slot entirely. */
export function paceUnderGlass(glass: GlassSlot): string {
  return glass === "up" ? "hud-pace-under-glass" : "";
}

/** How far a drag has to run before it stops being a press, CSS px. Short on
 * purpose: the folded strip is a finger tall, so the gesture at it is a flick
 * rather than a pull across the screen. */
const SWIPE_PX = 16;

/** What a drag across the switch ASKED FOR — the glass pulled down, pushed
 * up, or neither, which is every press and every sideways wipe. The dominant
 * axis decides, so a swipe down is down however much sideways came with it. */
export function mirrorSwipe(dx: number, dy: number): "down" | "up" | null {
  if (Math.abs(dy) < SWIPE_PX || Math.abs(dy) <= Math.abs(dx)) return null;
  return dy > 0 ? "down" : "up";
}

/** The chevron on the folded strip: what pulls the glass back down. Drawn
 * wide and shallow because that is all the room a folded mirror leaves. */
function PullGlyph() {
  return (
    <svg className="hud-mirror-pull" viewBox="0 0 24 8" aria-hidden="true">
      <path
        d="M 5 2.2 L 12 6 L 19 2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MirrorSwitch({ up, onToggle }: { up: boolean; onToggle: () => void }) {
  /** Where the press landed, until it lifts — a swipe is only a swipe once
   * both ends of it are known. */
  const from = useRef<{ x: number; y: number } | null>(null);
  /** A swipe already answered this press, so the click that follows it is
   * not a second answer. */
  const swiped = useRef(false);
  return (
    <button
      type="button"
      className={`hud-mirror ${up ? "" : "hud-mirror-folded"}`}
      // The capture is what makes the gesture possible at all: a swipe down
      // off a strip a finger tall leaves the button on its first millimetre,
      // and without it the lift is heard by whatever the finger landed on.
      onPointerDown={(e) => {
        capturePointer(e);
        from.current = { x: e.clientX, y: e.clientY };
        swiped.current = false;
      }}
      onPointerUp={(e) => {
        const start = from.current;
        from.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        const asked = mirrorSwipe(dx, dy);
        // A PRESS is one that lifts near where it landed, and the click below
        // is what answers it — so a keyboard and a controller reach the same
        // switch a finger does. Anything else that travelled without asking
        // for a direction is a wipe across the screen that happened to start
        // here, and the mirror does not answer those.
        if (!asked && Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return;
        swiped.current = true;
        // A swipe SAYS WHICH WAY where a press only toggles — pulling down
        // asks for the glass, pushing up puts it away — so asking for what is
        // already on screen is nothing at all.
        if (asked && (asked === "down") !== up) onToggle();
      }}
      onPointerCancel={() => {
        from.current = null;
      }}
      onClick={() => {
        if (swiped.current) {
          swiped.current = false;
          return;
        }
        onToggle();
      }}
      title={up ? "Fold the rear view away" : "Pull the rear view back down"}
      aria-label={up ? "Fold the rear-view mirror away" : "Pull the rear-view mirror back down"}
    >
      {!up && <PullGlyph />}
    </button>
  );
}
