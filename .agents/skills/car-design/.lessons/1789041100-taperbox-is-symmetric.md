---
title: taperBox is SYMMETRIC about its centre — a wedge with a fixed inner plane must be centred on that plane, or its far end lands half way back
date: 2026-09-05
scope: pwa/src/game/car/fascia.ts, pwa/src/game/car/builder.ts
concepts: [bumper, taperbox, flares]
---

`taperBox(cx, …, sxFront, sxBack, …)` puts BOTH end faces symmetrically
about `cx`: the +z face spans `cx ± sxFront/2`, the −z face `cx ± sxBack/2`.
So a part whose two ends want different OUTER x but share one buried INNER
plane — a bumper wrap, a light pod, a valance end — lands both faces
correctly only if `cx` IS that shared inner plane, with each width
`2·(outer − cx)`. Centre it on one end's midline instead
(`cx = (inner + o0) / 2`, the obvious-looking line) and the other end's
outer face comes out half way back to the body: the wing then saws through
the part as a row of triangular teeth.

It shipped that way for months because it is invisible wherever the part is
painted the body colour — only the two cars whose bumpers are a contrasting
black showed it, and only in an elevation. Shoot ONE car and ONE view at
`--cell 1900x1150` when checking a part this small; an eight-column contact
sheet shrinks the cell past the point of seeing it at all.
