---
name: game-feel
description: "Use when the task is about how the game FEELS to play — the sensation of speed, the drift as a moment of drama, the camera's framing, how pace and danger read on screen. The feeling of racing and drifting IS the core product; this skill owns the reference (Sega Rally 1995), the levers that create the sensation across engine, camera, world scale and FX, how they interact, and the look-first verification loop. Load it for any change whose acceptance test is 'does it feel fast / does the drift feel right', alongside the skill that owns the specific subsystem being edited."
---

# Game feel — speed and the drift

The feeling of racing and drifting is the core part of this game. A change can
pass every test and still fail the product: **the acceptance test for feel is a
screenshot or a run, looked at**, next to the reference. This skill owns that
judgement and the levers behind it.

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs game-feel`. Record what a tuning session
learns at the end (`skill-reflection` owns the format).

## The reference: Sega Rally Championship (1995)

The arcade original is the north star for how speed and drifting should read.
The proportions, measured off its chase cam:

- **The car anchors the BOTTOM of the frame** — wheels ~80% down the screen,
  roof around the middle. The road and world own the frame, not the car.
- **The camera stands well OVER the roof and looks down at it** — about 13°
  of depression from the lens to the top of the car, close behind (the car
  spans roughly a quarter of the frame width). That angle, not the height, is
  the number to reason about: it sets how far up the frame the roofline
  reaches AND how far ahead the sight line grazing it lands, so it is the
  whole of whether a player can see where they are going. At ~13° the roof
  sits about three fifths down the frame and the road is visible from a
  couple of metres past the bumper; under ~8° the car is a wall and a player
  reports, correctly, that they cannot see the road. Height is therefore a
  CONSEQUENCE of the standoff — `height = roofY + (dist − roofZ)·tan θ` —
  which is why a short boom needs proportionally more height over the roof
  than a long one, and why holding one θ across `close`, `chase` and `far`
  is what makes them one shot at three lengths. "Low" in a chase cam means a
  short BOOM and a shallow AIM, never a lens parked at roof height.
- **The horizon rides high** (top third), so the ground plane streams past at
  a shallow, speed-selling angle.
- **The camera follows the ROAD, not the nose.** Mid-drift the car sits yawed
  25–30° across the frame while the road still flows to the vanishing point.
  The drift is DISPLAYED by the framing; chase cams that track the nose hide
  it.
- **~160 km/h in 3rd gear**, and past ~70 km/h a sharp turn IS a drift entry
  — no handbrake required. Speed and sideways are the default state, not the
  exception.
- **The ground answers back**: dense low gravel spray at the driven and
  sliding wheels, and a car that gets visibly dirtier as the stage goes on.

Reference frame: search the web for "sega rally lakeside" screenshots (the
Topgear one used for the 2026 rework is 1680×945 and shows all of the above).

## The levers, and who owns each

Feel is produced by five subsystems TOGETHER. A change to one usually needs a
sympathetic change in another — scaling speed without scaling the stages makes
the game harder, not faster.

| Lever | Where | Owning skill |
| --- | --- | --- |
| Speed & drift model | `engine/game/defs/{tuning,cars}.ts`, `car.ts` | `engine-system` |
| Stage scale | `engine/mapgen/rules.ts` | `mapgen-improvement` |
| Camera | `pwa/src/game/camera{,-eye,-feel,-ground}.ts` | (this skill) |
| Ground-contact FX | `pwa/src/game/{dust,renderer,car-dirt}.ts` | `visual-effects` |
| The car's motion cue | `pwa/src/game/car-mesh.ts` (wheels, pitch) | `car-design` |

What each contributes:

- **Camera height and pitch** set the baseline: low + shallow = fast.
  FOV stretching with speed (`wantFov`) is the acceleration cue; camera
  pull-back with speed is the "the car is straining ahead" cue. The
  travel-direction yaw blend (`angleLerp(heading, velAngle, w)`) is what makes
  drifts visible — raising the travel weight shows more drift angle.
- **The turn swing** (`swing` in camera.ts): the camera slides toward the
  outside of the corner with yaw rate, so turning reads in the framing before
  the drift angle develops.
- **The outside camera as an INSTRUMENT** (`CAMERA_FEEL` in
  `camera-feel.ts`): grip read as height (the lens hovers up as the car goes
  light, to the top of its travel when it flies), the car's attitude as a
  degree or two of tilt (back up a climb, banked into a turn or a slide), and
  pace past the gears as a tremor. Every number is a knob there; the rigs
  only scale them (`hover`, `shake`).
- **Speed numbers only feel fast against world scale.** Higher `gearTop`s need
  longer straights, larger soft-turn radii and a wider road
  (`STAGE_RULES`) or the game reads as twitchy instead of quick. Hard-turn
  radii stay tight on purpose — they are the drift moments.
- **The wheels must visibly turn** — spoked alloys break the face's rotational
  symmetry, tread lugs break the tread's. An axisymmetric wheel reads parked
  at any speed.
- **Gravel spray** scales with what the tires are doing (rolling < braking <
  drifting/off-road), inherits the car's wake so it streams backward, and uses
  many small particles — a large point sprite near the low camera renders as a
  glitchy square.
- **Dirt accumulation** (`car-dirt.ts`) makes pace leave a mark: light tan
  dust (dark mud is invisible on dark paint), low-heavy, speckled per face,
  never past ~0.7 so the livery survives.

## The camera modules, and what each decides

The camera is this skill's own subsystem. One row per question:

| Question | Where |
| --- | --- |
| Where the camera stands OUTSIDE the car | `CHASE_RIGS` in `pwa/src/game/camera.ts` — one row per angle |
| Which of the TV mode's TWO cameras has the frame | `camera-tv-cut.ts` — the tripods own the tight corners, the chase boom owns the road between them. The two edits are not the same gesture: television CUTS to the corner camera and MOVES back onto the boom. `?tvstand=1` pins the gallery for a scripted still |
| What the outside camera CONVEYS (grip, attitude, flight, pace) | `CAMERA_FEEL` in `camera-feel.ts` — DOM-free: grip as height (`hover` per rig), a degree or two of tilt, the flight path as the ROD's own angle (`flight` per rig), a tremor past the gears |
| What the outside camera does while the car is IN THE AIR | the ROD turns (`flight` in `camera-feel.ts`) — it lies along the car's own path, dipping under a climbing car and swinging over a falling one, and the AIM turns with it. Its LENGTH never changes, so the car is the same size off a cliff as on the road. Sprung and under-damped, so it winds on with weight and bounces once through level at the landing. `make aircam` photographs it |
| What an outside rig may STAND on (floor, play) | `camera-ground.ts` — read over a footprint, sunk at a bounded rate, except under a car in free fall, which may always outrun the ceiling |
| How an IN-CAR camera sits, moves and takes a hit | `camera-eye.ts` (`EYE_RIGS`) |
| What the DRIVER'S head does while the car goes over | `bolted` in `camera-eye.ts` — the neck hands over to a bolt and the gaze takes the body's own basis one for one |
| Going from one VIEW to the next on the ladder | `camera-change.ts` — a FLOWN move, never a cut; `tests/camera_test.ts` measures it |
| Going from one CAR to another | `camera-sweep.ts` (`make transit` photographs it); the shot a stage closes on is `camera-finish.ts` |
| What the outside camera does while the car ROLLS | the HOLD (`holding` in `camera.ts`) — the yaw, the boom and the lens all stop reading a car nobody is driving, and the frame comes level |
| WHEN the outside rig follows the car's direction again | `car.planted` — four tyres carrying and the body inside its springs; not the frame `rolling` goes false, and a respawn drops the hold |
| How much a BLOW shakes the picture, and which do | `camera-shake.ts` — DOM-free; a contact shakes the CAR, never an outside rig |

**A reading that moves where the camera STANDS is stepped BEFORE the lens is
placed.** `camX`/`camZ`, the ground under them and the floor snap are all
sampled AT the lens, so a boom moved after that sample is a lens standing over
ground read half a metre away — on steep terrain, metres of vertical error and
a shot that pumps. Step it with `climb` ahead of `camX`/`camZ` and build the
pose from `dist + felt.reach`; readings that only offset an already-placed lens
(the bank, the tremor) can stay where they are. Never fold one into `wantDist`
instead: it then eases twice, on its own clock and again on the rig's
`RIG_EASE`, which turns a lag into a rumour of one.

Four contact sheets, all needing `make build` first. **They are slow** — a
web session's software rasterizer takes ~20 minutes over `rollcam`'s 1120
frames — so take the BEFORE sheet before the first edit, and let the harness's
own vite build finish before editing sources (after that the served bundle is
on disk and the run is safe from further edits):

```sh
make views     # THE CAMERA KEY: every step of the ladder, six consecutive frames each
make transit   # the camera going from the finish line to a crew still out, frame by frame
make rollcam   # the camera WHILE THE CAR GOES OVER — one roll, frame by frame, from two seats (held outside rig, bolted seat)
make aircam    # the camera WHILE THE CAR IS FLYING — a designed jump and a hundred metres off an alpine ledge, from two seats
```

`aircam` is the cheap one of the four (~1500 rendered frames, a few minutes
under SwiftShader): the bot's run-in to each staging point is stepped without
being drawn. Its two throws were both chosen by MEASURING — a throw that
looks reasonable mostly buys a car that lands on the shoulder, rolls down it
and is put back by the respawn, which photographs three events and none of
them the one under test. The column that reads the whole sheet is how far
away the car is: a rod that turns instead of stretching holds it near the
standoff the car was driven at, and a shot that stays up at the lip reads as
the car shrinking down the row.

## The workflow

1. **State the feeling** being tuned in one sentence ("the exit of a hairpin
   should feel like a slingshot"), and find the reference moment for it.
2. **Change the smallest set of levers** that plausibly produce it. Numbers in
   defs/rules, not new mechanics, unless the mechanic is the gap.
3. **`make sim` before and after** any engine or rules lever — the feeling is
   never allowed to cost the bots the stage (finishes, drifts, respawns are
   the regression surface).
4. **MEASURE the camera before looking at it.** `camera.ts` only ever
   reads `GameState`, so a rig is metered headlessly: `tests/camera_test.ts`
   scripts a drive (`weave`, `straight`), `jolt` takes the RMS SECOND
   difference of a series (a pan of any speed has almost none; a shot that
   rocks is nothing else — travel is the wrong column), `spread` its wander,
   `blowRun` what a kick does from a settled datum, and
   `tests/camera_feel_test.ts` reads the lens's own axes for a bank. Assert
   the rule, then look.

   **Pick the column that can actually separate the two things being
   compared** — every chase rig AIMS at the car, so heave, pitch and the car's
   on-screen wander mostly read the terrain and put two rigs within a few
   percent of each other however different they feel. What tells a rocky boom
   from a steady one is the camera's LATERAL offset in the car's HEADING frame
   (how far the world sloshes sideways), whose driver is the yaw-follow lag
   times the standoff and not the swing spring. And report the TAIL (p99.9,
   max) beside the RMS: a rare violent event and a continuous buzz are
   different problems with different fixes.

   **A lens's CANT is the roll about its own view axis, never the angle
   between its up and the world's** — `lookAt` builds its basis against world
   up, so that second reading is mostly the rig's own pitch (`chase` reads
   6.8° with zero roll in it) and a test written on it fails at any sane
   tolerance while saying nothing. Use `driveAcross`'s form:
   `Math.atan2(up.x * dir.z - up.z * dir.x, up.y)` with `dir =
   cam.getWorldDirection()`. It reads ~0 for a level rig at any pitch and past
   1 rad for a cockpit going over, which is what lets one assertion state the
   outside/in-car split.
5. **LOOK**: `make screenshots` (in web sessions
   `CHROMIUM_PATH=/opt/pw-browsers/chromium`), plus a staged run for the
   specific moment (`test-scenario` / `playtest` own the tooling). Put the
   shot next to the reference and compare proportions, not vibes: where do
   the wheels sit vertically? where is the horizon? how many degrees of drift
   show in the framing? **Every camera framing change gets its own PORTRAIT
   shot** (390×844): the fov is vertical, so landscape cannot show what a
   phone held upright does to the field or to the bodywork in it.
6. **Iterate camera/FX freely** — they are presentation and cost nothing to
   re-tune. Engine feel numbers move in small steps; each step re-simmed.

## Hard-earned constraints

- **The car stays FLAT in a slide.** Rolling the body into the drift angle is
  the single change that makes a rally car read as a skier carving instead of
  a car turning — the reference has none of it. Body attitude is pitch only
  (the road's gradient grounded, the ballistic arc airborne, both free from
  `vy/u`); the drift is displayed by the YAW against the camera's framing.
- **A shot that carries the lens between two poses interpolates ORIENTATION,
  never an aim point.** Walking a `lookAt` target from what the camera was
  looking at to what it is going to look at fails the moment the destination
  is BEHIND the lens — the line between the two passes through the eye, and
  `lookAt` on the point it is standing on tumbles: a whip to the back, a
  tumble at the crossing, a whip forward on the landing. Slerp the quaternion
  instead (`slerpQuaternions`), taking the far end off the pose the
  destination RIG has already written that frame, so the last flown frame and
  the first driven one are the same frame in AIM as well as position — a rig
  frames its car and does not point at it, so an aim-point shot always pops
  on the hand-over. Any deliberate look on top (a tilt down over an arc) is a
  LOCAL rotation applied after the slerp, which is stable at every pose.
  `camera-sweep.ts` and `camera-start.ts` are the two worked examples.
- **Anything that vibrates the lens is a few incommensurate oscillators
  UNDER 8 Hz on a decaying envelope** — the road grain (`GRAIN` in
  camera-eye.ts), a blow's rattle (camera-shake.ts), the speed tremor
  (camera-feel.ts) all share the shape. Never a fresh random offset per
  frame: white noise at a real blow's amplitude is a broken picture, and at
  30 fps it aliases into a slow lurch. Past 8 Hz a phone resolves its own
  sampling instead of the wave, and jolt goes as f², so lowering the
  frequency is the cheapest cut there is.
- **A hit belongs to the CAR.** The engine drops the body onto its springs
  at every contact and car-mesh.ts draws it; an outside rig takes NONE of a
  `contact` (only landings, water and a reset shudder the boom), and the
  in-car rigs take all of it as the head being thrown. Moving a boom with a
  hit doubles the motion and hides the car taking it.
- The renderer never mutates `GameState`; feel state that must persist
  (dirt level, camera smoothing) lives in renderer-side closures and resets
  with the next stage's meshes.
- Readouts the FX need from the driver (steer, braking) are CarState fields
  written by the engine step — the renderer never re-derives intent from
  physics deltas.
- The screen is a MIRROR of the engine's map view (see the `engine-system`
  lesson): camera and FX code work in world coords and stay sign-consistent;
  never flip a sign in the camera to fix a perceived left/right issue.
- Speed thresholds quoted in feel terms convert as 70 km/h ≈ 19.5 m/s; the
  engine is all meters and seconds.
