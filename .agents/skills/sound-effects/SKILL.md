---
name: sound-effects
description: "Use when adding or tuning a SOUND EFFECT — an impact, a landing, a shift, a splash, a menu click, or one of the continuous beds (the engine, the tyres, the wind, the drift's scrub). Every sound is synthesized from authored parameters; the game ships no audio files. Covers the PSX-era voice vocabulary, the event → sound route, the difference between a one-shot and a BED, the mixing budget, and the audition page that is the only honest way to judge any of it. NOT for music: a score is a different craft with a different review loop — load `soundtrack` for that."
---

# Designing sound effects

The game ships **no audio files**. Every sound is synthesized at runtime from a
handful of numbers, authored as TypeScript data in `pwa/src/game/audio/`, which
keeps the app tiny and offline and makes the sound design as diffable as the
car specs.

**The target register is PlayStation-era rally, not 16-bit console**, and the
difference is not loudness — it is that a PSX game played SAMPLES through a
filter. Engines with grit in them, gravel that hisses rather than ticks,
impacts with a body behind the crack. Four things in the synth exist to reach
that register, and reaching for them is what stops a new sound sounding chip:

| Reach for                             | When                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color: "brown" \| "pink"` on a noise | ALWAYS decide this before the filter. Brown is mass and distance, pink is gravel/water/tyre roar, white is glass and grit.                                                                                                                                                                   |
| `filter.to` — a moving cutoff         | Any sound that is a GESTURE rather than a hit: a whoosh, a spray thinning out, a turbo spooling, a crash opening and closing.                                                                                                                                                                |
| `drive` — the waveshaper              | Anything with combustion or violence in it. A clean triangle is a flute; a driven one is an engine. It is a SOFT curve at every setting: 0.2–0.4 is warmth, 0.6 an overdriven amp, 1 as far as it goes — never a clip, because a clip aliases and a Bluetooth codec turns that into a swirl. |
| `attackMs` + `holdMs` on a NOISE      | Only for a SWELL — a crowd, a spin, distant thunder. Never for a hit. A bed is a LAYER (below) and has no envelope at all.                                                                                                                                                                   |

**MUSIC IS NOT HERE.** A score is tracker data with an arrangement, judged by
its structure and its mix over two minutes. Different format, different review
surface, different faults: load the **`soundtrack`** skill. The two crafts share
only `pwa/src/lib/synth.ts`, the instrument underneath both.

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs sound-effects --list`, then the ones this task
touches. Reflecting them back at the end is the **`skill-reflection`** skill's
job; load it at both ends of the session. Load **`write-code`** too.

## Files

