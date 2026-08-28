---
title: The touch zones cover the whole lower screen and come LAST in the DOM — any HUD button under them is dead on a phone
date: 2026-08-28
scope: pwa/src/styles.css, pwa/src/game/hud.tsx
concepts: [hud, touch, stacking, portrait, buttons]
---

`.hud-zone` is `top: 22%; bottom: 0; width: 50%` with `pointer-events: auto`,
and `.hud-touch` is the last child of `.hud` — so on a coarse-pointer device
the two thumb zones sit on top of everything in the bottom half, the
instrument corner included. The RETURN-TO-TRACK button shipped that way: a
tap on it anchored the steering wheel instead, with no way back onto the road
but the B key nobody has on a phone. `.hud-gears` gets away with it only
because it is written after the zones.

Any interactive thing below the top bar needs its own stacking order
(`position: relative; z-index: 1` on the row that owns it) or it has to live
after `.hud-touch`. The check takes seconds and does not need a screenshot:
on a `{ hasTouch: true, isMobile: true }` page,
`document.elementFromPoint(centre of the button)` — or a Playwright `.tap()`,
which reports "subtree intercepts pointer events" — says whether the button
is really the thing under the thumb.
