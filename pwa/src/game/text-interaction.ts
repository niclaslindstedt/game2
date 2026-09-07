// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOUPE — iOS's text interaction, and why a driving game refuses it.
//
// Press and hold, or tap twice and hold, and iOS answers with a magnifying
// lens and a caret: the gesture that puts a cursor between two letters. On a
// document that is the whole point. Under a thumb that is holding the
// throttle it is a lens over the road AND a stolen touch — the pedal zone's
// finger is taken away to drive the caret instead, the gas goes off and the
// wheel stops answering. It arrives as "I missed the turn".
//
// styles.css already says the CSS half of this: `user-select: none` and
// `-webkit-touch-callout: none`, restated on every element so no rule three
// thousand lines down can quietly hand a surface back. That is not enough,
// and the reason is worth stating once. Those properties say a selection may
// not be MADE and a callout may not be OFFERED; `touch-action: none` says the
// page may not be panned or zoomed. WebKit's text-interaction recognizer is
// armed from the TOUCH, before any of them is consulted, and the only thing
// that disarms it is a `touchstart` whose default is prevented — which needs
// a non-passive listener, which is not something a stylesheet can be.
//
// WHAT THE GUARD MUST NOT TAKE. A prevented touchstart also cancels the
// `click` the browser would have synthesized from that touch, the caret it
// would have put in a field, and the scroll it would have run. So the touch
// is left alone wherever the browser's own behaviour is still wanted, and
// removed everywhere else — the road, the thumb zones, the HUD, the cards'
// own chrome. Four things keep it, asked of the touched element and of every
// ancestor above it:
//
//   - a NATIVE TAG, whose behaviour is the browser's to run. Every tap in
//     this game that arrives as a `click` lands on a `<button>`; everything
//     else — the thumb zones, the fly pads, the splash, the map — is driven
//     from `pointerdown`, which a prevented touchstart does not touch.
//   - something being TYPED INTO, which needs its caret.
//   - something that SCROLLS, asked of the computed overflow rather than by
//     name, so a card that starts scrolling tomorrow cannot forget to say so.
//   - something the page has said may be SELECTED. This is the same question
//     styles.css already answers per element, so the two cannot disagree:
//     where text may be selected the loupe is the right answer, and the three
//     surfaces that take typed text (`.dev-log`, `.knob-field`,
//     `.hud-initials-field`) are exactly the ones that say so.
//
// The other two gestures the same recognizer offers are taken on the same
// terms: `selectstart` (the selection itself, which is what a later drag
// magnifies) and `contextmenu` (the long-press action sheet, and the
// right-click menu that is its desktop twin). Neither can break a click or a
// scroll, so both are refused wherever the page says text is not selectable —
// which is everywhere but those three fields. They are stated HERE and
// nowhere else: a zone with its own `onContextMenu` is a second copy of this
// rule, and the day one of them moves the other is a bug.
//
// Nothing here touches the DOM. The listeners' target and the way a computed
// style is read are both injected and typed structurally, the same way
// thumb-guard.ts takes its window — so the root suite, which has no DOM lib,
// can read the decision and hold it to the four promises above.

/** The listeners a guard needs, and the one option that matters: a
 * `touchstart` listener is passive by default, and a passive listener may not
 * prevent anything. */
export type GuardTarget = {
  addEventListener: (
    type: string,
    listener: (event: GuardEvent) => void,
    options?: { capture?: boolean; passive?: boolean },
  ) => void;
  removeEventListener: (
    type: string,
    listener: (event: GuardEvent) => void,
    options?: { capture?: boolean },
  ) => void;
};

/** As much of an event as the decision reads. `cancelable` is checked rather
 * than assumed: a listener that calls `preventDefault` on an event that does
 * not offer it earns a console warning per touch. */
export type GuardEvent = {
  target: unknown;
  cancelable?: boolean;
  preventDefault: () => void;
};

/** As much of an element as the decision reads. */
export type GuardElement = {
  tagName: string;
  isContentEditable?: boolean;
  parentElement: GuardElement | null;
};

/** As much of a computed style as the decision reads — `getComputedStyle`,
 * handed in so this module never names the DOM. */
