---
title: A plate's reserved band must be MEASURED, not assumed off its icon — the text wins at the top of the clamps
date: 2026-09-11
scope: pwa/src/styles.css
concepts: [hud, css, layout, measurement]
---

The `.hud` stack reserves a band per instrument, each `calc()`ed off "what it
holds". For a plate that is an icon beside some words the obvious sum is the
icon — `--pace-sign` — plus the padding. That is wrong at the top of the
clamps: the sign is `clamp(2.4rem, 9vmin, 4.2rem)` and the text is
`clamp(1.1rem, 4.5vmin, 2.1rem)` carrying the page's body leading (1.5), so a
two-line text block comes out TALLER than the sign on a desktop viewport and
shorter on a phone. `--alert-height` was 7 px short at 1920x1080 and 1280x720
while looking correct at 844x390 — i.e. the size you are least likely to check
is the one it fails at.

Two fixes, and take both: set the leading explicitly on a multi-line plate
(`line-height: 1.15` — the body default is for paragraphs and looks loose on
display type anyway), which puts the icon back in charge of the height at every
size; then MEASURE rather than believe it.

Measuring is a two-gotcha job:

- `getComputedStyle(el).getPropertyValue('--x')` on a custom property returns
  the unresolved token stream (`calc(var(--pace-sign) + 1.1rem)`), not a px
  figure. Append a throwaway element with `height: var(--x)` and read its
  `getBoundingClientRect()` instead.
- Do not drive to the state to see it. Set the root's data attribute and append
  a hand-written copy of the plate's markup; that is the geometry under test,
  and `page.setViewportSize` then sweeps the whole clamp range in one page.

The acceptance figure is the SLACK between the band and the plate at every
viewport, printed — a constant small positive number across the sweep, never a
picture that looks fine.
