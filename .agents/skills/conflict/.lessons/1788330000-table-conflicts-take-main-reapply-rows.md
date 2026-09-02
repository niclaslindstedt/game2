---
title: A prettier-aligned markdown table conflicts as ONE hunk when both sides added a row — take main's file and re-apply your rows, and look for the seam main already built
date: 2026-09-02
scope: AGENTS.md, docs/, README.md
concepts: [merge, rebase, markdown, tables, prettier, shells]
---

Two branches each adding a row to the same aligned table (`AGENTS.md`'s
"Where new code goes", the README's Usage table) do not conflict on two
lines: the longer new row widens a column, prettier re-pads EVERY row, and
git hands back the whole table as a single `<<<<<<<`/`>>>>>>>` block — a
hundred lines where the real difference is a row on each side. Diffing the
two sides' first columns (`cut -d'|' -f2`) shows the real delta in seconds.

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
