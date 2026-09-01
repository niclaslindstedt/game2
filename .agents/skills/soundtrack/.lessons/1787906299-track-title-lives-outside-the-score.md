---
title: A score's TITLE lives in three places outside the score file — grep before renaming one
date: 2026-08-28
scope: pwa/src/game/audio/scores/, scripts/audition.mjs, docs/audio.md
concepts: [music, scores, docs-sync, audition]
---

Rewriting a score usually renames it, and the name is duplicated outside the
score's own header comment:

- `scripts/audition.mjs` — the `scores:` map hard-codes each `title:`, so a
  stale one means the review page announces a track that no longer exists.
- `docs/audio.md` — the score table carries the title AND the `bpm, ~seconds`
  cell, which goes wrong the moment the tempo or the bar count moves.
- `.changes/unreleased/*.md` — an UNRELEASED fragment may already name the
  track in the release notes.

`grep -rn "<OLD TITLE>" --include='*.ts' --include='*.mjs' --include='*.md' .`
finds all of them in one pass. Nothing in the test suite or the linter checks
any of these, so a missed one ships.
