---
title: A fixture waiting for `airborne` catches hops; wait for the takeoff event, and a moving placed car needs its three vertical speeds set
date: 2026-09-02
scope: tests/
concepts: [jumps, fixtures, hop, placement]
---

Since hops exist, `car.airborne` goes true for a few tenths over any brow at
pace and books nothing. A fixture that drives to a lip and waits for
`airborne` stops on the first hop and measures the wrong flight — wait for
`events` to carry a `takeoff`. And a car PLACED at speed on a grade (a
crossRoad or hill fixture) must set `vy`, `wheelVy` and `footVy` to the
grade's own vertical speed, or its first step reads the ground as falling
away by the whole climb and launches it.
