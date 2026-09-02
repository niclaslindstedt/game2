---
title: A branch's NEW function beside an old one auto-merges clean and keeps the idiom main just moved off
date: 2026-09-02
concepts: [rebase, semantic-conflict, verification, copy-paste]
---

The dangerous rebase is not the one that stops. This branch added `glassSpray`
in `car-dirt.ts` directly under `dirtRate`, written in its image — same
`state.track.samples[state.progressIndex]?.surface` lookup. Main then fixed
that lookup everywhere it appeared, `dirtRate` included, moving it to
`state.nearIndex` (the road UNDER the car, not the road the run has reached).

Git saw one side edit an existing line and the other side add new lines
elsewhere: no conflict, no marker, no prompt. The rebase reported success and
left the file with `dirtRate` on `nearIndex` and `glassSpray` on
`progressIndex` — two functions three lines apart answering the same question
two different ways. Tests passed, because the shared test helper sets both.

So after ANY clean rebase, grep the whole file for the identifier the branch
copied from its neighbour:

```sh
grep -n 'progressIndex\|nearIndex' <file>     # the pair should agree
git log --oneline -1 HEAD..origin/main -- <file>   # what main did to it
```

The rule generalises: a branch that adds code MODELLED ON existing code owes a
read of what main did to the original. `git diff origin/main -- <path>` proves
nothing was lost; it cannot tell you the new hunk should have moved with the
old one.
