// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STUDIO CARD the app opens on: the publisher's name and PRESENTS, drawn
// in the menu's own arcade type over the same sky the game is painted in, so
// the card lifting reads as the menu arriving rather than as a screen change.
//
// It is a COVER, not a stage. The whole app mounts underneath it and does its
// entire arrival behind it — the render stack's chunk, the world builder, a
// stage's worth of terrain and forest, and the bot getting up to speed on it.
// That is what the card is buying.
//
// Presses are swallowed for exactly that reason: the menu is LIVE under there,
// and a press meant for the card must never reach the row the finger happens
// to land on.
//
// The timing rules it obeys live in `splash.ts` and are tested there.

import { useCallback, useEffect, useRef, useState } from "react";

import { APP_NAME, PUBLISHER } from "../identity.ts";
import { SPLASH_AUTO_MS, SPLASH_MIN_MS, splashPhase, type SplashPhase } from "./splash.ts";

/** How long the card takes to fade out of the way. Must match the
 * `.splash.leaving` transition in styles.css. */
const FADE_MS = 340;

/** Keys that are not "a key" to a player holding one down to reach another. */
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS"]);

export function SplashScreen({ warm, onDone }: { warm: boolean; onDone: () => void }) {
  const [phase, setPhase] = useState<SplashPhase>("holding");

  // The card's own age, stamped on mount. A ref rather than state: nothing
  // re-renders on it, and it has to survive the re-render `warm` causes.
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  // `onDone` is a fresh closure every parent render; hold it in a ref so the
  // fade-out timer is armed once instead of restarted on each one.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // THE MINIMUM ANSWERS TO NOTHING BUT THE CLOCK.
  useEffect(() => {
    const shown = performance.now() - startedAt.current;
    const timer = window.setTimeout(
      () => setPhase((p) => (p === "holding" ? "skippable" : p)),
      Math.max(0, SPLASH_MIN_MS - shown),
    );
    return () => window.clearTimeout(timer);
  }, []);

  // THE AUTO-DISMISS WAITS FOR THE LOAD, which is what makes a slow device
  // hold the card past its three seconds instead of handing a player who
  // touched nothing a menu that is still building its stage. Measured from the
  // card's own birth, so a launch that was ready in 200 ms still lifts on time.
  useEffect(() => {
    if (!warm) return;
    const shown = performance.now() - startedAt.current;
    const timer = window.setTimeout(() => setPhase("done"), Math.max(0, SPLASH_AUTO_MS - shown));
    return () => window.clearTimeout(timer);
  }, [warm]);

  // Cleared: fade, then let the parent unmount us.
  useEffect(() => {
    if (phase !== "done") return;
    const timer = window.setTimeout(() => doneRef.current(), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // MAY THIS PRESS CLEAR THE CARD — asked of the CLOCK, never of `phase`.
  // The two agree only on an idle main thread, and the card exists for the
  // launch where the main thread is anything but: a whole stage's geometry is
  // being built. Both the timer that promotes `holding` → `skippable` and the
  // press itself are macrotasks queued behind that work, so they arrive
  // together when it lets go — and a `dismiss` closing over `phase` would read
  // the render BEFORE the timer's state update landed and drop the press on
  // the floor, on exactly the device the card was added for. `startedAt` is a
  // ref and `performance.now()` owes nothing to the renderer.
  const dismiss = useCallback(() => {
    const elapsed = performance.now() - startedAt.current;
    if (splashPhase(elapsed, warm) === "holding") return;
    setPhase("done");
  }, [warm]);

  // EVERY KEY IS EATEN WHILE THE CARD IS UP, on `window` in the CAPTURE phase
  // because that is the only place upstream of the input manager the live menu
  // underneath has already installed. Without it, the key that clears the card
  // also drives the demo car behind it.
  //
  // It keeps eating them through the fade-out too, so a second impatient press
  // cannot land on the menu coming up underneath.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      event.stopPropagation();
      if (MODIFIER_KEYS.has(event.key)) return;
      // A browser shortcut on its way past (reload, devtools, tab switch) is
      // not a press on the card.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dismiss]);

  return (
    <div
      className={`splash${phase === "done" ? " leaving" : ""}`}
      // A pointer press lands here rather than on the menu: the card covers
      // the screen, so nothing has to be swallowed for it.
      onPointerDown={dismiss}
      role="presentation"
    >
      <div className="splash-card">
        <span className="splash-publisher">{PUBLISHER.toUpperCase()}</span>
        <span className="splash-presents">PRESENTS</span>
      </div>
      {/* Held apart from the card so the house's name lands alone first and
          the game's name arrives under it, the way a title card plays. */}
      <span className="splash-game">{APP_NAME.toUpperCase()}</span>
    </div>
  );
}
