---
title: A new `partAt` bolt is calibrated against what the BOT already does, not guessed — the sim is the only source of the line
date: 2026-09-07
scope: engine/game/defs/tuning.ts, engine/game/collision.ts
concepts: [damage, tuning, measurement, simulation, parts]
---

A bolt strength picked by reasoning about metres of crush lands nowhere useful.
Adding the exhaust's, a first guess of 0.08 m of `CarDamage.belly` — argued from
"about 18 m/s of descent" — turned out to be unreachable: over 36 bot runs
(three cars, twelve seeds) the hardest SINGLE landing folds 0.028 m and the
worst WHOLE run folds 0.033 m, with two thirds of runs folding none at all. The
part would never have come off.

Measure first. A dozen lines against `simulateStage` answers it directly —
replay each run's `landing` events through the same arithmetic `landingDamage`
uses (`crushPerSpeed × (slam − hardLandSpeed) × massRatio`), total per run, and
sort:

```js
const over = e.slam - T.hardLandSpeed;
if (over > 0) belly += T.crushPerSpeed * over * (mass[carId] / T.refMass);
```

Then place the bolt against that distribution rather than against an
imagined crash. **The bot is the "drives it properly" reference** — it brakes
for corners and lines up landings — so its worst run is the line a good driver
does not cross, and a bolt just above it (0.05 for the exhaust) is reached by a
player who mis-lands and by nobody who does not. A bolt BELOW the bot's worst
run fires on clean driving and reads as random.

Write the measured numbers into the tuning comment. The next session retunes it
without re-deriving the sweep, and a number with its evidence beside it is the
difference between a knob and a guess.
