// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SHORT CIRCUIT — the score for a circuit stage, whatever the country.
//
// G minor at 150 bpm: 56 bars, ninety seconds. A circuit is laps of one loop
// and the player will be round it three times before the finish, so the
// piece turns over fast, hooks early and never sits: a two-bar riff on a
// square lead is the whole verse, and the chorus is the same energy with a
// tune on top.
//
// THREE DECISIONS:
//
//   1. THE HOOK IS TWO BARS LONG, and it comes first. An arcade racer's
//      attract loop, not an album track: the riff is heard inside the
//      first four seconds and it is back every eight bars.
//   2. THE CROWD IS NOT ON THE PLAYER'S SIDE. This is the coldest fast score
//      in the game — G minor, a dull lead, a dull arpeggio, and the i–VI–iv–V
//      lament taken at speed. A circuit is the one stage with people all the
//      way round it, and the piece treats them as something to get away
//      from: nothing here is allowed to sound like a cheer.
//   3. THE BUILD IS A DIMINISHED CHORD. The climb sits two bars on an A
//      diminished — root, minor third, flat fifth, a triad with no home in
//      it — before the iv and the V hand the chorus back. It is the one
//      place in the loop where the harmony stops being merely sad, and it
//      is the piece's signature.
//
// The drop is still a half-time drop rather than a cold one: the lap board
// is counting whatever the music thinks. The melodies are original.

import { bars, type Track } from "../../../lib/tracker.ts";

import {
  arp,
  arp16,
  bass,
  bounce,
  brass,
  eighths,
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
  pad,
  push,
  snare,
  SNARE_24,
  SNARE_FILL,
  SNARE_HALF,
  stab,
  straight,
  voice,
  type Triad,
} from "./kit.ts";

// The chord plan. Flats have no token, so B♭ is written `A#` and E♭ is `D#`;
// `Adim` is the build's diminished triad — A, C, E♭ — and is a chord NAME,
// not a key signature.
const PAD_LOW: Record<string, string> = {
  Gm: "G3",
  Eb: "G3",
  Cm: "G3",
  D: "F#3",
  Adim: "A3",
  Bb: "F3",
};
const PAD_TOP: Record<string, string> = {
  Gm: "D4",
  Eb: "D#4",
  Cm: "D#4",
  D: "D4",
  Adim: "D#4",
  Bb: "D4",
};
const BASS_LO: Record<string, string> = {
  Gm: "G2",
  Eb: "D#2",
  Cm: "C2",
  D: "D2",
  Adim: "A2",
  Bb: "A#2",
};
const BASS_HI: Record<string, string> = {
  Gm: "G3",
  Eb: "D#3",
  Cm: "C3",
  D: "D3",
  Adim: "A3",
  Bb: "A#3",
};
const STAB: Record<string, string> = {
  Gm: "A#4",
  Eb: "A#4",
  Cm: "C5",
  D: "A4",
  Adim: "C5",
  Bb: "A#4",
};
const ARP: Record<string, Triad> = {
  Gm: ["G4", "A#4", "D5"],
  Eb: ["D#4", "G4", "A#4"],
  Cm: ["C4", "D#4", "G4"],
  D: ["D4", "F#4", "A4"],
  Adim: ["A4", "C5", "D#5"],
  Bb: ["A#4", "D5", "F5"],
};

const OPENING = ["Gm", "Gm", "Cm", "D"];
const VERSE = ["Gm", "Gm", "Eb", "Eb", "Cm", "Cm", "D", "D"];
const CHORUS = ["Cm", "D", "Gm", "Eb", "Cm", "D", "Gm", "Gm"];
const DROP = ["Eb", "Eb", "Bb", "Bb", "Cm", "Cm", "D", "D"];
const CLIMB = ["Adim", "Adim", "Cm", "Cm", "D", "D", "D", "D"];
const CADENCE = ["Cm", "D", "Gm", "Gm"];

/** THE HOOK: two bars, diatonic, sits over every chord of the verse. */
const HOOK = [
  "G4 .  A#4 .  D5 =  .  .  A#4 .  G4 .  A4 =  =  =",
  "A#4 .  D5 .  G5 =  .  .  D5 .  A#4 .  A4 =  =  =",
];

type Parts = {
  bass: (lo: string, hi: string) => string;
  arp?: (tones: Triad) => string;
  stabs?: boolean;
};

function bed(plan: string[], parts: Parts): Record<string, string[]> {
  const out: Record<string, string[]> = {
    padLow: bars(...plan.map((c) => hold(voice(PAD_LOW, c)))),
    padTop: bars(...plan.map((c) => hold(voice(PAD_TOP, c)))),
    bass: bars(...plan.map((c) => parts.bass(voice(BASS_LO, c), voice(BASS_HI, c)))),
  };
  if (parts.arp) {
    const figure = parts.arp;
    out.arp = bars(...plan.map((c) => figure(ARP[c] as Triad)));
  }
  if (parts.stabs) out.brass = bars(...plan.map((c) => stab(voice(STAB, c))));
  return out;
}

