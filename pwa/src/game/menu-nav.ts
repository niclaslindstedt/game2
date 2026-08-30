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
// Four things ARE authored, because guessing them would be worse than
// asking: which containers are menus (ROOTS, most modal first), which
// control is a surface's way BACK (`data-nav-back`), which is its way ON
// (`data-nav-next` — what START presses), and where the cursor should be
// standing when the surface comes up (`data-nav-focus`, defaulting to the
// way on). The last two are what make a pad able to start a race by holding
// one button down: every surface names its own most likely press, and START
// takes it without the cursor having to be walked there first.
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
const ITEMS =
  "button:not([disabled]), [role='button']:not([aria-disabled='true']), a[href], input[type='range']:not([disabled])";

/** Where the cursor stands when a surface comes up. Falls back to the way
 * ON, and then to the first row that is not the way OUT — a cursor parked
 * on BACK is a cursor sitting on the one press nobody came here for. */
const FOCUS = "[data-nav-focus]";

/** The surface's way ON: the press a player who wants nothing else off this
 * screen would make. START takes it wherever the cursor happens to be, so
 * one button held down walks the front door → the ladder → the car → the
 * green light. A surface with no obvious next step marks none, and START
 * does nothing there rather than pressing something at random. */
const NEXT = "[data-nav-next]";

/** A VALUE CYCLED IN PLACE — an arrow either side of the car on its stand.
 * The pair is one stop on the cursor's walk rather than two: sideways moves
 * the value and leaves the cursor where it is, which is what an arrow
 * either side of something means to a thumb. `data-nav-steps` marks the
 * group, `data-nav-step="left" / "right"` the two arrows. */
const STEPS = "[data-nav-steps]";

const arrowIn = (group: Element, dir: NavDir): HTMLElement | null =>
  group.querySelector<HTMLElement>(`[data-nav-step="${dir}"]`);

const isRange = (el: Element): el is HTMLInputElement =>
  el instanceof HTMLInputElement && el.type === "range";

/** A slider, moved one notch and made to say so — sideways over a fader is
 * the fader moving, which is the same rule a stepper follows.
 *
 * The value has to go in through the PROTOTYPE's setter. React keeps its own
 * record of what an input last held, and it keeps it by replacing the
 * element's own `value` setter — so writing `el.value` updates that record
 * as a side effect, and the input event that follows looks to React like
 * nothing changed and is dropped on the floor. */
