---
title: Before adding a check, run it against the DEFECT — and look for an existing check whose threshold was widened to let the bug through
date: 2026-09-08
scope: engine/analysis/
concepts: [analysis, measurement, budgets, checks, review]
---

Fixing the alpine's "field of needles" I wrote `ground.summits` — distinct
local maxima per km² — and it did not separate the cases at all: the broken
country measured 6.06/3.41/1.81 and the fixed one 3.82/2.62/1.77. A ridged
fold makes crest LINES, not points, so counting local maxima was measuring the
wrong object. A roughness ratio was no better (the ranges overlapped across
seeds). Shipping either would have been a proxy nobody believes, optimised
against later.

The instrument that did separate them was already there: `ground.cliff` read
0.123-0.513 on the broken country and 0.014-0.125 on the fixed one. Its alpine
ceiling was 0.65 — wide enough to accept two thirds of the country standing
steeper than 1:1, which is exactly the defect. **A budget wide enough to
accept the bug is the commonest reason a whole class of defect goes
unreported**, and the alpine scored 97.5 as a mesa because of it.

So, in order:

1. Write the candidate check, then run it against a deliberately BROKEN build
   (re-widen the constant you just narrowed) and against the fixed one. If the
   two ranges overlap, the check is wrong — not the threshold.
2. Before writing anything new, grep the budgets for an existing check on the
   same property and ask what its threshold would have had to be to catch
   this. Tightening one with a measurement in the comment beats a new check.
3. `ground.summit` (share of the box within a twentieth of the summit) DID
   separate cleanly — 0.600 on a mesa against 0.001-0.006 — because it
   measures the shape's own signature rather than a proxy for it.
