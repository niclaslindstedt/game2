---
title: A note booked in the past fires IMMEDIATELY — the sequencer re-anchors the moment it is late, never one step at a time
date: 2026-08-27
scope: pwa/src/lib/tracker.ts
concepts: [scheduling, webaudio, jitter, music]
---

WebAudio starts a source whose `at` has already passed the instant it is
handed over — it does not drop it and it does not wait. So a scheduler that
falls behind the clock (a GC pause, a tab throttle) and keeps advancing its
anchor by one step at a time books every missed note into the past, and they
all fire at once on top of the next one. The player hears half a bar as one
chord, which is why it does not look like a scheduling bug.

The music sequencer is the ONE remaining thing in the audio that books
ahead (the beds are steered layers and book nothing), and its rule is: the
moment `nextStepTime < now`, re-anchor to `now + 0.05`. A beat arrives late;
nothing stacks. Guarding it needs a stall SHORTER than any catastrophic
threshold you might be tempted to add — a two-second jump passes on the
buggy code too.
