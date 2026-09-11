---
type: Fixed
title: A car's tracks in snow no longer disappear at the lowest DETAIL setting
---

The trail a car ploughs through snow was drawn only when the DETAIL level
allowed cars to raise dust, so on DETAIL ▸ LOW a car drove through deep snow
and left nothing behind it at all — while the snow under it was really being
compressed and really holding the car back.

Tracks are not dust. A cloud is sprites thrown into the air every frame, for
as long as anyone is driving; a trail is one mesh, built the first time a car
touches snow and never again, and a stage with no snow on it never builds one.
The car being driven now marks the snow at every DETAIL level, and the setting
keeps the part of the cost that is actually a cost: whether the rest of the
field leaves ruts too. The field's tracks also stop answering to the transient
effects budget, which could put a rival's ruts away on a stage where the rival
was still visibly driving through snow.
