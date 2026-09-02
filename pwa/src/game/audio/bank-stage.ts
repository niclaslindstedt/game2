// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STAGE'S SOUND BANK — what the road, the people on it and the sky over
// it do. The lights, the line, the split boards, the crowd, the anti-cut
// blocks, the marker posts and the thunder. Served with the car's own bank
// as `RUN_BANK` (`bank.ts`).
//
// THE REGISTER IS A TIMING DEVICE ON A POLE IN A FOREST. Nothing here is a
// musical note dressed as a sound: the lights are a relay, the split is a
// beam being broken, the finish is the one moment in the run allowed to be
// brass — and even that is cut short so the results land in quiet.

import type { SoundBank } from "./types.ts";

export const STAGE_BANK: SoundBank = {
  // ── The start of it ──────────────────────────────────────────────────────
  countdown_tick: {
    description:
      "One of the lights before the off. A dry mid tone with a contact click " +
      "on it — a timing device on a pole in a forest, not a musical note. " +
      "Deliberately plain so that GO can be the same sound transformed.",
    voices: [
      {
        call: "tone",
        type: "square",
        from: 660,
        durationMs: 130,
        volume: 0.03,
        holdMs: 70,
        filter: { type: "lowpass", frequency: 2200 },
      },
      {
        call: "noise",
        durationMs: 20,
        volume: 0.018,
        filter: { type: "bandpass", frequency: 3000, q: 3 },
      },
    ],
  },

  race_go: {
    description:
      "Lights out. The countdown tick an octave up, held twice as long and " +
      "opened out with a resonant sweep and a send into the echo — the same " +
      "device saying the opposite thing. Nothing celebratory: the celebration " +
      "is at the finish, this is permission.",
    voices: [
      {
        call: "tone",
        type: "square",
        from: 990,
        durationMs: 420,
        volume: 0.042,
        holdMs: 260,
        detuneCents: 7,
        echo: 0.28,
        filter: { type: "lowpass", frequency: 1400, to: 4000 },
      },
      {
        call: "noise",
        durationMs: 30,
        volume: 0.026,
        filter: { type: "bandpass", frequency: 3400, q: 3 },
      },
      { call: "tone", type: "sine", from: 165, to: 110, durationMs: 300, volume: 0.03 },
    ],
  },

  // ── The clock ────────────────────────────────────────────────────────────
  checkpoint: {
    description:
      "R28 — through a split board. A beam being broken: one short high " +
      "sine blip and a second a fourth up, dry, with the faintest contact " +
      "click, the way a timing gate sounds when the car goes through it. " +
      "Quiet and quick, because a board arriving on the HUD is the news and " +
      "this only says WHEN.",
    voices: [
      {
        call: "noise",
        durationMs: 14,
        volume: 0.014,
        filter: { type: "bandpass", frequency: 3000, q: 3 },
      },
      { call: "tone", type: "sine", from: 1320, durationMs: 70, volume: 0.024, holdMs: 30 },
      {
        call: "tone",
        type: "sine",
        from: 1760,
        durationMs: 110,
        volume: 0.022,
        delayMs: 80,
        holdMs: 50,
        echo: 0.15,
      },
    ],
  },

  lap: {
    description:
      "Across the line with laps still to run. The finish's brass stab on its " +
      "own, a fifth lower and half as long, with no swell of crowd under it — " +
      "the same voice saying 'again' instead of 'done', so the finish still " +
      "arrives as something the lap board was only counting toward.",
    voices: [
      {
        call: "tone",
        type: "sawtooth",
        from: 262,
        to: 392,
        durationMs: 220,
        volume: 0.03,
        attackMs: 10,
        holdMs: 110,
        detuneCents: 8,
        drive: 0.3,
        echo: 0.18,
        filter: { type: "lowpass", frequency: 2400 },
      },
      {
        call: "noise",
        durationMs: 90,
        volume: 0.016,
        color: "pink",
        attackMs: 8,
        filter: { type: "bandpass", frequency: 1600, q: 1.2 },
      },
    ],
  },

  missed: {
    description:
      "R28 — over the line with a split board still owed, and the line does " +
      "nothing. The finish's brass stab inverted: two notes FALLING, flat and " +
      "close together, dry, with no crowd behind them and no echo to arrive " +
      "in. It has to read as the opposite of `finish` at the exact moment the " +
      "player expected `finish`, which is why it is the same voice and not a " +
      "buzzer — a buzzer is a menu saying no, and this is the stage saying it " +
      "is not over.",
    voices: [
      {
        call: "tone",
        type: "sawtooth",
        from: 330,
        durationMs: 200,
        volume: 0.034,
        attackMs: 10,
        holdMs: 110,
        detuneCents: 14,
        drive: 0.4,
        filter: { type: "lowpass", frequency: 1800 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 233,
        durationMs: 420,
        volume: 0.038,
        delayMs: 170,
        attackMs: 12,
        holdMs: 180,
        detuneCents: 16,
        drive: 0.4,
        filter: { type: "lowpass", frequency: 1500 },
      },
      {
        call: "noise",
        durationMs: 120,
        volume: 0.014,
        color: "brown",
        delayMs: 170,
        filter: { type: "bandpass", frequency: 420, q: 1.1 },
      },
    ],
  },

  finish: {
    description:
      "Through the flying finish. A rising two-note brass stab over a swell of " +
      "pink air — the noise of arriving somewhere with people at it — cut off " +
      "clean rather than allowed to ring, so the results screen lands in quiet.",
    voices: [
      {
        call: "noise",
        durationMs: 900,
        volume: 0.03,
        color: "pink",
        attackMs: 260,
        holdMs: 220,
        filter: { type: "bandpass", frequency: 700, to: 1800, q: 0.9 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 392,
        durationMs: 260,
        volume: 0.036,
        attackMs: 14,
        holdMs: 130,
        detuneCents: 10,
        drive: 0.4,
        echo: 0.24,
        filter: { type: "lowpass", frequency: 2600 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 587,
        durationMs: 620,
        volume: 0.04,
        delayMs: 230,
        attackMs: 16,
        holdMs: 300,
        detuneCents: 12,
        drive: 0.38,
        echo: 0.36,
        filter: { type: "lowpass", frequency: 3000 },
      },
      {
        call: "tone",
        type: "sine",
        from: 98,
        durationMs: 700,
        volume: 0.038,
        delayMs: 230,
        holdMs: 340,
      },
    ],
  },

  // ── The people ───────────────────────────────────────────────────────────
  cheer: {
    description:
      "Going past a stand of spectators. A CROWD has no transient and no pitch " +
      "— it is a band of noise with voices somewhere in it. So: pink air " +
      "swelling and falling through a wide, resonant bandpass around the " +
      "vowel region, which is what turns hiss into people; a second, brighter " +
      "band a beat later for the ones further down the line; and two " +
      "barely-pitched sawtooth swells under it, detuned hard against each " +
      "other, which is a hundred throats never quite agreeing on a note. " +
      "Nothing percussive — a cheer ARRIVES, so every layer fades in and the " +
      "car goes past before it has finished. Quiet: this fires at every " +
      "stand on the stage, and a crowd louder than the engine is a crowd " +
      "standing inside the car.",
    voices: [
      {
        call: "noise",
        durationMs: 1500,
        volume: 0.026,
        color: "pink",
        attackMs: 420,
        holdMs: 330,
        echo: 0.2,
        filter: { type: "bandpass", frequency: 620, to: 1250, q: 0.75 },
      },
      {
        call: "noise",
        durationMs: 1150,
        volume: 0.016,
        color: "pink",
        delayMs: 260,
        attackMs: 340,
        holdMs: 220,
        filter: { type: "bandpass", frequency: 1800, to: 2500, q: 1.1 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 196,
        to: 233,
        durationMs: 1250,
        volume: 0.012,
        attackMs: 460,
        holdMs: 320,
        detuneCents: 38,
        vibrato: { rateHz: 4.4, depthCents: 55, delayMs: 200 },
        filter: { type: "lowpass", frequency: 1100, to: 1900 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 294,
        to: 262,
        durationMs: 1050,
        volume: 0.009,
        delayMs: 180,
        attackMs: 400,
        holdMs: 240,
        detuneCents: 46,
        vibrato: { rateHz: 5.1, depthCents: 62, delayMs: 160 },
        filter: { type: "lowpass", frequency: 1500 },
      },
    ],
  },

  // ── The furniture ────────────────────────────────────────────────────────
  kerb_block: {
    description:
      "R26 — riding over an anti-cut block on the inside of a corner. Concrete " +
      "under a tyre, felt through the floor rather than heard through the " +
      "panels: a short dry knock with the whole weight of the car behind it, a " +
      "low thump as the suspension takes the drop off the far side, and no " +
      "brightness at all. It must NOT sound like an impact — nothing broke, " +
      "and a player who hears a crash here will stop cutting the apex " +
      "altogether instead of learning what it costs.",
    voices: [
      {
        call: "noise",
        durationMs: 55,
        volume: 0.05,
        color: "brown",
        filter: { type: "bandpass", frequency: 260, q: 1.4 },
      },
      {
        call: "noise",
        durationMs: 190,
        volume: 0.038,
        color: "brown",
        delayMs: 25,
        filter: { type: "lowpass", frequency: 700, to: 160 },
      },
      { call: "tone", type: "sine", from: 96, to: 44, durationMs: 220, volume: 0.045 },
      {
        call: "tone",
        type: "triangle",
        from: 190,
        to: 118,
        durationMs: 120,
        volume: 0.02,
        drive: 0.4,
        filter: { type: "lowpass", frequency: 900 },
      },
    ],
  },

  knock: {
    description:
      "Something light going over: a marshal's cone, a marker post out of the " +
      "verge. Hollow plastic struck once and then gone — a short mid knock with " +
      "a bit of a rattle behind it as the thing lands. Deliberately small: at " +
      "pace through a run of posts this fires several times a second, and " +
      "anything with weight in it would read as the car breaking.",
    voices: [
      {
        call: "noise",
        durationMs: 40,
        volume: 0.03,
        filter: { type: "bandpass", frequency: 900, to: 520, q: 2.2 },
      },
      { call: "tone", type: "triangle", from: 320, to: 190, durationMs: 90, volume: 0.022 },
      {
        call: "noise",
        durationMs: 150,
        volume: 0.012,
        delayMs: 60,
        filter: { type: "bandpass", frequency: 1900, q: 1.6 },
        echo: 0.12,
      },
    ],
  },

  // ── The sky ──────────────────────────────────────────────────────────────
  // Thunder is the one sound in the bank with a JOURNEY behind it. Air
  // absorbs high frequencies far faster than low ones and the ground and
  // the hills scatter what is left, so what a strike sounds like is almost
  // entirely a question of how far away it happened — which is why there
  // are two of these rather than one with a volume knob.

  thunder_near: {
    description:
      "A strike close enough to be frightening. The rip of the channel itself " +
      "first — broadband, no body, the sound of air being torn — then the " +
      "crack of it collapsing back in, a sub that drops away underneath, and " +
      "only then the roll, arriving late off the hills. Near the crash in " +
      "size, because a bolt inside a kilometre IS the loudest thing on the " +
      "stage and a polite one is worse than none.",
    voices: [
      {
        call: "noise",
        durationMs: 90,
        volume: 0.055,
        color: "white",
        filter: { type: "highpass", frequency: 1800, to: 500 },
      },
      {
        call: "noise",
        durationMs: 700,
        volume: 0.08,
        color: "brown",
        attackMs: 4,
        holdMs: 60,
        echo: 0.3,
        filter: { type: "lowpass", frequency: 1600, to: 200 },
      },
      {
        call: "tone",
        type: "sine",
        from: 62,
        to: 27,
        durationMs: 900,
        volume: 0.06,
        attackMs: 8,
        holdMs: 120,
      },
      {
        call: "noise",
        durationMs: 2800,
        volume: 0.055,
        color: "brown",
        delayMs: 180,
        attackMs: 220,
        holdMs: 500,
        echo: 0.55,
        filter: { type: "lowpass", frequency: 260, to: 80 },
      },
      {
        call: "noise",
        durationMs: 1800,
        volume: 0.03,
        color: "brown",
        delayMs: 900,
        attackMs: 400,
        holdMs: 300,
        echo: 0.6,
        filter: { type: "lowpass", frequency: 170, to: 65 },
      },
    ],
  },

  thunder_far: {
    description:
      "A strike out in the weather somewhere. NO transient at all — the crack " +
      "has been smeared into a swell by kilometres of air, and an attack on " +
      "this is the tell that turns distant thunder into a nearby drum. Two " +
      "brown swells, the second arriving off the hills behind the first, over " +
      "a sub that never quite resolves into a note.",
    voices: [
      {
        call: "noise",
        durationMs: 3400,
        volume: 0.05,
        color: "brown",
        attackMs: 700,
        holdMs: 700,
        echo: 0.6,
        filter: { type: "lowpass", frequency: 220, to: 70 },
      },
      {
        call: "noise",
        durationMs: 2400,
        volume: 0.03,
        color: "brown",
        delayMs: 800,
        attackMs: 500,
        holdMs: 400,
        echo: 0.55,
        filter: { type: "lowpass", frequency: 150, to: 60 },
      },
      {
        call: "tone",
        type: "sine",
        from: 44,
        to: 26,
        durationMs: 2600,
        volume: 0.028,
        attackMs: 500,
        holdMs: 600,
      },
    ],
  },
};
