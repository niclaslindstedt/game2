// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SERVICE PARK — the menu theme.
//
// D major at 128 bpm: 56 bars, a shade under two minutes, which is roughly
// how long a player spends picking a car and a stage before they press the
// thing that starts one.
//
// THREE DECISIONS, and they are what the next person retuning this should
// check their work against:
//
//   1. IT IS MAJOR AND IT STAYS THAT WAY. This is the front door of a rally
//      game, not a lament. The verse runs I–vi–IV–V, the chorus IV–V–vi–iii
//      into a IV–V–I, and the only shade anywhere is the break's eight bars
//      down on the relative minor — which exist so the last chorus has
//      something to arrive from.
//   2. THE HOOK IS THE BRASS, NOT THE TUNE. An arcade racer announces itself
//      with offbeat stabs, because the player is reading a car list while it
//      plays and will catch a rhythm without listening to it. So the stabs
//      never stop through the verse, and the lead sings over the chorus and
//      takes a breath every two bars.
//   3. THE PAD IS REAL. Three sawtooth voices hold the chord across whole
//      bars, which is the thing a chip sequencer cannot do. Under a track
//      this busy the held bed is the only reason the brass and the arpeggio
//      are not the entire mix.
//
// The harmony is the plainest happy cadence there is; the melodies are
// original.

import { bars, type Track } from "../../../lib/tracker.ts";

import {
  arp,
  arp8,
  arp16,
  bass,
  bell,
  bounce,
  brass,
  hat,
  HAT_8,
  HAT_16,
  hold,
  kick,
  KICK_FOUR,
  KICK_ROCK,
  lead,
  pad,
  push,
  quarters,
  snare,
  SNARE_24,
  SNARE_FILL,
  stab,
  straight,
  swell,
  tom,
  voice,
  type Triad,
} from "./kit.ts";

// THE CHORD PLAN, written once. Each voice reads its own note out of these
// tables, so a progression can never come to differ between the pad, the
// bass, the brass and the arpeggio. The pad voicings sit inside a fifth of
// each other and move by step: a bed that leaps an octave between bars stops
// being a bed.
const PAD_LOW: Record<string, string> = {
  D: "A3",
  Bm: "B3",
  G: "B3",
  A: "A3",
  Em: "B3",
  "F#m": "A3",
};
const PAD_MID: Record<string, string> = {
  D: "D4",
  Bm: "D4",
  G: "D4",
  A: "C#4",
  Em: "E4",
  "F#m": "C#4",
};
const PAD_TOP: Record<string, string> = {
  D: "F#4",
  Bm: "F#4",
  G: "G4",
  A: "E4",
  Em: "G4",
  "F#m": "F#4",
};
const BASS_LO: Record<string, string> = {
  D: "D2",
  Bm: "B2",
  G: "G2",
  A: "A2",
  Em: "E2",
  "F#m": "F#2",
};
const BASS_HI: Record<string, string> = {
  D: "D3",
  Bm: "B3",
  G: "G3",
  A: "A3",
  Em: "E3",
  "F#m": "F#3",
};
// The brass is a two-voice section — the fifth and the octave above it,
// which is an open shout rather than a chord. The third is left to the pad.
const STAB_LO: Record<string, string> = {
  D: "F#4",
  Bm: "F#4",
  G: "G4",
  A: "E4",
  Em: "G4",
  "F#m": "F#4",
};
const STAB_HI: Record<string, string> = {
  D: "A4",
  Bm: "B4",
  G: "B4",
  A: "A4",
  Em: "B4",
  "F#m": "A4",
};
// The arpeggio is voiced to stay inside one octave whatever the chord, so it
// glitters at a constant height instead of hopping about with the harmony.
const ARP: Record<string, Triad> = {
  D: ["D4", "F#4", "A4"],
  Bm: ["D4", "F#4", "B4"],
  G: ["D4", "G4", "B4"],
  A: ["C#4", "E4", "A4"],
  Em: ["E4", "G4", "B4"],
  "F#m": ["C#4", "F#4", "A4"],
};

type Parts = {
  bass?: (lo: string, hi: string) => string;
  arp?: (tones: Triad) => string;
  brass?: (note: string) => string;
};

/** A section's chord-driven voices, from one plan. The pad is always there —
 * it is the thing every section has in common. A part left out is simply
 * absent, which is how a voice is silenced. */
function bed(plan: string[], parts: Parts): Record<string, string[]> {
  const out: Record<string, string[]> = {
    padLow: bars(...plan.map((c) => hold(voice(PAD_LOW, c)))),
    padMid: bars(...plan.map((c) => hold(voice(PAD_MID, c)))),
    padTop: bars(...plan.map((c) => hold(voice(PAD_TOP, c)))),
  };
  if (parts.bass) {
    const figure = parts.bass;
    out.bass = bars(...plan.map((c) => figure(voice(BASS_LO, c), voice(BASS_HI, c))));
  }
  if (parts.arp) {
    const figure = parts.arp;
    out.arp = bars(...plan.map((c) => figure(ARP[c] as Triad)));
  }
  if (parts.brass) {
    const figure = parts.brass;
    out.brassLo = bars(...plan.map((c) => figure(voice(STAB_LO, c))));
    out.brassHi = bars(...plan.map((c) => figure(voice(STAB_HI, c))));
  }
  return out;
}

