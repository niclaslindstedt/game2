---
title: To LAY a part down and then place it, transform the geometry — the builder's ry+tiltZ compose as one Euler and collapse a stack into a slab
date: 2026-08-28
scope: pwa/src/game/flora-species.ts, pwa/src/game/flora-build.ts
concepts: [flora, geometry, transforms]
---

`GeoBuilder.add` composes T·R·S with R from a single
`Euler(tiltX, ry, tiltZ)`. That is right for a part that LEANS from its
base (a crooked trunk, a splaying blade) and wrong for one that has to be
laid on its side and then oriented: `{ ry: PI/2, tiltZ: PI/2 }` is not
"lay it along X, then spin it", it is one combined rotation, and a stack
of logs built that way comes out as a single angular slab with its pale
end-caps floating off to one side as a second slab.

For anything composed of many parts in fixed relative positions — a
timber stack, a fence, a crate — pose each primitive in GEOMETRY space
(`geo.rotateZ(...)`, `geo.translate(...)`) and add it with no opts. The
existing single-part cases (`fallenLog`, `driftwood`, `fallenBranch`)
stay fine on the opts form because they are one cylinder each.

This was invisible in `make sim` and in a grid screenshot; it took a
zoomed crop of a driving shot to see. Prop-heavy variants earn a
deliberate look: force the region/density temporarily
(`regionAt` → a fixed index, drop the prop field's cell size) and
screenshot, then revert.
