// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RESULTS CARD — the one screen a run ends on.
//
// It comes up the instant the line is crossed rather than when the car stops:
// the clock has stopped, and the roll-out past the gate (R22) is the
// celebration, not a wait for one. So the ways ON are up during the roll-out
// too — a player who is done reading their time never waits for the confetti
// to finish.
//
// ONE PAGE, built the way the options page is (menu-options.tsx): the way
// out and the page's title on one head row with the ways on beside them,
// the content under that in a column — or two columns, on a screen wide
// enough — and one caption line at the foot. The content is two things: the
// SUMMARY (the place, what it paid, the time) and the SHEET — the whole
// field, paged, with a picture of every car (results-sheet.tsx). Where the
// run finished is the first thing a player wants off this card, and it is on
// the card itself, not behind a button.
//
// AND IT NEVER TIMES OUT. A card that counted itself down to the main menu was
// the ladder taking its own next rung away: where a run goes next is a press,
// not a countdown.

import type { ComponentChildren } from "preact";
import { useState } from "react";

import { playUi } from "./audio/ui.ts";
import { PODIUM } from "./campaign.ts";
import { InitialsEntry } from "./hud-initials.tsx";
import { ResultsSheet, type SheetRow } from "./results-sheet.tsx";
import { ScoreBoard } from "./score-board.tsx";
import type { ScoreEntry } from "./scores.ts";
import { formatTime, ordinal } from "../lib/util.ts";
import type { RetireReason } from "@engine";

/** What the card says a retirement WAS, under the headline. */
const RETIRED_BY: Record<RetireReason, string> = {
  engine: "ENGINE DEAD — THE CAR WILL NOT RUN",
  wheels: "WHEELS GONE — THE CAR WILL NOT ROLL",
};

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

/** R30 — what the stage was worth, and what the location's table looks like
 * after it. Null on every run outside the campaign: nobody keeps points for a
 * lap driven against the clock. */
export type FinishStandings = {
  /** The location whose table this stage belongs to. */
  location: string;
  /** What the stage paid the player. Known at the line: the place is the
   * place whether or not the crews behind them are home yet. */
  points: number;
  /** What an EARLIER, better run on this stage is still worth, when this one
   * was not good enough to replace it. Null when this run is the one that
   * counts. */
  kept: number | null;
  /** Their location total and where it stands, once the sheet is in. */
  total: number;
  place: number;
  /** Level with somebody on points and wins both — a place taken on the
   * tie-break, written with the equals sign a results sheet uses. */
  tied: boolean;
  of: number;
  /** The whole result sheet. PROVISIONAL until the last car is home: the
   * crews still out are on it as OUT, at the bottom, and move up as they
   * come in. */
  rows: readonly SheetRow[];
  /** …and whether it is. */
  settled: boolean;
  /** Set when this result topped the location's table with every stage of it
   * driven — the country behind this one is open. */
  won: boolean;
};

/** A HEADS-UP result: the race's own classification, and nothing behind it.
 * There is no table, no points and no ladder — the sheet IS the result, which
 * is the whole difference between this mode and the campaign. */
export type FinishRace = {
  /** Places and times, the player included — provisional, as above. */
  rows: readonly SheetRow[];
  settled: boolean;
  /** Cars that started, the player included. */
  cars: number;
  /** How they started, for the one line that says what kind of race it was. */
  massStart: boolean;
};

export type FinishCardProps = {
  /** Total time, seconds. Meaningless — and not shown — on a retirement. */
  time: number;
  /** THE RUN ENDED SHORT OF THE LINE: the engine is dead, or the wheels
   * are gone, and the car is sitting where it stopped. There is no time,
   * no place, no points and no board — the card says what happened and
   * offers the two ways out, the same stage again or the menu. Null on
   * every run that reached the line. */
  retired: RetireReason | null;
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
  /** R30 — the points, and the location table they go onto. */
  campaign: FinishStandings | null;
  /** The heads-up race's own sheet — set only on that mode, and never at the
   * same time as `campaign`: a race is one or the other. */
  race: FinishRace | null;
  /** The location whose table stands between the player and the next country,
   * named — set only when the ladder's next rung is in a location the points
   * have not opened yet. */
  locked: string | null;
  /** Save the run just driven as a run tape (game/run-tape.ts). Null unless
   * the developer switch that collects them is on; returns whether the file
   * actually reached the disk, so the button can say when it did not. */
  onSaveRun: (() => boolean) | null;
  /** WATCH THE REST OF THEM COME HOME (spectate.ts). Offered only while the
   * road still has somebody on it — which is exactly as long as the sheet
   * has an OUT on it. */
  onSpectate: (() => void) | null;
};

