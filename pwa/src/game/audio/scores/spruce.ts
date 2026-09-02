// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// BLACK SPRUCE — the stage theme for the taiga in the rain.
//
// D minor at 140 bpm: 56 bars, ninety-six seconds. The same forest as the
// clear-day theme with the light gone out of it: a wet stage is driven
// slower, seen less far, and heard through a windscreen the wipers are
// working on, and the score has to sound like that stage rather than like
// the sunny one played sad.
//
// THREE DECISIONS:
//
//   1. THE RAIN IS IN THE SCORE. A plucked sixteenth arpeggio runs under
//      every section that has drums, high and thin and off to one side —
//      it is the drops on the roof, and it never stops while the kit plays.
//   2. THE BASS PULSES, THE GUITARS DO NOT CHUG. A dotted figure that leans
//      forward, under held chords: the drive is in the low end and the mid
//      is a wall, which is the opposite of the dry theme's arrangement and
//      the reason the two read as two weathers.
//   3. THE LIFT IS TO THE RELATIVE MAJOR. The verse is a lament — i–VI–iv–V
//      — and the chorus goes up to B♭ and F and lets some light through the
//      cloud for eight bars before the dominant drags it back.
//
// The melodies are original.

import { bars, type Track } from "../../../lib/tracker.ts";

import {
  arp,
  arp16,
  bass,
  bell,
  dotted,
  guitar,
  hat,
  HAT_8,
  HAT_OFF,
  hold,
  kick,
  KICK_HALF,
  KICK_PUSH,
  KICK_ROCK,
  lead,
  pad,
  snare,
  SNARE_24,
  SNARE_FILL,
  SNARE_HALF,
  tom,
  voice,
  type Triad,
} from "./kit.ts";

const ROOT: Record<string, string> = { Dm: "D2", Bb: "A#2", Gm: "G2", A: "A2", F: "F2", C: "C2" };
const GTR_LO: Record<string, string> = { Dm: "D3", Bb: "A#2", Gm: "G3", A: "A3", F: "F3", C: "C3" };
const GTR_HI: Record<string, string> = { Dm: "A3", Bb: "F3", Gm: "D4", A: "E4", F: "C4", C: "G3" };
const PAD_LOW: Record<string, string> = {
  Dm: "A3",
  Bb: "A#3",
  Gm: "A#3",
  A: "A3",
  F: "A3",
  C: "G3",
};
const PAD_TOP: Record<string, string> = {
  Dm: "F4",
  Bb: "F4",
  Gm: "G4",
  A: "C#4",
  F: "F4",
  C: "E4",
};
// The rain: voiced high and inside one octave, so it patters at one height.
const RAIN: Record<string, Triad> = {
  Dm: ["D5", "F5", "A5"],
  Bb: ["D5", "F5", "A#5"],
  Gm: ["D5", "G5", "A#5"],
  A: ["C#5", "E5", "A5"],
  F: ["C5", "F5", "A5"],
  C: ["C5", "E5", "G5"],
};

const VERSE = ["Dm", "Dm", "Bb", "Bb", "Gm", "Gm", "A", "A"];
const CHORUS = ["Bb", "F", "Gm", "Dm", "Bb", "F", "A", "A"];
const BREAK = ["Dm", "Dm", "Gm", "Gm", "Bb", "Bb", "A", "A"];
const BUILD = ["Dm", "Dm", "Dm", "Dm", "Bb", "Bb", "A", "A"];

/** The wall and the pulse: held guitars, a dotted bass, both pads. */
function wall(plan: string[], rain: boolean): Record<string, string[]> {
  const out: Record<string, string[]> = {
    gtrLo: bars(...plan.map((c) => hold(voice(GTR_LO, c)))),
    gtrHi: bars(...plan.map((c) => hold(voice(GTR_HI, c)))),
    bass: bars(...plan.map((c) => dotted(voice(ROOT, c)))),
    padLow: bars(...plan.map((c) => hold(voice(PAD_LOW, c)))),
    padTop: bars(...plan.map((c) => hold(voice(PAD_TOP, c)))),
  };
  if (rain) out.rain = bars(...plan.map((c) => arp16(RAIN[c] as Triad)));
  return out;
}

