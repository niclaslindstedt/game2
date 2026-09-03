---
title: `latCeiling` is a SCALE, not a capability — the plan belongs on what the tyres hand over at the slip the car carries, and a hot entry is quoted in sin²(slip)
date: 2026-09-03
scope: engine/sim/bot.ts, engine/sim/skill.ts, engine/game/limits.ts
concepts: [bot-tuning, corner-plan, traction-ceiling, drift, hot-entry, handling-coupling]
---

The corner plan read `latCeiling × latFraction`, and `latCeiling` is the
scale of the tyre's saturation curve — a number the car only approaches when
it is hung a long way out. While full-lock drifts were 35° that made the plan
accidentally conservative (the car pulled ~1.4× it). Halve the roster's slip
angles and the SAME plan is optimistic instead: ten of seventy-two rival
crews went off the outside of fast sweepers, rolled and retired, and none of
them was doing anything the bot had not always done.

The fix is `limits.ts` stating what the car actually holds — the curve read
at the slip the car carries — and the plan solving `v²κ = share × latHold(v)`
(three fixed-point passes from the tyre-limited speed). Two traps in it:

- `latHold` RISES with speed, because `over` does. So switching the plan onto
  it without touching `latFraction` makes the bot FASTER at exactly the fast
  corners that were the problem — the first attempt went from 10 DNFs to 12.
  The share has to come down with it (ace 1.0 → 0.65, `RALLY_BOT` 0.5 → 0.45,
  which lands on about the same planned m/s² as before).
- The hot entry is spent on the drift's SCRUB, which is `sin²(slip)`, not on
  `driftYaw`. Quoted against rotational authority it survived a halving of
  the angles untouched; quoted against `sin²(heldSlip)` it falls with them,
  which is what it is for.

The general rule: any bot number quoted against a handling number has to be
quoted against the one the car will actually MEET, and a rescale of the
handling model is a recalibration of the crews in the same change. Measure it
with a rival-field DNF sweep (difficulties × seeds × top crews) — `make sim`
uses one profile and stayed green through all ten of those DNFs.
