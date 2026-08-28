// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TAIGA, FLAT OUT — the stage theme, and the only music a run has.
//
// E minor at 150 bpm: 64 bars, a fraction over a hundred seconds. A stage
// lasts minutes, so this is a BED the player will hear loop two or three times
// — which is why it has a real break in it rather than being one riff at one
// intensity for the whole length.
//
// THREE DECISIONS:
//
//   1. IT PLAYS UNDER AN ENGINE, so it lives in the bands the engine does not.
//      The car's own noise owns everything below about 250 Hz (the bass bed)
//      and the 2–5 kHz grit of gravel; the score therefore puts its weight in
//      the mid — driven sawtooth chords around 150–600 Hz — and keeps the bass
//      short and plucked rather than sustained, so it articulates through the
//      engine instead of fighting it for the same floor.
//   2. THE RIFF IS A RHYTHM, NOT A TUNE. What the player is doing while this
//      plays needs all of their attention, so the verse hands them a pulse to
//      drive to and saves the melody for the chorus. A hook they have to
//      listen to is a hook competing with a corner.
//   3. THE BREAK IS COLD. Eight bars where the kit stops, the guitars stop,
//      and a pad and a bell hold a B major over an E minor stage — the
//      harmonic-minor dominant, which is the one moment in the loop that
//      sounds like the forest rather than like the car. It is also what makes
//      the return of the riff mean anything.
//
// The harmony is the i–VI–III–VII that has driven game scores since they had
// three channels; the melodies are original.

import { bars, type Track } from "../../../lib/tracker.ts";

/**
 * THE RIFF'S RHYTHM, one bar. Two stabs, a long one across the middle of the
 * bar, and a push into the next — the figure the whole verse is built on, and
 * the reason the verse needs no tune.
 */
const chug = (note: string): string =>
  `${note} =  .  .  ${note} =  .  .  ${note} =  =  =  .  .  ${note} =`;

/** One bar of a chord held the whole way through — the chorus's open voicing
 * and the break's pad. */
const hold = (note: string): string => `${note} ${"= ".repeat(15)}`;

/** One bar of driving eighths — the bass under everything. */
const eighths = (note: string): string =>
  `${note} .  ${note} .  ${note} .  ${note} .  ${note} .  ${note} .  ${note} .  ${note} .`;

// Roots and fifths. A power chord is two voices, so the guitars are a pair:
// one on the root and one a fifth above, panned apart. One driven sawtooth
// alone is a buzz; two a fifth apart is a rhythm section.
const ROOT: Record<string, string> = { Em: "E2", C: "C2", G: "G2", D: "D2", Am: "A2", B: "B2" };
const GTR_LO: Record<string, string> = { Em: "E3", C: "C3", G: "G3", D: "D3", Am: "A3", B: "B3" };
const GTR_HI: Record<string, string> = { Em: "B3", C: "G3", G: "D4", D: "A3", Am: "E4", B: "F#4" };
// The pad's top note is the third, which is the only voice that says whether a
// chord is major or minor — the guitars deliberately do not.
const PAD_TOP: Record<string, string> = {
  Em: "G4",
  C: "E4",
  G: "B3",
  D: "F#4",
  Am: "C4",
  B: "D#4",
};

const DRIVE = ["Em", "Em", "C", "C", "G", "G", "D", "D"];
const CHORUS = ["C", "G", "D", "Em", "C", "G", "D", "D"];
const COLD = ["Em", "Em", "Am", "Am", "C", "C", "B", "B"];
const BUILD = ["Em", "Em", "Em", "Em", "C", "C", "D", "D"];

/** The rhythm section of a section, from its chord plan — written once so the
 * two guitars, the bass and the pad can never disagree about the harmony. */
function riff(plan: string[], shape: (note: string) => string): Record<string, string[]> {
  return {
    gtrLo: bars(...plan.map((c) => shape(GTR_LO[c] as string))),
    gtrHi: bars(...plan.map((c) => shape(GTR_HI[c] as string))),
    bass: bars(...plan.map((c) => eighths(ROOT[c] as string))),
  };
}

