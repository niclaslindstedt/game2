// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COVER OVER AN UPRIGHT SCREEN. Portrait is turned off (`orientation.ts`
// owns the switch and the reasoning); an installed or packaged build is
// locked by its manifest and never gets here, but a browser tab can be turned
// whenever the reader likes, and this is what it finds when it is.
//
// It is a COVER, like the splash card and the lost-GPU screen: opaque, over
// everything including the splash, and it takes every press so nothing
// underneath is driven blind. It carries no way past itself on purpose —
// turning the device back IS the way past it.

import { useEffect, useState } from "react";

import { PORTRAIT_QUERY, gateCopy, portraitBarred, type GateKind } from "./orientation.ts";

/** A phone is turned, a window is dragged wider. `pointer: coarse` is the
 * same test the splash card uses to decide whether to ask for a key or a tap. */
function gateKind(): GateKind {
  return window.matchMedia?.("(pointer: coarse)").matches ? "device" : "window";
}

/** Whether the page is upright right now, read off the very media query the
 * portrait HUD is written behind. */
function readPortrait(): boolean {
  return window.matchMedia?.(PORTRAIT_QUERY).matches ?? false;
}

/**
 * @param onBarred Called on the edge into upright, never on the way out. The
 *   app answers it by putting a live run on the pause card — see `mustPause`.
 */
export function OrientationGate({ onBarred }: { onBarred: () => void }) {
  const [portrait, setPortrait] = useState(readPortrait);
  const [kind] = useState(gateKind);

  useEffect(() => {
    const query = window.matchMedia?.(PORTRAIT_QUERY);
    if (!query) return;
    const onChange = (): void => setPortrait(query.matches);
    query.addEventListener("change", onChange);
    // The query can have flipped between the first read and this listener
    // landing — a phone handed over already turned, or a window dragged
    // during the boot.
    onChange();
    return () => query.removeEventListener("change", onChange);
  }, []);

  const barred = portraitBarred(portrait);
  useEffect(() => {
    if (barred) onBarred();
  }, [barred, onBarred]);

  if (!barred) return null;
  const { head, line } = gateCopy(kind);
  return (
    <div
      className="rotate-gate"
      role="alertdialog"
      aria-label={head}
      // The cover is the whole point; a press that reaches the road under it
      // is a car being steered by somebody who cannot see it.
      onPointerDown={(e) => e.preventDefault()}
    >
      <div className="rotate-gate-card">
        <GateMark kind={kind} />
        <p className="rotate-gate-head">{head}</p>
        <p className="rotate-gate-line">{line}</p>
      </div>
    </div>
  );
}

/** WHAT IT SHOULD LOOK LIKE WHEN YOU ARE DONE, said as before-and-after: the
 * shape the screen is in now, a straight arrow, and the shape the game wants,
 * lying down and lit. A turn and a drag are different gestures but the same
 * instruction, so one mark says both — and two frames with an arrow between
 * them cannot be read as anything but "that one becomes this one", where a
 * curved arrow on its own has to be recognised before it means anything.
 *
 * The destination is drawn HORIZONTAL at the size the upright frame would be
 * if it were tipped over, so a phone reads as the same phone turned rather
 * than as a different device. */
function GateMark({ kind }: { kind: GateKind }) {
  // A phone stood on end is narrow and tall; a window that is merely too tall
  // is usually only a little too tall, and drawing it as a phone would be
  // telling somebody at a desk they are holding it wrong.
  const was =
    kind === "device"
      ? { x: 12, y: 4, width: 26, height: 48 }
      : { x: 12, y: 6, width: 30, height: 44 };
  const want =
    kind === "device"
      ? { x: 78, y: 15, width: 48, height: 26 }
      : { x: 78, y: 13, width: 48, height: 30 };
  return (
    <svg className="rotate-gate-mark" viewBox="0 0 128 56" aria-hidden="true">
      <rect className="rotate-gate-was" rx="4" {...was} />
      <g className="rotate-gate-arrow">
        <path d="M50 28h12" fill="none" strokeLinecap="round" />
        <path className="rotate-gate-arrow-head" d="M70 28l-10-6v12z" />
      </g>
      <rect className="rotate-gate-want" rx="4" {...want} />
    </svg>
  );
}
