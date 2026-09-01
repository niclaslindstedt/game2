---
title: A deck stripe behind the cabin is drawn INSIDE the greenhouse — `rear.deck` is the only honest test for a boot lid
date: 2026-08-28
scope: pwa/src/game/car/trim.ts, pwa/src/game/car-livery.ts
concepts: [livery, stripes, greenhouse, hatchback, z-fighting]
---

`buildStripes` lays a stripe on the profile's top surface — the LOFT, which
under the cabin is the floor the greenhouse is built on top of, not the
roof. So a stripe authored between the cabin's rear and the tail renders
inside solid bodywork on a hatchback and is never seen, while looking
perfectly correct in the spec.

`spec.cabin.baseRearZ` does not tell you which car you have: on the hatch it
sits within 10 cm of the tail (there is no boot), on the sedan it is half a
metre ahead of one. The test that works is `spec.rear?.deck` — a car with a
boot LID has a shut line authored for it, and a hatchback does not. Skip the
rear stripes entirely when it is absent rather than shortening them, or the
hatch grows two stubs on its tailgate.

Second trap in the same function: several stripe groups on one car land on
the same plane (`topY + 0.03`) and z-fight into a stipple that crawls with
the camera — an edging line down a painted bonnet panel is exactly this
case. Each group needs its own small lift, in draw order.
