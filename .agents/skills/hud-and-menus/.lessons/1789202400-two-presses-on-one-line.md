---
title: Two presses on one card line want a three-column grid, not a spread row — the way out is centred on the CARD
date: 2026-09-07
scope: pwa/src/styles.css, pwa/src/game/results-table.tsx
concepts: [menus, modals, css, layout, ui]
---

A card whose bottom line carries the way out plus one other press cannot lay
that line out with `justify-content: space-between` or a centred flex row:
either one centres the way out between its NEIGHBOURS, so it slides sideways
the moment the other press changes width — and the other press on this card is
a confirm that grows from `RESET` into a whole sentence (`SURE? THE POINTS
GO`) under the thumb.

`grid-template-columns: 1fr auto 1fr` centres the middle cell on the CARD
instead, with the side press `justify-self: start` in the first. It only
moves if a press is wider than its own share, and it degrades by WRAPPING
rather than by overlapping — which is what an absolutely-positioned side
press does on a 320px screen. Give such a press a tight `line-height`, since
a wrapped confirm is the normal narrow-screen state, not a bug.

The matching structural call: split the card's foot by what each half is FOR
— a slot for what is READ (a gate, a hint), on its own line under the rows,
and a slot for what is PRESSED, in that ways-out row. One `foot` prop holding
both is what stacked them in the first place.

Nothing measures this by hand: `card-rows.ts` reads the card's chrome live
(`box.scrollHeight - list.offsetHeight`), so a foot that loses a line hands
its room straight back to the table's page.
