// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A COUNTRY'S WEATHER LOOKS LIKE — the tables sky.ts reads to put a
// lid on a clear sky, and the cast each country puts on the clear sky
// before any weather is added. Pure data: every number here is a colour or
// a fraction, and the arithmetic that applies them is sky.ts's.

import type { BiomeId, Weather } from "@engine";

/**
 * ONE WEATHER, AT ITS LIGHTEST AND AT ITS HEAVIEST.
 *
 * Every pair here is read at the stage's own `cover` (see `coverOf`), so no
 * two wet stages are the same sky: one rally is run under a high thin
 * ceiling with the light still coming through it, the next under a low
 * black one. A single authored grey is what makes every wet stage in a game
 * look like the same wet stage.
 */
export type WeatherLook = {
  /** What the open sky left under the deck is mixed toward, and how far. */
  grey: number;
  mix: number;
  /** What survives of the sun's beam and of the skylight, thin cover →
   * thick. A heavy deck is not a filter over daylight — a thunderstorm at
   * noon puts a few per cent of full sun on the ground, which is why the
   * headlights go on under one. */
  dim: [number, number];
  hemi: [number, number];
  /** How thick the deck has to be before the car turns its lights on. */
  lampsAt: number;
  /** Fog distances, as fractions of the clear preset's own, thin cover →
   * thick. Heavier weather is not only darker, it is SHORTER: the water in
   * the air between the car and the next corner is what a downpour
   * actually does to driving. */
  fogNear: [number, number];
  fogFar: [number, number];
  /** How much of the DECK's colour the distance takes: rain whitens the
   * air, a storm blackens it, and in both cases what the far trees fade
   * into is the underside of the cloud rather than the blue behind it. */
  fogDeck: number;
  /** The deck's underside overhead, thin cover → thick, in full daylight —
   * sky.ts darkens it with the hour, so a night storm is black overhead
   * rather than a white ceiling over a dark stage. */
  overhead: [number, number];
  /** The strip at the rim, and how far the horizon's own colour is pulled
   * toward it (0..1) — which is what keeps a night storm's rim dark. */
  rim: number;
  rimMix: number;
  /** How high the base hangs and how ragged it is, thin → thick. */
  base: [number, number];
  relief: [number, number];
  /** How hard it rains, thin → thick. */
  rain: [number, number];
  /** How electric it is, thin → thick. */
  thunder: [number, number];
  /** How much of the sun's BEAM comes through the deck, thin → thick — a
   * lit patch on a thin sheet of rain cloud, nothing at all behind a
   * thunderstorm's, and a pale disc the whole way through blowing sand. */
  through: [number, number];
};

export type Looks = Record<Exclude<Weather, "clear">, WeatherLook>;

export const TAIGA_LOOKS: Looks = {
  // RAIN IS A WHITE SKY. The deck is thin enough that the sun lights it
  // from above and it glows — overhead it is the brightest thing in the
  // frame, brighter than the road, which is exactly why a photograph of a
  // rainy day comes back with a blown-out sky. It greys off toward the rim
  // because that line of sight runs the long way through the cloud.
  rain: {
    grey: 0x9aa4b0,
    mix: 0.45,
    dim: [0.85, 0.55],
    hemi: [0.95, 0.72],
    lampsAt: 0.8,
    fogNear: [0.72, 0.5],
    fogFar: [0.74, 0.5],
    fogDeck: 0.55,
    overhead: [0xf4f7fa, 0x939ca6],
    rim: 0xb4bcc4,
    rimMix: 0.5,
    base: [320, 165],
    relief: [0.1, 0.3],
    rain: [0.4, 0.8],
    // Rain has weather in it without being a thunderstorm: the odd distant
    // flash on the heaviest stages, never the overhead crack.
    thunder: [0, 0.25],
    through: [1, 0],
  },
  // A STORM IS A BLACK ONE, and it is black for the opposite reason: the
  // deck is kilometres thick, nothing gets through it, and the underside is
  // in its own shadow. The single bright thing left in the sky is the strip
  // at the rim where daylight arrives under the base from outside the
  // weather — the gust front look, and the reason a storm reads as
  // something arriving rather than as a night that came early.
  storm: {
    grey: 0x59616e,
    mix: 0.62,
    dim: [0.5, 0.22],
    hemi: [0.72, 0.4],
    lampsAt: 0.25,
    fogNear: [0.52, 0.34],
    fogFar: [0.56, 0.38],
    fogDeck: 0.7,
    overhead: [0x39404b, 0x101319],
    rim: 0xc6ccd4,
    rimMix: 0.62,
    base: [210, 115],
    relief: [0.3, 0.55],
    rain: [0.85, 1],
    thunder: [0.6, 1],
    through: [0, 0],
  },
};

/** R40 — THE DESERT'S WEATHER, which is dry. Its `storm` is a DUST STORM:
 * a wall of blown sand the colour of the ground, so low the base is on
 * the ridges and so thick the road runs out a hundred metres ahead; the
 * sun is a pale disc in it, never gone, and the one bright thing left is
 * the strip under the base where clear air still shows. Dry lightning
 * rides the heaviest of them. Nothing here rains: the `rain` pair is zero
 * on both rows, which is what keeps the wipers parked and the road dry.
 *
 * Its `rain` is not offered by the country (`biomeRules().weathers`), but
 * a dial can still be left on it, so it has a look: a HAZE, the same sand
 * in the air at a fraction of the density — the desert on a windy day. */
