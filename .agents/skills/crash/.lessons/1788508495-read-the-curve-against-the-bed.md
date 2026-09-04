---
title: The centre-of-mass curve's valleys are the faces a body RESTS on — measure them against the ground, or the model cannot tell a hillside from a floor
date: 2026-09-04
scope: engine/game/roll.ts
concepts: [roll, slopes, gravity, camber, physics]
---

`centreHeight(tilt)` is written about a body's attitude relative to the plane
it is standing on, and `roll.ts` was feeding it the attitude relative to
LEVEL. On flat ground those are the same thing, which is why it survived so
long.

On a slope they are not, and the model simply had no idea the slope existed:
its rest attitudes stayed horizontal, so a body settled "flat" at an angle
the hillside would never hold it at, and the settle test called a car resting
on a bank finished while it was still a bank's worth of angle up its own
corner with gravity working on it.

The fix is two lines and the angle already exists in three other places:
`bed = atan(ctx.slopeLat)` — the same camber `car.ts` settles a grounded
car's springs onto — and then `centreSlope(tilt - bed)` for gravity and
`round((now - bed) / QUARTER) * QUARTER + bed` for the settled face.

Two things to expect afterwards:

- **Numbers tuned on "flat" ground will move**, because the ground was never
  flat. A `carry` scenario run across open country went 0.46 g → 0.78 g; the
  lab's own bed readout showed the terrain running −4° to +7° under it. That
  is the model noticing terrain it had been ignoring, not a regression — but
  it means any figure calibrated before the fix was calibrated against a
  fiction, and the honest control is a scenario whose ground you laid.
- **It does not by itself make a slide re-roll.** Rest attitudes moving with
  the hillside is correct and necessary; it is not sufficient. See the
  edge-not-a-ramp lesson.
