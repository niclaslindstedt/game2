---
title: A screen's dirt, its wiper and its opening are one design — and everything built up under a raked screen has to lean with it
date: 2026-08-29
scope: pwa/src/game/car/wipers.ts, pwa/src/game/car/interior.ts, pwa/src/game/car/greenhouse.ts
concepts: [wipers, glass, dirt, greenhouse, interior, rake, backlight]
---

**The fan is the thing, not the arm.** What says "rally car" from behind is
one clean half disc cut out of a caked back window. Getting it needs four
choices that are really one: a single arm, its pivot on the CENTRELINE, its
park flat on the sill, and a sweep the whole way to flat on the other side.
Any one of them off and it is an off-centre wedge that reads as a hole in
the texture. Reach just under the pane's height leaves all four corners
caked, which is the other half of the shape; at one the blade scrubs the
header and the cake is a thin frame.

**Measure the arm up the GLASS, not up the air.** A backlight can lean far
enough that its length along the rake is half again its standing height, so
"as long as the window is tall" is two different numbers. The fan's reach is
the one anybody looks at — take it as a fraction of the pane's own height.

**Anything built up under a raked screen leans with it.** A box has one
front face for its whole height, so taking that face to the cowl stands its
TOP out in the open air over the scuttle. From outside that is a dark bar
lying across the bottom of the windscreen, drawn over the glass, the grime
film and the parked wiper — and every part needs the lookup on its own
account, not the one next to it: the binnacle stands proud of the dash and
pokes through at its own height after the dash is fixed. Watch for absolute
metre offsets hung off a FRACTION of the cabin (`hipZ + 0.6`): they land
ahead of the cowl on any body short enough. Anchor to the cowl.

**Dry road grime is SAND.** Lerping a water film straight to mud paints a
dry gravel stage the colour of a puddle. Three tones — water, dust, wet
earth — and pick the road one by how much rain there is.

**A dirt film's grid resolution is about the ARC EDGE**, not the dirt. Under
about thirty cells across, a swept fan is three big triangles of clean glass
and reads as a texture glitch. Two panes at 36x24 cost ~3.5k triangles and
show up in `make profile` as nothing next to a car.

**Judge a screen square on.** A three-quarter cell hides everything: a fan
foreshortens into a blob, a parked arm foreshortens into a floating stick,
and a bar poking through the glass looks like a visor. `make cars` grew a
dead-astern "dirty rear" cell for exactly this.
