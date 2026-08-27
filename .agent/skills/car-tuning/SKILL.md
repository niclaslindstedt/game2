---
name: car-tuning
description: "Use when changing WHAT SEPARATES ONE CAR FROM ANOTHER — adding a car, retuning the roster, moving a per-car number, or answering 'why is one car best everywhere'. Owns the catalog (`engine/game/defs/cars.ts`), the drivetrain and engine tables (`TUNING.drivetrain`, `TUNING.engine`), what every per-car knob buys, and the roster-balance loop (`npm run sim -- --sweep`) that is the only honest test of whether the cars are actually different. Not the LOOK of a car (`car-design`) and not the shared slide model (`drift-feel`)."
---

# Tuning the cars against each other

This skill owns **one question**: is each car in the roster an ANSWER to a
kind of stage, or are they three points on one scale with a winner?

The answer is measured, never asserted. `npm run sim -- --sweep` is the
instrument, and **any change to `cars.ts` owes it, before and after.**

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs car-tuning --list`.

| Load beside this one | For                                                  |
| -------------------- | ---------------------------------------------------- |
| `drift-feel`         | the SHARED slide model every car inherits            |
| `simulate-run`       | reading the plain `make sim` table and its columns   |
| `bot-improvement`    | when the bot cannot exploit what you just gave a car |
| `car-design`         | how a car LOOKS — a different craft entirely         |

## Where the numbers live

| Layer                 | File                          | What it decides                                           |
| --------------------- | ----------------------------- | --------------------------------------------------------- |
| The catalog           | `engine/game/defs/cars.ts`    | how much of each thing THIS car has                       |
| The layout's shape    | `TUNING.drivetrain`           | what driving those wheels DOES                            |
| The magnitudes        | `TUNING.grip`, `TUNING.drift` | how strong each effect is, for everyone                   |
| The engine's delivery | `TUNING.engine`               | where torque lives in a gear, and what reaches the ground |

`spec.drive` selects a `TUNING.drivetrain` row; that row scales the shared
magnitudes. **Nothing in `car.ts` branches per car** — it reads the layout's
row and the car's own numbers. Keep it that way: a new behaviour is a new
knob in the row, never an `if (spec.id === …)`.

## What each per-car knob buys

| Knob                    | Moves                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `gearTop` / `gearAccel` | pace, and WHERE in the speed range the car is strong — the most powerful balance lever                                      |
| `torque`                | where inside a gear the shove lives (pivots around mid-gear, area-neutral), and how readily the driven axle spins itself up |
| `traction`              | how much torque reaches the ground, against the surface and `drivetrain.bite`                                               |
| `tyres.sealed/.loose`   | grip per surface family — the knob that makes a surface a CHOICE                                                            |
| `gripAccel`             | where the slide starts; also what the bot plans corners around                                                              |
| `stability`             | how fast steering authority bleeds off with speed — fast sweepers vs hairpins                                               |
| `gripLat` / `driftLat`  | how fast the velocity catches the nose up, gripped and sliding                                                              |
| `driftYaw`              | rotation while sliding; the bot also trusts it with proportionally more hot entry                                           |
| `brake`                 | braking distances — helps everywhere, so a poor differentiator                                                              |
| `mass`                  | collision and suspension ONLY. It is not in the longitudinal model; it will not slow a car                                  |

### The drivetrain row

`powerYaw` (driven rear feeds the slide) · `pullStraight` (driven front pulls
the car out of one — the two layouts want opposite pedals mid-corner) ·
`pullIn` (the same pull tightening a slow corner) · `liftYaw` (rotation from
lifting) · `spin` (slide the axle can raise from torque alone) · `entry` /
`release` (where the slide starts, how fast it lets go) · `snap` (how hard the
rear weathervanes the nose straight) · `bite` (torque to the ground) ·
`driftFloor` (the speed floor under the whole slide) · `flick` (weight thrown
by a Scandinavian flick).

## The measuring loop

1. **Baseline both tables**: `make sim` and `npm run sim -- --sweep`.
2. **Move numbers in `cars.ts`** (or a drivetrain row, if the layout itself
   should behave differently).
3. **Re-run both.** Read the sweep for balance and the plain table for
   regressions.
4. **Probe the feel** for anything the tables cannot see — see below.
5. **Paste both tables, before and after, in the PR.**

### Reading the sweep

A healthy roster:

- every car wins **at least one** archetype;
- the specialists win their home ground by **more** than the all-rounder
  wins the compromises;
- **nobody is worst everywhere.**

The tally matters less than that shape. A 0.1% archetype "win" is a coin
flip, not an identity — do not spend rounds chasing one.

### Reading the plain table for regressions

`respawns` and `off` are the ones a car change moves and the ones that matter:
a car nobody can keep on the road is not a fast car. `resp` must stay at the
baseline (0 on the default seeds). A `dTime` that separates by layout is the
model working, not a drift regression — say which in the PR.

## The traps, in the order they bite

1. **A knob the BOT cannot see never shows up as pace.** `botInput` planned
   corners at `gripAccel` alone, so per-car tires moved the table by ~0.1%
   however correct the physics was. Before tuning a new catalog property,
   check that the bot reads something derived from it — or say in the PR that
   it deliberately does not.
2. **Surface share is the only strong axis.** A seed fixes the centerline and
   no dial moves it: `width` and `elevation` leave length and curvature
   byte-identical, and `width` is invisible to a centerline-following bot.
   Across seeds 1–24 mean curvature spans only ×1.4. So `asphalt` is worth
   4–8% of pace and everything else under 1%. Build identities along it.
3. **`gearAccel[4]` has a hard floor.** The auto box upshifts at
   `0.94 × gearTop`, so a gear whose acceleration cannot beat drag there
   parks the car under its own upshift threshold forever. Check
   `gearAccel[i] × 0.26 × torqueCurve > drag × 0.94 × gearTop[i]`.
4. **Self-feeding torques must stay under the wheel's authority.** A
   `powerYaw` whose hands-off equilibrium (`powerYaw / (driftLat ×
surfaceGrip)`) approaches the full-lock park angle (`drift.angleSpan`)
   gives a drift that steers itself. Keep it well under.
5. **`release` and the weathervane cancel.** A slower `release` holds the
   slide up, and the straightening torque scales with exactly that, so
   slowing the release changes the linger by nothing. **`snap` is the linger
   lever** — how hard the rear pulls the nose back toward travel.
6. **Sub-1% is noise.** Two cars within a percent on an archetype are equal;
   re-tuning to flip that is rounds spent on nothing.

## Probing the feel

The tables cannot see whether the throttle deepens or straightens a slide,
whether the response curve is monotone, or whether a flick works. Stage it:

- Build the straight WIDE (`compileTrack(seed, segs, { width: 1 })`, or
  `{ ...base, width: 220 }`) and **stop the trace at `state.offRoad`**. A car
  held at lock leaves the road within a second or two, and everything after
  that is a reading about `nature`, not about the car. This produces
  plausible nonsense — an inverted 63°-vs-25° "power oversteer" and a
  non-monotone lock sweep that looks exactly like a two-state car.
- **Pin the ground speed** after each step (`hypot(u, w)` rescaled) when you
  want a steady state; it isolates the yaw response and leaves slip untouched.
- Sweep the LOCK (0.25 / 0.5 / 0.75 / 1.0) and check the curve is monotone.
- For a flick, compare the same lock driven straight in against the same lock
  after a full-lock throw the other way, **sampled through the corner** — a
  peak over a window that includes the pre-flick slide decaying reads as a
  regression when nothing is wrong.

`tests/drivetrain_test.ts` is the permanent version of these probes; extend it
rather than re-deriving them.

## Adding a car

A new car is a row in `CARS`, a body in `pwa/src/game/car-styles.ts` (load
`car-design`), and a place in the sweep. Give it a KIND of stage to own and a
kind to be worst at, then prove both. A car that is never worst at anything
and never best at anything is the one shape a roster cannot use.

## Documentation sync

`docs/driving.md` states the roster and the drivetrain model; README names the
three cars. Both move with the catalog.

## Skill self-improvement

Record traps and heuristics as lesson fragments under
`.agent/skills/car-tuning/.lessons/` via the **`skill-reflection`** skill; it
owns pruning, merging and promoting them into this file.
