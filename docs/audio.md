# Audio

**The game ships no audio files.** Every sound effect and every note of every
score is synthesized in the browser from authored parameters. That is what
keeps the app small enough to install over a phone connection, keeps it working
offline the moment it is cached, and makes the sound design as reviewable as
the car specs — a sound is a list of numbers you can read, diff and retune.

The target register is **PlayStation-era rally, not 16-bit console**. A chip
voice is an oscillator with an envelope; a PSX game played samples through a
filter. Four things in the instrument exist to close that gap: noise has a
COLOUR (white / pink / brown), noise has an ENVELOPE (so a texture can swell
and hold instead of just stopping), filters SWEEP, and oscillators SATURATE
through a soft curve.

## The shape of it

```
                         pwa/src/lib/synth.ts          ← the only WebAudio code
                                  ▲
              ┌───────────────────┴───────────────────┐
        audio/bus.ts  (one context, two volume views: effects / music)
              │                                       │
   ┌──────────┴──────────────┐                 music.ts ── scores/<id>.ts
   │                         │                    ▲             (tracker data)
 bank.ts + bank-stage.ts   engine-voice.ts     music-pick.ts
 bank-world.ts             road-voice.ts       (which score a stage gets)
 bank-ui.ts                ambience.ts
 (discrete sounds)         (the LAYERS: built once, steered)
   │                         ▲
 route.ts                  drive-bed.ts  ← reads GameState once per frame
 (GameEvent → sound)         ▲
   └──────── listener.ts ────┘  (what the camera does to the mix)
```

