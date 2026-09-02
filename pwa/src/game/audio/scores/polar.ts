// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MIDNIGHT SUN — the stage theme for the taiga at dawn, dusk and night.
//
// A minor at 118 bpm: 56 bars, a hundred and fourteen seconds. The slowest
// score in the game, because a stage under a low sun is a stage driven into
// the light or away from it, with the trees going black and the sky doing
// everything, and a rock riff under that is a rock riff under a painting.
//
// THREE DECISIONS:
//
//   1. IT IS SYNTHWAVE, NOT ROCK. Wide pads that hold whole bars, an
//      octave bass on the beat and the off, a gated pluck ostinato on the
//      top note of every chord, and a sine lead that moves slowly and
//      rests often. No guitars anywhere.
//   2. THE OSTINATO NEVER STOPS. Eight plucks a bar on the chord's top
//      note, from the first bar to the last, including the break — it is
//      the one thing that keeps the piece driving while everything else in
//      it is sitting still, and it is the signature.
//   3. THE BREAK IS THE BIGGEST SECTION. Eight bars of the pads and a bell
//      with the kit gone and the bass held, longer and emptier than either
//      of the other scores allow themselves, because at this tempo the
//      return of the kick is the only build the piece needs.
//
// The melodies are original.

import { bars, type Track } from "../../../lib/tracker.ts";

import {
  bass,
  bell,
  clap,
  hat,
  HAT_8,
  HAT_OFF,
  hold,
  kick,
  KICK_FOUR,
  KICK_HALF,
  lead,
  octaves,
  openHat,
  pad,
  pluck8,
  SNARE_24,
  SNARE_HALF,
  voice,
} from "./kit.ts";

const BASS_LO: Record<string, string> = { Am: "A2", F: "F2", C: "C2", G: "G2", Dm: "D2", E: "E2" };
const BASS_HI: Record<string, string> = { Am: "A3", F: "F3", C: "C3", G: "G3", Dm: "D3", E: "E3" };
const PAD_LOW: Record<string, string> = { Am: "A3", F: "A3", C: "G3", G: "G3", Dm: "A3", E: "G#3" };
const PAD_MID: Record<string, string> = { Am: "C4", F: "C4", C: "C4", G: "B3", Dm: "D4", E: "B3" };
const PAD_TOP: Record<string, string> = { Am: "E4", F: "F4", C: "E4", G: "D4", Dm: "F4", E: "E4" };
// The ostinato: the chord's top note, an octave over the pad.
const PLUCK: Record<string, string> = { Am: "E5", F: "F5", C: "E5", G: "D5", Dm: "F5", E: "E5" };

const OPENING = ["Am", "Am", "F", "G"];
const VERSE = ["Am", "Am", "F", "F", "C", "C", "G", "G"];
const CHORUS = ["F", "G", "Am", "Am", "F", "G", "C", "E"];
const BREAK = ["Dm", "Dm", "Am", "Am", "F", "F", "E", "E"];
const CLIMB = ["F", "F", "G", "G", "Am", "Am", "E", "E"];
const CADENCE = ["F", "G", "Am", "Am"];

/** The bed and the signature: three pads, the pluck, and a bass in
 * whichever figure the section wants. */
function bed(
  plan: string[],
  bassFigure: (lo: string, hi: string) => string,
): Record<string, string[]> {
  return {
    padLow: bars(...plan.map((c) => hold(voice(PAD_LOW, c)))),
    padMid: bars(...plan.map((c) => hold(voice(PAD_MID, c)))),
    padTop: bars(...plan.map((c) => hold(voice(PAD_TOP, c)))),
    pluck: bars(...plan.map((c) => pluck8(voice(PLUCK, c)))),
    bass: bars(...plan.map((c) => bassFigure(voice(BASS_LO, c), voice(BASS_HI, c)))),
  };
}

/** A bass held for the bar — the break's, and the intro's. */
const held = (lo: string): string => hold(lo);

