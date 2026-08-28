// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// STARTING RAMP — the menu theme.
//
// A major at 132 bpm: 64 bars, a shade under two minutes, which is roughly how
// long a player spends picking a car and a stage before they press the thing
// that starts one.
//
// THREE DECISIONS, and they are what the next person retuning this should
// check their work against:
//
//   1. IT IS MAJOR AND IT STAYS THAT WAY. This is the front door of a rally
//      game, not a lament. The verse runs I–vi–ii–V, the chorus IV–V–iii–vi
//      into a IV–V–I, and the only shade anywhere is the break's eight bars
//      down in the relative minor — which exist so the last chorus has
//      something to arrive from. Nothing in the loop ends up anywhere sadder
//      than it started.
//   2. THE HOOK IS THE BRASS, NOT THE TUNE. An arcade racer announces itself
//      with offbeat stabs, because the player is reading a car list while it
//      plays and will catch a rhythm without listening to it. So the stabs
//      never stop, and the lead sings over the top of them and takes a breath
//      every two bars. A hook that demands attention is a hook competing with
//      the menu.
//   3. THE PAD IS REAL. Three sawtooth voices hold the chord across whole bars
//      (`hold`), which is the thing a chip sequencer cannot do. A re-struck
//      chord is not a texture, it is a tune nobody wrote — and under a track
//      this busy the held bed is the only reason the brass and the arpeggio
//      are not the entire mix.
//
// The harmony is the plainest happy cadence there is; the melodies are
// original.

import { bars, type Track } from "../../../lib/tracker.ts";

/** A triad, low to high — what the arpeggio walks up and down. */
type Triad = [string, string, string];

/** One bar of a note held all the way through — what a pad plays. */
const hold = (note: string): string => `${note} ${"= ".repeat(15)}`;

/** The verse bass: straight eighths on the root with the octave lifting the
 * back half of the bar, so the figure leans forward instead of sitting. */
const bounce = (lo: string, hi: string): string =>
  `${lo} .  ${lo} .  ${lo} .  ${hi} .  ${lo} .  ${lo} .  ${hi} .  ${hi} .`;

/** The chorus bass: a held root and two pushes. The long note is what lets a
 * chorus feel wider than a verse without anything getting louder. */
const push = (lo: string, hi: string): string =>
  `${lo} =  =  .  ${lo} .  ${hi} .  ${lo} =  =  .  ${hi} .  ${lo} .`;

/** The build's bass: octaves four to the bar, the plainest and hardest figure
 * in the track, and the reason the staircase under it reads as a climb. */
const straight = (lo: string, hi: string): string =>
  `${lo} .  ${hi} .  ${lo} .  ${hi} .  ${lo} .  ${hi} .  ${lo} .  ${hi} .`;

/** Brass on the offbeats — the signature figure, twice a bar and once late. */
const stab = (note: string): string =>
  `.  .  ${note} =  .  .  ${note} =  .  .  .  .  ${note} =  .  .`;

/** Brass across half a bar each — the chorus's wall, the same voices sustained
 * rather than punched. */
const swell = (note: string): string => `${note} =  =  =  =  =  =  =  ${note} =  =  =  =  =  =  =`;

/** Eighth-note arpeggio, up and back. */
const arp8 = ([a, b, c]: Triad): string =>
  `${a} .  ${b} .  ${c} .  ${b} .  ${a} .  ${b} .  ${c} .  ${b} .`;

/** The same shape in sixteenths — the chorus and the build only, where the
 * extra motion is the difference between wide and busy. */
const arp16 = ([a, b, c]: Triad): string =>
  `${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b}`;

// THE CHORD PLAN, written once. Each voice reads its own note out of these
// tables, so a progression can never come to differ between the pad, the bass,
// the brass and the arpeggio.
//
// The pad voicings sit inside a fifth of each other and move by step: a bed
// that leaps an octave between bars stops being a bed.
const PAD_LOW: Record<string, string> = {
  A: "A3",
  "F#m": "A3",
  Bm: "B3",
  E: "G#3",
  "C#m": "G#3",
  D: "A3",
};
const PAD_MID: Record<string, string> = {
  A: "C#4",
  "F#m": "C#4",
  Bm: "D4",
  E: "B3",
  "C#m": "C#4",
  D: "D4",
};
const PAD_TOP: Record<string, string> = {
  A: "E4",
  "F#m": "F#4",
  Bm: "F#4",
  E: "E4",
  "C#m": "E4",
  D: "F#4",
};
const BASS_LO: Record<string, string> = {
  A: "A2",
  "F#m": "F#2",
  Bm: "B2",
  E: "E2",
  "C#m": "C#2",
  D: "D2",
};
const BASS_HI: Record<string, string> = {
  A: "A3",
  "F#m": "F#3",
  Bm: "B3",
  E: "E3",
  "C#m": "C#3",
  D: "D3",
};
// The brass is a two-voice section — the fifth and the octave above it, which
// is an open shout rather than a chord. The third is left to the pad, so the
// stabs sit above the bed instead of inside it.
const STAB_LO: Record<string, string> = {
  A: "E4",
  "F#m": "C#4",
  Bm: "F#4",
  E: "B3",
  "C#m": "G#4",
  D: "A4",
};
const STAB_HI: Record<string, string> = {
  A: "A4",
  "F#m": "F#4",
  Bm: "B4",
  E: "E4",
  "C#m": "C#5",
  D: "D5",
};
// The arpeggio is voiced to stay inside one octave whatever the chord, so it
// glitters at a constant height instead of hopping about with the harmony.
const ARP: Record<string, Triad> = {
  A: ["A4", "C#5", "E5"],
  "F#m": ["A4", "C#5", "F#5"],
  Bm: ["B4", "D5", "F#5"],
  E: ["B4", "E5", "G#5"],
  "C#m": ["C#5", "E5", "G#5"],
  D: ["A4", "D5", "F#5"],
};

