---
title: The position board exists only in a campaign run, so photographing it costs minutes rather than seconds
date: 2026-09-07
scope: pwa/src/game/hud.tsx
concepts: [hud, screenshots, review]
---

`snap.standing` is only ever set where there is a field, and a field only
exists on a stage entered through the campaign menu — a `?start=1` link, which
is what every other driving capture uses, reaches racing in seconds and has no
place board at all. So a change to that corner cannot be checked the cheap way:
the scene has to walk the menu (`[data-menu='campaign']` → location → stage →
START) and then sit through the establishing shot and the lights, which under
software rendering is several minutes before `.hud-recover` is in the DOM.
`scripts/screenshot.mjs` waits `FINISH_WAIT` (600 s) for exactly this reason —
budget the same, and wait on `.hud-recover` rather than `.hud-place`, which is
up during the countdown while the buttons are not.

Do NOT try to buy the time back by driving several of these pages at once:
three parallel game pages starve software rendering badly enough that
Playwright's own actionability check times out on the menu tile before the
first stage is even chosen. One page at a time.
