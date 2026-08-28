// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RESULT SHEET, DRAWN — fifteen rows of place, crew, time and points, in
// the one layout both places that show it use: the modal the results card
// opens the moment a stage lands, and the championship table the campaign
// menu shows before the player picks the next one.
//
// Fifteen rows is more than a card can hold, which is exactly why it is a
// MODAL rather than another block on the results card: the card answers "how
// did I do", and this answers "how is the season going" — a different
// question, asked deliberately, with the whole field on screen at once.

import { playUi } from "./audio/ui.ts";
import { formatTime } from "../lib/util.ts";

export type ResultRow = {
  place: number;
  /** What the timing screen calls them — one word wide. */
  name: string;
  /** Stage time, null for a crew who never made the line. Ignored on a table
   * with no stage in view. */
  time?: number | null;
  /** What that stage paid them. */
  points?: number;
  /** What they have for the whole location. */
  total: number;
  you: boolean;
};

export type ResultsTableProps = {
  rows: readonly ResultRow[];
  /** Draw the TIME and PTS columns — a table with a stage in view. Without
   * it the table is the season's standings and nothing else. */
  stage: boolean;
};

export function ResultsTable({ rows, stage }: ResultsTableProps) {
  return (
    <ol className={`results-table ${stage ? "" : "is-season"}`}>
      <li className="results-row results-head">
        <span className="results-pos">#</span>
        <span className="results-who">DRIVER</span>
        {stage && <span className="results-time">TIME</span>}
        {stage && <span className="results-points">PTS</span>}
        <span className="results-total">TOTAL</span>
      </li>
      {rows.map((row) => (
        <li key={row.name} className={`results-row${row.you ? " is-you" : ""}`}>
          <span className="results-pos">{row.place}</span>
          <span className="results-who">{row.name.toUpperCase()}</span>
          {stage && (
            <span className="results-time">
              {row.time === null || row.time === undefined ? "DNF" : formatTime(row.time)}
            </span>
          )}
          {stage && <span className="results-points">{row.points ? `+${row.points}` : "–"}</span>}
          <span className="results-total">{row.total}</span>
        </li>
      ))}
    </ol>
  );
}

export type ResultsModalProps = ResultsTableProps & {
  title: string;
  /** One line under the title — what season this is, and where it stands. */
  sub: string;
  onClose: () => void;
};

/** The table over the top of whatever opened it, with one way out. */
export function ResultsModal({ rows, stage, title, sub, onClose }: ResultsModalProps) {
  return (
    <div className="hud-modal pointer-events-auto">
      <div className="hud-modal-card">
        <div className="hud-modal-title">{title}</div>
        <div className="hud-modal-sub">{sub}</div>
        <ResultsTable rows={rows} stage={stage} />
        <button
          type="button"
          className="hud-pause-act"
          onClick={() => {
            playUi("select");
            onClose();
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
