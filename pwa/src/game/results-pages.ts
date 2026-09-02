// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RESULT SHEET'S PAGES — how many rows a page holds, and which page a
// place is on. DOM-free: the sheet (results-sheet.tsx) measures the room it
// has and asks here; the tests ask the same questions with numbers.
//
// A fifteen-crew field does not fit on a results card that also has to hold
// the headline, the time and the ways on — least of all on a phone held
// sideways, where the whole screen is 390 px tall. So the sheet is PAGED:
// eight rows to a page where there is room for eight, fewer where there is
// not, and two arrows to walk it. The row count is the one thing that gives
// with the screen; a row itself never shrinks below a thumb's height.

/** Rows on a page where there is room for them. Eight is the most a table
 * can be scanned as a table rather than read as a list, and it holds the
 * podium and the chasing pack on the first page of a fifteen-car field. */
export const PAGE_MAX = 8;

/** …and the fewest a page is ever cut to. Below three the page is not a
 * table any more — it is a row with neighbours — and the card would rather
 * scroll than go there. */
export const PAGE_MIN = 3;

/** How much of the screen's height the finish card may take. Restated in
 * `styles.css` as `.hud-finish { max-height: 86% }` — the card is sized by
 * the stylesheet and the page by this, and if the two disagree the sheet
 * either clips its last row or leaves a row's worth of air under itself. */
export const CARD_SHARE = 0.86;

/** How many rows of `row` pixels, `gap` pixels apart, fit in `room` pixels.
 * Clamped to the page bounds: a negative room — a card whose chrome alone
 * outruns the screen — still pages by the floor, and the card scrolls the
 * rest. */
export function rowsPerPage(
  room: number,
  row: number,
  gap = 0,
  max = PAGE_MAX,
  min = PAGE_MIN,
): number {
  if (!(row > 0)) return max;
  // `n` rows stand `n * row + (n - 1) * gap` tall: the gap after the LAST
  // row is not spent, so it is handed back before the division.
  const fit = Math.floor((room + gap) / (row + gap));
  return Math.max(min, Math.min(max, fit));
}

/** Pages a sheet of `rows` splits into at `perPage` — never fewer than one,
 * so an empty sheet still has a page to stand on. */
export function pageCount(rows: number, perPage: number): number {
  return Math.max(1, Math.ceil(rows / Math.max(1, perPage)));
}

/** The 0-based page that holds `place` (1-based): the page a sheet opens on
 * is the one with the player's own row on it, because finding that row is
 * the first thing anybody does with a results sheet. A place off the sheet
 * lands on the first page. */
export function pageOf(place: number, perPage: number, rows: number): number {
  if (place < 1 || place > rows) return 0;
  return Math.min(pageCount(rows, perPage) - 1, Math.floor((place - 1) / Math.max(1, perPage)));
}

/** The rows on page `page` — `[from, to)` indices into the sheet. */
export function pageSpan(
  page: number,
  perPage: number,
  rows: number,
): { from: number; to: number } {
  const pages = pageCount(rows, perPage);
  const at = Math.max(0, Math.min(pages - 1, page));
  const from = at * perPage;
  return { from, to: Math.min(rows, from + perPage) };
}

/** Step `page` by `by`, wrapping at both ends: an arrow that does nothing at
 * the end of the sheet reads as an arrow that has stopped working. */
export function stepPage(page: number, by: number, pages: number): number {
  if (pages <= 0) return 0;
  // Twice round, so a step off the front lands on the back rather than on
  // a negative page — and a `-0` off the remainder is folded back to 0.
  return ((((page + by) % pages) + pages) % pages) + 0;
}
