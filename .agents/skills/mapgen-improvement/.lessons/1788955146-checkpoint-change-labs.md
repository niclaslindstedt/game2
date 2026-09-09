---
title: A checkpoint-only change is invisible to analyze, rate and sim — measure the boards against their corners instead
date: 2026-09-09
scope: engine/mapgen/compile.ts, engine/mapgen/rules.ts
concepts: [checkpoints, measurement, labs, seeds, previews]
---

`engine/analysis/` and `engine/rating/` never read `track.checkpoints` (grep
says so), so moving a board changes NOTHING in `make analyze` or `make rate`
— a before/after diff of `make analyze COUNT=24` on two worktrees came back
identical except the `perf.build` timing column, which is machine noise.
`make sim` is identical too whenever the sweep records no respawns, since the
bot drives the same road and only the split LINES moved. And `make previews`
is not owed: `routes` regenerates `stage-routes.ts` from road geometry alone
(it came back byte-identical) and `biomes` photographs the country from over
the start line. Run `npm run routes` and check `git status` rather than
assuming a rules.ts edit re-rolls the boxes.

What DOES measure it, in a scratch script over `compileStage`:

- each board's arc position minus its corner's `endS` (the note it belongs to
  is the last `track.pacenotes` entry with `endS <= board.s`), bucketed by
  `note.angle` — that is the placement claim stated as a number;
- board-to-board gaps over 200 sequential seeds against the
  `spacing × pace × early` floor and `× forced` ceiling, plus board COUNT: a
  board placed earlier gives the next corner more road to clear the bar, so
  the count drifts up (1929 → 1943 across 200 medium stages) while the floor
  must still hold.

`make level SEED=n LENGTH=long` is the fast look — it prints every board as
"on the exit of T4" with T4's own sweep and radius on the line above, so one
diff of its text against the baseline worktree names exactly which boards
moved and by how much.
