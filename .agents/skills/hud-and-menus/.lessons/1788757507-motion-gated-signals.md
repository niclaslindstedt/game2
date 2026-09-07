---
title: A HUD state signalled by colour AND motion loses everything under reduced motion when you drop the colour
date: 2026-09-07
scope: pwa/src/styles.css
concepts: [hud, css, review]
---

Several HUD states are said twice — a colour on the plate and a pulse — with
the pulse inside `@media (prefers-reduced-motion: no-preference)` and the
colour outside it, so the colour is silently doing all the work for a player
who has asked for less motion.

Take the colour away (`.hud[data-off="1"] .hud-recover` lost its
`--hud-bad` plate) and that player is left with no signal at all. Whenever you
quieten one of these, put a still fallback under
`@media (prefers-reduced-motion: reduce)` — a border coming up to full ink says
"this one" without saying "alarm".
