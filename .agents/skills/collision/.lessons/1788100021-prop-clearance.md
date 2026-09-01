---
title: New solids beside the road cost nothing in the sim if they clear ROAD_CROSS.reach measured to their RIM
date: 2026-08-28
scope: engine/mapgen/terrain.ts
concepts: [collision, placement, balance, simulation]
---

Turning the roadside rocks and outcrops solid sounds like a balance
change and was not one: 24/24 bots still finished, pace and respawns
unmoved, one row of the table changed at all. What buys that is the
clearance rule, not the density. Solids stand off the road ribbon's own
reach (`ROAD_CROSS.reach`, 6.5 m past the mat — where the trees already
started), and the test is `near.d - radius`, not `near.d`: a 4 m outcrop
placed by its CENTRE at the band's inner edge reaches back over the
shoulder, which is how a "beside the road" prop ends up on it. Size has
to be clamped by the room available (`(edge - clear) / 0.85`), not just
rejected, or the big ones only ever appear where the band is widest.

The reachable check for whether a change like this is live at all is a
scripted off-road excursion, not the sim: bots barely leave the mat, so
`make sim` is a no-regression signal and never a confirmation. Drive
`createGame`/`step` with a couple of seconds of full lock, watch
`car.damage.version` change, and name the nearest solid at each bump —
rocks, stumps and outcrops all showed up that way in one run.
