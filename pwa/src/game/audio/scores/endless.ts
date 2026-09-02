// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LONG HAUL — the score for an endless stage.
//
// C minor at 132 bpm: 72 bars, a hundred and thirty seconds — the longest
// loop in the game, because an endless stage has no finish to build toward
// and a player on one is settling in. The piece is a cruise with a drop in
// it: a groove that takes its time to arrive, a chorus that lifts to the
// relative major, and a long empty middle.
//
// THREE DECISIONS:
//
//   1. THE INTRO IS EIGHT BARS AND MOSTLY EMPTY. A pad, a bass on the root,
//      a kick every other bar. The groove is earned, not given, and on a
//      loop this long the first bars can afford to be the horizon.
//   2. THE CHORUS IS IN E♭. The verse and the lead are in C minor; the
//      chorus goes to the relative major and gets the brightest pad and
//      the highest lead of the piece, then comes home. It is the one
//      section that plays once per loop, which is what makes it a chorus.
//   3. THE DROP IS THE PAD, THE BELL AND NOTHING ELSE for eight bars, over
//      the iv — the darkest chord in the plan — and then the dominant. It
//      is where the loop breathes, and it is longer than a stage theme
//      would allow because there is no finish this has to hurry toward.
//
// The melodies are original.

import { bars, type Track } from "../../../lib/tracker.ts";

import {
  arp,
  arp8,
  bass,
  bell,
  brass,
  clap,
  hat,
  HAT_8,
  HAT_16,
  HAT_OFF,
  hold,
  kick,
  KICK_FOUR,
  KICK_HALF,
  KICK_ROCK,
  lead,
  octaves,
  pad,
  push,
  roll16,
  SNARE_24,
  SNARE_FILL,
  SNARE_HALF,
  swell,
  voice,
  type Triad,
} from "./kit.ts";

const PAD_LOW: Record<string, string> = {
  Cm: "G3",
  Ab: "G#3",
  Eb: "G3",
  Bb: "F3",
  Fm: "G#3",
  G: "G3",
};
const PAD_MID: Record<string, string> = {
  Cm: "C4",
  Ab: "C4",
  Eb: "A#3",
  Bb: "A#3",
  Fm: "C4",
  G: "B3",
};
const PAD_TOP: Record<string, string> = {
  Cm: "D#4",
  Ab: "D#4",
  Eb: "D#4",
  Bb: "D4",
  Fm: "F4",
  G: "D4",
};
const BASS_LO: Record<string, string> = {
  Cm: "C2",
  Ab: "G#2",
  Eb: "D#2",
  Bb: "A#2",
  Fm: "F2",
  G: "G2",
};
const BASS_HI: Record<string, string> = {
  Cm: "C3",
  Ab: "G#3",
  Eb: "D#3",
  Bb: "A#3",
  Fm: "F3",
  G: "G3",
};
const STAB: Record<string, string> = {
  Cm: "G4",
  Ab: "G#4",
  Eb: "G4",
  Bb: "F4",
  Fm: "G#4",
  G: "G4",
};
const ARP: Record<string, Triad> = {
  Cm: ["C4", "D#4", "G4"],
  Ab: ["C4", "D#4", "G#4"],
  Eb: ["A#3", "D#4", "G4"],
  Bb: ["A#3", "D4", "F4"],
  Fm: ["C4", "F4", "G#4"],
  G: ["B3", "D4", "G4"],
};

const OPENING = ["Cm", "Cm", "Cm", "Cm", "Ab", "Ab", "Bb", "Bb"];
const VERSE = ["Cm", "Cm", "Ab", "Ab", "Eb", "Eb", "Bb", "Bb"];
const LEAD = ["Ab", "Bb", "Cm", "Cm", "Ab", "Bb", "Eb", "Eb"];
const DROP = ["Fm", "Fm", "Cm", "Cm", "Ab", "Ab", "G", "G"];
const CLIMB = ["Ab", "Ab", "Bb", "Bb", "Cm", "Cm", "G", "G"];
const CHORUS = ["Eb", "Bb", "Cm", "Ab", "Eb", "Bb", "Cm", "Cm"];
const CADENCE = ["Ab", "Ab", "Bb", "Bb", "Cm", "Cm", "Cm", "Cm"];

