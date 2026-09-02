// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SHORT CIRCUIT — the score for a circuit stage, whatever the country.
//
// G major at 160 bpm: 56 bars, eighty-four seconds. A circuit is laps of
// one loop and the player will be round it three times before the finish,
// so the piece turns over fast, hooks early and never sits: a two-bar riff
// on a square lead is the whole verse, and the chorus is the same energy
// with a tune on top.
//
// THREE DECISIONS:
//
//   1. THE HOOK IS TWO BARS LONG, and it comes first. An arcade racer's
//      attract loop, not an album track: the riff is heard inside the
//      first four seconds and it is back every eight bars.
//   2. IT IS THE BRIGHTEST SCORE IN THE GAME — G major, a square lead, an
//      arpeggio in sixteenths, a hat on every eighth — because a circuit is
//      the one stage with a crowd all the way round.
//   3. THE BREAK IS A HALF-TIME DROP, not a cold one. The kit halves, the
//      riff stops, and the bass takes the tune down an octave for eight bars
//      — the lap board is still counting, so the piece never stops moving.
//
// The melodies are original.

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

const PAD_LOW: Record<string, string> = {
  G: "G3",
  Em: "G3",
  C: "G3",
  D: "F#3",
  Am: "A3",
  Bm: "F#3",
};
const PAD_TOP: Record<string, string> = { G: "D4", Em: "E4", C: "E4", D: "D4", Am: "E4", Bm: "D4" };
const BASS_LO: Record<string, string> = { G: "G2", Em: "E2", C: "C2", D: "D2", Am: "A2", Bm: "B2" };
const BASS_HI: Record<string, string> = { G: "G3", Em: "E3", C: "C3", D: "D3", Am: "A3", Bm: "B3" };
const STAB: Record<string, string> = { G: "B4", Em: "B4", C: "C5", D: "A4", Am: "C5", Bm: "B4" };
const ARP: Record<string, Triad> = {
  G: ["G4", "B4", "D5"],
  Em: ["E4", "G4", "B4"],
  C: ["C4", "E4", "G4"],
  D: ["D4", "F#4", "A4"],
  Am: ["A4", "C5", "E5"],
  Bm: ["B4", "D5", "F#5"],
};

const OPENING = ["G", "G", "C", "D"];
const VERSE = ["G", "G", "Em", "Em", "C", "C", "D", "D"];
const CHORUS = ["C", "D", "G", "Em", "C", "D", "G", "G"];
const DROP = ["Em", "Em", "Bm", "Bm", "C", "C", "D", "D"];
const CLIMB = ["Am", "Am", "C", "C", "D", "D", "D", "D"];
const CADENCE = ["C", "D", "G", "G"];

/** THE HOOK: two bars, diatonic, sits over every chord of the verse. */
const HOOK = [
  "G4 .  B4 .  D5 =  .  .  B4 .  G4 .  A4 =  =  =",
  "B4 .  D5 .  G5 =  .  .  D5 .  B4 .  A4 =  =  =",
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
  bpm: 160,
  stepsPerBeat: 4,
  instruments: {
    padLow: pad(0.01, 1000, -0.3, { open: 1.6, attackMs: 200 }),
    padTop: pad(0.009, 1300, 0.3, { open: 1.6, attackMs: 200 }),
    bass: bass(0.05, 520),
    brass: brass(0.018, 0.2, 1900),
    // The riff and the tune share one square, so the chorus is the verse's
    // own voice finally saying something.
    lead: lead(0.028, "square", 2600, { echo: 0.28 }),
    arp: arp(0.012, -0.4, 2000),
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
        "E5 =  =  =  G5 =  =  =  D5 =  =  =  =  =  =  =",
        "F#5 =  =  =  A5 =  =  =  D5 =  =  =  =  =  =  =",
        "G5 =  =  =  B5 =  =  =  D5 =  =  =  B4 =  =  =",
        "E5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "C5 =  =  =  E5 =  =  =  G5 =  =  =  E5 =  =  =",
        "D5 =  =  =  F#5 =  =  =  A5 =  =  =  F#5 =  =  =",
        "G5 =  =  =  =  =  =  =  D5 =  =  =  B4 =  =  =",
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
        "E2 .  .  .  G2 .  .  .  B2 =  =  =  .  .  .  .",
        "E2 .  .  .  G2 .  .  .  A2 =  =  =  .  .  .  .",
        "B2 .  .  .  D3 .  .  .  F#3 =  =  =  .  .  .  .",
        "B2 .  .  .  D3 .  .  .  A2 =  =  =  .  .  .  .",
        "C2 .  .  .  E2 .  .  .  G2 =  =  =  .  .  .  .",
        "C2 .  .  .  E2 .  .  .  A2 =  =  =  .  .  .  .",
        "D2 .  .  .  F#2 .  .  .  A2 =  =  =  .  .  .  .",
        "D2 .  .  .  A2 .  .  .  D3 =  =  =  =  =  =  =",
      ),
      arp: bars(...DROP.map((c) => arp16(ARP[c] as Triad))),
      kick: bars(KICK_HALF),
      snare: bars(SNARE_HALF),
      hat: bars(HAT_OFF),
    },

    // The build: octaves, sixteenth hats, the stabs back, the fill.
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
