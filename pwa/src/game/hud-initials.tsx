// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ENTER YOUR INITIALS — the three letters an arcade asks for when a run makes
// the board, and the one screen in the game that is pure 1985.
//
// Two ways in, because this game is played on both:
//
//   * A KEYBOARD, where typing is typing. Letters and digits land in the slot
//     the caret is on and move it along; the arrows walk the letter or the
//     caret; Enter posts it. THE FIRST PRESS STARTS OVER — the slots come up
//     holding the name last entered, and typing anything at all replaces it
//     from the first letter rather than appending to it. A player who wants
//     the old name presses Enter and is done; one who wants a new one just
//     types, and never has to clear anything first.
//   * A THUMB, where the slots are the control: tap one to put the caret on
//     it, and the chevrons over and under it walk the alphabet. This is not a
//     fallback — it is how the game is played on a phone, and the entry is
//     unusable without it.
//
// The name is not stored here. This component reports the three letters and
// the caller decides what they mean (`scores.ts` owns the board and the
// remembered name).

import { useEffect, useRef, useState } from "react";

import { playUi } from "./audio/ui.ts";
import { ALPHABET, INITIALS_LENGTH } from "./scores.ts";

/** "1st", "2nd", "3rd"… the board's own rank, said the way a board says it. */
function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}TH`;
  return `${place}${(["TH", "ST", "ND", "RD"][place % 10] ?? "TH") as string}`;
}

/** Step one slot through the alphabet, wrapping at both ends. */
function cycle(letter: string, by: number): string {
  const at = ALPHABET.indexOf(letter);
  const from = at < 0 ? 0 : at;
  return ALPHABET[(from + by + ALPHABET.length) % ALPHABET.length] as string;
}

export type InitialsEntryProps = {
  /** Where the run placed, 1-based — the whole reason the entry is up. */
  place: number;
  /** What the slots start on: the name last entered, or the default. */
  initial: string;
  onDone: (who: string) => void;
};

export function InitialsEntry({ place, initial, onDone }: InitialsEntryProps) {
  const [letters, setLetters] = useState<string[]>(() => [...initial]);
  const [caret, setCaret] = useState(0);
  /** True until the player has touched anything. While it holds, the first
   * character typed REPLACES the offered name from its first letter — see
   * the module header. */
  const [fresh, setFresh] = useState(true);
  // The handler is rebuilt as the entry changes, and the listener reads it
  // through a ref so the window binding is made once. Re-binding per
  // keystroke would drop the key that arrived during the swap.
  const stateRef = useRef({ letters, caret, fresh });
  stateRef.current = { letters, caret, fresh };
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const { letters: at, caret: on, fresh: untouched } = stateRef.current;
      const write = (next: string[], moveTo: number): void => {
        setLetters(next);
        setCaret(Math.min(INITIALS_LENGTH - 1, Math.max(0, moveTo)));
        setFresh(false);
        playUi("move");
      };

      if (e.key === "Enter") {
        e.preventDefault();
        playUi("select");
        doneRef.current(at.join(""));
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        const to = untouched ? 0 : Math.max(0, on - 1);
        const next = [...at];
        next[to] = " ";
        write(next, to);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const to = untouched ? 0 : on;
        const next = [...at];
        next[to] = cycle(next[to] as string, e.key === "ArrowUp" ? 1 : -1);
        write(next, to);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setFresh(false);
        setCaret(
          untouched
            ? 0
            : Math.min(INITIALS_LENGTH - 1, Math.max(0, on + (e.key === "ArrowRight" ? 1 : -1))),
        );
        playUi("move");
        return;
      }
      // A character key. Anything the alphabet does not have is ignored
      // outright rather than typed as a blank — a name is not the place to
      // discover which keys the board accepts.
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      const char = e.key.toUpperCase();
      if (!ALPHABET.includes(char)) return;
      e.preventDefault();
      const to = untouched ? 0 : on;
      const next = [...at];
      next[to] = char;
      write(next, to + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const step = (slot: number, by: number): void => {
    const next = [...letters];
    next[slot] = cycle(next[slot] as string, by);
    setLetters(next);
    setCaret(slot);
    setFresh(false);
    playUi("move");
  };

  return (
    <div className="hud-initials pointer-events-auto">
      <div className="hud-initials-title">{ordinal(place)} ON THE BOARD</div>
      <div className="hud-initials-sub">ENTER YOUR INITIALS</div>
      <div className="hud-initials-slots">
        {letters.map((letter, slot) => (
          <div key={slot} className={`hud-initial${slot === caret ? " is-caret" : ""}`}>
            <button
              type="button"
              className="hud-initial-step"
              aria-label={`Letter ${slot + 1} up`}
              onClick={() => step(slot, 1)}
            >
              ▲
            </button>
            <button
              type="button"
              className="hud-initial-letter"
              aria-label={`Letter ${slot + 1}, ${letter === " " ? "blank" : letter}`}
              onClick={() => {
                setCaret(slot);
                setFresh(false);
                playUi("move");
              }}
            >
              {letter === " " ? "–" : letter}
            </button>
            <button
              type="button"
              className="hud-initial-step"
              aria-label={`Letter ${slot + 1} down`}
              onClick={() => step(slot, -1)}
            >
              ▼
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="hud-start hud-initials-done"
        onClick={() => {
          playUi("select");
          onDone(letters.join(""));
        }}
      >
        ENTER
      </button>
      {fresh && <div className="hud-initials-hint">type to replace · ENTER to keep</div>}
    </div>
  );
}
