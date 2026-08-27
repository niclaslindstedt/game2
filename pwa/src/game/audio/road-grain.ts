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
//
// AND THE COROLLARY, WHICH IS WHAT THE ROLLING BED IS FOR: a straight is
// almost NOTHING. A tyre rolling straight ahead barely makes a noise — what
// makes the noise is a tyre being asked to turn the car, which is why every
// surface here is written as a quiet cruise level plus a `corner` multiplier
// rather than as one constant hiss. On tarmac the cruise is close to silence
// and the car is just an engine; lean on it and the rubber sings. On gravel
// the cruise is a low rush and the corner is the surface being thrown. A bed
// that is as loud on the straight as it is in the corner tells the player
// nothing, and it is the loudest thing in the mix for the whole run.

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

/** How hard the car has to be cornering before a tarmac tyre starts to sing,
 * 0..1 of `RoadVoice.corner`. A TYRE DOES NOT WAIT UNTIL IT LETS GO TO SQUEAL
 * — it protests while it is still winning, which is the whole sound of a
 * sealed-surface stage — so the sing is driven by the lateral load and only
 * takes over from the slide once the car is actually sideways. Under this the
 * car is going round a bend rather than taking a corner. */
const SING_FLOOR = 0.4;

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
  /** The bed rolling STRAIGHT AHEAD at speed — the quiet half. */
  level: number;
  /** …and what it multiplies up to with the tyres at full lateral load. 1 is a
   * surface that sounds the same through a corner; 4 is one you only really
   * hear when you turn. It scales `grain` with it, because the stones only get
   * thrown when something asks them to move. */
  corner: number;
  grain: number;
};

export const SURFACES: Record<string, SurfaceVoice> = {
  // Tarmac: tight, high and almost tonal. On a straight it is very nearly
  // nothing — a sealed surface under a rolling tyre is the quietest a car ever
  // is, and the engine is meant to be the whole sound. What tarmac HAS is the
  // corner, where the same tyre goes from silent to singing.
  asphalt: { color: "pink", hz: 620, q: 1.6, level: 0.005, corner: 3.6, grain: 0.0016 },
  // Graded gravel: the game's home surface. Broad and busy, but a rush rather
  // than a roar until the car turns — then it is the surface being thrown.
  gravel: { color: "pink", hz: 340, q: 0.8, level: 0.011, corner: 3.4, grain: 0.006 },
  // Water: a hiss with weight behind it and no crunch at all. Barely cares
  // which way the car is pointing — a ford is loud because it is being ploughed
  // through, not because it is being cornered on.
  water: { color: "pink", hz: 900, q: 0.6, level: 0.036, corner: 1.3, grain: 0 },
  // Off the road entirely — turf, moss, rutted forest floor. Low, muffled and
  // rough: most of the energy is the suspension rather than the tread, so it
  // stays loud on the straight. Being off the road should sound like a mistake.
  nature: { color: "brown", hz: 190, q: 0.7, level: 0.026, corner: 1.6, grain: 0.011 },
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
  /** How hard the tyres are being asked to turn the car, 0..1, whether or not
   * they are winning — the lateral load, smoothed by the scheduler. */
  corner: number;
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
  const { speed, air, surface, corner, slide, sideways, airborne } = voice;

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
  // The cornering multiplier: 1 dead ahead, `road.corner` with the tyres at
  // their lateral limit. It is what makes a straight quiet and a corner an
  // event, and it lifts the crunch with the roar because a stone is only
  // thrown by a tyre that is pushing it sideways.
  const lean = 1 + (road.corner - 1) * corner;
  synth.noise({
    at,
    durationMs: NOISE_LIFE_MS,
    attackMs: NOISE_ATTACK_MS,
    holdMs: NOISE_HOLD_MS,
    color: road.color,
    volume: road.level * lean * (0.25 + 0.75 * roll),
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
      volume: road.grain * lean * roll,
      filter: { type: "highpass", frequency: 2200 + 2600 * roll },
    });
  }

  // ── The scrub ──────────────────────────────────────────────────────────
  // How far past gripping the tyres actually are. On a loose surface this is
  // the whole story; on tarmac it is only the half that arrives last.
  const slip = Math.max(0, (slide - SCRUB_FLOOR) / (1 - SCRUB_FLOOR));

  if (surface === "asphalt") {
    // ON TARMAC A TYRE SINGS, AND IT STARTS SINGING BEFORE IT LETS GO. The
    // rubber grips, releases and grips again at a rate the ear hears as a pitch
    // — so the sealed-surface corner is a resonant band with a driven note
    // inside it, and it is the one place in this game anything squeals. It is
    // driven by the LOAD rather than by the slide, so a corner taken flat and
    // gripped still howls; a genuine slide takes over from there.
    const scrub = Math.max(slip, Math.max(0, (corner - SING_FLOOR) / (1 - SING_FLOOR))) * roll;
    if (scrub <= 0) return;
    const sing = 780 + 520 * scrub;
    synth.noise({
      at,
      durationMs: NOISE_LIFE_MS,
      attackMs: NOISE_ATTACK_MS,
      holdMs: NOISE_HOLD_MS,
      volume: 0.038 * scrub,
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
      volume: 0.02 * scrub * scrub,
      detuneCents: 14,
      drive: 0.35,
      vibrato: { rateHz: 7.5, depthCents: 22, delayMs: 40 },
      filter: { type: "bandpass", frequency: sing * 1.6, q: 3 },
    });
    return;
  }
  // ON GRAVEL A TYRE DIGS. There is nothing to grip and let go of, so there is
  // no pitch, and no protest before the fact either: a loose surface only makes
  // a new noise once the car is genuinely sideways, and what that sounds like
  // is the surface being thrown — a wide rush that opens up the more sideways
  // the car is, with the stones themselves spraying off the top of it. The
  // ordinary cornering load is already in the rolling bed above.
  const scrub = slip * roll;
  if (scrub <= 0) return;
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
