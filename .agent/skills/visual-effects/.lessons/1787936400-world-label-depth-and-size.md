---
title: A label hung in the world needs the DEPTH TEST, not renderOrder — "always on top" names cars nobody can see
date: 2026-08-28
scope: pwa/src/game/name-tag.ts, pwa/src/game/
concepts: rendering, three, world-markers, hud, readability, camera
---

Two things a world-anchored LABEL — a name plate over another car — needs, and
only one of them is the obvious one.

**Depth-test it.** The reflex for a name tag is `depthTest: false` and a high
`renderOrder`, the way every racing game draws one. Here it is wrong: the
field is staggered over hundreds of metres of a road that bends through a
forest, so "within range" and "in sight" are almost never the same thing. A
capture twelve seconds into a campaign stage came back with THREE names across
a frame with no car in it at all, one of them over a hillside with no road
under it. Turning the depth test back on left exactly the tags whose cars were
visible, and it buys tree and prop occlusion free, which a terrain
line-of-sight check would not. The cost is that foreground furniture slices the
plate — at a start control the hay bales cut its margins — answered by lifting
the anchor to 2.3 m over the car's origin rather than 1.6.

**Size it with `sizeAttenuation: false`.** Three multiplies a sprite's scale by
its own view depth when attenuation is off, which cancels the perspective
divide: the scale becomes an ANGLE and the plate holds a constant height on
screen. For a fraction `f` of viewport height the scale is `2·f·tan(fov/2)`,
read off the CURRENT `camera.fov` because portrait and landscape do not share
one here. Miss the factor of two and the tag comes out half the size asked for.

And keep it off the rear-view mirror: that pass reverses its image
(`mirror.ts`), so a plate drawn in it is a backwards word. `sprite.layers.set`
a layer only the forward camera enables.
