---
title: Block-element glyphs (▁▂▃▄▅▆▇█) get a per-glyph font fallback in the menus — without an explicit cell width a column of them does not line up
date: 2026-09-07
scope: pwa/src/styles.css, pwa/src/game/
concepts: [css, ui, menus, glyphs, review]
---

A ladder of block elements is a good way to put a setting on a line beside a
number — one character a row, cheapest `▁` to dearest `█`, and the row that
moved one setting is the line with one bar at a different height. It only
works if the bars sit in a GRID, and by default they do not.

The menu's face is an oblique condensed one and carries none of U+2581–2588,
so each glyph is substituted individually from whatever the browser finds.
The fallbacks give the low bars a narrow advance and the full block a wide
one, and `font-family: ui-monospace, …` on the parent does not fix it —
headless Chromium (and any machine without those faces installed) falls back
again per glyph. The result reads fine on one row and wrong down a list: one
run's code ends where the next run's third bar starts, which is exactly the
comparison the code existed to make.

Give the glyph its own span and a fixed cell:

```css
.bench-rung {
  display: inline-block;
  width: 0.8em;
  text-align: center;
}
```

`.bench-run-code` in `styles.css` is the shipped example. The same applies to
any per-character ladder in a menu — a `letter-spacing` will not do it,
because the problem is the advance and not the gap.

Judge it by LOOKING at three rows whose codes differ, not at one: a single
code has nothing to fail to line up with.
