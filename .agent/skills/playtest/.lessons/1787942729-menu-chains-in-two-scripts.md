---
title: A new step in the menu flow breaks `make profile` silently — its campaign click chain is a second copy of the screenshot script's
date: 2026-08-28
scope: scripts/profile-render.mjs, scripts/screenshot.mjs
concepts: [tooling, screenshots, profiling, menus]
---

`scripts/screenshot.mjs` and `scripts/profile-render.mjs` each walk the
campaign menu by clicking text — CAMPAIGN, the location, the difficulty, the
stage — and they are separate copies of that chain. When the pre-race car card
was added between the stage press and the run, only the screenshot script was
updated; `make profile` then hung for two minutes on its `field` scene and
died with a Playwright timeout AFTER metering three scenes, printing no table
at all.

So: a change to the menu flow is a change to BOTH scripts, and a `make profile`
that dies late looks exactly like a slow machine. Check `previews/` and the
scene list rather than assuming it is still working, and run the profile
baseline EARLY — a broken baseline discovered after the code change costs the
before numbers.
