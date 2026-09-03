---
title: On an endless stage `track.spurs` only grows but `terrain.carParks` is pruned from the front — anything keyed on both must rescan by identity, not by index
date: 2026-09-03
scope: engine/mapgen/traffic.ts, engine/mapgen/carparks.ts, engine/mapgen/compile.ts
concepts: [endless, streaming, car-parks, spurs, identity, pruning]
---

The compiler never prunes an arm (`track.spurs` has no `pruneBefore`), but
the car park field does (`carParks.pruneBefore` shifts the list), and a shift
plus a push leaves the length unchanged. So a module that derives something
from both — the traffic plans its routes over the arms and the lanes — cannot
tell "the world changed" from a length compare alone. The traffic fleet keeps
`spurCount`, `parkCount` AND `parkFirst` (the first park by reference) and
replans when any of the three moves, carrying its vehicles across the rebuild
by a string key on each route rather than by index. The same shape applies to
anything else planned over the parks: hold the references, not the positions.
