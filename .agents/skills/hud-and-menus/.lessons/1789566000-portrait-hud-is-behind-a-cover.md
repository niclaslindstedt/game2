---
title: No portrait HUD scene can be photographed — `PORTRAIT_ALLOWED` is false, so the run never starts and `racing()` burns its 180 s timeout
date: 2026-09-16
scope: pwa/src/game/orientation.ts, scripts/lib/shots-driving.mjs
concepts: [screenshots, harness, hud, portrait, verification]
---

`orientation.ts` ships `PORTRAIT_ALLOWED = false`: a viewport the browser
reports as portrait gets the WIDEN THE WINDOW / TURN YOUR DEVICE cover, and
`mustPause` holds the run behind it. The clock therefore never leaves zero, so
every portrait scene that calls `racing(page)` — `shot-speed-portrait`,
`shot-laps-portrait`, `shot-finish-portrait`, and every `captureElement` shot,
which is 390x844 by definition — waits out the full 180 s and throws. It reads
exactly like a hang the change caused; it is not.

Two consequences worth knowing before starting a HUD change:

- **The portrait rules in `styles.css` are DORMANT, not live.** Keep them
  coherent (the switch is one line and the comment above it says so), but the
  only orientation that can be looked at is landscape — so do not spend a
  sweep trying to shoot the other one.
- **`shot-grid-portrait` still works**, because it only waits 800 ms and
  photographs whatever is up — which is the cover. It is the cheapest proof
  that the cover, not the change, is what the portrait scenes are stuck on.

For a landscape shot of the touch-only HUD (the camera press, the thumb
zones), pass `hasTouch: true, isMobile: true` to `newPage` at a landscape
viewport rather than reaching for a portrait one.
