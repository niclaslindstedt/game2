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

import { playUi } from "./audio/ui.ts";
import { InitialsEntry } from "./hud-initials.tsx";
import { ScoreBoard } from "./score-board.tsx";
import type { ScoreEntry } from "./scores.ts";
import { formatTime } from "../lib/util.ts";

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
}: FinishCardProps) {
  return (
    <div className="hud-finish">
      <div className="hud-finish-title">STAGE CLEAR</div>
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
      {scores && !scores.entering && <ScoreBoard entries={scores.board} highlight={scores.place} />}
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
  );
}
