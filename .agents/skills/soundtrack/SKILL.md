---
name: soundtrack
description: "Use when writing, rewriting or tuning a piece of MUSIC — the menu theme, the stage theme, or a whole new score. The scores are tracker data authored as TypeScript under pwa/src/game/audio/scores/ (instruments, patterns, an order) played by a sequencer over WebAudio; nothing is recorded. Covers the format, the sustaining-pad knob that separates this from a chip score, how long a track has to be, the composition guidance, and the loop that actually makes a score good: build the audition page and LISTEN, with the voices muted one at a time. Not for sound effects — load `sound-effects` for those."
---

# Writing a soundtrack

Every track is **tracker data**, not a recording: a handful of synth patches, a
set of patterns made of note tokens, and an order that arranges them into a
loop. That keeps the app free of audio files and makes a score as diffable as
the car specs.

It also means a score arrives as several hundred lines of note tokens, which is
the central problem this skill exists around. **You cannot hear a wall of note
tokens, and you cannot judge a two-minute loop by playing it once** — the faults
that matter are structural and live in the relationship between bar 3 and bar
40, or between two voices sounding at the same time. So the loop below is built
on hearing it with the voices SEPARATED.

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs soundtrack --list`. Reflecting them back before
the commit is the **`skill-reflection`** skill's job. Load **`write-code`** too.

**A sound effect is NOT a small piece of music.** It is judged in a second, in
isolation, against a palette of synth recipes; it has no structure and no
arrangement to balance. That craft is **`sound-effects`**, and the two share
only the instrument they are played on.

## Files

| File                                | Role                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa/src/game/audio/scores/<id>.ts` | **THE SCORE.** Its instruments, its patterns, its order, and the DECISIONS behind it in the header comment. This is where the work happens.                                                                                                                   |
| `pwa/src/lib/tracker.ts`            | The sequencer: flattens patterns through the order and books each note on the synth with a lookahead. Also `bars()`, `noteFrequency()`, `trackSeconds()`.                                                                                                     |
| `pwa/src/lib/voice.ts` / `synth.ts` | The instrument every note is played on, shared with the sound effects.                                                                                                                                                                                        |
| `pwa/src/game/audio/scores/kit.ts`  | **THE KIT.** The figures (a chord held, a gallop, brass on the offbeats, an arpeggio) and the patches (a kick, a snare, a hat under 7 kHz, a pad that holds) every score is built from. A score file is its DECISIONS and its tunes; the plumbing lives here. |
| `pwa/src/game/audio/music-pick.ts`  | **WHICH score a stage gets** — from its country, its sky and the shape of its road. DOM-free; the tests read it.                                                                                                                                              |
| `pwa/src/game/audio/music.ts`       | The single player — play/stop/pause, which track is current, the per-track dynamic import, and `armMenuMusic`.                                                                                                                                                |
| `scripts/audition.mjs`              | **THE REVIEW SURFACE** (`make audition`): every score under the real sequencer, with a per-voice mute. Its `SCORE_FILES` table carries each score's title.                                                                                                    |

## THE ONE THING THIS SEQUENCER DOES THAT A CHIP TRACKER CANNOT

