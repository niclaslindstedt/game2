// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A RUNNING ENGINE, AS SIX LAYERS THAT NEVER STOP.
//
// The engine is not made of events. It is a handful of oscillators and one
// noise source built once for the run and STEERED — pitch, level, cutoff and
// saturation moved every frame on the audio thread (`Synth.layer`). Nothing
// here is scheduled, tiled or phase-aligned; a frame that arrives late leaves
// the engine holding its last note rather than leaving a hole in it.
//
// WHAT THE ENGINE IS MADE OF, in the order the ear finds them:
//
//   HUM      the firing note — the one layer whose pitch says the revs, a
//            detuned triangle pair folded through the saturation curve,
//            harder the more work the engine is doing
//   OCTAVE   the same note an octave up, carrying it at idle where 30 Hz is
//            a thing a phone cannot reproduce, fading as the crank climbs
//   RASP     intake and exhaust edge — a thin driven sawtooth in a band that
//            climbs with the revs; the layer that is heard from OUTSIDE
//   BASS     a sine an octave under the note: the mass of the car
//   CLATTER  brown noise in a mid band — that it is machinery, and rougher
//            the more the car has been through
//   TURBO    the induction whistle, a sine well above everything, only there
//            when the engine is on boost — load AND revs — and the sound of
//            a rally car being asked for everything
//
// This is a pure function of the state: `engineTargets` says where every
// layer should be, and the scheduler (`drive-bed.ts`) steers the real ones
// there. Being a pure function is what makes it testable and what lets the
// audition page drive it from sliders.

import type { LayerSpec, LayerTarget } from "../../lib/voice.ts";

/**
 * RPM PER HERTZ — how the crank becomes a pitch.
 *
 * A FOUR-cylinder four-stroke fires twice per revolution, so the note it makes
 * is `rpm / 60 * 2` — which is this constant and nothing chosen by ear. Idle is
 * a 30 Hz chug felt more than heard, and the limiter is 233 Hz of a small
 * engine being asked for more than it has. Every car in this game is a rally
 * four; a bigger engine would be a smaller divisor here and an octave lower.
 */
export const RPM_PER_HZ = 30;

/** The crank's own two numbers: where it idles and where it stops pulling.
 * They are what a set of revs is MEASURED AGAINST — the timbre follows how far
 * up the band the engine is, not how fast the car is going, which is why a
 * labouring top gear and a screaming first are not the same sound at the same
 * speed. */
export const IDLE_RPM = 900;
export const REDLINE_RPM = 7000;

/** The firing note these revs make (Hz). */
export function noteHz(rpm: number): number {
  return rpm / RPM_PER_HZ;
}

/** Revs from how far up the current gear the car is, 0..1. */
export function rpmAt(rev: number): number {
  return IDLE_RPM + Math.min(1.06, Math.max(0, rev)) * (REDLINE_RPM - IDLE_RPM);
}

/** How low the BASS may go, Hz. Below about here a phone gives you nothing and
 * a desktop gives you cabinet noise, so the layer holding the whole sound up
 * would stop existing exactly where it is doing the most work — at idle. */
const BASS_FLOOR_HZ = 44;

/** Above this share of the band the rasp starts to be heard at all: a car
 * pulling out of a hairpin never reaches it. */
const RASP_FROM = 0.3;

/** The turbo needs BOTH: load over this, and revs to spin it. */
const BOOST_FROM = 0.35;

/** One engine at one instant — everything the layers need, and nothing about
 * which car it belongs to. */
export type EngineVoice = {
  /** What the crank is turning at. */
  rpm: number;
  /** How far up the band the crank is, 0..1 — the rasp's edge and the
   * hum's brightness. */
  rev: number;
  /** How hard the engine is working, 0..1 — the hum's level and its grit.
   * Deliberately separate from `rev`: a car coasting at the top of third and
   * one dragging itself up a bank in second are at opposite ends of this and
   * must not sound alike. */
  load: number;
  /** How far the car has come apart, 0..1: a fatter, tickier, rougher engine. */
  wear: number;
};

/** What the seat does to the engine — three of the listener's numbers. */
export type EngineMix = {
  engine: number;
  exhaust: number;
  /** 0..1, how bright: the hum's cutoff is scaled by it. */
  tone: number;
};

