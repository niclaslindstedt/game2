// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RESULTS CARD — the one screen a run ends on.
//
// It comes up the instant the line is crossed rather than when the car stops:
// the clock has stopped, and the roll-out past the gate (R22) is the
// celebration, not a wait for one. So the ways ON are up during the roll-out
// too — a player who is done reading their time never waits for the confetti
// to finish.
//
// AND IT NEVER TIMES OUT. A card that counted itself down to the main menu was
// the ladder taking its own next rung away: where a run goes next is a press,
// not a countdown.

import { useState } from "react";

import { playUi } from "./audio/ui.ts";
import { PODIUM } from "./campaign.ts";
import { InitialsEntry } from "./hud-initials.tsx";
import { ResultsModal, type ResultRow } from "./results-table.tsx";
import { ScoreBoard } from "./score-board.tsx";
import type { ScoreEntry } from "./scores.ts";
import { formatTime, ordinal } from "../lib/util.ts";

/** Where the run goes on to, when it has anywhere to go: the ladder's next
 * rung. Null on Roam, in a time trial, and at the end of a location. */
export type NextStage = { name: string; go: () => void };

/** The time trial's high score table, as the card needs it. Null on every
 * other kind of run — the ladder and Roam keep no board. */
export type FinishScores = {
  /** The stage's board as it stands right now. */
  board: readonly ScoreEntry[];
  /** Where this run placed on it, 1-based; 0 when it did not make the ten. */
  place: number;
  /** Set while the three letters are still to be entered. The card holds the
   * ways ON back until they are: an arcade does not let you walk away from
   * the board with your initials half typed. */
  entering: { initial: string; onDone: (who: string) => void } | null;
};

/** R29 — where the run finished in the field, and whether that is good
 * enough. A campaign stage is CLEARED on the podium and nowhere else, so
 * this is also the card's whole mood: the same numbers under a different
 * headline, with the way on to the next stage present or absent. */
export type FinishStanding = {
  place: number;
  of: number;
  podium: boolean;
};

/** R30 — what the stage was worth, and what the season looks like after it.
 * Null on every run outside the campaign: nobody keeps points for a lap
 * driven against the clock. */
export type FinishChampionship = {
  /** The location whose season this stage belongs to. */
  location: string;
  /** What the stage paid the player — null while the field is still out on
   * the road and the order behind them is not settled. */
  points: number | null;
  /** What an EARLIER, better run on this stage is still worth, when this one
   * was not good enough to replace it. Null when this run is the one that
   * counts. */
  kept: number | null;
  /** Their season total and where it stands, once it is. */
  total: number;
  place: number;
  /** Level with somebody on points and wins both — a place taken on the
   * tie-break, written with the equals sign a results sheet uses. */
  tied: boolean;
  of: number;
  /** The whole result sheet, for the table the card opens. Null until the
   * last car is home. */
  rows: readonly ResultRow[] | null;
  /** Set when this result took the location's championship. */
  champion: boolean;
};

export type FinishCardProps = {
  /** Total time, seconds. */
  time: number;
  /** Set when the run beat the stored record. */
  record: boolean;
  /** R22 — the lap book, shown only on a run that had more than one. */
  laps: number;
  lapTimes: number[];
  nextStage: NextStage | null;
  /** RUN IT AGAIN, from the grid — the same stage, the same car, a clean
   * clock. Null where a re-run means nothing: on a stage whose whole point
   * was to be cleared once. A time trial is the opposite of that, which is
   * why the button lives here rather than behind the pause menu: a board
   * you have just missed by two tenths is read and answered in one press. */
  onRetry: (() => void) | null;
  onRetire: () => void;
  scores: FinishScores | null;
  /** The field's verdict — null on every run with nobody else entered. */
  standing: FinishStanding | null;
  /** R30 — the points, and the season they go into. */
  championship: FinishChampionship | null;
  /** The championship standing between the player and the next country,
   * named — set only when the ladder's next rung is in a location this
   * season has not opened. */
  locked: string | null;
};

