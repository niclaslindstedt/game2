---
title: Do not hand-pool short-lived engine objects — V8 already scalar-replaces them, and the A/B says so
date: 2026-08-28
scope: engine/
concepts: [performance, simulation]
---

A 120 Hz step allocating four small objects LOOKS like the obvious next win
after the algorithmic ones are spent, and `--max-semi-space-size=64` on the
sim bench really does buy ~5%, which makes it look confirmed. It is not.

Pooling the two `TrackFix` records `step` takes per step (an `into?`
parameter on `locate`/`locatePoint`, two module-level scratches in step.ts),
and pooling `slideFactor`'s result and its `SlideLimits` argument, both
measured to nothing: three paired A/B runs each, alternating the two builds
on the same box, came out 1763/1830, 1814/1752, 1758/1752 ms — disagreeing on
the SIGN. V8's escape analysis scalar-replaces an object that is allocated,
read, and dropped inside one function, so there was nothing there to save;
what the pool adds is real heap stores and write barriers.

Both changes were reverted. The cost of keeping them would have been a
mutable module-level record in the physics and a scratch parameter on a
public engine function — a footgun for any future caller that keeps a fix, in
exchange for zero.

Two things to take from it. A single measurement in the direction you hope
for is not a result: alternate the builds and look for a consistent sign.
And where allocation pressure IS real, the object worth chasing is the one
that ESCAPES — the event list `step` returns, the `Near` record the terrain
field hands back through several layers — not the one that visibly dies where
it was born. Those escape, which is also exactly why pooling them is an API
change and needs more than a benchmark to justify.
