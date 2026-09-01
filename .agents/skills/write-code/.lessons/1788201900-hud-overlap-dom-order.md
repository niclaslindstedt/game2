---
title: Two HUD controls that overlap are settled by DOM ORDER, not by which one looks on top — put the new one FIRST
date: 2026-08-31
scope: pwa/src/game/hud.tsx, pwa/src/game/
concepts: [ui, input, hit-testing, hud]
---

Everything in the HUD is `position: absolute` at the same stacking level, so
where two hit boxes overlap the LATER sibling takes the press — including one
that paints nothing there. The rear-view mirror's switch is the case: folded,
it is a strip a finger tall across the top of the frame with a `::after` that
reaches past the paint to be tappable at all, and in portrait that reach runs
under the top bar's camera button. Appended after the bar it silently ate the
button's top edge; moved ahead of it in the JSX, the bar wins wherever they
meet and the strip keeps everything else.

So: a control that is placed over a REGION rather than in a row goes first in
the HUD's children, and any hit-box padding it needs is grown only on the axes
that stay clear of its neighbours (`inset: -0.45rem 0`, never a bare
`-0.5rem`).

Verify it rather than reasoning about it — `document.elementFromPoint` at the
neighbour's edge in the built app names the element that will actually be
pressed, and a Playwright click on the neighbour proves the new control did
not answer for it.
