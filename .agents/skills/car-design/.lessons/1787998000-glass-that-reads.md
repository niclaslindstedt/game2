---
title: A screen's dirt, its wiper and its opening are one design — and everything built up under a raked screen has to lean with it
date: 2026-08-29
scope: pwa/src/game/car/wipers.ts, pwa/src/game/car/interior.ts, pwa/src/game/car/greenhouse.ts
concepts: [wipers, glass, dirt, greenhouse, interior, rake, backlight]
---

**The fan is the thing, not the arm.** What says "rally car" from behind is
one clean half disc cut out of a caked back window, and it takes four
choices that are really one: a single arm, its pivot on the CENTRELINE, its
park flat on the sill, and a sweep the whole way to flat on the other side.
Any one off and it is an off-centre wedge that reads as a hole in the
texture. A reach just under the pane's height leaves all four corners
caked, which is the other half of the shape.

**Measure the arm up the GLASS, not up the air.** A raked backlight is half
again as long along its slope as it is tall, so "as long as the window" is
two numbers; take the reach as a fraction of the pane's own height.

**Anything built up under a raked screen leans with it.** A box has one
front face for its whole height, so taking that face to the cowl stands its
TOP out in the open over the scuttle — from outside, a dark bar across the
bottom of the windscreen, drawn over the glass, the film and the parked
wiper. Every part needs the lookup on its own account (the binnacle pokes
through at its own height after the dash is fixed), and absolute metre
offsets hung off a FRACTION of the cabin (`hipZ + 0.6`) land ahead of the
cowl on any short body. Anchor to the cowl.

**Dry road grime is SAND.** Lerping a water film straight to mud paints a
dry gravel stage the colour of a puddle: three tones — water, dust, wet
earth — picked by how much rain there is.

**A dirt film's grid is about the ARC EDGE, not the dirt.** Under about
thirty cells across a swept fan is three big triangles; 36x24 costs nothing.

**Judge a screen square on** — `make cars` has a dead-astern "dirty rear"
cell because at three quarters a fan is a blob and a parked arm a stick.
