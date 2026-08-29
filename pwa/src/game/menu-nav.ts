// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Walking a menu on a controller. A pad that can drive but cannot pick a
// stage is half a pad, and on a handheld running this as an installed PWA
// there may be no mouse and no wish to reach past the sticks for the glass.
//
// It is deliberately GENERIC rather than a cursor each card carries: every
// menu surface in this app is already built out of real `<button>`s laid out
// by CSS, so the cursor reads the layout that is actually on screen and moves
// to the nearest thing in the direction asked for. A page added tomorrow is
// navigable the day it is written, with nothing to remember.
//
// Two things ARE authored, because guessing them would be worse than asking:
// which containers are menus (ROOTS, most modal first), and which control is
// a surface's way BACK (`data-nav-back`).
//
// Where the cursor GOES is menu-cursor.ts next door — a pure function over
// rectangles, DOM-free so the tests can read it. This file is the half that
// has to ask a browser what is on screen.

import { playUi } from "./audio/ui.ts";
import { pickNeighbour, type NavDir, type NavRect } from "./menu-cursor.ts";

/** The menu surfaces, MOST MODAL FIRST. The first one on screen owns the
 * cursor — the results sheet sits over the finish card, the initials card
 * over the same, and the pause card over the run. */
const ROOTS = [
  ".hud-modal-card",
  ".hud-initials",
  ".hud-menu",
  ".menu-card",
  ".roam",
  ".hud-finish",
  ".splash",
];

/** What the cursor may land on. Everything the menus are built from is a
 * button; the rest of the list is there so a surface that grows a real
 * control of another kind is not silently skipped. */
const ITEMS = "button:not([disabled]), [role='button']:not([aria-disabled='true']), a[href]";

export type MenuNav = {
  /** Move the cursor. Does nothing when no menu is on screen. */
  move: (dir: NavDir) => void;
  /** Press what the cursor is on. */
  confirm: () => void;
  /** The surface's own way back — its `data-nav-back` control. Silent on a
   * surface that has none, which is a card the player has to answer. */
  back: () => void;
  /** Whether a menu surface is on screen at all. Cheap; called every frame. */
  active: () => boolean;
  /** Put the cursor somewhere sensible if a new surface has come up, and
   * take it away when the last one goes. Called every frame while a pad is
   * connected — it does nothing at all until the surface CHANGES, because a
   * focus ring that reappears under the mouse is somebody else's cursor
   * moving on its own. */
  sync: () => void;
};

export function createMenuNav(): MenuNav {
  /** The surface the cursor was last put into, so `sync` can tell a new card
   * from the same card re-rendering. */
  let seen: Element | null = null;

  const root = (): HTMLElement | null => {
    if (typeof document === "undefined") return null;
    for (const selector of ROOTS) {
      const found = document.querySelector<HTMLElement>(selector);
      if (found && visible(found)) return found;
    }
    return null;
  };

  const items = (host: HTMLElement): HTMLElement[] =>
    [...host.querySelectorAll<HTMLElement>(ITEMS)].filter(visible);

  /** Where the cursor is, as an index into `list` — −1 when it is nowhere,
   * which is what a fresh card and a click on the backdrop both look like. */
  const at = (list: HTMLElement[]): number => list.indexOf(document.activeElement as HTMLElement);

  /** The ring is a CLASS this module owns rather than `:focus-visible`.
   * Browsers decide that one from how the last press ARRIVED, and a
   * controller arrives as nothing at all — the ring would come and go by
   * heuristic on the one input that has nowhere else to look. */
  const put = (item: HTMLElement | undefined, sound: boolean): void => {
    if (!item) return;
    clearRing();
    item.classList.add(CURSOR);
    item.focus({ preventScroll: true });
    // A long card — the CONTROLS tab is twenty rows — has to follow the
    // cursor, or it walks off the bottom of the screen and out of sight.
    item.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (sound) playUi("move");
  };

  return {
    active: () => root() !== null,
    sync: () => {
      const host = root();
      if (host === seen) return;
      seen = host;
      if (!host) {
        // The card is gone. Drop the ring with it: a run driven with a
        // cursor still glowing on a button nobody can see is a bug report.
        clearRing();
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }
      put(items(host)[0], false);
    },
    move: (dir) => {
      const host = root();
      if (!host) return;
      const list = items(host);
      if (list.length === 0) return;
      const from = at(list);
      // Off the card entirely — the first press brings the cursor back
      // rather than jumping somewhere the player never put it.
      if (from < 0) return put(list[0], true);
      const next = pickNeighbour(list.map(rectOf), from, dir);
      if (next !== null && next !== from) put(list[next], true);
    },
    confirm: () => {
      const host = root();
      if (!host) return;
      const list = items(host);
      const from = at(list);
      if (from >= 0) list[from].click();
      // A card with nothing to land on is still a card that has to be got
      // past — the studio card is a whole screen that answers to any press.
      else if (list.length === 0) host.click();
      else put(list[0], true);
    },
    back: () => {
      const host = root();
      const out = host?.querySelector<HTMLElement>("[data-nav-back]");
      if (out) out.click();
    },
  };
}

/** The class the cursor wears, and the one styles.css draws the ring on. */
const CURSOR = "nav-cursor";

function clearRing(): void {
  for (const worn of document.querySelectorAll(`.${CURSOR}`)) worn.classList.remove(CURSOR);
}

/** Laid out and on screen. `getClientRects` is the honest test: it is empty
 * for anything `display: none`, and for anything with no box at all. */
function visible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function rectOf(el: HTMLElement): NavRect {
  const box = el.getBoundingClientRect();
  return { x: box.left, y: box.top, w: box.width, h: box.height };
}
