---
title: The ground tint is a HAZE colour — anything solid thrown off the same ground has to be darker than it, or it reads as more dust
date: 2026-09-02
scope: pwa/src/game/ground-tint.ts, pwa/src/game/drift-spray.ts, pwa/src/game/dust.ts
concepts: [particles, dust, tint, readability, drift]
---

`groundTint()` answers "what is a wheel's grit coloured", and the answer is
deliberately paler than the road: dust hanging in the air is lit from every
side. Reuse that colour for STONES and the first screenshot shows pale tan
squares indistinguishable from the grit already flying — the drift spray
did exactly this and read as a thicker dust cloud rather than as a new
thing being thrown.

A solid is the ground itself, lit from one side, so darken the ground's
tint into it (`DRIFT_SPRAY.shade`, ~0.7 of the haze) and leave the haze
tone through it grain by grain as the fleck (`grit`, ~0.3). For a ground
that already answers as a two-tone `DustTint` (turf over earth, wet
clods), darken only the BASE and keep its own fleck — its fleck IS the
second substance and the reason the tint is two-tone.

Do the colour maths on ONE reused `THREE.Color` and one reused `DustTint`
object per pool: the spawn path runs many times a second and a fresh
object per frame is garbage the collector answers with a hitch mid-corner.
