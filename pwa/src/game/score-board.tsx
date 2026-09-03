// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOARD, DRAWN — a stage's ten best runs, on the one screen that shows
// them: the results card, the moment a run has landed on it. A board is an
// invitation to beat a time, and an invitation is worth something with the
// road still in your hands and worth nothing read cold off a menu.
//
// `ScoreSheet` is deliberately the card's other table wearing the same
// clothes (results-sheet.tsx): a picture of the car, the name over what set
// the time, the time on the right, paged to fit with the same arrows. A run
// that ends in the campaign and a run that ends in a time trial should not
// land on two different-looking cards.
//
// What a row SAYS, on the sheet, is the trial's whole argument: a time is
// only an achievement next to the car it was set in and the difficulty it
// was set at (which is what a hit cost that car — `damageScaleFor`). Without
// those, the top row is a number nobody can answer.
//
// Rows the board does not have yet are drawn as EMPTY rather than left out.
// A table that grows from nothing says "there is nothing here"; ten dotted
// rows say "there are ten places and nine of them are free", which is the
// invitation, and it is why every cabinet drew them that way.

import { useEffect, useRef, useState } from "react";

import { playUi } from "./audio/ui.ts";
import { useCardRows } from "./card-rows.ts";
import { portraitOf } from "./car-portraits.ts";
import { InitialsHint, InitialsSlots, type Initials } from "./hud-initials.tsx";
import { pageCount, pageOf, pageSpan, stepPage } from "./results-pages.ts";
import { ROW } from "./results-sheet.tsx";
import { BOARD_SIZE, type ScoreEntry } from "./scores.ts";
import { formatDay, formatTime } from "../lib/util.ts";
import { carById } from "@engine";

/** The fewest rows a page of the board is ever cut to — HALF THE BOARD, and
 * higher than the result sheet's own floor on purpose. A sheet of fifteen
 * crews is a table you page through; ten places is a table you are supposed
 * to read at once, and three of them tells a player nothing about what they
 * are chasing. The card is sized to hold these (`styles.css`); a screen too
 * short even for five gives up its bottom edge rather than its board. */
const PAGE_FLOOR = 5;

export type ScoreSheetProps = {
  entries: readonly ScoreEntry[];
  /** The run that has just landed — 1-based, 0 when it missed the board. */
  highlight: number;
  /** THE RUN STILL BEING NAMED. Its row is spliced onto the board at
   * `highlight`, pushing everything it beat down a place, and the name cell
   * of that row is the three slots — so the letters are typed onto the board
   * they are being written into. Null once the name is in, and on a run that
   * never made the ten. */
  entering: {
    /** The row as it will be stored, bar the name being typed into it. */
    run: Omit<ScoreEntry, "who">;
    /** The letters themselves. They are the CARD's (hud-finish.tsx), because
     * every press that ends the card has to be able to post them. */
    initials: Initials;
  } | null;
};

/** THE BOARD ON THE RESULTS CARD. Always `BOARD_SIZE` places whatever the
 * board holds, because the free ones are the invitation; paged where the
 * screen cannot show them all at once, so the card never asks a player to
 * scroll past their own row to find the way off it. */
