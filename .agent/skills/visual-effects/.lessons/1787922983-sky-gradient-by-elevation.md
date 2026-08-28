---
title: A sky gradient the driver sees must run on ELEVATION ANGLE, not on distance out
date: 2026-08-28
scope: pwa/src/game/clouds.ts, pwa/src/game/environment.ts
concepts: [sky, weather, gradients, camera, readability]
---

An overcast deck is a lid drawn as a disc of rings above the camera. The
obvious way to colour it is by how far out each ring is (`u` = radius /
rim) — and it produces a sky that is entirely the RIM colour, which for a
thunderstorm means a light grey ceiling instead of a black one.

The reason is where the camera looks. A driver looks along the road, so the
sky in frame is a band from about 3° to 20° above the horizon. Read against
distance that band is `u` from 0.6 to 1.0 — already most of the way to the
rim before any of it is visible — and the black overhead colour is only
ever at the zenith, where nobody is looking. The fix is one line in
`paintDeck`: take each vertex's `atan2(y, r)` and run the gradient over a
`RIM_BAND` of about 0.16 rad. Then the rim strip is what it physically is —
the last few degrees where the line of sight passes out from under the
cloud base — and everything above it is the underside.

The same trap catches anything else painted across a dome: the visible
sky is a few degrees, not the top half of a hemisphere. Check a colour ramp
by rendering the SHOT, not the sphere.

Two smaller ones from the same pass, both about the same 3°–20° band:
mountains are seen against the CEILING under an overcast sky, so the ridge
haze has to lerp toward the deck rather than toward a zenith nobody can
see; and a vertex-colour lift that nothing in the scene can dim (the snow
on the far peaks) becomes the brightest thing in the frame under a black
sky, so it has to be scaled by the sky's own key — `dayLight(preset)` in
`sky.ts` does that, and the car's lamps read the same number so a daytime
storm's beams do not lay down a night-time pool.