type Parts = {
  bass: (lo: string, hi: string) => string;
  arp?: (tones: Triad) => string;
  brass?: (note: string) => string;
};

function bed(plan: string[], parts: Parts): Record<string, string[]> {
  const out: Record<string, string[]> = {
    padLow: bars(...plan.map((c) => hold(voice(PAD_LOW, c)))),
    padMid: bars(...plan.map((c) => hold(voice(PAD_MID, c)))),
    padTop: bars(...plan.map((c) => hold(voice(PAD_TOP, c)))),
    bass: bars(...plan.map((c) => parts.bass(voice(BASS_LO, c), voice(BASS_HI, c)))),
  };
  if (parts.arp) {
    const figure = parts.arp;
    out.arp = bars(...plan.map((c) => figure(ARP[c] as Triad)));
  }
  if (parts.brass) {
    const figure = parts.brass;
    out.brass = bars(...plan.map((c) => figure(voice(STAB, c))));
  }
  return out;
}

/** A bass held for the bar. */
const held = (lo: string): string => hold(lo);

export const ENDLESS_TRACK: Track = {
  bpm: 132,
  stepsPerBeat: 4,
  instruments: {
    padLow: pad(0.011, 700, -0.35, { open: 1.6, attackMs: 340, echo: 0.28 }),
    padMid: pad(0.01, 900, 0.35, { open: 1.6, attackMs: 340, echo: 0.28 }),
    padTop: pad(0.009, 1200, 0, { open: 1.7, attackMs: 380, echo: 0.32 }),
    bass: bass(0.05, 440, { hold: 0.35, gate: 0.55 }),
    brass: brass(0.017, -0.2, 1800),
    lead: lead(0.028, "sawtooth", 2400, { echo: 0.36, detune: 9, vibrato: 16 }),
    arp: arp(0.011, 0.4, 1900),
    bell: bell(0.015, -0.35),
    kick: kick(0.056, 220),
    clap: clap(0.024),
    hat: hat(0.008, 0.25),
  },

  patterns: {
    // The horizon: pads, a held bass, a kick every other bar.
    intro: {
      ...bed(OPENING, { bass: held }),
      kick: bars(
        KICK_HALF,
        KICK_HALF,
        KICK_HALF,
        KICK_HALF,
        KICK_HALF,
        KICK_HALF,
        KICK_ROCK,
        KICK_ROCK,
      ),
      hat: bars(HAT_OFF, HAT_OFF, HAT_OFF, HAT_OFF, HAT_OFF, HAT_OFF, HAT_8, HAT_8),
    },

    // The groove: the octave bass, the eighth arpeggio, the kit.
    a: {
      ...bed(VERSE, { bass: octaves, arp: arp8 }),
      kick: bars(KICK_ROCK),
      clap: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The lead, over a plan that stays in the minor.
    b: {
      ...bed(LEAD, { bass: push, arp: arp8 }),
      lead: bars(
        "G4 =  =  =  C5 =  =  =  D#5 =  =  =  C5 =  =  =",
        "D5 =  =  =  =  =  =  =  F5 =  =  =  D5 =  =  =",
        "G5 =  =  =  D#5 =  =  =  C5 =  =  =  =  =  =  =",
        "G4 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "C5 =  =  =  D#5 =  =  =  G#5 =  =  =  G5 =  =  =",
        "F5 =  =  =  D5 =  =  =  A#4 =  =  =  D5 =  =  =",
        "D#5 =  =  =  G5 =  =  =  A#5 =  =  =  =  =  =  =",
        "G5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      kick: bars(KICK_ROCK),
      clap: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The drop: the pads, a held bass, the bell.
    c: {
      padLow: bars(...DROP.map((c) => hold(voice(PAD_LOW, c)))),
      padMid: bars(...DROP.map((c) => hold(voice(PAD_MID, c)))),
      padTop: bars(...DROP.map((c) => hold(voice(PAD_TOP, c)))),
      bass: bars(...DROP.map((c) => hold(voice(BASS_LO, c)))),
      bell: bars(
        "C5 =  =  =  =  =  =  =  F5 =  =  =  =  =  =  =",
        ".  .  .  .  G#4 =  =  =  =  =  =  =  .  .  .  .",
        "G4 =  =  =  =  =  =  =  C5 =  =  =  =  =  =  =",
        ".  .  .  .  .  .  .  .  D#5 =  =  =  =  =  =  =",
        "C5 =  =  =  =  =  =  =  G#4 =  =  =  =  =  =  =",
        ".  .  .  .  D#5 =  =  =  =  =  =  =  .  .  .  .",
        "B4 =  =  =  =  =  =  =  D5 =  =  =  =  =  =  =",
        "G5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
    },

    // The build: the rolling arpeggio, the hats to sixteenths, the brass
    // swelling under the last four bars, the fill into the chorus.
    d: {
      ...bed(CLIMB, { bass: octaves, arp: roll16, brass: swell }),
      kick: bars(
        KICK_HALF,
        KICK_HALF,
        KICK_ROCK,
        KICK_ROCK,
        KICK_FOUR,
        KICK_FOUR,
        KICK_FOUR,
        KICK_FOUR,
      ),
      clap: bars(
        SNARE_HALF,
        SNARE_HALF,
        SNARE_24,
        SNARE_24,
        SNARE_24,
        SNARE_24,
        SNARE_FILL,
        SNARE_FILL,
      ),
      hat: bars(HAT_8, HAT_8, HAT_8, HAT_8, HAT_16, HAT_16, HAT_16, HAT_16),
    },

    // The chorus: the relative major, the brass wall, the high lead.
    e: {
      ...bed(CHORUS, { bass: push, arp: roll16, brass: swell }),
      lead: bars(
        "A#5 =  =  =  G5 =  =  =  D#5 =  =  =  G5 =  =  =",
        "F5 =  =  =  D5 =  =  =  A#4 =  =  =  D5 =  =  =",
        "D#5 =  =  =  G5 =  =  =  C6 =  =  =  =  =  =  =",
        "G#5 =  =  =  =  =  =  =  G5 =  =  =  D#5 =  =  =",
        "A#5 =  =  =  G5 =  =  =  D#5 =  =  =  A#4 =  =  =",
        "D5 =  =  =  F5 =  =  =  A#5 =  =  =  =  =  =  =",
        "G5 =  =  =  =  =  =  =  D#5 =  =  =  C5 =  =  =",
        "G4 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      kick: bars(KICK_FOUR),
      clap: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // Home: the cadence with the kit thinning back out to the horizon.
    outro: {
      ...bed(CADENCE, { bass: octaves, arp: arp8 }),
      kick: bars(
        KICK_ROCK,
        KICK_ROCK,
        KICK_ROCK,
        KICK_ROCK,
        KICK_HALF,
        KICK_HALF,
        KICK_HALF,
        KICK_HALF,
      ),
      clap: bars(
        SNARE_24,
        SNARE_24,
        SNARE_24,
        SNARE_24,
        SNARE_HALF,
        SNARE_HALF,
        SNARE_HALF,
        SNARE_HALF,
      ),
      hat: bars(HAT_8, HAT_8, HAT_8, HAT_8, HAT_OFF, HAT_OFF, HAT_OFF, HAT_OFF),
    },
  },

  order: ["intro", "a", "b", "a", "c", "d", "e", "b", "outro"],
};
