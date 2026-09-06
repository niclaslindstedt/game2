---
title: Never pipe a long measurement through `tail -N` — the harness backgrounds the command and the rows you needed are the ones tail cut
date: 2026-09-06
concepts: [measurement, baseline, harness, tooling, profiling]
---

`make profile` (and `make sim`, `make drift`) run past the tool timeout and get
moved to the background, where the only record is the output file. Piping them
through `tail -18` to keep the reply short throws away the table's HEAD, and
the row a lighting or handling change actually moves is usually in it — so the
baseline has to be run again, at ten minutes a go, and on a worktree that may
already have been removed.

Let the whole table land in the output file and `grep` the rows out of it
afterwards, or narrow at the SOURCE instead: both `scripts/profile-render.mjs`
and `scripts/screenshot.mjs` take bare words as a scene filter
(`node scripts/profile-render.mjs storm`), which is a tenth of the wall clock
and prints the rows in full.

One trap in that filter: `screenshot.mjs` matches with `name.includes(word)`,
so `shot-brakes` does NOT match `shot-night-brakes`. Pass every prefix you
want, or a word common to all of them.
