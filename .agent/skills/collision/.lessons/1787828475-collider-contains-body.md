---
title: The shared collision box must CONTAIN the larger drawn shell, or the reported bug is "the car clips into stuff"
date: 2026-08-27
scope: engine/game/defs/tuning.ts, pwa/src/game/car-styles.ts
concepts: [collision, car-design, clipping]
---

`TUNING.collision.halfLength/halfWidth` is one box for both cars, and the
comment beside it claimed the two shells "differ by centimetres". They did
not: the classic's stations run z −2.21…2.0 with half 0.9 plus a 0.06 flare,
against a box of 1.9 × 0.85. Its tail and flanks passed visibly THROUGH
trunks before anything happened, which players report as the whole contact
model being broken rather than as a box being a few centimetres small.

Size the box off the widest/longest station in `pwa/src/game/car-styles.ts`
(`stations[].z` and `.half`, plus `flare.extra`), not off the average. The
smaller car's few centimetres of early scrape are invisible; a body sticking
out of its collider never is. Any change to a car's silhouette owes this
check — the two files have no compile-time link.
