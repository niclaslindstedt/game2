---
title: `--force-with-lease` fails with "stale info" whenever the branch has NO remote counterpart — deleted after its PR merged, or never pushed at all; prune, then push plain
date: 2026-08-28
concepts: [rebase, push, remote-branch, pr]
---

Two ways to get here, one symptom. A designated branch whose earlier PR has
been merged and deleted upstream still has a remote-tracking ref in the clone,
pointing at a commit that is now on `main`. Or the branch was rebased before
its FIRST push, which is the normal shape of a task that took long enough for
`main` to move — the rebase makes the push a forced one by habit, and there is
no remote branch for the lease to compare against. Either way:

```
! [rejected] <branch> -> <branch> (stale info)
```

`--force-with-lease` compares against that dead tracking ref and refuses,
because from its point of view the remote moved. `git fetch origin <branch>`
answers `couldn't find remote ref`, which is the confirmation the branch is
gone rather than ahead.

The fix is `git remote prune origin` (or `git fetch --prune origin`) and then a
PLAIN `git push -u origin <branch>` — there is no remote history to force over,
so forcing is not what was needed in the first place. Do not reach for
`--force`: the rejection is not the case with-lease exists to protect against,
and the plain push proves it by succeeding.