export const DESERT_LOOKS: Looks = {
  rain: {
    grey: 0xc9ad7c,
    mix: 0.3,
    dim: [0.92, 0.75],
    hemi: [0.98, 0.85],
    lampsAt: 2,
    fogNear: [0.8, 0.55],
    fogFar: [0.85, 0.55],
    fogDeck: 0.5,
    overhead: [0xd8c39a, 0xbfa070],
    rim: 0xdcc59a,
    rimMix: 0.5,
    base: [420, 260],
    relief: [0.05, 0.15],
    rain: [0, 0],
    thunder: [0, 0],
    through: [0.9, 0.55],
  },
  storm: {
    grey: 0xb8925c,
    mix: 0.72,
    dim: [0.55, 0.28],
    hemi: [0.82, 0.55],
    lampsAt: 0.45,
    fogNear: [0.38, 0.14],
    fogFar: [0.42, 0.16],
    fogDeck: 0.88,
    overhead: [0xc9a36a, 0x8f6a3c],
    rim: 0xdcb87a,
    rimMix: 0.7,
    base: [150, 70],
    relief: [0.5, 0.8],
    rain: [0, 0],
    thunder: [0.05, 0.35],
    through: [0.55, 0.12],
  },
};

/** R47 — THE MOUNTAIN'S WEATHER. Its `rain` is a cloud base come down onto
 * the flanks: a low grey lid, the far peaks gone, the road running into
 * mist a few hundred metres ahead — the same wet as the taiga's but with
 * the ceiling on the mountain rather than over it, because a mountain road
 * is IN the weather the valley only sees from below. Its `storm` is a
 * summer thunderstorm on the pass: black, close, thunder rolling round the
 * cirque, and rain hard enough to run across the road. */
export const ALPINE_LOOKS: Looks = {
  rain: {
    ...TAIGA_LOOKS.rain,
    grey: 0xb9c1c8,
    mix: 0.5,
    fogNear: [0.55, 0.3],
    fogFar: [0.6, 0.32],
    fogDeck: 0.85,
    base: [240, 120],
    relief: [0.25, 0.5],
    through: [0.3, 0.1],
  },
  storm: {
    ...TAIGA_LOOKS.storm,
    grey: 0x4a5058,
    fogNear: [0.42, 0.22],
    fogFar: [0.46, 0.24],
    base: [180, 95],
    relief: [0.4, 0.65],
    thunder: [0.7, 1],
  },
};

export const LOOKS: Record<BiomeId, Looks> = {
  taiga: TAIGA_LOOKS,
  desert: DESERT_LOOKS,
  alpine: ALPINE_LOOKS,
};

/** R40 — what a COUNTRY does to the clear sky over it, before any weather
 * is put on top. The ladder of skies was authored for the taiga; the
 * desert's air is drier and clearer, its horizon hazed warm by the dust
 * that is always in it, its sun a shade warmer and harder, and — the one
 * that matters most to the look of the ground — the light bouncing back
 * up off it is sand, not moss. Every mix is toward a colour, so every hour
 * of the day keeps its own character under it. */
export type Cast = {
  horizon: [number, number];
  zenith: [number, number];
  fog: [number, number];
  fogReach: number;
  sun: [number, number];
  sunStrength: number;
  hemiGround: [number, number];
  cloudCover: number;
  /** …and how many of them there are at all. See `Preset.cloudShare`: over
   * a dry country the sky is EMPTIER, not hazier. */
  cloudShare: number;
};

export const CASTS: Record<BiomeId, Cast | null> = {
  taiga: null,
  desert: {
    horizon: [0xe8d3b0, 0.28],
    zenith: [0x2f7fd8, 0.18],
    fog: [0xe6d2a8, 0.32],
    fogReach: 1.25,
    sun: [0xfff0d0, 0.3],
    sunStrength: 1.06,
    hemiGround: [0xc9a870, 0.65],
    // It almost never rains here, and a desert sky shows it: a handful of
    // cumulus in a great deal of blue. Nearly solid where they are, because
    // what makes the sky read as dry is the EMPTINESS between them — faded
    // clouds over the whole ring only read as a rendering fault.
    cloudCover: 0.92,
    cloudShare: 0.3,
  },
  // R47 — THE MOUNTAIN AIR: thin, dry and clear, so the sky is a deeper
  // blue overhead and the horizon reads further; the light is cooler and
  // harder than the forest's, and what bounces back up off the ground is
  // pale rock and snow as much as grass. Fewer clouds than the taiga and
  // more than the desert, each one sharp-edged: fair-weather cumulus
  // building over the peaks.
  alpine: {
    horizon: [0xd6e4f2, 0.22],
    zenith: [0x1e56b8, 0.3],
    fog: [0xd0dceb, 0.25],
    fogReach: 1.45,
    sun: [0xfff6e6, 0.25],
    sunStrength: 1.08,
    hemiGround: [0xb9bcb4, 0.35],
    cloudCover: 1,
    cloudShare: 0.6,
  },
};
