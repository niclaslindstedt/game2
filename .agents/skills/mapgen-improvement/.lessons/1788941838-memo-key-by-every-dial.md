---
title: Key the land field's memo on every dial — a hand-listed key silently serves one dial's country to another
date: 2026-09-09
scope: engine/mapgen/land.ts
concepts: [caching, dials, determinism, geology]
---

`createLandField` memoizes on a key built by naming knobs one at a time.
That key had already lost `dunes`, and a new dial added this session was
missing too — so a sweep that varied the dial got the FIRST build's country
back for every stop and the dial measured as doing nothing at all. It looks
exactly like a broken feature; it is a stale cache.

The key now walks `NUMERIC_KNOBS`. A dial the land does not read costs a
cache miss nobody notices; a dial it reads and the key does not is a stage
built from another stage's country.

Symptom to recognise: a sweep across a dial where every column is IDENTICAL,
including columns that should differ from the default. Suspect the memo
before the feature.
