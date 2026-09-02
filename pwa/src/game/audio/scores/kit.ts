// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE KIT — what every score is built with, so a score file is its
// DECISIONS and its tunes rather than four hundred lines of the same drum
// patch and the same "sixteen ties" written out again.
//
// Two kinds of thing live here. FIGURES turn one note (or one chord) into a
// bar of tokens: a chord held, a bass in eighths, a guitar chugging, brass on
// the offbeats. PATCHES build the instruments every score reaches for — a
// kick, a snare, a hat, a pad, a bass — with the few numbers that differ
// between scores as arguments and the ones that must not differ (the hat's
// ceiling, the volumes) fixed.
//
// THE HAT SITS UNDER 7 kHz, ALWAYS. iOS runs a hands-free Bluetooth session
// at 16 kHz, where every cutoff is held under 7.2 kHz off Nyquist; a hat
// authored above that is a hat with nothing left to pass on a headset. A
// test holds every score's hat to it, and building the hat here is what
// makes that hard to get wrong.
//
// AND THE MUSIC IS QUIET. It plays under an engine for the whole run; it is
// the bed, not the event. Every patch here is capped by the same test that
// caps the banks, and the defaults are well inside it.

import type { Instrument } from "../../../lib/tracker.ts";

/** A triad, low to high — what an arpeggio walks. */
export type Triad = [string, string, string];

// ── Figures ───────────────────────────────────────────────────────────────

/** One bar of a note held all the way through — a pad, a drone. */
export const hold = (note: string): string => `${note} ${"= ".repeat(15)}`;

/** Two notes, each held half a bar. */
export const halves = (a: string, b: string): string =>
  `${a} ${"= ".repeat(7)} ${b} ${"= ".repeat(7)}`;

/** Straight eighths on one note — the plainest bass there is. */
export const eighths = (note: string): string =>
  `${note} .  ${note} .  ${note} .  ${note} .  ${note} .  ${note} .  ${note} .  ${note} .`;

/** Straight quarters. */
export const quarters = (note: string): string =>
  `${note} .  .  .  ${note} .  .  .  ${note} .  .  .  ${note} .  .  .`;

/** The rock chug: two stabs, a long one across the middle, and a push. */
export const chug = (note: string): string =>
  `${note} =  .  .  ${note} =  .  .  ${note} =  =  =  .  .  ${note} =`;

/** The gallop — a triplet feel written in sixteenths: long-short-short. */
export const gallop = (note: string): string =>
  `${note} =  ${note} ${note} ${note} =  ${note} ${note} ${note} =  ${note} ${note} ${note} =  ${note} ${note}`;

/** A bass that bounces the octave on the back half of the bar. */
export const bounce = (lo: string, hi: string): string =>
  `${lo} .  ${lo} .  ${lo} .  ${hi} .  ${lo} .  ${lo} .  ${hi} .  ${hi} .`;

/** A held root and two pushes — the wide chorus bass. */
export const push = (lo: string, hi: string): string =>
  `${lo} =  =  .  ${lo} .  ${hi} .  ${lo} =  =  .  ${hi} .  ${lo} .`;

/** Octaves four to the bar — the hardest figure there is. */
export const straight = (lo: string, hi: string): string =>
  `${lo} .  ${hi} .  ${lo} .  ${hi} .  ${lo} .  ${hi} .  ${lo} .  ${hi} .`;

/** The disco/synthwave bass: root on the beat, octave on the off. */
export const octaves = (lo: string, hi: string): string =>
  `${lo} .  ${hi} .  ${lo} .  ${hi} .  ${lo} .  ${hi} .  ${lo} .  ${hi} .`;

/** A dotted bass — long, short, long, short — that leans forward. */
export const dotted = (note: string): string =>
  `${note} =  =  .  ${note} =  .  .  ${note} =  =  .  ${note} =  .  .`;

/** Brass on the offbeats — twice a bar and once late. */
export const stab = (note: string): string =>
  `.  .  ${note} =  .  .  ${note} =  .  .  .  .  ${note} =  .  .`;

