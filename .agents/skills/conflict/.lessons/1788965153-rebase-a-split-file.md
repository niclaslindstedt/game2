---
title: When your branch SPLIT a file main also changed, re-derive the split from main's version — do not hand-merge the conflict
date: 2026-09-09
concepts: [rebase, merge, module-split, semantic-conflict]
---

A branch that splits `step.ts` into three conflicts with any `main` commit that
added to it, and the conflict is unresolvable as a text merge: your side has
deleted the region main is adding to.

Two shapes, and picking the right one per file is the whole job:

- **Main added a BLOCK to a region you moved.** Take YOUR side
  (`git checkout --theirs -- <path>` — during a REBASE `--theirs` is the commit
  being replayed, i.e. yours, and `--ours` is main; the inversion catches
  everybody), then apply main's hunk to the sibling that now owns that region.
  `git diff <merge-base> origin/main -- <path>` prints exactly what to move.
- **Main rewrote enough of the file that re-applying is a chore.** Take MAIN's
  side whole (`--ours`) and RE-RUN the split on it. This is why the splitting
  script should locate its boundaries by MARKER (`lineOf("const onEvents =")`)
  rather than by line number: line numbers are dead the moment main touches the
  file, markers survive.

Then prove nothing was dropped, because neither shape is checked by anything:
for each split file, read main's version and assert every non-import,
non-comment line appears somewhere in the union of the new modules. The
leftovers should be exactly the lines you deliberately rewrote.
