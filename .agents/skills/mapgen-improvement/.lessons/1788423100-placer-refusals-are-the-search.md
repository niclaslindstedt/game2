---
title: When a placer suddenly refuses everything, suspect the shape of its search before the country — three traps that each looked like "no room"
date: 2026-09-03
scope: engine/mapgen/carparks.ts, engine/mapgen/carpark-map.ts
concepts: [carparks, search, clearances, tally, r23]
---

Tightening R42 produced three total or near-total placement failures, and
all three read as "the country refuses this" in `carParkTally`. None of them
was. Read the tally, then check these before touching a rule:

**A try counter must sit AFTER the cheap global filter.** `tryBuiltOut`
walks candidate cells nearest-first and gives up after 80 tried. Adding a
stand-off test AFTER `++tried` spent the whole budget on cells inside the
stand-off and never reached the country the pad belonged in: 8651 refusals,
zero car parks. Moving one line above the counter fixed it entirely.

**A lattice's extent and its escape box are different questions.** The
country map was built over `track.bounds` plus the escape, so its cells
stopped 188 m past the box — and the tarmac a lane wanted stood 175-970 m
out, uncovered on ten seeds in twelve. Grow the LATTICE (`createCountryMap`'s
`reach`) and leave `bounds` alone; growing `bounds` instead makes every lane
that runs off the map run that much further before it has left.

**A clearance exemption measured centre-to-centre must outreach what the
edge-measured test needs.** `builtClearance` returns distance to a road's
EDGE, so beside a 16 m road a lane at 32 m reads as 24 m against a 26 m bar
— while the exemption, at a lane's own 31 m clearance, has already stopped
covering it. A three-metre dead band refused every approach on a seed.
Derive such an exemption from the other test's bar plus the road's half
width, never from a clearance that happens to be nearby.

A fourth, same family: an arc-position cursor (`decidedS`) cannot tell apart
two stands that share an arc — the finish banks do — so the second was never
decided. Key by the thing, not by its position.
