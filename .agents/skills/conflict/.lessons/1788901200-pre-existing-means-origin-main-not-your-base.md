---
title: "Pre-existing on main" is a claim about origin/main's HEAD, not about the commit you branched from — fetch before you make it
date: 2026-09-02
concepts: [rebase, ci, verification, pre-existing-failure]
---

A test failed on this branch. Stashing the changes and re-running it at the
branch's own base commit showed it failing identically, so it went in the PR
body as pre-existing and not this PR's problem.

That was the wrong ref to check. The branch had been cut from a commit whose
own CI was red, and `main` had since merged the fix — four commits ahead, green.
The failure was real, already solved, and one `git fetch` away.

**Before writing "pre-existing on main" anywhere — a PR body, a stand-down
comment, a reply — fetch and look at what `origin/main` actually is now:**

```sh
git fetch origin main
git log --oneline HEAD..origin/main            # what landed that you do not have
git diff --name-only HEAD...origin/main        # …and whether it touches your files
```

A commit message naming the failing area (`test(engine): place the racing car
on a searched straight…`) is the fix announcing itself. Rebasing picked it up
and the suite went green with no change to this PR's diff.

This is rule 2 of the skill wearing a different hat: the stale ref does not
only cost you conflicts, it costs you a wrong diagnosis you then publish. The
merge-base tells you where you started; only `origin/main` tells you what
"already fixed" means today. Cheapest habit: fetch at the FIRST red test, not
at the end when you are ready to sync.
