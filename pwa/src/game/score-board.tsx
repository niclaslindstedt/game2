// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOARD, DRAWN — ten rows of rank, name and time, in the one layout both
// places that show it use: the results card the moment a run lands on it, and
// the menu page a player reads before deciding which stage to go and beat.
//
// Rows the board does not have yet are drawn as EMPTY rather than left out.
// A table that grows from nothing says "there is nothing here"; ten dotted
// rows say "there are ten places and nine of them are free", which is the
// invitation, and it is why every cabinet drew them that way.

import { BOARD_SIZE, type ScoreEntry } from "./scores.ts";
import { formatTime } from "../lib/util.ts";

export type ScoreBoardProps = {
  entries: readonly ScoreEntry[];
  /** A row to light up — 1-based, the run that has just landed. 0 for none. */
  highlight?: number;
  /** Rows to draw. Fewer than the full ten where space is short. */
  rows?: number;
};

export function ScoreBoard({ entries, highlight = 0, rows = BOARD_SIZE }: ScoreBoardProps) {
  return (
    <ol className="score-board">
      {Array.from({ length: rows }, (_, i) => {
        const entry = entries[i];
        return (
          <li
            key={i}
            className={`score-row${i + 1 === highlight ? " is-you" : ""}${entry ? "" : " is-empty"}`}
          >
            <span className="score-rank">{i + 1}</span>
            <span className="score-who">{entry ? entry.who : "···"}</span>
            <span className="score-time">{entry ? formatTime(entry.time) : "--·--"}</span>
          </li>
        );
      })}
    </ol>
  );
}
