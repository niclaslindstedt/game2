---
title: A scoped variant palette out-specifies every STATE rule it sits over, and the breakage is silent
date: 2026-09-07
scope: pwa/src/styles.css
concepts: [css, hud, palette, theming, review]
---

The night dressing is written as `.hud[data-night="1"] .hud-thing` — three
classes' worth of specificity. Nearly every state on this HUD is ONE class on
the same element: `.hud-lamp-red`, `.hud-gap-down`, `.hud-gearbox-shift`,
`.hud-pace-turn`. So a variant rule aimed at the RESTING element also
repaints the lit, the losing and the redlining, and it wins.

It fails quietly, which is what makes it expensive. A state usually carries
more than a colour — a `box-shadow` glow, an animation — and a variant rule
that names only `background` leaves those untouched. The start gantry shipped
with every bulb painted dark while the lit ones still pulsed and still threw
red light onto the road: from a distance the countdown looked like it worked,
and the report came back as "dark circles and some glow behind".

Two rules, both cheap:

- A variant rule aimed at something with states carries the `:not()` that
  excludes them —
  `.hud[data-night="1"] .hud-lamp:not(.hud-lamp-red, .hud-lamp-green)`.
- Before pushing a variant palette, probe it rather than reading the
  cascade. Inject a bare element and its state twin into the live `.hud` and
  compare `getComputedStyle`:
  `probe('hud-gap')` vs `probe('hud-gap hud-gap-down')`. Five probes cover
  every state rule the dressing sits over and take one page load.

The screenshot suite only guards what a scene actually photographs, and no
driving scene contains a gantry — `shot-hud-night-grid` exists for exactly
this reason.
