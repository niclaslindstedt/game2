// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A RUNNING ENGINE, MADE OUT OF ONE-SHOTS.
//
// The synth has no sustained voice: `tone()` starts, glides and stops. So the
// engine is a GRAIN fired on a steady cadence, and the grains overlap into
// something continuous.
//
// AND "OVERLAP" IS NOT ENOUGH ON ITS OWN. A tone's level falls exponentially
// across its whole length — a tenth of the peak a quarter of the way in — so
// grains that merely outlast the gap between them still arrive as separate
// events: what comes out of the speaker is a putt … putt … putt with daylight
// between the putts, at whatever rate the grains are fired. Three things fix
// it and all three are needed:
//
//   * the grain HOLDS its peak (`holdMs`, the sustain the voice grew for this),
//   * the cadence is a FRACTION of the hold, so three grains are always up
//     together and their holds tile end to end,
//   * and the cadence is CONSTANT. That last one is the counter-intuitive
//     half: a cadence that quickened with the revs made the RATE OF THE PUTTER
//     the thing the ear followed, when the rate the engine is actually turning
//     at is the PITCH and always was.
//
// So: pitch says revs, and nothing else has to.
//
// AND THE GRAINS HAVE TO AGREE ABOUT WHERE THE CYCLE IS. An oscillator starts
// at the top of its own, so grains of one note fired on a fixed cadence meet
// at whatever phase the note and the cadence happen to divide into: they add
// up where the two agree and cancel where they land half a cycle apart. The
// note moves and the cadence does not, so an engine walks through both as it
// revs — measured over the range, the bed's level bounced by up to 7 dB from
// one part of the band to the next, which is heard as a rattle, not as an
// engine. Every pitched layer here is a `bed` grain, so it starts in the
// phase a never-stopping oscillator would be in and the level is flat across
// the whole band.
//
// ONCE THEY ADD, THE SHAPE OF THE GRAIN IS THE SOUND. Coherent grains sum in
// LEVEL, so the summed envelope is heard directly: the four numbers below are
// a cross-fade, not a taste, and the attack and the tail are each exactly one
// cadence so that what one grain gives up the next has already taken. Off by
// a little and the bed wobbles 14% at the grain rate; right, under 1%.
//
// WHAT THE ENGINE IS MADE OF, in the order the ear finds them: a HUM (the
// firing note, the one layer whose pitch moves), a CLATTER over it (a dry tick
// per turn of the crank — the parts), a BASS bed under it (the mass of the
// car, nearly still), and the INTAKE rasp across the top once it is working.
// Four jobs and no two of them answer the same question: the hum says how fast
// the engine is turning, the clatter says it is machinery, the bass says it is
// a tonne of it, and the rasp says it is being asked for everything.
//
// WHAT MAKES IT PLAYSTATION RATHER THAN CHIP is `drive`. A clean triangle at
// 120 Hz is a flute; the same triangle folded through a soft-clipper has the
// odd harmonics a combustion event actually produces, and the amount of fold
// rises with load — which is why the car sounds like it is WORKING uphill and
// coasting downhill at the same road speed.

import type { Synth } from "../../lib/voice.ts";

/**
 * RPM PER HERTZ — how the crank becomes a pitch.
 *
 * A FOUR-cylinder four-stroke fires twice per revolution, so the note it makes
 * is `rpm / 60 * 2` — which is this constant and nothing chosen by ear. Idle is
 * a 30 Hz chug felt more than heard, and the limiter is 240 Hz of a small
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

/**
 * THE CADENCE, and the shape below is written in its units.
 *
 * Fire a grain every `GRAIN_MS` and four of them sound at any instant: two
 * holding, one fading in and one fading out. The four numbers are a cross-fade
 * and not independent choices — the attack and the tail are each exactly one
 * cadence, and the hold two more — so the fading pair always sums to the one
 * grain neither of them is yet, and the total never moves. Being merely CLOSE
 * to this is what a grain-rate wobble is.
 */
export const GRAIN_MS = 105;
const ATTACK_MS = GRAIN_MS;
const HOLD_MS = GRAIN_MS * 2;
const LIFE_MS = GRAIN_MS * 4;

/** How low the BASS bed may go. Below about here a phone gives you nothing and
 * a desktop gives you cabinet noise, so the layer holding the whole sound up
 * would stop existing exactly where it is doing the most work — at idle. */
const BASS_FLOOR_HZ = 44;

/**
 * THE CLATTER — one dry tick per turn of the crank: a tappet, an injector, a
 * driveshaft and every other hard thing in there arriving once a revolution.
 *
 * It is what makes the bed sound like MACHINERY rather than like a tone
 * generator; the hum, the octave and the rasp are one pitch in three flavours
 * and none of them says the noise is coming out of an object with parts in it.
 *
 * ITS RATE IS THE CRANK'S, NOT THE GRAIN'S. Ticks are the layer an ear can
 * COUNT at the bottom of the band — the putter a car makes idling — which
 * quickens as the revs come up until it blurs into the note. Tie their phase to
 * the grains and they lope at the grain rate instead, which is a rhythm nothing
 * in the car is making, so the phase is carried across grains by the caller.
 */
const TICK_MS = 12;
/** How close together ticks may get before they are a buzz rather than a
 * clatter. By the revs that reach this they are mostly faded out anyway. */
const TICK_FLOOR_MS = GRAIN_MS / 4;

/** One engine at one instant — everything a grain needs, and nothing about
 * which car it belongs to. */
