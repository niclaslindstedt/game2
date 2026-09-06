// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WORLD'S OWN SOUNDS — everything on a stage that is not the car.
//
// A rally stage is a road through somebody else's country, and the country
// was making noise before the car arrived: birds in the spruce, cicadas on
// a bajada, choughs round a col, an owl at dusk, cows behind a fence and
// cowbells on an alm, a train on the line through the crossing. None of it
// is a `GameEvent`; the engine has no idea
// a raven exists. These are CUES the ambience scheduler (`ambience.ts`)
// raises off the state — where the car is, what country it is in, what time
// it is — and they are all QUIET, because the one thing a world must never
// do is compete with the drift.
//
// THE PALETTE FOR AN ANIMAL is a pitched voice with a GESTURE on it. A bird
// is a sine gliding fast; a cow is a driven sawtooth swelling and falling
// through a vowel-shaped bandpass; an insect is a tone with a tremor. Nothing
// here is a recording and nothing is trying to be one — the register is the
// same PSX one the car lives in, where a sound is a shape the ear accepts
// rather than a sample it recognises.

import type { SoundBank } from "./types.ts";

export const WORLD_BANK: SoundBank = {
  // ── Birds ───────────────────────────────────────────────────────────────
  bird_chirp: {
    description:
      "A small bird in the spruce — a chaffinch, a tit, whichever. Two quick " +
      "sine chips a fifth apart, each gliding UP, dry and high and over in a " +
      "quarter of a second. The most-raised sound in the world bank, so it is " +
      "the quietest thing in it.",
    voices: [
      {
        call: "tone",
        type: "sine",
        from: 3100,
        to: 3900,
        durationMs: 70,
        volume: 0.012,
        attackMs: 8,
      },
      {
        call: "tone",
        type: "sine",
        from: 4200,
        to: 4900,
        durationMs: 90,
        volume: 0.011,
        delayMs: 130,
        attackMs: 8,
      },
    ],
  },

  bird_trill: {
    description:
      "A longer song from further off: a sine with a fast wide vibrato held " +
      "for most of a second and swelling in, then a falling tail, sent into " +
      "the echo so it reads as coming from the trees rather than the dash.",
    voices: [
      {
        call: "tone",
        type: "sine",
        from: 2600,
        to: 2900,
        durationMs: 700,
        volume: 0.011,
        attackMs: 120,
        holdMs: 300,
        echo: 0.4,
        vibrato: { rateHz: 11, depthCents: 260, delayMs: 60 },
      },
      {
        call: "tone",
        type: "sine",
        from: 3300,
        to: 2200,
        durationMs: 260,
        volume: 0.009,
        delayMs: 720,
        attackMs: 10,
        echo: 0.4,
      },
    ],
  },

  raven: {
    description:
      "A raven going over — the one bird every country has. A driven " +
      "sawtooth croak low in the register with a hard vowel on it: a bandpass " +
      "around 900 Hz opening and shutting across a quarter of a second, " +
      "twice, the second one lower. Rough, dry, and a little too loud for " +
      "comfort, which is what a raven is.",
    voices: [
      {
        call: "tone",
        type: "sawtooth",
        from: 210,
        to: 170,
        durationMs: 240,
        volume: 0.016,
        attackMs: 20,
        holdMs: 90,
        drive: 0.6,
        detuneCents: 30,
        filter: { type: "bandpass", frequency: 700, to: 1100, q: 2.2 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 190,
        to: 150,
        durationMs: 280,
        volume: 0.014,
        delayMs: 380,
        attackMs: 20,
        holdMs: 100,
        drive: 0.6,
        detuneCents: 30,
        filter: { type: "bandpass", frequency: 640, to: 980, q: 2.2 },
      },
    ],
  },

  // The two on PASSAGE — the sound a skein makes going over, which is the
  // one bird sound that arrives from the sky rather than from the trees
  // (`skein.ts` draws them). Both are CROWDS: a single call is a car horn,
  // and what a person on the ground actually hears is several birds
  // answering each other across a hundred metres of air, which is why each
  // of these is four staggered voices spread across the stereo field.
  goose_honk: {
    description:
      "A skein of geese going over. Four nasal AHNKs, staggered over a " +
      "second and a bit and spread wide: a driven sawtooth in the low " +
      "hundreds falling a tone through a hard bandpass vowel around 1.1 " +
      "kHz, each one cracking open in a few milliseconds and gone in a " +
      "sixth of a second. Reedy and a little ugly, which is what a goose " +
      "is; only a touch of echo, because there is nothing up there to come " +
      "off.",
    voices: [
      {
        call: "tone",
        type: "sawtooth",
        from: 640,
        to: 520,
        durationMs: 150,
        volume: 0.012,
        attackMs: 8,
        holdMs: 45,
        drive: 0.5,
        detuneCents: 22,
        pan: -0.35,
        echo: 0.15,
        filter: { type: "bandpass", frequency: 900, to: 1250, q: 3 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 560,
        to: 460,
        durationMs: 165,
        volume: 0.011,
        delayMs: 230,
        attackMs: 8,
        holdMs: 50,
        drive: 0.5,
        detuneCents: 22,
        pan: 0.28,
        echo: 0.15,
        filter: { type: "bandpass", frequency: 840, to: 1150, q: 3 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 720,
        to: 590,
        durationMs: 130,
        volume: 0.01,
        delayMs: 480,
        attackMs: 7,
        holdMs: 40,
        drive: 0.5,
        detuneCents: 22,
        pan: -0.12,
        echo: 0.15,
        filter: { type: "bandpass", frequency: 980, to: 1350, q: 3 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 600,
        to: 500,
        durationMs: 170,
        volume: 0.01,
        delayMs: 760,
        attackMs: 8,
        holdMs: 55,
        drive: 0.5,
        detuneCents: 22,
        pan: 0.42,
        echo: 0.15,
        filter: { type: "bandpass", frequency: 880, to: 1200, q: 3 },
      },
    ],
  },

  swan_call: {
    description:
      "Whooper swans. The other half of the same sky and deliberately the " +
      "opposite of the geese: BUGLING rather than honking — a longer, " +
      "purer, almost brass note that swells UP a third and then settles, " +
      "twice, and is answered from the far side of the skein a beat later. " +
      "Lower, cleaner, and deep in the echo, because a swan is heard across " +
      "a valley long before anything is visible.",
    voices: [
      {
        call: "tone",
        type: "sawtooth",
        from: 470,
        to: 620,
        durationMs: 230,
        volume: 0.013,
        attackMs: 30,
        holdMs: 90,
        drive: 0.28,
        detuneCents: 12,
        pan: -0.22,
        echo: 0.45,
        filter: { type: "bandpass", frequency: 900, to: 1400, q: 2.4 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 620,
        to: 540,
        durationMs: 280,
        volume: 0.012,
        delayMs: 280,
        attackMs: 26,
        holdMs: 110,
        drive: 0.28,
        detuneCents: 12,
        pan: -0.22,
        echo: 0.45,
        filter: { type: "bandpass", frequency: 860, to: 1250, q: 2.4 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 420,
        to: 560,
        durationMs: 250,
        volume: 0.01,
        delayMs: 660,
        attackMs: 34,
        holdMs: 95,
        drive: 0.28,
        detuneCents: 12,
        pan: 0.34,
        echo: 0.45,
        filter: { type: "bandpass", frequency: 820, to: 1300, q: 2.4 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 560,
        to: 490,
        durationMs: 300,
        volume: 0.009,
        delayMs: 930,
        attackMs: 30,
        holdMs: 120,
        drive: 0.28,
        detuneCents: 12,
        pan: 0.34,
        echo: 0.45,
        filter: { type: "bandpass", frequency: 780, to: 1150, q: 2.4 },
      },
    ],
  },

  owl: {
    description:
      "An owl, at dusk and after. Two soft hoots on a filtered triangle — a " +
      "long one and a short one a tone down — each swelling in and out with " +
      "no edge anywhere, deep in the echo. Nothing above 600 Hz.",
    voices: [
      {
        call: "tone",
        type: "triangle",
        from: 330,
        to: 310,
        durationMs: 520,
        volume: 0.017,
        attackMs: 90,
        holdMs: 200,
        echo: 0.5,
        filter: { type: "lowpass", frequency: 600 },
      },
      {
        call: "tone",
        type: "triangle",
        from: 300,
        to: 280,
        durationMs: 380,
        volume: 0.014,
        delayMs: 700,
        attackMs: 80,
        holdMs: 120,
        echo: 0.5,
        filter: { type: "lowpass", frequency: 560 },
      },
    ],
  },

  chough: {
    description:
      "A flock of alpine choughs wheeling round the rock. Each call is a " +
      "CHEE-AH: a sine that flicks up a fourth and then falls away over a " +
      "quarter of a second with a fast tremor on the fall — and there are " +
      "three of them, staggered and spread across the stage, because a " +
      "chough is never alone. Deep in the echo: the call is heard off the " +
      "faces as much as from the birds.",
    voices: [
      {
        call: "tone",
        type: "sine",
        from: 2300,
        to: 3100,
        durationMs: 80,
        volume: 0.011,
        attackMs: 8,
        pan: -0.4,
        echo: 0.45,
      },
      {
        call: "tone",
        type: "sine",
        from: 3000,
        to: 1900,
        durationMs: 220,
        volume: 0.011,
        delayMs: 80,
        attackMs: 6,
        pan: -0.4,
        echo: 0.45,
        vibrato: { rateHz: 24, depthCents: 80 },
      },
      {
        call: "tone",
        type: "sine",
        from: 2500,
        to: 3300,
        durationMs: 80,
        volume: 0.01,
        delayMs: 260,
        attackMs: 8,
        pan: 0.3,
        echo: 0.45,
      },
      {
        call: "tone",
        type: "sine",
        from: 3200,
        to: 2000,
        durationMs: 240,
        volume: 0.01,
        delayMs: 340,
        attackMs: 6,
        pan: 0.3,
        echo: 0.45,
        vibrato: { rateHz: 22, depthCents: 80 },
      },
      {
        call: "tone",
        type: "sine",
        from: 2100,
        to: 2900,
        durationMs: 80,
        volume: 0.009,
        delayMs: 470,
        attackMs: 8,
        pan: 0.05,
        echo: 0.45,
      },
      {
        call: "tone",
        type: "sine",
        from: 2800,
        to: 1750,
        durationMs: 260,
        volume: 0.009,
        delayMs: 550,
        attackMs: 6,
        pan: 0.05,
        echo: 0.45,
        vibrato: { rateHz: 26, depthCents: 80 },
      },
    ],
  },

  marmot: {
    description:
      "A marmot's alarm whistle from the scree above the road — one sharp " +
      "note, high and clean, a sine with a hard onset held for a quarter of " +
      "a second and cut off, and a shorter one a shade lower as the answer " +
      "from up the slope. Rare, piercing, and the loudest thing the mountain " +
      "ever says.",
    voices: [
      {
        call: "tone",
        type: "sine",
        from: 2700,
        to: 2550,
        durationMs: 420,
        volume: 0.017,
        attackMs: 8,
        holdMs: 250,
        pan: 0.45,
        echo: 0.55,
      },
      {
        call: "tone",
        type: "sine",
        from: 2550,
        to: 2400,
        durationMs: 300,
        volume: 0.013,
        delayMs: 900,
        attackMs: 8,
        holdMs: 160,
        pan: 0.6,
        echo: 0.55,
      },
    ],
  },

  // ── Insects ─────────────────────────────────────────────────────────────
  cicada: {
    description:
      "A cicada on a hot bajada. A high square with a fast, deep vibrato — " +
      "which on a square reads as the rattle of the thing rather than as a " +
      "singer — swelling over most of a second and dying away, banded hard " +
      "around 4 kHz so it is a buzz and not a note.",
    voices: [
      {
        call: "tone",
        type: "square",
        from: 3800,
        to: 4100,
        durationMs: 1400,
        volume: 0.008,
        attackMs: 300,
        holdMs: 600,
        vibrato: { rateHz: 28, depthCents: 90 },
        filter: { type: "bandpass", frequency: 4000, q: 3 },
      },
    ],
  },

  cricket: {
    description:
      "A cricket after dark. Three short high chirps, each a sine with a " +
      "tremor on it, spaced like a pulse. The desert's night is made of these.",
    voices: [
      {
        call: "tone",
        type: "sine",
        from: 4400,
        durationMs: 90,
        volume: 0.009,
        attackMs: 10,
        vibrato: { rateHz: 40, depthCents: 60 },
      },
      {
        call: "tone",
        type: "sine",
        from: 4400,
        durationMs: 90,
        volume: 0.009,
        delayMs: 170,
        attackMs: 10,
        vibrato: { rateHz: 40, depthCents: 60 },
      },
      {
        call: "tone",
        type: "sine",
        from: 4400,
        durationMs: 90,
        volume: 0.009,
        delayMs: 340,
        attackMs: 10,
        vibrato: { rateHz: 40, depthCents: 60 },
      },
    ],
  },

  coyote: {
    description:
      "A coyote somewhere out on the flats at night: a thin sawtooth howl " +
      "rising through an octave, wavering, and breaking into two short yips " +
      "on the way down. Far away — heavy echo, no bottom end.",
    voices: [
      {
        call: "tone",
        type: "sawtooth",
        from: 520,
        to: 980,
        durationMs: 1100,
        volume: 0.011,
        attackMs: 220,
        holdMs: 400,
        echo: 0.6,
        vibrato: { rateHz: 5, depthCents: 45, delayMs: 300 },
        filter: { type: "bandpass", frequency: 1400, to: 2000, q: 1.6 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 900,
        to: 700,
        durationMs: 140,
        volume: 0.01,
        delayMs: 1250,
        attackMs: 12,
        echo: 0.6,
        filter: { type: "bandpass", frequency: 1600, q: 1.6 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 860,
        to: 640,
        durationMs: 160,
        volume: 0.009,
        delayMs: 1460,
        attackMs: 12,
        echo: 0.6,
        filter: { type: "bandpass", frequency: 1500, q: 1.6 },
      },
    ],
  },

  // ── Livestock ───────────────────────────────────────────────────────────
  cow: {
    description:
      "A cow in a paddock beside the road. A driven sawtooth low in the " +
      "register, swelling over a third of a second and sagging a tone as it " +
      "lets go, through a vowel-shaped bandpass that opens from OO to AH — " +
      "which is the whole of a moo. Big and slow and unhurried.",
    voices: [
      {
        call: "tone",
        type: "sawtooth",
        from: 150,
        to: 128,
        durationMs: 1100,
        volume: 0.02,
        attackMs: 280,
        holdMs: 350,
        drive: 0.45,
        detuneCents: 12,
        echo: 0.25,
        filter: { type: "bandpass", frequency: 380, to: 760, q: 1.6 },
      },
      {
        call: "noise",
        durationMs: 600,
        volume: 0.006,
        color: "brown",
        attackMs: 250,
        holdMs: 150,
        filter: { type: "bandpass", frequency: 500, q: 1.2 },
      },
    ],
  },

  sheep: {
    description:
      "A sheep. The cow's recipe an octave and a half up, twice as fast, with " +
      "a tremor on it: a bleat is a vibrato, and the vowel opens from EH to " +
      "AH. Thin, a little comic, and gone in half a second.",
    voices: [
      {
        call: "tone",
        type: "sawtooth",
        from: 440,
        to: 380,
        durationMs: 520,
        volume: 0.014,
        attackMs: 60,
        holdMs: 200,
        drive: 0.4,
        detuneCents: 16,
        echo: 0.2,
        vibrato: { rateHz: 9, depthCents: 70 },
        filter: { type: "bandpass", frequency: 1200, to: 1700, q: 2 },
      },
    ],
  },

  cowbell: {
    description:
      "Cowbells on the alm below the road — a cluster of them, far off, on " +
      "cattle that are grazing rather than walking. Each bell is a square " +
      "struck once through a narrow bandpass low in the register, with a " +
      "detuned pair for the beat between a bell's partials, DULL on purpose " +
      "(an alpine bell is a folded sheet, not a cast one) and deep in the " +
      "echo for the valley. Five strikes at four pitches, unevenly spaced, " +
      "which is the whole rhythm of a herd.",
    voices: [
      {
        call: "tone",
        type: "square",
        from: 540,
        durationMs: 260,
        volume: 0.012,
        attackMs: 3,
        holdMs: 30,
        detuneCents: 22,
        drive: 0.3,
        pan: -0.5,
        echo: 0.55,
        filter: { type: "bandpass", frequency: 900, q: 2.4 },
      },
      {
        call: "tone",
        type: "square",
        from: 610,
        durationMs: 240,
        volume: 0.011,
        delayMs: 190,
        attackMs: 3,
        holdMs: 30,
        detuneCents: 22,
        drive: 0.3,
        pan: -0.3,
        echo: 0.55,
        filter: { type: "bandpass", frequency: 980, q: 2.4 },
      },
      {
        call: "tone",
        type: "square",
        from: 720,
        durationMs: 220,
        volume: 0.01,
        delayMs: 330,
        attackMs: 3,
        holdMs: 30,
        detuneCents: 22,
        drive: 0.3,
        pan: -0.6,
        echo: 0.55,
        filter: { type: "bandpass", frequency: 1100, q: 2.4 },
      },
      {
        call: "tone",
        type: "square",
        from: 660,
        durationMs: 240,
        volume: 0.01,
        delayMs: 620,
        attackMs: 3,
        holdMs: 30,
        detuneCents: 22,
        drive: 0.3,
        pan: -0.4,
        echo: 0.55,
        filter: { type: "bandpass", frequency: 1040, q: 2.4 },
      },
      {
        call: "tone",
        type: "square",
        from: 540,
        durationMs: 260,
        volume: 0.011,
        delayMs: 810,
        attackMs: 3,
        holdMs: 30,
        detuneCents: 22,
        drive: 0.3,
        pan: -0.5,
        echo: 0.55,
        filter: { type: "bandpass", frequency: 900, q: 2.4 },
      },
    ],
  },

  // ── Water ───────────────────────────────────────────────────────────────
  meltwater: {
    description:
      "Meltwater running beside the road — a stream over stones, heard for " +
      "a few seconds as the car comes past it. Pink noise swelling in over " +
      "half a second and holding through a bright bandpass that wanders " +
      "upward, with a thinner white trickle over the top. Water has no " +
      "transient, and nothing here has one.",
    voices: [
      {
        call: "noise",
        color: "pink",
        durationMs: 2800,
        volume: 0.011,
        attackMs: 600,
        holdMs: 1400,
        filter: { type: "bandpass", frequency: 1600, to: 2300, q: 1.1 },
      },
      {
        call: "noise",
        color: "white",
        durationMs: 2400,
        volume: 0.005,
        delayMs: 200,
        attackMs: 500,
        holdMs: 1200,
        filter: { type: "highpass", frequency: 3600 },
      },
    ],
  },

  // ── The railway ─────────────────────────────────────────────────────────
  train_horn: {
    description:
      "A diesel's horn from down the line — two notes a minor third apart " +
      "sounding together, the classic chord, on driven sawtooths held for a " +
      "second and a half and sent hard into the echo. Muffled the way a " +
      "horn across a valley is: nothing over 2 kHz.",
    voices: [
      {
        call: "tone",
        type: "sawtooth",
        from: 311,
        durationMs: 1500,
        volume: 0.024,
        attackMs: 60,
        holdMs: 1100,
        drive: 0.4,
        detuneCents: 8,
        echo: 0.5,
        filter: { type: "lowpass", frequency: 1800 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 370,
        durationMs: 1500,
        volume: 0.022,
        attackMs: 60,
        holdMs: 1100,
        drive: 0.4,
        detuneCents: 8,
        echo: 0.5,
        filter: { type: "lowpass", frequency: 1800 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 311,
        durationMs: 700,
        volume: 0.02,
        delayMs: 1750,
        attackMs: 50,
        holdMs: 400,
        drive: 0.4,
        detuneCents: 8,
        echo: 0.5,
        filter: { type: "lowpass", frequency: 1800 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 370,
        durationMs: 700,
        volume: 0.018,
        delayMs: 1750,
        attackMs: 50,
        holdMs: 400,
        drive: 0.4,
        detuneCents: 8,
        echo: 0.5,
        filter: { type: "lowpass", frequency: 1800 },
      },
    ],
  },

  crossing_bell: {
    description:
      "The bell on a level crossing with a train on the line: one strike of " +
      "a bright metal bell — a sine and its inharmonic partner a tritone up, " +
      "with a contact click — raised twice a second by the scheduler while " +
      "the car is close. Piercing on purpose; a warning has to be.",
    voices: [
      {
        call: "noise",
        durationMs: 12,
        volume: 0.02,
        filter: { type: "bandpass", frequency: 3200, q: 3 },
      },
      { call: "tone", type: "sine", from: 1880, durationMs: 420, volume: 0.02, echo: 0.2 },
      { call: "tone", type: "sine", from: 2660, durationMs: 260, volume: 0.011, echo: 0.2 },
    ],
  },

  // ── The start control ───────────────────────────────────────────────────
  marshal_whistle: {
    description:
      "A marshal's whistle in the start control, once, as the car pulls up " +
      "to the line. A pea whistle: a square with a very fast wide tremor " +
      "banded around 2.4 kHz, swelling over a tenth and cut short. Off to " +
      "one side, and only ever heard in the intro.",
    voices: [
      {
        call: "tone",
        type: "square",
        from: 2350,
        to: 2450,
        durationMs: 480,
        volume: 0.016,
        attackMs: 40,
        holdMs: 320,
        pan: -0.5,
        echo: 0.3,
        vibrato: { rateHz: 22, depthCents: 120 },
        filter: { type: "bandpass", frequency: 2400, q: 2.5 },
      },
    ],
  },
};
