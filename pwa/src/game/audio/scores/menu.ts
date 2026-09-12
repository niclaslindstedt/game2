// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SERVICE PARK — the menu theme.
//
// D minor at 112 bpm: 56 bars, two minutes, which is roughly how long a
// player spends picking a car and a stage before they press the thing that
// starts one.
//
// THREE DECISIONS, and they are what the next person retuning this should
// check their work against:
//
//   1. IT IS MINOR AND IT NEVER LIFTS. A rally is a thing that goes wrong,
//      and the front door says so before the player has touched anything.
//      The verse is the i–VI–iv–V lament, the chorus runs iv–V–VI–♭vii into
//      a iv–V–i, and there is no relative-major section anywhere: the loop
//      has no eight bars that a listener could mistake for relief.
//   2. THE ♭II IS THE SIGNATURE. An E♭ over a D minor menu — the Neapolitan,
//      a half-step above the tonic — owns the break and starts the build,
//      and it is the one chord in the piece that does not belong to the key
//      it keeps insisting on. Everything ominous here is that interval; take
//      it out and this is merely a sad track.
//   3. THE HOOK IS THE BRASS, NOT THE TUNE. An arcade racer announces itself
//      with offbeat stabs, because the player is reading a car list while it
//      plays and will catch a rhythm without listening to it. So the stabs
//      never stop through the verse, and the lead sings over the chorus and
//      takes a breath every two bars — it just sings a falling line now
//      rather than a climbing one.
//
// The pad holds, as the whole soundtrack's does; the melodies are original.

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
// being a bed. Flats have no token, so B♭ is written `A#` and E♭ is `D#`.
const PAD_LOW: Record<string, string> = {
  Dm: "A3",
  Bb: "A#3",
  Gm: "A#3",
  A: "A3",
  Eb: "A#3",
  Cm: "G3",
};
const PAD_MID: Record<string, string> = {
  Dm: "D4",
  Bb: "D4",
  Gm: "D4",
  A: "C#4",
  Eb: "D#4",
  Cm: "C4",
};
// The top note is the third, which is the only voice in the arrangement that
// says whether a chord is major or minor — and it is the reason this loop
// reads as a lament rather than as the same tune in another key.
const PAD_TOP: Record<string, string> = {
  Dm: "F4",
  Bb: "F4",
  Gm: "G4",
  A: "E4",
  Eb: "G4",
  Cm: "D#4",
};
const BASS_LO: Record<string, string> = {
  Dm: "D2",
  Bb: "A#2",
  Gm: "G2",
  A: "A2",
  Eb: "D#2",
  Cm: "C2",
};
const BASS_HI: Record<string, string> = {
  Dm: "D3",
  Bb: "A#3",
  Gm: "G3",
  A: "A3",
  Eb: "D#3",
  Cm: "C3",
};
// The brass is a two-voice section — the fifth and the root above it, which
// is an open shout rather than a chord. The third is left to the pad, so the
// stabs stay a rhythm and never argue with the harmony.
const STAB_LO: Record<string, string> = {
  Dm: "A4",
  Bb: "F4",
  Gm: "D4",
  A: "E4",
  Eb: "A#4",
  Cm: "G4",
};
const STAB_HI: Record<string, string> = {
  Dm: "D5",
  Bb: "A#4",
  Gm: "G4",
  A: "A4",
  Eb: "D#5",
  Cm: "C5",
};
// The arpeggio is voiced to stay inside one octave whatever the chord, so it
// glitters at a constant height instead of hopping about with the harmony.
const ARP: Record<string, Triad> = {
  Dm: ["D4", "F4", "A4"],
  Bb: ["D4", "F4", "A#4"],
  Gm: ["D4", "G4", "A#4"],
  A: ["C#4", "E4", "A4"],
  Eb: ["D#4", "G4", "A#4"],
  Cm: ["C4", "D#4", "G4"],
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

const OPENING = ["Dm", "Dm", "Gm", "A"];
const VERSE = ["Dm", "Dm", "Bb", "Bb", "Gm", "Gm", "A", "A"];
const CHORUS = ["Gm", "A", "Bb", "Cm", "Gm", "A", "Dm", "Dm"];
// The break and the build are where the ♭II lives: the Neapolitan under the
// bell, and again under the climb, so the loop's two quietest and busiest
// sections are both leaning on the same wrong note.
const BREAK = ["Bb", "Bb", "Gm", "Gm", "Eb", "Eb", "A", "A"];
const CLIMB = ["Eb", "Eb", "Gm", "Gm", "A", "A", "A", "A"];
const CADENCE = ["Gm", "A", "Dm", "Dm"];

export const MENU_TRACK: Track = {
  bpm: 112,
  stepsPerBeat: 4,
  instruments: {
    // The bed: three voices spread across the picture, filtered DOWN from
    // where an arcade menu would put them. The pad is meant to sit under the
    // room rather than light it.
    padLow: pad(0.011, 700, -0.35),
    padMid: pad(0.01, 850, 0.32),
    padTop: pad(0.009, 1000, 0),
    bass: bass(0.05, 460),
    brassLo: brass(0.019, -0.28, 1400),
    brassHi: brass(0.017, 0.3, 1600),
    // The tune: a square, because the square's hollow odd harmonics are the
    // sound of every arcade lead ever written — kept dull enough here that
    // the hollowness reads as cold rather than as bright.
    lead: lead(0.028, "square", 1900),
    arp: arp(0.012, 0.42, 1500),
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
        "F5 =  =  =  =  =  =  =  A5 =  =  =  =  =  =  =",
        ".  .  .  .  D5 =  =  =  =  =  =  =  .  .  .  .",
        "G5 =  =  =  =  =  =  =  A#5 =  =  =  =  =  =  =",
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
    // floor, the glitter doubles, and the tune arrives — falling, and ending
    // on the minor third rather than on the tonic.
    b: {
      ...bed(CHORUS, { bass: push, arp: arp16, brass: swell }),
      lead: bars(
        "D5 =  =  =  F5 =  =  =  A#4 =  =  =  D5 =  =  =",
        "C#5 =  =  =  =  =  =  =  E5 =  =  =  A4 =  =  =",
        "F5 =  =  =  D5 =  =  =  A#4 =  =  =  C5 =  =  =",
        "D#5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "G5 =  =  =  F5 =  =  =  D5 =  =  =  A#4 =  =  =",
        "C#5 =  =  =  =  =  =  =  E5 =  =  =  C#5 =  =  =",
        "D5 =  =  =  F5 =  =  =  E5 =  =  =  =  =  =  =",
        "D5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      kick: bars(KICK_FOUR),
      snare: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The break: down onto the Neapolitan with the drums gone, the bass
    // walking in quarters, and the bell answering the pad.
    c: {
      ...bed(BREAK, { bass: quarters }),
      bell: bars(
        "D5 =  =  =  =  =  =  =  F5 =  =  =  =  =  =  =",
        ".  .  .  .  A#4 =  =  =  =  =  =  =  .  .  .  .",
        "G5 =  =  =  =  =  =  =  =  =  =  =  D5 =  =  =",
        ".  .  .  .  .  .  .  .  A#4 =  =  =  =  =  =  =",
        "D#5 =  =  =  =  =  =  =  G5 =  =  =  =  =  =  =",
        ".  .  .  .  A#5 =  =  =  =  =  =  =  .  .  .  .",
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
        ".  .  .  .  .  .  .  .  .  .  .  .  A#2 .  A#2 .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  G2 .  G2 .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  E2 .  E2 .  E2 .  E2 .",
        "A2 .  .  .  A2 .  .  .  G2 .  G2 .  E2 .  E2 .",
      ),
    },

    // Four bars back to the top: the cadence with the bell over it, landing
    // on the minor third so the loop turns over without ever settling.
    outro: {
      ...bed(CADENCE, { bass: quarters, brass: stab }),
      bell: bars(
        "A#5 =  =  =  =  =  =  =  A5 =  =  =  =  =  =  =",
        "G5 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  =",
        "F5 =  =  =  =  =  =  =  =  =  =  =  D5 =  =  =",
        "F5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      hat: bars(HAT_8),
    },
  },

  order: ["intro", "a", "b", "a", "c", "d", "b", "outro"],
};
