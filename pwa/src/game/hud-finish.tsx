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

import type { Standing } from "./standings.ts";
import { playUi } from "./audio/ui.ts";
import { formatTime } from "../lib/util.ts";

/** "1st", "2nd", "3rd", "4th"… A placing reads as a placing or it reads as
 * a number, and the whole point of the finish card is that third place and
 * fourth are different things. */
function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${["th", "st", "nd", "rd"][place % 10] ?? "th"}`;
}

/** Where the run goes on to, when it has anywhere to go: the ladder's next
 * rung. Null on Roam, in a time trial, and at the end of a location. */
export type NextStage = { name: string; go: () => void };

export type FinishCardProps = {
  /** Total time, seconds. */
  time: number;
  /** Set when the run beat the stored record. */
  record: boolean;
  /** Where the time placed on the stage's start list. */
  standing: Standing | null;
  /** R22 — the lap book, shown only on a run that had more than one. */
  laps: number;
  lapTimes: number[];
  nextStage: NextStage | null;
  onRetire: () => void;
};

export function FinishCard({
  time,
  record,
  standing,
  laps,
  lapTimes,
  nextStage,
  onRetire,
}: FinishCardProps) {
  return (
    <div className="hud-finish">
      <div className="hud-finish-title">STAGE CLEAR</div>
      <div className="hud-finish-label">TOTAL TIME</div>
      <div className="hud-finish-time">{formatTime(time)}</div>
      {record && <div className="hud-finish-record">NEW RECORD</div>}
      {standing && (
        <div className="hud-finish-place">
          <span className={`hud-place${standing.place <= 3 ? " is-podium" : ""}`}>
            {ordinal(standing.place)}
          </span>
          <span className="hud-finish-of">of {standing.of}</span>
          {standing.target !== null && (
            <span className="hud-finish-gap">+{formatTime(time - standing.target)}</span>
          )}
        </div>
      )}
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
    </div>
  );
}