| File                                 | Role                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa/src/lib/voice.ts`               | **The vocabulary.** Every parameter a sound may be written in, the `Synth` interface, and the `LayerSpec` / `LayerTarget` / `Layer` a bed is made of. DOM-free on purpose, so the banks, the router, the beds and the tests can describe a sound without importing a browser.          |
| `pwa/src/lib/synth.ts`               | The instrument: `tone()` and `noise()` for one-shots, `layer()` for the beds, the shared echo bus, the master limiter, and the whole audio-context lifecycle (unlock, autostart, iOS interruption, zombie-context recovery, the route re-seat). The only module that touches WebAudio. |
| `pwa/src/game/audio/bank.ts`         | **THE RUN'S SOUND DESIGN.** Every discrete sound the car and the stage make, as data: a description and a list of voices. This is where most SFX work happens.                                                                                                                         |
| `pwa/src/game/audio/bank-ui.ts`      | The interface's own sounds. Separate because the menu is on the app's STARTUP path and must not pull the run's bank into the entry chunk.                                                                                                                                              |
| `pwa/src/game/audio/route.ts`        | **WHICH sound an event makes**, and how big — a pure function from `GameEvent` to a bank id plus a `PlayShape`.                                                                                                                                                                        |
| `pwa/src/game/audio/play.ts`         | Firing one def: voices go to the synth verbatim, scaled by the shape.                                                                                                                                                                                                                  |
| `pwa/src/game/audio/bank-stage.ts`   | The STAGE's sounds — the lights, the split boards, the line, the crowd, the blocks, the sky. Served with the car's as `RUN_BANK`.                                                                                                                                                      |
| `pwa/src/game/audio/bank-world.ts`   | The COUNTRY's sounds — birds, insects, an owl, a coyote, livestock, a train's horn, a crossing bell, the marshal's whistle. Raised by `ambience.ts`, never by the router.                                                                                                              |
| `pwa/src/game/audio/listener.ts`     | **WHERE THE EAR IS.** One row per camera: what each seat does to the engine, the exhaust, the tyres, the wind, the weather, the world, the one-shots. The beds and the router both read it.                                                                                            |
| `pwa/src/game/audio/engine-voice.ts` | The engine, as six LAYERS: `engineTargets` is a pure function from revs, load, wear and a seat to where each should be. The one sound whose pitch is arithmetic rather than taste.                                                                                                     |
| `pwa/src/game/audio/road-voice.ts`   | The tyres, the wind, the weather, the gale and the DRIFT's scrub — fourteen layers, as a pure function of how the car is going.                                                                                                                                                        |
| `pwa/src/game/audio/ambience.ts`     | The WORLD: three layers (the canopy, the crowd, a train) and the roster of calls a country makes at an hour, raised on a loose clock and thinned by speed.                                                                                                                             |
| `pwa/src/game/audio/rack.ts`         | The plumbing every bed shares: build a layer, rebuild one whose context died under it, steer it on its glide.                                                                                                                                                                          |
| `pwa/src/game/audio/drive-bed.ts`    | The scheduler: reads `GameState` once a frame, turns it into every layer's target, and raises the cues nothing reports — the lights, the lift's crackle, the wipers, the whistle.                                                                                                      |
| `pwa/src/game/audio/bus.ts`          | One synth, two volume-scaled views (effects / music), and the unlock.                                                                                                                                                                                                                  |
| `pwa/src/game/audio/ui.ts`           | Raising an interface cue, and the repeat cap on it. Deliberately does NOT unlock — see the last section.                                                                                                                                                                               |
| `scripts/audition.mjs`               | **THE REVIEW SURFACE** (`make audition`).                                                                                                                                                                                                                                              |

## An event, a cue, or a bed — the first decision, and the one that matters

| It is…             | When                                                                                               | Where it goes                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **An EVENT sound** | The simulation reported a moment: `step()` pushed a `GameEvent`                                    | A def in `bank.ts` + a rung in `route.ts`                                                           |
| **A CUE**          | The APP knows something happened and the engine never said so — the countdown lights, a menu click | Raised directly (`playUi`, or the bed's own clock)                                                  |
| **A BED**          | It has no beginning and no end: the engine, the tyres, the wind, a slide, the birds' floor         | A LAYER in `engine-voice.ts` / `road-voice.ts` / `ambience.ts`, steered per frame by `drive-bed.ts` |
| **A WORLD CALL**   | The country did it, not the car: a bird, a cow, a horn                                             | A def in `bank-world.ts` + a row in `worldRoster` (`ambience.ts`)                                   |

The trap is reaching for a new engine event to make a noise. **Never add a
`GameEvent` for presentation**: if the app can work it out from the state it
already has, it must. The countdown is the worked example — nothing happens in
the simulation when a light changes, so the light is the bed's business.

**A field left out of a route rung answers every value of it.** Add a new
`case` to `route.ts` only when the event genuinely picks a DIFFERENT sound; if
it only picks a different SIZE, that is a `PlayShape` (`gain`, `pitch`,
`stretch`, `pan`) on the sound already there. A bank with nine landings that
are the same four voices at different volumes is a bank nobody can retune.

## A BED is a LAYER; an EVENT is a one-shot

Every one-shot is attack-then-decay: the level falls exponentially across the
whole duration — a tenth of the peak a quarter of the way in — which is why a
longer `durationMs` makes a sound RING rather than sustain. That is exactly
right for a hit, a click or a shift, and a `holdMs` turns it into a swell.

A bed is not made of one-shots, and **never write one out of them**. It is a
`Layer` (`Synth.layer`): a node graph built ONCE — an oscillator or a looping
window onto the noise pool, a filter, a saturation curve, a gain — and then
STEERED. Every frame the scheduler hands it a `LayerTarget` (level, pitch,
cutoff, grit, pan) and a glide, and the layer moves there with
`setTargetAtTime` on the audio thread. The rules:

1. **What a layer IS goes in the `LayerSpec`; what MOVES goes in the target.**
   The oscillator, the noise colour, the filter's type and Q, the chorus
   width and the curve cannot be changed smoothly under a running signal, so
   they are decided once. A surface with a different colour of roar is a
   second layer (`roarPink` / `roarBrown`), not a colour switch.
2. **A bed is a PURE FUNCTION from the state to a table of targets**
   (`engineTargets`, `roadTargets`, `worldTargets`). That is what makes it
   testable, what lets the audition page drive it from sliders, and what
   keeps `drive-bed.ts` a reader of the state rather than a sound designer.
   Add a layer by adding a key to the spec table, the glide table and the
   target function; the tests read the targets by NAME.
3. **The glide is the character of the change**, and it is seconds: pitch on
   a few hundredths (a rev that lags the needle reads as a slow engine), a
   surface on a tenth (a wheel leaving the road is a cross-fade, not a
   switch), the weather on a quarter (a squall arrives).
4. **A driven layer has ONE curve and moves the gain in front of it.**
   `LayerTarget.grit` is the pre-gain; swapping a curve under a running
   signal is a step.
5. **Nothing is booked ahead.** A late frame leaves every layer holding its
   last target. A bed that had to be fed on a cadence breathed with the frame
   rate and left a hole in itself whenever it was starved — and a hole is
   what a player reports as CRACKLE. The one-shots the bed raises (the
   lights, the crackle, the wipers) play NOW, with no `at`.
6. **A silent layer costs nothing to keep.** Set its level to 0 and leave it
   built; `rack.ts` rebuilds a layer only when its context has died.

`tests/audio_test.ts` holds the beds to this: built once, steered every
frame, nothing booked on the clock, rebuilt on a replaced context, and every
computed cutoff under the headset's Nyquist across the whole range.

## Sound design vocabulary

A starting grammar — tweak from here, do not treat as law:

- **Every impact is three layers**: a TRANSIENT (what touched what — a short
  bandpass or broadband crack), a BODY (what it was made of — a driven square
  or sawtooth that bends as it decays), and a TAIL (the room and the debris —
  delayed, filtered, on the echo bus). A one-layer hit is a chip hit however
  loud it is.
- **Anything with mass** gets a brown-noise layer under it and a sine that
  glides DOWN. Size is heard as lowness before it is heard as loudness, which
  is why `PlayShape.pitch` below 1 is how a bigger version of a sound is made.
- **Water has no transient.** A ford is a pink swell opening through a
  bandpass sweep, with a brown thump under it and no click anywhere.
- **Metal tearing** is a bandpass sweeping UP with high Q, and then the part
  itself as three dry clatters spaced 100–150 ms apart on the echo bus.
- **An interface sound is hardware, not a note**: a short filtered noise
  transient (the contact) over a low sine (the body it happened in). A menu
  that beeps is a menu from a different game.
- **A refusal has no contact click** — the switch did not move.
- **A BED THAT IS CONSTANT SAYS NOTHING, and says it for the whole run.** The
  tyres are the trap: a tyre rolling straight ahead barely makes a noise, and
  what makes the noise is a tyre being asked to TURN the car. Write a
  continuous surface as a quiet cruise level plus a multiplier it reaches under
  load, never as one level — otherwise the loudest thing in the mix is also the
  thing carrying the least information. The honest cornering signal is lateral
  acceleration (`car.u * car.yawRate`): zero on a straight at any speed, zero at
  a standstill on full lock, largest where a tyre is loudest.

Mixing rules, and they are enforced by test:

- The crash is the ceiling at ~0.1. Ordinary contacts sit at 0.04–0.07.
  Anything that can happen twice a second (shifts, scuffs) stays under 0.04.
  Gloss layers sit at 0.015–0.03.
- **The interface is quieter than the car**, always. `ui_move` is the
  most-played sound in the game.
- **A bed's level is heard as written, THROUGH THE LISTENER.** Every target
  is multiplied by the seat's row in `listener.ts` before it reaches the
  layer, and every one-shot by its `events` gain and `muffle` pitch. Retune
  a sound at the CHASE seat (the row of ones), and check it from the cockpit
  and the helicopter before calling it done.
- **The world is a third of the car.** `WORLD_BANK`'s loudest voice sits
  under a third of `RUN_BANK`'s, every call fades with speed and is gone past
  half of what the car can do, and a test holds both.
- Keep every sound's `description` current. It is the sentence the next person
  checks their retune against, and a def without one fails the test.

## Iteration cycle — a SOUND

1. Edit the def in `bank.ts` (or the bed). A new sound needs a rung in
   `route.ts` or a cue that raises it, or it can never play.
2. `make audition` and **listen to it in a browser**, next to the sounds it
   will be heard beside. A sound judged in isolation is a sound that turns out
   to be twice as loud as everything around it.
3. `npx vitest run tests/audio_test.ts` — the mix budget, the route coverage
   the beds' targets, and every cutoff — authored or computed — against the
   headset's rate.
4. For a BED, move the sliders through the whole range on the audition page.
   The faults are all at the ends: an engine that buzzes at idle, a scrub that
   vanishes at low speed, a wind that arrives all at once.
5. **Then hear it in the game** (`npm run dev`), because the mix is the point:
   a crash lands over an engine, a tyre bed and a score. If a sound smears the
   mix, shorten it before quieting it.
6. Loop until each moment is identifiable with your eyes closed.

**The audition page is part of the deliverable, not a courtesy.** A PR that
changes what the game sounds like and gives its reviewer no way to hear it is a
PR nobody can review. Publish `previews/audition.html` and put the link in the
PR body.

## What the engine will not tell you

- **A contact under 3 m/s makes no sound at all**, because `collision.ts` emits
  no `impact` event under its own scuff floor. That is deliberate — brushing a
  branch at walking pace is not an event — but it is the first thing to check
  when a scuff "does not work".
- **There is no throttle in `GameState`.** The engine's load is inferred from
  acceleration and the brake flag (`loadFrom`, `drive-bed.ts`). Anything that
  wants to know how hard the car is working reads that, not the input.
- **Revs are gearing plus forward speed**, exactly as the tachometer derives
  them, so the needle, the shift light and the engine note can never disagree.

## When a sound is allowed to START

A browser makes no sound before the player has touched something.
`unlockAudio()` runs from the menu's delegated pointer-down and the canvas's —
**never from `playUi`**, because some cues are raised by a HOVER and a context
built outside a real gesture is one iOS will not resume;
`armMenuMusic()` (the `soundtrack` skill's) starts the context with no gesture
where the platform permits it and otherwise arms the first touch or key
ANYWHERE. Keep both invariants if you touch `App.tsx`: a context built outside
a gesture on iOS is one no later gesture can revive.

## Skill self-improvement

Load **`skill-reflection`** before this session commits. It owns the lesson
lifecycle: recording what the pass learned (with a `scope` and `concepts`),
fixing anything here that turned out WRONG, deleting what went stale, and
promoting anything true in every run into the vocabulary above.

```sh
node scripts/skill-lessons.mjs sound-effects --list
```

The lessons here are a **palette of parameter recipes that worked** — read them
back before designing a sound, and add to them after.
