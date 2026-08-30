// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ENTER YOUR INITIALS — the three letters an arcade asks for when a run makes
// the board, and the one screen in the game that is pure 1985.
//
// What the letters DO under a press is `initials-entry.ts`, tested without a
// browser. What is left here is how a press gets in, and there are three
// ways, because this game is played on all three:
//
//   * A KEYBOARD, where typing is typing. This card is up over a canvas with
//     nothing focused, so the presses are taken off the window.
//   * A THUMB, where the letters themselves are the control: tapping one puts
//     the caret on it AND raises the device's own keyboard, because there is
//     a real text field under the card waiting to be focused. That field is
//     the whole reason the ▲/▼ chevrons are gone. They existed because a tap
//     could not summon a keyboard, and a phone, a tablet and a handheld all
//     have one — typing your name should be typing your name there too, not
//     scrolling to it a letter at a time.
//   * A PAD, which has no keyboard to raise and walks the wheel instead: up
//     and down take the letter, left and right the caret, the confirm button
//     posts it. The card takes those directions off `menu-nav` rather than
//     letting them move a cursor, so the arcade's own way in survives the
//     chevrons going — see `data-nav-own`.
//
// The field is a real `<input>`, invisible but laid out, because that is the
// only thing a mobile browser will open a keyboard for, and only inside the
// gesture that asked. It is never focused on its own: a keyboard sliding up
// over the results card nobody asked for is worse than a tap.
//
// The name is not stored here. This component reports the letters and the
// caller decides what they mean (`scores.ts` owns the board and the
// remembered name).

import { useEffect, useRef, useState, type FormEvent } from "react";

import { playUi } from "./audio/ui.ts";
import {
  erase,
  moveCaret,
  nameOf,
  startEntry,
  toSlot,
  typeChar,
  wheel,
  type InitialsState,
} from "./initials-entry.ts";
import { NAV_EVENT, type MenuNavEvent } from "./menu-nav.ts";
import { BLANK, DEFAULT_INITIALS } from "./scores.ts";

