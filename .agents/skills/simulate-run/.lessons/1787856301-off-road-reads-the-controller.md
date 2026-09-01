---
title: Off-road seconds jumping while pace and respawns hold still means the BOT points the wrong way, not that the car got slower
date: 2026-08-27
scope: engine/sim/
concepts: [bot-tuning, drift, off-road, handling-coupling, reading-the-table]
---

A handling change that deepened the drift moved exactly one column the wrong
way: off-road went 2.9 s → 34.8 s over the eight-seed sweep and impacts 15 →
30, while pace stayed at 93 km/h, every stage finished, and respawns stayed
at zero. That shape is diagnostic. A car that had genuinely lost grip would
show up as pace and respawns first; off-road alone, at unchanged pace, is the
bot arriving fine and then pointing somewhere the road is not.

Confirm it by trying the corner-speed plan FIRST and watching it fail:
lowering `latFraction` (0.7 → 0.65 → 0.6) made off-road worse before it made
it better and cost 5 km/h to half-fix. That is the tell that the plan was
never the problem — the fix was in the steering (see `bot-improvement`).

Reading the `--json` dump beats eyeballing the table for this: the columns are
unit-suffixed strings, so awk over the printed rows silently sums the wrong
fields. Sum `rows[].stats` (`offRoadTime`, `impacts`, `crashes`, `respawns`,
`driftTime`, `driftCount`) instead, and get the before-table from a
`git stash push -- engine tests` around the run so both come from one probe.
