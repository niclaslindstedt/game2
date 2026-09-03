// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOCATION'S TABLE, DRAWN — where the campaign's fifteen crews stand
// after the stages driven so far, over the top of the grid the STANDINGS
// press opened it from.
//
// It is the RESULT SHEET (results-sheet.tsx) asked a different question.
// That one is one stage's finishing order; this is what all six of them have
// added up to. A player who has read one has read the other, so it is the
// same board: the same rows at the same pitch, the same picture of every
// crew's car off the same roll (car-portraits.ts), and the same two arrows
// and pips that walk a value on the options page. What changes is the
// columns — a stage's TIME becomes the WINS that break a tie on a points
// table, and TOTAL is the figure the whole page is about.
//
// It PAGES rather than scrolls, for the sheet's own reason: fifteen rows do
// not fit over a phone held sideways, and a table you have to drag is a
// table you cannot scan. The page is cut to the room the MODAL has by the
// same hook the results card's two tables use (card-rows.ts, over the
// arithmetic in results-pages.ts) — eight rows where there are eight, fewer
// where there are not, and a row itself never shrinks below a thumb.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "react";

import { PLAYER_ID, PLAYER_NUMBER, carById, entryList } from "@engine";

import { playUi } from "./audio/ui.ts";
import { useCardRows } from "./card-rows.ts";
import { onPortraits, portraitOf, warmPortraits, type PortraitSubject } from "./car-portraits.ts";
import { PAGE_MAX, PAGE_MIN, pageCount, pageOf, pageSpan, stepPage } from "./results-pages.ts";
import { ROW } from "./results-sheet.tsx";

/** One line of the table — `locationStandings`' own row, plus nothing. What
 * a picture of the crew's car needs beyond this (which car, which door
 * number) is derived below rather than plumbed through: it is a fact about
 * the roster, not about the board. */
export type StandingsRow = {
  /** The crew's id — `PLAYER_ID` for the player. */
  id: string;
  /** What the timing screen calls them — one word wide. YOU for the player. */
  alias: string;
  driver: string;
  points: number;
  /** Stage wins, the first tie-break. */
  wins: number;
  place: number;
  /** Somebody else is on the same points and the same wins, so this place is
   * shared — written the way a results sheet writes one. */
  tied: boolean;
  you: boolean;
};

/** WHICH CAR A CREW DRIVES, AND THE NUMBER ON ITS DOORS. The paint a rival
 * wears is read off the pair (car-livery.ts), and the pair is what keys the
 * portrait roll — so deriving it the same way the field does is what makes
 * the picture on this board the picture the results card just showed, off
 * the roll, at no cost. The entry list is in reputation order and hands out
 * numbers by position, exactly as `rivalField` does; the player is last car
 * on the road either way (R29). */
function carOf(id: string, yourCarId: string): PortraitSubject {
  if (id === PLAYER_ID) {
    return { carId: yourCarId, crewId: PLAYER_ID, number: PLAYER_NUMBER, you: true };
  }
  const list = entryList();
  const at = list.findIndex((crew) => crew.id === id);
  const crew = list[at];
  return { carId: crew?.carId ?? yourCarId, crewId: id, number: at + 1, you: false };
}

export type StandingsSheetProps = {
  rows: readonly StandingsRow[];
  /** The car the player is entered in — theirs is the one row on the board
   * whose car is a choice rather than a fact about the roster. */
  yourCarId: string;
};

