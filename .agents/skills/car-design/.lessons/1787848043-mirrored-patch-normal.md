---
title: A patch mirrored across x gets an INWARD normal — the cross product of two mirrored vectors is the mirror negated
date: 2026-08-27
scope: pwa/src/game/car/builder.ts, pwa/src/game/car/greenhouse.ts
concepts: [mirroring, normals, patches, greenhouse, glass, silhouette]
---

`patchNormal` builds its normal from the patch's diagonals. Mirror the
patch across x and every component behaves differently: `n.x` survives
unchanged while `n.y` and `n.z` flip, which is `-(mirror of n)` — a normal
pointing INTO the car. Anything `patchQuad` lifts along it on the car's
left therefore sinks INTO the panel instead of standing proud of it, and
because the panel is a solid quad drawn at lift 0, the sunk geometry is
simply hidden behind it. The whole left flank of every car had no side
windows for exactly this reason, and it is invisible from the front 3/4 and
side views — only the REAR 3/4 and `game drift` columns of
`previews/cars.png` show that flank.

`patchQuad` now negates `lift` when `mirrored` is set, which is exactly
the correct mirrored normal. Any new helper that mirrors geometry and then
offsets it along a computed normal owes the same flip.

The cheap way to prove it without a render: build the patch and its
x-mirror in a throwaway node probe
(`node --experimental-strip-types … probe.mjs`, importing the .ts directly)
and print each drawn corner's `|x|` against the un-lifted `patchAt(u, v)`
beneath it. Proud on one side and sunk on the other is unambiguous where
squinting at a 3000 px contact sheet is not.
