// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TAIGA, FLAT OUT — the stage theme for a clear day in the forest.
//
// E minor at 150 bpm: 56 bars, ninety seconds. A stage lasts minutes, so
// this is a BED the player will hear loop two or three times — which is why
// it has a real break in it rather than being one riff at one intensity for
// the whole length.
//
// THREE DECISIONS:
//
//   1. IT PLAYS UNDER AN ENGINE, so it lives in the bands the engine does not.
//      The car's own noise owns everything below about 250 Hz and the 2–5 kHz
//      grit of gravel; the score therefore puts its weight in the mid —
//      driven sawtooth chords around 150–600 Hz — and keeps the bass short
//      and plucked rather than sustained.
//   2. THE RIFF IS A GALLOP, NOT A TUNE. Long-short-short, the figure every
//      speed-metal record runs on, because what the player is doing while
//      this plays needs all of their attention: the verse hands them a pulse
//      to drive to and saves the melody for the chorus.
//   3. THE BREAK IS COLD. Eight bars where the kit stops, the guitars stop,
//      and a pad and a bell hold a B major over an E minor stage — the
//      harmonic-minor dominant, which is the one moment in the loop that
//      sounds like the forest rather than like the car.
//
// The harmony is the i–VI–III–VII that has driven game scores since they had
// three channels; the melodies are original.

import { bars, type Track } from "../../../lib/tracker.ts";

import {
  bass,
  bell,
  eighths,
  gallop,
  guitar,
  hat,
  HAT_8,
  HAT_16,
  hold,
  kick,
  KICK_FOUR,
  KICK_HALF,
  KICK_ROCK,
  lead,
  pad,
  snare,
  SNARE_24,
  SNARE_FILL,
  tom,
  voice,
} from "./kit.ts";

// Roots and fifths. A power chord is two voices, so the guitars are a pair:
// one on the root and one a fifth above, panned apart.
const ROOT: Record<string, string> = { Em: "E2", C: "C2", G: "G2", D: "D2", Am: "A2", B: "B2" };
const GTR_LO: Record<string, string> = { Em: "E3", C: "C3", G: "G3", D: "D3", Am: "A3", B: "B3" };
const GTR_HI: Record<string, string> = { Em: "B3", C: "G3", G: "D4", D: "A3", Am: "E4", B: "F#4" };
// The pad's top note is the third, which is the only voice that says whether
// a chord is major or minor — the guitars deliberately do not.
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

/** The rhythm section of a section, from its chord plan — written once so
 * the two guitars and the bass can never disagree about the harmony. */
function riff(plan: string[], shape: (note: string) => string): Record<string, string[]> {
  return {
    gtrLo: bars(...plan.map((c) => shape(voice(GTR_LO, c)))),
    gtrHi: bars(...plan.map((c) => shape(voice(GTR_HI, c)))),
    bass: bars(...plan.map((c) => eighths(voice(ROOT, c)))),
  };
}

export const TAIGA_TRACK: Track = {
  bpm: 150,
  stepsPerBeat: 4,
  instruments: {
    gtrLo: guitar(0.024, -0.4, 1500),
    gtrHi: guitar(0.02, 0.4, 1900),
    // Short and plucked ON PURPOSE (see decision 1).
    bass: bass(0.05, 380, { gate: 0.42 }),
    lead: lead(0.028, "sawtooth", 2600, { detune: 9 }),
    // The forest: a wide, dark, slow pad that only really shows in the break.
    pad: pad(0.011, 500, 0, { open: 2.2, attackMs: 300, echo: 0.35 }),
    bell: bell(0.017, -0.45),
    kick: kick(0.06),
    snare: snare(0.03),
    hat: hat(0.009, 0.3),
    tom: tom(0.038),
  },

  patterns: {
    // Four bars of the gallop with nothing over it: the loop's own count-in.
    intro: {
      ...riff(["Em", "Em", "C", "D"], gallop),
      kick: bars(KICK_HALF),
      hat: bars(HAT_8),
    },

    // The verse: the gallop, the kit, and no melody at all.
    a: {
      ...riff(DRIVE, gallop),
      pad: bars(...DRIVE.map((c) => hold(voice(PAD_TOP, c)))),
      kick: bars(KICK_ROCK),
      snare: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The chorus: the guitars stop galloping and OPEN OUT into held chords,
    // the kick goes to four on the floor, and the hook finally arrives.
    // Nothing gets louder — the change is entirely one of rhythm.
    b: {
      ...riff(CHORUS, hold),
      pad: bars(...CHORUS.map((c) => hold(voice(PAD_TOP, c)))),
      lead: bars(
        "E5 =  =  =  G5 =  =  =  E5 =  =  =  D5 =  =  =",
        "B4 =  =  =  =  =  =  =  D5 =  =  =  G5 =  =  =",
        "A5 =  =  =  F#5 =  =  =  A5 =  =  =  D5 =  =  =",
        "E5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "G5 =  =  =  E5 =  =  =  C5 =  =  =  E5 =  =  =",
        "D5 =  =  =  B4 =  =  =  D5 =  =  =  G5 =  =  =",
        "F#5 =  =  =  A5 =  =  =  D5 =  =  =  =  =  =  =",
        "B5 =  =  =  =  =  =  =  A5 =  =  =  F#5 =  =  =",
      ),
      kick: bars(KICK_FOUR),
      snare: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The cold eight: no kit, no guitars. A pad and a bell over a bass that
    // has stopped driving, ending on the B major that wants the riff back.
    c: {
      pad: bars(...COLD.map((c) => hold(voice(PAD_TOP, c)))),
      gtrLo: bars(...COLD.map((c) => hold(voice(GTR_LO, c)))),
      bass: bars(...COLD.map((c) => hold(voice(ROOT, c)))),
      bell: bars(
        "B4 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  =",
        ".  .  .  .  G5 =  =  =  =  =  =  =  .  .  .  .",
        "C5 =  =  =  =  =  =  =  A4 =  =  =  =  =  =  =",
        ".  .  .  .  .  .  .  .  E5 =  =  =  =  =  =  =",
        "G5 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  =",
        ".  .  .  .  C5 =  =  =  =  =  =  =  .  .  .  .",
        "D#5 =  =  =  =  =  =  =  F#5 =  =  =  =  =  =  =",
        "B5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
    },

    // The build: one chord for four bars, hats doubling to sixteenths and the
    // floor tom walking underneath.
    d: {
      ...riff(BUILD, gallop),
      kick: bars(KICK_ROCK),
      snare: bars(
        SNARE_24,
        SNARE_24,
        SNARE_24,
        SNARE_FILL,
        SNARE_24,
        SNARE_24,
        SNARE_24,
        SNARE_FILL,
      ),
      hat: bars(HAT_16),
      tom: bars(
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  G2 .  G2 .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "G2 .  .  .  G2 .  .  .  E2 .  E2 .  E2 .  E2 .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  C2 .  C2 .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "D2 .  .  .  D2 .  .  .  E2 .  E2 .  E2 .  E2 .",
      ),
    },

    // Four bars to hand the loop back to its own intro.
    outro: {
      ...riff(["C", "D", "Em", "Em"], gallop),
      kick: bars(KICK_HALF),
      snare: bars(SNARE_24),
      hat: bars(HAT_8),
    },
  },

  order: ["intro", "a", "b", "a", "c", "d", "b", "outro"],
};
