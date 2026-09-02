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
cone left it — as a PLANE (least squares over two rings of probes, held
to a car park's grade) with a residual bound, and let R31 hold by
construction: the plane is within the residual of ground the cone has
already passed, everywhere on the pad. Asking the band again at that
point is asking a stricter question than the terrain did, and it costs
thirty-three probes per candidate on top.

The plane matters as much as the ground: a level disc 45 m across on a 6%
hillside is 3 m of cut at one rim and 3 m of fill at the other, and
`pad:level` was the second-largest refusal until the pad was allowed to
lie on the slope like a town lot does (`terrain.ts`'s pads carry a
`grade`; the cars stand on `padHeight`).
