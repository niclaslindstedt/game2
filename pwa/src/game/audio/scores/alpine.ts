// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SNOWLINE — the stage theme for the alpine.
//
// E dorian at 120 bpm: 48 bars, ninety-six seconds. A stage that starts
// on packed snow above the treeline and comes down through the larches to
// a farmed valley with a lake in it wants a score with air in it — cold,
// wide, and mostly still — and the two things every other stage theme is
// built on, a guitar and a bass, are the two things it does without.
//
// THREE DECISIONS:
//
//   1. THE PADS ARE THE PIECE, AND THEY ARE HIGH AND OPEN. Three sawtooth
//      pads voiced an octave over every other score's, in fifths and ninths
//      with the third left out of the low pair, on a half-second attack —
//      the thirdless, glassy sound of a range with the sun on it. There is
//      no guitar anywhere, and the bass is ABSENT for half the loop: the
//      low end belongs to the engine, and a plucked root only comes in
//      under the chorus and the build.
//   2. THE DRIP IS IN THREE OVER FOUR. A glass bell strikes every six steps
//      under the pads — a dotted-quarter pulse across a 4/4 bar — so the
//      figure comes round every three bars and lands somewhere new on each
//      bar it crosses. Meltwater off an eave: it is the one thing that moves
//      through the opening, and in the chorus it doubles to every three.
//   3. THE PULSE PICKS UP. A heartbeat kick on the one, then the halves,
//      then four to the floor — the piece climbs from a standstill on the
//      grid to the flat-out of the chorus and falls back to the break's
//      stillness. The dorian IV (an A major under an E minor stage) is the
//      only warmth in it, and a B major at the end of the build is the
//      harmonic-minor lurch back into the chorus.
//
// The melodies are original.

import { bars, type Track } from "../../../lib/tracker.ts";

import {
  bass,
  bell,
  hat,
  HAT_8,
  HAT_OFF,
  hold,
  kick,
  KICK_FOUR,
  KICK_HALF,
  lead,
  pad,
  quarters,
  REST,
  snare,
  SNARE_24,
  SNARE_FILL,
  SNARE_HALF,
  voice,
  type Triad,
} from "./kit.ts";

// The pads: root and fifth low, the ninth (or the dorian third) on top.
const PAD_LOW: Record<string, string> = {
  Em: "E4",
  D: "D4",
  A: "E4",
  Bm: "D4",
  C: "E4",
  G: "D4",
  B: "D#4",
};
const PAD_MID: Record<string, string> = {
  Em: "B4",
  D: "A4",
  A: "A4",
  Bm: "B4",
  C: "G4",
  G: "G4",
  B: "B4",
};
const PAD_TOP: Record<string, string> = {
  Em: "F#5",
  D: "E5",
  A: "C#5",
  Bm: "F#5",
  C: "D5",
  G: "D5",
  B: "F#5",
};
const ROOT: Record<string, string> = {
  Em: "E2",
  D: "D2",
  A: "A2",
  Bm: "B2",
  C: "C2",
  G: "G2",
  B: "B2",
};
// The drip: the chord's tones an octave over the pads, inside one octave,
// so it glitters at one height whatever the harmony does.
const DRIP: Record<string, Triad> = {
  Em: ["B5", "E6", "G6"],
  D: ["A5", "D6", "F#6"],
  A: ["A5", "C#6", "E6"],
  Bm: ["B5", "D6", "F#6"],
  C: ["C6", "E6", "G6"],
  G: ["B5", "D6", "G6"],
  B: ["B5", "D#6", "F#6"],
};

const OPENING = ["Em", "Em", "Em", "C"];
const VERSE = ["Em", "Em", "D", "D", "A", "A", "Em", "Em"];
const CHORUS = ["C", "D", "Em", "Em", "C", "D", "A", "Bm"];
const BREAK = ["Em", "Em", "C", "C", "G", "G", "D", "D"];
const BUILD = ["Em", "Em", "C", "C", "D", "D", "B", "B"];
const CADENCE = ["A", "A", "Em", "Em"];

/** The drip, written across the whole plan rather than a bar at a time so
 * the three-over-four phase carries over every bar line: one glass note
 * every `every` steps, walking the bar's chord tones. */
function drip(plan: string[], every: number): string[] {
  const tokens: string[] = [];
  let struck = 0;
  plan.forEach((chord, bar) => {
    const tones = DRIP[chord];
    if (!tones) throw new Error(`no drip for chord "${chord}"`);
    for (let step = 0; step < 16; step++) {
      if ((bar * 16 + step) % every === 0) {
        tokens.push(tones[struck % 3] as string);
        struck++;
      } else {
        tokens.push(".");
      }
    }
  });
  return tokens;
}

/** The bass pulse: the root on the one and the three, and nothing else. */
const pulse = (note: string): string => `${note} =  =  .  .  .  .  .  ${note} =  =  .  .  .  .  .`;

/** The three pads and the drip — the bed every section stands on. */
function bed(plan: string[], every: number): Record<string, string[]> {
  return {
    padLow: bars(...plan.map((c) => hold(voice(PAD_LOW, c)))),
    padMid: bars(...plan.map((c) => hold(voice(PAD_MID, c)))),
    padTop: bars(...plan.map((c) => hold(voice(PAD_TOP, c)))),
    drip: drip(plan, every),
  };
}

