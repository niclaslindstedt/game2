---
title: "Crackle on Bluetooth" has four causes, and none of them is a level — settle which before touching a volume
date: 2026-08-28
scope: pwa/src/game/audio/, pwa/src/lib/synth.ts
concepts: [beds, mixing, review, jitter, webaudio, bluetooth, aliasing]
---

"Heavy distortion", "scratchy in my AirPods", "it buzzes when I rev" all
sound like clipping and almost never are: metered at the limiter over a
minute of driving this game peaks at −24 dBFS with the limiter at 0 dB.
What a Bluetooth route actually surfaces is one of these, and the fixes are
opposites, so settle which:

1. **A hole in a bed.** A continuous sound fed on a cadence from the main
   thread stutters whenever a frame is late, and a stall longer than its
   lookahead is a hole. Heard as a scratch at irregular intervals, worst on
   a phone drawing a forest. The fix is structural — steered LAYERS that
   book nothing ahead (`Synth.layer`) — not a longer lookahead.
2. **An underrun.** A hundred and fifty fresh nodes a second (each grain of
   an engine with its own waveshaper and biquads) is real work on the audio
   thread, and a Bluetooth render buffer that misses a deadline crackles.
   Layers cost a fixed twenty-odd nodes; `latencyHint: "balanced"` buys the
   buffer a margin that a 150 ms Bluetooth link never notices.
3. **Aliasing through the codec.** A near-hard clip (a `tanh` steep enough
   to be a square at half travel) folds harmonics above Nyquist back down;
   a codec turns that hash into a swirl. `shaperSteepness` caps the curve at
   10 and `shaperPush` at 4, and layers oversample 4x.
4. **An un-seated route.** iOS keeps the context "running" through a
   headset connecting and does not always re-open the session on it.
   `devicechange` → a suspend/resume cycle a quarter of a second later.

Metering the SHIPPED app is a short Playwright script: wrap
`createDynamicsCompressor` to keep the limiter, wrap `AudioNode.connect`
so whatever connects to it also feeds an analyser, and read
`limiter.reduction`. Record contiguously through a `createScriptProcessor`
tap — `AnalyserNode` polling is far too coarse for a wobble — and measure
a STEADY condition on the audition page's sliders, never a bot lap.
