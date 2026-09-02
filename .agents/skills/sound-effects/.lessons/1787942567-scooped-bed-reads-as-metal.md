---
title: A bed with a resonant bottom, a bright top and nothing between reads as SHEET METAL
date: 2026-08-28
scope: pwa/src/game/audio/road-voice.ts
concepts: [beds, surfaces, spectrum, mixing]
---

The off-road (`nature`) tyre bed was reported as "driving on a metal sheet",
and the cause was the SHAPE of its spectrum rather than any one number: a
loud brown band at 150 Hz, a loud white crunch open above 2 kHz, and a hole
between them. A scooped spectrum with a resonant bottom is what a struck
panel sounds like; no amount of retuning either end fixes it, because the
fault is the gap.

The fix is a third layer in the MIDDLE (`SurfaceVoice.body`, a wide soft
band around 560 Hz), plus moving the crunch from the open `grain` slot into
the banded `tear` slot. The open-vs-banded distinction is the real material
question: stones are all top end and climb hard with speed (`grain`, a
highpass); turf and moss have no top end at all (`tear`, a bandpass).

`tests/audio_test.ts` holds the off-road bed to no open layer at all and
to a middle weighing as much as the rumble under it, which is the assertion
that would have caught this.
