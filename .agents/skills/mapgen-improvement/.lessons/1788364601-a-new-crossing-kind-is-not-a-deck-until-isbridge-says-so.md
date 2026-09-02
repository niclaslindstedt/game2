---
title: A new Crossing kind falls into every "not a ford" branch — audit isBridge, the anchor walk and the cross-section before compiling one
date: 2026-09-02
scope: engine/mapgen/compile.ts, engine/mapgen/terrain.ts, engine/mapgen/rules.ts
concepts: [culverts, bridges, fords, crossings, anchors]
---

`Crossing` was two-valued in spirit — a ford, or a deck — and the code
encodes that as `plan.crossing !== "ford"` in more places than `isBridge`.
Adding "culvert" as a third kind made the compiler build a deck over it
(the bridge cross-section, a clearance, a parapet), the anchor walk index
`R.bridge.clearance["culvert"]` into `undefined` and push NaN river
anchors, and the river tracer draw a course through NaN. Before adding a
kind: `isBridge` names the deck kinds positively (`timber || concrete`),
`BridgeDeck` is `Exclude<Crossing, "ford" | "culvert">` so the clearance
table cannot be indexed by the new one, and every `crossed && !bridge`
site in the segment walk gets the new kind's own branch. `make analyze`
on a seed with the new crossing is the check — NaN anchors show up as a
water.dry or water.float finding at coordinates that are `NaN`.
