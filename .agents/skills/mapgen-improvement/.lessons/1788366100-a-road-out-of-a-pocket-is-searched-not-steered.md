---
title: A road that has to LEAVE the map from the middle of a folded stage is found by search over a coarse passability map, never by steering with a look-ahead
date: 2026-09-02
scope: engine/mapgen/carparks.ts, engine/mapgen/carpark-map.ts, engine/mapgen/spurs.ts
concepts: [search, spurs, road-network, r23, placement, performance]
---

`buildSpur` steers a branch off a junction with a 130 m look-ahead and cuts
it wherever it comes inside R23's clearance. That is right at a junction —
the branch leaves ALONG the main road, away from the stage — and wrong for
a road that starts in the country: a medium stage is 4-5 km of road folded
into a 2 km box, so most of the country beside it is a pocket between two
arms, and a lane driven out of one runs into the far arm a few hundred
metres on. On a 24-seed sweep 9 in 10 lanes built that way were cut
(`road:stage` at 200-600 m), and the builds were three quarters of the
terrain's whole sync time.

What works: read the country as a lattice of cells (`carpark-map.ts`, 24
m) that lazily answer "may a road pass through here" (R23's clearance
from the route and every built road, dry ground) and "may a person walk
here", then A* from the pad to the map's edge — or to a road already
going there, which is one road across the country instead of two side by
side — and lay the road along the cells found, pulled straight where the
cells between two waypoints are all passable, at a road's radius. A pocket
answers "no way out" in a few hundred cells instead of a thousand-step
walk that ends cut. Cache the heuristic per cell: an open list scanned
for its best entry on every pop asks it thousands of times.

Two riders. The cell's passability must be STRICTER than the walk's own
check by the cell's half-diagonal, or the walk refuses roads the search
promised (`road:built` went from 9 to 161 when the two disagreed). And a
lane joining another road has to be allowed inside that road's clearance
on its way in — measured against the joined road's samples near the join,
not against the join point alone.
