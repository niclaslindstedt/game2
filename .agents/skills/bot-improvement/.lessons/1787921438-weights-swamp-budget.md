---
title: A crew's weights swamp its budget unless the authored shapes are moderate — check that `standing` still orders the field
date: 2026-08-28
scope: engine/sim/rivals.ts, engine/sim/skill.ts
concepts: [rivals, bot-tuning, difficulty]
---

The first roster gave crews extreme weight vectors (attack 10 / vision 1 and
so on) and the field came out ordered by SHAPE rather than by budget: the
crew with the biggest budget in the game finished ninth at every difficulty,
while a mid-table crew that had put everything into `commitment` won. The
seeding order then means nothing, and "hard" stops reading as a better field.

The cause is that the axes are not equally powerful — `commitment` alone is
worth about four times any other — so a crew that spends everything on it
beats a balanced crew with 50% more points. Two things fix it together:

- author weights inside a moderate band (roughly 1..10 with most crews
  between 4 and 9) rather than at the ends, and
- give the FRONT of the field weights that lean on the axes with real
  authority, because a balanced crew is genuinely slower than a lopsided
  one at the same budget.

The check is one line of `npm run sim -- --field`: the per-crew order should
broadly follow the points, with the middle of the field reshuffling from
stage to stage. If it does not, the difficulty setting is decoration.
