# Audio

**The game ships no audio files.** Every sound effect and every note of both
scores is synthesized in the browser from authored parameters. That is what
keeps the app small enough to install over a phone connection, keeps it working
offline the moment it is cached, and makes the sound design as reviewable as
the car specs — a sound is a list of numbers you can read, diff and retune.

The target register is **PlayStation-era rally, not 16-bit console**. A chip
voice is an oscillator with an envelope; a PSX game played samples through a
filter. Four things in the instrument exist to close that gap: noise has a
COLOUR (white / pink / brown), noise has an ENVELOPE (so a texture can swell
and hold instead of just stopping), filters SWEEP, and oscillators DISTORT.

## The shape of it

```
                         pwa/src/lib/synth.ts          ← the only WebAudio code
                                  ▲
              ┌───────────────────┴───────────────────┐
        audio/bus.ts  (one context, two volume views: effects / music)
              │                                       │
   ┌──────────┴───────────┐                    music.ts ── scores/<id>.ts
   │                      │                              (tracker data)
 bank.ts / bank-ui.ts   engine-bed.ts + road-grain.ts
 (discrete sounds)      (the continuous beds)
   │                      ▲
 route.ts               drive-bed.ts  ← reads GameState once per frame
 (GameEvent → sound)
```

| Module                             | What it owns                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa/src/lib/voice.ts`             | The vocabulary: every parameter a sound may be written in, and the `Synth` interface. **DOM-free**, so the bank, the router, the beds and the tests can describe a sound without importing a browser. |
| `pwa/src/lib/synth.ts`             | The instrument. `tone()` and `noise()`, one shared echo bus, a master limiter, and the whole audio-context lifecycle.                                                                                 |
| `pwa/src/lib/tracker.ts`           | The music sequencer: patterns through an order, booked on the audio clock with a lookahead.                                                                                                           |
| `pwa/src/game/audio/bus.ts`        | One synth, two volume-scaled views so the options screen can mix effects and music independently.                                                                                                     |
| `pwa/src/game/audio/bank.ts`       | Every discrete sound the car and the stage make, as data.                                                                                                                                             |
| `pwa/src/game/audio/bank-ui.ts`    | The interface's own sounds — a separate bank because the menu is on the startup path.                                                                                                                 |
| `pwa/src/game/audio/route.ts`      | Which sound a `GameEvent` makes, and how big.                                                                                                                                                         |
| `pwa/src/game/audio/engine-bed.ts` | The engine, as overlapping grains.                                                                                                                                                                    |
| `pwa/src/game/audio/road-grain.ts` | The tyres, the wind and the drift's scrub.                                                                                                                                                            |
| `pwa/src/game/audio/drive-bed.ts`  | The scheduler, and the start lights' ticks.                                                                                                                                                           |
| `pwa/src/game/audio/music.ts`      | The single player: which theme is up, and the per-track dynamic import.                                                                                                                               |
| `pwa/src/game/audio/scores/`       | The scores themselves.                                                                                                                                                                                |

## An event, a cue, or a bed

The engine emits `GameEvent`s from `step()` and has no idea any of them make a
noise. Three kinds of sound come out the other side:

- **Event sounds** answer a moment the simulation reported: a landing, a
  shift, an impact, going past a stand of spectators, the finish. `route.ts`
  maps the event to a bank id and a `PlayShape` — a scale (`gain`, `pitch`,
  `stretch`, `pan`) applied to the authored voices, so one landing covers a
  kerb hop and a forty-metre flight, one `cheer` covers a knot of six at a
  corner and the bank at the finish, and one `splash` covers a ford crossed
  at pace and a car going into a lake it will not be coming out of (an
  octave down, half again as long).
- **Cues** are moments the app knows and the engine never reported. The
  countdown lights are the worked example: nothing happens in the simulation
  when a light changes, so the light is the bed's business. Menu clicks are
  cues too. **Presentation never becomes a `GameEvent`.**
- **Beds** have no beginning and no end. They are re-read from the live state
  every time a grain is booked, which is what a static bank entry cannot be.

## How a bed is made out of one-shots

The synth has no sustained voice — `tone()` starts, glides and stops. So the
engine is a **grain** fired on a steady cadence, and the grains overlap into
something continuous. Overlap alone is not enough: a tone's level falls
exponentially across its whole length, so grains that merely outlast the gap
between them still arrive as separate events, and what comes out of the speaker
is putt … putt … putt. Three things together fix it:

1. the grain **holds** its peak (`holdMs`),
2. the cadence is a **fraction** of the hold, so three grains are always up
   together,
3. the cadence is **constant** — a cadence that quickened with the revs would
   make the rate of the putter the thing the ear follows, when the rate the
   engine is turning at is the PITCH.

Noise beds want a deeper stack than pitched ones (five grains against three),
because uncorrelated noise sums in power rather than in level.

**No voice ever starts on a step.** A gain that jumps from nothing to full
scale between two samples is broadband — the ear gets a click on top of the
note — and it is also what makes a resonant filter ring at its own cutoff, so
on something like a hi-hat (a few milliseconds of noise highpassed at 8 kHz,
several a second under both scores) the ring IS what the player hears, and it
reads as a broken speaker. Every voice therefore ramps on over at least
`MIN_ATTACK_MS`, which is far below the ~10 ms the ear resolves as an attack:
nothing is softened, only the discontinuity goes. The whole gain curve —
attack, hold, decay, and which of the two decay shapes a voice gets — is
`envelopeShape()` in the DOM-free `voice.ts`, so it can be read and tested
without a browser; `synth.ts` only writes it onto a real node.

The grains are booked **ahead on the audio clock**, a quarter of a second in
advance, not fired from the animation frame — a bed fired per frame breathes
with the frame rate, and a breathing engine is the most obvious tell there is
that a game's audio is being generated.

Two things keep that true over a long session, and both are the difference
between a bed and a stutter:

- **A grain is never booked in the past — and never far in the future
  either.** WebAudio starts a source whose time has already gone the instant it
  is handed over, so a stall that leaves the scheduler's anchor behind the
  clock does not delay the bed: it fires every missed grain at once, on top of
  the next one. The bed re-anchors the moment it is late instead — its phase
  means nothing, its regularity is everything. An anchor far AHEAD of the clock
  is the same fault from the other side, and it is what an app switch leaves
  behind: iOS hands back a dead context, the synth replaces it, and the fresh
  clock starts near zero while the anchor still holds a time minutes into the
  old one's. An anchor in the future is never late, so nothing re-times it and
  the bed simply stops — silence until the new clock catches up. Both ends are
  re-anchored (`STALE_S`).
- **Noise is generated once, not once per voice.** The road bed alone asks for
  about twenty seconds of noise per second of play, so synthesising a buffer
  per grain churned ~4 MB of `Float32Array` a second on the renderer's own
  thread — and the collector eventually answers that with a pause long enough
  to cause exactly the lateness above. `synth.ts` keeps four seconds of each
  colour (`NOISE_POOL_S`) and every voice reads a random window of it.

### What the engine is made of

`RPM_PER_HZ = 30`, because a four-cylinder four-stroke fires twice per
revolution: idle (900 rpm) is a 30 Hz chug and the limiter (7000) is 240 Hz.
Revs come from the engine's own `car.rev` — gearing plus forward speed on the
move, exactly what the tachometer reads, so the needle, the shift light and
the note can never disagree — and on the GRID, where nothing is geared and
the car is not moving, from the throttle itself, so a driver waiting for the
lights can blip it and hear the engine answer. Over that
sit four layers with four different jobs — a HUM (how fast it is turning, the
only layer whose pitch moves), a CLATTER (that it is machinery, one tick per
crank revolution), a BASS bed (that it is a tonne of it), and an INTAKE rasp
(that it is being asked for everything). Load — inferred from acceleration and
the brake, since `GameState` has no throttle in it — sets the hum's level and
how hard it is driven through the waveshaper.

### What the road is made of

The tyre bed picks its colour, its band and its weight from the surface:
tarmac is a dull bass drumming with no crunch at all; gravel is a broad low
rush with the stones over it; forest floor is brown and muffled; water is a
hiss with no crunch. The
wind is pink noise rising with the SQUARE of speed, and it is the only bed that
keeps going in the air — the silence where the tyres were is what a jump sounds
like.

**A tyre rolling straight ahead barely makes a noise.** What makes the noise is
a tyre being asked to turn the car, so every surface is written as a quiet
cruise `level` plus a `corner` multiplier it reaches at full lateral load, and
the multiplier lifts the crunch with the roar. Tarmac's cruise is close to
silence — down a sealed straight the player should be hearing the engine and,
under it, a dull bass rumble around 125 Hz and nothing else; a sealed surface
has no loose material, so it carries no crunch layer at all. Gravel's cruise
is half what it was, with the corner multiplier doubled to pay it back: a
corner is exactly as loud as it always was and a straight is half as loud,
which is the whole point of writing a bed as cruise-plus-corner. Off the road
stays loud on the straight, because being off the road should sound like a
mistake.

The cornering signal is **lateral acceleration** (`car.u * car.yawRate`,
against `LAT_LIMIT` in `drive-bed.ts`): zero on a straight at any speed, zero at
a standstill on full lock, largest exactly where a tyre is loudest. It is
smoothed with a time constant rather than a per-frame fraction, so the bed
responds the same way on a 40 Hz phone as on a 120 Hz display.

The **scrub** is the drift, and it is the loudest thing in the bed. On gravel it
is proportional to `car.slide`, the engine's own measure of how far past
gripping the car is, so it IS the drift rather than an effect layered over one:
there is nothing to grip and let go of out there, so there is no pitch at all —
the sound is the surface being thrown, and the spray pans to the outside of the
slide. On tarmac a tyre grips and releases at a rate the ear reads as a pitch,
and it starts protesting **while it is still winning**: the sealed-surface
squeal is a resonant band with a driven note in it, driven by the cornering load
past `SING_FLOOR`, with a genuine slide taking over from there.

## The scores

Two tracker arrangements, both looping:

| Id      | Title           | Where                  | Loop            |
| ------- | --------------- | ---------------------- | --------------- |
| `menu`  | STARTING RAMP   | Behind every menu page | 132 bpm, ~116 s |
| `taiga` | TAIGA, FLAT OUT | On a stage             | 150 bpm, ~90 s  |

A score is instruments (named patches), patterns (sections of note tokens on a
sixteenth-note grid) and an order (the arrangement, which loops). Each one is
behind its own `import()`, so a score is never on the startup path.

**The one thing this sequencer does that a chip tracker cannot is `hold`.**
Every voice decays exponentially across its own length, so a whole note written
as sixteen ties is a pluck with a long tail. `hold` keeps the note at its peak
first — which is what lets a pad be a pad instead of a re-struck chord, and is
most of why these read as PlayStation cues rather than SNES ones.

Music sits well under the effects (lead ~0.028, bass ~0.05, pads ~0.011, hats
~0.009): the score plays continuously under an engine, so it is the bed, not
the event. The stage theme in particular is written to stay OUT of the bands
the car owns — its weight is in the mid, and its bass is short and plucked
rather than sustained.

## When audio is allowed to start

A browser makes no sound before the player has touched something, and a
context built outside a real gesture is one iOS Safari will never resume — so
the unlock hangs off actual gestures only (the menu's delegated pointer-down,
the canvas, and the document-wide arrival listeners below), never off a cue
that a hover can raise. The menu arms its theme as it opens: the arrangement is claimed straight away (the
sequencer tolerates a silent clock — it ticks, finds none, nudges and waits),
`autostart()` starts it with no gesture where the platform permits that, and
otherwise the player's first touch or key ANYWHERE unlocks it. A context built
outside a gesture on iOS is one no later gesture can revive, which is why the
autostart is a deliberate no-op anywhere the browser cannot say it is allowed.

Backgrounding the app suspends the context outright. Nothing else reliably
silences a PWA that was switched away from to an app which claims no audio
session of its own — it would otherwise play on, slowly, from behind another
app, because a hidden page's timers are throttled to about 1 Hz.

## Options

Options → Audio has two faders, effects and music, in five steps each with OFF
as a real stop. They scale two views of one underlying synth, so there is only
ever one audio context to unlock and one limiter for everything to sum into.
The engine, the tyres, the wind and the slide are all EFFECTS — turning them
off leaves a stage with nothing but its score.

## Judging any of it

```sh
make audition        # previews/audition.html
```

A self-contained page built from the repository's own code — the same synth,
bank, sequencer and road grain that ship — with every sound on a button beside
the description it was written against, both scores under the real sequencer
with a per-voice mute, and the continuous bed under sliders for revs, load,
speed, how hard it is cornering, how sideways it has gone, and what surface. It is the only honest way to judge a
continuous sound, and the only way a reviewer can hear a change at all.

`tests/audio_test.ts` holds the rest: every event routes to a sound the bank
actually has, no voice exceeds the mixing ceiling, the interface stays quieter
than the car, both scores flatten with every token a real note and come in
inside their length bounds, the engine bed's grains tile without a hole and
re-anchor rather than booking into the past after a stall, and the tyre bed
stays quiet on a straight, quietest of all on tarmac, and sings there from the
cornering load alone.
