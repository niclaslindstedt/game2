---
title: Measure fit with a DOM probe across viewports, seed the WORST case, reuse one page per viewport — and drive to a campaign card one browser at a time
date: 2026-08-27
scope: pwa/src/game/, pwa/src/styles.css, scripts/screenshot.mjs, previews/
concepts: [hud, menus, responsive, portrait, landscape, tooling, harness, campaign, results-card]
---

Screenshots answer "does it look right"; they do not answer "does it fit". A
throwaway Playwright probe that reads `scrollHeight - clientHeight` off
`.menu-card` / `.hud` and reports anything past the viewport edge checks six
viewports in one run and finds the overflows no eye catches. Keep it under
`previews/` (gitignored) — a browser-globals `.mjs` under `scripts/` fails
eslint's `no-undef`, and a script OUTSIDE the repo (the session scratchpad)
cannot resolve `playwright-core` at all. Run 320/360/375/390/430 portrait,
1280x720 and 844x390 landscape; the last is the one that breaks.

**The defaults hide the worst case.** In a run: `?seed=42` is two digits
where the daily seed is five; a local build stamps `0.1.0` where CI stamps
`0.1.0.15+dfb27ca`; only `?car=classic` renders the manual gear taps; add
`offRoad`. In a MENU: a stage grid is tallest with every stage driven and
won. Seed it with `page.addInitScript` writing the progress key
(`scandi-flick-campaign`, player id `you`) before load, or the probe
measures a wall of padlocks and reports green.

**Reuse ONE browser page per viewport and navigate in-app.** Building the
world takes 20s+ under software rendering; a probe that reloads per page
spends ~40 minutes where one that walks the cards (`[data-nav-back]` between
pages) spends four. `?menu=1&start=1&splash=0` lands on the menu with no
attract card in the way.

**A results card with a FIELD on it only exists on a stage entered from the
menu**, so photographing the sheet means the bot driving a campaign stage:
12–15 minutes per viewport on a 4-core web session, and only when it runs
ALONE — three in parallel put the load near ten and every one timed out.
Seed LOW picture the same way (`scandi-flick-options` with
`{ video: DETAIL_PRESETS.low }`; the loader takes partial blobs, each
picture row read against its own ladder), detach with `nohup … &` past the
10-minute background cap, and print a probe line per viewport beside the
PNG (rows, card top/bottom against `innerHeight`, portraits landed).

The corollary for layout: a row that GROWS with the situation cannot also be
a row sized to fit. Keep conditional readouts out of the fixed instrument row.
