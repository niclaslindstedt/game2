---
title: Water is a system, not a decoration — one course per valley, and the road's crossings are its anchors
date: 2026-08-27
scope: engine/mapgen/river.ts, engine/mapgen/terrain.ts
concepts: [water, rivers, plausibility, terrain, bridges]
---

Sprouting an independent stream at each ford gives a stage a fan of parallel
watercourses that reads as fake from any altitude. Tracing ONE course through
the crossings — source above the highest, visiting the rest in descending
order, widening as it goes, ending in the lowest water it can find — reads as
a river the road meets three times.

Two things it took a rewrite to learn. First: the river must read the ground
the ROAD sits in (the corridor-shaped height), not the bare far field — the
far field runs several meters below road grade, so every reach between two
crossings gets refused as impossible. Second: hollows between crossings are
POOLS, not refusals — standing water is flat, so clamping the surface to the
downstream crossing's level through a dip is both physical and what lets a
course join up at all. Reserve refusal for high ground: water does not climb
a ridge, and two crossings with one between them are on different water.
