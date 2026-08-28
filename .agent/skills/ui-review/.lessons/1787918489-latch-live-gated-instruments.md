---
title: An instrument gated on a live measurement must LATCH once it is up, or the driving that follows it takes it back down
date: 2026-08-28
scope: pwa/src/game/snapshot.ts, pwa/src/game/hud.tsx
concepts: [hud, ui, verification, state]
---

The co-driver strip shows a corner when it is within a few seconds of the car —
`distance <= speed * lead`. Both sides of that move, and they move against each
other: the seconds covered by the lead are exactly the ones the driver spends
BRAKING, so the window shrinks faster than the distance does, walks back past a
sign that is already up, and takes the call down at the moment it is being read
— then puts it back up on the throttle out. On screen that is flicker; in the
code it is a threshold with no hysteresis.

Any HUD element gated on a number the player is actively changing has this
shape. Give it a latch: once shown, it stays until the thing it is about is
DONE (here, the car is through the corner), and the gate only ever decides when
it goes UP. `PaceMemory` in `snapshot.ts` is the pattern — a small object held
in a ref beside `LiveRun`, carrying how far the calls already made reach, and
cleared by the one event that means a different run: `progressS` moving
BACKWARDS (respawn, restart, new stage).

Screenshots cannot see this — every frame of a flickering strip looks correct.
Measure it over TIME: a throwaway Playwright script under `previews/` that
samples the element at 20 Hz through a `?bot=1` run and counts transitions
(rows appearing, vanishing, the primary call changing) gives a before/after
number. Across three seeds and 60 s each: strip up 92% → 76% of the time, the
second row toggling 15 → 9 times.
