// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STANDINGS TABLE, DRAWN — fifteen rows of place, crew and points, in
// the modal the campaign menu opens over a location's page before the
// player picks the next stage: "how does the location stand", with the whole
// field on screen at once.
//
// The STAGE's own sheet — the one on the results card, with the times, the
// pictures of the cars and the pages — is results-sheet.tsx. This one keeps
// the plain fifteen-row layout because the question it answers is the
// table's, not a run's.

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
  /** What they have for the whole location. Absent on a table with no board
   * behind it. */
  total?: number;
  you: boolean;
};

export type ResultsTableProps = {
  rows: readonly ResultRow[];
  /** Draw the TIME column — a table with a stage in view. Without it the
   * table is the location's standings and nothing else. */
  stage: boolean;
  /** Draw the PTS and TOTAL columns — a table played for POINTS. Off on a
   * HEADS-UP result, which is one race with no board behind it: places and
   * times are the whole sheet, and two empty columns beside them would be
   * the card asking a question the mode does not answer. Defaults on. */
  board?: boolean;
};

export function ResultsTable({ rows, stage, board = true }: ResultsTableProps) {
  const shape = !stage ? "is-standings" : board ? "" : "is-race";
  return (
    <ol className={`results-table ${shape}`}>
      <li className="results-row results-head">
        <span className="results-pos">#</span>
        <span className="results-who">DRIVER</span>
        {stage && <span className="results-time">TIME</span>}
        {board && stage && <span className="results-points">PTS</span>}
        {board && <span className="results-total">TOTAL</span>}
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
          {board && stage && (
            <span className="results-points">{row.points ? `+${row.points}` : "–"}</span>
          )}
          {board && <span className="results-total">{row.total ?? 0}</span>}
        </li>
      ))}
    </ol>
  );
}

export type ResultsModalProps = ResultsTableProps & {
  title: string;
  /** One line under the title — which table this is, and how far into it the
   * location has been driven. */
  sub: string;
  onClose: () => void;
};

/** The table over the top of whatever opened it, with one way out. */
export function ResultsModal({ rows, stage, board, title, sub, onClose }: ResultsModalProps) {
  return (
    <div className="hud-modal pointer-events-auto">
      <div className="hud-modal-card">
        <div className="hud-modal-title">{title}</div>
        <div className="hud-modal-sub">{sub}</div>
        <ResultsTable rows={rows} stage={stage} board={board} />
        <button
          type="button"
          className="hud-pause-act"
          data-nav-back
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
