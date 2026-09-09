---
title: No capture tool photographs what is BEHIND a moving car — god mode holds the run, and every play camera looks forward
date: 2026-09-09
scope: scripts/debug-shot.mjs, scripts/screenshot.mjs
concepts: [screenshots, debug-tools, camera, measurement]
---

Anything a car LEAVES on the ground — the snow trail, skid marks, a spray
that settles — is behind it, and an hour can go into trying to photograph it.
The three obvious routes all fail, so do not re-walk them:

- `?god=1` with a `g…=` pose HOLDS the run ("run: held by god mode"), so
  there is no driving and nothing has been left anywhere.
- `?bot=1` drives, but god mode is a SETTINGS toggle (menu-dev.tsx), not a
  hotkey, so it cannot be entered mid-run from a script.
- Every `PLAY_CAMERAS` id looks forward: `top` and `heli` put the car at the
  bottom of the frame with its trail off the bottom edge, and `tv` cuts to
  fixed trackside tripods that are as likely to be ahead as behind.

What is left is the rear-view MIRROR (which the debug overlay's boxes sit on
top of — capture without `debug=1`), a `tv` frame taken at several different
waits until one is behind the car, or reasoning about the geometry and
testing the module directly. Also budget the wait: a `bot=1` run in headless
software rasterization spends about a minute loading before the countdown, so
`--wait` has to be 120 s+ to see any distance driven at all.
