// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HIGH SCORE TABLE — the time trial's ten best runs on a stage, and the
// three letters that own each of them.
//
// This is the arcade's own institution and it is not the same thing as the
// campaign's `best` time. That one is a single number the ladder keeps so a
// clock has something to chase; this is a BOARD — ten rows deep, initials
// attached, and a place on it worth driving for even when the run was not
// your own quickest. The two live side by side on purpose: `progress.best`
// is what the HUD's target time and the ghost read, and neither of them
// should care who was at the wheel.
//
// Storage is one localStorage key per stage, plus one for the initials last
// entered — a board is read a stage at a time, and typing your own name in
// twice is the kind of small friction an arcade never had. Storage can be
// unavailable (private mode) or full; a board that cannot be kept simply is
// not kept, and the run still counts for everything else.

/** Rows on a stage's board. Ten is the arcade's number and it is the right
 * one: deep enough that a decent run gets on, shallow enough that the tenth
 * row is under threat every time somebody drives. */
export const BOARD_SIZE = 10;

/** Letters in a name. Three, for the same reason every cabinet used three. */
export const INITIALS_LENGTH = 3;

/** An unused slot. A stored name is always exactly `INITIALS_LENGTH`
 * characters, so a two-letter name ends in one of these and the board never
 * has to align ragged rows. */
export const BLANK = " ";

/**
 * THE ALPHABET a stored name may be made of: letters, digits, and the blank
 * that pads a short one out to length. What the ENTRY walks with up and down
 * is a different, shorter list — `WHEEL` in `initials-entry.ts`, which has no
 * blank on it, because a name is shortened by leaving a slot empty rather
 * than by scrolling to a space.
 */
export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";

/** What a name defaults to before anybody has entered one: ONE letter, and
 * two empty slots after it. A cabinet's AAA is three letters to walk back
 * from before you can say your own — and two of them look like a name you
 * meant, so a player who stops early leaves AAA on the board. */
export const DEFAULT_INITIALS = "A" + BLANK + BLANK;

export type ScoreEntry = {
  /** Exactly `INITIALS_LENGTH` characters from `ALPHABET`. */
  who: string;
  /** Stage time, seconds. */
  time: number;
  /** Which car set it — the board says WHAT beat you as well as who. */
  carId: string;
  /** When, as a unix ms stamp. Only ever used to break a tie in favour of
   * the run that got there first. */
  at: number;
};

const BOARD_KEY = "scandi-flick-scores:";
const INITIALS_KEY = "scandi-flick-initials";

/** Force any string into a storable name: uppercased, only characters the
 * alphabet has, cut to length and padded out with blanks. Padding is blank
 * rather than a letter because a short name is a name — an older build's AAA
 * comes back unchanged, but nothing new ever grows letters nobody typed. The
 * blanks are dropped before the padding goes back on, so a name that arrives
 * with a hole in the middle of it — which only a hand-edited key can be —
 * comes back closed up rather than un-enterable.
 * Anything a hand-edited storage value or an older build wrote comes back
 * through here. */
export function normalizeInitials(raw: string): string {
  const kept = [...raw.toUpperCase()]
    .filter((c) => c !== BLANK && ALPHABET.includes(c))
    .join("")
    .slice(0, INITIALS_LENGTH);
  return (kept || DEFAULT_INITIALS).padEnd(INITIALS_LENGTH, BLANK);
}

/** The name last entered, so a player who has been here before is offered
 * their own rather than `AAA`. */
export function lastInitials(): string {
  try {
    const stored = localStorage.getItem(INITIALS_KEY);
    return stored ? normalizeInitials(stored) : DEFAULT_INITIALS;
  } catch {
    return DEFAULT_INITIALS;
  }
}

/** Remember a name for the next stage this player finishes. */
export function rememberInitials(who: string): void {
  try {
    localStorage.setItem(INITIALS_KEY, normalizeInitials(who));
  } catch {
    /* storage unavailable — the name still stands on this board */
  }
}

/** Read one stage's board, quickest first. Anything unparseable reads as an
 * empty board rather than throwing: a corrupt key must not cost a run. */
export function loadBoard(levelId: string): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(BOARD_KEY + levelId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortBoard(
      parsed
        .filter((row): row is ScoreEntry => {
          const r = row as Partial<ScoreEntry> | null;
          return (
            !!r && typeof r.who === "string" && typeof r.time === "number" && r.time > 0 // a zero or a NaN is not a lap anybody drove
          );
        })
        .map((row) => ({
          who: normalizeInitials(row.who),
          time: row.time,
          carId: typeof row.carId === "string" ? row.carId : "",
          at: typeof row.at === "number" ? row.at : 0,
        })),
    ).slice(0, BOARD_SIZE);
  } catch {
    return [];
  }
}

/** Quickest first; a dead heat goes to whoever got there first. */
function sortBoard(rows: ScoreEntry[]): ScoreEntry[] {
  return [...rows].sort((a, b) => a.time - b.time || a.at - b.at);
}

/**
 * Where `time` would land on `board`, 0-based — or -1 when it does not make
 * the table at all. A time equal to a row already up there places BELOW it:
 * the board is a queue, and being told you tied for third when you did not
 * beat it is the wrong answer.
 */
export function placeOn(board: readonly ScoreEntry[], time: number): number {
  if (!Number.isFinite(time) || time <= 0) return -1;
  let place = 0;
  while (place < board.length && board[place].time <= time) place += 1;
  return place < BOARD_SIZE ? place : -1;
}

/** Put an entry on a stage's board and return the board it makes. Sorting
 * and the ten-row cut happen here, so no caller has to know either. */
export function recordScore(levelId: string, entry: ScoreEntry): ScoreEntry[] {
  const next = sortBoard([
    ...loadBoard(levelId),
    { ...entry, who: normalizeInitials(entry.who) },
  ]).slice(0, BOARD_SIZE);
  try {
    localStorage.setItem(BOARD_KEY + levelId, JSON.stringify(next));
  } catch {
    /* storage unavailable or full — the board stands for this session */
  }
  return next;
}

/** Wipe every board. The developer menu's reset owns this; nothing in the
 * game reaches it. */
export function clearScores(levelIds: readonly string[]): void {
  try {
    for (const id of levelIds) localStorage.removeItem(BOARD_KEY + id);
  } catch {
    /* storage unavailable — there was nothing to clear */
  }
}
