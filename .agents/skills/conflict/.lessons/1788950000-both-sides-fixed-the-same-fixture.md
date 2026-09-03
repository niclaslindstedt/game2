---
title: When both sides fixed the SAME test for different reasons, taking either one alone re-breaks it — the resolution is both mechanisms, not both lines
date: 2026-09-03
scope: tests/
concepts: [merge, rebase, fixtures, tests, keep-both]
---

A handling change made `water_test`'s shore fixture fail two ways at once, and
main had independently fixed one of them while the branch was fixing the other:

- **main** (#224) moved the seed search into a `beforeAll` with a 300 s
  allowance — the fixture was blowing the suite's 30 s per-test budget.
- **the branch** widened the search from seeds to (seed × entry lock) — a
  roster that slid less put every listed seed in water too deep to drive out
  of, so the search had nothing left to find however long it ran.

Both hunks landed on the same dozen lines, so git raised it as one conflict
and either side resolved alone looks complete and passes review. Neither
works: main's hook searching only seeds still finds nothing, and the branch's
two-axis search still times out.

The tell is that the two sides' commit messages name **different symptoms**.
`git log --oneline HEAD..origin/main -- <path>` and read the message — when it
describes a failure mode yours does not, you are looking at a second bug in
the same place, and "the answer is often BOTH" means both MECHANISMS, not both
blocks of text. Here it was main's hook and allowance wrapped around the
branch's wider search space.

Same shape for the fixture's data: main had appended seeds to the list and the
branch had put a different one at its head. Keeping every seed and leading
with the branch's costs nothing and silently reverts nobody.
