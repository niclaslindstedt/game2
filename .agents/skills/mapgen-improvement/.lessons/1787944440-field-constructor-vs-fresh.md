---
title: A field that fills itself in its constructor cannot also hand a caller "what I just placed"
date: 2026-08-28
scope: engine/mapgen/
concepts: [fields, streaming, renderer-seam, chunks]
---

`createKerbField(track)` called `extend(samples.length)` at construction so the
physics had its markers on step one — and `extend` also returned the markers it
had just placed, which is what `world.ts` drew per road chunk. Every chunk
therefore got an empty array and no marking was drawn at all, on every stage.
Both halves were reasonable; together they are a silent bug, and nothing
type-checks or tests it, because "returned nothing" is a valid answer.

Pick one contract per field and stick to it. What works here: the field fills
itself, and the renderer takes an explicit arc WINDOW
(`markersBetween(field, fromS, toS)`), half-open at the top. Half-open matters
— chunks abut on a shared sample, and a closed range draws the marker standing
on it twice, which reads as z-fighting and as a post that falls over beside
itself.

Worth knowing generally: the engine and the renderer each build their OWN
field instance from the track (the pattern `createTerrain` already uses), so
their extend cursors never interfere. That is the thing that makes the
window approach safe under endless streaming, where the field also prunes
from the front and any index-based cursor would drift.
