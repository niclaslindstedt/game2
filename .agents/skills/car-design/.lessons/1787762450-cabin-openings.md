---
title: Frame glass by cutting windows out of a solid cabin, not by painting a canopy
date: 2026-08-26
scope: pwa/src/game/car/greenhouse.ts
concepts: [greenhouse, pillars, patches, silhouette]
---

The first greenhouse was five glass quads (screen, roof, backlight, two
flanks), and it read as a tinted canopy dropped on a tub — no A-, B- or
C-pillar anywhere. The fix is to invert the construction: think of each
cabin panel as body paint with the windows CUT OUT of it. The metal left
around each opening IS the pillar set, so pillar widths become spec numbers
in metres and cost no extra geometry.

Cut the holes for real — `panelMinus` returns the strips of metal a panel is
left with, and the seal is a FRAME around the pane, not a filled rectangle
under it. The first version drew each panel full and laid the glass and the
seal on top as lifted sub-rectangles, which looks identical while the glass
is opaque and is a solid dark panel directly behind every window the moment
it is not. That cost a whole session: the interior was built, correct and
in the right place, and none of it could be seen, because two opaque
rectangles the glass was resting on were between.

Two things make it work. Cabin flanks are warped quads (the cowl is
narrower than the roof), so openings must sample a bilinear patch rather
than assume a plane. And widths authored in metres need converting to
(u, v) fractions per panel — average the opposite edge lengths, or a
0.1 m pillar comes out twice as wide on the short car as on the long one.

How much metal frames the glass is also most of what separates one
silhouette from another: the same body reads as a hot hatch with thick
upright posts and a kicked-up quarter light, and as a coupe with a long
door glass ahead of a heavy fastback C-pillar.
