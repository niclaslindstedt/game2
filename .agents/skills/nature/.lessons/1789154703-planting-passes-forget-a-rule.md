---
title: There are SIX app-side passes that plant something, and a rule asked at one of them is a rule the other five forget
date: 2026-09-11
scope: pwa/src/game/world-scenery.ts, pwa/src/game/wild.ts, pwa/src/game/planting.ts, pwa/src/game/paddock.ts
concepts: [placement, planting, ground-cover, snow, biome]
---

The app plants soft flora in six separate loops, not one: in
`world-scenery.ts` the brush between the trunks, the three ground-cover
bands, and THE VERGE'S OWN FRINGE coming back into the road's bare
shoulder; in `wild.ts` the same brush and cover for the country past 150 m;
the skirt round one trunk (`understoryAround`, planting.ts); and a
paddock's grass (`buildMeadow`, paddock.ts). Each has its own `continue`
guards, so a placement rule added to one silently does not hold in the
others — the snow rule lived in two of the six for a release, and what a
player saw was bright green grass down both verges of a stage running
through a snowfield. The verge pass is the one to check first and the one
that reads worst: it plants every three samples at `half + 0.25 ..
half + bareTo + 0.6`, which is a few metres off the mat, the whole length
of the stage.

Two consequences. Any new "nothing grows where X" rule goes in
`ground-rules.ts` as ONE exported predicate and gets called at all six —
grep `pickFlora|buildFlora` across `pwa/src/` to find them, not
`plantZone`. And `mixAt` cannot carry such a rule for you: `treePlacement`
reads it too, and baring a mix out there turns a winter valley's whole
spruce forest into the highland's krummholz. The trunk rule and the ground
cover's rule are genuinely different questions.