export const TAIGA_TRACK: Track = {
  bpm: 150,
  stepsPerBeat: 4,
  instruments: {
    // The two halves of the power chord. Driven hard and filtered down, so
    // what comes out is a mid-range growl rather than a bright saw — the
    // frequencies the engine bed has left free.
    gtrLo: {
      wave: "sawtooth",
      volume: 0.024,
      gate: 0.92,
      hold: 0.55,
      attackMs: 6,
      detuneCents: 11,
      drive: 0.55,
      pan: -0.4,
      filter: { type: "lowpass", frequency: 1500, to: 900, q: 1.4 },
    },
    gtrHi: {
      wave: "sawtooth",
      volume: 0.02,
      gate: 0.92,
      hold: 0.55,
      attackMs: 6,
      detuneCents: 13,
      drive: 0.5,
      pan: 0.4,
      filter: { type: "lowpass", frequency: 1900, to: 1100, q: 1.3 },
    },
    // Short and plucked ON PURPOSE (see decision 1): a sustained bass under a
    // sustained engine is two things holding the same note and neither of them
    // being heard.
    bass: {
      wave: "triangle",
      volume: 0.05,
      gate: 0.42,
      hold: 0.25,
      drive: 0.35,
      filter: { type: "lowpass", frequency: 380 },
    },
    // The hook, and the only voice above 1 kHz with a pitch: a bright detuned
    // saw with a fast vibrato, sitting in the echo so it reads as distance
    // rather than as something in the car.
    lead: {
      wave: "sawtooth",
      volume: 0.028,
      gate: 0.95,
      hold: 0.5,
      attackMs: 20,
      detuneCents: 9,
      echo: 0.3,
      vibrato: { rateHz: 6, depthCents: 18, delayMs: 180 },
      filter: { type: "lowpass", frequency: 2600, to: 3600, q: 1.1 },
    },
    // The forest: a wide, dark, slow pad that only really shows in the break.
    pad: {
      wave: "sawtooth",
      volume: 0.011,
      gate: 1,
      hold: 0.9,
      attackMs: 300,
      detuneCents: 18,
      echo: 0.35,
      filter: { type: "lowpass", frequency: 500, to: 1100, q: 1 },
    },
    bell: {
      wave: "sine",
      volume: 0.017,
      gate: 0.7,
      hold: 0.35,
      attackMs: 10,
      pan: -0.45,
      echo: 0.55,
    },
    kick: {
      wave: "triangle",
      volume: 0.06,
      gate: 0.45,
      slide: 0.2,
      filter: { type: "lowpass", frequency: 240 },
    },
    snare: {
      wave: "noise",
      volume: 0.03,
      gate: 0.35,
      color: "pink",
      filter: { type: "bandpass", frequency: 1700, to: 1000, q: 0.9 },
    },
    hat: {
      wave: "noise",
      volume: 0.009,
      gate: 0.14,
      pan: 0.3,
      // 6500 rather than up at 8200, and the reason is the ROUTE rather than
      // the taste. iOS runs a hands-free Bluetooth session at 16 kHz, where
      // everything over 7200 Hz is held back off Nyquist (`safeCutoff`) — a
      // hat living entirely above 8 kHz is then a hat with almost nothing
      // left to pass. Down here it keeps about 4 dB more of itself on a
      // headset, and costs 0.4 dB of level on a normal 48 kHz context.
      filter: { type: "highpass", frequency: 6500 },
    },
    // One dry floor tom, for the build and nowhere else.
    tom: {
      wave: "triangle",
      volume: 0.038,
      gate: 0.4,
      slide: 0.55,
      drive: 0.3,
      filter: { type: "lowpass", frequency: 500 },
    },
  },

  patterns: {
    // Four bars of the riff with nothing over it: the loop's own count-in.
    intro: {
      ...riff(["Em", "Em", "C", "D"], chug),
      kick: bars("C2 .  .  .  .  .  .  .  C2 .  .  .  .  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // The verse: the riff, the kit, and no melody at all.
    a: {
      ...riff(DRIVE, chug),
      pad: bars(...DRIVE.map((c) => hold(PAD_TOP[c] as string))),
      kick: bars("C2 .  .  .  .  .  C2 .  C2 .  .  .  .  .  C2 ."),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // The chorus: the guitars stop chugging and OPEN OUT into held chords, the
    // kick goes to four on the floor, and the hook finally arrives. Nothing
    // gets louder — the change is entirely one of rhythm, which is what lets a
    // stage theme lift without shouting over the car.
    b: {
      ...riff(CHORUS, hold),
      pad: bars(...CHORUS.map((c) => hold(PAD_TOP[c] as string))),
      lead: bars(
        "G4 =  =  =  E4 =  =  =  G4 =  =  =  B4 =  =  =",
        "D5 =  =  =  =  =  =  =  B4 =  =  =  G4 =  =  =",
        "A4 =  =  =  F#4 =  =  =  A4 =  =  =  D5 =  =  =",
        "E5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "G4 =  =  =  E4 =  =  =  G4 =  =  =  C5 =  =  =",
        "B4 =  =  =  D5 =  =  =  B4 =  =  =  G4 =  =  =",
        "A4 =  =  =  B4 =  =  =  D5 =  =  =  =  =  =  =",
        "F#5 =  =  =  =  =  =  =  E5 =  =  =  D5 =  =  =",
      ),
      kick: bars("C2 .  .  .  C2 .  .  .  C2 .  .  .  C2 .  .  ."),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // The cold eight: no kit, no guitars. A pad and a bell over a bass that
    // has stopped driving, ending on the B major that wants the riff back.
    c: {
      pad: bars(...COLD.map((c) => hold(PAD_TOP[c] as string))),
      gtrLo: bars(...COLD.map((c) => hold(GTR_LO[c] as string))),
      bass: bars(...COLD.map((c) => hold(ROOT[c] as string))),
      bell: bars(
        "E5 =  =  =  =  =  =  =  B4 =  =  =  =  =  =  =",
        ".  .  .  .  .  .  .  .  G4 =  =  =  =  =  =  =",
        "A4 =  =  =  =  =  =  =  C5 =  =  =  =  =  =  =",
        ".  .  .  .  E5 =  =  =  .  .  .  .  .  .  .  .",
        "G4 =  =  =  =  =  =  =  E4 =  =  =  =  =  =  =",
        ".  .  .  .  .  .  .  .  G4 =  =  =  B4 =  =  =",
        "D#5 =  =  =  =  =  =  =  F#5 =  =  =  =  =  =  =",
        "B5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
    },

    // The build: one chord for four bars, hats doubling to sixteenths and the
    // floor tom walking underneath. The only place in the loop where anything
    // gets busier bar by bar.
    d: {
      ...riff(BUILD, chug),
      kick: bars("C2 .  .  .  .  .  C2 .  C2 .  .  .  .  .  C2 ."),
      snare: bars(
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  x  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  x  .  x  .  x  .  x  .",
      ),
      hat: bars("x  x  x  x  x  x  x  x  x  x  x  x  x  x  x  x"),
      tom: bars(
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  G2 .  G2 .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "G2 .  .  .  G2 .  .  .  E2 .  E2 .  E2 .  E2 .",
      ),
    },

    // Four bars to hand the loop back to its own intro.
    outro: {
      ...riff(["C", "D", "Em", "Em"], chug),
      kick: bars("C2 .  .  .  .  .  .  .  C2 .  .  .  .  .  .  ."),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },
  },

  order: ["intro", "a", "b", "a", "c", "d", "b", "outro"],
};
