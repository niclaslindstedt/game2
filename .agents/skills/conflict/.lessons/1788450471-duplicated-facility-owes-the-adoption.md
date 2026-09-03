---
title: A branch that grew its own copy of something main has since factored out owes the ADOPTION — and the copy is the bug whether the merge conflicts or not
date: 2026-09-02
concepts: [rebase, merge, semantic-conflict, verification, copy-paste, duplication]
---

Two symptoms, one rule. Both are about a branch whose new code was MODELLED ON
code main then moved.

**The clean merge hides it.** A branch added `glassSpray` in `car-dirt.ts`
directly under `dirtRate`, in its image — the same
`state.track.samples[state.progressIndex]?.surface` lookup. Main then fixed
that lookup everywhere it appeared, `dirtRate` included, to `state.nearIndex`
(the road UNDER the car, not the road the run has reached). One side edited
existing lines, the other added new lines elsewhere: no conflict, no marker.
The result had two functions three lines apart answering one question two
ways, and the tests passed because the shared helper sets both.

**The conflicting merge SHOWS it — the hunk is main's new seam.** A branch had
added a `progress` parameter to `capture()` in `screenshot.mjs` to seed a save
before a page boots; main had added `pageOptions.initScript` for exactly that,
and the two collided in one hunk. Same merge, same shape one file over: the
branch had a hand-copied `useLayoutEffect` measuring rows, and main had
factored that measurement into `useCardRows` (`card-rows.ts`). Neither
resolution is "keep both": delete the branch's copy and take main's facility,
widening it by a parameter if it does not quite reach (which card the rows are
on, there).

So after any merge or rebase, clean or not:

```sh
git log --oneline -1 HEAD..origin/main -- <file>   # what main did to the original
grep -n '<the identifier you copied>' <file>       # the pair should agree
```

`git diff origin/main -- <path>` proves nothing was LOST. It cannot tell you
your new hunk should have moved with the old one, or that it should not exist
any more.
