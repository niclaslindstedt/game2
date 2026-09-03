// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WAY BACK TO THE LAST BOARD, however the player reaches for it.
//
// One thing, three doors: a key (the `reset` bind), a button on the HUD's
// action row, and — on a phone, which has neither — a swipe in from the
// bezel. All three ask the input manager for exactly the same edge, and the
// engine does the rest: the car is put back on the road at the last split
// board it took, with the road between here and there to drive again (R28).
//
// It has its own module rather than living in hud.tsx because that file is
// at the §20.5 line cap, and because the three doors belong together: the
// glyph on the button and the mark the swipe fills are the same shape, and
// a player who learns one has learned the other.

import { useEffect, useMemo, useRef } from "react";

import { createEdgeSwipe } from "./edge-swipe.ts";
import { capturePointer, stillDown } from "./hud-touch.tsx";
import { createThumbGuard } from "./thumb-guard.ts";

/** The mark: an arrow curling back on itself, which is what this does to a
 * run. The same shape the co-driver's way-home strip prints beside its
 * metres, drawn here at the action row's own weight. */
function RecoverGlyph() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="hud-glyph">
      <path
        d="M 24 44 A 28 28 0 1 1 30 72"
        fill="none"
        stroke="currentColor"
        strokeWidth="11"
        strokeLinecap="round"
      />
      <polygon points="8,50 40,50 24,22" fill="currentColor" />
    </svg>
  );
}

/** The button, for the action row beside the camera and the shutter.
 *
 * Unlike the shutter it is drawn on every device rather than on touch
 * alone, and the reason is what it is FOR: a driver reaches for this with
 * the car upside down in a ditch, which is the worst possible moment to be
 * remembering a keyboard binding. The bind is the fast way for anybody who
 * has learned it; the button is what makes the way out visible to everybody
 * who has not. */
export function RecoverButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      className="hud-mini hud-mini-icon"
      onClick={onReset}
      title="Back to the last checkpoint (R)"
      aria-label="Back to the last checkpoint"
    >
      <RecoverGlyph />
    </button>
  );
}

/** THE SWIPE. A strip of glass down the left bezel that answers a finger
 * pulling inward across it, and nothing else — `edge-swipe.ts` owns what
 * counts, and it is deliberately hard to do by accident because what it
 * fires costs the player road.
 *
 * It sits over the left thumb zone, which is why it is only as wide as the
 * bezel: a thumb steering the car anchors inboard of that, and one that
 * does land on the edge has to then drag half the screen sideways, dead
 * level, and lift, before anything happens. A finger the strip takes and
 * the gesture does not want is simply spent — the wheel is not steered for
 * that press, which is the cost of the guard and is paid only by a press
 * that started on the bezel.
 *
 * The mark fills as the pull goes in, because a gesture nobody can see
 * working is a gesture nobody believes in. It is written onto the DOM from
 * the pointer handler, at pointer rate: nothing here re-renders to move. */
export function EdgeRecoverZone({ onReset }: { onReset: () => void }) {
  const pullRef = useRef<HTMLDivElement>(null);
  const originRef = useRef(0);
  const swipe = useMemo(() => createEdgeSwipe(), []);

  const draw = (through: number): void => {
    const pull = pullRef.current;
    if (!pull) return;
    pull.style.setProperty("--pull", `${through}`);
    pull.dataset.on = through > 0 ? "1" : "";
  };
  const letGo = (): void => draw(0);
  const letGoRef = useRef(letGo);
  letGoRef.current = letGo;
  const guard = useMemo(() => createThumbGuard(() => letGoRef.current(), window), []);
  useEffect(() => () => guard.dispose(), [guard]);

  return (
    <div
      className="hud-edge"
      onPointerDown={(e) => {
        const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
        originRef.current = box.left;
        // Asked BEFORE the pointer is captured: a finger that landed inboard
        // of the bezel is not this control's, and taking it would be taking
        // it off the wheel underneath.
        if (!swipe.press(e.clientX - box.left, e.clientY)) return;
        capturePointer(e);
        if (!guard.claim(e.pointerId, stillDown(e.currentTarget))) return;
        draw(0);
      }}
      onPointerMove={(e) => {
        if (!guard.owns(e.pointerId)) return;
        draw(swipe.move(e.clientX - originRef.current, e.clientY));
      }}
      onPointerUp={(e) => {
        // Read off the zone's own pointerup, before the guard drops it: this
        // is the one end event that is a finger deliberately leaving the
        // glass rather than the control being taken away from it.
        if (guard.owns(e.pointerId) && swipe.lift(e.clientX - originRef.current, e.clientY)) {
          onReset();
        }
        guard.release(e.pointerId);
      }}
      onPointerCancel={(e) => guard.release(e.pointerId)}
      onLostPointerCapture={(e) => guard.release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={pullRef} className="hud-edge-pull" aria-hidden="true">
        <RecoverGlyph />
      </div>
    </div>
  );
}
