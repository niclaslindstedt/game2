// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SERVICE PARK, FIRST LIGHT — the menu theme.
//
// A cold A-minor loop at 96 bpm: 48 bars, about two minutes, which is roughly
// how long a player spends choosing a car and a stage before they press the
// thing that starts one.
//
// THREE DECISIONS, and they are what the next person retuning this should
// check their work against:
//
//   1. IT IS A ROOM WITH WEATHER IN IT, NOT A FANFARE. The menu plays over the
//      game itself — a bot driving a generated stage under the drone camera —
//      so the score is the air around that, not a competing event. Nothing in
//      it climbs; the loudest bar is barely louder than the quietest.
//   2. THE PAD IS REAL. Three sustaining sawtooth voices hold the chord across
//      whole bars (`hold`), which is the thing a chip sequencer cannot
//      do and the single biggest reason this reads as a PlayStation cue rather
//      than a SNES one. Every earlier attempt at a bed here was a RE-STRUCK
//      chord, and a re-struck chord is not a texture, it is a tune nobody
//      wrote.
//   3. THE MELODY BREATHES EVERY TWO BARS. Each phrase ends a beat early and
//      leaves the pad and the arpeggio alone in the gap. A line with no rest
//      in it cannot be a hook, and this one has to survive being heard on
//      every single launch of the game.
//
// The harmony leans on the progressions game scores have always run on —
// i–VI–III–VII under the verse, a VI–III–VII–i turn for the lift — but the
// melodies are original.

import { bars, type Track } from "../../../lib/tracker.ts";

/** One bar of a note held all the way through — what a pad plays. */
const hold = (note: string): string => `${note} ${"= ".repeat(15)}`;

/** One bar of the bass figure: a long root, a push, and two more. The gap
 * after the first note is what keeps this from being a drone. */
const pump = (note: string): string =>
  `${note} .  .  .  ${note} .  ${note} .  ${note} .  .  .  ${note} .  ${note} .`;

/** One bar of a rising-falling eighth arpeggio, twice. */
const arp = (a: string, b: string, c: string): string =>
  `${a} .  ${b} .  ${c} .  ${b} .  ${a} .  ${b} .  ${c} .  ${b} .`;

// The chord voicings, kept close together so the pad moves by step rather than
// by leap: a bed that jumps an octave between bars stops being a bed.
const PAD_LOW: Record<string, string> = { Am: "A3", F: "A3", C: "G3", G: "G3", Dm: "A3", Em: "G3" };
const PAD_MID: Record<string, string> = { Am: "C4", F: "C4", C: "C4", G: "B3", Dm: "D4", Em: "B3" };
const PAD_TOP: Record<string, string> = { Am: "E4", F: "F4", C: "E4", G: "D4", Dm: "F4", Em: "E4" };
const ROOT: Record<string, string> = { Am: "A2", F: "F2", C: "C3", G: "G2", Dm: "D2", Em: "E2" };
const ARP: Record<string, [string, string, string]> = {
  Am: ["A3", "C4", "E4"],
  F: ["F3", "A3", "C4"],
  C: ["C4", "E4", "G4"],
  G: ["G3", "B3", "D4"],
  Dm: ["D3", "F3", "A3"],
  Em: ["E3", "G3", "B3"],
};

/** Every mechanical voice of a section, built from its chord plan — so the
 * progression is written once and cannot come to differ between the pad, the
 * bass and the arpeggio. `drop` leaves a voice out of the section entirely;
 * an EMPTY line is not the way to silence one, because a zero-length voice has
 * no length to divide the pattern's.  */
function chords(plan: string[], drop: string[] = []): Record<string, string[]> {
  const out: Record<string, string[]> = {
    padLow: bars(...plan.map((c) => hold(PAD_LOW[c] as string))),
    padMid: bars(...plan.map((c) => hold(PAD_MID[c] as string))),
    padTop: bars(...plan.map((c) => hold(PAD_TOP[c] as string))),
    bass: bars(...plan.map((c) => pump(ROOT[c] as string))),
    arp: bars(...plan.map((c) => arp(...(ARP[c] as [string, string, string])))),
  };
  for (const name of drop) delete out[name];
  return out;
}

