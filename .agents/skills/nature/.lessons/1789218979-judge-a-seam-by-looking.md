---
title: Find a follow-the-car surface by painting it a screaming colour and KEEPING the shot as a mask — then judge the seam on a 2x crop, because a pixel-step statistic will lie to you
date: 2026-09-12
scope: pwa/src/game/
concepts: [review, screenshot, measurement, seam, materials]
---

A report of "a line across the hillside" says nothing about WHICH surface
stops there. Tint the suspect's vertex colours pure red, `make build`, and
shoot the reported frame with `make debug-shot REPRO='…'`: the footprint comes
back unambiguous — a red square 200 m across, centred on the car, was the snow
coat. Keep that PNG. Because the pose is pinned, it is a MASK for every later
shot of the same frame, which lets you measure coat pixels against tile pixels
without guessing where the boundary ran.

What the mask must NOT be used for is deciding whether the seam is fixed.
Two statistics computed off it both said the fix made things WORSE (mean step
across the rim 5.5 -> 9.9; step-above-local-gradient +1.7 -> +3.1) while a
2x crop of the same two frames showed a hard diagonal edge in the before and
nothing at all in the after. Both statistics were measuring the topmost masked
pixel per column, which on a ridge is a silhouette against fogged terrain
across a valley — not the seam. The eye was right and the number was
confidently wrong.

So: use the mask to find the surface and to compare LIKE pixels (tile-only
regions before and after, which is how you learn the change is +0.7 mean at
distance and ~13/255 up close). Use a stacked 2x crop of the same frame to
decide whether a seam is gone. A seam is a perceptual fact about a straight
edge in a smooth gradient, and no scalar over a whole region carries it.
