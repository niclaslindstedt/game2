---
title: A part that SPINS inside a fitted frame needs a mount group — and a z-rotation's polar convention is atan2(−x, y), not the compass bearing
date: 2026-08-28
scope: pwa/src/game/
concepts: [rendering, three, rotation, quaternion, car-design]
---

Two traps, both hit in the same five minutes building the wipers
(`pwa/src/game/car/wipers.ts`), both silent — the part draws, it just draws
somewhere else.

**Composition.** `object.rotation` and `object.quaternion` are the same
rotation in three.js. So after `obj.quaternion.setFromRotationMatrix(basis)`,
writing `obj.rotation.z = a` does NOT turn the object by `a` about the
frame's own z — it rebuilds the quaternion from the basis's Euler with the z
component REPLACED, which is a rotation nobody asked for. Split it: a
`Group` carries the fitted frame (`makeBasis(right, up, normal)`), and the
child mesh carries nothing but `rotation.z`. The group is a transform node,
so it costs no draw call.

**Convention.** Turning a part that points along local +y by `a` about +z
puts its tip at `(−sin a, cos a)`, not `(sin a, cos a)`. Anything that has
to ask "is this point inside the arc the arm just swept" must therefore take
`Math.atan2(−dx, dy)`. Take the compass bearing `atan2(dx, dy)` instead and
every test lands on the MIRROR of the arc — the arm sweeps one way and its
effect appears on the other side, which reads as a completely different bug.

Both are invisible to `make lint` and to a numeric probe of the frame
itself: the basis prints correct in both cases. What catches them is a
picture — colour the moving part something impossible (magenta arm, green
pivot boss) and shoot it.
