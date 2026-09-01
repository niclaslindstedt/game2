---
title: A gated placement that comes out sparse is rejecting, not rolling low — tally the reject reasons before touching the dice
date: 2026-09-01
scope: engine/mapgen/homesteads.ts, engine/mapgen/stands.ts, engine/mapgen/guards.ts
concepts: [placement, density, seeds, measurement, homesteads]
---

A feature placed "every so often along the stage" has two numbers that
look like density — the dice (a slot's roll against a mean spacing) and the
acceptance (how many rolled slots survive the country's checks) — and only
the second is worth tuning first. Homesteads at a 620 m mean came out at
0.25 per stage; raising the mean would have done nothing, because a tally
showed 98 of ~200 candidates dying on "the slot's sample is on a corner"
and 55 on "the yard is not level".

The loop that worked, in order:

1. Back the module up (`cp` to the scratchpad), add a `console.log("REJECT
<why>")` at every early return, run a 24-seed probe, `sort | uniq -c`,
   restore the backup. Ten minutes, and it names the fix.
2. Make the slot a WINDOW: pick the straightest qualifying sample within
   `slot` metres rather than testing the slot's own sample, which on a
   twisty stage is a corner more often than not.
3. Make the pad's level the country's MEAN across it, not the height the
   drive happened to arrive at — a pad held at the lane's height is all cut
   or all fill and fails a level bound half the time.
4. Retry the shortest drive on both sides before giving up.
5. THEN set the dice: with `spacing.min` as the floor between two, the mean
   can be a fraction of it and the floor bounds the density.

Read the result off the whole sweep (`total N over 24 seeds`, and how many
seeds have none), never off one seed.
