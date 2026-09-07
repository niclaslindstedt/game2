// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SECOND FINGER — the tap the browser refuses to turn into a click.
//
// Every surface the player PRESSES in this game is a `<button>` with an
// `onClick`: the camera button, the minimap that opens the race menu, the way
// back to the last board, and every row on the pause card. On a touchscreen a
// `click` is not an event the browser REPORTS, though — it is one it
// SYNTHESIZES, from a gesture its tap recognizer accepted, and that recognizer
// wants the tap to have had the glass to itself. A finger that goes down while
// another is already on the screen, or that is still down when a second
// arrives, belongs to a multi-touch gesture as far as the browser is
// concerned, and a multi-touch gesture produces no click at all.
//
// Which is every press a DRIVER makes. A thumb is holding the throttle or the
// wheel and the other hand reaches for the camera or the menu: `pointerdown`
// and `pointerup` both land on the button, `:active` even lights it under the
// finger, and the `onClick` never runs. It arrives as "the HUD buttons stop
// working while I hold the gas" — and the answer cannot be to let go of the
// gas, because the presses a driver wants mid-stage are exactly the ones they
// want without lifting off.
//
// So the relay below hands the click back. It watches every pointer the page
// sees, notices the ones that had to SHARE the glass, and fires the press
// itself for those — and only for those, because a solitary tap still gets its
// click from the browser and rescuing that one as well would press everything
// twice. The two are cleanly separated: sharing is the exact condition under
// which the browser withholds, in either order (a finger that arrived second,
// and one that was already down when the second came), so no press falls
// through the gap and none is served twice.
//
// WHAT MAKES IT A PRESS, and not merely a release, is the same pair of
// questions the browser's own click asks: the pointer went DOWN on a button
// and came UP on the same one. Both are answered by HIT-TESTING the point,
// never by reading the event's target — a touch holds implicit pointer capture
// on the element it started on, so a finger that slides off the button and
// lifts over the road still reports the button as its target, and comparing
// targets would fire a press the player deliberately slid out of.
//
// Firing it as the element's own `click()` is the other half of the design:
// every existing `onClick`, and every ancestor listening for a click, keeps
// working unchanged, and nothing in the app has to learn that this module
// exists. It deliberately does not FOCUS the button first, the way a real
// press would — a driving game whose camera button leaves the keyboard aimed
// at itself is one where the next press of the accelerator changes the camera.
//
// Nothing here touches the DOM: the window and the hit test are both injected
// and typed structurally, the way thumb-guard.ts and text-interaction.ts take
// theirs, so the root suite can hold the whole decision without a browser.

/** The listeners the relay needs. Capture is the one option that matters —
 * see `relaySharedTaps`. */
export type PressWindow = {
  addEventListener: (
    type: string,
    listener: (event: PressEvent) => void,
    options?: { capture?: boolean },
  ) => void;
  removeEventListener: (
    type: string,
    listener: (event: PressEvent) => void,
    options?: { capture?: boolean },
  ) => void;
};

/** As much of a pointer event as the relay reads. */
export type PressEvent = {
  pointerId: number;
  pointerType?: string;
  clientX: number;
  clientY: number;
};

/** As much of a pressable element as the relay reads. `click` is the whole
 * point of the type; `disabled` is the one reason to decline, since a click
 * synthesized onto a disabled control is a press the browser would never have
 * delivered. */
export type PressTarget = { click: () => void; disabled?: boolean };

/** The button under a point, or null — `document.elementFromPoint` plus a
 * `closest("button")`, handed in so this module never names the DOM. */
export type ButtonAt = (x: number, y: number) => PressTarget | null;

/** Pointer kinds whose click is SYNTHESIZED, and so the kinds that can lose
 * one. A mouse's click is reported rather than synthesized and arrives however
 * many fingers are also on a touchscreen, so rescuing a mouse press would only
 * ever be firing it a second time. */
const SYNTHESIZED = new Set(["touch", "pen"]);

/** The pointers on the glass, and which of them have had to share it. */
export type TapWatch = {
  down: (pointerId: number) => void;
  /** Whether the browser will withhold this press's click. Forgets the
   * pointer, so one `down` is answered by exactly one `lift`. */
  lift: (pointerId: number) => boolean;
  /** Forget a pointer without answering for it — a cancelled touch never
   * became a press. */
  cancel: (pointerId: number) => void;
  /** How many pointers are down. The tests' way in. */
  size: () => number;
};

/**
 * The bookkeeping behind the rescue: which presses the browser is going to
 * leave without a click.
 *
 * A press is shared from the moment a second pointer exists, and STAYS shared
 * for the rest of its life — the browser does not forgive a gesture that was
 * briefly multi-touch, so neither does this. That is why an arrival marks
 * every pointer already down as well as itself: the thumb that was holding the
 * throttle when the second finger tapped the camera button has lost its click
 * too, which matters for the thumb zones' own `<button>`-less surfaces not at
 * all, and for a player pressing two buttons in sequence a great deal.
 */
export function createTapWatch(): TapWatch {
  /** pointerId → whether it has ever shared the glass. */
  const held = new Map<number, boolean>();
  return {
    down: (pointerId) => {
      const shared = held.size > 0;
      if (shared) for (const other of held.keys()) held.set(other, true);
      held.set(pointerId, shared);
    },
    lift: (pointerId) => {
      const shared = held.get(pointerId) ?? false;
      held.delete(pointerId);
      return shared;
    },
    cancel: (pointerId) => void held.delete(pointerId),
    size: () => held.size,
  };
}

/**
 * Give every button in the app back the presses multi-touch costs it, and hand
 * back the undo. Installed once, for the life of the app.
 *
 * Capture phase, because the count must not miss a pointerdown: the thumb
 * zones are the surface a driver's other finger is competing with, and they
 * are also the ones most likely to stop propagation for their own reasons. It
 * is the same reason the loupe guard next door captures.
 */
export function relaySharedTaps(target: PressWindow, buttonAt: ButtonAt): () => void {
  const watch = createTapWatch();
  /** The button each pointer's press began on. Pointers that went down on
   * something else are not in here at all. */
  const from = new Map<number, PressTarget>();

  const onDown = (e: PressEvent): void => {
    // Counted whatever kind of pointer it is: a mouse held down on a
    // touchscreen laptop shares the glass with a finger just as a finger does.
    watch.down(e.pointerId);
    if (e.pointerType !== undefined && !SYNTHESIZED.has(e.pointerType)) return;
    const button = buttonAt(e.clientX, e.clientY);
    if (button) from.set(e.pointerId, button);
  };
  const onUp = (e: PressEvent): void => {
    const shared = watch.lift(e.pointerId);
    const button = from.get(e.pointerId);
    from.delete(e.pointerId);
    if (!shared || !button || button.disabled === true) return;
    // Lifted over the button it started on, or it is not a press.
    if (buttonAt(e.clientX, e.clientY) !== button) return;
    button.click();
  };
  const onCancel = (e: PressEvent): void => {
    watch.cancel(e.pointerId);
    from.delete(e.pointerId);
  };

  const opts = { capture: true };
  target.addEventListener("pointerdown", onDown, opts);
  target.addEventListener("pointerup", onUp, opts);
  target.addEventListener("pointercancel", onCancel, opts);
  return () => {
    target.removeEventListener("pointerdown", onDown, opts);
    target.removeEventListener("pointerup", onUp, opts);
    target.removeEventListener("pointercancel", onCancel, opts);
  };
}
