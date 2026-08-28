---
title: A scene that waits on a HUD reading is coupled to what the HUD SHOWS — change the display rule and the scene dies on a 180 s timeout
date: 2026-08-28
scope: scripts/screenshot.mjs, pwa/src/game/hud.tsx, pwa/src/game/snapshot.ts
concepts: [screenshots, harness, hud, scenes, playwright]
---

`scripts/screenshot.mjs` navigates by HUD cursors — the clock, the speedo, the
co-driver's call. That makes every one of them a CONTRACT with the HUD, and
nothing type-checks it. Shortening the pacenote lead so a call appears two
seconds out instead of a few hundred metres made `atOpenRoad(page, 150)`
(waiting for `.hud-pace-dist` ≥ 150) unsatisfiable: the scene hung its full
180 s and killed the sweep an hour in, at the tenth of twenty-odd scenes.

So: when a change alters WHAT the HUD puts on screen or WHEN, grep
`scripts/screenshot.mjs` for the element's class before running anything, and
re-run the whole sweep rather than the one scene you edited — the failure is a
timeout in a scene you were not thinking about.

The rewrite has its own trap. A wait only converges while the car is still
being driven at the thing being waited for. Braking to 55 km/h and releasing,
THEN waiting for the next corner to be called, strands a coasting car short of
it forever under software rendering. Order the scene so the cursor is reached
on the way in: wait for the call, then brake toward the corner it named.

Two cheap cursors that survive a display-rule change, because they ask whether
the instrument has anything to say rather than what it says: `!document
.querySelector('.hud-pace-call')` is open road, and the same selector turning
truthy is the turn-in.
