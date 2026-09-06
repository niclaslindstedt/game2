---
title: Half the verge steps left are ANOTHER road's cone cutting the crest at the lip — the plan's height rule forgets the route's own corridor
date: 2026-09-06
scope: engine/mapgen/compile.ts, engine/mapgen/spurs.ts, engine/mapgen/terrain.ts
concepts: [r23, r31, spurs, terrain, plausibility, measurement]
---

After the crest rounding, the taiga's remaining `rollers.grade` verge
strides (232 over 24 seeds) split evenly: half within 70 m of a branch, a
public road or the route's other arm, half not. The first class is not a
crest at all: the other road's cone (a min over every road in reach) cuts
through the route's fill inside the route's own lip, and the corridor's
hand-over spreads the difference over one cell (taiga seed 15 at s 2415:
a branch 34 m off and 6 m down, a 6.3 m fall over 14 m from the lip).

The rule that let it happen is `shelfHolds` / `shelfBand` (both copies in
`compile.ts`): a branch may stand `apart` below the route at `bench +
apart / climb` centreline to centreline, which puts its bench's edge AT
the route's lip — every branch at the minimum distance leaves a step of
`lip · climb` (6.6 m) there. `armSeparation` in `search.ts` gets it right
for the route against itself by adding the corridor (`shelfEnd`). Fixing
it means tightening every branch's walk and cut (and `shelfBand`'s other
readers), so it is characterised here and not done: measure the branch
tallies (`roads.stranded`, junction counts, sealed share) before and
after, and keep the road uses of the band apart from the pad uses.
