---
name: debug-tools
description: "Use when a problem arrives as a SCREENSHOT or a PLACE rather than a repro — 'this corner looks wrong', 'the trees do this over here', a picture with the debug boxes in it. Owns the in-game developer tools: god mode's free camera, the debug overlay and its REPRO line, the debug log, and `make debug-shot` — the loop that turns one person's picture into a frame you can stand in front of, change the code under, and photograph again."
---

# The in-game debug tools

A bug report that is a picture is a bug report nobody else can reproduce —
unless the picture says where it was taken. These tools make it say so.

The whole feature is one contract:

> **Every debug screenshot carries a REPRO line, and that line puts anyone
> else in the same frame.**

Everything below is either how the line gets into a picture, or what to do
with one you have been handed.

Not this skill: reproducing a bug **headlessly** from a seed and an input
script — that is **`debug-game`**, and it is still the better route whenever
the bug can be stated as "the car does X". Load this one when the bug is
stated as "it looks like that, over there".

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs debug-tools --list`, then the ones this task
touches. Load **`skill-reflection`** at both ends of the session.

## The five tools

They live behind the developer menu, which is behind a secret: seven taps on
the car's chassis in the menu (`DEV_TAPS`, `pwa/src/game/settings.ts`). Once
out it stays out. The two toggles are also on the **pause card** mid-run,
which is where they are actually wanted — the moment you want to fly to
something is the moment you are looking at it.

| Tool                 | What it is                                                                                                                                                                                                                                                                                                                                                                                                                             | Where                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **God mode**         | The camera comes off the car and flies, FPS-style, and the RUN IS HELD under it — the clock, the field and the weather all stop until the camera lands. The car is handed neutral input and sits where it was left.                                                                                                                                                                                                                    | `pwa/src/game/camera-free.ts`, mode `"free"` in `camera.ts`; the hold is in `App.tsx`'s frame loop   |
| **Debug overlay**    | The boxes naming the stage, the place, the camera and the car — and the REPRO line along the bottom.                                                                                                                                                                                                                                                                                                                                   | `pwa/src/game/debug-hud.tsx` over `debug-info.ts`                                                    |
| **Debug log**        | A ring buffer of every engine event, every engine log line, and a position trace once a second. Copied whole or per-run from DEVELOPER → DEBUG LOG.                                                                                                                                                                                                                                                                                    | `pwa/src/game/debug-log.ts`, page in `menu-dev.tsx`                                                  |
| **The benchmark**    | A fixed piece of racing — the first stage, fifteen cars off one green, a bot at every wheel — drawn as fast as the machine will draw it, timed with a stopwatch. The answer is SECONDS, and lower is better: a frame rate is a number about one moment, and two of them from two machines are never about the same moment. Pins everything about the race and nothing about the picture, so what it compares is settings and machines. | `pwa/src/game/benchmark.ts`, card in `menu-dev.tsx`                                                  |
| **The map's layers** | The stage's own layers painted over the MAP VIEWER's map — bedrock, groundwater, soil, foliage, roads — filling the screen, with COPY DEBUG INFO for what the generator built as text and a shutter that paints the same box into a picture. Reaches the campaign's own stages through SELECT LEVEL. Behind DEVELOPER → MAP VIEWER and nowhere else: Roam is a page for choosing a road to drive, and it has none of this.             | `pwa/src/game/map-layers.ts` + `map-debug.ts`, the page in `menu-map-viewer.tsx` over `map-pane.tsx` |

**ALT held hides the HUD and leaves the overlay up.** That is the shot to
ask for when the game's own chrome is in the way of the thing being reported.

### Flying

Fixed keys, not rebindable — a scripted pass has to know them without
reading anyone's storage (`FLY_KEYS` in `pwa/src/game/input.ts`):

```
W A S D   forward / strafe          SPACE or E   up
          (forward follows the      CTRL or Q    down
           look, strafe stays        SHIFT       ×4 sprint
           level)                    - and =     cruise speed down / up
