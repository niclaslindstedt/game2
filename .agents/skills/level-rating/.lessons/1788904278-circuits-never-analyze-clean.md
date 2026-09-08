---
title: No circuit in the game is analyze-clean, so the error count separates circuits from each other rather than from sprints
date: 2026-09-08
scope: engine/rating/, engine/analysis/, pwa/src/game/campaign.ts
concepts: [campaign, circuits, analysis, calibration]
---

Swept over 1..48 in all three countries, EVERY circuit slot came back 0/48
clean under `analyzeSeed`, against 27–45 of 48 clean for the sprint slots. Two
of the errors are the analyzer not knowing about R22: a lap rejoining its own
start line reads as `roads.overlap` (route and route inside R23's 42 m) and as
`ends.launch` (the first corner too near the grid). The rest cluster at the
same rejoin.

So an error-count term in a ladder search must be weighted to separate the
9-error circuit from the 24-error one; a hard "must be clean" gate leaves you
with no circuits at all. The committed ladder before this pass carried 134
errors across its 18 stages, 108 of them on its six circuits.

Do NOT read this as a licence to skip the count on sprints — a sprint with a
dozen errors is a broken road and there are plenty of clean ones to take
instead.
