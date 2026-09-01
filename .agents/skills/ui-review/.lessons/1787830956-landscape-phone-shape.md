---
title: A phone in landscape is its own viewport class, and every `vmin` clamp in the menu is blind to it
date: 2026-08-27
scope: pwa/src/styles.css, pwa/src/game/
concepts: [css, responsive, menus, landscape, cascade]
---

The menu's sizes are almost all `clamp(min, Nvmin, max)`. On a phone held
sideways (844x390, 932x430, 667x375) `vmin` IS the height — the one axis that
is scarce — so a `vmin` clamp shrinks a card in exact proportion to the space
it is already short of, and lands on its `min` anyway. Every root-menu entry
came out full size on a 390px-tall screen and OPTIONS fell off the bottom.

The convention this repo now uses for that shape is
`@media (orientation: landscape) and (max-height: 34rem)` — it catches every
phone in landscape and no tablet or desktop — and inside it sizes come off the
WIDTH (`vw`) or off `vh`, never `vmin`. The root menu goes to a 2x2 grid with
the tagline beside the title; option rows put their button strip on the same
line as its label; the HUD toggles and key bindings flow into more columns.

Order of cuts when a card overflows: card padding and row gaps first, then
column count, and only then anything the player reads or taps. Touch targets
stay at ~40px.

`previews/menu-fit.mjs` (the probe pattern from the measure-don't-squint
lesson, pointed at `.menu-card`) reports scroll per page per viewport, and the
landscape shapes belong in it — `make screenshots` had only 1280x720 and
390x844, so this whole class of break was invisible.
