---
title: Layered sine waves read as a machine — and any layer near the sample spacing is a washboard
date: 2026-08-26
scope: engine/mapgen/
concepts: [elevation, terrain, noise, sampling]
---

Elevation built from summed sines repeats: every rise is the same shape as
the last, and a player sees it within two hills. Seeded value noise (octaves,
each half as long and a fraction as tall) costs the same and never repeats —
and per-stage amplitude/wavelength/roughness make one seed roll where the
next is flat. The harder trap is SCALE: a layer whose wavelength is within an
order of magnitude of `SAMPLE_STEP` (2 m) is not terrain, it is a washboard —
it flips the road's grade sign every few samples, which reads on screen as
corrugation and in the physics as a takeoff every ripple. Measure it rather
than eyeballing: count grade sign-flips per kilometer over `track.samples`.
A rolling stage is one rise per 100 m+; the sine version was one per 17 m.
