---
name: playtest
description: "Use to verify gameplay changes in the running game and to evaluate game feel and look. Drives the built app in headless Chromium with scripted inputs, screenshots the moments that matter (grid, speed, drift, hood cam, portrait), and closes the loop the sim numbers can't: does it LOOK and READ right at speed."
---

# Playtesting

Engine tests prove rules and `make sim` proves balance; playtesting proves the
game **works and reads right in the real renderer**. Every gameplay, rendering,
or input change ends with a look at the actual pixels before it ships. The
split: numbers say whether the game is _sound_; pictures say whether it _looks
and reads_ right.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs playtest --list`, then the ones this task
touches. Load **`skill-reflection`** at both ends of the session.

## Tooling

| Piece | Role |
| --- | --- |
| `scripts/screenshot.mjs` | The harness: serves the built app (`pwa/dist`), drives it headlessly with scripted keyboard input, captures scenes to `previews/` (gitignored) |
| `make screenshots` | Runs it. Needs `make build` first (it drives the BUILT app, not a dev server) and a Chromium |
| `npm run dev` | The headed loop — play your working copy in a browser for anything a still can't judge (feel, responsiveness, sound of the engine note) |
| `make track` | The stage itself, top-down — when the question is the geometry rather than the rendering |

### Environment

`playwright-core` is installed with `npm i --no-save playwright-core`; only
the browser binary is separate. In Claude web sessions Chromium is
preinstalled — run:

```sh
CHROMIUM_PATH=/opt/pw-browsers/chromium make screenshots
```

Never run `playwright install`; point `CHROMIUM_PATH` at an existing binary.

### The scenes

The default script captures the moments that matter: the **start grid**
(landscape + portrait), **full speed** down the opening straight, a **drift**
(a committed turn at speed, power held through the slide), the **first jump**
the stage offers (skipped when the run never reaches one), **portrait at
speed**, and the **hood cam**. `--scene <name>` runs one.

The portrait scenes now photograph the COVER, not the game: upright is
switched off (`pwa/src/game/orientation.ts`). The touch HUD's world is a
phone held SIDEWAYS — shoot it at 844×390.

**A new player-visible feature earns a scene in the same change.** The scenes
are scripted keyboard input against the countdown clock (hold throttle N ms,
flick, screenshot), so staging a moment of DRIVING means scripting the drive
into it — see the `test-scenario` skill for the staging mindset. A surface no
scene captures is a surface no future sweep will ever look at.

**A surface that only exists at a moment of the run is stood at, not driven
to.** The results card, the retirement card, the spectator's feed and the
pause card each have a scene that opens on `?at=finish` / `?at=retire` /
`?paused=1` (with `?level=` and `?mode=` for the campaign's own card, so the
sheet, the points and SPECTATE are on it) and waits for the card — seconds of
world-building instead of a stage driven under software rendering. The
menu-walking campaign scene stays for what it alone photographs: the
establishing shot and the split against a real field. The `debug-tools` skill
owns the parameter table.

**A new STEP in an existing flow owes an edit to every scene that walks it.**
Several scenes click through the menu the way a player does rather than
jumping in on `?start=1` — the campaign field's whole sweep is one of them —
so a page inserted between a press and a run does not fail loudly: the scene
sits on a `waitForSelector` until its timeout and the surface it was meant to
photograph never happens. `grep` the harness for the labels the flow prints
before assuming only the new page needs a scene.

**A HUD element REMOVED owes the same grep.** The harness has no view of
engine state — every wait it makes is a selector over the HUD's own DOM
(`.hud-timer`, `.hud-speed-num`, `.hud-pace-call`), so a chip deleted from
`hud.tsx` is a scene that hangs for its full timeout and fails with the
scene's name, never the selector's. `grep` `scripts/screenshot.mjs` for the
class before deleting it. When a scene needs something the HUD no longer
draws, put the engine's own verdict on the HUD ROOT as a data attribute
(`data-off` for off-road) rather than reaching for `?debug=1` — the overlay
would be in every frame the scene takes.

## Running

```sh
make build
CHROMIUM_PATH=/opt/pw-browsers/chromium make screenshots        # every scene
CHROMIUM_PATH=/opt/pw-browsers/chromium \
  node scripts/screenshot.mjs shot-touch-god                     # just these
