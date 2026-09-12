---
title: `cone`, `cyl` and `ribbed` take the height as `baseY` and OVERRIDE any `y` in their opts — a part stacked on another needs its hinge passed as baseY, not as a lift
date: 2026-09-12
scope: pwa/src/game/flora-build.ts, pwa/src/game/flora-desert.ts
concepts: [flora, geometry, transforms, hinge]
---

The builder's primitives all end in `this.add(geo, color, { ...o, y: baseY })`.
The spread puts `baseY` LAST, so a `y` in the caller's opts is silently
thrown away.

This bites the moment a shape is two stacked pieces with an offset — the
barrel cactus's lower and upper drums, the second of them hinged at the
waist of a leaning first. Written as

    const waist = onTrunk(LEAN, 0.5);
    b.ribbed(BARREL, 0.23, 0.32, 0.3, 0, { x: waist.x, y: waist.y, z: waist.z, ... })

the x and z land and the y does not, so the upper drum stands on the GROUND
inside the lower one and whatever was placed above it floats in the air. The
turntable shows it instantly and a stage screenshot never will.

The fix is to pass the hinge's height as `baseY` and only its lateral offset
in the opts:

    b.ribbed(BARREL, 0.23, 0.32, 0.3, waist.y, { x: waist.x, z: waist.z, tiltZ: LEAN }, 11, true)

`blob` is the exception — it takes x, y and z as arguments and has no `baseY`
— and `limb`/`ribLimb` are the other way out, since they take the hinge as a
whole `Point`.
