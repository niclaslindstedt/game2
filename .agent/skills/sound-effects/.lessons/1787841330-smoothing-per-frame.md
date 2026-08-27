---
title: Smooth an audio signal with a time constant, never a per-frame fraction
date: 2026-08-27
scope: pwa/src/game/audio/
concepts: [beds, tuning, jitter]
---

`previous + (target - previous) * 0.35` reads like a smoothing rate and is
really "35% per FRAME", so the same engine picks up load three times faster on
a 120 Hz display than on a phone dropping to 40 — the game sounds different on
different hardware for no reason anyone can see.

Use `previous + (target - previous) * (1 - Math.exp(-dt / tau))` and write the
knob as seconds. To port an existing per-frame rate without changing how it
sounds at 60 Hz: `tau = -(1/60) / Math.log(1 - rate)` (0.35/frame ≈ 0.039 s,
0.12/frame ≈ 0.13 s). Asymmetric taus are usually what you want — a tyre loads
up the instant the car turns in and unloads over the following moment.
