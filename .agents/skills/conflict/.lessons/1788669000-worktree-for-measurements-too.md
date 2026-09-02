---
title: A before/after measurement is a merge-shaped hazard — check the old ref out in a worktree, and stop trusting HEAD~1 once the branch has a second commit
date: 2026-09-02
concepts: [worktree, checkout, profile, before-after, measurement]
---

The rule "never run an exploratory command against a conflicted tree" has a
sibling that bites OUTSIDE a merge: a before/after measurement (`make
profile`, a screenshot of the old behaviour) needs the pre-change code built,
and the tempting way to get it — `git checkout <base> -- <files>` over the
working tree, build, meter, `git checkout HEAD -- .` — leaves the tree
half-reverted the moment anything in between fails or is interrupted. On the
car-shadow PR it did exactly that twice: once when `set -e` bailed on a
typecheck and skipped the restore, once when the script was killed to fix
something urgent, each time leaving a deleted new file and five old ones on
disk with the stop hook complaining about a dirty tree.

The base also MOVES: the script hard-coded `HEAD~1`, which was the pre-change
commit right up until a one-line format fix landed on the branch, after which
`HEAD~1` was the feature commit itself and the "before" build had the feature
in it minus its new file.

What works, for a merge or a measurement alike:

```sh
git worktree add /tmp/before <base-sha>        # a real sha, never HEAD~n
ln -s "$PWD/node_modules" /tmp/before/node_modules
(cd /tmp/before && make build && npm run profile)
git worktree remove /tmp/before --force
```

The main tree is never touched, the build there is a real build of that
commit, and there is nothing to restore. Cut the backup branch anyway — it is
free — but the worktree is what makes the backup unnecessary.