function nudgeRange(el: HTMLInputElement, by: number): void {
  const step = Number(el.step) || 1;
  const min = el.min === "" ? 0 : Number(el.min);
  const max = el.max === "" ? 100 : Number(el.max);
  const was = Number(el.value);
  const next = Math.min(max, Math.max(min, was + step * by));
  if (next === was) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(el, String(next));
  else el.value = String(next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * A surface that answers the directions ITSELF, marked with `data-nav-own`.
 *
 * Almost every card is a list of buttons and a cursor walking them, but the
 * initials entry is not: up and down there mean the LETTER, not the next
 * control, and a ring parked on one of three slots would be a second cursor
 * arguing with the caret. Such a surface gets each direction as a cancelable
 * `menu-nav` event on its own element, and cancelling it is how it says it
 * has dealt with the press. Anything it leaves alone falls through to the
 * cursor, so a card can own up and down and still have its buttons walked.
 */
const OWNED = "[data-nav-own]";

/** The event an owning surface listens for, and what rides on it. */
export const NAV_EVENT = "menu-nav";
export type MenuNavEvent = CustomEvent<{ dir: NavDir | "confirm" }>;

/** Hand a press to the surface. True when the surface took it. */
function offer(host: HTMLElement, dir: NavDir | "confirm"): boolean {
  if (!host.matches(OWNED)) return false;
  const sent = new CustomEvent(NAV_EVENT, { detail: { dir }, cancelable: true });
  host.dispatchEvent(sent);
  return sent.defaultPrevented;
}

export type MenuNav = {
  /** Move the cursor. Does nothing when no menu is on screen. */
  move: (dir: NavDir) => void;
  /** Press what the cursor is on. */
  confirm: () => void;
  /** Take the surface's way ON — its `data-nav-next` control — whatever the
   * cursor is sitting on. Silent on a surface that has no next step. */
  next: () => void;
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

  /** The cursor's stops on this surface, in reading order. A stepper group
   * collapses to ONE stop — its forward arrow, so a press on it means the
   * next car rather than the last one. */
  const items = (host: HTMLElement): HTMLElement[] => {
    const list: HTMLElement[] = [];
    const groups = new Set<Element>();
    for (const el of host.querySelectorAll<HTMLElement>(ITEMS)) {
      if (!visible(el)) continue;
      const group = el.closest<HTMLElement>(STEPS);
      if (!group) {
        list.push(el);
        continue;
      }
      if (groups.has(group)) continue;
      groups.add(group);
      list.push(arrowIn(group, "right") ?? el);
    }
    return list;
  };

  /** Where a surface puts the cursor when it comes up. */
  const landing = (host: HTMLElement): HTMLElement | undefined => {
    const list = items(host);
    // `contains` as well as identity, so a page can mark a whole control —
    // the car on its stand — rather than having to know which of its
    // buttons the cursor collapses onto.
    const aim = host.querySelector<HTMLElement>(FOCUS) ?? host.querySelector<HTMLElement>(NEXT);
    const marked = aim ? list.find((item) => item === aim || aim.contains(item)) : undefined;
    return marked ?? list.find((item) => !item.hasAttribute("data-nav-back")) ?? list[0];
  };

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
    // The ring goes round the whole stepper where there is one: a glow on
    // the right-hand arrow alone says the arrow is selected, when what is
    // selected is the car between the two of them.
    (item.closest<HTMLElement>(STEPS) ?? item).classList.add(CURSOR);
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
      // A surface that owns the directions draws its own place — the caret
      // on the initials card. Putting a ring on its first button as well
      // would be two cursors on one card.
      if (host.matches(OWNED)) return clearRing();
      put(landing(host), false);
    },
    move: (dir) => {
      const host = root();
      if (!host) return;
      if (offer(host, dir)) return;
      const list = items(host);
      if (list.length === 0) return;
      const from = at(list);
      // Off the card entirely — the first press brings the cursor back
      // rather than jumping somewhere the player never put it.
      if (from < 0) return put(landing(host), true);
      // A stepper answers sideways itself, and the cursor stays on it: left
      // and right over the car on its stand are the previous and the next
      // car, not a walk onto whatever is beside the stand.
      const sideways = dir === "left" || dir === "right";
      const group = list[from].closest<HTMLElement>(STEPS);
      const arrow = group && sideways ? arrowIn(group, dir) : null;
      if (arrow) {
        arrow.click();
        playUi("move");
        return;
      }
      // A fader is the same idea with no arrows drawn on it. No tick from
      // here: the row hears its own input event and makes the noise, so one
      // raised here as well would be two clicks for one notch.
      if (sideways && isRange(list[from])) {
        nudgeRange(list[from], dir === "right" ? 1 : -1);
        return;
      }
      const next = pickNeighbour(list.map(rectOf), from, dir);
      if (next !== null && next !== from) put(list[next], true);
    },
    confirm: () => {
      const host = root();
      if (!host) return;
      if (offer(host, "confirm")) return;
      const list = items(host);
      const from = at(list);
      if (from >= 0) list[from].click();
      // A card with nothing to land on is still a card that has to be got
      // past — the studio card is a whole screen that answers to any press.
      else if (list.length === 0) host.click();
      else put(landing(host), true);
    },
    next: () => {
      const host = root();
      if (!host) return;
      const on = host.querySelector<HTMLElement>(NEXT);
      if (on) on.click();
      // Same rule confirm follows, for the same card: the studio cover has
      // no way on to mark and answers to any press at all, START included.
      else if (items(host).length === 0) host.click();
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

/** A stop's box, as the player reads it: a stepper is measured across the
 * whole group, so DOWN off the car leaves from under the car and not from
 * under the arrow on its right. */
function rectOf(el: HTMLElement): NavRect {
  const box = (el.closest<HTMLElement>(STEPS) ?? el).getBoundingClientRect();
  return { x: box.left, y: box.top, w: box.width, h: box.height };
}