export const CIRCUIT_TRACK: Track = {
  bpm: 150,
  stepsPerBeat: 4,
  instruments: {
    padLow: pad(0.01, 800, -0.3, { open: 1.6, attackMs: 200 }),
    padTop: pad(0.009, 1050, 0.3, { open: 1.6, attackMs: 200 }),
    bass: bass(0.05, 480),
    brass: brass(0.018, 0.2, 1500),
    // The riff and the tune share one square, so the chorus is the verse's
    // own voice finally saying something. Filtered well down from where an
    // arcade lead sits: the hollowness has to read as cold, not as chrome.
    lead: lead(0.028, "square", 2100, { echo: 0.28 }),
    arp: arp(0.012, -0.4, 1600),
    kick: kick(0.058),
    snare: snare(0.03, 1900),
    hat: hat(0.009, 0.3),
  },

  patterns: {
    // The hook, straight away, over the pad and a kick.
    intro: {
      ...bed(OPENING, { bass: eighths }),
      lead: bars(...HOOK, ...HOOK),
      kick: bars(KICK_HALF),
      hat: bars(HAT_8),
    },

    // The verse: the hook four times, the bounce, the stabs, the kit.
    a: {
      ...bed(VERSE, { bass: bounce, stabs: true }),
      lead: bars(...HOOK),
      kick: bars(KICK_ROCK),
      snare: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The chorus: the tune, the sixteenth arpeggio, four on the floor.
    b: {
      ...bed(CHORUS, { bass: push, arp: arp16 }),
      lead: bars(
        "D#5 =  =  =  G5 =  =  =  D5 =  =  =  =  =  =  =",
        "F#5 =  =  =  A5 =  =  =  D5 =  =  =  =  =  =  =",
        "G5 =  =  =  A#5 =  =  =  D5 =  =  =  A#4 =  =  =",
        "D#5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "C5 =  =  =  D#5 =  =  =  G5 =  =  =  D#5 =  =  =",
        "D5 =  =  =  F#5 =  =  =  A5 =  =  =  F#5 =  =  =",
        "G5 =  =  =  =  =  =  =  D5 =  =  =  A#4 =  =  =",
        "G4 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      kick: bars(KICK_FOUR),
      snare: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The drop: half-time, the riff gone, the bass carrying the tune an
    // octave and a half down, the arpeggio in eighths.
    c: {
      padLow: bars(...DROP.map((c) => hold(voice(PAD_LOW, c)))),
      padTop: bars(...DROP.map((c) => hold(voice(PAD_TOP, c)))),
      bass: bars(
        "D#2 .  .  .  G2 .  .  .  A#2 =  =  =  .  .  .  .",
        "D#2 .  .  .  G2 .  .  .  A2 =  =  =  .  .  .  .",
        "A#2 .  .  .  D3 .  .  .  F3 =  =  =  .  .  .  .",
        "A#2 .  .  .  D3 .  .  .  A2 =  =  =  .  .  .  .",
        "C2 .  .  .  D#2 .  .  .  G2 =  =  =  .  .  .  .",
        "C2 .  .  .  D#2 .  .  .  A2 =  =  =  .  .  .  .",
        "D2 .  .  .  F#2 .  .  .  A2 =  =  =  .  .  .  .",
        "D2 .  .  .  A2 .  .  .  D3 =  =  =  =  =  =  =",
      ),
      arp: bars(...DROP.map((c) => arp16(ARP[c] as Triad))),
      kick: bars(KICK_HALF),
      snare: bars(SNARE_HALF),
      hat: bars(HAT_OFF),
    },

    // The build: two bars on the diminished, octaves, sixteenth hats, the
    // stabs back, the fill.
    d: {
      ...bed(CLIMB, { bass: straight, arp: arp16, stabs: true }),
      kick: bars(KICK_ROCK),
      snare: bars(
        SNARE_24,
        SNARE_24,
        SNARE_24,
        SNARE_FILL,
        SNARE_24,
        SNARE_24,
        SNARE_FILL,
        SNARE_FILL,
      ),
      hat: bars(HAT_16),
    },

    outro: {
      ...bed(CADENCE, { bass: eighths, stabs: true }),
      lead: bars(...HOOK, ...HOOK),
      kick: bars(KICK_ROCK),
      snare: bars(SNARE_24),
      hat: bars(HAT_8),
    },
  },

  order: ["intro", "a", "b", "a", "c", "d", "b", "outro"],
};
