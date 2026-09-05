---
title: Both browser harnesses take scene NAMES on the command line — a car or renderer change meters its own rows in minutes instead of the whole twelve-minute sweep
date: 2026-09-05
scope: scripts/profile-render.mjs, scripts/screenshot.mjs
concepts: [measurement, harness, profile, screenshots, rendering]
---

`make profile` on a web session's software rasterizer is about twelve minutes
for its ten scenes, and `make screenshots` is longer still — long enough to
outlive a tool timeout, and long enough that taking the AFTER by the Make
target means the session sits idle for the length of a full sweep twice.

Both scripts filter on `process.argv`: `node scripts/profile-render.mjs field
headsup driving` meters only the rows whose names match, and
`node scripts/screenshot.mjs shot-grid-field-revving probe-grid-heli` shoots
only those captures (`CHROMIUM_PATH=/opt/pw-browsers/chromium` in front of
either). Name the scenes the change actually reaches — a field-car change is
`field` and `headsup`, a cockpit change is `cockpit` and `cockpit-storm` —
and keep the full sweep for the BEFORE, which runs while the code is still
being read. Both harnesses serve `pwa/dist`, so a `make build` sits between
the last edit and the AFTER, and nothing may edit a source file while a build
is in progress or the baseline is the wrong tree.
