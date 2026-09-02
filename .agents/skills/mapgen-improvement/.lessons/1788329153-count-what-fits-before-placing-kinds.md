---
title: How many things a line holds is only known after walking it — dry-run the walk before assigning anything by place
date: 2026-09-02
scope: engine/mapgen/towns.ts
concepts: [placement, towns, search, determinism]
---

A town's shops belong in the MIDDLE of the town, and the town's size is only
known once the street has been walked: the country refuses lots a street's
length cannot predict, and refusals move the cursor on. Every shortcut
failed on the sweep — assigning kinds by index against the target count put
a shop at the last lot when the street came up short; assigning them by
share of the street's length put it at the first tenth when stalls stretched
the town out.

What works is walking twice: once with houses on a rng of its own to COUNT
what fits, then for real with the target capped at that count and each
special kind taken as the placed count reaches its share. Keep the dry run
on its own seed so the real walk's dice do not move when the count does. A
kind the street keeps refusing (a block of flats on a hillside) gives way to
a house after three tries rather than holding up every building behind it.
