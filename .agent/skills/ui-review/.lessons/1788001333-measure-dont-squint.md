---
title: Measure fit with a DOM probe across viewports, seed the WORST case, and reuse one page per viewport
date: 2026-08-27
scope: pwa/src/game/, pwa/src/styles.css, scripts/screenshot.mjs
concepts: [hud, menus, responsive, portrait, landscape, tooling, harness]
---

Screenshots answer "does it look right"; they do not answer "does it fit". A
throwaway Playwright probe that reads `scrollHeight - clientHeight` off
`.menu-card` / `.hud` and reports anything past the viewport edge checks six
viewports in one run and finds the overflows no eye catches. Keep it under
`previews/` (gitignored) — a browser-globals `.mjs` under `scripts/` fails
eslint's `no-undef`. Run 320/360/375/390/430 portrait, 1280x720 and 844x390
landscape.

**The defaults hide the worst case, and all of them default to the easy
value.** In a run: `?seed=42` is two digits where the daily seed is five
(~30px wider, and what overflows the top bar); a local `make build` stamps
`0.1.0` where CI stamps `0.1.0.15+dfb27ca`, 2.5x wider; only `?car=classic`
renders the manual gear taps. Add `offRoad` too. In a MENU: an empty save is
the easy case — a stage grid is tallest with every stage driven and won,
because only then does every box carry all three of its result marks. Seed it
with `page.addInitScript` writing the progress key (`scandi-flick-campaign`,
player id `you`) before load, or the probe measures a wall of padlocks and
reports green.

**Reuse ONE browser page per viewport and navigate in-app.** Building the
world takes 20s+ under software rendering, so a probe that reloads per page
spends ~40 minutes where one that walks the cards (pressing `[data-nav-back]`
back to the root between pages) spends four. `?menu=1&start=1&splash=0` is
what lands on the menu with no attract card in the way.

The corollary for layout: a row that GROWS with the situation cannot also be
a row sized to fit. Keep conditional readouts out of the fixed instrument row.