export type GuardStyle = {
  overflowX: string;
  overflowY: string;
  userSelect: string;
  webkitUserSelect?: string;
};

export type StyleReader = (element: GuardElement) => GuardStyle;

/** Tags whose whole behaviour IS the browser's, and which a prevented
 * touchstart would therefore break. `<button>` is the load-bearing one: it is
 * what every clickable surface in this app is built from. */
const NATIVE_TAGS = new Set([
  "BUTTON",
  "A",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "OPTION",
  "LABEL",
  "SUMMARY",
]);

/** ...and the ones that take TYPED TEXT, which need a caret and a selection
 * whatever the stylesheet says: `*` in styles.css reaches them too, and a
 * field nobody can put a cursor in is worse than a loupe. */
const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Overflow values that make a box scrollable. A prevented touchstart is a
 * scroll that never starts, so a menu card long enough to need one keeps its
 * touch. */
const SCROLLING = new Set(["auto", "scroll", "overlay"]);

/** Whether the page has said text may be selected here — `-webkit-` first,
 * since that is the one iOS actually acts on and the only one older WebKits
 * report. An element with no style at all reads as selectable, which is the
 * safe way round: it leaves the browser's behaviour alone. */
function selectable(style: GuardStyle): boolean {
  return (style.webkitUserSelect ?? style.userSelect) !== "none";
}

/** Walk a touched element and its ancestors, asking each whether it is one of
 * the four surfaces the browser still owns. True means "leave this touch
 * alone"; false means the game takes it, and with it the loupe. */
export function browserKeepsTouch(target: GuardElement | null, styleOf: StyleReader): boolean {
  for (let el = target; el; el = el.parentElement) {
    if (NATIVE_TAGS.has(el.tagName.toUpperCase())) return true;
    if (el.isContentEditable === true) return true;
    const style = styleOf(el);
    if (SCROLLING.has(style.overflowY) || SCROLLING.has(style.overflowX)) return true;
    if (selectable(style)) return true;
  }
  return false;
}

/** Whether a selection may begin here at all — the narrower question the
 * `selectstart` and `contextmenu` guards ask, since neither of those can cost
 * a click or a scroll and so neither needs the wider exemption. */
export function selectionAllowed(target: GuardElement | null, styleOf: StyleReader): boolean {
  for (let el = target; el; el = el.parentElement) {
    if (TYPING_TAGS.has(el.tagName.toUpperCase())) return true;
    if (el.isContentEditable === true) return true;
    if (selectable(styleOf(el))) return true;
  }
  return false;
}

/** An event target, if it is an element — a touch always lands on one, but
 * the type says `unknown` because nothing here knows what a Node is. */
function elementOf(target: unknown): GuardElement | null {
  const el = target as GuardElement | null;
  return el && typeof el.tagName === "string" ? el : null;
}

/**
 * Take the browser's text interaction off the whole game, and hand back the
 * undo. Installed once, for the life of the app.
 *
 * Capture phase, so a surface that stops propagation for its own reasons
 * cannot leave the loupe armed underneath it; non-passive, because a passive
 * listener may not prevent the one default that matters.
 */
export function guardTextInteraction(target: GuardTarget, styleOf: StyleReader): () => void {
  const onTouchStart = (e: GuardEvent): void => {
    if (e.cancelable === false) return;
    if (!browserKeepsTouch(elementOf(e.target), styleOf)) e.preventDefault();
  };
  const onSelect = (e: GuardEvent): void => {
    if (e.cancelable === false) return;
    if (!selectionAllowed(elementOf(e.target), styleOf)) e.preventDefault();
  };

  const touchOpts = { capture: true, passive: false };
  target.addEventListener("touchstart", onTouchStart, touchOpts);
  target.addEventListener("selectstart", onSelect, { capture: true });
  target.addEventListener("contextmenu", onSelect, { capture: true });
  return () => {
    target.removeEventListener("touchstart", onTouchStart, { capture: true });
    target.removeEventListener("selectstart", onSelect, { capture: true });
    target.removeEventListener("contextmenu", onSelect, { capture: true });
  };
}
