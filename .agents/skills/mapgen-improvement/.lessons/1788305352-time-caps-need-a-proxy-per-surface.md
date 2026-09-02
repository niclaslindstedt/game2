---
title: A vocabulary cap that is really a TIME needs one metre proxy per surface, and it must bind the RUN rather than the segment
date: 2026-09-01
scope: engine/mapgen/rules.ts, engine/mapgen/generate.ts, engine/mapgen/borrow.ts
concepts: [rules, search, asphalt, road-network, measurement, tuning]
---

R38 ("never drive straight for more than five seconds") is a time, and the
search can only count metres. Two things fall out of that and both were
learned the hard way.

**Bind the RUN.** Capping the drawn segment does nothing: nothing stopped the
search drawing straight after straight, and four legal straights in a row came
out as 400 m of nothing. The cap has to be walked back over the committed
plans (`straightRunAt` in `search.ts`), recomputed after a backtrack the way
the same-direction run is, and read by every search — sprint, circuit AND the
endless stream — plus the closing straight, which lands on whatever the search
stopped on.

**One proxy per surface.** Metres come out of seconds through the speed the
road is met at, so the cap is set by the SLOW case: a gravel straight taken
out of a corner the car had to stop for runs at ~30 m/s, so five seconds is
135 m. Applying that same 135 m to a BORROWED public road (R17) killed R17: a
public road is laid to get somewhere and runs straight for 200-300 m at a time
between its bends, so 92% of every stretch the search looked at was refused
and the `asphalt` dial stopped buying anything. Tarmac is joined and held at
speed, so it gets its own, longer proxy (`straightRun.borrowed`).

**And a borrow ENDS where the road stops bending**, rather than being refused
whole. `followRoad` returning null on the first over-long straight meant the
dial had to find a road that was interesting for the entire length it asked
for, which no road is. Returning the index it reached — once past
`runOn.min` — is what keeps R17 alive.
