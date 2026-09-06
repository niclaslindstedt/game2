---
title: A search rule about a POINT needs a margin, and one about the road's HEIGHT has to be a floor in the search — the follow lag is 140 m
date: 2026-09-06
scope: engine/mapgen/generate.ts, engine/mapgen/search.ts
concepts: [search, water, elevation, plausibility, measurement]
---

Two ways a new route rule leaks, both found adding R48's ice crossings.

**A per-point predicate under-catches.** The search probes at `PROBE_STEP`
(6 m) on an Euler walk, and the compiler samples at ~2 m on its own — the
two part company by metres over a stage. A rule written as "no tight corner
where `land.iceAt(p) !== null`" still put tens of the built road's samples
on shorelines the probe never sampled; measured, the tightest corner
reaching the ice was 27 m against a 80 m rule. The fix is to ask the
question with a DISTANCE (`nearIce(p, cornerClear)`) rather than at the
point, and to sweep the margin rather than guess it: 15 m still leaked,
30 m was exactly clean, 60 m halved the feature and bought nothing.

**A height rule cannot be left to the compiler.** `elevation.follow.lag` is
140 m and a lake is a couple of hundred metres across, so a line arriving
at a shore metres up off a hillside is still up there at the far side. Left
alone the sweep flew six metres and more over open ice — a causeway, the
one thing R35 exists to prevent. There is no fixing that downstream: the
rule has to be a floor in `keepsDry`, refused where another line can still
be drawn. Expect it to bite hard — an over-tight floor (1.5 m) cut twelve
stages' worth of crossings to 300 m of road, because the country almost
never offers a flat run at a shore. Sweep it, and separate "how much bank
may a crossing be approached over" (the search's floor) from "where does
the bank stop and the feature start" (the compiler's classification band).
