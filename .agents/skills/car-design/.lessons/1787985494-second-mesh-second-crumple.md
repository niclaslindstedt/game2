---
title: A new mesh on the chassis must be added to the damage crumple too, or it stands pristine in front of a folded cap
date: 2026-08-29
scope: pwa/src/game/car-damage.ts, pwa/src/game/car-body.ts
concepts: [damage, crumple, materials, lamps]
---

`createCarDamage` re-derives vertices from a pristine copy, and it only ever
knew about `body.body` — the shell. Anything split into its OWN mesh to get
its own material (the lamp lenses, for the environment-tint exemption) leaves
that loop, and a crushed nose then folds around a lamp still standing exactly
where it was bolted. It is the most obvious thing on a damaged car, and no
test catches it.

`bend` is now a `Crumpleable[]` — `{pos, col, restPos, restCol}` per mesh —
so a second mesh is one push. Split a new material off the body and you owe
that push, unless the part genuinely sits outside the crush zones (the
greenhouse glass does, which is why it was never in there).

The cost of the split is a draw call per car. Pay it back where you can: the
lamp BLOOMS were a plane mesh per cluster, and merging each end's pair into
one hand-built two-quad geometry gave back more than the lens mesh took —
`make profile`'s `field` scene came out three draws UNDER the baseline.
