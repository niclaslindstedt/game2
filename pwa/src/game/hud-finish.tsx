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
import { useInitials } from "./hud-initials.tsx";
import { ResultsSheet, type SheetRow } from "./results-sheet.tsx";
import { ScoreSheet } from "./score-board.tsx";
import { BOARD_SIZE, DEFAULT_INITIALS, type ScoreEntry } from "./scores.ts";
import { formatTime, ordinal } from "../lib/util.ts";
import type { RetireReason } from "@engine";

/** WHAT BROKE, and what that means — the two halves of a retirement, kept
 * apart because they are read at different sizes. The first is the news and
 * gets the card's big line; the second is the sentence under it. */
const RETIRED_BY: Record<RetireReason, { broke: string; means: string }> = {
  engine: { broke: "ENGINE DEAD", means: "the car will not run" },
  wheels: { broke: "WHEELS GONE", means: "the car will not roll" },
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
  /** What the run was driven WITH, said under the headline — the same three
   * choices every row of the board carries, because a time only means
   * something next to them. */
  drove: string;
  /** Set while the three letters are still to be entered: the run's own row,
   * which the board stands in place while it is being named. Nothing is held
   * back for it — the letters are typed onto the board, and every press that
   * ends the card posts them on the way past. */
  entering: {
    /** The row as it will be stored, bar the name being typed into it. */
    run: Omit<ScoreEntry, "who">;
    /** What the slots open on: the name last entered, or the default. */
    initial: string;
    onDone: (who: string) => void;
  } | null;
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

/** THE HEAD ROW: what the card says, and every press that ends it.
 *
 * The presses stand TOGETHER on the right, in the order they are weighed:
 * whatever the run offers, then the way out, then the way on. Leaving is a
 * decision made against going on, so the two are side by side and neither is
 * across the card from the other — a back chip in the far corner is read
 * before the title, which is not the order anybody decides in. */
function Head({
  title,
  sub,
  onRetire,
  acts,
  primary,
}: {
  title: string;
  sub: string | null;
  onRetire: () => void;
  /** What this run offers besides leaving — spectating, saving the tape. */
  acts: ComponentChildren;
  /** The way ON: the next stage, or the same one again. Last, and loud. */
  primary: ComponentChildren;
}) {
  return (
    <div className="fin-head">
      <div className="fin-head-text">
        <div className="fin-title">{title}</div>
        {sub && <div className="fin-sub">{sub}</div>}
      </div>
      <div className="fin-acts pointer-events-auto">
        {acts}
        {/* `data-nav-back` is what a controller's B button presses (menu-nav.ts). */}
        <button
          type="button"
          className="hud-pause-act fin-act fin-retire"
          data-nav-back
          onClick={() => {
            playUi("select");
            onRetire();
          }}
        >
          RETIRE
        </button>
        {primary}
      </div>
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
  // THE THREE LETTERS, held HERE rather than down on the board that draws
  // them: there is no confirm button any more, so every press that ends this
  // card is what posts the name, and each of those lives up here. Called
  // unconditionally, and on a card with nothing to name it is a name nobody
  // is typing and nowhere to report it to.
  const naming = scores?.entering ?? null;
  const initials = useInitials(naming?.initial ?? DEFAULT_INITIALS, (who) => naming?.onDone(who));
  /** Wrap a way off the card so the letters go with it. */
  const ending =
    (go: () => void): (() => void) =>
    () => {
      if (naming) initials.commit();
      go();
    };
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
      // NOT THE RESULTS CARD'S HEAD ROW. A result is read across — the word,
      // then the numbers, then where to go — because there is something to
      // read. A retirement is one piece of news, so it is stacked and
      // CENTRED, with the two ways off it along the foot where a player who
      // has finished reading is looking.
      //
      // WHAT BROKE IS THE HEADLINE, and it is the whole card. "RETIRED" over
      // it, and "the stage cannot be finished" under it, were the same news
      // three times at three sizes: a car that will not run is a run that is
      // over, and the presses under it are the proof.
      <div className="hud-finish hud-finish-slow hud-finish-retired">
        <div className="fin-title">{RETIRED_BY[retired].broke}</div>
        <div className="fin-note">{RETIRED_BY[retired].means}</div>
        <div className="fin-acts fin-foot pointer-events-auto">
          {onSaveRun && <SaveRunButton onSave={onSaveRun} />}
          {/* `data-nav-back` is what a controller's B button presses. */}
          <button
            type="button"
            className="hud-pause-act fin-act fin-retire"
            data-nav-back
            onClick={() => {
              playUi("select");
              onRetire();
            }}
          >
            RETIRE
          </button>
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
        </div>
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
        ? `TIME TRIAL — ${scores.drove}`
        : null;
  const sheet = campaign ?? race;
  const out = sheet ? sheet.rows.filter((row) => row.out).length : 0;
  // THE TIME TRIAL'S OWN VERDICT. The board is the field here, so where the
  // run landed on it is this card's place — and the row it has to answer is
  // the one ABOVE it, or the last row on a full board when it missed. Both
  // are read off the board by index, which holds while the three letters are
  // still being typed: the run is not on the board yet, `place` is where it
  // is about to go, and the row standing at that index is the same row
  // either way.
  const chasing =
    scores &&
    (scores.place > 1
      ? { time: scores.board[scores.place - 2]?.time, was: ordinal(scores.place - 1) }
      : scores.place === 0
        ? { time: scores.board[BOARD_SIZE - 1]?.time, was: ordinal(BOARD_SIZE) }
        : null);
  const gap = chasing?.time !== undefined ? time - chasing.time : null;

  // The foot's one sentence: the table the points went onto, and how far the
  // sheet above it is from being final. A time trial gets none — the board is
  // right there, and a caption restating its top row is the card telling the
  // player something they are already looking at.
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
        onRetire={ending(onRetire)}
        acts={
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
          </>
        }
        primary={
          <>
            {/* The card's way ON, for the pad's START (menu-nav.ts): a run
                that has just ended and a player still holding the button
                should land on the next start line, not on a card. */}
            {nextStage && (
              <button
                type="button"
                className="hud-start fin-next"
                data-nav-next
                onClick={ending(() => {
                  playUi("start");
                  nextStage.go();
                })}
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
                onClick={ending(() => {
                  playUi("start");
                  onRetry();
                })}
              >
                RETRY
              </button>
            )}
          </>
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
          {/* THE BOARD IS THE TIME TRIAL'S FIELD, so where the run landed on
              it stands exactly where a race's place does — the same numeral,
              the same size. A run that missed the ten says so in words: an
              empty place would read as a place of nothing. */}
          {scores &&
            (scores.place > 0 ? (
              <div className="fin-place">
                <span className="fin-place-no">{ordinal(scores.place)}</span>
                <span className="fin-place-of">of {BOARD_SIZE}</span>
              </div>
            ) : (
              <div className="fin-place fin-place-off">
                <span className="fin-place-no">—</span>
                <span className="fin-place-of">OFF THE BOARD</span>
              </div>
            ))}
          {slow && <div className="fin-note">TOP {PODIUM} TO GO ON — RUN IT AGAIN</div>}
          <div className="fin-label">TOTAL TIME</div>
          <div className="fin-time">{formatTime(time)}</div>
          {record && <div className="fin-record">NEW RECORD</div>}
          {/* WHAT IS STILL TO BEAT, in the unit the next run will be judged
              in. Top of the board and there is nothing above it to quote,
              which is the whole of what that row is worth saying. */}
          {scores &&
            (scores.place === 1 ? (
              <div className="fin-gap fin-gap-top">FASTEST TIME HERE</div>
            ) : (
              gap !== null &&
              chasing && (
                <div className="fin-gap">
                  <span className="fin-gap-no">+{formatTime(gap)}</span>
                  <span className="fin-gap-label">OFF {chasing.was}</span>
                </div>
              )
            ))}
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
        {/* The board — and, while a run is still to be named, the entry too:
            the letters are typed into the row the time has just won, with
            the times it beat above it and the ones it pushed down below. */}
        {scores && (
          <section className="fin-sheet fin-board">
            <ScoreSheet
              entries={scores.board}
              highlight={scores.place}
              entering={naming && { run: naming.run, initials }}
            />
          </section>
        )}
      </div>
      {caption && <div className="knob-caption knob-caption-on fin-caption">{caption}</div>}
    </div>
  );
}
