// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE EDGE SWIPE — a finger that starts on the bezel and pulls inward, and
// what it takes for that to count.
//
// It lives beside the zone (hud-touch.tsx) rather than inside it for the
// same reason the pedal's gesture does: it is not a rendering concern, and
// it has to be TESTABLE. Nothing here touches the DOM — the zone hands it
// pixels and gets back a verdict.
//
// WHAT IT IS GUARDING AGAINST is the whole design. The gesture sits on the
// same glass as the driving zones, and what it fires is destructive: the
// run goes back to the last split board and the road between here and there
// has to be driven again. A thumb that reaches for the wheel a little wide
// must never do that by accident. So it asks for three things at once, and
// only on the LIFT:
//
//   - the finger has to have STARTED on the bezel (`EDGE_PX`), where a
//     thumb reaching for a wheel does not land,
//   - it has to have travelled a long way INWARD (`REACH_PX`) — further
//     than any steering drag, which is a wrist movement and not an arm one,
//   - and it has to have stayed roughly level (`DRIFT_PX`), because a
//     driving thumb that does wander to the bezel wanders up and down it.
//
// Nothing fires while the finger is still down, so a gesture the player
// thinks better of is abandoned by dragging back and lifting.

/** How close to the edge a finger has to land to be on the bezel at all,
 * px. A thumb steering the car anchors inboard of this — it is holding the
 * device, so the glass under the very edge is where it is NOT. */
export const EDGE_PX = 26;
/** ...how far inward it then has to pull for the swipe to have happened,
 * px. Deliberately further than the steering wheel's whole throw
 * (`WHEEL_REACH_PX`), so nothing a driving hand does reaches it. */
export const REACH_PX = 108;
/** ...and how far up or down it may wander on the way, px. */
export const DRIFT_PX = 70;

export type EdgeSwipe = {
  /** A finger arrived: `x` px from the edge it started at, and `y` in
   * screen pixels. Returns whether it is a candidate at all — false means
   * the zone should let go of it, because it landed inboard of the bezel
   * and belongs to whatever is underneath. */
  press: (x: number, y: number) => boolean;
  /** Where it has got to. Returns how far through the pull it is, 0..1,
   * for the zone to draw — the gesture answers a finger while it happens
   * or nobody can tell it is working. */
  move: (x: number, y: number) => number;
  /** It lifted there. Consuming: returns whether the swipe HAPPENED, and
   * the next `press` starts a fresh one either way. */
  lift: (x: number, y: number) => boolean;
};

export function createEdgeSwipe(): EdgeSwipe {
  let from = 0;
  let atY = 0;
  let live = false;

  /** How far through the pull a finger here is, 0..1 — and 0 for one that
   * has wandered off the level, so the ring empties as the gesture is lost
   * rather than staying lit at whatever it had reached. */
  const through = (x: number, y: number): number => {
    if (!live) return 0;
    if (Math.abs(y - atY) > DRIFT_PX) return 0;
    return Math.max(0, Math.min(1, (x - from) / REACH_PX));
  };

  return {
    press: (x, y) => {
      live = x <= EDGE_PX;
      from = x;
      atY = y;
      return live;
    },
    move: through,
    lift: (x, y) => {
      const done = through(x, y) >= 1;
      live = false;
      return done;
    },
  };
}
