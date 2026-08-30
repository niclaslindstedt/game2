---
title: The overlay's fps row saturates at 10, and game time crawls with it on a slow machine
date: 2026-08-30
scope: pwa/src/App.tsx
concepts: [harness, performance, hud, verification]
---

`dtFrame` is clamped to 0.1 s (`Math.min(0.1, …)`) so a hitching tab cannot
spiral the step backlog — and the overlay's fps is `fpsFrames / fpsSeconds`
over that same clamped accumulator. Below ten real frames a second the two
cancel out and the row reads a flat **10**, whatever the machine is really
doing. A headless container drawing about one frame a second reports 10 fps.

The consequence that actually bites: the run advances 0.1 s per FRAME, so on
that container one wall-clock second is roughly a tenth of a second of game
time. A scripted check that waits fourteen wall seconds for a `?start=1` run
to leave the grid is still watching the establishing shot, and it looks
exactly like a sim that has stopped stepping. Before concluding a change broke
the loop, read the CAR box's `run` row — `countdown · lap 1/1 · t 0.00 s` says
the run has not started, not that it is stuck — or use `?god=1`, which skips
the countdown and starts racing at once.

`scripts/screenshot.mjs`'s `atStageTime` waits on the HUD's own clock for this
reason; a hand-rolled `waitForTimeout` does not.
