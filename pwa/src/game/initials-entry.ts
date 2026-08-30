// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE THREE LETTERS, AS A STATE MACHINE — what a press does to a name being
// entered, with nothing on screen and no keyboard in the room.
//
// The card is entered two entirely different ways and the whole design is in
// keeping both honest at once:
//
//   * TYPED, on a keyboard — the phone's, the desktop's, the handheld's
//     on-screen one. A character lands in the slot the caret is on and the
//     caret moves along. The slot it moves ONTO stays empty: a player who is
//     typing already knows the next letter, and a repeat appearing under
//     their thumb is a letter they now have to think about deleting.
//   * WHEELED, with up and down — a pad, the arrow keys, the arcade's own
//     control. Here a repeat is the opposite of confusing, it is the whole
//     trick: an empty slot WAKES holding the letter to its left, so NLM is
//     three short walks instead of two long ones. Initials are usually a
//     name, and the letters of a name are neighbours far more often than
//     chance would have them.
//
// Hence the one rule the rest of this module is: an empty slot wakes as a
// copy of its left-hand neighbour when the caret ARRIVES on it — by a tap, by
// left/right, or by the first up/down press against it — and typing writes
// the typed letter instead and wakes nothing.
//
// A name is one, two or three letters. The slots after the last one entered
// simply stay empty, which is what replaced the space that used to sit on the
// end of the wheel: nobody should have to scroll past the alphabet to say
// their name is two letters long.
//
// DOM-free, so the tests can drive every rule above without a browser and the
// card is left holding nothing but the drawing.

import { BLANK, INITIALS_LENGTH, normalizeInitials } from "./scores.ts";

/**
 * THE WHEEL — what up and down walk, in order, wrapping at both ends.
 *
 * Letters first because a name is letters, then the digits. No space: a slot
 * is left EMPTY to shorten a name now, so a blank on the wheel would only be
 * a second way to say the same thing sitting in the way of every scroll. Down
 * from A is therefore 9, and up from 9 is A.
 */
export const WHEEL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** The letter slot 1 wakes as, being the one with no left-hand neighbour to
 * copy — and so the whole name a card that has never been used offers. */
export const FIRST_LETTER = "A";

export type InitialsState = {
  /** One character per slot: a letter or digit from `WHEEL`, or `BLANK`.
   * Never has a hole — every blank is at the end. */
  slots: readonly string[];
  /** Which slot the next press acts on, 0-based. */
  caret: number;
  /**
   * True until the player has done anything at all.
   *
   * The card opens holding the name last entered, and while this holds the
   * first TYPED character throws all of it away rather than editing it: a
   * player who wants their old name presses ENTER, and one who wants a new
   * one just types it, and neither has to clear anything first. Wheeling and
   * moving the caret are edits of the offered name, not a fresh start —
   * somebody reaching for up on NIC is changing a letter of it.
   */
  fresh: boolean;
};

/** Where a slot sits on the wheel; -1 for a blank, which is not on it. */
function at(letter: string): number {
  return WHEEL.indexOf(letter);
}

/** The letter an empty slot wakes as: its left-hand neighbour, or the first
 * letter for slot 1. */
function seed(slots: readonly string[], slot: number): string {
  const left = slot > 0 ? (slots[slot - 1] as string) : BLANK;
  return left === BLANK ? FIRST_LETTER : left;
}

/**
 * The furthest slot the caret may sit on: the first empty one, so a name is
 * always entered left to right and can never end up with a hole in the middle
 * of it. On a full name that is the last slot, and every slot is reachable.
 */
function reach(slots: readonly string[]): number {
  const hole = slots.indexOf(BLANK);
  return hole < 0 ? INITIALS_LENGTH - 1 : hole;
}

/** A name with nothing on it is not a name. Slot 1 holds a letter whatever
 * the player has just deleted, so ENTER always has something to post and the
 * card never has a dead state to explain. */
function settle(slots: string[], caret: number): InitialsState {
  const kept = [...slots];
  if (kept[0] === BLANK) kept[0] = FIRST_LETTER;
  return { slots: kept, caret: Math.min(Math.max(0, caret), reach(kept)), fresh: false };
}

/** The card, opened. `offer` is the name last entered — or the default, which
 * is one letter and two empty slots. */
export function startEntry(offer: string): InitialsState {
  const slots = [...normalizeInitials(offer)];
  if (slots[0] === BLANK) slots[0] = FIRST_LETTER;
  return { slots, caret: 0, fresh: true };
}

/** The name as it would be stored: exactly `INITIALS_LENGTH` characters, with
 * any unused slots left blank on the end. */
export function nameOf(state: InitialsState): string {
  return state.slots.join("");
}

/** Whether a character is one a slot can hold. Anything else — a bracket, an
 * accent, a space off a phone's autocorrect — is ignored outright rather than
 * typed as a blank: a name is not the place to discover which keys a board
 * takes. */
export function typable(char: string): boolean {
  return char.length === 1 && WHEEL.includes(char.toUpperCase());
}

/** A character, typed. Writes the caret's slot and moves along, leaving the
 * next slot EMPTY — see the module header. */
export function typeChar(state: InitialsState, char: string): InitialsState {
  if (!typable(char)) return state;
  const letter = char.toUpperCase();
  // The first thing typed onto an offered name replaces the whole of it, not
  // its first letter: NIC + X is a player called X, not one called XIC.
  const slots = state.fresh
    ? [letter, ...Array<string>(INITIALS_LENGTH - 1).fill(BLANK)]
    : state.slots.map((held, slot) => (slot === state.caret ? letter : held));
  return settle(slots, state.caret + 1);
}

/** Up or down. Wakes an empty slot rather than stepping it — the first press
 * against a blank is what puts the neighbour's letter there, and the second
 * one is the first step away from it. */
export function wheel(state: InitialsState, by: number): InitialsState {
  const slots = [...state.slots];
  const here = slots[state.caret] as string;
  slots[state.caret] =
    here === BLANK
      ? seed(slots, state.caret)
      : (WHEEL[(at(here) + by + WHEEL.length) % WHEEL.length] as string);
  return settle(slots, state.caret);
}

/** Put the caret on a slot — a tap, or left/right. An empty slot it lands on
 * wakes holding its neighbour's letter, which is what makes wheeling a name
 * out of the alphabet short. */
export function toSlot(state: InitialsState, slot: number): InitialsState {
  const to = Math.min(Math.max(0, slot), reach(state.slots));
  const slots = [...state.slots];
  if (slots[to] === BLANK) slots[to] = seed(slots, to);
  return settle(slots, to);
}

/** Left or right by one. */
export function moveCaret(state: InitialsState, by: number): InitialsState {
  return toSlot(state, state.caret + by);
}

/**
 * Backspace. Empties the caret's slot and steps back; on a slot that is
 * already empty it takes the one before it, so the key does something every
 * time it is pressed rather than needing to be pressed twice at the end of a
 * name.
 */
export function erase(state: InitialsState): InitialsState {
  const slots = [...state.slots];
  const to = slots[state.caret] === BLANK ? Math.max(0, state.caret - 1) : state.caret;
  slots[to] = BLANK;
  // Everything after a slot that has just been emptied has to go too, or the
  // name is left with a hole the caret can no longer reach.
  for (let slot = to + 1; slot < slots.length; slot += 1) slots[slot] = BLANK;
  return settle(slots, to);
}
