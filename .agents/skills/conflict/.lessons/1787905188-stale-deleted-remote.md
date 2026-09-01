---
title: `--force-with-lease` fails with "stale info" when the remote branch was deleted after ITS pr merged — prune, then push plain
date: 2026-08-28
concepts: [rebase, push, remote-branch, pr]
---

A designated branch whose earlier PR has been merged and deleted upstream still
has a remote-tracking ref in the clone, pointing at a commit that is now on
`main`. Restarting the branch from `origin/main` and pushing then fails:

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
