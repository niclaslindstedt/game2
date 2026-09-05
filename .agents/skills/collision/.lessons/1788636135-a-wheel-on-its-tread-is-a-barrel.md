---
title: A flat-shouldered cylinder on its tread is a BARREL, stable to twenty degrees of lean — crown the tread, and tip it about the CONTACT, or a slow wheel never keels over
date: 2026-09-05
scope: pwa/src/game/loose-wheel.ts
concepts: [wheels, debris, physics, tumble, contact-model]
---

Two traps in the loose wheel's model, both found by a probe rather than by
the sheet, and both ending in a wheel that rolls to a stop and stands there
upright forever.

The first is geometry. A cylinder's deepest point when leaned is the rim at
the LOW END OF THE AXLE, and the normal impulse there has a lever that
RIGHTS the lean — a tyre with square shoulders stands on its tread up to
atan(halfWidth / radius), which is about 20° for a rally wheel, exactly as a
garage tyre does. A wheel that has rolled to a stop must go over, so the
tread is CROWNED: the axle reach of the support point is `halfWidth · (CROWN

- (1 − CROWN)·|cos|)`, the middle of the tread when upright and the whole
face once it is over. `make wheel`and`tests/loose_wheel_test.ts` ("left
  slow on its tread, falls over") hold it.

The second is the nudge. Adding angular velocity about the wheel's CENTRE to
start a lean puts a sideways velocity at the tread, which the contact's
Coulomb friction reads as a skid and cancels on the next substep — the probe
showed `flat 0.000` for twelve seconds with the nudge firing every step. A
tip is a rotation about the CONTACT POINT: add `Δω` and the matching
`Δv = Δω × (centre − contact)`, and the tread stays put while the body goes
over. Gravity's own toppling torque then emerges from the offset support
point, which is why the nudge only has to reach past the crown's stability.
