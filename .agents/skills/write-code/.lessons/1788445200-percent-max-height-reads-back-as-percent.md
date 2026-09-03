---
title: A percentage `max-height` read back with getComputedStyle comes back as a PERCENTAGE — parseFloat makes 86% into 86 pixels
date: 2026-09-03
scope: pwa/src/game/card-rows.ts, pwa/src/game/
concepts: [css, dom, measurement, responsive, layout]
---

Anything that sizes itself against a card's own cap has to resolve that cap,
and the obvious `parseFloat(getComputedStyle(card).maxHeight)` is a trap:
browsers return the SPECIFIED value for a percentage max-height, not the used
px. So `max-height: 86%` reads back as the string `"86%"`, `parseFloat` gives
`86`, and the caller believes the card is 86 pixels tall. In
`card-rows.ts` that paged every table on the results card down to its floor —
one row where seven fit — with no error anywhere, on every viewport at once.

Read the unit before trusting the number: px as itself, `%` multiplied by the
element the percentage is against, anything else (`none`, an unresolved
`calc`) falling back to a stated share. `capOf` in `card-rows.ts` is that
three-way read; use it rather than re-deriving one.

The symptom is worth recognising on its own, because it does not look like a
units bug: a layout that is correct at one viewport and collapses to its
minimum at ALL of them, having previously worked, usually means a measurement
started reading a length it did not resolve.
