---
title: Calling a failure "not this PR's" is a claim about origin/main's HEAD AND about CI — local-red with CI-green is an environment, not a pre-existing bug
date: 2026-09-02
concepts: [rebase, ci, verification, pre-existing-failure]
---

Two ways to get this claim wrong, and it is a claim that goes in a PR body or
a stand-down comment, where being wrong is public.

**Wrong ref.** A test failed on a branch. Stashing and re-running it at the
branch's own BASE commit showed it failing identically, so it went in the PR as
pre-existing. But the branch was cut from a commit whose CI was red, and main
had since merged the fix — four commits ahead, green. The merge-base tells you
where you started; only `origin/main` tells you what "already fixed" means
today.

```sh
git fetch origin main
git log --oneline HEAD..origin/main          # what landed that you do not have
git diff --name-only HEAD...origin/main      # …and whether it touches your area
```

A commit message naming the failing area (`test(engine): place the racing car
on a searched straight…`) is the fix announcing itself.

**Wrong conclusion.** Later session, `water_test.ts` failed locally and
reproduced at `origin/main`'s real HEAD in a worktree — so "pre-existing" was
the right REF and still the wrong WORD: CI's own shards passed it on both refs.
A test that is red on a loaded sandbox and green on CI is timing-sensitive, not
broken, and saying "pre-existing failure on main" invites somebody to go
looking for a bug in `main`. It was fixed two hours later by moving the heavy
fixtures into a hook so the first case is not charged for them
(`test: charge the heavy fixtures to a hook`) — a timeout, exactly as the
split verdict suggested.

So before writing it: fetch, and check the same test on CI. Then say which of
the three it is — already fixed upstream, genuinely broken on main, or an
environment. The three ask for different things from the reader.
