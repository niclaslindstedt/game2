---
title: A defect in MAIN's side of a conflict is still main's to fix — take it verbatim and say so, never repair it inside the resolution
date: 2026-09-06
concepts: [merge, rebase, review, keep-both, verification]
---

"When the two contradict, main wins" says nothing about the case where
main's side is simply WRONG. Resolving #311 onto #310, main's half of the
`docs/architecture.md` hunk carried the same 400-word sentence twice — a
copy-paste slip that had already been reviewed and merged.

Deleting the duplicate would have been correct prose and a bad merge. A
reviewer reading the resolution diff sees a chunk of the paragraph they
just landed missing, with no way to tell a repair from a clobber; and the
fix is then buried in an unrelated PR where nobody looking for it will
find it. Both failure modes are worse than the typo.

So: take main's side EXACTLY as written, ship the resolution, and report
the defect separately — a line to the user, or its own PR. The rule
generalises past prose. Anything wrong on main that a conflict happens to
put in front of you (a stale comment, a duplicated row, an off-by-one in a
number you are not touching) is a separate change, because a merge diff is
read as "what this branch does to main" and every hunk in it that is not
that costs the reviewer their trust in the rest.

The one exception is the change your branch cannot compile without. Then
it is not a repair, it is a dependency — make it, and say in the PR body
that you did and why.
