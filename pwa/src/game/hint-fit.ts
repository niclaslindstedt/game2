// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// KEEPING THE PEDAL HINT ON THE GLASS — the nudge that brings a thumb's hint
// ring back inside the frame when the thumb anchored too close to an edge.
//
// The ring is drawn around wherever the thumb landed, and a thumb may land
// anywhere in its zone, hard against the bezel included. Its labels are the
// widest thing on it and they run OUTWARD from the anchor, so a press near
// the outboard edge puts the word naming the gesture off the screen
// altogether: the control still works, and the one thing that would teach it
// is the thing that is missing.
//
// So the ring is nudged back on. The WHOLE ring moves, never a word on its
// own — an arrow and the word it names are read as a pair, and a word slid
// along its arrow to make room starts reading as a label for the arrow next
// to it.
//
// Moving what is DRAWN is safe because the gesture is not measured off it:
// hud-touch.tsx takes every drag from the raw pointer position it recorded at
// the press. The ring is a PICTURE of where the thumb is, and this moves the
// picture; the thumb goes on commanding exactly what it commanded.
//
// DOM-free — it takes boxes and hands back a shift, so the tests can read it
// without a browser and the component keeps the only `getBoundingClientRect`.

/** A box in viewport coordinates: the four edges of `DOMRect` this reads. */
export type HintBox = { left: number; right: number; top: number; bottom: number };

/** How near the frame's edge a part of the ring may sit, px. Enough that a
 * nudged label reads as placed rather than as jammed against the glass. */
export const HINT_EDGE_MARGIN = 6;

/** The shift along one axis that brings `lo..hi` inside `min..max`.
 *
 * The far edge is pulled in first and the near edge second, so the near one
 * wins when the ring is wider than the space it has. That is the useful way
 * round: a ring too big for the frame ends up flush with the near edge, where
 * the arrows and the start of each word are readable, rather than centred and
 * losing a little off both ends. */
function nudge(lo: number, hi: number, min: number, max: number): number {
  let shift = 0;
  if (hi > max) shift = max - hi;
  if (lo + shift < min) shift = min - lo;
  return shift;
}

/** How far to move the whole hint ring so every part of it lands inside
 * `frame`. `parts` are the ring's drawn pieces — each label and the gear
 * flicks — measured where they currently sit; the answer is a delta, so the
 * caller adds it to whatever coordinates it positioned the ring with.
 *
 * Zero on both axes is the common case, and the caller is expected to skip
 * the write rather than re-set the same position every press. */
export function fitHintRing(
  parts: HintBox[],
  frame: HintBox,
  margin = HINT_EDGE_MARGIN,
): { dx: number; dy: number } {
  if (parts.length === 0) return { dx: 0, dy: 0 };
  const ring = parts.reduce((a, b) => ({
    left: Math.min(a.left, b.left),
    right: Math.max(a.right, b.right),
    top: Math.min(a.top, b.top),
    bottom: Math.max(a.bottom, b.bottom),
  }));
  return {
    dx: nudge(ring.left, ring.right, frame.left + margin, frame.right - margin),
    dy: nudge(ring.top, ring.bottom, frame.top + margin, frame.bottom - margin),
  };
}
