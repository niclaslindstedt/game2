---
title: A change to the stage vocabulary re-rolls every seed fixture in the suite — budget for six files, and do not re-pin around a defect the re-roll uncovered
date: 2026-09-01
scope: tests/
concepts: [seeds, test-conventions, measurement, mapgen-improvement]
---

Adding one rule to `engine/mapgen/rules.ts` turned eight test files red, and
only one of them was about the rule. Every seed's stage is different
afterwards, so plan for the fixture work as part of the change rather than as
a surprise at the end:

- **Sweeping fixtures stop finding their subject.** `roads_test`'s
  `firstBranch` and `analysis_test`'s barrier search walk a short seed list;
  when the thing they hunt gets rarer, they run off the end. Widen the list.
- **Pinned fixtures point at the wrong stage.** `crossing_test`'s `CROSSINGS`
  and `water_test`'s `SHORE_SEEDS` shortcut both had to be re-swept. Their own
  comments say to expect this.
- **Harness budgets are sized to the old pace.** `simulation_test`'s 240 s
  `maxTime` and vitest's 30 s per-test timeout both tripped on stages that got
  slower or on files that got heavier — a timeout reports as an assertion
  failure with no message, and the test passes when run alone. Run the file on
  its own before believing a failure in it.

The trap worth naming: **a re-rolled fixture can start landing on a defect
that was always there.** Three of ours did — a branch ending in water, a
crossing ramp over its grade bar, a ford whose channel stops at the road edge.
Check each against `origin/main` with the SAME seed before deciding whose it
is (a second worktree, `git worktree add ../base origin/main`, is the cheap
way). Where it reproduces on main, say so in the PR and choose fixtures that
do not sit on it; where it does not, it is yours. Silently re-pinning without
checking is how a pre-existing bug gets a new owner, or a new one gets hidden.
