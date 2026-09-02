// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RESULT SHEET, PAGED — the whole field on the results card, a page at a
// time, with a picture of every crew's car beside their name.
//
// It is the card's own table rather than a modal behind a button: where the
// run finished is the first thing a player wants off a results card, and
// finding their own row on the sheet is how they read it. So the sheet opens
// on the page with that row on it, lit, and two arrows walk the rest of the
// field — the same arrows, the same pips, that walk a value on the options
// page (menu-knobs.tsx), because a player who has learned one has learned
// the other.
//
// How many rows a page holds is the one thing here that gives with the
// screen (results-pages.ts): eight on a laptop, fewer on a phone held
// sideways, and never so few that the page stops being a table. The sheet
// measures the room the card leaves it and pages to fit — a row is a thumb's
// height and stays one, so it is the COUNT that moves, never the row.
//
// The pictures come off the roll (car-portraits.ts), shot ahead of the card
// while the stage was being driven; a row whose picture has not landed yet
// draws the space for it and fills in when it does.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { playUi } from "./audio/ui.ts";
import { onPortraits, portraitOf } from "./car-portraits.ts";
import {
  CARD_SHARE,
  PAGE_MAX,
  pageCount,
  pageOf,
  pageSpan,
  rowsPerPage,
  stepPage,
} from "./results-pages.ts";
import { formatTime } from "../lib/util.ts";
import { carById } from "@engine";

/** One line of the sheet. */
export type SheetRow = {
  place: number;
  /** What the timing screen calls them — one word wide. YOU for the player. */
  alias: string;
  driver: string;
  carId: string;
  /** The crew's id — with `number`, what their paint is read off. */
  crewId: string;
  number: number;
  /** Stage time; null for a crew who has none — retired, or still out. */
  time: number | null;
  /** Still on the road: the sheet is provisional and this row is OUT rather
   * than a retirement. */
  out: boolean;
  /** What the stage paid them, on a sheet played for points. */
  points?: number;
  /** …and what they have for the whole location. */
  total?: number;
  you: boolean;
};

export type ResultsSheetProps = {
  rows: readonly SheetRow[];
  /** Draw the PTS and TOTAL columns — a sheet played for points. Off on a
   * heads-up race, where places and times are the whole sheet. */
  board: boolean;
  /** The sheet's word, over its rows. */
  title: string;
};

/** The class every row wears, so the measurement below can find one. */
const ROW = "rsheet-row";

export function ResultsSheet({ rows, board, title }: ResultsSheetProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const [perPage, setPerPage] = useState(PAGE_MAX);
  const mine = rows.find((row) => row.you)?.place ?? 0;
  const [page, setPage] = useState(() => pageOf(mine, PAGE_MAX, rows.length));
  const pages = pageCount(rows.length, perPage);
  /** Whether the player has walked the pages themselves. Until they have,
   * the sheet keeps opening on their own row as the page is re-cut and as
   * the crews still out come home and move it; once they have, it stays
   * where they put it. */
  const touched = useRef(false);

  // THE MEASUREMENT. The card may take a share of the screen (`CARD_SHARE`,
  // restated as its `max-height`); everything on it that is not the rows —
  // the head, the ways on, the summary above or beside them, the padding —
  // is chrome the rows cannot have. What is left, at a row's own pitch, is
  // the page. Re-measured whenever the screen changes shape: a phone turned
  // on its side is a different page.
  useLayoutEffect(() => {
    const list = listRef.current;
    const card = list?.closest<HTMLElement>(".hud-finish");
    const screen = card?.parentElement;
    if (!list || !card || !screen) return;
    const measure = (): void => {
      const row = list.querySelector<HTMLElement>(`.${ROW}`);
      const column = list.closest<HTMLElement>(".fin-sheet");
      if (!row || !column) return;
      const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
      // Off the card's full content height rather than its box, so a card
      // already cut to the cap and scrolling measures the same as one that
      // fits.
      let chrome = card.scrollHeight - list.offsetHeight;
      // Beside a TALLER summary the column has room the card is not being
      // charged for: rows up to the summary's own height cost it nothing.
      const summary = card.querySelector<HTMLElement>(".fin-summary");
      if (
        summary &&
        Math.abs(summary.getBoundingClientRect().top - column.getBoundingClientRect().top) < 1
      ) {
        chrome -= Math.max(0, summary.offsetHeight - column.offsetHeight);
      }
      const room = screen.clientHeight * CARD_SHARE - chrome;
      setPerPage(rowsPerPage(room, row.offsetHeight, gap));
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(screen);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    if (!touched.current) setPage(pageOf(mine, perPage, rows.length));
  }, [perPage, mine, rows.length]);

  // The pictures land one at a time behind the card; each one is a redraw
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
    <div className={`rsheet ${board ? "" : "is-race"}`}>
      <div className="rsheet-head">
        <h3 className="knob-group-title">{title}</h3>
        {pages > 1 ? (
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
        ) : (
          <span className="rsheet-count">
            {rows.length} CAR{rows.length === 1 ? "" : "S"}
          </span>
        )}
      </div>
      <ol className="rsheet-rows" ref={listRef}>
        {shown.map((row) => (
          <Row key={row.crewId} row={row} board={board} />
        ))}
        {/* The last page is cut to the same height as the rest: a card that
            changed height under the arrows would move the ways on with it. */}
        {Array.from({ length: perPage - shown.length }, (_, i) => (
          <li key={`blank-${i}`} className={`${ROW} is-blank`} aria-hidden="true" />
        ))}
      </ol>
    </div>
  );
}

function Row({ row, board }: { row: SheetRow; board: boolean }) {
  const picture = portraitOf({
    carId: row.carId,
    crewId: row.crewId,
    number: row.number,
    you: row.you,
  });
  // Under the alias: who is driving — and for the player's own row, which
  // car, because "You" under "YOU" says nothing twice.
  const line = row.you ? carById(row.carId).name : row.driver;
  return (
    <li
      className={`${ROW}${row.you ? " is-you" : ""}${row.out ? " is-out" : ""}${row.time === null && !row.out ? " is-dnf" : ""}`}
    >
      <span className="rsheet-pos">{row.place}</span>
      <span className="rsheet-car">{picture && <img src={picture} alt="" />}</span>
      <span className="rsheet-who">
        <span className="rsheet-alias">{row.alias.toUpperCase()}</span>
        <span className="rsheet-driver">{line}</span>
      </span>
      <span className="rsheet-time">
        {row.out ? "OUT" : row.time === null ? "DNF" : formatTime(row.time)}
      </span>
      {board && <span className="rsheet-pts">{row.points ? `+${row.points}` : "–"}</span>}
      {board && <span className="rsheet-total">{row.total ?? 0}</span>}
    </li>
  );
}
