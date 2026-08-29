---
title: The bot must ASK the car what it can do, not restate it — and a technique gated on `!car.drifting` is a limit cycle
date: 2026-08-29
scope: engine/sim/bot.ts, engine/game/limits.ts, engine/sim/skill.ts
concepts: [bot, limits, trail-brake, handbrake, drivetrain, chatter]
---

The bot planned corners at `latFraction × spec.gripAccel` while `car.ts`
delivered `gripAccel × latCeiling × grip`. Two numbers for one physical
thing, and `latFraction` was quietly a fraction of the wrong one — which is
not a driver misjudging a corner, it is a driver in a different car. It only
became visible when the drift model changed underneath it: the cars stopped
rotating, the plan did not notice, and the sweep's off-road time doubled.

`engine/game/limits.ts` states them once (`latCeiling`, `cornerSpeed`,
`wheelSlide`, `slideFloor`, `askedSlide`) and both sides read it. Re-basing
`latFraction` onto the real ceiling is a pure divide by `latCeiling` —
RALLY_BOT 0.7 → 0.5, and `skill.ts`'s ladder 0.34/0.86 → 0.24/0.61 — so
behaviour is unchanged and the knob's doc comment becomes true.

Two behaviours that fall out of the bot knowing:

- **Which move.** `wheelSlide(spec) > 0.8` is "this car rotates on the
  wheel" — the rear-driver, which gets the lever as it always did. Anything
  else has to be asked, and the plan already has it braking for the corner:
  carrying some of that brake past the turn-in is free rotation.
- **`hotEntry` is two things.** Scaling it by `driftYaw` alone carried a
  rear-driver's entry speed into a car that answers by washing straight on.
  Multiply by `wheelSlide` as well.

**Never gate a technique on `!car.drifting`.** A trail brake dropped the
instant the car reads as drifting takes the weight back off the nose, shuts
the slide it just bought, and goes down again — 36 drifts averaging 0.19 s in
one stage. The move is the whole corner: hold it, and let the drifting branch
keep it (`brake = trailing ? TRAIL_BRAKE : 0`) rather than zeroing the pedal.