```

**The Make target takes no scene filter** — it is `node scripts/screenshot.mjs`
and nothing else, so `make screenshots ARGS=…` quietly shoots the whole sweep,
which is minutes of a session. Iterating on ONE surface means calling the
script directly with a fragment of the scene's name.

**Look at the PNGs with the Read tool** — every judgement is made on a
screenshot, not on source. Watch the harness's `[pageerror]` lines too: a
clean screenshot over a page error is a lie.

### The sim runs at a fraction of wall time — and it decides how scenes are written

Under software rendering the run advances about **one second per eighteen of
wall clock** (measured: `t 13.64 s` on the debug overlay after four minutes).
Two consequences, and nearly every scene that goes wrong goes wrong on one of
them:

- **Wait on the RUN's clock, never the wall's.** This is already the rule for
  the shutter, and it applies just as hard to scripted INPUT: a key sequence
  written with `waitForTimeout(700)` holds the handbrake for about forty
  milliseconds of sim, which is a tap. The same sequence written against the
  race clock is a real pull on the lever, and behaves completely differently.
- **Never DRIVE to a moment you can stand at.** `?at=racing&s=` (engine's
  `place.ts`) puts the run where the shot wants it. Driving there instead is
  minutes per attempt — which is what turns a wrong guess into a ten-minute
  wrong guess, several times over.

### MEASURE the moment before writing a predicate for it

A scene that waits for a condition the stage never produces times out at the
full patience and tells you nothing about why. Before tuning a threshold —
and certainly before tuning it twice — write a throwaway probe: same URL, a
cheap camera (the car does not care which camera is watching), and a loop that
prints what the debug overlay's `data-k` rows actually say. It costs a couple
of minutes against ten for a blind attempt, and it answers questions guessing
cannot:

- the bot's slip peaked at **7°** on one taiga stretch and **9.8°** on a
  desert one — both UNDER `TUNING.drift.enterSlip`, so no drift threshold was
  ever going to fire there;
- a hand-staged slide reached 45° but was OFF THE ROAD for all of it, which a
  grounded-and-on-road predicate rightly refuses;
- and the one setting that "worked" had caught the two frames before the car
  left the road, which is a coin toss wearing a number.

The general shape: when a predicate times out, the question is not "is the
threshold too high" but "does this moment exist on this stage at all".

### Two traps

- **The countdown eats the first seconds.** Scenes wait ~3.2 s before
  throttle; a scene that screenshots earlier is judging the grid hold, not
  the driving. When scripting a new scene, budget for it — or note that the
  sim uses `skipCountdown` and the real app does not.
- **A canvas is not proof of a running game.** The canvas paints from frame
  one; a black or static frame with plausible HUD chrome can still mean the
  loop died. Check for the HUD's live numbers (speed climbing in a speed
  scene) and the `[pageerror]` log before trusting a frame.

## Evaluating

Judge each screenshot against the game's own bar:

- **The drift reads.** In the drift scene the car should be visibly sideways
  with the camera showing the angle (the chase cam blends nose and travel
  direction for exactly this) and dust off the rear. A drift that looks like
  cornering is a feel regression no number catches.
- **Speed reads.** Ground texture, trees passing, the speedometer climbing —
  full speed should look fast at both viewports.
- **The HUD is legible over the world** — white-on-bright-sky and
  white-on-gravel both occur; the HUD ink/shadow pairing exists for this.
- **Portrait is a real game, not a cropped landscape.** Touch controls
  reachable, HUD scaled, road visible far enough ahead to drive.
- **Nothing regressed in the scenery** — road ribbon continuous through
  turns and crests, fords drawn where the samples say water, no z-fighting,
  shadows under the car.

For feel questions (steering response, drift control, gear timing), run
headed: `npm run dev` and drive. A screenshot cannot judge an input curve.

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. A settled
visual rule of thumb ("dust must be visible in every drift shot", "the HUD
fails over the horizon at dusk palettes") is exactly the kind of thing worth
recording — read the past ones before you evaluate, not after.