export type EngineVoice = {
  /** The firing note now (Hz), and where the grain should glide to over its
   * life so the three sounding together agree about the pitch. */
  hz: number;
  toHz: number;
  /** What the crank is turning at — the clatter's own rate. */
  rpm: number;
  /** How far up the band the crank is, 0..1 — the rasp's edge. */
  rev: number;
  /** How hard the engine is working, 0..1 — the hum's level and its grit.
   * Deliberately separate from `rev`: a car coasting at the top of third and
   * one dragging itself up a bank in second are at opposite ends of this and
   * must not sound alike. */
  load: number;
  /** How far the car has come apart, 0..1: a fatter, tickier, rougher engine. */
  wear: number;
};

/**
 * Book one grain of a running engine at absolute time `at`.
 *
 * `tickAtMs` is how far into this grain the clatter's next tick falls; the
 * return is the same thing for the NEXT grain, which the caller hands straight
 * back.
 *
 * THE LEVELS ARE THE SUM'S, NOT THE GRAIN'S. Three grains' worth sounds at
 * once and they add up rather than fight, so every volume here is a third of
 * what the player hears — the numbers look quiet beside the rest of the bank
 * and are not.
 */
export function playEngineGrain(
  synth: Synth,
  voice: EngineVoice,
  at: number,
  tickAtMs = 0,
): number {
  const { hz, toHz: to, rpm, rev, load, wear } = voice;

  // ── THE HUM ──────────────────────────────────────────────────────────────
  // The firing note itself. A triangle for the body, detuned into a pair so it
  // reads as an engine rather than a test tone, driven harder the more work it
  // is doing, and GLIDING to where the note will be when this grain runs out
  // rather than sagging off it — a sag is what makes a grain sound like a
  // stroke, and strokes are what this is no longer made of.
  synth.tone({
    type: "triangle",
    from: hz,
    to,
    at,
    durationMs: LIFE_MS,
    attackMs: ATTACK_MS,
    holdMs: HOLD_MS,
    volume: 0.0065 + 0.0095 * load,
    detuneCents: 10 + 16 * wear,
    drive: 0.2 + 0.35 * load + 0.15 * wear,
    filter: { type: "lowpass", frequency: 700 + 2600 * rev },
    bed: true,
  });
  // ITS OCTAVE, which is what carries the note at all down at the bottom of the
  // band: a 30 Hz idle is barely a thing a phone speaker can reproduce and a
  // player would hear most of it as silence. It fades as the crank climbs and
  // the fundamental comes into its own — the same way a real engine stops
  // sounding boomy and starts sounding sharp.
  synth.tone({
    type: "triangle",
    from: hz * 2,
    to: to * 2,
    at,
    durationMs: LIFE_MS,
    attackMs: ATTACK_MS,
    holdMs: HOLD_MS,
    volume: 0.0058 - 0.0044 * rev,
    detuneCents: 8,
    drive: 0.2,
    bed: true,
  });
  // ── THE RASP ─────────────────────────────────────────────────────────────
  // Intake and exhaust edge: a thin driven sawtooth on the firing note, only
  // really there once the revs are up, which is what makes the top of a gear
  // sound strained. A car pulling out of a hairpin never reaches it.
  if (rev > 0.3) {
    synth.tone({
      type: "sawtooth",
      from: hz,
      to,
      at,
      durationMs: LIFE_MS,
      attackMs: ATTACK_MS,
      holdMs: HOLD_MS,
      volume: 0.0015 + 0.0058 * rev * load,
      detuneCents: 18,
      drive: 0.45,
      filter: { type: "bandpass", frequency: 900 + 2200 * rev, q: 1.1 },
      bed: true,
    });
  }
  // ── THE BASS ─────────────────────────────────────────────────────────────
  // The floor of the whole thing — a low sine an octave under the firing note:
  // the mass of the car, the drivetrain, and the road coming up through the
  // floorpan. Nobody picks it out and everybody would miss it.
  //
  // FLOORED, AND THAT IS THE POINT. Half of a 30 Hz idle is 15 Hz, which is not
  // a note, it is a speaker excursion — nothing reproduces it and the hum is
  // left standing on nothing. Held at the bottom instead, so the bass is a bed
  // the note sits ON rather than a second voice tracking it.
  synth.tone({
    type: "sine",
    from: Math.max(BASS_FLOOR_HZ, hz * 0.5),
    to: Math.max(BASS_FLOOR_HZ, to * 0.5),
    at,
    durationMs: LIFE_MS,
    attackMs: ATTACK_MS,
    holdMs: HOLD_MS,
    volume: 0.0073 + 0.0058 * load,
    detuneCents: 5,
    bed: true,
  });
  // ── THE CLATTER ──────────────────────────────────────────────────────────
  // One tick per revolution across this grain's window. Loudest at idle and as
  // the car falls apart — a tired engine ticks, and a tired engine that has
  // lost its bonnet ticks at you — and never gone entirely, because it is the
  // layer that says the noise has parts in it.
  //
  // ALTERNATE TICKS ARE LIGHTER AND BRIGHTER, which is not decoration: a
  // four-stroke's events are not all the same event, and a perfectly even tick
  // is the one thing that reads as a metronome instead of an engine.
  const gap = Math.max(TICK_FLOOR_MS, 60000 / Math.max(1, rpm));
  const level = (0.005 + 0.01 * wear) * (0.4 + 0.6 * (1 - Math.min(1, rev)));
  let offset = tickAtMs;
  for (let i = 0; offset < GRAIN_MS; i++, offset += gap) {
    synth.noise({
      durationMs: TICK_MS,
      at: at + offset / 1000,
      volume: level * (i % 2 === 0 ? 1 : 0.62),
      pan: -0.16,
      filter: { type: "bandpass", frequency: i % 2 === 0 ? 2000 : 2800, q: 2.4 },
    });
  }
  return offset - GRAIN_MS;
}
