---
title: A rule about what a SURFACE may carry has three possible homes, and the search is the wrong one
date: 2026-08-31
scope: engine/mapgen/generate.ts, engine/mapgen/compile.ts
concepts: [asphalt, junctions, search, measurement, road-network]
---

R20 ("no hairpins on the borrowed tarmac") looked like a search-side rule:
cap the corner where the paving field wants tarmac, and the hairpin never
exists. Measured over 24 seeds it was the WORST of the three options —
tighter tarmac than doing nothing (8.3% of sealed road at worst against
6.1%), and it took R18's `water.road` findings from 37 to 213.

The reason generalises. The search does not know where a seal actually ENDS:
the surface change waits for a junction whose abandoned arm can leave the
map, which is a question about country the search has not walked. Covering
that means dilating the rule over the gravel around the field's bands, and a
route with its corners capped over a third of its length is a STRAIGHTER
route — which then runs alongside its own valleys, and R18 traces the water
along them. **A cap on the vocabulary is never local: it changes the line,
and the line is what every other rule is measured against.**

The join-side refusal (don't seal a run with a hairpin in it) is honest and
nearly useless on its own — any window long enough to cover the overrun
throws away two fifths of the stage's tarmac, which is R15's dial quietly
stopping meaning what it says.

What worked was acting at the last possible moment, on the exact fact: the
surfacing RUNS OUT at the corner. That costs one carve-out in R17 (the only
surface change with no junction at it) and it is worth it — the alternative
lies are bigger. When a rule can only be enforced late, enforce it late and
write the carve-out down, rather than approximating it early.