/** The save button, which is the only control on this card that reports back:
 * a download is a thing the browser may quietly refuse, and a developer tool
 * that silently does nothing is worse than no tool. */
function SaveRunButton({ onSave }: { onSave: () => boolean }) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <button
      type="button"
      className="hud-pause-act fin-act"
      onClick={() => {
        playUi("select");
        setSaid(onSave() ? "SAVED" : "SAVE FAILED");
        setTimeout(() => setSaid(null), 2000);
      }}
    >
      {said ?? "SAVE RUN DATA"}
    </button>
  );
}

/** THE HEAD ROW: the way out, what the card says, and the ways on. The same
 * row the options page opens with — back on the left, the title beside it —
 * with the presses that end the card on the right, so every way off it is
 * in one place and none of them has to be scrolled to. */
function Head({
  title,
  sub,
  onRetire,
  acts,
}: {
  title: string;
  sub: string | null;
  onRetire: () => void;
  acts: ComponentChildren;
}) {
  return (
    <div className="fin-head">
      {/* `data-nav-back` is what a controller's B button presses (menu-nav.ts). */}
      <button
        type="button"
        className="menu-back"
        data-nav-back
        onClick={() => {
          playUi("select");
          onRetire();
        }}
      >
        ‹ RETIRE
      </button>
      <div className="fin-head-text">
        <div className="fin-title">{title}</div>
        {sub && <div className="fin-sub">{sub}</div>}
      </div>
      <div className="fin-acts pointer-events-auto">{acts}</div>
    </div>
  );
}

