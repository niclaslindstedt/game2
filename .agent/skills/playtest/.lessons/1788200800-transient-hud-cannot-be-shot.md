---
title: The shutter takes ~5 s under software rendering, so anything on screen for under two cannot be photographed by the harness
date: 2026-08-31
scope: scripts/screenshot.mjs
concepts: [harness, screenshots, hud, tooling]
---

`page.screenshot()` on a driving frame measured **5.6 s** here — the page is
software-rendering a 3D world, and Playwright waits for stable frames before
it encodes. A HUD flash (`.hud-flash`) lives for 1.8 s wall and is at full
opacity for about 1.2 s of it, so a scene that waits for one and then shoots
photographs the road AFTER it: the wait resolves within a frame, the picture
lands four seconds later, and the element is already gone from the DOM. Two
runs of it came back with an empty centre column and nothing in the log to say
why.

There is no timing fix — the shutter is the problem, not the wait — and the
workarounds (freezing the flash's removal timer, disabling its animation)
photograph something the player never sees. Shoot a PERSISTENT element instead
and say in the scene's comment why the transient one is not covered: a
`.hud-flash` looks the same whatever text is in it, so the sweep already has
its look from the lap-time and clean-air calls.

Related: the sim runs at roughly a ninth of wall time under software
rendering, so a scene that needs the car to accumulate something (damage,
distance) should ask for the setting that gets there fastest —
`{ difficulty: "hard" }` keeps the whole of every hit — and wait on the run's
own clock rather than a wall-clock timeout.
