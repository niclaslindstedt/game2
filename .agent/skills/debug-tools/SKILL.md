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

## The three tools

They live behind the developer menu, which is behind a secret: seven taps on
the car's chassis in the menu (`DEV_TAPS`, `pwa/src/game/settings.ts`). Once
out it stays out. The two toggles are also on the **pause card** mid-run,
which is where they are actually wanted — the moment you want to fly to
something is the moment you are looking at it.

| Tool              | What it is                                                                                                                                          | Where                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **God mode**      | The camera comes off the car and flies, FPS-style. The car is handed neutral input and sits where it was left.                                      | `pwa/src/game/camera-free.ts`, mode `"free"` in `camera.ts` |
| **Debug overlay** | The boxes naming the stage, the place, the camera and the car — and the REPRO line along the bottom.                                                | `pwa/src/game/debug-hud.tsx` over `debug-info.ts`           |
| **Debug log**     | A ring buffer of every engine event, every engine log line, and a position trace once a second. Copied whole or per-run from DEVELOPER → DEBUG LOG. | `pwa/src/game/debug-log.ts`, page in `menu-dev.tsx`         |

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
  and god mode parked off the road.

## Skill self-improvement

Load **`skill-reflection`** before this session commits. Worth a fragment
here: a fact a screenshot turned out NOT to carry, a round trip that broke,
a class of problem the overlay could not place.

```sh
node scripts/skill-lessons.mjs debug-tools --list
```
