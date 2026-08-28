---
title: A "distortion" report is usually MODULATION — meter the real game at the limiter before touching a level
date: 2026-08-28
scope: pwa/src/game/audio/, pwa/src/lib/synth.ts
concepts: beds, mixing, review, jitter, webaudio
---

"Heavy distortion", "like shaking a maraca", "it buzzes when I rev" all sound
like clipping and are usually an amplitude wobble at the grain rate. Settle
which before changing anything, because the fixes are opposites.

Metering the SHIPPED app is a short script and it is the only honest answer.
Serve `pwa/dist`, drive it with `?seed=42&start=1&bot=1&splash=0`, and tap the
master limiter from a Playwright `addInitScript`: wrap
`AudioContext.prototype.createDynamicsCompressor` to keep the node, then wrap
`AudioNode.prototype.connect` so anything connecting to it also connects to an
analyser — that analyser is the mix EXACTLY as it arrives, pre-limiting.
`limiter.reduction` says whether the limiter is working at all. Measured over a
minute at 141 km/h this game peaks at 0.06 with the limiter at 0 dB, so
nothing there was ever clipping.

Two traps. `AnalyserNode` polling is far too coarse to see a nine-hertz
wobble — record contiguously through a `createScriptProcessor` tap into a
zero-gain sink, then take the envelope's spectrum. And measure a STEADY
condition: a bot lap sweeps the revs constantly, which smears the very comb
you are hunting, so use the audition page's sliders (or the grid with the
throttle held) instead.
