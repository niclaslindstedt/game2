---
title: A per-corner charge must be tuned against the campaign's four sprint LENGTHS — a medium-seed sweep reads as saturated while a short stage is nowhere near
date: 2026-09-08
scope: engine/mapgen/rules.ts, engine/mapgen/generate.ts
concepts: [search, massif, alpine, seeds, measurement, campaign]
---

`massif.contour.climb` charges a corner for the height it gains, and I swept
it over six MEDIUM seeds: 88 m of descent at 1.6, 112 at 4, 142 at 9, flat
above. Read as saturated at 9, so 9 it was. CI then failed `campaign_test` —
the campaign's SHORT stage (`alpine-1`, 1.75 km) descended 29 m with 164 m of
mountain under its start. At 20 it descends 81 m, and the medium stages
improve too (115 m to 210, 217 m to 346).

The charge acts per CORNER, so the number of corners is the number of chances
it gets. A short stage has a third of a medium one's, and goes on contouring
long after the medium sweep says the lever is spent. **Any knob that acts
per-segment, per-corner or per-junction has this shape**: sweep it over
`short` and `xlong` as well, or read it straight off the campaign's four
sprints, which is the cheapest honest corpus there is.

Two suites a generator change must run locally and that nothing else covers:

- **`tests/campaign_test.ts`** — the campaign's own stages against the claims
  their location makes (the alps come down, the desert is dry). It is the only
  place a per-length regression shows.
- **`tests/stage_preview_test.ts`** — fails when `pwa/src/game/stage-routes.ts`
  no longer matches what the generator builds. Every rules change re-rolls it,
  so `make routes` is owed on the LAST change of a session, not the first: a
  second tuning move after committing routes leaves them stale again.
