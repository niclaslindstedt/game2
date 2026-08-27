// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE GRAIN OF THE ROAD — the tyres, the wind and the slide, as a pure
// function of how the car is going.
//
// Split from the scheduler (`drive-bed.ts`) and knowing nothing about
// `GameState`, for two reasons that turned out to be the same reason: it is
// the half worth auditioning on its own (`npm run audition` drives it from
// sliders, which is the only honest way to judge a continuous sound), and it
// is the half worth testing.
//
//   TYRES    what the wheels are rolling on — the surface, heard
//   WIND     how fast the air is going past, which is what sells speed
//   SCRUB    the drift: a tyre asked to go somewhere it is not pointing
//
// WHY THE DRIFT IS THE LOUDEST THING HERE. This game is about the moment the
// car stops going where it is pointing; the scrub bed IS that moment's audio,
// it is proportional to how sideways the car actually is, and it is mixed to
// be heard over the engine at full lock. If a slide does not sound dangerous,
// nothing else in the mix will make it feel that way.

import type { NoiseColor, Synth } from "../../lib/voice.ts";

import { GRAIN_MS } from "./engine-bed.ts";

/** The tyre and wind grains run longer than the engine's, because uncorrelated
 * noise sums in POWER rather than in level: a broadband bed needs a deeper
 * stack of grains than a pitched one before it stops fluttering. */
const NOISE_LIFE_MS = GRAIN_MS * 5;
const NOISE_ATTACK_MS = GRAIN_MS * 0.6;
const NOISE_HOLD_MS = GRAIN_MS * 2.4;

/** Below this the wheels are turning too slowly to make a rolling sound at
 * all, m/s — a car being nudged around at walking pace is engine and nothing
 * else. */
const ROLL_FLOOR = 1.5;

/** How sideways the car has to be before the scrub is audible, 0..1 of
 * `car.slide`. Under this the tyres are still doing their job and the noise
 * they make is the ordinary rolling bed. */
const SCRUB_FLOOR = 0.12;

/**
 * What a surface sounds like under a rolling tyre.
 *
 * `hz` is where the roar sits and `q` how narrow it is: asphalt is a tight,
 * high, almost pitched hum (a tread pattern arriving at a regular interval),
 * gravel is a broad low rush (a thousand stones a second at no interval at
 * all). `grain` is the crunch over the roar and `level` the bed's weight.
 */
type SurfaceVoice = {
  color: NoiseColor;
  hz: number;
  q: number;
  level: number;
  grain: number;
};

export const SURFACES: Record<string, SurfaceVoice> = {
  // Tarmac: tight, high and almost tonal. Quiet, because a sealed surface is —
  // which is what makes a stage's tarmac section feel fast and exposed.
  asphalt: { color: "pink", hz: 620, q: 1.6, level: 0.022, grain: 0.006 },
  // Graded gravel: the game's home surface. Broad, busy, and the loudest of
  // the three, with real crunch over it.
  gravel: { color: "pink", hz: 340, q: 0.8, level: 0.034, grain: 0.02 },
  // Water: a hiss with weight behind it and no crunch at all.
  water: { color: "pink", hz: 900, q: 0.6, level: 0.04, grain: 0 },
  // Off the road entirely — turf, moss, rutted forest floor. Low, muffled and
  // rough: most of the energy is the suspension rather than the tread.
  nature: { color: "brown", hz: 190, q: 0.7, level: 0.038, grain: 0.014 },
};

/** The road under one car at one instant. Everything the grain needs, and
 * nothing about where any of it came from. */
export type RoadVoice = {
  /** Total speed over the ground, m/s. */
  speed: number;
  /** …as a fraction of what this car can ever do, 0..1: what the wind reads. */
  air: number;
  /** What the wheels are on — a key of `SURFACES`; anything unknown is
   * gravel, which is the surface most of this game is made of. */
  surface: string;
  /** How far past gripping the tyres are, 0..1 — the engine's own `slide`. */
  slide: number;
  /** Which way the back end has gone: sideways velocity, m/s. Only its sign
   * and rough size matter — it places the spray on the stereo stage. */
  sideways: number;
  /** Nothing under the wheels. */
  airborne: boolean;
};

/**
 * Book one grain of the road at absolute time `at`.
 *
 * Returns nothing: unlike the engine, none of these layers carries phase from
 * one grain to the next — noise has none to carry.
 */
