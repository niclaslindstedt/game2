---
title: Anchor a scripted edit on a CODE line, never on prose — Prettier re-wraps every comment it touches
date: 2026-09-08
scope: engine/, pwa/src/, scripts/
concepts: [harness, editing, formatting, tooling]
---

Editing a file with a script (`python3 - <<'PY'` doing string replacement, or
`sed`) breaks in a way that looks like the file changed under you: the anchor
text was a doc comment, `npx prettier --write` re-wrapped it after the previous
edit, and the exact string is no longer in the file. Half a batch of twenty
replacements then applies and the rest abort — and because the write happens at
the END of the script, nothing at all is written and the failure is silent
except for one assertion.

Two rules that make it reliable:

- **Anchor on the CODE line** (`corners: band(7.0, 13.0, 4.0, 4.0),`), never on
  the sentence above it. Code lines survive Prettier; a `/** … */` body does
  not, because its wrap point moves with every word added anywhere in it.
- **Assert every replacement** (`assert old in s`) and write once at the end,
  so a stale anchor fails loudly instead of silently skipping.

When the anchor genuinely has to be prose, `grep -n` the file first and copy
the wrapped form out of it rather than the form you wrote a moment ago.