const OPENING = ["D", "D", "G", "A"];
const VERSE = ["D", "D", "Bm", "Bm", "G", "G", "A", "A"];
const CHORUS = ["G", "A", "Bm", "F#m", "G", "A", "D", "D"];
const BREAK = ["Bm", "Bm", "G", "G", "Em", "Em", "A", "A"];
const CLIMB = ["Em", "Em", "G", "G", "A", "A", "A", "A"];
const CADENCE = ["G", "A", "D", "D"];

export const MENU_TRACK: Track = {
  bpm: 128,
  stepsPerBeat: 4,
  instruments: {
    // The bed: three voices spread across the picture, filtered brighter
    // than a mood pad would be. Dark is a decision this track does not make.
    padLow: pad(0.011, 900, -0.35),
    padMid: pad(0.01, 1100, 0.32),
    padTop: pad(0.009, 1300, 0),
    bass: bass(0.05, 520),
    brassLo: brass(0.019, -0.28, 1700),
    brassHi: brass(0.017, 0.3, 2000),
    // The tune: a square, because the square's hollow odd harmonics are the
    // sound of every arcade lead ever written.
    lead: lead(0.028, "square", 2400),
    arp: arp(0.012, 0.42),
    // The bell owns the two sections with no drums in them — the opening
    // and the break — so its arrival is always the sound of the track
    // thinning out.
    bell: bell(0.016, -0.4),
    kick: kick(0.055),
    snare: snare(0.028),
    hat: hat(0.009, 0.3),
    tom: tom(0.036),
  },

  patterns: {
    // Four bars of the pad and a bell before anything drives.
    intro: {
      ...bed(OPENING, { bass: quarters }),
      bell: bars(
        "F#5 =  =  =  =  =  =  =  A5 =  =  =  =  =  =  =",
        ".  .  .  .  D5 =  =  =  =  =  =  =  .  .  .  .",
        "G5 =  =  =  =  =  =  =  B5 =  =  =  =  =  =  =",
        "A5 =  =  =  =  =  =  =  =  =  =  =  C#5 =  =  =",
      ),
    },

    // The verse: the stabs, the bounce, the glitter, and no tune at all.
    a: {
      ...bed(VERSE, { bass: bounce, arp: arp8, brass: stab }),
      kick: bars(KICK_ROCK),
      snare: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The chorus: the brass opens into a wall, the kick goes four to the
    // floor, the glitter doubles, and the tune arrives.
    b: {
      ...bed(CHORUS, { bass: push, arp: arp16, brass: swell }),
      lead: bars(
        "B4 =  =  =  D5 =  =  =  G4 =  =  =  A4 =  =  =",
        "A4 =  =  =  =  =  =  =  C#5 =  =  =  E5 =  =  =",
        "D5 =  =  =  F#5 =  =  =  D5 =  =  =  B4 =  =  =",
        "C#5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "B4 =  =  =  D5 =  =  =  G5 =  =  =  F#5 =  =  =",
        "E5 =  =  =  =  =  =  =  C#5 =  =  =  A4 =  =  =",
        "B4 =  =  =  D5 =  =  =  F#5 =  =  =  =  =  =  =",
        "A5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      kick: bars(KICK_FOUR),
      snare: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The break: down on the relative minor with the drums gone, the bass
    // walking in quarters, and the bell answering the pad.
    c: {
      ...bed(BREAK, { bass: quarters }),
      bell: bars(
        "D5 =  =  =  =  =  =  =  F#5 =  =  =  =  =  =  =",
        ".  .  .  .  B4 =  =  =  =  =  =  =  .  .  .  .",
        "G5 =  =  =  =  =  =  =  =  =  =  =  D5 =  =  =",
        ".  .  .  .  .  .  .  .  B4 =  =  =  =  =  =  =",
        "E5 =  =  =  =  =  =  =  G5 =  =  =  =  =  =  =",
        ".  .  .  .  B5 =  =  =  =  =  =  =  .  .  .  .",
        "A5 =  =  =  =  =  =  =  C#5 =  =  =  =  =  =  =",
        "E5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
    },

    // The build: octaves four to the bar, sixteenth hats, the tom walking
    // in, and a snare that fills the last bar — the only place in the loop
    // where anything gets busier bar by bar.
    d: {
      ...bed(CLIMB, { bass: straight, arp: arp16, brass: stab }),
      kick: bars(KICK_ROCK),
      snare: bars(SNARE_24, SNARE_24, SNARE_24, SNARE_24, SNARE_24, SNARE_24, SNARE_24, SNARE_FILL),
      hat: bars(HAT_16),
      tom: bars(
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  A2 .  A2 .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  G2 .  G2 .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  E2 .  E2 .  E2 .  E2 .",
        "A2 .  .  .  A2 .  .  .  G2 .  G2 .  E2 .  E2 .",
      ),
    },

    // Four bars back to the top: the cadence with the bell over it.
    outro: {
      ...bed(CADENCE, { bass: quarters, brass: stab }),
      bell: bars(
        "B5 =  =  =  =  =  =  =  A5 =  =  =  =  =  =  =",
        "G5 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  =",
        "F#5 =  =  =  =  =  =  =  =  =  =  =  D5 =  =  =",
        "A5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      hat: bars(HAT_8),
    },
  },

  order: ["intro", "a", "b", "a", "c", "d", "b", "outro"],
};
