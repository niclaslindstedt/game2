---
title: The trace names a colour by OBJECT identity — a factory that makes its paint per call hands the builder a colour the driver cannot name
date: 2026-09-29
scope: scripts/lib/prop-model-data.mjs, pwa/src/game/traffic-fleet.ts, pwa/src/game/farm-gear.ts
concepts: [trace, roles, colours, paint]
---

`GeoBuilder.trace.names` is a `Map<THREE.Color, string>`: a part is named
by the colour object it was painted with, which is what lets a module's
tint table (`TRAFFIC_TINT`, `FARM_TINT`, …) be the role list. A factory
that does `new THREE.Color(palette[i])` inside the call paints with an
object nobody else holds, so the part falls to the hex fallback
(`#d8352a`) and the game would dress it in that one colour for ever. Two
fixes, both used: cache the colour per value so the same object comes back
(`trafficPaintColor`), or make it outside the factory and pass it in
(`tractorPaint(roll)` → `farmGearGeometry(gear, rand, paint)`), then have
the driver name that object `paint`. The data script also names it after
the fact (`#hex` → `paint` over the traced parts) for the case where the
factory took its paint before the trace was hung, but that only works
while the paint's hex is unique among the tints — rely on identity.
