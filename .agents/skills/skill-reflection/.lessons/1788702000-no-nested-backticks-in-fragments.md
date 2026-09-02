---
title: A lesson fragment must not nest backticks inside inline code — `make fmt` rewrites the line into nonsense and `fmt-check` goes red on the .md
date: 2026-09-02
scope: .agents/skills/
concepts: [lessons, prettier, markdown, formatting]
---

Prettier formats every `.md` under `.agents/skills/`, and a fragment that
quotes a template literal as inline code — a `\`` inside a `` ` `` span — is
re-tokenised on the way through: the span is split, the words around it are
glued together, and the sentence comes out as a run of code spans with no
spaces. It reads as a corrupted lesson and it fails `make fmt-check`, so the
commit that carried it needs amending.

Write the code idea in words ("pass the declaration as a string") or quote
the value rather than the literal that builds it. If a backtick genuinely has
to appear, put the example in a fenced block, never inline.
