---
title: A pad placed beside the road is fitted to the ground the cone has already CUT, and not re-judged by the band at the verge's climb
date: 2026-09-02
scope: engine/mapgen/carparks.ts, engine/mapgen/homesteads.ts, engine/mapgen/terrain.ts
concepts: [pads, r31, r34, terrain, placement, measurement]
---

A pad within a hundred metres of the route sits on ground R31 has already
cut back to the cone. Fitting its level to `land.heightAt` — the bare
country, which the yard placer uses — and then asking `shelfBand` whether
that level stands inside the cone refused half of every sweep's
candidates (`pad:band` 500-950 refusals over 24 seeds, the single largest
reason) on any stage with relief: the bare hill was higher than the road
and the band, taken at `verge.climb`, is gentler than the cut R34 actually
made (a sealed road's cutting stands at the rock's own angle).

Fit the pad to the terrain's own `heightAt` instead — the ground as the
cone left it — as a PLANE (least squares over rings of probes, held to a
car park's grade) with a residual bound, and check the plane against the
terrain's OWN cone (`ceilingAt`, the `Near.ceiling` the height query
already computes), never against a restatement of it. Skipping the check
is not an option either: a pad is the floor on the cone, so a plane six
metres over the cut ground beside the road fails `explore_test`'s R31
sweep by exactly that; and a "never fill within the cone's reach" rule
refuses a plane fitted through bumpy ground at half its probes by
construction (12,000 refusals a sweep, and the placer three times slower
for trying more candidates).

The plane matters as much as the ground: a level disc 45 m across on a 6%
hillside is 3 m of cut at one rim and 3 m of fill at the other, and
`pad:level` was the second-largest refusal until the pad was allowed to
lie on the slope like a town lot does (`terrain.ts`'s pads carry a
`grade`; the cars stand on `padHeight`).