/** Brass across half a bar each — a wall rather than a punch. */
export const swell = (note: string): string =>
  `${note} =  =  =  =  =  =  =  ${note} =  =  =  =  =  =  =`;

/** A chord hit on the ONE and left to ring. */
export const hit = (note: string): string => `${note} =  =  =  =  =  .  .  .  .  .  .  .  .  .  .`;

/** Eighth-note arpeggio, up and back. */
export const arp8 = ([a, b, c]: Triad): string =>
  `${a} .  ${b} .  ${c} .  ${b} .  ${a} .  ${b} .  ${c} .  ${b} .`;

/** The same shape in sixteenths. */
export const arp16 = ([a, b, c]: Triad): string =>
  `${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b}`;

/** A rising sixteenth arpeggio that keeps climbing — the third is repeated
 * an octave down so the line rolls rather than bounces. */
export const roll16 = ([a, b, c]: Triad): string =>
  `${a} ${b} ${c} ${a} ${b} ${c} ${a} ${b} ${c} ${a} ${b} ${c} ${a} ${b} ${c} ${b}`;

/** A gated pluck: one note, eight to the bar, the synthwave ostinato. */
export const pluck8 = (note: string): string => eighths(note);

/** A bar of silence for a voice a section keeps but rests. */
export const REST = ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .";

// ── Drum lines, one bar each ───────────────────────────────────────────────
// The kick is a PITCHED voice (a dropping triangle), so its line is written
// in notes; the noise voices trigger on any word, so theirs are `x`.

export const KICK_FOUR = "C2 .  .  .  C2 .  .  .  C2 .  .  .  C2 .  .  .";
export const KICK_ROCK = "C2 .  .  .  .  .  C2 .  C2 .  .  .  .  .  C2 .";
export const KICK_HALF = "C2 .  .  .  .  .  .  .  C2 .  .  .  .  .  .  .";
export const KICK_PUSH = "C2 .  .  .  .  .  C2 .  .  .  C2 .  .  .  .  .";
export const SNARE_24 = ".  .  .  .  x  .  .  .  .  .  .  .  x  .  .  .";
export const SNARE_HALF = ".  .  .  .  .  .  .  .  x  .  .  .  .  .  .  .";
export const SNARE_FILL = ".  .  .  .  x  .  .  .  x  .  x  .  x  .  x  .";
export const HAT_8 = "x  .  x  .  x  .  x  .  x  .  x  .  x  .  x  .";
export const HAT_OFF = ".  .  x  .  .  .  x  .  .  .  x  .  .  .  x  .";
export const HAT_16 = "x  x  x  x  x  x  x  x  x  x  x  x  x  x  x  x";

// ── Patches ───────────────────────────────────────────────────────────────

/** A kick: a triangle dropping four octaves in a tenth of a second. */
export const kick = (volume = 0.055, cutoff = 240): Instrument => ({
  wave: "triangle",
  volume,
  gate: 0.45,
  slide: 0.2,
  filter: { type: "lowpass", frequency: cutoff },
});

/** A snare: pink noise through a bandpass that falls across the hit. */
export const snare = (volume = 0.028, hz = 1700): Instrument => ({
  wave: "noise",
  volume,
  gate: 0.35,
  color: "pink",
  filter: { type: "bandpass", frequency: hz, to: hz * 0.6, q: 0.9 },
});

/** A clap: the snare's recipe wider and shorter, on the echo. */
export const clap = (volume = 0.024): Instrument => ({
  wave: "noise",
  volume,
  gate: 0.28,
  color: "pink",
  echo: 0.25,
  filter: { type: "bandpass", frequency: 1300, to: 900, q: 0.6 },
});

/** THE HAT — under 7 kHz by construction, see the header. */
export const hat = (volume = 0.009, pan = 0.3, hz = 6500): Instrument => ({
  wave: "noise",
  volume,
  gate: 0.14,
  pan,
  filter: { type: "highpass", frequency: Math.min(hz, 6800) },
});

/** An open hat: the same band, longer. */
export const openHat = (volume = 0.008, pan = -0.25): Instrument => ({
  wave: "noise",
  volume,
  gate: 0.5,
  pan,
  filter: { type: "highpass", frequency: 5600 },
});