**`hold`.** Every synth voice decays exponentially across its own length, so a
whole note written as sixteen ties is a pluck with a long tail rather than a
pad — which is why chip scores are all arpeggios and re-struck ostinatos.
`hold` (0..1, a fraction of the note's gated length) keeps the note at its peak
first. With it, a pad is a pad, a string line swells and sits, and a bass can
hold a root under a chorus.

This is the single biggest reason a score here can read as a PlayStation cue
rather than a SNES one, and **the fault it fixes is the one to watch for**: a
bed that is really a re-struck chord. Three isolated attacks at two pitches is
not a texture, it is a TUNE — and it is a tune nobody wrote. If a section wants
a bed, give the voice `hold: 0.85–0.9`, `gate: 1`, and an `attackMs` in the
200–400 range; anything less and you are implying a sustain rather than having
one. A test asserts every score owns at least one voice that holds.

## The format

- **`instruments`**: named patches — `wave` (an oscillator, or `"noise"`),
  `volume`, `gate`, `attackMs`, `hold`, `detuneCents`, `vibrato`, `pan`,
  `echo`, `filter` (with a `to` for a sweep), `color` (noise tilt), `drive`
  (waveshaper grit) and `slide` (end-pitch multiplier). Drums are instruments
  too: `slide: 0.2` on a filtered triangle is a kick; noise + highpass 8000 is
  a hat; noise + bandpass 1700 is a snare; a driven sawtooth is a guitar.
- **`patterns`**: named sections; each maps a voice to bars of 16 tokens,
  written with `bars()` one bar per line (`=` ties, `.` rests, any other word
  triggers a noise voice — and ONLY a noise voice: the kick is a pitched
  triangle, so its line is written in notes, which is why `kit.ts`'s
  `KICK_*` lines say `C2` where the `SNARE_*` and `HAT_*` lines say `x`). A short voice line CYCLES inside the pattern — write
  a one-bar drum loop under an eight-bar lead — so its length must divide the
  pattern's. A voice a pattern omits is silent through it. **An empty array is
  not how you silence a voice**: a zero-length line has no length to divide the
  pattern's, and the flatten throws.
- **`order`**: pattern names in play order; the whole list loops.

**Flats do not exist.** The token is `[A-G]#?<octave>`, so E♭ is `D#` and B♭ is
`A#`. A `Db4` throws the first time that bar plays.

**Write the chord plan ONCE.** Both shipped scores keep their voicings in
`Record<string, string>` tables and build the pad, the bass and the arpeggio
from one plan array. Retyping a progression per voice is exactly how a chord
comes to be changed in two voices out of three.

## How long

**Write to the length of the thing it plays under**, and that is three answers:

| Score             | Loop             | Why                                                                                                        |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| The menu          | **~2 minutes**   | Roughly how long a player spends choosing a car and a stage.                                               |
| A stage           | **~90 seconds**  | A stage lasts minutes, so the player hears it round two or three times; it has to have a real break in it. |
| The endless stage | **~130 seconds** | Nothing to build toward and a player settling in — the one loop that can afford an eight-bar horizon.      |

`tests/audio_test.ts` holds every score between 70 and 150 s, requires at
least four patterns and an order longer than the pattern list — so something
repeats — and refuses two sections of one score with the same voices, bar
count and density, which is a section written twice. Settle the length by
adding or removing an entry from `order`: the tempo is a decision about the
piece, the order is arithmetic.

## Composition guidance

Lean on the progressions game scores have always run on — i–VI–III–VII for
drive, i–VI–iv–V for a lament, a relative-major lift for a chorus, a
harmonic-minor dominant for a lurch — but **write original melodies**. Nothing
sampled, nothing transcribed.

**Keep music well under the sound effects.** Lead ~0.028, bass ~0.05, pads
~0.011 each, hats ~0.009. A test caps every instrument at 0.06. The score plays
continuously under an ENGINE; it is the bed, not the event.

**A stage theme has to share a spectrum with a car.** The engine bed owns
everything below ~250 Hz and the 2–5 kHz grit of gravel, so a stage score puts
its weight in the mid and keeps its bass short and plucked rather than
sustained — a sustained bass under a sustained engine is two things holding the
same note and neither of them being heard.

**The character of a track is two or three DECISIONS, not the tune.** A mode
that refuses to settle, one interval used as a signature, a rhythmic figure
that never stops, a section where everything drops away. Write them down in the
file's header comment, because that is what the next person will check the
music against — both shipped scores do.

## Where a track gets NAMED

`TrackId` in `pwa/src/game/audio/music-pick.ts`, with a loader beside it in
`music.ts`. Then:

| Who        | How                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| The menu   | `armMenuMusic()` from `App.tsx` when a menu page is up                                                              |
| A stage    | `playMusic(stageTrack(state))` — `App.tsx` asks `music-pick.ts` as the stage is applied, and again on every restart |
| The finish | `stopMusic()` — the sting lands in quiet, and the menu re-arms its own theme                                        |

`trackFor` decides in this order: the SHAPE of the road (a circuit, an
endless stage), then the COUNTRY (the desert has one score whatever the sky
does), then the taiga's sky (rain or storm, then dusk/night/dawn, then the
clear-day anthem). A new score is a new file, a new `TrackId`, a loader, a
rung in `trackFor`, a row in the audition page's `SCORE_FILES`, and a row in
`docs/audio.md`'s table. Nothing else: the loader's `import()` gives it its
own chunk, so a score is never on the startup path.

