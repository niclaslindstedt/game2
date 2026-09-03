---
title: A prose paragraph or an aligned table conflicts as ONE enormous hunk however small both edits were — take main's file and re-apply your edits, and look for the seam main already built
date: 2026-09-02
scope: AGENTS.md, docs/, README.md
concepts: [merge, rebase, markdown, tables, prettier, shells]
---

The repo's markdown is written in long unwrapped lines, so a conflict here is
never line-sized. Two branches each adding a row to the same aligned table
(`AGENTS.md`'s "Where new code goes", the README's Usage table) do not
conflict on two lines: the longer new row widens a column, prettier re-pads
EVERY row, and git hands back the whole table as one `<<<<<<<`/`>>>>>>>`
block. The README's Quick-start paragraph is the same trap at its worst —
one line of a thousand words, so two sentences edited a paragraph apart
collide as a single hunk with no visible difference at all.

Diff the two sides before touching either. For a table, `cut -d'|' -f2` over
each side shows the real delta; for a paragraph, write each side to its own
file and `git diff --no-index --word-diff=plain` them — the change main made
is then a handful of words instead of a wall.

Resolve it by taking main's copy of the FILE (`git checkout --ours -- <path>`
during a rebase is main's side) and re-applying this branch's rows with Edit,
then letting `make fmt` re-pad. Hand-merging inside the block is the same
work with a hundred chances to drop a row. But `--ours` replaces the WHOLE
file, so every hunk of yours that had auto-merged cleanly in it (a command in
the code block, a bullet elsewhere) goes with it — list your edits to that
file first and re-apply all of them, not just the conflicted table.

Read the other side for the seam it added before re-applying yours. Here
main's desktop shell had introduced one frozen `__SF_SHELL__` global read by
`pwa/src/shell-host.ts`, and this branch's `__SF_NATIVE__` + `app-native.ts`
was the same idea a second time; the resolution was a second word in the
same union, not a second module beside it. A merge that keeps both flags
compiles and is wrong.
