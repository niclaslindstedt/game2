---
title: A HUD transient on a wall-clock timer cannot be screenshotted — expire it on state.raceTime
date: 2026-08-28
scope: pwa/src/game/, pwa/src/App.tsx, scripts/screenshot.mjs
concepts: [hud, screenshots, harness, transients, timing]
---

Anything that shows for a few seconds and removes itself with `setTimeout` is
effectively un-capturable by `scripts/screenshot.mjs`. Two costs stack on this
machine: a full-frame `page.screenshot()` of a software-rendered stage takes
~2.6 s, and `elementHandle.screenshot()` first waits for the element's box to
be STABLE across animation frames — which, at the ~1 fps the world renders at
under software rasterization, is seconds more. A 3.6 s wall-clock hold is gone
before the shutter opens; the scene goes green and the picture is of an empty
HUD.

The fix is not a longer hold, it is a different clock. Expire the transient on
the RUN's clock (`state.raceTime`) from the frame loop, holding the value in a
ref the once-created loop can read. That is also the better behaviour: a paused
run holds its readout the way it holds every other instrument, and a machine
rendering at a fraction of real time shows it for as much of the ROAD as one
that is keeping up — which is exactly what makes the scene deterministic.

Two companions found in the same pass: an entry animation that moves the box
(`transform: translate…`) defeats the element-stability wait, so animate
opacity only on anything a scene captures; and `page.evaluate` reading the
element's rect and computed style is a far cheaper probe than a screenshot for
answering "is it there, and where" while iterating.
