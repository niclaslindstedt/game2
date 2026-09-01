---
title: A purely asymptotic grip curve is a cliff — a saturating tire needs a residual slope, and a wider entry band buys smoothness by stealing the drift's depth
date: 2026-08-27
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [drift, traction-ceiling, saturation, entry-band, angle-span]
---

Capping the redirect's lateral acceleration with `min()` puts a corner in the
response exactly where the drift arrives. Replacing it with `tanh` softens the
knee but does not remove it: an asymptote means that once the demand reaches
the ceiling there is nothing left but slip angle to answer more lock with, so
the settled angle steps ~10° between two notches of the wheel. What fixes it
is a residual slope (`TUNING.grip.latGive`) — past the limit the tires still
bite, they just charge a lot of angle for very little radius.

The obvious alternative — widening `drift.entrySpread` until the steps are
small — is a trap. `asked` then never reaches 1 across the wheel's throw
(0.6 at full lock instead of 0.85), and since `askedSlip = angleSpan ×
breakaway × asked`, the drift loses more depth than a raised `angleSpan` puts
back. Smoothness belongs in the grip curve; the entry band belongs to WHERE
the slide starts.

Two knock-ons to check before declaring a deeper drift done:

- `tests/drift_test.ts`'s speed budget fails, because scrub goes as
  `sin²(slip)`. Rebalance `TUNING.grip.scrub` so the drift's ABSOLUTE speed
  cost stays where it was (0.5 → 0.36 held it across 35° → 44°), or the drift
  becomes a brake.
- Any surface `breakaway` is now off-calibration, since it scales `angleSpan`.
  Asphalt needed 0.55 → 0.35 to keep the ~15° of slip it was tuned to.
