---
title: The snow coat can only sink if the ground tiles are drawn UNDER it — and anything lying on the coat must read the coat, not the pack
date: 2026-09-11
scope: pwa/src/game/snow-mantle.ts, pwa/src/game/terrain.ts, pwa/src/game/snow-marks.ts
concepts: [terrain, snow, rendering, geometry, z-fighting]
---

On a white stage three surfaces stack, and they only work in this order:

`ground tiles` (14 m lattice, `heightAt - coatRoom(blanket)`) → `the coat`
(2.5 m sheet, `blanket - min(sunk, coatRoom)`) → anything lying on it.

The tiles used to be drawn at the top of the UNTOUCHED snow, level with the
coat. That is fine until the coat bends: a trough a car pressed a third of a
metre into went behind the tile and the depth buffer threw it away, so a
deformable snow model drew back as flat white ground (and the two coincident
surfaces z-fought into chequered patches everywhere else). `coatRoom` — a
car's belly, `TUNING.snow.clearance`, capped by `rest * (1 - pack.floor)` — is
the headroom that fixes it, and it is zero wherever there is no blanket, so
the road corridor, the water and green stages are untouched. The sheet fades
back to the tiles over its last few metres or its rim is a cliff.

Two corollaries. Anything drawn into snow reads `sunkAt`, never `cutAt` — the
surface loses the whole of the packing, the wheels only the loose share, and
the two differ by 4-5x. And it must read the COAT's height
(`coatHeightAt`), not the pack: the pack answers at the 0.4 m grain a wheel
carves at, the coat is a 2.5 m mesh, and a fine rut sampled off the pack sinks
under the coarse sheet that is supposed to be under it.
