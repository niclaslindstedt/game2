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

| Tool                 | What it is                                                                                                                                                                                                                                                                                                                                                                                                                             | Where                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **God mode**         | The camera comes off the car and flies, FPS-style. The car is handed neutral input and sits where it was left.                                                                                                                                                                                                                                                                                                                         | `pwa/src/game/camera-free.ts`, mode `"free"` in `camera.ts`                                              |
| **Debug overlay**    | The boxes naming the stage, the place, the camera and the car — and the REPRO line along the bottom.                                                                                                                                                                                                                                                                                                                                   | `pwa/src/game/debug-hud.tsx` over `debug-info.ts`                                                        |
| **Debug log**        | A ring buffer of every engine event, every engine log line, and a position trace once a second. Copied whole or per-run from DEVELOPER → DEBUG LOG.                                                                                                                                                                                                                                                                                    | `pwa/src/game/debug-log.ts`, page in `menu-dev.tsx`                                                      |
| **The benchmark**    | A fixed piece of racing — the first stage, fifteen cars off one green, a bot at every wheel — drawn as fast as the machine will draw it, timed with a stopwatch. The answer is SECONDS, and lower is better: a frame rate is a number about one moment, and two of them from two machines are never about the same moment. Pins everything about the race and nothing about the picture, so what it compares is settings and machines. | `pwa/src/game/benchmark.ts`, card in `menu-dev.tsx`                                                      |
| **The map's layers** | The stage's own layers painted over the Roam map — bedrock, groundwater, soil, foliage, roads — the pane blown up to the whole screen, COPY DEBUG INFO for what the generator built as text, and a shutter that paints the same box into a picture. Reaches the campaign's own stages through DEVELOPER → MAP VIEWER.                                                                                                                  | `pwa/src/game/map-layers.ts` + `map-debug.ts`, controls in `menu-roam.tsx`, the viewer in `menu-dev.tsx` |

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

Entering god mode is a hand-over: the flight starts from the frame that was
already on screen, so nothing teleports. A run that STARTS in god mode
(`?god=1`) skips the countdown — nobody is on the grid, and the start lights
would otherwise hang over the middle of every frame flown out to be
photographed.

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
  program and texture binds. Those are the same numbers on every machine, so
  it is the one that is trustworthy in headless Chromium and the one a PR
  quotes. Its fps column is software rasterization and means nothing.
- **The benchmark** is the other half: what a REAL machine, with a real GPU
  and the player's own video settings, actually takes to draw them. It is
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

With the developer menu out, the Roam page's map grows a strip along its
foot: **OFF · BEDROCK · GROUNDWATER · SOIL · FOLIAGE · ROADS · FULL SCREEN**.
The layers are in the order the country was made (R32), which is also the
order a defect is chased in — the rock decides where the water goes, the
water decides where the soil stays, the soil decides where the forest grows,
and the road is cut through whatever that left. Each is sampled off the SAME
field the generator plants and paves from, painted as a translucent tint so
the road, the trees and the relief still read through it, with a legend
saying what each band is worth.

Two things make it a debug tool rather than a picture:

- **Zoom has no floor and the map pans.** Wheel or pinch leans in until the
  lens is a few metres off the ground; **⌘/CTRL-drag** (or two fingers, or
  the middle button) walks the aim to the part of the stage in question. A
  map that could only zoom into its own centre would be useless — the defect
  is never in the middle.
- **COPY DEBUG INFO puts the whole caption on the clipboard**: seed, dials,
  what the stage was assembled from (turns, straights, jumps, crests, fords,
  bridges), its spread, its spurs and splits, what the painted layer measured
  over the whole island, where the lens is standing, and the REPRO link —
  as text, ready to paste into a report or a prompt. Nothing of it is drawn
  over the map, because the map is what the page is for. The framing stops
  turning the moment the map is being read (full screen, or a layer painted
  on), so two screenshots either side of a change are the same picture.

`make screenshots shot-map` captures the whole sheet — the bare map, one
frame per layer, one leaned in and panned onto the road, and one after dark.

### The stages a player actually drives

Roam builds a stage from whatever the dials happen to say, which is right for
choosing a seed and wrong for finding a defect in a SHIPPED map. **DEVELOPER →
MAP VIEWER → a country → a stage** loads a campaign level's exact spec — its
seed, its band, its shape, the campaign's own dials, the hour and weather it
is set in — onto that same full-screen map. Every tool above comes with it,
and the picture that comes out is of a road somebody is going to drive.

### Asking for a picture instead of a repro

**SCREENSHOT**, on the full-screen map's strip, is the button to point a
reporter at. It saves the whole screen with the boxes, the layer legend and
the REPRO line **painted into the pixels** — a caption is worth having on a
picture precisely because a picture cannot be pasted, and the boxes are
nowhere on the page to be lifted from anyway. The file lands in the roll,
which is the main menu's GALLERY, where it can be saved or shared.

**COPY DEBUG INFO** is the same facts for somebody who wants to READ them:
one press, and the boxes and the link are on the clipboard as text. Ask for
the picture when the problem is something you have to see, and the text when
it is a number.

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
- **CAR** — full while racing, one line while flying. Slip angle, yaw rate,
  attitude, surface, damage, phase. This is the box a handling or collision
  argument is made from.
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

| Param                                      | Does                                                          |
| ------------------------------------------ | ------------------------------------------------------------- |
| `debug=1`, `god=1`                         | Force the tools on — and let the developer menu out with them |
| `gx= gy= gz= gyaw= gpitch=`                | Park the free camera exactly (metres, radians)                |
| `seed= length= shape= laps=`               | Which stage                                                   |
| `elevation= water= trees= asphalt= width=` | The generator's dials                                         |
| `tod= weather= car=`                       | Conditions and machine                                        |
| `start=1`, `bot=1`                         | Skip the menu; let the bot drive there                        |
| `roam=1`, `layer=`, `mapfull=1`            | Open the map instead, with a layer painted, full screen       |
| `maz= mpitch= mzoom= mpanx= mpanz=`        | Park the map's framing exactly (radians, ×, metres of pan)    |

`bot=1` is the companion to `god=1`: when the problem is something the CAR
does at a place rather than something the WORLD looks like there, let the bot
drive to it and read `stage-s` off the overlay to know when it has arrived.

## When you change these tools

- **The contract is the round trip.** Anything added to the REPRO line must
  be read back in `App.tsx`, or a screenshot silently stops reproducing. Add
  the writer and the reader in the same change, then prove it: capture with
  `make debug-shot`, and check the REPRO line it prints back matches the one
  you fed it.
- The overlay's rows are **wrapped, never truncated**. A clipped row carries
  no number, which is the one thing this overlay may not do.
- `make screenshots shot-debug` captures the three scenes that hold the
  tools honest: the overlay over a run, the same frame with the HUD hidden,
  and god mode parked off the road. `shot-map` does the same for the map's
  layers — every one of them on a pinned seed at a pinned framing, so the
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