export type EngineLayer = "hum" | "octave" | "rasp" | "bass" | "clatter" | "turbo";

/** What each layer is BUILT from — decided once. */
export const ENGINE_LAYERS: Record<EngineLayer, LayerSpec> = {
  hum: {
    kind: "tone",
    type: "triangle",
    detuneCents: 12,
    drive: 1,
    filter: { type: "lowpass", q: 0.9 },
  },
  octave: { kind: "tone", type: "triangle", detuneCents: 8, drive: 1 },
  rasp: {
    kind: "tone",
    type: "sawtooth",
    detuneCents: 18,
    drive: 1,
    filter: { type: "bandpass", q: 1.1 },
  },
  bass: { kind: "tone", type: "sine", detuneCents: 5 },
  clatter: { kind: "noise", color: "brown", filter: { type: "bandpass", q: 1.2 } },
  turbo: { kind: "tone", type: "sine", filter: { type: "bandpass", q: 2.5 } },
};

/** How fast each layer follows, s — the time constant its parameters move
 * on. Pitch layers move quickly (a rev that lags the needle reads as a slow
 * engine); the texture and the turbo take a moment, the way a real turbo
 * spools. */
export const ENGINE_GLIDE: Record<EngineLayer, number> = {
  hum: 0.03,
  octave: 0.03,
  rasp: 0.04,
  bass: 0.03,
  clatter: 0.08,
  turbo: 0.12,
};

/**
 * Where every layer of the engine should be for `voice`, heard from `mix`.
 *
 * The levels are the whole sound's, and they are mixed against the rest of
 * the bank: the hum at full load is an ordinary contact's size, the bass
 * under it a little less, and everything else is texture.
 */
export function engineTargets(
  voice: EngineVoice,
  mix: EngineMix,
): Record<EngineLayer, LayerTarget> {
  const rev = Math.min(1, Math.max(0, voice.rev));
  const load = Math.min(1, Math.max(0, voice.load));
  const wear = Math.min(1, Math.max(0, voice.wear));
  const hz = noteHz(voice.rpm);
  const rasp = Math.max(0, (rev - RASP_FROM) / (1 - RASP_FROM));
  const boost = Math.max(0, (load - BOOST_FROM) / (1 - BOOST_FROM)) * rev;
  return {
    // The body of the note, brighter with the revs and darker in a cabin,
    // pushed harder into the curve the more work it is doing — which is why
    // the car sounds like it is WORKING uphill and coasting downhill at the
    // same road speed.
    hum: {
      level: (0.02 + 0.03 * load) * mix.engine,
      hz,
      cutoff: (700 + 2600 * rev) * (0.45 + 0.55 * mix.tone),
      grit: 0.25 + 0.5 * load + 0.2 * wear,
    },
    // Carries the note at the bottom of the band and gets out of the way as
    // the fundamental comes into its own — the same way a real engine stops
    // sounding boomy and starts sounding sharp.
    octave: {
      level: (0.016 - 0.012 * rev) * mix.engine,
      hz: hz * 2,
      grit: 0.3 + 0.2 * load,
    },
    rasp: {
      level: rasp * (0.005 + 0.02 * load) * mix.exhaust,
      hz,
      cutoff: 900 + 2200 * rev,
      grit: 0.6 + 0.3 * load,
    },
    // FLOORED, AND THAT IS THE POINT. Half of a 30 Hz idle is 15 Hz, which
    // is not a note, it is a speaker excursion — nothing reproduces it and
    // the hum is left standing on nothing.
    bass: {
      level: (0.022 + 0.016 * load) * mix.engine,
      hz: Math.max(BASS_FLOOR_HZ, hz * 0.5),
    },
    clatter: {
      level: (0.005 + 0.005 * wear + 0.003 * load) * mix.engine,
      cutoff: 650 + Math.min(1000, voice.rpm / 5) + 250 * rev,
    },
    // The whistle climbs with the square of boost so it is nothing at
    // part throttle and everything at the top of a straight.
    turbo: {
      level: 0.0045 * boost * boost * mix.exhaust,
      hz: 1400 + 3200 * boost,
      cutoff: 1400 + 3200 * boost,
    },
  };
}
