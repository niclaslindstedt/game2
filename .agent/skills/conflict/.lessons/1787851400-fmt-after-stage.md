---
title: Format BEFORE staging a resolution — `git commit` ships the index, not the tree
date: 2026-08-27
scope: .githooks/, pwa/, engine/
concepts: [merge, formatting, staging, ci]
---

The resolve loop ends `git add <paths>` → verify → commit. Running `make fmt`
as part of "verify" puts prettier's rewrite in the WORKING TREE, and the
commit that follows ships the index — the unformatted version. Everything
local passes (fmt-check reads the tree, not the index) and CI fails on
`fmt-check` alone, on one file, minutes later.

Order that works: resolve → `make fmt` → `git add <paths>` → `make lint` and
`make test` → commit. Or simply `git status --short` immediately before the
commit and expect it EMPTY: anything still listed as modified is about to be
left behind.