export function FinishCard({
  time,
  retired,
  record,
  laps,
  lapTimes,
  nextStage,
  onRetry,
  onRetire,
  scores,
  standing,
  campaign,
  race,
  locked,
  onSaveRun,
  onSpectate,
}: FinishCardProps) {
  // A run outside the podium is not a stage clear, and the card must not
  // dress it as one: the confetti is off, the way on is gone, and the
  // headline says the only thing that happened.
  const slow = standing !== null && !standing.podium;
  // ...and a RETIREMENT is not a result at all. The car is stopped on the
  // stage with nothing to show for the run, so the card is the headline,
  // the reason, and the two ways off it: nothing below is worth printing
  // over a time that was never set.
  if (retired) {
    return (
      <div className="hud-finish hud-finish-slow hud-finish-retired">
        <Head
          title="RETIRED"
          sub={RETIRED_BY[retired]}
          onRetire={onRetire}
          acts={
            <>
              {onRetry && (
                <button
                  type="button"
                  className="hud-start fin-next"
                  data-nav-next
                  onClick={() => {
                    playUi("start");
                    onRetry();
                  }}
                >
                  RESTART STAGE
                </button>
              )}
              {onSaveRun && <SaveRunButton onSave={onSaveRun} />}
            </>
          }
        />
        <div className="fin-note">THE STAGE CANNOT BE FINISHED</div>
      </div>
    );
  }

  const title = race
    ? standing?.place === 1
      ? "WON"
      : "FINISHED"
    : slow
      ? "TOO SLOW"
      : "STAGE CLEAR";
  // The head's one line under the title: what this run WAS. The place goes
  // in the summary, where there is room to make it big.
  const sub = campaign
    ? campaign.location.toUpperCase()
    : race
      ? `${race.cars} CARS — ${race.massStart ? "MASS START" : "RALLY START"}`
      : scores
        ? "TIME TRIAL"
        : null;
  const sheet = campaign ?? race;
  const out = sheet ? sheet.rows.filter((row) => row.out).length : 0;

  // The foot's one sentence: the table the points went onto, and how far
  // the sheet above it is from being final.
  const caption = [
    campaign &&
      `${campaign.location.toUpperCase()} STANDINGS — ${campaign.total} PTS, ${campaign.tied ? "=" : ""}${ordinal(campaign.place)} OF ${campaign.of}`,
    campaign?.kept !== null &&
      campaign?.kept !== undefined &&
      `YOUR BEST RUN HERE STANDS — ${campaign.kept} PTS`,
    out > 0 && `${out} CAR${out === 1 ? "" : "S"} STILL OUT`,
  ]
    .filter((line): line is string => Boolean(line))
    .join(" · ");

  return (
    <div
      className={`hud-finish ${slow ? "hud-finish-slow" : ""} ${sheet || scores ? "has-sheet" : ""}`}
    >
      <Head
        title={title}
        sub={sub}
        onRetire={onRetire}
        acts={
          scores?.entering ? null : (
            <>
              {/* …and the way to spend the wait the sheet is otherwise
                  asking the player to sit through: the cars still out there
                  are a race, and this is the seat to watch it from. */}
              {onSpectate && (
                <button
                  type="button"
                  className="hud-pause-act fin-act"
                  onClick={() => {
                    playUi("select");
                    onSpectate();
                  }}
                >
                  SPECTATE
                </button>
              )}
              {onSaveRun && <SaveRunButton onSave={onSaveRun} />}
              {/* The card's way ON, for the pad's START (menu-nav.ts): a run
                  that has just ended and a player still holding the button
                  should land on the next start line, not on a card. */}
              {nextStage && (
                <button
                  type="button"
                  className="hud-start fin-next"
                  data-nav-next
                  onClick={() => {
                    playUi("start");
                    nextStage.go();
                  }}
                >
                  NEXT: {nextStage.name.toUpperCase()}
                </button>
              )}
              {/* The time trial's own way on, and it is the PRIMARY one: a
                  trial has no next rung to climb to, so running it again is
                  what the player came here to do. */}
              {onRetry && (
                <button
                  type="button"
                  className="hud-start fin-next"
                  data-nav-next
                  onClick={() => {
                    playUi("start");
                    onRetry();
                  }}
                >
                  RETRY
                </button>
              )}
            </>
          )
        }
      />
      <div className="fin-body">
        <section className="fin-summary">
          {standing && (
            <div className="fin-place">
              <span className="fin-place-no">{ordinal(standing.place)}</span>
              <span className="fin-place-of">of {standing.of}</span>
            </div>
          )}
          {/* R30 — what the place was WORTH. It sits directly under the place
              because it is the same sentence: third is one point, and fourth
              is the reason the podium matters at all. */}
          {campaign && (
            <div className="fin-points">
              <span className="fin-pts">+{campaign.points}</span>
              <span className="fin-pts-label">{campaign.points === 1 ? "POINT" : "POINTS"}</span>
            </div>
          )}
          {slow && <div className="fin-note">TOP {PODIUM} TO GO ON — RUN IT AGAIN</div>}
          <div className="fin-label">TOTAL TIME</div>
          <div className="fin-time">{formatTime(time)}</div>
          {record && <div className="fin-record">NEW RECORD</div>}
          {laps > 1 && (
            <div className="fin-laps">
              {lapTimes.map((t, i) => (
                <span key={i} className="fin-lap">
                  <span className="fin-lap-label">LAP {i + 1}</span>
                  {formatTime(t)}
                </span>
              ))}
            </div>
          )}
          {campaign?.won && <div className="fin-record">{campaign.location.toUpperCase()} WON</div>}
          {/* The lock between this country and the next one, said where the
              player is looking for the way on. */}
          {locked && <div className="fin-note">TOP THE {locked.toUpperCase()} TABLE TO GO ON</div>}
        </section>
        {sheet && (
          <section className="fin-sheet">
            <ResultsSheet rows={sheet.rows} board={campaign !== null} title="RESULTS" />
          </section>
        )}
        {/* The time trial's board stands where the field's sheet would: a
            trial is raced against the times already on it. */}
        {scores && (
          <section className="fin-sheet fin-board">
            {scores.entering ? (
              <InitialsEntry
                place={scores.place}
                initial={scores.entering.initial}
                onDone={scores.entering.onDone}
              />
            ) : (
              <ScoreBoard entries={scores.board} highlight={scores.place} />
            )}
          </section>
        )}
      </div>
      {caption && <div className="knob-caption knob-caption-on fin-caption">{caption}</div>}
    </div>
  );
}
