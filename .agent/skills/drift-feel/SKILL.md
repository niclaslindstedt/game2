---
name: drift-feel
description: "Use when tuning HOW THE CAR TURNS AND SLIDES — the hand-over from a gripped turn into a drift, how deep a given amount of lock goes, how a slide lets go when the lock comes off, and whether the exit needs a dab of opposite lock. Owns the `TUNING.drift` knob group, what each knob does to the feel, the probe that measures the response curve instead of guessing at it, and the traps: the feedback loops that turn a continuous car into a two-state one, and the tests and sim columns that catch it."
---

# The drift's feel

This skill owns **one question**: what does the car do as the wheel goes from
centre to full lock, and what does it do on the way back?

Everything that shapes that answer lives in **`TUNING.drift`**
(`engine/game/defs/tuning.ts`), applied in `stepGrounded` and `slideFactor`
(`engine/game/car.ts`). Change the knobs first. Reach into `car.ts` only when
no knob expresses what you want — and then add a knob.

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs drift-feel --list`.

Load `game-feel` beside this one when the goal is the SENSATION (speed,
drama, the camera); this skill is the mechanism under it.

---

## The knobs, in the order a drift happens

| Knob                     | What it decides                                                                  | Turn it up to…                                                        |
| ------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `entryAt`                | Where the slide starts, as a fraction of the tires' grip (`gripAccel`)           | …keep the car gripped longer; the drift moves to the top of the throw |
| `entrySpread`            | How much further past that it takes to develop fully                             | …spread the hand-over over more of the wheel: smoother, later angle   |
| `angleSpan`              | The slip angle a fully developed slide asks for — the DEPTH of a committed drift | …go more sideways at full lock (watch the speed cost)                 |
| `angleBand`              | How far past that angle the deepening forces take to fade out                    | …let throttle and lift move the car around inside the drift more      |
| `release`                | How fast a slide lets go once the wheel stops asking, 1/s                        | …drop the angle sooner when the lock comes off                        |
| `releaseHang`            | How much the rotation outlives the lock, 0..1 — the OVERSHOOT                    | …make the exit swing further past centre and need a proper catch      |
| `releaseSnap`            | How hard the rear pulls the nose back to the travel direction on the way out     | …gather the car up faster, and (with `hang`) overshoot harder         |
| `enterSlip` / `exitSlip` | The angle at which the car READS as drifting — dust, HUD, stats                  | …make the readout stingier about calling something a drift            |

The RADIUS the car ends up holding is not in that group: it belongs to the
traction ceiling in `TUNING.grip`. `latCeiling` is the most lateral
acceleration the redirect will deliver, as a multiple of the car's own
`gripAccel`, and `latGive` is the residual slope of the saturation curve past
it. Together they are what makes speed cost radius — turn the ceiling down and
every corner needs more braking; turn it up and the car pivots a hairpin at a
straight's speed however sideways it looks. Reach for these when the complaint
is about the LINE, and for the group above when it is about the ANGLE.

Per car, in `cars.ts`: **`gripAccel`** is the grip ceiling the whole group is
measured against (it is _only_ the slide threshold — lateral grip itself is
`gripLat`/`driftLat`), and **`driftYaw`** is the extra steering authority a
developed slide hands the wheel.

`releaseHang` and `releaseSnap` are a **spring and its damping**: `snap` is
how hard the nose is pulled back to straight, `hang` is how slow the yaw is
to obey. Overshoot needs both. With `snap` at zero the exit can only decay —
the lateral grip is an exponential decay of the slip angle, so nothing in the
model can carry the nose through centre on its own.

---

## The two traps

Both turn a car whose angle answers the wheel into a car with two states —
gripped, or the same deep drift, a notch of wheel apart. Both are feedback
loops, and both read as perfectly reasonable code.

**1. Measuring the slide off what the car is DOING.** `slideFactor` takes the
turn the wheel commands (`steer × steerGain × u`), not `car.yawRate`. The
slide hands the wheel extra authority (`driftYaw`), so a demand read off the
resulting yaw closes a loop of gain `u · steer · driftYaw / (ceiling ·
entrySpread)` — above 1 at any real corner speed, and a loop like that has no
equilibrium in the middle. Using `car.yawRate` there looks more physical and
costs the car its entire mid-range.

**2. Letting the ANGLE hold the slide up.** A sideways car always has an
angle, so `slide = f(|slip|)` is the same loop by another route: more angle →
more slide → less lateral grip → more angle. What keeps a slide alive through
the wheel passing centre is the decaying memory of what was ASKED
(`release`), not the angle the car happens to be at.

The tell for either is in the response curve below: a flat 1-2° across most
of the throw and then one step to the maximum.

---

## Measure it — never tune this by feel alone

Write a throwaway node script and delete it. Node runs the engine's
TypeScript directly, the same way `scripts/simulate-run.mjs` does, so a probe
is one file and its output goes straight to the terminal:

```sh
node --experimental-strip-types --disable-warning=ExperimentalWarning probe.mjs
# inside: const { NEUTRAL_INPUT, TUNING, compileTrack, createGame, step } =
#           await import("<repo>/engine/index.ts");
```

A vitest probe works too but costs you the output: `console.log` is swallowed
by the runner, so a `tests/zzprobe_test.ts` has to collect lines and
`writeFileSync` them to a file. Only reach for it when the probe needs a test
helper it would otherwise have to duplicate.

Drive a synthetic straight (`compileTrack(0, [{ kind: "straight", length:
8000, feature: "none" }])` with a widened `width`), accelerate to a fixed
entry speed, hold a lock for ~2.5 s, and record the settled slip and the
cornering radius (`u / |yawRate|`). Sweep the lock in 0.05 steps at two or
three speeds.

Sweep the SURFACE too when the complaint names one. A stage sample carries
its surface, so `base.samples.map((s) => ({ ...s, surface, bank: 0 }))` on a
compiled straight is a controlled A/B — and the numbers to print beside the
angle are the cornering radius and the lateral g (`u · |yawRate| / 9.81`),
because "the steering is too tight" is a statement about those, not about
slip.

**Read the radius ratio between adjacent locks, not just the angle.** A
gripped car's radii fall off as `1/lock`, so the ratio decays smoothly toward

1. Compare each ratio against that gripped baseline (1.5 for 0.2→0.3, 1.33 for
   0.3→0.4, and so on down): the EXCESS over it is the drift arriving, and its
   size is exactly how much a player feels the car "change into" something.

Better still, read the sweep the other way round and report the slip the car
carries while HOLDING a fixed radius (90, 60, 40, 25 m — the generator builds
soft turns at 55–100 m, medium at 32–55, hard at 13–30). "It steers too much
into the corner" and "it should slide more" are both claims about that table,
and neither is visible in a lock sweep: two tunings with the same full-lock
angle can put the car on completely different lines.

For the exit, hold a lock, then centre the wheel and sample the **signed**
slip every 0.08 s: `Math.min` of `slip × side` is how far past centre it
swung. Deep drift a degree or two past; a moderate one not at all.

---

## Verify

1. `make test` — `tests/drift_test.ts` encodes this skill's contract: the
   angle rises with every step of lock and no step is a jump, a gentle turn
   earns no angle, a deep exit crosses centre and a moderate one does not,
   and a drift still costs almost no speed. That last one is the budget that
   catches an `angleSpan` raised too far: a deeper drift scrubs as `sin²`.
2. `make sim` before and after, both tables in the PR. **`dTime` is a bot
   statistic, not a player one** — the bot drifts a corner only when it
   plans it above the grip ceiling (`latFraction × gripAccel` in
   `bot.ts`), so a change to `entryAt` or `gripAccel` moves that column
   without anything having happened to how the car feels. Say which it was.
3. `make screenshots` and LOOK — a drift that measures right and reads wrong
   on screen is still wrong.
