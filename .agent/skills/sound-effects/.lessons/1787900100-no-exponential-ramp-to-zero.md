---
title: A WebAudio exponential ramp may never touch zero — floor the envelope, do not trust the caller
date: 2026-08-27
scope: pwa/src/lib/synth.ts, pwa/src/lib/tracker.ts
concepts: [synth, envelope, webaudio, mute]
---

`exponentialRampToValueAtTime` THROWS on a target of 0 (and on ramping
FROM 0) rather than flooring it, so a voice whose volume is exactly zero
kills the whole call — and in a bed that is a thrown exception several
times a second. The envelope in `synth.ts` therefore clamps its peak to
1e-5, far under anything audible.

The volume bus (`audio/bus.ts`) also skips a voice scaled under 0.001, so
the game itself never reaches this — which is exactly why it survived
until the audition page muted a score by setting an instrument's volume to
0 and drove the raw synth with it. Anything that talks to the synth
DIRECTLY (tooling, a test harness, a page) has no bus in front of it. Keep
the floor in the instrument rather than in each caller.
