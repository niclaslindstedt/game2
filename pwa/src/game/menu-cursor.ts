// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the menu cursor goes next — the geometry alone, over rectangles.
//
// DOM-free, and split out from menu-nav.ts for exactly the reason
// thumb-guard.ts is split out from the HUD: the root test suite has no
// browser, and this is the half worth testing. Lay a card out on paper, ask
// for DOWN, and check the cursor lands where a thumb expects.

export type NavRect = { x: number; y: number; w: number; h: number };
export type NavDir = "up" | "down" | "left" | "right";

/** How much a miss ACROSS the direction of travel costs, against a metre
 * along it. Above 1 so a cursor going down prefers the row underneath to a
 * nearer button off to one side — which is what "down" means to a player
 * looking at a column of rows. */
const CROSS_COST = 2.5;

const centre = (r: NavRect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The gap between two spans on one axis, 0 when they overlap. Two rows that
 * share a column of screen are lined up whatever their centres say, and
 * that is the thing a player is actually reading. */
function gap(aMin: number, aSize: number, bMin: number, bSize: number): number {
  if (aMin + aSize <= bMin) return bMin - (aMin + aSize);
  if (bMin + bSize <= aMin) return aMin - (bMin + bSize);
  return 0;
}

/**
 * The item the cursor should move to, or null when there is nowhere to go.
 *
 * Candidates are the items whose centre lies beyond the current one along
 * the direction asked for, and they are taken in TWO TIERS: first the ones
 * that also share screen ACROSS that direction, then everything else. The
 * tiers are the whole trick. A card is a column of rows, some of which hold
 * a pair of buttons side by side, and a full-width row above happens to have
 * its centre to the RIGHT of the left button of such a pair — so a plain
 * "cheapest by distance" walk answers RIGHT with the row above. Requiring a
 * shared line first is what makes right mean the button next to this one,
 * and the second tier is what still gets a cursor out of a grid's last
 * column.
 *
 * With nothing ahead the cursor WRAPS to the far end — a list that stops
 * dead at the bottom makes a player walk all the way back up to reach the
 * button under their thumb.
 */
export function pickNeighbour(rects: NavRect[], from: number, dir: NavDir): number | null {
  const here = rects[from];
  if (!here) return rects.length > 0 ? 0 : null;
  const vertical = dir === "up" || dir === "down";
  const sign = dir === "down" || dir === "right" ? 1 : -1;
  const along = (r: NavRect): number => (vertical ? centre(r).y : centre(r).x);
  const across = (a: NavRect, b: NavRect): number =>
    vertical ? gap(a.x, a.w, b.x, b.w) : gap(a.y, a.h, b.y, b.h);

  let inline: number | null = null;
  let inlineCost = Infinity;
  let aside: number | null = null;
  let asideCost = Infinity;
  let wrap: number | null = null;
  let wrapCost = Infinity;
  for (const [index, rect] of rects.entries()) {
    if (index === from) continue;
    const step = (along(rect) - along(here)) * sign;
    const miss = across(here, rect);
    const cost = step + miss * CROSS_COST;
    if (step <= 0.5) {
      // Everything behind is a wrap candidate, and the FURTHEST behind wins —
      // going down off the bottom lands on the top row, not the one above.
      if (cost < wrapCost) {
        wrapCost = cost;
        wrap = index;
      }
      continue;
    }
    if (miss === 0) {
      if (cost < inlineCost) {
        inlineCost = cost;
        inline = index;
      }
    } else if (cost < asideCost) {
      asideCost = cost;
      aside = index;
    }
  }
  return inline ?? aside ?? wrap;
}