## The loop

```sh
make audition            # previews/audition.html — both scores, per-voice mutes
npx vitest run tests/audio_test.ts
```

1. **Write it** as `pwa/src/game/audio/scores/<id>.ts`.
2. **`make audition` and LISTEN.** Read the seconds-per-loop it prints and
   check it against the bound for this score's role.
3. **Mute the voices one at a time.** This is the step that replaces reading a
   spectrum analyser, and it is the only way to answer the questions that
   actually decide whether a score works: is the pad a bed or a pulse? is the
   lead audible over the guitars? is the bass doing anything the kick is not?
4. **Play the scores back to back.** Whether the clear taiga, the wet taiga,
   the night and the desert sound like four PLACES rather than four tempos is
   the question a single track cannot answer, and it is the one a soundtrack
   lives or dies on. The header comment's three decisions are what should
   separate them; if two scores' decisions read alike, they will sound alike.
5. **Then hear it under the game** (`npm run dev`), with the engine running.
   Half of a stage theme's job is to survive that.
6. **Fix the worst ONE thing** and go round again. A score changed in six
   places at once cannot be judged, because you no longer know which change
   did what.

**The audition page is part of the deliverable.** Publish it and put the link
in the PR body; a soundtrack PR whose reviewer would have to check out the
branch and run a dev server to hear the thing being reviewed is a PR nobody
hears.

## What to listen for

| Fault                                       | What it sounds like                                                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **A pad that is really a pluck**            | The bed pumps at the bar line and is gone before the next one. Give the voice a `hold`.                                             |
| **A melody that wobbles instead of moving** | The lead never leaves a two-note band. Range is not contour: a line can span an octave and a half and still not GO anywhere.        |
| **A line that never breathes**              | No rest anywhere. A phrase needs somewhere to end or it cannot be a hook — and this one is heard on every launch of the game.       |
| **Two voices in one octave**                | They mask each other whatever the volumes say. Mute one and hear the other appear.                                                  |
| **A section that is not a section**         | Two patterns that sound the same. If `a` and `b` are one passing note apart, a fifty-six-bar loop has eight bars of material in it. |
| **A loop with no arc**                      | Nothing gets thinner or busier anywhere. A break should be audibly emptier and a build audibly climbing.                            |
| **A kit nobody wrote**                      | The same one-bar loop under everything, all track. Fine as a bed; fatal if it is the only rhythm.                                   |

## When a track is allowed to START

A browser will not make a sound before the player has touched something, and
the menu theme is the one piece of music that wants to begin before they have.
`armMenuMusic()` claims the arrangement immediately (the sequencer tolerates a
silent clock — it ticks, finds none, nudges and waits), starts it with no
gesture where the platform permits that, and otherwise arms the first touch or
key ANYWHERE. So the theme belongs to the menu OPENING rather than to whichever
row the player happens to press first. The rule underneath it is shared with
the effects and written down once, in **`sound-effects`**.

## Skill self-improvement

Load **`skill-reflection`** before this session commits: record what the pass
learned, fix anything here that turned out WRONG, delete what went stale, and
promote anything true in every run into this file.

```sh
node scripts/skill-lessons.mjs soundtrack --list
```