export function StandingsSheet({ rows, yourCarId }: StandingsSheetProps) {
  const listRef = useRef<HTMLOListElement>(null);
  // The modal is the card here, and the sheet is its only column. The floor
  // is the one for a table being READ: nothing on this board has to be on
  // screen the way a name being typed into the high score board does.
  const perPage = useCardRows(listRef, ".rsheet", PAGE_MIN, ".hud-modal-card");
  const mine = rows.find((row) => row.you)?.place ?? 0;
  const [page, setPage] = useState(() => pageOf(mine, PAGE_MAX, rows.length));
  const pages = pageCount(rows.length, perPage);
  /** Whether the player has walked the pages themselves. Until they have,
   * the board keeps opening on their own row as the page is re-cut; once
   * they have, it stays where they put it. */
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current) setPage(pageOf(mine, perPage, rows.length));
  }, [perPage, mine, rows.length]);

  // The pictures land one at a time behind the modal; each one is a redraw
  // of the rows, and nothing else.
  const [, setShots] = useState(0);
  useEffect(() => onPortraits(() => setShots((n) => n + 1)), []);

  const at = Math.min(page, pages - 1);
  const span = pageSpan(at, perPage, rows.length);
  const shown = rows.slice(span.from, span.to);
  const flip = (by: number): void => {
    playUi("move");
    touched.current = true;
    setPage(stepPage(at, by, pages));
  };

  return (
    <div className="rsheet is-table">
      <div className="rsheet-head">
        {/* How many crews are on the board, and — where it does not fit on
            one page — which of them you are looking at. The head says what
            the ROWS are; where the player stands in them is the modal's own
            line, above (`StandingsModalProps.sub`). */}
        <span className="rsheet-count">
          {rows.length} CREW{rows.length === 1 ? "" : "S"}
        </span>
        {pages > 1 && (
          // ONE stop on a controller's walk, not two: the pair either side
          // of a value is what a thumb reads as one control (menu-nav.ts).
          <div className="rsheet-pager" data-nav-steps>
            <button
              type="button"
              className="knob-arrow"
              data-nav-step="left"
              aria-label="Previous page"
              onClick={() => flip(-1)}
            >
              ‹
            </button>
            <span className="knob-value rsheet-page">
              <span className="knob-word">
                {span.from + 1}–{span.to} OF {rows.length}
              </span>
              <span className="knob-pips" aria-hidden="true">
                {Array.from({ length: pages }, (_, i) => (
                  <i key={i} className={`knob-pip ${i === at ? "knob-pip-on" : ""}`} />
                ))}
              </span>
            </span>
            <button
              type="button"
              className="knob-arrow"
              data-nav-step="right"
              aria-label="Next page"
              onClick={() => flip(1)}
            >
              ›
            </button>
          </div>
        )}
      </div>
      <ol className="rsheet-rows" ref={listRef}>
        {shown.map((row) => (
          <Row key={row.id} row={row} yourCarId={yourCarId} />
        ))}
        {/* The last page is cut to the same height as the rest: a modal that
            changed height under the arrows would move the ways out with it. */}
        {Array.from({ length: perPage - shown.length }, (_, i) => (
          <li key={`blank-${i}`} className={`${ROW} is-blank`} aria-hidden="true" />
        ))}
      </ol>
    </div>
  );
}

function Row({ row, yourCarId }: { row: StandingsRow; yourCarId: string }) {
  const picture = portraitOf(carOf(row.id, yourCarId));
  // Under the alias: who is driving — and for the player's own row, which
  // car, because "You" under "YOU" says nothing twice.
  const line = row.you ? carById(yourCarId).name : row.driver;
  return (
    <li className={`${ROW}${row.you ? " is-you" : ""}${row.points === 0 ? " is-nought" : ""}`}>
      <span className="rsheet-pos">
        {row.tied ? "=" : ""}
        {row.place}
      </span>
      <span className="rsheet-car">{picture && <img src={picture} alt="" />}</span>
      <span className="rsheet-who">
        <span className="rsheet-alias">{row.alias.toUpperCase()}</span>
        <span className="rsheet-driver">{line}</span>
      </span>
      {/* The tie-break, and the line a campaign is remembered by. A crew who
          has not won a stage shows nothing rather than a nought: a zero in
          every row but two is a column of noise. */}
      <span className="rsheet-wins">
        {row.wins > 0 ? `${row.wins} WIN${row.wins === 1 ? "" : "S"}` : ""}
      </span>
      <span className="rsheet-total">{row.points}</span>
    </li>
  );
}

/** ORDER THE PICTURES AHEAD OF THE PRESS. A portrait is a real body built on
 * a stand, one per idle slot (car-portraits.ts), so a board that asks for
 * fifteen the moment it opens spends its first seconds as an empty column.
 * Called from the page the STANDINGS press is ON instead: a menu has nothing
 * else waiting on its idle slots, and by the time anybody presses it the roll
 * is full. Free after a run, which warmed the same keys on the grid.
 *
 * The rows are the location's table, so the same call covers whoever is on
 * it — the fourteen crews and the player's own car alike. */
export function warmStandings(rows: readonly StandingsRow[], yourCarId: string): void {
  warmPortraits(rows.map((row) => carOf(row.id, yourCarId)));
}

export type StandingsModalProps = StandingsSheetProps & {
  /** The board's name — the country whose table this is. */
  title: string;
  /** One line under it: how far into the location it has been driven. */
  sub: string;
  /** Anything the table is worth doing something ABOUT, between it and the
   * way out: the gate the location is still behind, and the press that tears
   * its points up. They belong to the table rather than to the page that
   * opens it — a board is where you go to read where you stand, and a page
   * of stage boxes has no row to spare for either. */
  foot?: ComponentChildren;
  onClose: () => void;
};

/** The board over the top of whatever opened it, with one way out. */
export function StandingsModal({ title, sub, foot, onClose, ...sheet }: StandingsModalProps) {
  return (
    <div className="hud-modal pointer-events-auto">
      <div className="hud-modal-card hud-modal-board">
        <div className="hud-modal-title">{title}</div>
        <div className="hud-modal-sub">{sub}</div>
        <StandingsSheet {...sheet} />
        {foot}
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
