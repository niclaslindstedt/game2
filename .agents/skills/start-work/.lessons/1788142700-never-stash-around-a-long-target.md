---
title: Never wrap a long Make target in one `git stash && … && git stash pop` shell line — a timeout leaves the work stashed and the tree looking reverted
date: 2026-08-31
concepts: [git, stash, measurement, harness, baseline]
---

Taking a BEFORE measurement by stashing is the obvious move when the AFTER is
already written: `git stash -u && make build && make profile; git stash pop`.
It is also a trap. `make profile`, `make screenshots`, `make sim` and
`make drift` all drive a headless browser or a full sweep and can run past a
tool timeout — and when the command is killed, the `pop` never runs. The tree
then holds the ORIGINAL files, every file-state cache says they changed on
disk, and the session's next instinct is to re-apply edits it has already
made, on top of a stash that still has them.

The recovery is `git stash list` then `git stash pop`, and it is only safe
because nothing was written in between. Do that FIRST, before reading or
re-editing anything.

Avoid it two ways:

- **Take the baseline before the first edit.** The measurement targets are
  named in `AGENTS.md`'s iteration workflow as "before and after" precisely so
  the before happens while the tree is still clean.
- **If the baseline is only wanted after the fact, use a second worktree**
  (`git worktree add ../base origin/main`) rather than moving the tree the
  work lives in. The worktree is also the only honest TIMING baseline: a
  web session's container can restart mid-task (`uptime` says so), and a
  build cost measured an hour ago on the old machine is not comparable to
  one measured now — run both trees back to back on the same machine.

If a stash is genuinely unavoidable, make the pop its own command so a timeout
on the long one cannot swallow it.