| Module                               | What it owns                                                                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pwa/src/lib/voice.ts`               | The vocabulary: every parameter a sound may be written in, the `Synth` interface, and the `Layer` a bed is made of. **DOM-free**, so the banks, the router, the beds and the tests can describe a sound without importing a browser. |
| `pwa/src/lib/synth.ts`               | The instrument. `tone()` and `noise()` for one-shots, `layer()` for the beds, one shared echo bus, a master limiter, and the whole audio-context lifecycle.                                                                          |
| `pwa/src/lib/tracker.ts`             | The music sequencer: patterns through an order, booked on the audio clock with a lookahead.                                                                                                                                          |
| `pwa/src/game/audio/bus.ts`          | One synth, two volume-scaled views so the options screen can mix effects and music independently.                                                                                                                                    |
| `pwa/src/game/audio/bank.ts`         | Every discrete sound the CAR makes, as data — and `RUN_BANK`, the car and the stage served together.                                                                                                                                 |
| `pwa/src/game/audio/bank-stage.ts`   | Every discrete sound the STAGE makes: the lights, the split boards, the line, the crowd, the blocks, the sky.                                                                                                                        |
| `pwa/src/game/audio/bank-world.ts`   | The country's own sounds: birds, insects, an owl, a coyote, cows and sheep, a diesel's horn, a crossing bell, a marshal's whistle.                                                                                                   |
| `pwa/src/game/audio/bank-ui.ts`      | The interface's own sounds — a separate bank because the menu is on the startup path.                                                                                                                                                |
| `pwa/src/game/audio/route.ts`        | Which sound a `GameEvent` makes, how big, and how it is heard from the seat it is watched from.                                                                                                                                      |
| `pwa/src/game/audio/listener.ts`     | What each camera on the ladder does to the mix — one row per `PlayCamera`.                                                                                                                                                           |
| `pwa/src/game/audio/engine-voice.ts` | The engine, as six layers: where each should be for a set of revs, a load and a seat.                                                                                                                                                |
| `pwa/src/game/audio/road-voice.ts`   | The tyres, the wind, the weather, the gale and the drift's scrub, as fourteen layers.                                                                                                                                                |
| `pwa/src/game/audio/ambience.ts`     | The world: three layers (the canopy, the crowd, a train) and the roster of calls a country makes at an hour.                                                                                                                         |
| `pwa/src/game/audio/rack.ts`         | The plumbing every bed shares: build a layer, rebuild one whose context died, steer it.                                                                                                                                              |
| `pwa/src/game/audio/drive-bed.ts`    | The scheduler: the state, once a frame, into every layer's target — and the cues nothing reports (the lights, the lift's crackle, the wipers, the whistle).                                                                          |
| `pwa/src/game/audio/music-pick.ts`   | Which score a stage gets, from its country, its sky and the shape of its road.                                                                                                                                                       |
| `pwa/src/game/audio/music.ts`        | The single player: which theme is up, and the per-track dynamic import.                                                                                                                                                              |
| `pwa/src/game/audio/scores/`         | The scores themselves, over a shared `kit.ts` of figures and patches.                                                                                                                                                                |

## An event, a cue, or a bed

The engine emits `GameEvent`s from `step()` and has no idea any of them make a
noise. Three kinds of sound come out the other side:

- **Event sounds** answer a moment the simulation reported: a landing, a
  shift, an impact, a split board, a system giving way, going past a stand of
  spectators, the finish. `route.ts` maps the event to a bank id and a
  `PlayShape` — a scale (`gain`, `pitch`, `stretch`, `pan`) applied to the
  authored voices, so one landing covers a kerb hop and a forty-metre flight
  (scaled by the SLAM the event carries, with a floor under it because a car
  is heavy and no landing sounds like nothing), one `cheer` covers a knot of
  six at a corner and the bank at the finish, and one `splash` covers a ford
  crossed at pace and a car going into a lake it will not be coming out of.
  Where an event carries what it happened TO, the route reads that: a
  `solidBreak` splits on the material — a dry splintering `wood_break` for a
  trunk, a flat `stone_shove` for a rock — and takes its pitch from the size
  of the thing that gave way. `kerbHit` is the one contact deliberately NOT
  on the impact ladder: an R26 anti-cut block is concrete felt through the
  floor with no top end in it, because a player who hears the car break there
  stops cutting apexes instead of learning what cutting one costs. `missed`
  is `finish` inverted, two notes falling rather than rising, dry, with no
  crowd behind them. `checkpoint` is a timing beam broken, quiet and quick,
  a touch higher on the last board of a lap so a driver counting them hears
  the count end. `systemFail` is the one piece of damage news nobody can see,
  told: a knock for a system giving, a heavier clunk with a hiss behind it
  for a system gone.
- **Cues** are moments the app knows and the engine never reported. The
  countdown lights are the worked example: nothing happens in the simulation
  when a light changes, so the light is the bed's business. So are the
  exhaust CRACKLE on a lift at revs (read off the smoothed load's own edge),
  the WASTEGATE on an upshift under boost, the WIPERS' strokes (in step with
  the drawn blades, and only heard from inside the glass), the marshal's
  whistle in the intro, a clap of thunder (the storm is simulated
  renderer-side), the `knock` of a marshal's cone going over, and every call
  the world makes. Menu clicks are cues too. **Presentation never becomes a
  `GameEvent`.**
- **Beds** have no beginning and no end. They are LAYERS — see below.

## How a bed is made

The engine, the tyres, the wind, the weather and the country's ambience are
not one-shots and are not made of them. Each is a **layer**: a node graph the
synth builds once (`Synth.layer`) and never stops — an oscillator or a looping
window onto the noise pool, a filter, a saturation curve, a gain, a panner —
and then STEERS. Every frame `drive-bed.ts` reads the state and hands each
layer a target (`LayerTarget`: a level, a pitch, a cutoff, how hard it is
pushed into its curve, a pan) and a glide, and the layer moves there with
`setTargetAtTime` on the audio thread.

That is the whole difference between this instrument and one asked to fake a
continuous sound out of overlapping one-shots, and it is the reason the audio
does not crackle:

- **Nothing is booked ahead.** A frame that arrives late — a
  garbage-collection pause, a phone throttling itself, the world being built —
  leaves every layer holding its last value. A bed fed on a cadence breathed
  with the frame rate and left a hole in itself whenever it was starved, and a
  hole is what a player reports as crackle.
- **Nothing has to tile.** No grain length, no cadence, no phase alignment;
  the oscillator has been running since the run started.
- **The audio thread does a fixed amount of work.** Twenty-odd layers for the
  whole run instead of a hundred and fifty fresh nodes a second — which is the
  difference between a Bluetooth render buffer that keeps up and one that
  underruns.
- **A change of surface is a cross-fade for free.** The wheels leaving gravel
  for turf take the bed from one voice to the other over the glide, and
  drizzle genuinely lands between a road and its wet twin.

What a layer IS (`LayerSpec`) is decided once — which oscillator or colour of
noise, the filter's type and resonance, the curve, the chorus width — because
those are the things that cannot be moved smoothly. Everything that can be is
a target. A parameter that has not moved is not re-scheduled.

`rack.ts` is the plumbing every bed shares: it builds a layer the first time
it is asked for, rebuilds one whose context has been replaced under it (iOS
hands a backgrounded PWA a dead `AudioContext` and the synth swaps it), and
tries again next frame when the context is still locked.

**Every layer's cutoff is held under Nyquist against the LIVE sample rate.**
A biquad's coefficients come from its cutoff divided by half the sample rate;
at or past 1 that is not a bright filter, it is undefined, and WebKit answers
with a harsh burst. The rate is not a constant: **iOS picks it from the live
audio ROUTE**, and a Bluetooth headset in hands-free mode drops the whole
session to 16 kHz — Nyquist 8 kHz. `safeCutoff()` in `voice.ts` clamps every
cutoff, authored or steered, and `tests/audio_test.ts` walks every authored
filter in every bank and every score against every rate a context comes back
at, and sweeps the beds' computed cutoffs across their whole range. Every
hat and shaker in every score sits under 7 kHz for the same reason: the clamp
stops the fault but cannot give back a hat authored above the ceiling.

**No voice ever starts on a step.** A gain that jumps from nothing to full
scale between two samples is broadband and rings any resonant filter after it
at its own cutoff, so every one-shot ramps on over at least `MIN_ATTACK_MS`
(far below the ~10 ms the ear resolves as an attack), and a layer being torn
down fades over a few hundredths. The whole gain curve of a one-shot is
`envelopeShape()` in the DOM-free `voice.ts`, so it can be read and tested
without a browser.

**And the saturation is soft.** `drive` folds a waveform through a `tanh`
curve whose steepness runs 1 to 10 (`shaperSteepness`) — never the near-hard
clip that folds every harmonic in at once and aliases. Over a Bluetooth codec
a hard clip is the torn-speaker sound. A layer keeps one fixed curve and moves
the gain in FRONT of it (`LayerTarget.grit`), because swapping a curve under a
running signal is a step.

### The instrument's lifecycle

The context is created with `latencyHint: "balanced"` — a render buffer of a
few tens of milliseconds rather than the smallest the hardware offers, which is
nothing against the latency a Bluetooth link adds anyway and is the difference
between a buffer that survives a busy frame and one that underruns. The master
limiter is deliberately slow (a five-millisecond attack, a soft knee): one with
a two-millisecond attack reacts inside a cycle of the 30–60 Hz bass the engine
lives on and modulates it. Brown noise is highpassed at 8 Hz on generation so
the limiter is never pumping to a wander nobody can hear.

When the output ROUTE changes under a running context — a headset connecting,
a car stereo picking the phone up — the synth re-seats the audio session with
a suspend→resume cycle a quarter of a second later (`devicechange`). iOS does
not always re-open the session on the new route by itself, and what comes out
of an un-seated route is crackle.

Backgrounding the app suspends the context outright; a zombie context (running
state, dead clock) is healed by the same cycle and, failing that, replaced on
the player's next touch, and every layer built on the old one reports itself
dead and is rebuilt. A context built outside a gesture on iOS is one no later
gesture can revive, which is why the unlock hangs off real gestures only and
the menu theme's autostart is a deliberate no-op anywhere the browser cannot
say it is allowed.

## What the engine is made of

`RPM_PER_HZ = 30`, because a four-cylinder four-stroke fires twice per
revolution: idle (900 rpm) is a 30 Hz chug and the limiter (7000) is 233 Hz.
Revs come from the engine's own `car.rev` — the driven wheels through the
gearing on the move, exactly what the tachometer reads, so the needle and the
note can never disagree — and on the grid from the throttle itself, so a
driver waiting for the lights can blip it. Six layers, six jobs
(`engine-voice.ts`): a HUM (the firing note, a detuned triangle pair, brighter
with the revs and driven harder into the curve with the load), its OCTAVE
(which carries the note at idle where 30 Hz is a thing a phone cannot
reproduce), a RASP (intake and exhaust edge, a driven sawtooth in a band that
climbs, the layer heard from OUTSIDE), a BASS (a sine an octave under, floored
at 44 Hz), a CLATTER (brown noise in a mid band, rougher with damage), and the
TURBO (a sine whistle far above everything, on the square of boost — load and
revs together). Load is inferred from acceleration and the brake, since
`GameState` has no throttle in it.

## What the road is made of

The tyre bed picks its colour, its band and its weight from the surface
(`road-voice.ts`): tarmac is a dull bass drumming with no crunch at all;
gravel is a broad low rush with the stones over it; sand is gravel with the
stones taken out; water is a hiss with weight; turf is broad, low, and fills
its MIDDLE (a resonant bottom with a bright hiss over it and a hole between
reads as sheet metal being scoured, so `nature` carries a wide soft `body` and
a banded `tear` rather than an open crunch). The wind is pink noise rising with
the SQUARE of speed, and it is the only bed that keeps going in the air — the
silence where the tyres were is what a jump sounds like.

**A tyre rolling straight ahead barely makes a noise.** What makes the noise
is a tyre being asked to turn the car, so every surface is written as a quiet
cruise `level` plus a `corner` multiplier it reaches at full lateral load. The
cornering signal is **lateral acceleration** (`car.u * car.yawRate`, against
`LAT_LIMIT` in `drive-bed.ts`): zero on a straight at any speed, zero at a
standstill on full lock, largest exactly where a tyre is loudest. It is
smoothed with a time constant rather than a per-frame fraction, so the bed
responds the same way on a 40 Hz phone as on a 120 Hz display.

The **scrub** is the drift, and it is the loudest thing in the bed. On gravel
it is proportional to `car.slide`, so it IS the drift rather than an effect
layered over one: a wide rush that opens the more sideways the car is, with
the stones spraying off the top and panned to the outside of the slide. On
tarmac a tyre grips and releases at a rate the ear reads as a pitch, and it
starts protesting **while it is still winning**: a resonant band with a driven
note in it, driven by the cornering load past `SING_FLOOR`. **Wheelspin is the
same tyre going the other way**: a launch with the axle lit (`launchSpin`, or
`wheelspin` in a gear with more than the road will take) digs on gravel and
sings on tarmac exactly as a slide does, from a standstill.

### What the rain does to it

Water does not add a layer to a surface, it changes what the surface IS, so
every row of `SURFACES` has a twin in `WET_SURFACES` and the bed reads
somewhere between the two (`surfaceUnder`, mixed by `RoadVoice.wet` — 0 clear,
0.6 rain, 1 storm, read against the country: a desert storm is dry). The
`grain` all but disappears — a wet stone does not rattle, and gravel in the
rain is MUD — while the `level` goes UP, because the loudest thing about a wet
road is the water being squeezed out from under the tread; the `corner`
multipliers come down to pay for it. Wet tarmac is the one surface the rain
makes brighter, and a wet tyre stops SINGING.

The rain itself is a bed like any other, and the only one with nothing to do
with the car: it plays over a stationary car and over one in mid-air. Two
layers — the sheet of it in the air and the patter of the drops striking the
car — both lifting with speed, both breathing with the squall (`squallOf` in
`weather.ts`, the live wind read against the stage's mean, so the sheet
thickens exactly as the car is shoved sideways). The gale is the wind that is
not the car's, a brown roar with a whistle over it, and the one thing a
PARKED car in a storm can still hear.

## The listener

The picture moves from the bumper to a helicopter and the sound moves with it
(`listener.ts`, one row per `PlayCamera`, read by the beds every frame and by
the router for every one-shot). Inside the car the engine is the biggest thing
in the world and it is DARK — the hum's cutoff is scaled down by the seat's
`tone`, the exhaust rasp is mostly kept out, the tyres are felt through the
floor, the wind is a whisper at the seals, and the rain is ON THE SCREEN, so it
is the loudest it ever is. Behind the car the exhaust is what you hear of the
engine and the tyres are the surface being thrown at you. High above it the
car is a small thing in a big country: the engine thin, the wind gone, and the
world most of what there is. One-shots take the seat's `events` gain and its
`muffle`, a pitch multiplier that moves every filter down with it — an impact
heard through a cabin is a duller impact. The wipers are only audible from
inside the glass.

## The world

The country was making noise before the car arrived (`ambience.ts`). Three
layers — the canopy (a pink hush that rises with the gale), the crowd (a
murmur near the start control and the finish), and a train (a brown rumble by
how far off the consist is) — and a ROSTER of calls raised on a loose clock:
the taiga is birds by day (a chirp, a trill, a raven), an owl at dusk, mostly
quiet at night; the desert is cicadas by day, crickets and a coyote after
dark; rain sends the birds to cover. A paddock the road runs past adds a cow
or a sheep on its own side of the car; a train on the line adds the diesel's
horn once as it comes to the crossing, and the bell on the crossing while the
car is at it. The marshal's whistle goes once in the intro.

Two rules keep the world a world. It is QUIET — the world bank's ceiling is a
third of the car's. And it is THINNED BY SPEED: every call fades with `air`
and is gone past half of what the car can do, because at 140 km/h the wind is
the only thing outside the car anyone can hear. The world is what the player
hears at the start line, in a hairpin, and in the moment after a crash.

## The scores

Seven tracker arrangements, all looping, and a stage's is picked by
`music-pick.ts` from its country, its sky and the shape of its road — the
shape first (a circuit and an endless stage each have their own), then the
country, then the taiga's sky:

| Id        | Title           | Where                            | Loop            |
| --------- | --------------- | -------------------------------- | --------------- |
| `menu`    | SERVICE PARK    | Behind every menu page           | 128 bpm, ~105 s |
| `taiga`   | TAIGA, FLAT OUT | The taiga on a clear day         | 150 bpm, ~90 s  |
| `spruce`  | BLACK SPRUCE    | The taiga in rain or a storm     | 140 bpm, ~96 s  |
| `polar`   | MIDNIGHT SUN    | The taiga at dawn, dusk or night | 118 bpm, ~114 s |
| `desert`  | SALT PAN        | The desert, whatever the sky     | 126 bpm, ~107 s |
| `circuit` | SHORT CIRCUIT   | Any circuit stage                | 160 bpm, ~84 s  |
| `endless` | LONG HAUL       | Any endless stage                | 132 bpm, ~131 s |

A score is instruments (named patches), patterns (sections of note tokens on a
sixteenth-note grid) and an order (the arrangement, which loops), built over
`scores/kit.ts` — the figures (a chord held, a bass in eighths, a gallop, brass
on the offbeats, an arpeggio) and the patches (a kick, a snare, a hat under
7 kHz by construction, a pad that holds) every score reaches for, so a score
file is its decisions and its tunes. Each one is behind its own `import()`, so
a score is never on the startup path.

**The one thing this sequencer does that a chip tracker cannot is `hold`.**
Every voice decays exponentially across its own length, so a whole note written
as sixteen ties is a pluck with a long tail. `hold` keeps the note at its peak
first — which is what lets a pad be a pad instead of a re-struck chord, and is
most of why these read as PlayStation cues rather than SNES ones.

Music sits well under the effects (lead ~0.028, bass ~0.05, pads ~0.011, hats
~0.009): the score plays continuously under an ENGINE, so it is the bed, not
the event. The stage themes are written to stay OUT of the bands the car owns
— their weight is in the mid, and their basses are short and plucked rather
than sustained.

## When audio is allowed to start

A browser makes no sound before the player has touched something, and a
context built outside a real gesture is one iOS Safari will never resume — so
the unlock hangs off actual gestures only (the menu's delegated pointer-down,
the canvas, and the document-wide arrival listeners below), never off a cue
that a hover can raise. The menu arms its theme as it opens: the arrangement
is claimed straight away (the sequencer tolerates a silent clock — it ticks,
finds none, nudges and waits), `autostart()` starts it with no gesture where
the platform permits that, and otherwise the player's first touch or key
ANYWHERE unlocks it.

## Options

OPTIONS ▸ SOUND has two faders, effects and music, and the pause card carries
the same two. Each runs 0–100% in twentieths, reads its own number beside it,
and reads OFF at the bottom. They scale two views of one underlying synth, so
there is only ever one audio context to unlock and one limiter for everything
to sum into; a layer reads the fader every frame, so a fader moved mid-stage is
heard at once. The engine, the tyres, the wind, the slide and the world are all
EFFECTS — turning them off leaves a stage with nothing but its score.

## Judging any of it

```sh
make audition        # previews/audition.html
```

A self-contained page built from the repository's own code — the same synth,
banks, sequencer, listener and beds that ship — with every score under the real
sequencer with a per-voice mute, the continuous beds under sliders for revs,
load, speed, how hard it is cornering, how sideways it has gone, the
wheelspin, the weather and the surface, a row of SEATS so the mix can be heard
from every camera, the world under its own sliders (the country, the hour, a
paddock, a train), and every sound in the three banks on a button beside the
description it was written against. It is the only honest way to judge a
continuous sound, and the only way a reviewer can hear a change at all.

`tests/audio_test.ts` holds the rest: every event routes to a sound the bank
actually has, no voice exceeds the mixing ceiling, the interface and the world
stay quieter than the car, every score flattens with every token a real note
and comes in inside its length bounds with no two sections the same density,
every pick is a score that exists, the engine works harder under load and goes
dark in the cabin, the tyre bed stays quiet on a straight and quietest of all
on tarmac, sings there from the cornering load alone and digs on gravel only
on a slide or a lit axle, the world has a roster per country and hour that is
thinned to nothing by speed, the bed builds its layers once and steers them
every frame, books nothing ahead, rebuilds them on a replaced context, counts
the lights once each, crackles once per lift and works the wipers only from
inside the car — and every cutoff, authored or steered, stays under the
headset's Nyquist.