export const POLAR_TRACK: Track = {
  bpm: 118,
  stepsPerBeat: 4,
  instruments: {
    // Wide, slow, and brighter at the top than the bottom; the whole picture
    // is these three.
    padLow: pad(0.011, 700, -0.4, { open: 1.4, attackMs: 380, echo: 0.3 }),
    padMid: pad(0.01, 900, 0.4, { open: 1.4, attackMs: 380, echo: 0.3 }),
    padTop: pad(0.009, 1200, 0, { open: 1.5, attackMs: 420, echo: 0.34 }),
    // The pluck: gated short, a square through a bandpass, on the echo so
    // the eighths smear into a shimmer.
    pluck: {
      wave: "square",
      volume: 0.013,
      gate: 0.3,
      pan: 0.25,
      echo: 0.4,
      filter: { type: "bandpass", frequency: 1500, q: 1.6 },
    },
    bass: bass(0.05, 400, { hold: 0.4, gate: 0.55 }),
    // A sine lead with a slow vibrato: the one voice with no edge on it at all.
    lead: lead(0.03, "sine", 3000, { echo: 0.45, detune: 6, vibrato: 14 }),
    bell: bell(0.015, 0.35),
    kick: kick(0.055, 200),
    clap: clap(0.022),
    hat: hat(0.008, -0.3),
    open: openHat(0.007, 0.3),
  },

  patterns: {
    intro: {
      ...bed(OPENING, held),
      kick: bars(KICK_HALF),
    },

    // The verse: the kit arrives, four to the floor under the pluck.
    a: {
      ...bed(VERSE, octaves),
      kick: bars(KICK_FOUR),
      clap: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The chorus: the lead, and the open hat on the offbeats.
    b: {
      ...bed(CHORUS, octaves),
      lead: bars(
        "C5 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  =",
        "D5 =  =  =  =  =  =  =  =  =  =  =  B4 =  =  =",
        "C5 =  =  =  =  =  =  =  A4 =  =  =  =  =  =  =",
        ".  .  .  .  .  .  .  .  E5 =  =  =  =  =  =  =",
        "F5 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  =",
        "D5 =  =  =  =  =  =  =  G5 =  =  =  =  =  =  =",
        "E5 =  =  =  =  =  =  =  =  =  =  =  C5 =  =  =",
        "B4 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      kick: bars(KICK_FOUR),
      clap: bars(SNARE_24),
      hat: bars(HAT_8),
      open: bars(HAT_OFF),
    },

    // The break: pads, pluck, held bass, a bell. Nothing else.
    c: {
      ...bed(BREAK, held),
      bell: bars(
        "F5 =  =  =  =  =  =  =  D5 =  =  =  =  =  =  =",
        ".  .  .  .  A4 =  =  =  =  =  =  =  .  .  .  .",
        "E5 =  =  =  =  =  =  =  C5 =  =  =  =  =  =  =",
        ".  .  .  .  .  .  .  .  A4 =  =  =  =  =  =  =",
        "C5 =  =  =  =  =  =  =  F5 =  =  =  =  =  =  =",
        ".  .  .  .  A5 =  =  =  =  =  =  =  .  .  .  .",
        "G#4 =  =  =  =  =  =  =  B4 =  =  =  =  =  =  =",
        "E5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
    },

    // The build: the kick comes back on the halves, then the fours; the
    // clap finds the backbeat; the last two bars are the dominant held.
    d: {
      ...bed(CLIMB, octaves),
      kick: bars(
        KICK_HALF,
        KICK_HALF,
        KICK_HALF,
        KICK_HALF,
        KICK_FOUR,
        KICK_FOUR,
        KICK_FOUR,
        KICK_FOUR,
      ),
      clap: bars(
        SNARE_HALF,
        SNARE_HALF,
        SNARE_HALF,
        SNARE_HALF,
        SNARE_24,
        SNARE_24,
        SNARE_24,
        SNARE_24,
      ),
      hat: bars(HAT_OFF, HAT_OFF, HAT_OFF, HAT_OFF, HAT_8, HAT_8, HAT_8, HAT_8),
    },

    outro: {
      ...bed(CADENCE, octaves),
      kick: bars(KICK_FOUR),
      hat: bars(HAT_8),
    },
  },

  order: ["intro", "a", "b", "a", "c", "d", "b", "outro"],
};