export const SPRUCE_TRACK: Track = {
  bpm: 140,
  stepsPerBeat: 4,
  instruments: {
    // Darker than the dry theme's guitars by half an octave of cutoff.
    gtrLo: guitar(0.022, -0.35, 1100),
    gtrHi: guitar(0.018, 0.35, 1300),
    bass: bass(0.05, 420, { hold: 0.35, gate: 0.6 }),
    padLow: pad(0.011, 600, -0.2, { open: 1.6, attackMs: 320, echo: 0.3 }),
    padTop: pad(0.009, 800, 0.2, { open: 1.6, attackMs: 320, echo: 0.3 }),
    rain: arp(0.01, 0.5, 2400),
    // A darker lead than the anthem's: a filtered sawtooth with a slower,
    // wider vibrato, sitting further back in the echo.
    lead: lead(0.026, "sawtooth", 1800, { echo: 0.4, detune: 10, vibrato: 24 }),
    bell: bell(0.015, -0.3),
    kick: kick(0.058, 200),
    snare: snare(0.028, 1200),
    hat: hat(0.008, -0.2),
    tom: tom(0.038, 420),
  },

  patterns: {
    // The pads and the rain, and a kick on the one: the weather before the
    // car.
    intro: {
      padLow: bars(...["Dm", "Dm", "Bb", "A"].map((c) => hold(voice(PAD_LOW, c)))),
      padTop: bars(...["Dm", "Dm", "Bb", "A"].map((c) => hold(voice(PAD_TOP, c)))),
      rain: bars(...["Dm", "Dm", "Bb", "A"].map((c) => arp16(RAIN[c] as Triad))),
      bass: bars(...["Dm", "Dm", "Bb", "A"].map((c) => hold(voice(ROOT, c)))),
      kick: bars(KICK_HALF),
    },

    // The verse: the wall, the pulse, the rain, and a half-time kit.
    a: {
      ...wall(VERSE, true),
      kick: bars(KICK_PUSH),
      snare: bars(SNARE_HALF),
      hat: bars(HAT_OFF),
    },

    // The chorus: up to the relative major, the kit to full time, the lead.
    b: {
      ...wall(CHORUS, true),
      lead: bars(
        "D5 =  =  =  =  =  =  =  F5 =  =  =  D5 =  =  =",
        "C5 =  =  =  =  =  =  =  A4 =  =  =  C5 =  =  =",
        "A#4 =  =  =  D5 =  =  =  G5 =  =  =  =  =  =  =",
        "F5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "D5 =  =  =  F5 =  =  =  A#5 =  =  =  A5 =  =  =",
        "F5 =  =  =  =  =  =  =  C5 =  =  =  A4 =  =  =",
        "C#5 =  =  =  E5 =  =  =  A5 =  =  =  =  =  =  =",
        "G5 =  =  =  =  =  =  =  E5 =  =  =  C#5 =  =  =",
      ),
      kick: bars(KICK_ROCK),
      snare: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The break: everything but the pads and the bell goes, and the rain
    // stops with the kit — the one dry moment in the piece.
    c: {
      padLow: bars(...BREAK.map((c) => hold(voice(PAD_LOW, c)))),
      padTop: bars(...BREAK.map((c) => hold(voice(PAD_TOP, c)))),
      bass: bars(...BREAK.map((c) => hold(voice(ROOT, c)))),
      bell: bars(
        "A4 =  =  =  =  =  =  =  D5 =  =  =  =  =  =  =",
        ".  .  .  .  F5 =  =  =  =  =  =  =  .  .  .  .",
        "D5 =  =  =  =  =  =  =  A#4 =  =  =  =  =  =  =",
        ".  .  .  .  .  .  .  .  G4 =  =  =  =  =  =  =",
        "F5 =  =  =  =  =  =  =  D5 =  =  =  =  =  =  =",
        ".  .  .  .  A#4 =  =  =  =  =  =  =  .  .  .  .",
        "C#5 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  =",
        "A5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
    },

    // The build: the tonic held for four bars while the tom and the snare
    // pile up, then the VI and the V to hand back to the chorus.
    d: {
      ...wall(BUILD, true),
      kick: bars(KICK_ROCK),
      snare: bars(
        SNARE_HALF,
        SNARE_24,
        SNARE_HALF,
        SNARE_24,
        SNARE_24,
        SNARE_24,
        SNARE_FILL,
        SNARE_FILL,
      ),
      hat: bars(HAT_8),
      tom: bars(
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  D2 .  D2 .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  D2 .  D2 .  A2 .  A2 .",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  F2 .  F2 .",
        "A2 .  .  .  A2 .  .  .  A2 .  A2 .  A2 .  A2 .",
        "A2 .  A2 .  A2 .  A2 .  A2 A2 A2 A2 A2 A2 A2 A2",
      ),
    },

    // Four bars to the top.
    outro: {
      ...wall(["Bb", "A", "Dm", "Dm"], true),
      kick: bars(KICK_PUSH),
      snare: bars(SNARE_HALF),
      hat: bars(HAT_OFF),
    },
  },

  order: ["intro", "a", "b", "a", "c", "d", "b", "outro"],
};
