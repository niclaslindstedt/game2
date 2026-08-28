// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The grip a HUD thumb zone holds a finger by — and, the whole point of the
// module, every way that grip has to be able to END.
//
// It lives beside the zones (hud.tsx) rather than inside them because it is
// not a rendering concern and because it has to be TESTABLE: nothing here
// touches the DOM. The window it listens on is injected and typed
// structurally, and whether a finger is still on the glass is a question it
// ASKS its caller rather than one it answers — the zone knows, because the
// browser keeps pointer capture for exactly as long as the touch lasts.

/** The listeners a guard needs from the window it watches. Typed
 * structurally so this module reads under the root tsconfig, which has no
 * DOM: the app hands it the real `window`. */
export type GuardWindow = {
  addEventListener: (type: string, listener: (event: { pointerId?: number }) => void) => void;
  removeEventListener: (type: string, listener: (event: { pointerId?: number }) => void) => void;
};

/** How often a held thumb zone checks that its finger is still on the glass,
 * ms. A poll is the only way to find out: iOS does not reliably END a touch
 * that leaves the screen — a drag off the bottom edge, where a portrait
 * thumb lives, can simply stop reporting, delivering neither pointerup nor
 * pointercancel to anyone. */
const THUMB_WATCHDOG_MS = 200;

/** A thumb zone's grip on the pointer driving it. */
export type ThumbGuard = {
  /** Take the zone for this pointer. Refused only while a finger that is
   * demonstrably STILL DOWN owns it — `down` answers that question against
   * the DOM (the zone asks `hasPointerCapture`), so a claim also heals a
   * zone left holding a pointer whose end was never delivered. */
  claim: (pointerId: number, down: (pointerId: number) => boolean) => boolean;
  owns: (pointerId: number) => boolean;
  /** End the drag this pointer owns; any other pointer is ignored. */
  release: (pointerId: number) => void;
  /** One watchdog tick. Armed automatically while a pointer is held; called
   * directly by the tests, which have no timers to wait on. */
  poll: () => void;
  /** Let go and stop listening — the zone is going away. */
  dispose: () => void;
};

/**
 * Every way a thumb zone's grip on a finger has to be able to END.
 *
 * A touch control that trusts only its own pointerup is a control that
 * eventually STICKS: the finger is gone, the axis it wrote is not, and — the
 * zone still believing it is owned — no later touch can take it back. The
 * steering wheel is the worst case of it, because `touch.steer` overrides
 * the keyboard and outlives the run: a lock left behind by a lost pointerup
 * is still there after a restart, which is a game that steers itself.
 *
 * So the release is armed five ways: the zone's own pointerup/cancel (in the
 * HUD), the same events anywhere in the window — once capture is gone the
 * finger lifts over whatever element it is over — the app losing focus or
 * visibility, the watchdog above, and the zone unmounting. `letGo` is the
 * zone's own reset and must be safe to run when nothing is held: it is what
 * dispose leaves behind, so that a HUD which is not on screen is a HUD
 * holding no control down.
 */
export function createThumbGuard(letGo: () => void, target: GuardWindow): ThumbGuard {
  let pointerId: number | null = null;
  let down: ((pointerId: number) => boolean) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const drop = (): void => {
    pointerId = null;
    down = null;
    if (timer !== null) clearInterval(timer);
    timer = null;
    letGo();
  };
  const poll = (): void => {
    if (pointerId !== null && down && !down(pointerId)) drop();
  };
  const onEnd = (e: { pointerId?: number }): void => {
    if (pointerId !== null && e.pointerId === pointerId) drop();
  };
  const onGone = (): void => {
    if (pointerId !== null) drop();
  };

  target.addEventListener("pointerup", onEnd);
  target.addEventListener("pointercancel", onEnd);
  target.addEventListener("blur", onGone);
  // Fired at the document, but it bubbles — the window hears it too.
  target.addEventListener("visibilitychange", onGone);
  const unlisten = (): void => {
    target.removeEventListener("pointerup", onEnd);
    target.removeEventListener("pointercancel", onEnd);
    target.removeEventListener("blur", onGone);
    target.removeEventListener("visibilitychange", onGone);
  };

  return {
    claim: (id, isDown) => {
      if (pointerId !== null) {
        if (pointerId !== id && isDown(pointerId)) return false;
        drop();
      }
      pointerId = id;
      down = isDown;
      // Only watch a pointer the DOM can answer for. Where capture never
      // took, `isDown` is false from the outset and an armed watchdog would
      // end every drag on its first tick.
      if (isDown(id)) timer = setInterval(poll, THUMB_WATCHDOG_MS);
      return true;
    },
    owns: (id) => pointerId === id,
    release: (id) => {
      if (pointerId === id) drop();
    },
    poll,
    dispose: () => {
      unlisten();
      drop();
    },
  };
}