export function playRoadGrain(synth: Synth, voice: RoadVoice, at: number): void {
  const { speed, air, surface, slide, sideways, airborne } = voice;

  // ── The air ────────────────────────────────────────────────────────────
  // Wind is the layer that actually sells pace: pitch says revs, noise says
  // SPEED. Squared, because the ear reads air noise as roughly its power and a
  // linear ramp leaves a fast car sounding like a slightly quicker slow one.
  // It is the one bed that keeps going in the air — louder there, in fact,
  // with nothing under the wheels to mask it.
  synth.noise({
    at,
    durationMs: NOISE_LIFE_MS,
    attackMs: NOISE_ATTACK_MS,
    holdMs: NOISE_HOLD_MS,
    color: "pink",
    volume: (0.003 + 0.026 * air * air) * (airborne ? 1.35 : 1),
    filter: { type: "highpass", frequency: 400 + 1500 * air },
  });

  // Airborne, the only things left are the engine (free-revving, which the
  // load model handles) and the wind. The silence where the tyres were is what
  // a jump sounds like, and it is worth more than any effect that could be put
  // in its place.
  if (airborne || speed < ROLL_FLOOR) return;

  // ── The tyres ──────────────────────────────────────────────────────────
  const road = SURFACES[surface] ?? (SURFACES.gravel as SurfaceVoice);
  const roll = Math.min(1, air / 0.8);
  synth.noise({
    at,
    durationMs: NOISE_LIFE_MS,
    attackMs: NOISE_ATTACK_MS,
    holdMs: NOISE_HOLD_MS,
    color: road.color,
    volume: road.level * (0.25 + 0.75 * roll),
    filter: { type: "bandpass", frequency: road.hz * (0.7 + 0.5 * roll), q: road.q },
  });
  if (road.grain > 0) {
    // The crunch: the individual stones, up where the roar is not. Brighter
    // with speed, because faster means more of them per second and each one
    // hit harder.
    synth.noise({
      at,
      durationMs: NOISE_LIFE_MS * 0.5,
      attackMs: NOISE_ATTACK_MS * 0.5,
      holdMs: NOISE_HOLD_MS * 0.5,
      volume: road.grain * roll,
      filter: { type: "highpass", frequency: 2200 + 2600 * roll },
    });
  }

  // ── The scrub ──────────────────────────────────────────────────────────
  if (slide <= SCRUB_FLOOR) return;
  const scrub = ((slide - SCRUB_FLOOR) / (1 - SCRUB_FLOOR)) * roll;

  if (surface === "asphalt") {
    // ON TARMAC A TYRE SINGS. The rubber grips, releases and grips again at a
    // rate the ear hears as a pitch — so the sealed-surface slide is a
    // resonant band with a driven note inside it, and it is the one place in
    // this game anything squeals. The pitch rises with how hard the tyre is
    // being asked to work.
    const sing = 780 + 520 * scrub;
    synth.noise({
      at,
      durationMs: NOISE_LIFE_MS,
      attackMs: NOISE_ATTACK_MS,
      holdMs: NOISE_HOLD_MS,
      volume: 0.03 * scrub,
      filter: { type: "bandpass", frequency: sing, q: 7 },
    });
    synth.tone({
      type: "sawtooth",
      from: sing,
      to: sing * 1.04,
      at,
      durationMs: NOISE_LIFE_MS,
      attackMs: NOISE_ATTACK_MS,
      holdMs: NOISE_HOLD_MS,
      volume: 0.016 * scrub * scrub,
      detuneCents: 14,
      drive: 0.35,
      vibrato: { rateHz: 7.5, depthCents: 22, delayMs: 40 },
      filter: { type: "bandpass", frequency: sing * 1.6, q: 3 },
    });
    return;
  }
  // ON GRAVEL A TYRE DIGS. There is nothing to grip and let go of, so there is
  // no pitch: what a slide sounds like out here is the surface being thrown —
  // a wide rush that opens up the more sideways the car is, with the stones
  // themselves spraying off the top of it.
  synth.noise({
    at,
    durationMs: NOISE_LIFE_MS,
    attackMs: NOISE_ATTACK_MS,
    holdMs: NOISE_HOLD_MS,
    color: "pink",
    volume: 0.05 * scrub,
    filter: { type: "bandpass", frequency: 700 + 900 * scrub, to: 1600 + 1400 * scrub, q: 0.7 },
  });
  synth.noise({
    at,
    durationMs: NOISE_LIFE_MS * 0.6,
    attackMs: NOISE_ATTACK_MS * 0.6,
    holdMs: NOISE_HOLD_MS * 0.6,
    volume: 0.022 * scrub,
    filter: { type: "highpass", frequency: 3000 + 2000 * scrub },
    // Thrown to the outside of the slide, so a drift is a drift the player can
    // hear the direction of with the camera behind the car.
    pan: Math.max(-0.6, Math.min(0.6, -sideways / 12)),
  });
}
