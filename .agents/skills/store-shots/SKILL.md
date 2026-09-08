---
name: store-shots
description: "Use when regenerating the App Store / Play Store / Steam screenshot set, changing what it stages, or writing the listing copy that ships beside it — after an art pass, a HUD change, new cars or countries, a rebalance that changes what a race looks like, or a rewrite of the marketing captions. Drives the real game to staged moments at Apple's and Valve's exact rasters, captions them in the game's own type, and holds the result to a bar before it reaches a store listing."
---

# Store screenshots and the listing

The store set is **marketing**, not documentation. It is regenerated whenever the
game stops looking like these frames — new car bodies, a redrawn HUD, a new
country, a generator change that alters what a stage looks like.

The listing beside it is the same job in words:
[`native/store/listing.mts`](../../../native/store/listing.mts) is the one
authored source for every storefront, and
[`native/store/README.md`](../../../native/store/README.md) is the submission
package. [`native/RELEASING.md`](../../../native/RELEASING.md) is the run-through.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs store-shots --list`, then the ones this task
touches (`--scope=…`, `--concepts=…`). Load **`skill-reflection`** at both ends
of the session.

## The one rule

**PUT THE FIELD IN THE FRAME.** Every recipe runs `mode=headsup`, and it is not
a preference.

A rally stage is one car alone against a clock. That is the sport, and it is the
worst possible screenshot: a frame of a single car on an empty road sells a
screensaver. What sells a racing game is fifteen other cars in the way.

The mechanism matters, because getting it wrong is invisible until you look at
the pictures:

- **The campaign is a STAGGER.** Every crew drives its own stage on its own
  clock, so they are never physically near the player. The first version of this
  set was six photographs of an empty road with POSITION 15/15 in the corner.
- **Heads-up is a MASS START** (`GRID_MAX` — fifteen on one grid), so the crews
  are on the same road at the same time.
- **A placement brings them with it.** `placeField` (engine/sim/field.ts) drives
  every rival forward to match a placed run, so `?at=racing&s=2000` still has
  the field in it.
- **But only the OPENING has them nose to tail.** Each crew then holds the pace
  its own driver manages, so by two thirds of a stage the field is strung out
  over hundreds of metres. A frame that needs cars _close_ has to be driven from
  the grid rather than placed (the `pack` recipe), and a frame that only needs
  cars _present_ can be placed (`drift`, `air`, `weather`).

Corollaries, each learned by looking at a bad frame:

- **The start line is the best single frame in the set**, and `camera=far` is the
  rig for it — `heli` looks down the grid and the column recedes into single file
  with the name plates stacked into an unreadable pile.
- **No main-menu shot.** The store already shows the icon and the title.
- **No `?debug`, no `?god`.** Either puts developer chrome in the frame, and the
  FPS readout in particular reads as a debug build. `hud=1` pins it off and the
  harness hides `.hud-fps` as well, because the two switches answer different
  questions.
- **No RETURN TO TRACK, ever.** A recovery strip across the middle of a store
  frame is the game telling the buyer the driver is lost. `atDrift` refuses a
  frame with `.hud-recover` in it.

## What the six frames stage

Not six pretty moments — six DIFFERENT claims, each staged where its claim is
legible. Two frames of a car on gravel from behind is one claim made twice.

| Recipe    | The claim                        | How it is staged                                                       |
| --------- | -------------------------------- | ---------------------------------------------------------------------- |
| `grid`    | this is a race, not a time trial | fifteen cars on the apron, lights filling, every pipe smoking          |
| `pack`    | the field is in the way          | driven from the grid to taiga-1's first two calls, still nose to tail  |
| `drift`   | the drift IS the game            | placed before the stage's tightest corner, then driven sideways        |
| `air`     | the jumps are real               | placed before Bajada's J1, shuttered off the wheels leaving the ground |
| `country` | the roads are generated          | the helicopter over Switchbacks' hairpins, `drawdistance=far`          |
| `weather` | the sky is not wallpaper         | Summit to Valley's own storm, at dusk, on wet tarmac                   |

**The seventh, if Apple's ten slots are ever wanted, is `cockpit`** — the
in-car view, which no other frame shows. It was cut from six because it is the
weakest at holding other cars in shot; staged early in a heads-up race with a
rival through the windscreen, it would earn its place.

## Pick the stage with `make level`, not by feel

**Never guess where a corner is.** `make level LEVEL=taiga-1` describes one stage
without driving it — every call, jump, split and roadside solid, labelled and
positioned, in a couple of seconds with no build and no browser. That is where
every `s` value in the recipes comes from, and it is the difference between a
recipe that waits three stage seconds for its corner and one that times out.

Two things it tells you that decide a frame:

- **The corner's RADIUS.** A MEDIUM corner (R ≈ 30–50 m) drifts. A HARD one
  (R ≈ 16–22 m) spins, and a spin is a different frame with a different caption.
- **What is beside the road.** "12 trees within 12 m of the edge" is a frame
  where the car will be behind a tree.

## THE LIGHT IS PART OF THE CHOICE

Each campaign row carries its own hour, weather and season, and a stage is not
interchangeable with another stage on the same road.

The `drift` frame was first staged on **Granite Ridge**, which the campaign runs
in autumn rain at five in the afternoon — a wonderful stage to drive, and the
frame came back as a dark brown field under a grey sky with a pair of tail lights
in it. The frame that works is **Loggers' Run** at one in the afternoon in high
summer. The dark and the wet go in the `weather` frame, where being dark is the
point.

**And the weather comes off the campaign row, not off a `?weather=` override.**
A storm pinned onto a stage the campaign runs in the clear is a screenshot of a
build nobody plays.

## The bot will not drift for you

Measured, not assumed: placed sixty metres short of a sixteen-metre-radius HARD
RIGHT on taiga-3, the bot brakes from 112 km/h to 40 and takes the corner
**gripped**. `data-drift` never lights at all. That is the bot being a good rally
driver — a tidy line through a hairpin is faster than a spectacular one — so a
drift frame that waits for the bot to produce one waits for ever.

`?bot=1` hands the wheel over for good the moment a control is touched, which is
what makes the fix possible: **the bot drives to a corner worth photographing,
and the harness drives that corner.** Two halves, and both are needed:

1. `commitToTheCorner` — wait for the co-driver's call, then throttle and full
   lock. This is what makes the car step out.
2. `holdTheSlide` — wait for `data-drift` **with the car still on the road**,
   then take the lock off and leave the throttle down.

The second half was paid for twice. Held lock plus held throttle does not
photograph a drift, it photographs the END of one: the car reaches its angle,
keeps going, and leaves the road, and the frame comes back as a car in a field
with RETURN TO TRACK across it. Nobody holds full lock through a corner. Taking
it off is what a driver does, what the drift model is built around, and what
leaves the car sideways ON the road for the instant the shutter wants.

## The shutter is in STAGE seconds, and this is the thing that will fool you

Under software rendering — every CI runner, every web session — **the simulation
advances at roughly a tenth of wall time**, and at a different fraction on every
machine and every raster. A `waitForTimeout` therefore lands somewhere else on
the road each time it runs.

So every offset in a recipe is `captureAtS`: seconds of the RUN's own clock
(`.hud-clock-total`) past the trigger. Both drivers report the ratio they
observed — near 1 is a real GPU, near 10 is software rasterization, and it gets
worse with the raster, because @3× is nine times the pixels to rasterize.

**AND THE SHUTTER ITSELF COSTS STAGE TIME, which the offset does not count.**
Measured at 2868×1320 on a four-core runner: one capture is 25.3 wall seconds,
during which the run advances **0.90 stage seconds** — longer than Bajada's jump
is airborne (0.70 s). On that machine no `captureAtS` can reach the flight, and
**zero is already too late**. Both drivers now measure it, mark such a frame `!`
rather than `✓`, and say so; the sweep labels every late sample `+N.NN LATE` and
tells you not to pick a winner off the sheet.

So: **if two very different offsets give you the same frame, stop tuning the
offset.** A moment shorter than about a second needs a machine where a
full-raster screenshot costs about a second. Anything staged as a POSITION — the
grid, a corner, a vista — is immune, because it is still true a second later.

Two more consequences worth planning around:

- **A full three-raster set is an hour or more on a machine with no GPU.** Shoot
  one raster while iterating (`--only iphone`), and the full set when the recipes
  are settled.
- **`PATIENCE` is ten minutes per wait on purpose.** A recipe placed a corner too
  early does not become a slow frame, it becomes a timeout.

## The loop: sweep, look, narrow, lock

**Never guess a capture offset.** A slide lasts a second and a half; a jump
rather less.

| Script                 | Job                                                          |
| ---------------------- | ------------------------------------------------------------ |
| `store-shot-sweep.mjs` | Reproduces one recipe at a matrix of offsets and sheets them |
| `store-shots.mjs`      | Reproduces each recipe at its locked-in `captureAtS`         |

```sh
make build                                                  # ALWAYS first
make store-sweep ARGS="--shot drift"                        # 1. COARSE
# 2. LOOK at previews/store-sweep/drift.png
make store-sweep ARGS="--shot drift --around 0.4 --span 0.6"  # 3. FINE
# 4. LOOK again, write the winner into that recipe's captureAtS
make store-shots                                            # 5. LOCK
```

Both drive the same recipes, so a frame is tuned in one place — and the sweep
**re-stages the run for every sample**. That costs a stage build per sample and
is not optional: sampling one run instead drifts the shutter further past the
schedule with every frame, because a full-raster screenshot and a compositing
pass both cost real time, and the sheet would then be labelled with the numbers
it was asked for rather than the ones it took.

The sheet labels every cell with its offset and marks the chosen one, so picking
a winner is reading a number off a picture.

## `make build` first, every time

Both harnesses serve `pwa/dist`. A stale dist photographs the last change rather
than this one, and the picture that comes back is wrong in a way that reads as a
bug in the code.

## The captions, and the machine you shoot on

The band is composited **in a browser page**, in the game's own type stack and
the identity module's own palette — so the caption sits under a frame it visibly
belongs to, and this repository stays free of a native image dependency.

**The type stack means the machine matters.** It asks for `Avenir Next
Condensed` and falls through `Arial Narrow` and `Roboto Condensed` to
`sans-serif`; a Linux runner has no condensed face, so its captions are wider
than a Mac's. The HUD _in the frame_ falls through identically, so caption and
HUD always agree with each other — what varies is which of the two pictures you
shipped. The drivers print which family actually resolved. **Shoot the shipping
set on macOS.**

## When the timing isn't the problem

If a recipe looks weak at EVERY sampled offset, stop sweeping — the staging is
wrong. Check, in order:

1. **Is the light any good?** See the Granite Ridge story above. This is the most
   common answer.
2. **Are there other cars in it?** If not, the frame is placed too far down the
   stage — drive it from the grid instead.
3. **Is the camera the right rig?** `chase` shows the car's angle, `far` shows
   the field, `heli` shows the world, `close` shows the car. A frame about one of
   those shot on the rig for another is a frame about nothing.
4. **Is the car doing anything?** A placed run at rally pace on a straight is a
   photograph of scenery.

## When you are done

Re-shoot **every** raster (`make store-shots` with no `--only`), confirm the
count and `0 failed`, and then **look at the set as a set**. Six frames should
not be six green forests: the three countries are the reason this game does not
look like one screenshot, and the set should say so — green, gold, white.

Then `make store-preflight` and read what is still outstanding.
