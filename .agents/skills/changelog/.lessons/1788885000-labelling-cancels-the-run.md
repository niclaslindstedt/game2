---
title: Applying `no-changelog` re-runs the whole workflow and cancels the one in flight — the `tests` rollup then reports a failure nobody caused
date: 2026-09-08
scope: .github/workflows/ci.yml, .changes/
concepts: [no-changelog, label, push, ci, concurrency, false-alarm]
---

`ci.yml` lists `labeled` and `unlabeled` among its `pull_request` activity
types, deliberately: it is what re-runs the `changeset` job when the
`no-changelog` escape hatch is toggled after the PR opened, instead of leaving
that check stuck red. But the trigger starts the WHOLE workflow, and the
`concurrency` group then cancels the run already in flight — so every job of it
ends `cancelled`, and the `tests` rollup, which exists to fail when a shard
fails, does this:

```
Run echo "test shards: cancelled"
exit 1
```

Which arrives as a `check_run.completed` with `conclusion: failure` and reads
exactly like a broken test suite. It is not one. **Check the log before
diagnosing a `tests` failure: four lines saying `test shards: cancelled` is a
superseded run, and the answer is to look at the newer run on the same head,
not to re-run or fix anything.**

The same thing happens on any second push in quick succession, for the same
reason — so it is worth recognising rather than re-deriving.

**Avoid it by settling the label at PR-CREATION time**, not after. The call is
already made by then: the `changelog` skill's whole job is deciding fragment vs
label before the PR exists, so applying it with the create call costs nothing
and saves a cancelled run plus a false alarm. If the PR body claims
`no-changelog`, the label has to actually be on it — CI enforces the pair, and
a body that says one thing while the labels say another is the failure this
lesson's author walked into.