/** The heartbeat: one kick on the one, and a bar of nothing. */
const KICK_ONE = "C2 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .";

/** A breath of wind, held for a bar, then a bar of silence. */
const BREATH = "x  =  =  =  =  =  =  =  =  =  =  =  =  =  =  =";

export const ALPINE_TRACK: Track = {
  bpm: 120,
  stepsPerBeat: 4,
  instruments: {
    padLow: pad(0.011, 900, -0.45, { open: 1.6, attackMs: 520, echo: 0.32 }),
    padMid: pad(0.01, 1100, 0.45, { open: 1.6, attackMs: 520, echo: 0.32 }),
    padTop: pad(0.009, 1500, 0, { open: 1.6, attackMs: 560, echo: 0.36 }),
    // The glass: a sine bell struck and left in a long echo.
    drip: { ...bell(0.012, 0.3), echo: 0.6 },
    // The lead is glass too — a triangle with almost no vibrato, through a
    // lowpass that opens, deep in the same echo. No edge on it anywhere.
    glass: lead(0.026, "triangle", 2600, { echo: 0.5, detune: 5, vibrato: 10 }),
    bass: bass(0.045, 380, { hold: 0.2, gate: 0.4 }),
    // A breath: pink noise swelling over half a second and holding — the
    // wind crossing the col, once every other bar in the sections with no
    // kit in them.
    breath: {
      wave: "noise",
      volume: 0.01,
      gate: 1,
      hold: 0.8,
      attackMs: 500,
      color: "pink",
      pan: -0.2,
      echo: 0.3,
      filter: { type: "lowpass", frequency: 700, to: 1400 },
    },
    kick: kick(0.05, 190),
    snare: snare(0.02, 1500),
    hat: hat(0.007, 0.3, 6200),
  },

  patterns: {
    // The grid: pads, the drip, a breath, and a heartbeat.
    intro: {
      ...bed(OPENING, 6),
      breath: bars(BREATH, REST),
      kick: bars(KICK_ONE),
    },

    // The verse: the kick finds the halves and a snare answers it. No bass,
    // no lead — the pads and the drip are the tune.
    a: {
      ...bed(VERSE, 6),
      kick: bars(KICK_HALF),
      snare: bars(SNARE_HALF),
    },

    // The chorus: four to the floor, the drip doubled, the bass pulsing on
    // the one and the three, and the glass lead.
    b: {
      ...bed(CHORUS, 3),
      bass: bars(...CHORUS.map((c) => pulse(voice(ROOT, c)))),
      glass: bars(
        "G5 =  =  =  =  =  =  =  E5 =  =  =  =  =  =  =",
        "F#5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "B4 =  =  =  =  =  =  =  D5 =  =  =  E5 =  =  =",
        "=  =  =  =  =  =  =  =  .  .  .  .  .  .  .  .",
        "G5 =  =  =  =  =  =  =  A5 =  =  =  =  =  =  =",
        "B5 =  =  =  =  =  =  =  =  =  =  =  A5 =  =  =",
        "E5 =  =  =  =  =  =  =  C#5 =  =  =  =  =  =  =",
        "D5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      kick: bars(KICK_FOUR),
      snare: bars(SNARE_24),
      hat: bars(HAT_8),
    },

    // The break: the kit and the bass gone, the breath back, and the lead
    // slower and lower — the col itself.
    c: {
      ...bed(BREAK, 6),
      glass: bars(
        "E5 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        ".  .  .  .  .  .  .  .  F#5 =  =  =  G5 =  =  =",
        "E5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        ".  .  .  .  .  .  .  .  .  .  .  .  D5 =  =  =",
        "B4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
        ".  .  .  .  .  .  .  .  D5 =  =  =  G5 =  =  =",
        "A5 =  =  =  =  =  =  =  F#5 =  =  =  =  =  =  =",
        "E5 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      breath: bars(BREATH, REST),
    },

    // The build: the bass in quarters, the kick from the halves to the
    // fours, the snare finding the backbeat and filling, the hat opening —
    // and the B major under the last two bars.
    d: {
      ...bed(BUILD, 6),
      bass: bars(...BUILD.map((c) => quarters(voice(ROOT, c)))),
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
      snare: bars(
        SNARE_HALF,
        SNARE_HALF,
        SNARE_HALF,
        SNARE_HALF,
        SNARE_24,
        SNARE_24,
        SNARE_FILL,
        SNARE_FILL,
      ),
      hat: bars(HAT_OFF, HAT_OFF, HAT_OFF, HAT_OFF, HAT_8, HAT_8, HAT_8, HAT_8),
    },

    // The cadence: the dorian IV home to the tonic, the bass still pulsing
    // and the hat on the offbeats, so the loop lands back on the heartbeat
    // from something that was still moving.
    outro: {
      ...bed(CADENCE, 6),
      bass: bars(...CADENCE.map((c) => pulse(voice(ROOT, c)))),
      kick: bars(KICK_HALF),
      hat: bars(HAT_OFF),
    },
  },

  order: ["intro", "a", "b", "c", "d", "b", "outro"],
};
