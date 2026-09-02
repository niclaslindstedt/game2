---
title: The end aprons are geometry stated in four places, and a circuit's two ends are ONE place — anything extrapolated past an end has to ask `track.circuit`
date: 2026-09-02
scope: engine/mapgen/road.ts, engine/mapgen/compile.ts, engine/mapgen/terrain.ts, pwa/src/game/road-mesh.ts
concepts: [circuit, r24, r25, aprons, renderer-seam, analysis]
---

R24's run-up and R25's run-off live in no sample array, so each consumer
restates them as geometry off the end samples: the junction trial and the
built `roadDistance` in `compile.ts`, `apronDistance` in `terrain.ts`, and
the drawn ribbon (`endApron` in `road.ts`, which `road-mesh.ts` welds on).
On a circuit the last sample IS the first, so "past the finish" is the
opening straight and "behind the start" is the closing one — real road on
grades of its own. A level apron extrapolated there stood 1.4 m over the
mat 35 m into seed 3's lap and buried a car to its windows.

Two things about how it hid:

- **The terrain never showed it.** `nearestSample` hands every point on the
  start straight to the route sample under it, never to the end sample, so
  the ground followed the real road and the physics was right. Only the
  drawn ribbon lied — which is why `make analyze` scored the stage 92 with
  no finding at the line, and why the test on `endApron` is the instrument,
  not a check.
- **The rule book was already right.** R24 and R25's prose said a circuit
  needs no apron; only the renderer's code had not been asked. When a rule
  names a shape as an exception, grep every consumer of the geometry for the
  shape's flag before believing the exception is implemented.

The keep-out statements in `compile.ts` and `terrain.ts` were left alone:
on a circuit their apron coincides with the route, so they measure nothing
the route did not already, and gating them would re-roll every fixture for
no visible change.
