---
title: The contact sheet cannot say whether a body matches its reference — an orthographic elevation laid over the photograph can
date: 2026-09-05
scope: pwa/src/tools/car-preview.ts, scripts/overlay.mjs
concepts: [reference, measurement, contact-sheet, verification, proportions]
---

Reading a render beside a photograph finds the misses that are big; the
ones a hand wide (a rear post, a lamp band, a pod row) survive every
side-by-side. `--views "elevation side"` renders the body with an
orthographic camera at a known scale (4.6 m across the cell, centred 0.7 m
up), and `scripts/overlay.mjs` lays that over the photograph half
transparent, anchored on the front hub and scaled from the wheelbase — with
`--scale-x` carrying the length compression the collision box forced, so a
correctly measured body lands ON the picture and every miss is a doubled
edge. Three rounds of that settled a sedan the sheet had already passed.

Only a telephoto side elevation is a measuring overlay. A front or rear
photograph is perspective from a low camera: heights read a fifth short,
and a lamp measured off one lands a hand too high. Use those for layout
and width, and take every HEIGHT from the side.
