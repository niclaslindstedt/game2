---
title: A walk UP a field by steepest ascent converges on a ridge — trace a source up the contour's lowest point, centred on its own momentum
date: 2026-09-06
scope: engine/mapgen/river.ts
concepts: [water, rivers, terrain, search, measurement]
---

Steepest DESCENT finds gullies, which is why a mouth walk is right by
construction; steepest ASCENT finds ridges, because every flank's gradient
points at the crest above it. The source walk used it and on the massif's
sharp spurs laid seven sources along crests (`water.float`, 0.9–3.4 m over
both banks); the taiga's whalebacks were too broad to show it.

The rule that works is a ROW: at each step read the ground along a row a
step ahead and go to its lowest point. Three details decided whether it
worked at all, and each was a failed draft:

- The row must lie ALONG THE CONTOUR (across the ascent), not across the
  walk's heading. Across the heading its "lowest" point is corrupted by the
  along-slope component whenever the heading is off the fall line, and the
  walk crossed the gully floor and climbed the far flank.
- The row must be CENTRED on the walk's last step plus the ascent, never on
  the ascent alone. From a point just off a crest the ascent points back at
  it by about the lateral shift the row buys, and the walk hopped the crest
  side to side at ±6 m forever.
- Prefer the lowest point that still RISES over the ground here; a source
  only climbs, and a point below is where the climb ends, so it is taken
  only when nothing rises.

And a walk that starts deep under the land — a ford in an R31 cutting, a
culvert's water in its valley floor — has metres of headroom before the
ceiling binds, so "the ground stopped rising" never fires: it climbs out of
its gully's head and along the knoll. End the climb where the contour
falls away on both sides (`onCrest`), read at the analyzer's own bank
distance, not one spacing in — a whaleback drops a quarter of a metre in
eight and a whole one in sixteen.