/** "1st", "2nd", "3rd"… the board's own rank, said the way a board says it. */
function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}TH`;
  return `${place}${(["TH", "ST", "ND", "RD"][place % 10] ?? "TH") as string}`;
}

/**
 * What the hidden field is kept holding: one space, which is not a character
 * any slot can take.
 *
 * An EMPTY field cannot be backspaced. Android's on-screen keyboards send no
 * key for a delete that would delete nothing — no keydown worth reading, no
 * input event — so a field kept empty silently loses the one key a player
 * reaches for after a typo. Keeping a character in it means every delete is a
 * real edit the browser reports, and the field is put back afterwards.
 */
const SENTINEL = " ";

export type InitialsEntryProps = {
  /** Where the run placed, 1-based — the whole reason the entry is up. */
  place: number;
  /** What the slots start on: the name last entered, or the default. */
  initial: string;
  onDone: (who: string) => void;
};

export function InitialsEntry({ place, initial, onDone }: InitialsEntryProps) {
  const [entry, setEntry] = useState<InitialsState>(() => startEntry(initial));
  // The handlers are rebuilt as the entry changes, and the window listener
  // reads it through a ref so the binding is made once. Re-binding per
  // keystroke would drop the key that arrived during the swap.
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const fieldRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  /** Take a press. `next` is the entry the press makes; nothing is said out
   * loud when it makes no difference — a wheel walking off the end of a name
   * it cannot leave should not click. */
  const apply = (next: InitialsState): void => {
    const was = entryRef.current;
    entryRef.current = next;
    setEntry(next);
    if (nameOf(next) !== nameOf(was) || next.caret !== was.caret) playUi("move");
  };

  const post = (): void => {
    playUi("select");
    doneRef.current(nameOf(entryRef.current));
  };

  /** The directions, wherever they came from: a pad through `menu-nav`, or
   * the arrow keys. */
  const steer = (dir: "up" | "down" | "left" | "right" | "confirm"): void => {
    const now = entryRef.current;
    if (dir === "confirm") return post();
    if (dir === "up" || dir === "down") return apply(wheel(now, dir === "up" ? 1 : -1));
    apply(moveCaret(now, dir === "right" ? 1 : -1));
  };
  const steerRef = useRef(steer);
  steerRef.current = steer;

  // THE KEYBOARD, off the window — the card is up over a canvas and nothing
  // is focused until somebody taps a letter. Presses that arrive while the
  // field IS focused belong to it and are skipped here, or every one of them
  // would be taken twice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target === fieldRef.current) return;
      const now = entryRef.current;
      if (e.key === "Enter") {
        e.preventDefault();
        post();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        apply(erase(now));
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        steerRef.current(e.key === "ArrowUp" ? "up" : "down");
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        steerRef.current(e.key === "ArrowLeft" ? "left" : "right");
        return;
      }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      const next = typeChar(now, e.key);
      if (next === now) return; // a key no slot can hold, ignored outright
      e.preventDefault();
      apply(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // THE PAD, through menu-nav: the card owns the directions while it is up.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const onNav = (e: Event): void => {
      e.preventDefault(); // taken — do not move a cursor as well
      steerRef.current((e as MenuNavEvent).detail.dir);
    };
    card.addEventListener(NAV_EVENT, onNav);
    return () => card.removeEventListener(NAV_EVENT, onNav);
  }, []);

  /** Put the caret on a slot and ask the device for its keyboard. The focus
   * has to happen inside the tap's own handler: a mobile browser opens a
   * keyboard for a gesture and for nothing else. */
  const tap = (slot: number): void => {
    apply(toSlot(entryRef.current, slot));
    fieldRef.current?.focus();
  };

  /** What the field reports, whichever keyboard is driving it. Characters
   * arrive here rather than through keydown because an on-screen keyboard's
   * keydown says nothing about which key was pressed. */
  const onFieldInput = (e: FormEvent<HTMLInputElement>): void => {
    const field = e.currentTarget;
    const raw = field.value;
    field.value = SENTINEL;
    field.setSelectionRange(SENTINEL.length, SENTINEL.length);
    // The sentinel is gone: the player hit delete on a field that, as far as
    // the browser is concerned, had one character in it.
    if (raw.length < SENTINEL.length) return apply(erase(entryRef.current));
    if (raw.includes("\n")) return post(); // a soft keyboard's DONE
    // Everything typed since the last event, in order. The sentinel is a
    // space and no slot takes a space, so it needs no stripping — and a
    // swipe-typed word lands as its letters rather than as nothing.
    let next = entryRef.current;
    for (const char of raw) next = typeChar(next, char);
    if (next !== entryRef.current) apply(next);
  };

  return (
    <div className="hud-initials pointer-events-auto" ref={cardRef} data-nav-own>
      <div className="hud-initials-title">{ordinal(place)} ON THE BOARD</div>
      <div className="hud-initials-sub">ENTER YOUR INITIALS</div>
      <div className="hud-initials-slots">
        {entry.slots.map((letter, slot) => (
          <button
            key={slot}
            type="button"
            className={`hud-initial-letter${slot === entry.caret ? " is-caret" : ""}`}
            aria-label={`Letter ${slot + 1}, ${letter === BLANK ? "blank" : letter}`}
            onClick={() => tap(slot)}
          >
            {letter === BLANK ? " " : letter}
          </button>
        ))}
      </div>
      {/* The device's keyboard, and the only thing on this card that can ask
          for one. Invisible, but laid out and in the page: a field that is
          display:none, or parked off screen, is a field a mobile browser
          will not focus. */}
      <input
        ref={fieldRef}
        className="hud-initials-field"
        type="text"
        defaultValue={SENTINEL}
        inputMode="text"
        enterKeyHint="done"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellcheck={false}
        aria-label="Type your initials"
        onInput={onFieldInput}
        onKeyDown={(e) => {
          // A REAL keyboard's own keys. The characters it sends are left to
          // the field, so both keyboards take one path into the entry.
          if (e.key === "Enter") {
            e.preventDefault();
            post();
          } else if (e.key === "Backspace") {
            e.preventDefault();
            apply(erase(entryRef.current));
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            steerRef.current(e.key === "ArrowUp" ? "up" : "down");
          } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            steerRef.current(e.key === "ArrowLeft" ? "left" : "right");
          }
        }}
      />
      {/* The card's way ON, for the pad's START (menu-nav.ts) — and the only
          press this card has that is not a letter. */}
      <button type="button" className="hud-start hud-initials-done" data-nav-next onClick={post}>
        ENTER
      </button>
      {/* One line, always there — a hint that appears and disappears moves
          the ENTER button under a thumb already on its way to it. */}
      <div className="hud-initials-hint">
        {entry.fresh && nameOf(entry) !== DEFAULT_INITIALS
          ? "type to replace · ENTER to keep"
          : "tap a letter to type · ENTER when done"}
      </div>
    </div>
  );
}
