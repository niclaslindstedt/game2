---
title: A give-way rule on a two-way road must ignore ONCOMING traffic, or a narrow lane stops in both directions forever
date: 2026-09-03
scope: engine/game/traffic.ts
concepts: [traffic, give-way, deadlock, lanes]
---

The traffic's "something ahead in my lane" test is a box in the driver's
frame: ahead by less than `look`, across by less than `laneHalf` plus the
other's half width. On a 16 m arm the two lanes sit 8 m apart and the box
never reaches the other lane. On a 5 m car park lane they sit 2.5 m apart,
which is inside the box, so the first car in and the first car out each saw
the other "ahead", both stopped at a standstill gap, and every later vehicle
queued behind one of them — a sweep showed whole seeds where nothing moved.

The fix is to read the other car's FACING first: oncoming (their forward dot
mine under −0.5) only counts when it is genuinely in this lane's path, closer
across than half the two half-widths together. Same-direction and crossing
traffic keep the wide box, which is what lets a lane feeding in at a turning
give way. Any rule that reads "is there something ahead" on a road that
carries both directions needs the same split, whatever the vehicle.
