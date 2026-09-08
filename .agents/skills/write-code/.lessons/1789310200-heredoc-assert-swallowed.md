---
title: A `python3 - <<'PY' … PY` edit followed by another command on its own line fails SILENTLY — the assert's traceback is lost and the file is untouched
date: 2026-09-08
scope: (global)
concepts: [tooling, editing, harness, verification]
---

Scripted edits with a heredoc are the fastest way to make several precise
replacements at once, and `assert old in s` is what keeps them honest. But
the guard only works if the failure is SEEN. Two ways it is not:

- The heredoc is followed by another command on the next line (not `&&`),
  so a failed assert leaves a non-zero exit that nothing checks and the
  next command's output buries the traceback. This bit a session that
  "updated" a preview lab's staged ledgers, photographed the result, and
  judged a picture rendered from the OLD numbers.
- The pattern was copied from a file as WRITTEN rather than as it now
  STANDS. `make fmt` reflows on the way into every commit, so a multi-line
  call in your editor buffer is a single line on `main` — and last
  session's own edit comes back collapsed.

So: end every scripted edit with a `print("APPLIED")` and read it, or chain
with `&&`; and confirm with `git diff --stat <path>` rather than assuming.
A no-op edit is worse than a failed one, because the work continues on top
of it.
