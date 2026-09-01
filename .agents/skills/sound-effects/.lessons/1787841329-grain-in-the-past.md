---
title: A grain booked in the past fires IMMEDIATELY — a late scheduler stacks the backlog instead of skipping it
date: 2026-08-27
scope: pwa/src/game/audio/drive-bed.ts, pwa/src/lib/tracker.ts
concepts: [beds, scheduling, webaudio, jitter]
---

WebAudio starts a source whose `at` has already passed the instant it is
handed over — it does not drop it and it does not wait. So a scheduler that
falls behind the clock (a GC pause, a tab throttle) and keeps advancing its
anchor by one cadence at a time books every missed grain into the past, and
they all fire at once on top of the next one. The player hears a lurch, not a
gap, which is why it does not look like a scheduling bug.

`drive-bed.ts` used to re-anchor only when it was a WHOLE half-second behind,
so every stall shorter than that produced the lurch. The fix is one line —
re-anchor the moment `nextAt < now` — and it is free, because a bed's PHASE
carries no information. Only its regularity does.

Guarding it needs a stall SHORTER than whatever the old catastrophe threshold
was; a two-second jump passes on the buggy code too.
