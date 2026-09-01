---
title: A reported behaviour the code cannot produce is worth ten minutes of headless driving before you go looking for it
date: 2026-08-27
scope: scripts/screenshot.mjs, pwa/src/App.tsx
concepts: [harness, input, verification, playwright]
---

"The car gasses itself on desktop" had no candidate in the tree: nothing
writes `throttle` but the key bindings and the touch pedal, and the engine
holds `u` at 0 under `NEUTRAL_INPUT`. Serving `pwa/dist` and reading
`.hud-speed-num` / `.hud-timer` every two seconds with no keys pressed settled
it in one run — 11 s of stage time at 0 km/h — and turned a hunt into a
verified statement plus a defensive fix (render the touch zones only when
`deviceControls().touch`, since CSS `display:none` is not absence and the
pedal zone's default mode is gas).

The probe is ~25 lines and reusable: static server over `pwa/dist`, one
`page.goto('?start=1&seed=42')`, poll a few HUD selectors in a loop. Note it
must live inside the repo — `playwright-core` resolves from the script's own
path, so a copy in the scratchpad throws ERR_MODULE_NOT_FOUND. Under software
rendering the sim runs ~4× slower than wall time, so give the countdown 12 s.
