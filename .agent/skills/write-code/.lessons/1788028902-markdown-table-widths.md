---
title: A new AGENTS.md table row wider than the column reflows the WHOLE table at the fmt gate
date: 2026-08-29
scope: AGENTS.md, docs/
concepts: [markdown, formatting, diff-noise, routing-table]
---

Prettier pads every cell of a markdown table to its widest entry, so one new
row a character over the current width rewrites all eighty of them: a two-line
change lands in the diff as 150 changed lines, and the actual addition is
invisible in review.

The "Where new code goes" table's left column is 59 characters and its right
one about 130. Write the row to fit, check with `git diff --stat AGENTS.md`
after `make fmt` — two insertions and nothing else — and shorten the phrasing
rather than letting the table grow. This is worth a minute because the table is
the file's routing index and the one thing a reviewer reads it for.
