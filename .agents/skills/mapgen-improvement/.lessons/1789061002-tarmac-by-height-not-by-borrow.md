---
title: In a country where the route cannot reach a public road, the asphalt dial has to seal the route ITSELF — the compiler's painted path already does it, by height
date: 2026-09-05
scope: engine/mapgen/compile.ts, engine/mapgen/generate.ts, engine/mapgen/rules.ts
concepts: [asphalt, r15, r17, r20, junctions, massif, alpine, paving]
---

R15 says asphalt is a road the stage BORROWS, and it is the only way a
sprint's metre of route comes out sealed: `pavedAt(0)` is false at every dial
position (the "whole route sealed at the top of the dial" path is a comment,
not a behaviour — measured: the taiga at `asphalt: 1` compiles 0 % tarmac).
On a massif the borrow's approach onto a road contouring at another height
stood too far off the land on nearly every solve, so the alpine's tarmac was
0 % at every dial position.

The compiler has a second paving path, PAINTED, for circuits and the
endless stream: a field says where the seal is wanted, the change waits for
a corner that can carry a junction (`isJunctionTurn`, arm to the map's
edge), and the surface flips there. Hand it a height instead of an arc —
`wantsSeal(s, crown)` reading `crown < sealBelow`, with `sealBelow` read
off the dial between the rock line and above the snowline — and a mountain
stage is tarmac from the valley up to a line and gravel above it, its
hairpins kept (R20's unseal is the borrowed road's rule). Three things go
with it: `borrowed` must be false for that country's sprints (it is
`!circuit` otherwise, and the painted branch is skipped), the search must
stop trying to borrow there (`tryBorrow` returns early — every solve was
being refused anyway), and the band the dial reads onto has to sit where a
stage actually IS: keyed to the lake table the middle of the dial sealed
nothing, because a medium stage never gets that low.