/** A floor tom: a driven triangle with a shallow drop. */
export const tom = (volume = 0.036, cutoff = 500): Instrument => ({
  wave: "triangle",
  volume,
  gate: 0.4,
  slide: 0.55,
  drive: 0.35,
  filter: { type: "lowpass", frequency: cutoff },
});

/** A pad: a detuned sawtooth that HOLDS — the thing a chip tracker cannot
 * do, and the bed every score here is built on. */
export const pad = (
  volume: number,
  cutoff: number,
  pan = 0,
  opts: { open?: number; attackMs?: number; echo?: number; wave?: "sawtooth" | "square" } = {},
): Instrument => ({
  wave: opts.wave ?? "sawtooth",
  volume,
  gate: 1,
  hold: 0.9,
  attackMs: opts.attackMs ?? 260,
  detuneCents: 12,
  pan,
  echo: opts.echo ?? 0.22,
  filter: { type: "lowpass", frequency: cutoff, to: cutoff * (opts.open ?? 1.5), q: 0.9 },
});

/** A plucked bass: short, driven, swept down across the note. */
export const bass = (
  volume = 0.05,
  cutoff = 480,
  opts: { hold?: number; gate?: number } = {},
): Instrument => ({
  wave: "triangle",
  volume,
  gate: opts.gate ?? 0.5,
  hold: opts.hold ?? 0.25,
  drive: 0.4,
  filter: { type: "lowpass", frequency: cutoff, to: cutoff * 0.6 },
});

/** A driven guitar — one half of a power chord. */
export const guitar = (volume: number, pan: number, cutoff: number): Instrument => ({
  wave: "sawtooth",
  volume,
  gate: 0.92,
  hold: 0.55,
  attackMs: 6,
  detuneCents: 12,
  drive: 0.7,
  pan,
  filter: { type: "lowpass", frequency: cutoff, to: cutoff * 0.6, q: 1.3 },
});

/** A brass stab: fast attack, short hold, a filter that opens across it. */
export const brass = (volume: number, pan: number, cutoff: number): Instrument => ({
  wave: "sawtooth",
  volume,
  gate: 0.85,
  hold: 0.35,
  attackMs: 18,
  detuneCents: 9,
  drive: 0.35,
  pan,
  echo: 0.16,
  filter: { type: "lowpass", frequency: cutoff, to: cutoff * 1.4, q: 1 },
});

/** A lead: a voice with a slow vibrato that sits in the echo. */
export const lead = (
  volume: number,
  wave: "square" | "sawtooth" | "triangle" | "sine",
  cutoff: number,
  opts: { echo?: number; detune?: number; vibrato?: number } = {},
): Instrument => ({
  wave,
  volume,
  gate: 0.95,
  hold: 0.5,
  attackMs: 22,
  detuneCents: opts.detune ?? 8,
  echo: opts.echo ?? 0.3,
  vibrato: { rateHz: 5.6, depthCents: opts.vibrato ?? 18, delayMs: 220 },
  filter: { type: "lowpass", frequency: cutoff, to: cutoff * 1.3, q: 1.1 },
});

/** A bell: a sine with a short hold, deep in the echo. */
export const bell = (volume = 0.016, pan = -0.4): Instrument => ({
  wave: "sine",
  volume,
  gate: 0.7,
  hold: 0.3,
  attackMs: 8,
  pan,
  echo: 0.5,
});

/** A plucked arpeggio voice: so short only the attack survives. */
export const arp = (volume = 0.012, pan = 0.4, hz = 1800): Instrument => ({
  wave: "triangle",
  volume,
  gate: 0.22,
  pan,
  echo: 0.34,
  filter: { type: "bandpass", frequency: hz, q: 1.4 },
});

/** A tabled voicing, read for a chord that must exist. Throws at build
 * time — a chord a table forgot is a score that will not load, which is
 * the moment to find out. */
export function voice(table: Record<string, string>, chord: string): string {
  const note = table[chord];
  if (note === undefined) throw new Error(`no voicing for chord "${chord}"`);
  return note;
}
