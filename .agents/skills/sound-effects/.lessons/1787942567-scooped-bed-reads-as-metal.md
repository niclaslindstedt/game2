---
title: A bed with a resonant bottom, a bright top and nothing between reads as SHEET METAL
date: 2026-08-28
scope: pwa/src/game/audio/road-grain.ts
concepts: [beds, surfaces, spectrum, mixing]
---

The off-road (`nature`) tyre bed was reported as "driving on a metal sheet",
and the cause was the SHAPE of its spectrum rather than any one number: a
loud brown band at 190 Hz with q 0.7, a loud white crunch highpassed at
2.2–4.8 kHz, and a hole between them. A scooped spectrum with a resonant
bottom is what a struck panel sounds like; no amount of retuning either end
fixes it, because the fault is the gap.

The fix that worked is a third layer in the MIDDLE (`SurfaceVoice.body`, a
wide soft band at ~560 Hz played at the roar's own grain length so it holds
rather than flutters), plus moving the crunch from an open highpass into a
banded `Layer` with a `q`. The open-vs-banded distinction is the real
material question: stones are all top end and climb hard with speed, turf
and moss have no top end at all.

Two things to know before retuning any surface here. A layer meant as a BED
needs the full `NOISE_LIFE_MS`; the half-length grain the crunch uses
flutters audibly at bed levels. And `tests/audio_test.ts` now holds the
off-road bed to no open layer at all and to a middle weighing as much as the
rumble under it, which is the assertion that would have caught this.
