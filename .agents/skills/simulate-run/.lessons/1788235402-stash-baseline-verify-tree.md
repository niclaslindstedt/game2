---
title: After a `git stash` baseline run, check `git stash list` before trusting the next measurement — a result identical to the baseline usually means the stash never came back
date: 2026-08-30
scope: engine/, scripts/
concepts: [simulation, harness, regression, tooling, measurement]
---

The stash-the-change-and-re-measure technique is the right one, and it has a
failure mode that produces confident wrong numbers rather than an error.

`git stash push -- <paths> && make build && <measure>` chained with `&&`
leaves the tree STASHED if any later step fails, and a long measurement moved
to the background outlives the message that was going to pop it. Every
measurement taken after that reports the baseline while you read it as the
change. The tell is the one thing that should be impossible: an "after"
number byte-identical to the "before" on a table the change was supposed to
move — or, worse, identical on one that it wasn't, which reads as a clean
result.

Two habits fix it. Pop in its own command, never chained behind something
that can fail. And before believing any before/after pair, run `git stash
list` and `git status --short` — an empty stash list and the expected
modified files is the whole check, and it costs nothing next to re-running a
15-minute sweep.
