---
title: Get the BEFORE half of a sim/analyze table from a `git worktree`, never from `git stash`
date: 2026-09-06
scope: (global)
concepts: [sim, analyze, verification, git, worktree, stash]
---

The PR owes `make sim` (and `make analyze`) before AND after on a
handling or generator change, and the "before" has to come from a tree
without the change in it. Reaching for `git stash` to get one is a trap:
both targets take three to ten minutes, the whole working tree is
reverted for all of it, and nothing else in the session can be edited or
even safely read until the stash pops. Any background job started in the
meantime — a screenshot pass, a test batch — silently measures the
STASHED tree, which is the one thing that must not happen to an "after"
run.

Use a second checkout instead:

```sh
git worktree add /tmp/base HEAD          # or origin/main
ln -s "$PWD/node_modules" /tmp/base/node_modules
(cd /tmp/base && make sim > /tmp/base-sim.txt)
git worktree remove /tmp/base --force
```

The symlink is what makes it cheap — `npm install` in the second tree is
minutes and is not needed, since both trees run the same dependency set.
Diff the row bodies rather than whole outputs (`grep -E '^ +[0-9]'`), so
the npm banner and the harness's own trailer do not read as a change.

The same worktree answers "is this analyze failure pre-existing?", which
is a claim a reviewer will otherwise have to take on trust.
