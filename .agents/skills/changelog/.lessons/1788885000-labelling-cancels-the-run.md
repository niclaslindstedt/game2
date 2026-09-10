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

**Avoid it by settling the label at PR-CREATION time** where the tooling
allows: `gh pr create --label no-changelog` costs nothing, since the call is
already made by then.

**In a remote/managed session it is NOT avoidable.** The GitHub MCP
`create_pull_request` tool takes no `labels` argument, so the label must be a
second call (`issue_write`, `method: update`), which always lands after the
`opened` run has started and always cancels it. Expect one cancelled run and
one false `tests` failure on every `no-changelog` PR opened that way; confirm
the newer run on the same head is green and let the stale red stand.

And the label must actually be on a PR whose body claims it — CI enforces the
pair.
