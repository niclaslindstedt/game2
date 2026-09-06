---
title: Anything the sky anchors at world height 0 is at eye level on a massif — the sun, the dome's horizon, the air traffic
date: 2026-09-06
scope: pwa/src/game/environment.ts, pwa/src/game/ambient-life.ts, pwa/src/game/sky-traffic.ts
concepts: [alpine, rendering, sky, camera, review]
---

The taiga's roads run tens of metres over the sea, so a sky group parked at
`(cam.x, 0, cam.z)` looked right for a year. The alpine's roads run 300–400
m up, and three things broke at once, all the same bug: the sun disc parked
at `DOME_RADIUS·0.86` sat seven metres over the eye and 280 m out — on the
horizon, orange at midday, and shining through every slope further off
than that; the dome's horizon band was 400 m below the eye, so the sky at
the skyline was zenith blue; and the airliners' lane (300–470 m) was at eye
level with the contrails drawn across the near slopes.

Everything at INFINITY rides the eye in all three axes (`environment.ts`'s
`eye` group; `sky.position` in ambient-life.ts). What stands on the
COUNTRY — the ridge rings, the clouds' base — stays on the ground plane.

A second, independent trap on the same screenshot: a `transparent: true`
material is drawn AFTER every opaque object whatever its `renderOrder`, and
depth-tested at its own distance — so a backdrop that must be behind all
terrain has to be opaque-pass (`transparent: false`, additive blending if
it fades by opacity) with `depthTest: false`, the way the ridge rings are.

Photograph it with `make debug-shot` in god mode from a route sample high
on a massif, looking at `SUN_AZIMUTH` with pitch near zero: seed 17 at the
campaign's alpine dials, s = 141 m, reproduces the report exactly.
