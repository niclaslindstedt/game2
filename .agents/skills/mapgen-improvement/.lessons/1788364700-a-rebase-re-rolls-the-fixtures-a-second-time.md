---
title: A generator branch rebased onto a generator commit re-rolls every seed fixture AGAIN — re-sweep on the rebased tree, and read a new failure as the other commit's rule before yours
date: 2026-09-02
scope: tests/, engine/mapgen/towns.ts
concepts: [seeds, test-conventions, rebase, towns, railway]
---

Re-pinning a suite's seeds on the branch is only half the job when `main`
has moved under it with a generator change of its own: the rebased tree is
a third generator, and its routes match neither side's fixtures. After the
rebase, run the seed sweeps again (crossings, the tarmac-spill seed, the
drown seeds) before pushing, not after CI does.

And a failure that only appears on the rebased tree is usually the OTHER
commit's vocabulary meeting your routes: the railway's arms are ballast by
design (R41), so a branch suite asserting every spur is tarmac fails the
first time a fixture seed crosses a railway — skip `spur.rail` there. A
town that came out one-sided, and then with two fronts overlapping on the
inside of a bend, was R39's own walk (a side may stall out; the cursor
spaces fronts in street arc, not across the ground) exposed by a street it
had not been asked to build on before — fixed in `towns.ts`, not around.
