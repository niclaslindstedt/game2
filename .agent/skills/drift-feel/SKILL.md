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

And the group under it — **what a MOVE buys**, which is where the angle a
layout does not find on the wheel alone comes from. Each lifts that layout's
own `depth` toward the reference slide, so a move is worth most to the car
with the least of its own:

| Knob            | What it decides                                                           |
| --------------- | ------------------------------------------------------------------------- |
| `flickDepth`    | What a full weight throw is worth — the move the game is named after      |
| `brakeDepth`    | ...and a trailed brake, ×`drivetrain[].brake` — the hatch's whole turn-in |
| `leverDepth`    | ...and the handbrake, the last resort, which reaches deepest              |
| `provokeFloor`  | How far a full provocation lowers the SPEED FLOOR — the lever's exception |
| `provokeSettle` | How fast a provocation the driver has stopped making fades back out       |

None of them ROTATES anything by itself: they open the slide, and
`grip.flickYaw`, `grip.brakeYaw`, `grip.liftYaw` and `grip.handbrakeYaw` are
what walk the car through the gap. A demand with no yaw behind it is a car
that has lost its grip and is still going straight on.

The RADIUS the car ends up holding is not in that group: it belongs to the
traction ceiling in `TUNING.grip`. `latCeiling` is the most lateral
acceleration the redirect will deliver, as a multiple of the car's own
`gripAccel`, and `latGive` is the residual slope of the saturation curve past
it. Together they are what makes speed cost radius — turn the ceiling down and
every corner needs more braking; turn it up and the car pivots a hairpin at a
straight's speed however sideways it looks. Reach for these when the complaint
is about the LINE, and for the group above when it is about the ANGLE.

Per car, in `cars.ts`: **`gripAccel`** is the grip ceiling the whole group is
measured against, and **`driftYaw`** is the extra steering authority a
developed slide hands the wheel. `gripAccel` is TWO things at once — the slide
threshold above _and_ the base of the traction ceiling (`gripAccel ×
latCeiling × grip` in `car.ts`) — so moving it changes how hard the car
corners as well as when it lets go. When you want only one of those, reach for
`TUNING.drivetrain`'s `entry`/`depth` (per layout) or `gripLat`/`driftLat`
(per car) instead.

Per LAYOUT, in `TUNING.drivetrain`: **`entry`** is where the slide starts and
**`depth`** is how far it develops once past there — different questions, both
needed. `depth` is 0..1 against the rear-driver's fully developed slide and
must never exceed 1: `releasing = clamp(sliding - asked, 0, 1)` pins at zero
if it does, and the exit stops existing.

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

### `make drift` — the drift lab, first and last

`make drift` is this skill's own harness and the first thing to run on any
change in this group. It builds **every corner the generator can build** out
of `STAGE_RULES.turn` itself — soft / medium / hard, both hands, and the
sequences that catch a car out (a chicane, a corner that tightens, one that
opens) — arrives at each one at the speed `limits.ts` says the tyres can
hold it at, and drives it once per TECHNIQUE: on the wheel alone, on a lift,
on a trailed brake, on the lever, and off a Scandinavian flick.

It gives back both halves of the loop at once:

- **The table.** Peak and apex slip, min and exit speed, the tightest radius
  held, apex g, seconds sideways, how far off the crown it ran, and whether
  the real road was wide enough for the line it took.
- **`previews/drift-<car>.png`.** One panel per corner × technique: the car
  drawn every sixth of a second as an oriented body with its TRAVEL arrow,
  so the slip angle is the visible gap between where the nose points and
  where the car is going. Tinted by speed, orange while the game calls it a
  drift, on the real road with the lab's run-off painted around it.

Read it as a comparison, never a single number. The row that matters is
almost always **what a technique buys over the wheel alone in the same
corner**: more angle at the apex, a tighter radius, and — the one that
decides whether the change is any good — a line that still fits on the road.
A move that adds twenty degrees and puts the car four metres off the crown
has not helped anybody.

```sh
make drift                              # every car, every corner
make drift CAR=compact                  # one car
make drift CORNERS=hard-left,chicane
make drift ARGS="--surface asphalt"     # gravel is the default
make drift ARGS="--table"               # numbers only, no pictures
make drift ARGS="--over 1.15"           # arrive hot, as a rally driver does
```

The lab's driver is a scripted fixture, not the bot: it answers what the CAR
does when a driver asks it something. What the BOT does with the same car is
`make sim`, and both are owed by any change here.

### ...and a throwaway probe for anything the lab does not ask

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

1. `make drift` before and after, and LOOK at both sheets. It is the only
   one of these that answers the question this skill is about, and the
   picture catches what the table cannot: a car that measures right and
   arrives at the apex pointing somewhere silly.
2. `make test` — `tests/drift_test.ts` encodes this skill's contract, on the
   REFERENCE layout (the rear-driver): the angle rises with every step of
   lock and no step is a jump, a gentle turn earns no angle, a deep exit
   crosses centre and a moderate one does not, and a drift still costs
   almost no speed. That last one is the budget that catches an `angleSpan`
   raised too far: a deeper drift scrubs as `sin²`. The front-driver has its
   own block — it washes wide on the wheel, rotates on a trailed brake, and
   gets round what is left on the lever.
3. `make sim` before and after, both tables in the PR. **`dTime` is a bot
   statistic, not a player one** — the bot drifts a corner only when its
   plan puts it past the traction ceiling (`latFraction × latCeiling`, off
   `game/limits.ts`), so a change to `entryAt` or `gripAccel` moves that
   column without anything having happened to how the car feels. Say which
   it was. Watch `off` and the drift COUNT beside it: a bot spending longer
   in the trees is a car that stopped rotating, and a count that climbs
   while `dTime` falls is the readout chattering.
4. `make screenshots` and LOOK — a drift that measures right and reads wrong
   on screen is still wrong.

**The bot reads `game/limits.ts`, so it moves when this group does.** How
much slide a layout finds on the wheel (`wheelSlide`), what the tyres will
hold (`latCeiling`) and where the floor sits (`slideFloor`) are stated once
and read by both the physics and `sim/bot.ts` — which is what stops a bot
planning corners for a car nobody is driving. Change what a car can do and
the bot changes with it; change how it is stated and check both.
