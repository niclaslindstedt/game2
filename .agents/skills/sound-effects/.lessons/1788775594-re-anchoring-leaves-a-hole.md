---
title: Re-anchoring the sequencer costs a HOLE, so the lookahead has to be bought with the tick's punctuality — a fixed one skips whenever the phone stalls
date: 2026-09-07
scope: pwa/src/lib/tracker.ts
concepts: [scheduling, webaudio, jitter, music, ios, pwa]
---

The re-anchor rule (never crawl up from behind, never book into the past) is
right and must stay, but it is not free: each time it fires, the stretch
between the last booked note and the new anchor has nothing under it. One is a
beat arriving late; a RUN of them is the music skipping — and a FIXED lookahead
produces a run, because the condition that trips it arrives in clusters.

Measured against `createTrackPlayer` on hand-driven clocks, 0.28 s horizon,
90 ms interval:

| the ticks | holes | worst gap |
| --- | --- | --- |
| punctual, and 300 ms | 0 | — |
| 400 ms | 11 | 0.275 s |
| 1 s (a throttled page) | 20 | 0.875 s |

The cliff is exactly at the horizon: a shorter gap leaves the previous booking
still covering the clock. Coming back to an iOS PWA lands past it, which is why
the bug reads as "sound is broken after switching away and back" rather than as
anything about the music.

Buy the horizon with the observed tick gap (`gap * 2.2`, capped, decaying back
to the tight value) and both bad rows drop to the single hole the first late
tick cannot help. Two traps in doing it:

- **`stop()` latency is the price.** Nothing un-books a note, so the score runs
  on for up to the current horizon after the player leaves. Keep the punctual
  value tight and the ceiling to what a stall worth covering needs.
- **Derive the stale-anchor guard from the ceiling.** A hard
  `nextStepTime > now + 2` was safe against a 0.28 s horizon and starts
  re-anchoring legitimate plans once the horizon can grow past it.

This is the OPPOSITE lever from a BED's, where a hole is fixed structurally by
making the voice a steered `Synth.layer` that books nothing ahead. A score
cannot be steered — a note is an event at a time.
