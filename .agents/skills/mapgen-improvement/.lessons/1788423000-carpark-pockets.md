---
title: A rally route partitions its own box — a car park lane usually cannot reach tarmac, and neither more highways nor post-hoc ones fix it
date: 2026-09-03
scope: engine/mapgen/carparks.ts, engine/mapgen/publicroad.ts, engine/mapgen/highway.ts
concepts: [carparks, asphalt, road-network, spurs, search, r23]
---

Making R42's lane REQUIRE a public road (rather than allowing it to run off
the map) looks like a small tightening and is not. Measured over seeds 1-12
at medium it left 8 of 12 stages with no crowd anywhere on them, and every
obvious remedy fails for a structural reason worth knowing before you try
it:

- **Raising `highwayCount` is not available.** The route may not cross
  tarmac, so a second line laid BEFORE the search partitions the country it
  has left; `highway.ts` names the seed that then generates at no sub-seed
  at all.
- **Laying extra lines AFTER the route does not work either.** A road has
  to run rim to rim to go anywhere, and a rim-to-rim line across a box a
  4.5 km route is folded into crosses that route somewhere on essentially
  every draw. Five extra draws a seed yielded ONE extra road over twelve
  seeds — measured, then deleted.
- **The pocket is real, not a search cap.** Raising `SEARCH_CAP` from 6000
  to 40000 changed nothing on any seed. The route's own corridor plus R23
  cuts the box into pockets, and the country's one public road is in one of
  them.

So the honest shape is: PREFER a road and pay a detour for it (`RIM_PENALTY`
in the A*'s heuristic — a constant added to every rim cell, which biases the
choice between goals without changing the path when there is no road to
choose), and fall back to the rim. What DOES raise the tarmac on the ground
is building the lines the route never met (`publicroad.ts`): 4 of 12 seeds
had a sealed road before, 12 of 12 after.
