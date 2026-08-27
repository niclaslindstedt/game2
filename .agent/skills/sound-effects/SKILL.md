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

| Reach for                             | When                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `color: "brown" \| "pink"` on a noise | ALWAYS decide this before the filter. Brown is mass and distance, pink is gravel/water/tyre roar, white is glass and grit.                     |
| `filter.to` — a moving cutoff         | Any sound that is a GESTURE rather than a hit: a whoosh, a spray thinning out, a turbo spooling, a crash opening and closing.                  |
| `drive` — the waveshaper              | Anything with combustion or violence in it. A clean triangle is a flute; a driven one is an engine. 0.2–0.4 is grit, past 0.7 is a fuzz pedal. |
| `attackMs` + `holdMs` on a NOISE      | Only for a BED (see below). Never for a hit.                                                                                                   |

**MUSIC IS NOT HERE.** A score is tracker data with an arrangement, judged by
its structure and its mix over two minutes. Different format, different review
surface, different faults: load the **`soundtrack`** skill. The two crafts share
only `pwa/src/lib/synth.ts`, the instrument underneath both.

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs sound-effects --list`, then the ones this task
touches. Reflecting them back at the end is the **`skill-reflection`** skill's
job; load it at both ends of the session. Load **`write-code`** too.

## Files

| File                               | Role                                                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa/src/lib/voice.ts`             | **The vocabulary.** Every parameter a sound may be written in, and the `Synth` interface. DOM-free on purpose, so the bank, the router, the beds and the tests can describe a sound without importing a browser.                 |
| `pwa/src/lib/synth.ts`             | The instrument: `tone()` and `noise()`, the shared echo bus, the master limiter, and the whole audio-context lifecycle (unlock, autostart, iOS interruption and zombie-context recovery). The only module that touches WebAudio. |
| `pwa/src/game/audio/bank.ts`       | **THE RUN'S SOUND DESIGN.** Every discrete sound the car and the stage make, as data: a description and a list of voices. This is where most SFX work happens.                                                                   |
| `pwa/src/game/audio/bank-ui.ts`    | The interface's own sounds. Separate because the menu is on the app's STARTUP path and must not pull the run's bank into the entry chunk.                                                                                        |
| `pwa/src/game/audio/route.ts`      | **WHICH sound an event makes**, and how big — a pure function from `GameEvent` to a bank id plus a `PlayShape`.                                                                                                                  |
| `pwa/src/game/audio/play.ts`       | Firing one def: voices go to the synth verbatim, scaled by the shape.                                                                                                                                                            |
| `pwa/src/game/audio/engine-bed.ts` | The engine, as overlapping grains. The one sound whose pitch is arithmetic rather than taste.                                                                                                                                    |
| `pwa/src/game/audio/road-grain.ts` | The tyres, the wind and the DRIFT's scrub — one grain, as a pure function of how the car is going.                                                                                                                               |
| `pwa/src/game/audio/drive-bed.ts`  | The scheduler: reads `GameState` each frame and books grains ahead on the audio clock. Also the countdown lights.                                                                                                                |
| `pwa/src/game/audio/bus.ts`        | One synth, two volume-scaled views (effects / music), and the unlock.                                                                                                                                                            |
| `pwa/src/game/audio/ui.ts`         | Raising an interface cue, and the repeat cap on it. Deliberately does NOT unlock — see the last section.                                                                                                                         |
| `scripts/audition.mjs`             | **THE REVIEW SURFACE** (`make audition`).                                                                                                                                                                                        |

## An event, a cue, or a bed — the first decision, and the one that matters

| It is…             | When                                                                                               | Where it goes                                       |
| ------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **An EVENT sound** | The simulation reported a moment: `step()` pushed a `GameEvent`                                    | A def in `bank.ts` + a rung in `route.ts`           |
| **A CUE**          | The APP knows something happened and the engine never said so — the countdown lights, a menu click | Raised directly (`playUi`, or the bed's own clock)  |
| **A BED**          | It has no beginning and no end: the engine, the tyres, the wind, a slide                           | `engine-bed.ts` / `road-grain.ts`, driven per frame |

The trap is reaching for a new engine event to make a noise. **Never add a
`GameEvent` for presentation**: if the app can work it out from the state it
already has, it must. The countdown is the worked example — nothing happens in
the simulation when a light changes, so the light is the bed's business.

**A field left out of a route rung answers every value of it.** Add a new
`case` to `route.ts` only when the event genuinely picks a DIFFERENT sound; if
it only picks a different SIZE, that is a `PlayShape` (`gain`, `pitch`,
`stretch`, `pan`) on the sound already there. A bank with nine landings that
are the same four voices at different volumes is a bank nobody can retune.

## A BED gets a hold; an EVENT never does

Every voice is attack-then-decay: the level falls exponentially across the
whole duration — a tenth of the peak a quarter of the way in — which is why a
longer `durationMs` makes a sound RING rather than sustain. That is exactly
right for a hit, a click or a shift.

A bed is not made of hits. It is one grain fired over and over so the copies
fuse into something continuous, and **three things are needed, not one**:

1. the grain **holds** its peak (`holdMs`),
2. the cadence is a **fraction** of the hold, so three grains are always up
   together and their holds tile end to end,
3. the cadence is **constant** — a cadence that quickens with the revs makes
   the rate of the putter the thing the ear follows, when the rate the engine
   is actually turning at is the PITCH.

Get any one wrong and what comes out of the speaker is putt … putt … putt.
`tests/audio_test.ts` guards the tiling; the audition page's sliders are how
you hear it.

Noise beds want a DEEPER stack than pitched ones (five grains against three):
uncorrelated noise sums in power rather than in level, so a broadband bed
flutters where a pitched one is already smooth.

**AND A BED IS EXPENSIVE, so count what it asks for.** Five overlapping grains
nine times a second is twenty SECONDS of audio per second of play. Nothing on
that path may synthesise samples per voice — `synth.ts` keeps one long buffer
per noise colour and every grain reads a random window of it, because the
alternative was four megabytes of `Float32Array` a second on the renderer's own
thread, and the collector answers that with a pause long enough to push the
next grain behind the clock. A bed that is cheap for one grain and run ten
times a second is not cheap.

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
- **A bed's numbers look wrong and are not.** Three grains sound at once, so
  every volume in `engine-bed.ts` is about a third of what the player hears.
- Keep every sound's `description` current. It is the sentence the next person
  checks their retune against, and a def without one fails the test.

## Iteration cycle — a SOUND

1. Edit the def in `bank.ts` (or the bed). A new sound needs a rung in
   `route.ts` or a cue that raises it, or it can never play.
2. `make audition` and **listen to it in a browser**, next to the sounds it
   will be heard beside. A sound judged in isolation is a sound that turns out
   to be twice as loud as everything around it.
3. `npx vitest run tests/audio_test.ts` — the mix budget, the route coverage
   and the bed's tiling.
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
