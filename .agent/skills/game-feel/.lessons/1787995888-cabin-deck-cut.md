---
title: A camera inside the cabin needs the body's top DECK cut away first — the loft is closed, and the tray it leaves is 350 mm deep
date: 2026-08-29
scope: pwa/src/game/car/, pwa/src/game/camera-eye.ts
concepts: [camera, cockpit, car-body, hood]
---

`buildShell` lofts a CLOSED body, so an opaque deck runs the length of the
car at about the belt line. Under the cabin that deck is the floor, and what
is left between it and the roof is a tray roughly 350 mm deep. A seated
driver and a 320 mm steering wheel do not fit in 350 mm: arrange them however
you like and the wheel comes out at eye level with its bottom half sawn off
by the floor, because the floor is an opaque surface nothing can draw under.

The deck is ring segments 7 and 8 of `ring()` — the two quads either side of
the centreline — and they can simply be dropped between the cowl and the rear
bulkhead (`OpenCabin` in `car/shell.ts`). Keep the part outside the cabin's
own half-width: that ledge is visible from OUTSIDE as the strip under the
side windows. Cutting it makes the room a metre deep and honest proportions
land first time.

Whatever cuts it owes the closing surfaces — a floor, an inner sill each
side, a bulkhead at each end — or the car has a hole in it, because the
underbody's own faces point down and are culled from above. And it owes them
in EVERY view, not just the one that cut it: `car/cockpit.ts`'s hull closes
it while the cockpit camera is up, and `car/interior.ts`'s flat pan closes it
the rest of the time, which is why a car built with a cockpit is never built
with its interior `off`.

The `hood` camera needs none of this — it mounts ahead of the windscreen,
where every downward ray lands on bonnet.