export function ScoreSheet({ entries, highlight, entering }: ScoreSheetProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const perPage = useCardRows(listRef, ".fin-sheet", PAGE_FLOOR);
  const [page, setPage] = useState(() => pageOf(highlight, perPage, BOARD_SIZE));
  const pages = pageCount(BOARD_SIZE, perPage);
  /** Whether the player has walked the pages themselves. Until they have,
   * the board keeps opening on their own row as the page is re-cut; once
   * they have, it stays where they put it. */
  const touched = useRef(false);

  // THE BOARD AS IT WILL BE. A run waiting on its name is not stored yet, so
  // it is put where its time puts it and the rows it beat move down one —
  // which is the whole reason to type into the board rather than beside it:
  // the ten places already say what this run has done to them.
  const places: (ScoreEntry | null)[] = Array.from({ length: BOARD_SIZE }, (_, i) => {
    if (!entering) return entries[i] ?? null;
    if (i === highlight - 1) return { ...entering.run, who: "" };
    return (i < highlight - 1 ? entries[i] : entries[i - 1]) ?? null;
  });

  // The page is cut to the room the card has, and the room changes — a phone
  // turned on its side pages a board that fitted on one screen into three. So
  // the board keeps re-opening on the player's own row until they walk it
  // themselves; without this a run that placed fourth on a three-row page
  // opens on a page it is not on, and while a name is being typed that is the
  // row with the letters in it.
  useEffect(() => {
    if (!touched.current) setPage(pageOf(highlight, perPage, BOARD_SIZE));
  }, [perPage, highlight]);

  const at = Math.min(page, pages - 1);
  const span = pageSpan(at, perPage, BOARD_SIZE);
  const flip = (by: number): void => {
    playUi("move");
    touched.current = true;
    setPage(stepPage(at, by, pages));
  };

  return (
    // While a name is being entered the board IS the entry: the element a
    // pad's directions are taken off is the one holding the slots, and that
    // is this one (`data-nav-own`, menu-nav.ts).
    <div
      className={`rsheet is-board${entering ? " hud-initials pointer-events-auto" : ""}`}
      ref={entering ? entering.initials.cardRef : undefined}
      data-nav-own={entering ? true : undefined}
    >
      <div className="rsheet-head">
        <h3 className="knob-group-title">{entering ? "ENTER YOUR INITIALS" : "BEST TIMES"}</h3>
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
                {span.from + 1}–{span.to} OF {BOARD_SIZE}
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
          <span className="rsheet-count">TOP {BOARD_SIZE}</span>
        )}
      </div>
      <ol className="rsheet-rows" ref={listRef}>
        {Array.from({ length: span.to - span.from }, (_, i) => {
          const place = span.from + i + 1;
          return (
            <BoardRow
              key={place}
              place={place}
              entry={places[place - 1] ?? undefined}
              you={place === highlight}
              slots={entering && place === highlight ? entering.initials : null}
            />
          );
        })}
      </ol>
      {entering && <InitialsHint initials={entering.initials} />}
    </div>
  );
}

/** What the top three places are worth WEARING. The board is the trial's
 * podium — there is no field to stand on one — so the three rows that own it
 * are struck rather than merely listed, and the rest of the ten are the
 * places still going. A free place wears nothing: a medal nobody has won is
 * not a medal. */
const MEDALS = ["is-gold", "is-silver", "is-bronze"];

function BoardRow({
  place,
  entry,
  you,
  slots,
}: {
  place: number;
  entry: ScoreEntry | undefined;
  you: boolean;
  /** Set on the ONE row whose name is still being typed — the letters stand
   * in its name cell instead of a stored name. */
  slots: Initials | null;
}) {
  // A free place is drawn with the row's own chrome and nothing in it: the
  // shape of the table is the invitation, so it has to hold its height.
  if (!entry) {
    return (
      <li className={`${ROW} is-free`}>
        <span className="rsheet-pos">{place}</span>
        <span className="rsheet-car" />
        <span className="rsheet-who">
          <span className="rsheet-alias">···</span>
        </span>
        <span className="rsheet-time">--·--</span>
      </li>
    );
  }
  // The picture is the player's own car in its catalog paint: every row on a
  // board is a run driven from this seat, whoever typed their name on it.
  const picture = entry.carId
    ? portraitOf({ carId: entry.carId, crewId: "", number: 0, you: true })
    : null;
  // What the time was set WITH and UNDER, on one line, in the order a player
  // would ask: which car, what a hit cost, and when. Anything the row does
  // not know is left out rather than guessed at — and the line is cut from
  // the right on a narrow screen, so the date is what goes first.
  const said = [
    entry.carId ? carById(entry.carId).name.toUpperCase() : null,
    entry.difficulty?.toUpperCase(),
    formatDay(entry.at),
  ].filter((word): word is string => Boolean(word));
  const medal = MEDALS[place - 1] ?? "";
  return (
    <li
      className={`${ROW}${medal ? ` is-medalled ${medal}` : ""}${you ? " is-you" : ""}${slots ? " is-naming" : ""}`}
    >
      <span className={`rsheet-pos${medal ? ` is-medal ${medal}` : ""}`}>{place}</span>
      <span className="rsheet-car">
        {picture && <img src={picture} alt="" />}
        {/* The BOX, as a plate on the car's own picture — two letters where
            the word would have cost the line its date, and stamped on the
            thing it is a fact about rather than listed away from it. */}
        {entry.gearbox && (
          <span className="rsheet-box">{entry.gearbox === "manual" ? "MT" : "AT"}</span>
        )}
      </span>
      <span className="rsheet-who">
        {slots ? (
          <InitialsSlots initials={slots} />
        ) : (
          <span className="rsheet-alias">{entry.who}</span>
        )}
        <span className="rsheet-driver">{said.join(" · ")}</span>
      </span>
      <span className="rsheet-time">{formatTime(entry.time)}</span>
    </li>
  );
}
