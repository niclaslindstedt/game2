---
title: A particle cloud takes light as a material tint plus a shader-summed register — and the register belongs to the renderer, not to whoever writes it first
date: 2026-08-29
scope: pwa/src/game/dust.ts, pwa/src/game/dust-light.ts, pwa/src/game/environment.ts, pwa/src/game/sky.ts
concepts: [particles, dust, lighting, shaders, lamps, time-of-day]
---

A `THREE.Points` cloud has no normals, so nothing in the lit scene reaches
it: the sun, the hemisphere and every SpotLight on the car pass straight
through. That is why an untreated plume is the same tan at midnight it is at
noon, and why a car with its lamps on tows a cloud that does not know.

Two terms fix it, and they go in different places.

**Ambient is the material's own colour** — one multiply, already plumbed
(`setTint`). It wants its OWN curve, not the car's: `carTintFor` has a 0.2
floor because a body that goes black stops reading as a car, and a cloud has
the opposite requirement. Pin the curve to 1 at noon so the daylight cloud
is untouched, then square the ratio under it — the difference has to bite in
the MIDDLE of the range, at dusk, where the two are seen side by side.

**Lamps are a per-vertex sum in the points shader**, which for a point
sprite is per particle and therefore nearly free. Graft it onto three's own
shader at the `gl_PointSize = size;` replacement — `transformed` and
`mvPosition` both exist there, and `modelMatrix * vec4(transformed,1)` is
the world position. Add the sum into `diffuse` in the fragment
(`vec4(diffuse + vLamp, opacity)`), because the existing `color_fragment`
multiply by the particle's vertex colour then comes out as
albedo × (ambient + lamps) for free. Write the loop BRANCHLESS over a fixed
count — an empty slot carrying a zero reach falls out through the same `max`
that clamps the falloff — and share the uniform objects by reference across
every dust material so the register is written once a frame, not once per
cloud.

**The register has one owner of the moment it is emptied, and it is the
renderer.** Several modules contribute (the environment knows the player's
lamps, the field knows the rivals'), and they run in an order that is the
render loop's business. Clearing it inside whichever of them happens to run
first is a bug the day that order changes; clear it explicitly in `render()`
and let contributors only ever add. Fill it in priority order too — the
player's pair first, so a field closing up can never crowd out the tail
lamps the chase camera is looking through.

**Gains are bounded from both sides.** The tail lamp lights the nearest,
thickest part of the cloud, right where the eye already is: under-driven it
is a pink haze, over-driven every channel clips and a puff off the lens is a
flat patch of pure red that reads as fire. Judge it on the near cloud, not
on the mirror.
