---
title: A placer that hands work back must re-check the hand-back at the END of the pass — a refusal made mid-pass can be undone by a later placement
date: 2026-09-03
scope: engine/mapgen/carparks.ts, engine/mapgen/stands.ts
concepts: [carparks, crowd, placement, invariants]
---

R42 hands back the stands it could not serve so R27 can drop them. The
obvious shape — push the stand onto `refused` the moment `serve` returns
null — is wrong, and the failure is silent for a whole sweep before it
bites.

A stand whose own turn found nowhere to park can be picked up AFTERWARDS by
a later car park's cluster: it is within a walk of that pad even though no
pad could be planned outward from it. It then has a trail running to it and
is still sitting in `refused`, so the drop takes it out from under the trail
and the world holds a path to a crowd that is not there. It showed up on one
seed in twenty-four, only after a rebase moved the landscape under the seed
list — not on the twelve the work was iterated against.

The fix is one line and it belongs at the END of the pass, not at the
refusal: `return refused.filter((s) => !served.has(standKey(s)))`. Any placer
with the same shape — decide, refuse, then keep placing — owes the same
re-check.

The companion rule: a GUARANTEED feature must be exempt from the hand-back
rather than trusted to survive it. R27's finish banks are placed because a
finish always has a crowd, and the country behind a finish is as likely to
refuse a pad as anywhere else — so `stand.finish` skips the refusal, in the
placer and in the analysis check both. Without that, `runout_test`'s "banks
its biggest crowd on both sides of the line" is a test the new rule quietly
breaks.
