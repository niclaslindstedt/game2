// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SALT PAN — the stage theme for the desert.
//
// E at 126 bpm — E mixolydian with a blues in it: 56 bars, a hundred and
// seven seconds. Sand roads, saguaros, a sky with nothing in it and a road
// you can see for three kilometres: the desert wants a groove, not a
// gallop, and it wants a guitar that bends.
//
// THREE DECISIONS:
//
//   1. THE RIFF IS A BLUES SHAPE, and it TRANSPOSES. Root, flat third,
//      fourth, flat fifth, fifth — the box every rock guitarist learns
//      first — walked by the bass and doubled by the low guitar, and moved
//      with the chord rather than left on the tonic, so the I–♭VII–IV
//      verse is three riffs and not one riff over three chords.
//   2. THE KIT IS TOMS AND A SHAKER. No hi-hat. A rally through a desert is
//      a big open sound, and a sixteenth hat is a small closed one; the
//      time is kept by a shaker (a pink hat) and a floor tom under it.
//   3. THE LEAD SLIDES. A second voice a semitone under every lead note
//      glides up into it and dies — the instrument's own `slide`, set once
//      — which is what makes a sawtooth read as a slide guitar rather than
//      a synth.
//
// The riff shape is as old as the blues; the melodies are original.

import { bars, type Track } from "../../../lib/tracker.ts";

import {
  bass,
  clap,
  guitar,
  hit,
  hold,
  kick,
  KICK_HALF,
  KICK_PUSH,
  pad,
  SNARE_24,
  SNARE_FILL,
  SNARE_HALF,
  tom,
  voice,
} from "./kit.ts";

/** The blues box, per chord: root, flat third, fourth, flat fifth, fifth. */
const BOX: Record<string, [string, string, string, string, string]> = {
  E: ["E2", "G2", "A2", "A#2", "B2"],
  D: ["D2", "F2", "G2", "G#2", "A2"],
  A: ["A2", "C3", "D3", "D#3", "E3"],
  G: ["G2", "A#2", "C3", "C#3", "D3"],
  B: ["B2", "D3", "E3", "F3", "F#3"],
};
const GTR_LO: Record<string, string> = { E: "E3", D: "D3", A: "A3", G: "G3", B: "B3" };
const GTR_HI: Record<string, string> = { E: "B3", D: "A3", A: "E4", G: "D4", B: "F#4" };
const PAD_LOW: Record<string, string> = { E: "B3", D: "A3", A: "A3", G: "B3", B: "B3" };
const PAD_TOP: Record<string, string> = { E: "E4", D: "D4", A: "E4", G: "D4", B: "D#4" };

type Box = [string, string, string, string, string];

const box = (chord: string): Box => {
  const notes = BOX[chord];
  if (!notes) throw new Error(`no blues box for chord "${chord}"`);
  return notes;
};

/** The chord's root, for the sections where the bass holds. */
const root = (chord: string): string => box(chord)[0];

/** The riff, one bar: the box walked up with a rest before the turn. */
const riff = ([r, b3, p4, b5, p5]: Box): string =>
  `${r} .  .  ${r} .  .  ${b3} .  ${p4} .  .  .  ${b5} .  ${p5} .`;

/** The low guitar doubling the riff an octave up. */
const riffUp = (chord: string): string => {
  const up = (n: string): string => n.replace(/\d$/, (d) => String(Number(d) + 1));
  return riff(box(chord).map(up) as Box);
};

const VERSE = ["E", "E", "D", "D", "A", "A", "E", "E"];
const CHORUS = ["A", "A", "G", "G", "D", "D", "E", "E"];
const BREAK = ["E", "E", "G", "G", "A", "A", "B", "B"];
const BUILD = ["E", "E", "E", "E", "D", "D", "B", "B"];

/** The riff section: the bass walks the box, the low guitar doubles it, the
 * high guitar hits the chord on the one. */
function groove(plan: string[]): Record<string, string[]> {
  return {
    bass: bars(...plan.map((c) => riff(box(c)))),
    gtrLo: bars(...plan.map((c) => riffUp(c))),
    gtrHi: bars(...plan.map((c) => hit(voice(GTR_HI, c)))),
  };
}

/** The wall: both guitars held, the bass on the root. */
function wall(plan: string[]): Record<string, string[]> {
  return {
    bass: bars(...plan.map((c) => hold(root(c)))),
    gtrLo: bars(...plan.map((c) => hold(voice(GTR_LO, c)))),
    gtrHi: bars(...plan.map((c) => hold(voice(GTR_HI, c)))),
    padLow: bars(...plan.map((c) => hold(voice(PAD_LOW, c)))),
    padTop: bars(...plan.map((c) => hold(voice(PAD_TOP, c)))),
  };
}

/** The shaker line: sixteenths with the accents on the offbeat. */
const SHAKER = "x  .  x  x  .  x  x  .  x  .  x  x  .  x  x  .";

