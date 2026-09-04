---
name: crash
description: "Use when working on what happens to the car once it is PAST SAVING — the trip that puts it over, the ROLLOVER itself, how much momentum a crash carries and what it may be charged for, and a rolling body meeting solids. Owns `engine/game/roll.ts`, the `TUNING.air.roll` knob group, the trip in `air.tripSlide`/`tripRoll`, the training ground's roll lane (R1), and the two labs that are the only honest way to judge any of it — `make crash` (one accident in sequence, with the numbers) and `make roll`. NOT the contact model or the damage ledger (`collision`), and NOT how a car gets sideways in the first place (`drift-feel`)."
---

# The crash

This skill owns **one question**: what does the car do between the moment it
stops being drivable and the moment it stops moving?

Three modules answer it, and the split matters:

- **`engine/game/roll.ts`** — the body as a shape with a weight in it, going
  over. Knobs in `TUNING.air.roll`.
- **`car.ts`'s `tripOnLanding`** — the landing that starts one. Knobs in
  `TUNING.air` (`tripSlide`, `tripRoll`, `tripMax`, `tripKeep`).
- **`collision.ts`'s `tripRoll`** — the low solid that starts one instead,
  which is how a rally car actually rolls.

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs crash --list`.

Load **`collision`** beside it whenever the answer involves what a contact
COSTS (crush, parts, the ledger, the wreck); load **`drift-feel`** when the
question is really about the slide or the SPIN that precedes the crash — a
spin is the far end of the drift model, not of this one.

---

## The instrument: `make crash`

A crash is four motions at once — travel, roll, yaw, pitch — punctuated by
contacts that trade between them, and it is over in about a second. Watching
it in the game shows a car at speed, mostly off screen. So do not: stage one
on the bench and read it.

```sh
make crash                       # the whole set
make crash CRASH=carry           # one scenario
make crash CRASH="carry debris"  # ...or several
make crash ARGS="--car=coupe --every=12 --seed=3"
```

It writes `previews/crash-<scenario>.png` and prints a frame table. **The
table is what a claim gets made out of; the picture is what tells you which
number to go and look at.** Three panels:

| Panel       | The question it answers                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **PLAN**    | Where did it go, which way was it pointing, and what did it reach? Struck props are coloured.                                                |
| **PROFILE** | Did it CARRY? Outlines walking away = a roll that travels; outlines stacking up = a car hitting glue.                                        |
| **FRAMES**  | One cell per sample: the body from behind on its pivot, from above against the release heading, and every number that decides the next step. |

The scenarios each isolate ONE mechanism, and adding a sixth is a row in
`SCENARIOS` (`scripts/lib/crash-stage.mjs`):

| Scenario | What it isolates                                                            |
| -------- | --------------------------------------------------------------------------- |
| `trip`   | A lip taken crossed up — the landing that goes over                         |
| `carry`  | The same at pace with NOTHING to hit: the momentum question, on bare ground |
| `debris` | ...and the same roll with a field of solids in the way                      |
| `slide`  | Sliding into a low rail on the flat — the rally roll, no jump               |
| `spin`   | A solid caught on the nose corner: yaw without going over                   |
| `wall`   | Square into something rooted: the pure contact                              |
| `cliff`  | On its ROOF, sliding over an EDGE — the ground runs out under one side      |
| `bank`   | ...and on its roof on a plain steep bank, which it should just slide down   |

### The one number to read

Every scenario prints a roll line:

```
over for 2.69s  41.1m along  92 into it, 10km/h out  0.86g
```

The **g is the whole-crash retardation**, and it is the one figure a rollover
can be checked against the world with: accident reconstruction measures a real
one at around **half a g**. Over about 1 g the model is taking speed it should
not be, and the picture will show it — outlines piling into a knot.

`along`, `into it` and `out` are measured over the ROLL, not the run: a crash
ends when the car stops moving, but the roll hands the car back the moment the
body settles on a face, and everything after that is a wrecked car coasting.
Read the whole-run summary above it for damage and where it came to rest.

## The other instruments

- **`make roll`** — every trip across a range of entries, drawn from behind,
  with the pivot marked. `make crash` is one accident in depth; this is the
  spread. Required before/after any roll-model change, same as this skill's.
- **THE ROLL LANE (R1)** on the training ground
  (`engine/mapgen/arena-course.ts`) — the same experiment where a PERSON can
  run it: a marked lane with a low concrete rail down each edge, thirty
  metres of clear run-out with distance boards, and a debris field at the end.
  Arrive at a rail properly sideways and it puts you over. `make level`
  draws it; `tests/arena_test.ts` names it and says what is there.
- **`make sim` is BLIND to all of this.** Bots do not roll — the table's
  `roll` column is 0 across every seed — so it is a no-regression signal and
  never a confirmation. Run it anyway (a roll change is a `TUNING` change and
  those reach three directories away), but never cite it as evidence the
  crash got better.

## The rules

- **A ROLLOVER IS NOT A STOP.** The body weighs a tonne, the ground gives it
  a shell's friction, and it is off the ground for most of every fast turn,
  where nothing slows it at all. If a car goes over at pace and covers less
  than its own length per turn, something is charging it for an impact it
  never made — that failure has happened three separate ways in this module
  and every one of them read to a player as "the car hit glue".
- **`roll.faceGrip` is ONE Coulomb budget, spent once.** A body grinding on
  the ground has one contact patch: `grip × g`, pointing against the way it
  is actually travelling. The share ACROSS the car works on the lever of its
  centre height and turns it over; the share ALONG it retards it. They are
  not two knobs and must never be written as two — a lateral bite plus a
  separate scrub on the travel charges the same friction twice and creates
  roll out of nothing.
- **...and it is a SHELL's coefficient, per face.** Panels and glass on soil,
  around half a g — a tyre's 0.85 across the whole roll puts a rollover over
  a g. But the shell is not one surface: `wheels` is rubber dragged sideways
  and the highest (it is what bites at the start of a trip), `flank` is a
  door skin and slides longest, `roof` is glass and pillars and gutters
  digging in. BLENDED across the quarter turns, never stepped — a
  coefficient that jumped at each face would kick the roll every quarter.
- **A contact may only be charged for what the FLIGHT put in.** The seat is
  MOVING — `centreHeight` runs at `slope × rollRate` under a turning body,
  which past a corner is ten metres a second — so the closing speed against
  the curve is mostly the body's own ROTATION, which `pivotKeep` already
  prices. `g × airTime`, capped by the closing, is the honest arrival.
  Reading `-vy` books every chattering step around a corner handover as a
  ten m/s impact.
- **A tyre arriving ROLLS; a panel DRAGS.** `pivotKeep` reports whether the
  arriving corner is sprung, and the travel rub has to read it too, not just
  the rotation. A roll passes through upright once a turn, and charging that
  arrival a full sliding stop ends the roll there, every time.
- **THE ROLL OWNS THE CAR UNTIL IT HAS STOPPED TRAVELLING**, not until it
  has stopped turning — unless the face it settled on is its wheels, which
  is a car that drives on and goes straight back to the handling model.
  There are no tyres under a car on its roof, and `stepOverturned` returns
  before anything moves, so handing a still-sliding body back FREEZES it: a
  car settled onto its roof at 63 km/h stood there for the whole of
  `lieFor` with the speed unspent in its velocity. `roll.restSpeed` is
  where the grinding stops and the lying begins.
- **A ROLL HAS TWO HALVES AND THEY ARE NAMED.** `rolling` is the roll owning
  the body; `sliding` is which of its motions it is doing — turning over its
  corners, or lying flat on a face still going somewhere. `sliding` is only
  ever true while `rolling` is, and is set as a fact about the step just
  taken rather than a mode anything remembers. The physics is genuinely
  shared (one friction budget, one curve), which is why this is a flag and
  not a second branch in `step.ts`; the APPEARANCE is not, which is why the
  flag has to exist at all.
- **THE CENTRE-OF-MASS CURVE IS READ AGAINST THE GROUND** (`bed` =
  `atan(slopeLat)`), never against level. Its valleys are the faces a body
  rests on, and on a hillside those are the hillside's — the same angle
  `car.ts` settles a car's springs onto. Round the settled face against the
  bed too. Ignore it and a body on its roof sits in the roof's valley with
  gravity holding it there however steep the ground.
- **A SLIDE IS TURNED BACK INTO A ROLL BY AN EDGE, NOT A RAMP.** A roof
  resting on a plane is a stable face however steep the plane — the honest
  answer there is that it slides. What puts a sliding car over is the ground
  running out from under ONE side of it, a solid it reaches, or the drag
  levering it past its own corner. A scenario built as a uniform bank tests
  none of that and reports the model broken when it is the scenario that is:
  `bank` and `cliff` in the crash lab are that pair, and the contrast
  between them is the point of having both.
- **A car that is going over rides over NOTHING** (`ridesOver`). It has no
  wheels underneath it to climb anything with, and `car.y` for a rolling body
  is its origin held a hull's width in the air — so a bar measured from there
  flies it over every stone in its path, at the one moment it is least able
  to avoid them. `clipSolids` is skipped for the same reason.
- **The roll counts nothing and decides nothing.** No turn counter, no "long
  enough" rule. A car goes over as many times as it has the energy for and
  comes to rest on whichever face it ran out on; `step.ts` asks `onItsWheels`
  afterwards. Never add a cap — if a roll goes on too long, the energy
  bookkeeping is wrong, and a cap hides it.
- **After changing `car.u` or `car.w`, call `updateSlip(car)`** — the grounded
  redirect rebuilds velocity from `car.slip` and silently erases an impulse
  applied against a stale angle.
- **A change here moves the DAMAGE too.** Fewer spurious contacts is less
  wear, and `tests/jump_test.ts`'s "a roll STRIPS the car" is calibrated
  against it. Re-read that bar deliberately rather than nudging it — and see
  `collision`'s lesson on flat-vs-point impact rates before touching what a
  contact folds.

## Workflow

1. **Take the baseline first.** `make crash` (and `make roll`) before the
   first edit — both drive the engine directly, so neither needs a build, and
   the whole set is seconds.
2. **Find WHICH STEP the speed goes in.** Not which second. Walk the run one
   step at a time and print any step that sheds more than a fraction of a
   m/s; a crash that is wrong is almost always one or two catastrophic steps
   with a long correct grind after them, and the average hides it completely.
3. **Then ask what that step was charged for.** In this module the answer has
   never once been "friction is too high" — it has been an arrival the body
   did not make.
4. **Tune defs only after the model is honest.** `TUNING.air.roll` numbers
   have units and a physical meaning in their comments; make the comment true
   before changing the number.
5. **Re-measure both labs, then `make sim`** (for the no-regression, not the
   confirmation), and put both crash tables in the PR.
6. **Isolate before you conclude.** A car thrown off a lip lands in the wild
   and tumbles through the forest, and a trunk it snaps costs it twenty
   metres a second in one step. That is the contact model working. Any
   measurement of what a ROLL costs has to sweep `obstaclesNear`/`treesNear`
   out of the way first — the lab's `bare` flag, and the same three lines in
   a test.
7. Docs: `docs/driving.md` ("THE ROLL ITSELF" and the bullets around it).
