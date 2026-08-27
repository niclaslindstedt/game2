---
title: The `.hud-timer` chip's textContent is a tooling contract — putting anything else inside it breaks every driving screenshot scene
date: 2026-08-27
scope: pwa/src/game/hud.tsx, scripts/screenshot.mjs
concepts: [hud, screenshots, tooling, harness]
---

`scripts/screenshot.mjs` has no other cursor into how far a run has got:
`racing()`, `atStageTime()` and `stageTime()` all read
`document.querySelector('.hud-timer').textContent` and parse it as `m:ss.t`.
Under software rendering the sim advances at a fraction of wall time, so a
fixed `waitForTimeout` lands somewhere different on every machine — that
parse is the whole reason the scenes are reproducible.

Adding a second line inside the timer chip (a split, a gap, a delta — a
`<span class="hud-chip-sub">`) turns that text into `0:12.4GHOST +34m`, and
every driving scene then hangs on `waitForFunction` until it times out. The
failure is a 60-second timeout with no error message pointing at the HUD, in
a pass that only runs when somebody asks for screenshots.

Put anything new NEXT to the clock as its own `.hud-chip`, never inside it.
Cheap check after any edit to the top bar: `page.evaluate` the timer's
`textContent` and assert it still matches `/^\d+:\d\d\.\d$/`.
