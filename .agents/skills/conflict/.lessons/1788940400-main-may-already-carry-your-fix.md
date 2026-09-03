---
title: When main has landed the same incidental fix, resolve to main's side WHOLE — the replayed commit then drops itself empty
date: 2026-09-03
concepts: [rebase, merge, duplication, pre-existing-failure, verification]
---

The sibling case to the duplicated-facility lesson, one level up: not a copy of
a helper but a whole COMMIT that main already carries. A branch fixed something
incidental on its way past — a slow test, a lint warning — and main landed the
same fix first and better. On the car-stand PR it was `tests/water_test.ts`'s
seed search: identical `beforeAll` hoisting, but main's covered BOTH searches
under a named `SEARCH_ALLOWANCE` and re-ordered the seed list so the leader is
found in one plunge instead of a tail scan.

Both sides of that hunk say the same thing, so it is not a merge and there is
nothing to combine. Take main's side whole — `git checkout --ours -- <path>`
during a rebase — and the replayed commit comes out EMPTY, which
`git rebase --continue` drops on its own; the branch is simply one commit
shorter. Do not fuse the two into a third version, and do not keep yours
because it is yours: main's is already reviewed.

Two follow-ons. Read the commit SUBJECTS in `HEAD..origin/main` BEFORE starting
the rebase — knowing main carries your fix turns the conflict into a `--ours`
whose answer you already have. And correct the PR body: it is describing a
commit that no longer exists, which is worse than describing none.

This is the good outcome of a "not this PR's" investigation, and the same fetch
answers all three of them — main already fixed it, main is genuinely broken, or
it is your environment.
