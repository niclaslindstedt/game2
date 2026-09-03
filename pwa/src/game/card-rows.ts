// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW MANY ROWS FIT ON THE RESULTS CARD — the measurement both of the card's
// tables make, in one place.
//
// The finish card holds a table beside its summary: the field's result sheet
// after a campaign or a race (results-sheet.tsx), the stage's high score
// board after a time trial (score-board.tsx). Neither may scroll — a card
// whose way out has to be scrolled to is a card the player is stuck on — so
// both PAGE to fit, and both have to answer the same question first: how
// much room is there, once everything on the card that is not rows has taken
// its share?
//
// A THIRD table asks it off a different card: the campaign's location board
// (results-table.tsx), in a modal over the stage grid. Same question, same
// answer — which is why the card is a selector rather than this file's own
// assumption.
//
// The arithmetic of pages is `results-pages.ts`, which is DOM-free and
// tested. This is the half that has to read a live layout, and it is a hook
// rather than a helper because the answer changes whenever the screen does:
// a phone turned on its side is a different page.

import { useLayoutEffect, useState } from "react";

import { CARD_SHARE, PAGE_MAX, PAGE_MIN, rowsPerPage } from "./results-pages.ts";
import type { RefObject } from "react";

/** A card's `max-height` in pixels: a px length as itself, a percentage
 * against the screen it is a percentage of, and anything else — `none`, a
 * `calc` a browser did not resolve — as the share the stylesheet's own cap
 * is written to. */
function capOf(maxHeight: string, screen: number): number {
  const value = parseFloat(maxHeight);
  if (!Number.isFinite(value)) return screen * CARD_SHARE;
  if (maxHeight.endsWith("px")) return value;
  if (maxHeight.endsWith("%")) return (screen * value) / 100;
  return screen * CARD_SHARE;
}

/**
 * Rows a page of `listRef` may hold, re-measured whenever the screen changes
 * shape. `listRef` is the `<ol>` of rows and its FIRST child is measured as
 * the row — which is the tallest one on a table whose rows differ (the high
 * score board's podium stands higher than the places under it), so the count
 * comes back conservative and a page can leave a little air but never put a
 * row under the fold. Anything that starts measuring an average instead has
 * to answer for the row it clips.
 *
 * `column` is the selector of the card column the list sits in, which is what
 * lets a table beside a TALLER summary use the room the summary is already
 * paying for.
 *
 * `min` is the page's own floor. It is `PAGE_MIN` for a table being READ,
 * where fewer rows than that is no longer a table; a caller whose page has
 * ONE row that has to be on screen — the high score board while a name is
 * being typed into it — lowers it, because a floor that does not fit is a
 * floor that hangs half a row under the fold.
 *
 * `card` is the selector of the card the rows are ON — what the page is cut
 * to the height of, and what the `max-height` is read from. The results card
 * by default; the campaign's location board is the same table in a modal.
 */
export function useCardRows(
  listRef: RefObject<HTMLElement | null>,
  column: string,
  min = PAGE_MIN,
  card = ".hud-finish",
): number {
  const [perPage, setPerPage] = useState(PAGE_MAX);

  useLayoutEffect(() => {
    const list = listRef.current;
    const box = list?.closest<HTMLElement>(card);
    const screen = box?.parentElement;
    if (!list || !box || !screen) return;
    const measure = (): void => {
      const row = list.firstElementChild;
      const side = list.closest<HTMLElement>(column);
      if (!(row instanceof HTMLElement) || !side) return;
      const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
      // Everything on the card that is not the rows — the head, the ways on,
      // the summary above or beside them, the padding — is chrome the rows
      // cannot have. Off the card's full content height rather than its box,
      // so a card already cut to the cap and scrolling measures the same as
      // one that fits.
      let chrome = box.scrollHeight - list.offsetHeight;
      // Beside a TALLER summary the column has room the card is not being
      // charged for: rows up to the summary's own height cost it nothing.
      const summary = box.querySelector<HTMLElement>(".fin-summary");
      if (
        summary &&
        Math.abs(summary.getBoundingClientRect().top - side.getBoundingClientRect().top) < 1
      ) {
        chrome -= Math.max(0, summary.offsetHeight - side.offsetHeight);
      }
      // HOW TALL THE CARD IS ALLOWED TO BE, read off the card rather than
      // recomputed: the stylesheet caps it at a share of the screen, and it
      // caps it TIGHTER while a name is being entered, so a soft keyboard
      // cannot cover the letters. A page cut to the untightened cap hangs a
      // row and a half below the fold.
      // A percentage max-height comes back as a PERCENTAGE, not as the used
      // px value — reading `parseFloat` off it and calling the answer pixels
      // makes an 86%-of-the-screen card 86 pixels tall, which pages every
      // table in the game down to its floor. Resolve it against the screen
      // the percentage is of; `CARD_SHARE` covers a cap that is neither.
      // …against the screen's CONTENT box, which is what a percentage cap is
      // a percentage OF: a screen that pads itself (the modal does, the HUD's
      // centre column does not) has that much less to give away.
      const pad = getComputedStyle(screen);
      const inner =
        screen.clientHeight -
        (parseFloat(pad.paddingTop) || 0) -
        (parseFloat(pad.paddingBottom) || 0);
      const room = capOf(getComputedStyle(box).maxHeight, inner) - chrome;
      setPerPage(rowsPerPage(room, row.offsetHeight, gap, PAGE_MAX, min));
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(screen);
    return () => watch.disconnect();
  }, [listRef, column, min, card]);

  return perPage;
}
