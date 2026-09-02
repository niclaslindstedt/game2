---
title: A placer that runs ON the terrain field reads its own products back through the field's queries — split what the forest keeps off from what a road keeps off, and hang the reject tally on a module hook
date: 2026-09-02
scope: engine/mapgen/carparks.ts, engine/mapgen/terrain.ts
concepts: [placement, terrain, renderer-seam, measurement, performance, density]
---

The stands, the guards and the car parks are placed in `terrain.ts`'s
`sync`, not in the compiler, because they are placed against the built
world. Two things follow that the compiler-side placers never meet.

**The field's own clearance query grows what the placer commits.** The
car parks fold their trails into `spurClearance` so the forest keeps off a
footpath — and the lane search read the same query as "how far is the
nearest road" and held every lane 31 m off every footpath, which cost 300
ms a seed in cut roads. Keep two queries: `builtClearance` (roads, pads,
clearings — what a road or a pad keeps off) and `spurClearance` (that,
plus the paths — what a tree keeps off). A road may cross a path.

**The reject tally cannot be handed in.** The lesson that says "tally the
reject reasons before touching the dice" assumes a probe can build the
placer's context; here the field builds it, so the probe has nothing to
hand a counter to. `carParkTally.note` is a module-level hook the probe
sets and the field's context falls back to — null in the game. Do that
rather than instrumenting the module by hand for every pass (and never
through a shell heredoc: the first attempt did, and it is exactly the
rewrite `write-code` forbids).

Also: on an endless stage a placer like this reads the route as far as it
has been laid. A pad or a lane searched over that country can differ with
how the stream was chunked, however long `hold` is, because the route may
fold back into the box kilometres later — the chunked-vs-single test for
such a feature asserts the rules and the served stands, not the metre.
