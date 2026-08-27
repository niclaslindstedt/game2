---
title: The race clock's textContent is a tooling contract — putting anything else inside `.hud-clock-total` breaks every driving screenshot scene
date: 2026-08-27
scope: pwa/src/game/hud.tsx, scripts/screenshot.mjs
concepts: [hud, screenshots, tooling, harness]
---

`scripts/screenshot.mjs` has no other cursor into how far a run has got:
`racing()`, `atStageTime()` and `stageTime()` all read the clock's
`textContent` through one shared `READ_CLOCK` snippet and parse it as
`M'SS"CC`. Under software rendering the sim advances at a fraction of wall
time, so a fixed `waitForTimeout` lands somewhere different on every machine —
that parse is the whole reason the scenes are reproducible.

Adding a second line inside the clock (a split, a gap, a delta — a
`<span class="hud-chip-sub">`) turns that text into `0'12"40GHOST +34m`, the
regex stops matching, and every driving scene then hangs on
`waitForFunction` until it times out. The failure is a 60-second timeout with
no error message pointing at the HUD, in a pass that only runs when somebody
asks for screenshots.

Put anything new NEXT to the clock as its own element inside `.hud-topleft`,
never inside `.hud-clock-total` (the ghost gap chip is the worked example).
And `READ_CLOCK` answers **null** when the element is absent rather than
parsing an optional chain's `undefined`: the HUD is not in the DOM at all
while the world builds, and `null > 0` being false is what stops a scene
pressing keys at the loading screen.

If the clock's format or class ever changes again, `READ_CLOCK` in
`scripts/screenshot.mjs` is the single place to change with it — and the
cheap check after any edit to the top bar is to `page.evaluate` it and assert
it comes back a number.
