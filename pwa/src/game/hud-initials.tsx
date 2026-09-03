// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ENTER YOUR INITIALS — the three letters an arcade asks for when a run makes
// the board, and the one screen in the game that is pure 1985.
//
// THEY ARE TYPED INTO THE BOARD ITSELF. The run's row is already standing on
// it, in the place the time just won, with the times it beat above and the
// ones it pushed down below — and the name cell of that row is the three
// slots. That is what the cabinet did, and it is the whole point: the letters
// are worth typing because you can see what they are being written onto. So
// this module is the ENTRY and not the screen — the board around it is
// `score-board.tsx`'s `ScoreSheet`, which places these pieces in its pending
// row and wraps the lot in `useInitials`'s own element.
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
// The field is a real editable surface, invisible but laid out, because that
// is the only thing a mobile browser will open a keyboard for, and only inside
// the gesture that asked. It is never focused on its own: a keyboard sliding
// up over the results card nobody asked for is worse than a tap.
//
// The name is not stored here. This module reports the letters and the
// caller decides what they mean (`scores.ts` owns the board and the
// remembered name).

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";

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

/** The entry, ready to be placed: the letters as they stand, the presses that
 * change them, and the element the whole thing has to live inside. */
export type Initials = {
  entry: InitialsState;
  /** Goes on whatever element CONTAINS the slots and the ENTER button — the
   * board, here. It is what a pad's directions are taken off, so an entry
   * spread across a table still walks as one control. */
  cardRef: RefObject<HTMLDivElement>;
  fieldRef: RefObject<HTMLDivElement>;
  /** Put the caret on a slot and ask the device for its keyboard. */
  tap: (slot: number) => void;
  onFieldInput: (e: FormEvent<HTMLDivElement>) => void;
  onFieldKey: (e: KeyboardEvent) => void;
  /** Post the name as it stands, with the click a confirm makes. */
  post: () => void;
  /** …and post it SILENTLY, for a press that is making its own noise. Every
   * way off the results card commits the letters on the way past, so the
   * entry has no confirm of its own to click about. */
  commit: () => void;
};

/**
 * THE THREE LETTERS, as state and presses with no layout of their own.
 *
 * `initial` is what the slots start on — the name last entered, or the
 * default. `onDone` is handed the name when the player is finished with it.
 */
export function useInitials(initial: string, onDone: (who: string) => void): Initials {
  const [entry, setEntry] = useState<InitialsState>(() => startEntry(initial));
  // The handlers are rebuilt as the entry changes, and the window listener
  // reads it through a ref so the binding is made once. Re-binding per
  // keystroke would drop the key that arrived during the swap.
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const fieldRef = useRef<HTMLDivElement>(null);
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

  const commit = (): void => {
    doneRef.current(nameOf(entryRef.current));
  };

  const post = (): void => {
    playUi("select");
    commit();
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

  /** THE KEYBOARD, off the window — the card is up over a canvas and nothing
   * is focused until somebody taps a letter. Presses that arrive while the
   * field IS focused belong to it and are skipped here, or every one of them
   * would be taken twice. */
  const onWindowKey = (e: KeyboardEvent): void => {
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
      steer(e.key === "ArrowUp" ? "up" : "down");
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      steer(e.key === "ArrowLeft" ? "left" : "right");
      return;
    }
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    const next = typeChar(now, e.key);
    if (next === now) return; // a key no slot can hold, ignored outright
    e.preventDefault();
    apply(next);
  };
  const windowKeyRef = useRef(onWindowKey);
  windowKeyRef.current = onWindowKey;

  useEffect(() => {
    // Bound once, through the ref: re-binding per keystroke would drop the
    // key that arrived during the swap.
    const onKey = (e: KeyboardEvent): void => windowKeyRef.current(e);
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

  /** Put the sentinel back and the caret BEHIND it — the contenteditable's
   * answer to an input's `setSelectionRange`, and just as load-bearing.
   *
   * Writing `textContent` throws the old text node away, and the selection
   * that was anchored in it goes with it: the caret lands at offset 0, in
   * front of the sentinel. A caret there is a caret with nothing to its left,
   * so the next Backspace deletes nothing, the browser reports no edit, and
   * the delete key goes dead — which is the exact failure the sentinel exists
   * to prevent (see the note on `SENTINEL`). Restored only while the field
   * still has focus: moving the selection of a field nobody is typing in
   * would take the caret off whatever does. */
  const resetField = (field: HTMLElement): void => {
    field.textContent = SENTINEL;
    if (document.activeElement !== field) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(field);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  /** Put the caret on a slot and ask the device for its keyboard. The focus
   * has to happen inside the tap's own handler: a mobile browser opens a
   * keyboard for a gesture and for nothing else. */
  const tap = (slot: number): void => {
    apply(toSlot(entryRef.current, slot));
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    // ...and behind the sentinel from the very first press, so the FIRST
    // thing a player does can be the delete key.
    resetField(field);
  };

  /** What the field reports, whichever keyboard is driving it. Characters
   * arrive here rather than through keydown because an on-screen keyboard's
   * keydown says nothing about which key was pressed. */
  const onFieldInput = (e: FormEvent<HTMLDivElement>): void => {
    const field = e.currentTarget;
    const raw = field.textContent ?? "";
    resetField(field);
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

  /** A REAL keyboard's own keys, taken off the field. The characters it sends
   * are left to the field itself, so both keyboards take one path in. */
  const onFieldKey = (e: KeyboardEvent): void => {
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
  };

  return { entry, cardRef, fieldRef, tap, onFieldInput, onFieldKey, post, commit };
}

/** THE NAME CELL of the row being entered: three slots, and the device's way
 * into them. Each letter is a button because on a phone it IS the control —
 * tapping one puts the caret on it and raises the keyboard. */
export function InitialsSlots({ initials }: { initials: Initials }) {
  const { entry, fieldRef, tap, onFieldInput, onFieldKey } = initials;
  return (
    <span className="hud-initials-slots">
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
      {/* The device's keyboard, and the only thing here that can ask for one.
          Contenteditable rather than an input on purpose: iOS adds its
          previous/next/done accessory bar to form controls, and none of those
          actions are useful while entering a high score name. */}
      <div
        ref={fieldRef}
        className="hud-initials-field"
        contentEditable
        inputMode="text"
        // The soft keyboard's own return key, which `onInput` reads as DONE
        // when it arrives as a newline. `enterKeyHint` is a global attribute
        // and works on an editing host as well as on a form control, so the
        // key says DONE on this one. Spelled lowercase because Preact types
        // it as the plain HTML attribute on an ordinary element rather than
        // as a form control's camel-cased property.
        enterkeyhint="done"
        role="textbox"
        aria-multiline="false"
        aria-label="Type your initials"
        autoCapitalize="characters"
        autoCorrect="off"
        spellcheck={false}
        onInput={onFieldInput}
        onKeyDown={onFieldKey}
      >
        {SENTINEL}
      </div>
    </span>
  );
}

/** One line under the board, saying the two things the entry cannot show:
 * that the letters can be replaced, and that nothing has to be pressed to
 * keep them. There is no confirm — every way off the results card posts the
 * name on the way past, so a button here would be a press that changes
 * nothing but the fact it has been pressed. */
export function InitialsHint({ initials }: { initials: Initials }) {
  const { entry } = initials;
  return (
    <div className="hud-initials-hint">
      {entry.fresh && nameOf(entry) !== DEFAULT_INITIALS
        ? "type to replace · the name stays with the run"
        : "tap a letter to type · the name stays with the run"}
    </div>
  );
}
