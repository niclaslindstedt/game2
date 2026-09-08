---
title: An 8-12 seed finding tally is too noisy to judge a country change — take the baseline from a worktree at the SAME count, and hold one variable at a time with the dial
date: 2026-09-08
scope: engine/mapgen/
concepts: [measurement, analysis, seeds, baseline]
---

Any change to a country re-rolls the search, so `make analyze COUNT=12`
before and after are twelve DIFFERENT stages and the finding tally moves for
reasons that have nothing to do with the change. A desert dune change read as
`rollers.bump` 162 → 230 and 3 → 6 failing seeds at COUNT=12, and as 229 → 252
and 7 → 8 at COUNT=16 against a proper `origin/main` worktree — the second is
the real number and the first was noise plus two clobbered constants.

Two things make the comparison honest, and they are cheap:

- **Baseline from a worktree at the SAME count** (`git worktree add ../base
origin/main`, symlink `node_modules`). Comparing your COUNT=8 against your
  own memory of a COUNT=12 is comparing two different sweeps.
- **Where the thing is a DIAL, hold everything else and move the dial.**
  `npm run analyze -- --biome desert --dunes 0.07` against `--dunes 0.22` on
  ONE tree isolates the height from the shape: it showed the height cost
  nothing (131 vs 133 bumps) and the profile exponent cost all of it. The CLI
  loops `NUMERIC_KNOBS`, so every new dial gets this for free.

COUNT=16 is about the floor where a tally means anything, and it is a couple
of minutes.
