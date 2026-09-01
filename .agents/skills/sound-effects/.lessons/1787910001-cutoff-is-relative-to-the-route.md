---
title: A cutoff is only safe against the LIVE sample rate — iOS picks that from the audio ROUTE, not from the device
date: 2026-08-28
scope: pwa/src/lib/synth.ts, pwa/src/lib/voice.ts, pwa/src/game/audio/
concepts: [synth, filters, webaudio, ios, mixing]
---

A biquad's coefficients come from `cutoff / (sampleRate/2)`. At or past 1 the
filter is undefined and WebKit answers with a loud harsh burst — once per note,
so it arrives at the RATE OF THE VOICE that carries it.

The trap is that the sample rate is not a property of the phone. iOS picks it
from the live route: 48 kHz on the speaker, wired, or A2DP Bluetooth, but
**16 kHz on a hands-free Bluetooth headset** (8 kHz on an old one). So a cutoff
that is fine on every machine you can test on is undefined on a headset, and
the bug report reads "a high-pitched noise like broken headphones, three to
five times a second" — which is a VOICE RATE, and the fastest way to find the
culprit: `bpm / 60 * stepsPerBeat`, then which voice plays at that rate.

`safeCutoff()` in `voice.ts` holds every cutoff at `MAX_CUTOFF_RATIO` of the
live rate, applied in `applyFilter` — the one place every filter passes,
including the ones `PlayShape.pitch` scales up at runtime.

The clamp stops the fault but cannot give the sound back: a hi-hat authored
above 8 kHz has almost nothing left to pass at 16 kHz. Authoring a percussion
voice's brightness under ~7 kHz is what actually survives the route.
