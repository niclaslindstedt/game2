---
title: The ring zones and the part list are two different walks — a table indexed by both has to state the mapping, never imply it
date: 2026-09-06
scope: engine/game/collision.ts
concepts: [collision, damage, zones, glass, tables]
---

`DAMAGE_ZONES` runs clockwise from the nose — 0 nose, 2 right flank, 4 tail,
6 left flank. Every part list in `collision.ts` is written in some OTHER
order, and the glass is written front, back, LEFT, right. Building a
zone-per-part table with `[0, 2, 4, 6].forEach((zone, pane) => …)` reads
perfectly and is wrong: it hands the backlight the right flank and the left
window the tail, so hitting a rock with the door takes the rear screen out.
The mapping is `[0, 4, 6, 2]`, and it has to be a named constant (`FACING`)
with the walk spelled out beside it rather than an inline literal that looks
like a sequence.

It cost one test — `a flank driven hard into a rock shatters the glass`
failed with `expected ['glassB'] to include 'glassR'`, which names the bug
exactly. Any new per-zone table owes a test that hits ONE side and asserts
the other three are untouched; without it the wrong-window version passes
everything that only checks "something broke".
