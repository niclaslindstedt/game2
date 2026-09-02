---
title: A scene for a STORED setting writes the options blob and reloads — and cannot use `racing()` once the HUD is down
date: 2026-09-02
scope: scripts/screenshot.mjs
concepts: [screenshots, harness, hud, settings, tooling]
---

Most scenes are dialled in from the URL (`?camera=`, `?gearbox=`, the view
knobs), but a player option with no URL reader — the HUD switch, the mirror —
can only be photographed by writing `scandi-flick-options` into
`localStorage` and reloading before the scene starts. `capture()` navigates
before it hands the page over, so the scene does `page.evaluate` (as a source
STRING, the file lints as Node), then `page.reload()` and waits for the canvas
again.

The second trap is that `racing()` and `atStageTime()` read the run's clock
OFF THE HUD (`READ_CLOCK`). With the HUD switched off there is no clock in the
DOM, the wait never resolves, and the scene times out at sixty seconds
looking like a build that never started. A HUD-off scene has to wait on the
wall clock instead — generously, because the world takes twenty-odd seconds to
build under software rendering — or read progress off something else.