export function FinishCard({
  time,
  record,
  laps,
  lapTimes,
  nextStage,
  onRetry,
  onRetire,
  scores,
  standing,
  championship,
  locked,
}: FinishCardProps) {
  // The full result sheet is a DELIBERATE look: fifteen rows over the top of
  // the card, opened by the player who wants them and gone again in a press.
  const [sheet, setSheet] = useState(false);
  // A run outside the podium is not a stage clear, and the card must not
  // dress it as one: the confetti is off, the way on is gone, and the
  // headline says the only thing that happened.
  const slow = standing !== null && !standing.podium;
  return (
    <>
      <div className={`hud-finish ${slow ? "hud-finish-slow" : ""}`}>
        <div className="hud-finish-title">{slow ? "TOO SLOW" : "STAGE CLEAR"}</div>
        {standing && (
          <div className="hud-finish-place">
            <span className="hud-finish-place-no">{ordinal(standing.place)}</span>
            <span className="hud-finish-place-of">of {standing.of}</span>
          </div>
        )}
        {slow && <div className="hud-finish-note">TOP {PODIUM} TO GO ON — RUN IT AGAIN</div>}
        {/* R30 — what the place was WORTH. It sits directly under the place
          because it is the same sentence: third is one point, and fourth is
          the reason the podium matters at all. */}
        {championship && (
          <div className="hud-finish-points">
            <span className="hud-finish-pts">
              {championship.points === null ? "···" : `+${championship.points}`}
            </span>
            <span className="hud-finish-pts-label">
              {championship.points === 1 ? "POINT" : "POINTS"}
            </span>
          </div>
        )}
        <div className="hud-finish-label">TOTAL TIME</div>
        <div className="hud-finish-time">{formatTime(time)}</div>
        {record && <div className="hud-finish-record">NEW RECORD</div>}
        {laps > 1 && (
          <div className="hud-finish-laps">
            {lapTimes.map((t, i) => (
              <span key={i} className="hud-finish-lap">
                <span className="hud-finish-lap-label">LAP {i + 1}</span>
                {formatTime(t)}
              </span>
            ))}
          </div>
        )}
        {/* …and the season those points went into, with the whole field's sheet
          one press away. While the last cars are still coming home the table
          is not a table yet, so the way into it is held shut rather than
          opening on a half-written one. */}
        {championship && (
          <div className="hud-finish-season">
            <div className="hud-finish-season-line">
              {championship.location.toUpperCase()} CHAMPIONSHIP — {championship.total} PTS,{" "}
              {championship.tied ? "=" : ""}
              {ordinal(championship.place)} OF {championship.of}
            </div>
            {championship.kept !== null && (
              <div className="hud-finish-note">
                YOUR BEST RUN HERE STANDS — {championship.kept} PTS
              </div>
            )}
            {championship.champion && <div className="hud-finish-record">CHAMPION</div>}
            <button
              type="button"
              className="hud-pause-act hud-finish-sheet"
              disabled={championship.rows === null}
              onClick={() => {
                playUi("select");
                setSheet(true);
              }}
            >
              {championship.rows === null ? "CARS STILL OUT…" : "FULL RESULTS"}
            </button>
          </div>
        )}
        {/* The lock between this country and the next one, said where the
          player is looking for the way on. */}
        {locked && (
          <div className="hud-finish-note">
            WIN THE {locked.toUpperCase()} CHAMPIONSHIP TO GO ON
          </div>
        )}
        {scores && !scores.entering && (
          <ScoreBoard entries={scores.board} highlight={scores.place} />
        )}
        {scores?.entering ? (
          <InitialsEntry
            place={scores.place}
            initial={scores.entering.initial}
            onDone={scores.entering.onDone}
          />
        ) : (
          <div className="hud-finish-acts pointer-events-auto">
            {nextStage && (
              <button
                type="button"
                className="hud-start hud-finish-next"
                onClick={() => {
                  playUi("start");
                  nextStage.go();
                }}
              >
                NEXT: {nextStage.name.toUpperCase()}
              </button>
            )}
            {/* The time trial's own way on, and it is the PRIMARY one: a trial
              has no next rung to climb to, so running it again is what the
              player came here to do. */}
            {onRetry && (
              <button
                type="button"
                className="hud-start hud-finish-next"
                onClick={() => {
                  playUi("start");
                  onRetry();
                }}
              >
                RETRY
              </button>
            )}
            <button
              type="button"
              className="hud-pause-act"
              onClick={() => {
                playUi("select");
                onRetire();
              }}
            >
              RETIRE
            </button>
          </div>
        )}
      </div>
      {sheet && championship?.rows && (
        <ResultsModal
          title="CLASSIFICATION"
          sub={`${championship.location.toUpperCase()} CHAMPIONSHIP — POINTS AFTER THIS STAGE`}
          rows={championship.rows}
          stage
          onClose={() => setSheet(false)}
        />
      )}
    </>
  );
}
