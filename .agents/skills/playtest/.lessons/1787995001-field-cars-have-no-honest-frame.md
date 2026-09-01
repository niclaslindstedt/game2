---
title: There is no deterministic screenshot of a RIVAL mid-stage — verify the field with a page probe, not a scene
date: 2026-08-29
scope: scripts/screenshot.mjs, pwa/src/game/field-cars.ts, pwa/src/game/standings.ts
concepts: [screenshotting, field, rivals, determinism, verification]
---

Two things mean a `capture` at a fixed stage clock cannot promise a rival in
frame. The player is always car 15 of 15, so every crew is AHEAD — round a
bend or over a crest: at stage time 16 the nearest was 86 m away and still
out of shot from the chase cam and the helicopter alike. And a STAGGERED
field is simulated on a catch-up budget of a few ms a frame (`CATCHUP_MS`),
so under the software renderer `make screenshots` uses, where anybody IS
depends on the frame rate of the machine taking the picture.

True of anything the field does in the WORLD. Do not ship a scene that names
one state and captures another — delete it and verify another way.

Three exits, in order of cost:

- **The MINIMAP is an honest frame where the world is not.** Every crew on the
  road gets a plate wherever they are, so a `.hud-minimap-dock` capture says
  something true about the field without needing a rival in shot
  (`shot-instrument-field`). Shoot the instrument, not the car.
- **A mass start is deterministic.** `?mode=headsup` enters a grid on a
  `?start=1` link, and `createField` gives one `owed: 0` for everybody: no
  head start, so no catch-up budget, so `stepField` runs the whole field in
  lockstep with the player and the screenshot machine's frame rate drops out.
- **A page probe**, about five minutes: build with a throwaway `window.__probe`
  written from the per-frame path, serve `pwa/dist` from a tiny node http
  server (content-type off the RESOLVED path, or `/` comes back as a download
  rather than a page), and read it at several stage clocks. Ranges and a rising
  spawn count answer "is this code running on real cars", where a photograph
  only answers "was one in frame". Then revert the probe.
