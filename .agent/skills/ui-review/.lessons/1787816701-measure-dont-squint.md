---
title: Measure HUD fit with a DOM probe across viewports; screenshots hide the 2px overlaps and the scene defaults hide the worst case
date: 2026-08-27
scope: pwa/src/game/, pwa/src/styles.css, scripts/screenshot.mjs
concepts: [hud, responsive, portrait, tooling, harness]
---

Screenshots answer "does it look right"; they do not answer "does it fit". A
throwaway Playwright script that walks `.hud *`, takes
`getBoundingClientRect()`, and reports anything past the viewport edge plus any
pair of ink-bearing elements that intersect, checks six viewports in one run
and finds overlaps of a couple of pixels that no eye catches on a 390-wide
frame. Run it at 320/375/393/430 portrait and 1280x720 + 844x390 landscape.
Keep the script under `previews/` (gitignored) — a browser-globals `.mjs` under
`scripts/` fails eslint's `no-undef`.

**The scene defaults hide the worst case.** Three inputs matter and all three
default to the easy value:

- `?seed=42` is two digits; the real daily seed is five (`STAGE 20692`), which
  is ~30px wider and is what actually overflows the top bar.
- A local `make build` stamps `0.1.0`; CI stamps `0.1.0.15+dfb27ca`, 2.5x
  wider. Reproduce with `GITHUB_SHA=… GITHUB_RUN_NUMBER=… make build`.
- The default car is the auto; only `?car=classic` renders the manual gear
  taps, so a bottom-right collision is invisible without it.

Add `offRoad` too (hold a steer key into the scenery) — it is the state that
adds elements to a row mid-run.

The corollary for layout: a row that GROWS with the situation cannot also be a
row sized to fit. Keep conditional readouts (OFF ROAD, wind, the TRACK button)
out of the fixed instrument row and give them their own.
