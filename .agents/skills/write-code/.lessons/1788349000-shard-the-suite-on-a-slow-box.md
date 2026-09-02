---
title: A bare `make test` on a slow or busy box fails as 20-second TIMEOUTS in the analysis/mapgen sweeps — run it as CI does, `SHARD=1/3` … `3/3`
date: 2026-09-02
scope: tests/
concepts: [test-conventions, harness, measurement, flaky]
---

`make test` runs all 61 files in parallel, and the heavy seed sweeps
(`tests/analysis_test.ts`, `mapgen_test.ts`, `towns_test.ts`,
`water_test.ts`) each build and score dozens of stages. On a container with
a handful of cores — or one already running `make profile` or a screenshot
pass — those tests lose their share of the CPU and vitest kills them at the
20/30/60-second mark. The report reads `8 failed`, every one of them
`Error: Test timed out`, with no assertion in sight.

**A timeout is not a failing assertion.** Before treating one as a
regression, check two things: that every failure line says "timed out", and
that the same file times out on `origin/main` (a worktree —
`git worktree add … origin/main`, then `ln -s /home/user/game2/node_modules
node_modules` so vitest resolves — never a stash around a long run). Both
were true here for a renderer-only change that no engine test imports.

The fix is not a bigger `testTimeout` and not `--no-threads`: it is what CI
already does. `make test` takes `SHARD=i/N`, and the workflow runs three
slices. Run them one after another (`for s in 1 2 3; do SHARD=$s/3 make
test; done`) and each slice has the machine to itself. Nothing else should
be running while they do — a `make profile` in another shell is what turns a
green suite red.
