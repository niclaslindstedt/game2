---
title: A voice that STEPS onto full scale clicks — and rings any resonant filter after it at its own cutoff
date: 2026-08-28
scope: pwa/src/lib/synth.ts, pwa/src/lib/voice.ts
concepts: [synth, envelope, clicks, filters, mixing]
---

A gain jumping from nothing to its peak between two samples is a step, and a
step is broadband. Two things come out of that, and the second is the loud one:

- a click on top of the note, worst in the treble;
- the filter after it RINGS at its own cutoff, because a step is what excites
  a biquad's resonance.

So the sound a player reports is not a quiet tick — on a hi-hat (a few
milliseconds of noise highpassed at 8 kHz) it is a piercing 8 kHz ping, at the
rate the hat plays. "The music makes a high-pitched noise three to five times a
second" is a HAT RATE, and the arithmetic identifies it: steps-per-second is
`bpm / 60 * stepsPerBeat`, and a hat on every other step of a 150 bpm /
16th-note score is five a second.

The fix is a floor on the onset, not a redesign of the patch:
`MIN_ATTACK_MS` (1.5 ms) in `voice.ts`, applied to every voice. It is well
under the ~10 ms the ear resolves as an attack, so nothing is softened — a kick
still cracks. It works because the gain sits AFTER the filter in the chain, so
the ramp covers the ring rather than merely following it.

The same floor is why the shape lives in `envelopeShape()` in the DOM-free
`voice.ts` rather than inline in `synth.ts`: a rule that has to hold for every
voice needs to be testable without a browser.