const VERSE = ["Am", "Am", "F", "F", "C", "C", "G", "G"];
const LIFT = ["F", "C", "G", "Am", "F", "C", "G", "G"];
const BREAK = ["Dm", "Dm", "Am", "Am", "Em", "Em", "F", "G"];

export const MENU_TRACK: Track = {
  bpm: 96,
  stepsPerBeat: 4,
  instruments: {
    // The pad, in three voices spread across the stereo picture. Filtered
    // dark and opened only slightly across each note, which is what a bowed
    // or blown thing does and a chip voice never did.
    padLow: {
      wave: "sawtooth",
      volume: 0.012,
      gate: 1,
      hold: 0.9,
      attackMs: 240,
      detuneCents: 12,
      pan: -0.35,
      echo: 0.22,
      filter: { type: "lowpass", frequency: 620, to: 1000, q: 0.8 },
    },
    padMid: {
      wave: "sawtooth",
      volume: 0.011,
      gate: 1,
      hold: 0.9,
      attackMs: 260,
      detuneCents: 14,
      pan: 0.3,
      echo: 0.24,
      filter: { type: "lowpass", frequency: 760, to: 1200, q: 0.8 },
    },
    padTop: {
      wave: "sawtooth",
      volume: 0.009,
      gate: 1,
      hold: 0.88,
      attackMs: 300,
      detuneCents: 16,
      echo: 0.3,
      filter: { type: "lowpass", frequency: 900, to: 1600, q: 0.9 },
    },
    // A round, slightly driven bass — the one voice with any weight in it.
    bass: {
      wave: "triangle",
      volume: 0.05,
      gate: 0.55,
      hold: 0.4,
      drive: 0.3,
      filter: { type: "lowpass", frequency: 420 },
    },
    // The tune: a filtered sawtooth with a slow vibrato, which is as close to
    // a breath as this instrument gets.
    lead: {
      wave: "sawtooth",
      volume: 0.026,
      gate: 0.95,
      hold: 0.45,
      attackMs: 60,
      detuneCents: 7,
      echo: 0.34,
      vibrato: { rateHz: 4.8, depthCents: 16, delayMs: 320 },
      filter: { type: "lowpass", frequency: 1800, to: 2600, q: 1.1 },
    },
    // Rain on a windscreen: the arpeggio, plucked short and pushed right.
    arp: {
      wave: "triangle",
      volume: 0.014,
      gate: 0.28,
      pan: 0.4,
      echo: 0.3,
      filter: { type: "bandpass", frequency: 1600, q: 1.2 },
    },
    // The one bright thing in the mix, and it only appears in the intro and
    // the break — a glassy bell far out to the left, deep in the echo.
    bell: {
      wave: "sine",
      volume: 0.018,
      gate: 0.6,
      hold: 0.3,
      attackMs: 12,
      pan: -0.45,
      echo: 0.55,
    },
    kick: {
      wave: "triangle",
      volume: 0.055,
      gate: 0.5,
      slide: 0.22,
      filter: { type: "lowpass", frequency: 260 },
    },
    snare: {
      wave: "noise",
      volume: 0.024,
      gate: 0.4,
      color: "pink",
      filter: { type: "bandpass", frequency: 1500, to: 900, q: 1 },
    },
    hat: {
      wave: "noise",
      volume: 0.008,
      gate: 0.16,
      pan: 0.25,
      filter: { type: "highpass", frequency: 7500 },
    },
  },

  patterns: {
    // Nothing but the bed and a bell, so the loop has somewhere to come back
    // to and the first thing the player ever hears is not the tune.
    intro: {
      // No arpeggio: the room is the point.
      ...chords(["Am", "Am", "F", "G"], ["arp"]),
      bell: bars(
        "A4 =  =  =  C5 =  =  =  E5 =  =  =  =  =  =  =",
        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "A4 =  =  =  C5 =  =  =  F5 =  =  =  =  =  =  =",
        "G4 =  =  =  B4 =  =  =  D5 =  =  =  =  =  =  =",
      ),
    },

    // The verse: the tune arrives, the kit stays off the snare so it walks
    // rather than marches.
    a: {
      ...chords(VERSE),
      lead: bars(
        "A4 =  =  =  =  =  =  =  C5 =  =  =  B4 =  =  =",
        "A4 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "C5 =  =  =  =  =  =  =  A4 =  =  =  G4 =  =  =",
        "F4 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "G4 =  =  =  E4 =  =  =  G4 =  =  =  C5 =  =  =",
        "B4 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "D5 =  =  =  B4 =  =  =  A4 =  =  =  G4 =  =  =",
        "B4 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
      ),
      kick: bars("C2 .  .  .  .  .  .  .  C2 .  .  .  .  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // The lift: the same room with the roof off. The snare comes in, the
    // melody sits a third higher and stops resting so often.
    b: {
      ...chords(LIFT),
      lead: bars(
        "F4 =  =  =  G4 =  A4 =  C5 =  =  =  =  =  =  =",
        "E5 =  =  =  =  =  =  =  C5 =  =  =  G4 =  =  =",
        "D5 =  =  =  B4 =  =  =  D5 =  =  =  =  =  =  =",
        "C5 =  =  =  A4 =  =  =  =  =  =  =  .  .  .  .",
        "F4 =  =  =  G4 =  A4 =  C5 =  =  =  E5 =  =  =",
        "G5 =  =  =  =  =  =  =  E5 =  =  =  C5 =  =  =",
        "D5 =  =  =  =  =  =  =  B4 =  =  =  G4 =  =  =",
        "A4 =  =  =  B4 =  =  =  =  =  =  =  .  .  .  .",
      ),
      kick: bars("C2 .  .  .  .  .  .  .  C2 .  .  .  C2 .  .  ."),
      snare: bars(".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  ."),
      hat: bars("x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  ."),
    },

    // The break: no kit, no tune, no arpeggio — the pad, the bass and the bell
    // in a room that has emptied out. This is the section that makes the rest
    // of the loop feel like it has somewhere to go.
    c: {
      ...chords(BREAK, ["arp"]),
      bell: bars(
        "A5 =  =  =  =  =  =  =  .  .  .  .  C6 =  =  =",
        "B5 =  =  =  =  =  =  =  .  .  .  .  .  .  .  .",
        "C6 =  =  =  =  =  =  =  E5 =  =  =  .  .  .  .",
        ".  .  .  .  A5 =  =  =  .  .  .  .  .  .  .  .",
        "F5 =  =  =  =  =  =  =  A5 =  =  =  .  .  .  .",
        "G5 =  =  =  =  =  =  =  B5 =  =  =  .  .  .  .",
        "E5 =  =  =  G5 =  =  =  B5 =  =  =  .  .  .  .",
        ".  .  .  .  .  .  .  .  D5 =  =  =  =  =  =  =",
      ),
    },

    // Four bars back to the top: the tune's opening phrase, unaccompanied by
    // anything with a stick in its hand.
    outro: {
      ...chords(["Am", "F", "G", "Am"]),
      lead: bars(
        "A4 =  =  =  =  =  =  =  C5 =  =  =  B4 =  =  =",
        "A4 =  =  =  =  =  =  =  =  =  =  =  .  .  .  .",
        "G4 =  =  =  =  =  =  =  B4 =  =  =  .  .  .  .",
        "A4 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =",
      ),
    },
  },

  order: ["intro", "a", "b", "a", "c", "b", "outro"],
};
