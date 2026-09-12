---
title: Re-key a score by moving PITCHES only — keep the attacks per bar identical and every guard in audio_test stays green
date: 2026-09-12
scope: pwa/src/game/audio/scores/
concepts: [music, scores, arrangement, test-conventions, review]
---

Changing a score's MOOD — a mode flip, a chorus taken off the relative major,
a bright chord swapped for a ♭II — is a chord-table and melody-token edit, and
it is safe precisely because `tests/audio_test.ts` keys nothing on pitch. Its
arc guard hashes `bars / voice names / round(attacks per bar)`, so a melody
rewritten note-for-note at the same attack positions leaves every section's key
untouched and the whole suite passes unchanged. Write each replacement bar
against the original's attack count (count the tokens that are neither `.` nor
`=`) and the guard never has to be re-derived.

Two things a mood pass DOES move, and both are checked:

- **Tempo.** `trackSeconds` must land in 70–150 s, and slowing a score for
  weight eats that margin fast — the endless score is the tight one, at 72 bars.
- **`docs/audio.md`.** Its score table restates each score's bpm and seconds,
  and nothing in the suite holds it to the code.

`npm run audition` settles both in one line: it prints every score's seconds as
it writes the page, which is the fastest length check there is and the exact
figures the docs table wants. Run it before editing the table, not after.

The chord-plan tables the skill already insists on are what make the pass
tractable at all — eight scores re-keyed by editing six `Record<string, string>`
rows each, with the pad's top note (the third) doing nearly all of the work,
since it is the only voice that says whether a chord is major or minor.