/** The parts of a section that are mechanical — derived from its chords rather
 * than composed. A part left out is simply absent, which is how a voice is
 * silenced: an EMPTY line is not, because a zero-length voice has no length to
 * divide the pattern's and the flatten throws. */
type Parts = {
  bass?: (lo: string, hi: string) => string;
  arp?: (tones: Triad) => string;
  brass?: (note: string) => string;
};

/** Build a section's chord-driven voices from one plan. The pad is always
 * there — it is the thing every section has in common. */
function bed(plan: string[], parts: Parts): Record<string, string[]> {
  const { bass, arp, brass } = parts;
  const out: Record<string, string[]> = {
    padLow: bars(...plan.map((c) => hold(PAD_LOW[c] as string))),
    padMid: bars(...plan.map((c) => hold(PAD_MID[c] as string))),
    padTop: bars(...plan.map((c) => hold(PAD_TOP[c] as string))),
  };
  if (bass) {
    out.bass = bars(...plan.map((c) => bass(BASS_LO[c] as string, BASS_HI[c] as string)));
  }
  if (arp) out.arp = bars(...plan.map((c) => arp(ARP[c] as Triad)));
  if (brass) {
    out.brassLo = bars(...plan.map((c) => brass(STAB_LO[c] as string)));
    out.brassHi = bars(...plan.map((c) => brass(STAB_HI[c] as string)));
  }
  return out;
}

const OPENING = ["A", "A", "D", "E"];
const VERSE = ["A", "A", "F#m", "F#m", "Bm", "Bm", "E", "E"];
const CHORUS = ["D", "E", "C#m", "F#m", "D", "E", "A", "A"];
const BREAK = ["F#m", "F#m", "D", "D", "C#m", "C#m", "Bm", "E"];
const CLIMB = ["Bm", "Bm", "C#m", "C#m", "D", "D", "E", "E"];
const CADENCE = ["D", "E", "A", "A"];