export const DESERT_TRACK: Track = {
  bpm: 126,
  stepsPerBeat: 4,
  instruments: {
    bass: bass(0.052, 460, { hold: 0.3, gate: 0.55 }),
    gtrLo: guitar(0.022, -0.3, 1400),
    gtrHi: guitar(0.018, 0.3, 1700),
    padLow: pad(0.01, 800, -0.3, { open: 1.4, attackMs: 300 }),
    padTop: pad(0.009, 1000, 0.3, { open: 1.4, attackMs: 300 }),
    // The slide guitar is two voices: the note itself, and an APPROACH a
    // semitone under it that glides up into it over its short life — the
    // sequencer can only glide a note away from its own pitch, so the bend
    // INTO a note is a second voice written a semitone flat.
    lead: {
      wave: "sawtooth",
      volume: 0.028,
      gate: 0.95,
      hold: 0.55,
      attackMs: 30,
      detuneCents: 7,
      echo: 0.35,
      vibrato: { rateHz: 5, depthCents: 30, delayMs: 260 },
      filter: { type: "lowpass", frequency: 2200, to: 3000, q: 1.2 },
    },
    slide: {
      wave: "sawtooth",
      volume: 0.02,
      gate: 0.5,
      hold: 0.1,
      attackMs: 20,
      detuneCents: 7,
      echo: 0.35,
      slide: 1.06,
      filter: { type: "lowpass", frequency: 2000, to: 2600, q: 1.2 },
    },
    kick: kick(0.058, 220),
    clap: clap(0.026),
    tom: tom(0.036, 480),
    shaker: {
      wave: "noise",
      volume: 0.008,
      gate: 0.2,
      color: "pink",
      pan: 0.35,
      filter: { type: "highpass", frequency: 4200 },
    },
  },

  patterns: {
    // The riff on its own, four times, with the kick and the shaker.
    intro: {
      ...groove(["E", "E", "E", "E"]),
      kick: bars(KICK_HALF),
      shaker: bars(SHAKER),
    },

    // The verse: the riff moving with the chords, the toms under it.
    a: {
      ...groove(VERSE),
      kick: bars(KICK_PUSH),
      clap: bars(SNARE_HALF),
      shaker: bars(SHAKER),
      tom: bars(
        ".  .  .  .  .  .  .  .  .  .  E2 .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  E2 .  .  .  E2 .",
      ),
    },

    // The chorus: the wall, the clap on the backbeat, the slide lead.
    b: {
      ...wall(CHORUS),
      lead: bars(
        "E5 =  =  =  G5 =  =  =  E5 =  =  =  D5 =  =  =",
        "B4 =  =  =  =  =  =  =  D5 =  =  =  E5 =  =  =",
        "G5 =  =  =  =  =  =  =  E5 =  =  =  D5 =  =  =",
        "B4 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "A5 =  =  =  G5 =  =  =  E5 =  =  =  =  =  =  =",
        "D5 =  =  =  E5 =  =  =  G5 =  =  =  =  =  =  =",
        "E5 =  =  =  =  =  =  =  D5 =  =  =  B4 =  =  =",
        "E5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      slide: bars(
        "D#5 .  .  .  F#5 .  .  .  D#5 .  .  .  C#5 .  .  .",
        "A#4 .  .  .  .  .  .  .  C#5 .  .  .  D#5 .  .  .",
        "F#5 .  .  .  .  .  .  .  D#5 .  .  .  C#5 .  .  .",
        "A#4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "G#5 .  .  .  F#5 .  .  .  D#5 .  .  .  .  .  .  .",
        "C#5 .  .  .  D#5 .  .  .  F#5 .  .  .  .  .  .  .",
        "D#5 .  .  .  .  .  .  .  C#5 .  .  .  A#4 .  .  .",
        "D#5 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
      ),
      kick: bars(KICK_PUSH),
      clap: bars(SNARE_24),
      shaker: bars(SHAKER),
    },

    // The break: half-time, the pads up, the guitars gone, the lead alone
    // and slow — the heat shimmer.
    c: {
      bass: bars(...BREAK.map((c) => hold(root(c)))),
      padLow: bars(...BREAK.map((c) => hold(voice(PAD_LOW, c)))),
      padTop: bars(...BREAK.map((c) => hold(voice(PAD_TOP, c)))),
      lead: bars(
        "B4 =  =  =  =  =  =  =  =  =  =  =  D5 =  =  =",
        "E5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "G5 =  =  =  =  =  =  =  =  =  =  =  E5 =  =  =",
        "D5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "A4 =  =  =  =  =  =  =  =  =  =  =  C5 =  =  =",
        "E5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "F#5 =  =  =  =  =  =  =  D#5 =  =  =  =  =  =  =",
        "B4 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      kick: bars(KICK_HALF),
      shaker: bars(SHAKER),
    },

    // The build: the riff on the tonic for four bars, the toms rolling, the
    // clap filling, and the ♭VII and the V to turn it round.
    d: {
      ...groove(BUILD),
      kick: bars(KICK_PUSH),
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
      shaker: bars(SHAKER),
      tom: bars(
        ".  .  .  .  .  .  .  .  .  .  E2 .  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  E2 .  .  .  E2 .",
        ".  .  .  .  .  .  .  .  .  .  E2 .  .  .  .  .",
        ".  .  .  .  .  .  .  .  E2 .  E2 .  E2 .  E2 .",
        ".  .  .  .  .  .  .  .  .  .  D2 .  .  .  .  .",
        ".  .  .  .  .  .  .  .  D2 .  D2 .  D2 .  D2 .",
        "B2 .  .  .  B2 .  .  .  B2 .  B2 .  B2 .  B2 .",
        "B2 .  B2 .  B2 .  B2 .  B2 B2 B2 B2 B2 B2 B2 B2",
      ),
    },

    // The turnaround, with the clap still on the halves so the loop lands
    // back on its own riff without the kit having stopped.
    outro: {
      ...groove(["D", "A", "E", "E"]),
      kick: bars(KICK_HALF),
      clap: bars(SNARE_HALF),
      shaker: bars(SHAKER),
    },
  },

  order: ["intro", "a", "b", "a", "c", "d", "b", "outro"],
};
