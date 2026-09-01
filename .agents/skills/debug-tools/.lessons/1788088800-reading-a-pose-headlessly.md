---
title: Reading the camera's pose out of a headless page — parse .debug-repro-text, and expect ~0.1 s of flight per frame
date: 2026-08-30
scope: pwa/src/game/debug-hud.tsx, scripts/screenshot.mjs
concepts: [repro, harness, screenshots, god-mode, playwright]
---

The overlay's REPRO line is the only place a running page states where the
camera is, which makes it the cursor for any headless check of god mode —
does a control actually move the rig, and which way. Two things bite.

**Take the text off `.debug-repro-text`, not `.debug-repro`.** The strip is a
label, the query, and a COPY URL button, and `textContent` on the parent
concatenates all three: the last parameter comes back as `-0.1273COPY URL`,
so `Number(params.get("gpitch"))` is `NaN` while every earlier parameter
parses cleanly. A check that reads one number per control then reports a
single silent NaN and looks like a broken axis.

**A flight looks far slower than its cruise speed, and that is the dt clamp,
not the controls.** `App.tsx` clamps a frame to 0.1 s, and under software
rasterization the page runs at ~10 fps at 390x844 and about one frame a
second at 1280x720. So the rig covers `speed × 0.1 × frames`, not
`speed × wall-clock`: 24 m/s cruise held for five real seconds moved 9.5 m
in a landscape page and 22 m in a portrait one, from the same input. Compare
the two surfaces at the SAME viewport, or count frames (the overlay prints
fps), before reading a small number as a control that is not working.