export const MENU_TRACK: Track = {
  bpm: 132,
  stepsPerBeat: 4,
  instruments: {
    // The bed: three sawtooth voices spread across the picture, filtered
    // brighter than a mood pad would be and opening a little across each note.
    // Dark is a decision this track does not make anywhere.
    padLow: {
      wave: "sawtooth",
      volume: 0.011,
      gate: 1,
      hold: 0.9,
      attackMs: 220,
      detuneCents: 10,
      pan: -0.35,
      echo: 0.18,
      filter: { type: "lowpass", frequency: 900, to: 1400, q: 0.8 },
    },
    padMid: {
      wave: "sawtooth",
      volume: 0.01,
      gate: 1,
      hold: 0.9,
      attackMs: 260,
      detuneCents: 12,
      pan: 0.32,
      echo: 0.2,
      filter: { type: "lowpass", frequency: 1100, to: 1700, q: 0.8 },
    },
    padTop: {
      wave: "sawtooth",
      volume: 0.009,
      gate: 1,
      hold: 0.88,
      attackMs: 300,
      detuneCents: 14,
      echo: 0.26,
      filter: { type: "lowpass", frequency: 1300, to: 2000, q: 0.9 },
    },
    // The bass: short, driven, and swept downward across each note, which is
    // what makes a plucked triangle read as a finger rather than a tone. It
    // holds only a quarter of its length — long enough to have a body, short
    // enough that the gaps in the figure are audible as gaps.
    bass: {
      wave: "triangle",
      volume: 0.05,
      gate: 0.5,
      hold: 0.25,
      drive: 0.35,
      filter: { type: "lowpass", frequency: 520, to: 300 },
    },
    // The brass section, panned apart so the two voices read as a section
    // rather than as one thick note. A fast attack, a short hold and a filter
    // that opens across the stab is the whole of the horn impression.
    brassLo: {
      wave: "sawtooth",
      volume: 0.019,
      gate: 0.85,
      hold: 0.35,
      attackMs: 18,
      detuneCents: 9,
      drive: 0.25,
      pan: -0.28,
      echo: 0.16,
      filter: { type: "lowpass", frequency: 1700, to: 2400, q: 1 },
    },
    brassHi: {
      wave: "sawtooth",
      volume: 0.017,
      gate: 0.85,
      hold: 0.35,
      attackMs: 22,
      detuneCents: 11,
      drive: 0.22,
      pan: 0.3,
      echo: 0.18,
      filter: { type: "lowpass", frequency: 2000, to: 2800, q: 1 },
    },
    // The tune: a square rather than a sawtooth, because the square's hollow
    // odd harmonics are the sound of every arcade lead ever written, and a
    // vibrato that fades in only on the notes long enough to hold it.
    lead: {
      wave: "square",
      volume: 0.028,
      gate: 0.95,
      hold: 0.5,
      attackMs: 25,
      detuneCents: 8,
      echo: 0.3,
      vibrato: { rateHz: 5.4, depthCents: 20, delayMs: 260 },
      filter: { type: "lowpass", frequency: 2400, to: 3200, q: 1.2 },
    },
    // Glitter, hard right and deep in the echo: plucked so short that only the
    // attack survives, which is what makes sixteenths a shimmer rather than a
    // second melody.
    arp: {
      wave: "triangle",
      volume: 0.012,
      gate: 0.22,
      pan: 0.42,
      echo: 0.34,
      filter: { type: "bandpass", frequency: 1800, q: 1.4 },
    },
    // The bell owns the two sections with no drums in them — the opening and
    // the break — so its arrival is always the sound of the track thinning out.
    bell: {
      wave: "sine",
      volume: 0.016,
      gate: 0.7,
      hold: 0.25,
      attackMs: 8,
      pan: -0.4,
      echo: 0.5,
    },
    kick: {
      wave: "triangle",
      volume: 0.055,
      gate: 0.45,
      slide: 0.2,
      filter: { type: "lowpass", frequency: 240 },
    },
    snare: {
      wave: "noise",
      volume: 0.024,
      gate: 0.35,
      filter: { type: "bandpass", frequency: 1900, to: 1100, q: 0.9 },
    },
    hat: {
      wave: "noise",
      volume: 0.009,
      gate: 0.14,
      pan: 0.26,
      filter: { type: "highpass", frequency: 8200 },
    },
  },

  patterns: {
    // Four bars of bell and bed with a count-in growing under them. The first
    // thing the player ever hears is not the tune and not the drums, so that
    // both have somewhere to arrive from.
    intro: {
      ...bed(OPENING, { arp: arp8 }),
      bell: bars(
        "A4 =  =  =  .  .  .  .  C#5 =  =  =  .  .  .  .",
        "E5 =  =  =  .  .  .  .  .  .  .  .  C#5 =  =  =",
        "D5 =  =  =  .  .  .  .  F#5 =  =  =  .  .  .  .",
        "E5 =  =  =  .  .  .  .  B5 =  =  =  =  =  =  =",
      ),
      hat: bars(
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  x  .  .  .  x  .  .  .",
        "x  .  .  .  x  .  .  .  x  .  .  .  x  .  .  .",
        "x  .  x  .  x  .  x  .  x  x  x  x  x  x  x  x",
      ),
    },

    // The verse: I–vi–ii–V, brass on the offbeats, and a tune that climbs the
    // A triad, mirrors the climb back down over the vi, then walks up to its
    // top note over the V. Every second bar ends early — the rest is what
    // makes the phrase a phrase.
    a: {
      ...bed(VERSE, { bass: bounce, arp: arp8, brass: stab }),
      lead: bars(
        "A4 .  .  C#5 .  .  E5 =  =  =  .  .  C#5 =  .  .",
        "A4 =  =  =  =  =  =  =  .  .  .  .  B4 =  C#5 =",
        "C#5 .  .  A4 .  .  F#4 =  =  =  .  .  A4 =  .  .",
        "F#4 =  =  =  =  =  =  =  .  .  .  .  .  .  .  .",
        "D5 .  .  B4 .  .  D5 =  F#5 =  =  =  .  .  .  .",
        "E5 =  =  .  D5 =  =  .  B4 =  =  =  .  .  .  .",
        "G#5 =  =  .  F#5 =  =  .  E5 =  =  =  B4 =  =  =",
        "C#5 =  =  =  B4 =  =  =  G#4 =  =  =  .  .  B4 =",
      ),
      kick: bars("C2 .  .  .  .  .  .  .  C2 .  .  .  .  .  .  ."),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // The chorus: the same room with the roof off. IV–V–iii–vi and then the
    // IV–V–I everything has been pointing at, the kick straight on the floor,
    // the brass sustained instead of stabbed, and the lead an octave up where
    // it can land on the tonic and mean it.
    b: {
      ...bed(CHORUS, { bass: push, arp: arp16, brass: swell }),
      lead: bars(
        "F#5 =  =  =  =  =  A5 =  =  =  =  =  .  .  .  .",
        "G#5 =  =  =  =  =  =  =  B5 =  =  =  .  .  .  .",
        "E5 .  .  G#5 .  .  B5 =  =  =  =  =  .  .  .  .",
        "A5 =  =  =  G#5 =  =  =  F#5 =  =  =  =  =  .  .",
        "F#5 =  =  =  =  =  A5 =  =  =  =  =  .  .  .  .",
        "B5 =  =  =  A5 =  =  =  G#5 =  =  =  F#5 =  =  =",
        "E5 =  =  =  =  =  =  =  C#5 =  =  =  E5 =  =  =",
        "A5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      kick: bars("C2 .  .  .  C2 .  .  .  C2 .  .  .  C2 .  .  ."),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  x"),
      hat: bars("x  .  x  x  x  .  x  .  x  .  x  x  x  .  x  ."),
    },

    // The break: the bed and the bell alone, down in the relative minor, with
    // the kit creeping back in over the second half. Eight bars where nothing
    // is driving anywhere — the only section in the loop that is not happy,
    // and the reason the last chorus sounds like an arrival.
    c: {
      ...bed(BREAK, {}),
      bell: bars(
        "C#5 =  =  =  =  =  =  =  .  .  .  .  A4 =  =  =",
        "F#5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "A4 =  =  =  .  .  .  .  D5 =  =  =  =  =  =  =",
        "F#5 =  =  =  =  =  .  .  A5 =  =  =  =  =  =  =",
        "G#5 =  =  =  =  =  =  =  E5 =  =  =  .  .  .  .",
        "C#5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "D5 =  =  =  F#5 =  =  =  B5 =  =  =  =  =  =  =",
        "G#5 =  =  =  =  =  =  =  B5 =  =  =  =  =  =  =",
      ),
      hat: bars(
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        "x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  .",
        "x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  .",
      ),
    },

    // The build: ii–iii–IV–V straight up a staircase, the bass in bare octaves
    // and the snare thickening a bar at a time into a roll. Everything here
    // exists to make the chorus that follows it land.
    d: {
      ...bed(CLIMB, { bass: straight, arp: arp16, brass: stab }),
      lead: bars(
        ".  .  .  .  .  .  .  .  B4 =  =  =  D5 =  =  =",
        "F#5 =  =  =  =  =  .  .  D5 =  =  =  .  .  .  .",
        ".  .  .  .  .  .  .  .  C#5 =  =  =  E5 =  =  =",
        "G#5 =  =  =  =  =  .  .  E5 =  =  =  .  .  .  .",
        ".  .  .  .  D5 =  =  =  F#5 =  =  =  A5 =  =  =",
        "F#5 =  =  =  A5 =  =  =  =  =  .  .  .  .  .  .",
        "E5 =  G#5 =  B5 =  =  =  =  =  .  .  G#5 =  B5 =",
        "E5 =  =  =  G#5 =  =  =  B5 =  =  =  =  =  =  =",
      ),
      kick: bars("C2 .  .  .  C2 .  .  .  C2 .  .  .  C2 .  .  ."),
      snare: bars(
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  x  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  x  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  x  .",
        ".  .  .  .  x  .  x  .  .  .  x  .  x  .  x  .",
        "x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  .",
        "x  x  x  x  x  x  x  x  x  x  x  x  x  x  x  x",
      ),
      hat: bars("x  x  x  x  x  x  x  x  x  x  x  x  x  x  x  x"),
    },

    // Four bars of IV–V–I to finish, a fill across the last one, and back to
    // the top. The tonic the outro ends on is the tonic the intro opens with,
    // so the seam is a chord change that never happens.
    outro: {
      ...bed(CADENCE, { bass: push, arp: arp16, brass: swell }),
      lead: bars(
        "F#5 =  =  =  =  =  A5 =  =  =  =  =  .  .  .  .",
        "B5 =  =  =  A5 =  =  =  G#5 =  =  =  =  =  .  .",
        "A5 =  =  =  =  =  =  =  E5 =  =  =  C#5 =  =  =",
        "A4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
      kick: bars("C2 .  .  .  C2 .  .  .  C2 .  .  .  C2 .  .  ."),
      snare: bars(
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  x  .",
        ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .",
        "x  .  x  .  x  x  x  .  x  .  x  x  x  x  x  x",
      ),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },
  },

  order: ["intro", "a", "b", "a", "b", "c", "d", "b", "outro"],
};