arrows    look                       mouse       look, after a click (pointer lock)
```

Q and E shadow SPACE and CTRL because **Ctrl+W closes the browser tab** and
no page can swallow it. Descending while flying forward wants Q.

The other two surfaces fly the same rig, because the device the bug was
found on is rarely the one with a keyboard on it:

```
pad     the steering stick moves, the other stick looks, the triggers are
        up / down, handbrake = sprint, the shift shoulders = cruise speed
        (`readFlyPad` in gamepad.ts — derived from the DRIVING bindings, so
        there is nothing to bind first)
touch   the driving zones are replaced by fly zones (`hud-fly.tsx`): a push
        stick under the steering thumb, drag-to-look under the other, and
        buttons for up, down and the cruise speed
```

Entering god mode is a hand-over: the flight starts from the frame that was
already on screen, so nothing teleports. A run that STARTS in god mode
(`?god=1`) skips the countdown — nobody is on the grid to wait for one. The
gantry itself is off the HUD for as long as the camera is flying, for the
same reason the way-home arrow is: it is an aid for somebody driving, and a
held run would hold its lights lit over the middle of every frame flown out
to be photographed.

**And the run is HELD while you fly.** Flying is for LOOKING at a moment,
and a moment that drives on while it is being looked at is one nobody can
fly back to: so the simulation stops the instant the camera comes off the
car and picks up from the same instant when it lands. Nothing on the ground
moves — the run's clock, the field, the weather, the dust already in the air
— and only the camera has a clock of its own (`chase.flyOnly`, called
because the frame under it is rendered with dt 0). The debug overlay keeps
refreshing regardless: its REPRO line is the whole reason to be up here, and
a line held still with the run would name a place the camera has since left.

**`?bot=1` is the one flight that does not hold the run**, and that is what
the flag is for: somebody else is at the wheel, and the camera was sent up
to watch them get somewhere. The CAR box in the overlay says which it is —
`CAR (HELD)` or `CAR (DRIVEN)` — so a screenshot from up here says whether
the world under it was moving.

There is no on-screen key legend: these keys and `FLY_KEYS` are the only
places they are written down.

### Timing the machine, and how it differs from `make profile`

**DEVELOPER → BENCHMARK** races fifteen cars off one green on the campaign's
first stage and reports how long this machine took to draw a fixed number of
frames of it. Every frame advances the game by exactly a sixtieth of a
second whatever it cost to draw, so the race is the same race every run and
on every machine; the render loop never waits for anything (no
`requestAnimationFrame`, no limiter), and each frame ends by reading a pixel
back so the GPU has actually finished before the clock is read. The
countdown is the warm-up and is not timed.

The two measurements answer different questions and neither replaces the
other:

- **`make profile`** counts what a frame ASKS FOR — draw calls, triangles,
  program and texture binds. What a frame asks for does not depend on the
  GPU, which is what makes this the table a PR quotes. Its fps column is
  software rasterization and means nothing.
  **But the table is not repeatable to better than about ten per cent on a
  slow machine.** Each scene settles at a fixed STAGE TIME and is then
  metered over a fixed six-second WALL-CLOCK window (`WINDOW` in
  `scripts/profile-render.mjs`), so where the container draws five frames in
  it and the next run draws fifteen, the car has covered a different distance
  and a different set of chunks, props and trees was in frustum. Judge a
  rendering change STRUCTURALLY first — does it add a pass, a material, a
  mesh, or only change an instance COUNT? — and quote the table only when the
  movement is far outside that spread, or when the frames-metered counts
  match. An instanced batch drawn with fewer instances cannot move `draws` at
  all, whatever the table says.
  It also PINS the rear-view mirror (`?mirrorhz=60`), because the mirror is
  redrawn at whatever the machine can afford (`pwa/src/game/mirror-pace.ts`)
  and this machine can afford nothing — unpinned, the table reports a
  governor sitting on its floor rather than a renderer. Anything else that
  learns to draw less from the frame rate has to be pinned here too, or the
  meter is measuring its own slowness.
- **The benchmark** is the other half: what a REAL machine, with a real GPU
  and the player's own video settings, actually takes to draw them. It pins
  the mirror for the same reason and a second one: every frame there is fed
  a fixed sixtieth of a second whatever it cost, so an adaptive knob left
  loose would be reading a rate nobody achieved. It is
  therefore worthless headless — this container manages about one frame a
  second — and it is the number to ask a person on the hardware in question
  for.

Run it twice, changing one thing between: a video setting, a branch. What it
compares honestly is two runs on one machine.

### X-raying the ground

God mode answers "what does it look like from over there". The map's layers
answer the other question — **what is the ground MADE of here** — which is
the one a generator defect is usually about, and the one nothing on the road
can show you: a bog in the wrong place looks like a bog, a wood that stops
dead looks like a clearing, and a water table running uphill looks like
nothing at all until a lake turns up somewhere impossible.

**DEVELOPER → MAP VIEWER** is where they are, and the only place: its map
fills the screen and carries a strip along its foot — **OFF · BEDROCK ·
GROUNDWATER · SOIL · FOLIAGE · ROADS · SCREENSHOT**. The layers are in the order the country was made (R32), which is also the
order a defect is chased in — the rock decides where the water goes, the
water decides where the soil stays, the soil decides where the forest grows,
and the road is cut through whatever that left. Each is sampled off the SAME
field the generator plants and paves from, painted as a translucent tint so
the road, the trees and the relief still read through it, with a legend
saying what each band is worth.

Two things make it a debug tool rather than a picture:

- **Zoom leans all the way to the ground, and the map pans.** Wheel or pinch
  leans in until the lens is a metre off the ground — a metre and a half of
  road across the pane, which is the scale a chipping, a tuft or a marker
  post is actually judged at; **⌘/CTRL-drag** (or two fingers, or the middle
  button) walks the aim to the part of the stage in question. A map that
  could only zoom into its own centre would be useless — the defect is never
  in the middle. Stepping the seed, or opening another level in the viewer,
  frames the whole of the new stage again: the pan and zoom belonged to the
  country the last one was made of.
- **COPY DEBUG INFO puts the whole caption on the clipboard**: seed, dials,
  what the stage was assembled from (turns, straights, jumps, crests, fords,
  bridges), its spread, its spurs and splits, what the painted layer measured
  over the whole island, where the lens is standing, and the REPRO link —
  as text, ready to paste into a report or a prompt. Nothing of it is drawn
  over the map, because the map is what the page is for. The framing holds
  still the whole time the viewer is up, so two screenshots either side of a
  change are the same picture.

`make screenshots shot-map` captures the whole sheet — the bare map, one
frame per layer, one leaned in and panned onto the road, and one after dark.

### The stages a player actually drives

Roam builds a stage from whatever the dials happen to say, which is right for
choosing a seed and wrong for finding a defect in a SHIPPED map. **SELECT
LEVEL → a country → a stage** loads a campaign level's exact spec — its seed,
its band, its shape, the campaign's own dials, the hour and weather it is set
in — onto the map. It is the campaign's own country rows and the campaign's
own stage boxes with the padlocks off (`StagePicker`, in `menu-levels.tsx`),
so the road is picked by the same picture it is picked by on the ladder.

Two doors onto the same list, and the difference is what you may then do:

- **DEVELOPER → MAP VIEWER** is the workbench: the map, the layers, the copy
  button and the shutter, and nothing to set. Look only.
- **On ROAM**, the button is SELECT A LEVEL across the settings column, and
  the stage that lands is a stage you can change and DRIVE — but there are
  no layers there and no full-screen map, because none of that helps anybody
  choose a road. The button goes on naming the level until a dial or the seed
  moves the road off it (`levelForRoad`).

Two components (`menu-map-viewer.tsx`, `menu-roam.tsx`) over ONE page state
(`{ page: "roam", viewing? }`), because the backdrop is the same in both: the
window onto the canvas, the map camera and the stage standing under it are
`map-pane.tsx` and shared. There is no second map, no second camera and no
second stage pipeline to keep in step.

### Asking for a picture instead of a repro

**SCREENSHOT**, on the viewer's strip, is the button to point a
reporter at. It saves the whole screen with the boxes, the layer legend and
the REPRO line **painted into the pixels** — a caption is worth having on a
picture precisely because a picture cannot be pasted, and the boxes are
nowhere on the page to be lifted from anyway. The file lands in the roll,
which is the main menu's GALLERY, where it can be saved or shared.

**COPY DEBUG INFO** is the same facts for somebody who wants to READ them:
one press, and the boxes and the link are on the clipboard as text. Ask for
the picture when the problem is something you have to see, and the text when
it is a number.

**The same pair exists on the ROAD**, and it is the one to ask a player for:

- **The shutter (ENTER, or the HUD's button) while the DEBUG OVERLAY is up**
  paints the overlay into the picture — PLACE, CAMERA, STAGE, CAR and the
  REPRO line, in the pixels. The boxes are DOM over the canvas and are
  therefore in nothing the drawing buffer holds, so without this a
  screenshot taken IN the game says less than one taken with the operating
  system's own key. Every picture also lands on the CLIPBOARD as it is
  taken (the `copyShots` switch in settings.ts, on by default), so what a
  reporter has to do is press one key and paste.
- **COPY DEBUG INFO, in the bottom corner, while god mode flies with the
  overlay OFF.** Flying to LOOK at something is the case where four panels
  of numbers are four panels over the subject — so the numbers get a button
  instead, and it writes exactly what the map's does.

That is the whole loop this skill exists for, in its shortest form: a person
who can see the problem presses one button, and what reaches you is a frame
that already says which seed it is, what is painted on it, where the lens was
standing, and the link that puts you there.

## Reading a screenshot you were handed

The overlay's boxes, and what each is for:

- **PLACE** — where the LENS is. `xyz`, height above ground, water, and the
  two numbers that actually name a spot on a stage: `stage-s` (metres along
  the route) and `off-road` (metres from the centreline, plus the sample
  index). "1240 m along, 18 m off it" finds a place; a world coordinate only
  confirms one you already found.
- **CAMERA** — which view, and the yaw/pitch in both degrees and radians.
  The radians are what the URL takes. **The title reads `CAMERA · GOD MODE`
  when the shot was taken off the car** — there is no separate god-mode
  panel, and a picture from a flying camera reads differently from one taken
  from behind a moving one, so check the title before drawing conclusions
  about what the car was doing.
- **STAGE** — seed, shape, length, laps, the five generator dials, road
  length and width, conditions, car, and the **build stamp**. Check the
  build first when the screenshot and your tree disagree about behaviour.
- **CAR** — full while racing, two lines while flying. Slip angle, yaw rate,
  attitude, surface, damage, phase. This is the box a handling or collision
  argument is made from. Flying, its TITLE says whether the run underneath
  was standing still: `CAR (HELD)` is the ordinary case, `CAR (DRIVEN)` a
  flight over a run the bot is driving (`?bot=1`).
- **REPRO** — the line. Everything above, as a query string.

God mode and a run print **different boxes**, because they are different
questions: flying, PLACE leads and the car is scenery; racing, CAR leads.

## The loop

1. **Reproduce the frame.** Paste the REPRO line:

   ```sh
   make debug-shot REPRO='?seed=42&…&god=1&gx=-30.00&gy=25.00&…' OUT=before
   # or directly, which is what the Make target runs:
   CHROMIUM_PATH=/opt/pw-browsers/chromium \
     node scripts/debug-shot.mjs '?seed=…' --out before
   ```

   It serves `pwa/dist`, opens that exact frame, screenshots it to
   `previews/<out>.png`, **and prints the overlay's rows as text** — read off
   the DOM (`data-k` on every row), not off the picture. Compare those
   numbers against the ones in the screenshot you were given: if `stage-s`
   and the camera pose match, you are standing in the same place, and any
   difference in the pixels is the bug.

   `make build` first — the script serves the built app, not the dev server.

   **A MAP repro works the same way.** The developer map's COPY DEBUG INFO
   button writes the same kind of line, carrying `roam=1` and the map
   camera's framing instead of god mode's pose, and the script tells the two
   apart by that flag: the driving page is waited on by its overlay, the map
   page by its copy button, whose text it then reads back off the clipboard.
   So a defect reported from above reproduces from above.

   ```sh
   make debug-shot REPRO='?seed=38&roam=1&mapfull=1&maz=…' OUT=map-before
   make debug-shot REPRO='?seed=38&roam=1&…' ARGS=--drive OUT=road-before
   ```

   `--drive` is the second half of that: it drops the map flags and the map
   camera off the line and opens the same seed, dials, conditions and car
   **driving**. The first question about anything seen from above is what it
   looks like from the road, and this is how you get there without hand-
   editing a query string.

2. **Confirm you are looking at the same thing.** Two shots of one place is
   the point; two shots of two places proves nothing. If they differ, the
   likely causes in order: a stale `pwa/dist`, a different **build stamp**
   (their app is older than your tree), or a dial the report's line did not
   carry.

3. **Diagnose.** From here it is an ordinary bug. Classify by layer as
   **`debug-game`** says — engine, renderer, input, generator — and prefer a
   headless repro and a failing test for anything the engine owns. `stage-s`
   and the sample index tell `make track` and a `simulateStage` event log
   exactly where to look.

4. **Fix, then photograph the same frame again**:

   ```sh
   make build && make debug-shot REPRO='…same line…' OUT=after
   ```

   `previews/before.png` and `previews/after.png` are then two pictures of
   one place. Put both in the PR.

## Asking for a better report

When a picture arrives without the boxes, ask for it again with **DEBUG
OVERLAY** on — and, if the HUD is over the subject, **with ALT held**. If
what went wrong happened _before_ the frame, ask for **DEVELOPER → DEBUG LOG
→ COPY LATEST RUN** as well: that is the second-by-second trace, every
engine event with its numbers, and the run's own stage line at the top.

## The URL is the whole interface

Everything the overlay prints, the app reads back (`App.tsx`):

| Param                                      | Does                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `debug=1`, `god=1`                         | Force the tools on — and let the developer menu out with them         |
| `gx= gy= gz= gyaw= gpitch=`                | Park the free camera exactly (metres, radians)                        |
| `seed= length= shape= laps=`               | Which stage                                                           |
| `elevation= water= trees= asphalt= width=` | The generator's dials                                                 |
| `tod= weather= car=`                       | Conditions and machine                                                |
| `start=1`, `bot=1`                         | Skip the menu; let the bot drive there                                |
| `at= s= time= speed= reason=`              | Stand the run AT a moment: `racing`, `finish` or `retire`             |
| `level= mode=`                             | Enter it on a campaign stage, in a discipline                         |
| `paused=1`                                 | The pause card up over the first frame                                |
| `roam=1`                                   | Open the map page instead of the front door                           |
| `layer=`, `mapfull=1`                      | ...as the MAP VIEWER, with a layer painted (what a map REPRO carries) |
| `maz= mpitch= mzoom= mpanx= mpanz=`        | Park the map's framing exactly (radians, ×, metres of pan)            |
| `hud=0`                                    | A CLEAN FRAME: instruments and rear-view glass both off               |
| `drawdistance=near\|normal\|far`           | How far the air lets the camera see (OPTIONS ▸ VIDEO's own)           |
| `freefov=`                                 | A different lens on god mode's camera, deg of VERTICAL fov            |
| `air=`                                     | How far the world is BUILT and drawn for this frame, m                |

These four are for photographing the WORLD rather than the run.

**`air=` is the one to reach for from any height.** The game only builds
ground within 560 m of the car and only draws it to the fog's ceiling, and
`drawdistance=far` opens the fog PAST that — so a shot from above shows the
country simply stopping, with the camera-locked ridge backdrop standing where
the land should be. It reads as a generator bug and is not one. `air=` moves
the three numbers that matter together (the built ground, the camera's far
plane, and a fog set to close exactly at the drawn edge), which a still can
afford and a run cannot. Give the world time to build it — the tiles arrive
over many frames, and 2.6 km is a few hundred of them.

**`freefov=` is what makes a WIDE frame a panorama.** three's fov is
vertical, so a wide viewport opens the horizontal field instead of showing
more of the same lens: on the design 58° a 4:1 frame is 131° across and 8:1
is 155°, where the ground domes and anything near the edge shears. Hold the
horizontal field where you want it and solve the vertical fov for the aspect.

`hud=0` still leaves the pause chip on screen (a phone's only way out of a
run); a tool that needs it gone hides `.debug-copy, .hud-actions, .hud-mini`
with an injected stylesheet, as `scripts/biome-preview.mjs` does.

`bot=1` is the companion to `god=1`: when the problem is something the CAR
does at a place rather than something the WORLD looks like there, let the bot
drive to it and read `stage-s` off the overlay to know when it has arrived.
It is also the one thing that lifts god mode's hold on the run — without it
the world under the camera stands still, which is what a flight to LOOK at
something wants and what a flight to FOLLOW something cannot use.

`at=` is the companion to BOTH when the problem is a SURFACE that only exists
at a moment of the run — the results card, the retirement card, the
spectator's feed, the pause card — or a place a long way down the stage
(`pwa/src/game/place-url.ts` reads it, `engine/game/place.ts` does the
standing). `at=racing&s=1200` stands the car on the road 1200 m in, at pace,
with the clock and the split boards reading as though it had driven there;
`at=finish` stands it a step short of the line so the loop's first step fires
the finish the way every finish fires; `at=retire` stands it at rest with a
dead engine (`reason=wheels` for the other way out). `level=taiga-1` enters
the run on that campaign stage with the whole field placed at the same moment
— which is what puts the sheet, the points and SPECTATE on the card — and
`mode=headsup|timetrial` picks the discipline. The placed clock is written
from a middling pace unless `time=` says otherwise, and a placed finish is
BOOKED like any other: the campaign record and the time trial's board in that
browser's storage take it, so use a scratch profile or the harness's own
fresh context rather than a save you care about.

## When you change these tools

- **The contract is the round trip.** Anything added to the REPRO line must
  be read back in `App.tsx`, or a screenshot silently stops reproducing. Add
  the writer and the reader in the same change, then prove it: capture with
  `make debug-shot`, and check the REPRO line it prints back matches the one
  you fed it.
- The overlay's rows are **wrapped, never truncated**. A clipped row carries
  no number, which is the one thing this overlay may not do.
- `make screenshots shot-debug` captures the four scenes that hold the
  tools honest: the overlay over a run, the same frame with the HUD hidden,
  god mode parked off the road, and the same flight with the boxes off —
  which is the one that catches COPY DEBUG INFO going missing, since with
  the overlay down that button is the only way off this screen. `shot-map`
  does the same for the map's layers — every one of them on a pinned seed at a pinned framing, so the
  sheet is comparable across two builds.
- **The map's layers must stay translucent.** An opaque sheet is a map at
  framing distance and a flat colour a hundred metres up, with the road, the
  trees and the relief hidden underneath it — which is a picture of nothing.
  Anything drawn over them as an ANNOTATION (the route ribbon) has to be in
  the transparent queue too, or three.js draws it first and the layer tints
  over the very line it is read against.
- **Every control on the map lives INSIDE the map pane, and the pane captures
  the pointer.** `setPointerCapture` is what lets a drag survive leaving the
  pane, and a capture taken on a press that started inside a child redirects
  that press's pointerup to the pane — so the child never completes a click
  and the button is dead without ever looking it. Anything interactive added
  in there needs `data-map-ui` on it or an ancestor. A scene that drives the
  tools through the URL will not catch this: `shot-map-viewer` and
  `shot-map-campaign` press the buttons, which is why they exist.
- **Nothing the map shows may be hidden while its LIGHTS are not.** The car
  was hidden in the map view on the reasoning that it is a speck at framing
  distance; its headlights were thrown by the environment regardless, so
  after dark the map showed a pool of light travelling along an empty road.
  If something is worth taking out of the frame, take its contribution to the
  frame out with it.

## Skill self-improvement

Load **`skill-reflection`** before this session commits. Worth a fragment
here: a fact a screenshot turned out NOT to carry, a round trip that broke,
a class of problem the overlay could not place.

```sh
node scripts/skill-lessons.mjs debug-tools --list
```
