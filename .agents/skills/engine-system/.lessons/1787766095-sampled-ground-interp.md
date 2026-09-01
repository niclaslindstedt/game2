---
title: Per-sample fields the physics reads continuously must interpolate — nearest-sample reads stairstep at speed
date: 2026-08-26
scope: engine/game/track.ts, engine/mapgen/compile.ts
concepts: [elevation, ground-follow, sampling, phantom-launch]
---

Track samples sit 2 m apart, and `locate()` used to return the nearest
sample's elevation raw. The moment roads gained real grades, ground height
under a fast car stepped ~0.5 m at every sample crossing, which tripped the
"ground fell away" takeoff check (dy < −0.3 per 120 Hz step) — phantom
launches and respawn storms everywhere. Two fixes, both now in place and
both worth keeping in mind for any new per-sample field (banking, grip,
roughness): interpolate between neighbour samples along the tangent in
`locate()`, and keep grades off the tight corners (`straightness` in
compile.ts) because a car cutting inside a hairpin sweeps many samples of
arc per step and ANY real grade across that sweep reads as a cliff.
