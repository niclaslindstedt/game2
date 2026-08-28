---
title: When you cannot hear it, implement the biquad and RMS it — a 40-line script settles what guessing cannot
date: 2026-08-28
scope: pwa/src/game/audio/, pwa/src/lib/
concepts: [synth, filters, review, mixing]
---

Judging a filter change by reasoning about it produces confident wrong answers.
The RBJ cookbook biquad is ~10 lines of plain JS and is the SAME transfer
function WebAudio uses, so filtered white noise can be RMS'd in Node with no
browser and no audio at all:

    highpass(noise, f0, Fs, Q=1)  ->  rms()  ->  20*log10(a/b)

Two questions it answers that intuition got wrong when the hats moved from 8200
to 6500 Hz:

- **How much does the LEVEL move?** 0.4 dB — not the several dB assumed, because
  white noise is flat and the band above 8.2 kHz at 48 kHz is already wide. So
  no compensating volume trim was needed.
- **Does it survive the speaker?** Adding a lowpass at 10 kHz models a phone
  speaker's ceiling: 48% of the 8200 Hz hat already clears it. The claim that
  such a hat "barely reproduces on a phone" was simply false, and the whole
  case for the change turned out to be the 16 kHz Bluetooth route alone.

What the measurement does NOT settle is character — a resonance moving into a
band the ear is more sensitive to is a judgement for ears. Measure the level,
then ship the audition page and let a person decide.
