// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DAY'S RUNGS. The sky is authored as a ladder of complete looks —
// night, the two twilights, the two sets, the two low suns, morning and
// full day — each one a whole palette rather than a curve per colour, and
// the clock blends between the two it stands between. Authoring them whole
// is what keeps a sunset a sunset: every colour in it was chosen against
// the others, and a set of independent curves through the same numbers
// gives you eight tasteful greys somewhere in the middle.

//                differently (`KEYS`). The sky at any moment is the blend of
//                the two rungs its elevation lies between, so a stage started
//                at sunset slides down the ladder into the night without a
//                cut anywhere.
//   WEATHER      a LID over the top of it (`weathered`). Rain and a storm
//                are not the same sky dimmed by different amounts: one is
//                white and one is black, and both replace the gradient
//                overhead with the underside of a cloud deck.
//   SEASON       the year's colour casts and the winter's cold air
//                (`seasoned`) — the ASTRONOMY of the season is already in
//                the elevation, so this is only what the season does to the
//                air and the ground, never to where the sun is.

import type { Rung } from "./sky.ts";

/** THE LADDER, rung by rung. The elevation each rung stands at, degrees,
 * and the sky painted for it — with the rungs the sun climbs through in
 * the morning painted differently from the ones it comes down in the
 * evening, because a dawn and a dusk are not the same picture run
 * backwards: the morning air is clear and cold and the light in it is
 * peach and mist, the evening air has the whole day's dust and heat in it
 * and burns magenta and orange. Above the golden hour the two meet.
 *
 * DARK is nautical twilight and everything under it — moonlit, and the
 * moon is the key. TWILIGHT is the civil kind, the sun six degrees under:
 * the afterglow on the horizon, the first stars, the world lit by the sky
 * alone. SET is the sun on the horizon. LOW is the golden hour, the sun
 * eight degrees up. MORNING is the plain light of mid-morning, and DAY is
 * the bright arcade baseline every other light in the game was authored
 * against.
 *
 * The sun's OWN intensity on the rungs under SET is not the sun's — it is
 * under the horizon — but the KEY's: the afterglow's warm skylight, given a
 * direction so the world still has a lit side, fading toward the moon's
 * take-over. */
export const DARK: Rung = {
  zenith: 0x0a1230,
  horizon: 0x1d2d55,
  glow: 0x9fb6ff,
  glowStrength: 0.5,
  sun: 0xb8ccff,
  sunIntensity: 0.55,
  hemiSky: 0x3a5580,
  hemiGround: 0x1e2840,
  hemiIntensity: 0.55,
  fog: 0x101c38,
  fogNear: 80,
  fogFar: 380,
  disc: 0xeef2ff,
  discSize: 14,
  halo: 0xb8ccff,
  haloSize: 95,
  haloOpacity: 0.4,
  stars: 1,
  galaxy: 1,
  cloud: 0x2b3a5a,
  cloudShade: 0x1a2438,
  cloudOpacity: 0.85,
};

export const DUSK_TWILIGHT: Rung = {
  zenith: 0x1e1a48,
  horizon: 0x6e4670,
  glow: 0xf06a52,
  glowStrength: 1.45,
  sun: 0xd9a8b8,
  sunIntensity: 0.22,
  hemiSky: 0x4a4a84,
  hemiGround: 0x2a2432,
  hemiIntensity: 0.5,
  fog: 0x4e4264,
  fogNear: 70,
  fogFar: 360,
  disc: 0xffb36a,
  discSize: 0,
  halo: 0xff6a4a,
  haloSize: 280,
  haloOpacity: 0.32,
  stars: 0.55,
  galaxy: 0.4,
  cloud: 0xe0868e,
  cloudShade: 0x3a3054,
  cloudOpacity: 1,
};

export const DAWN_TWILIGHT: Rung = {
  zenith: 0x24305e,
  horizon: 0x8e7488,
  glow: 0xffa070,
  glowStrength: 1.2,
  sun: 0xd8bcc4,
  sunIntensity: 0.22,
  hemiSky: 0x5c6494,
  hemiGround: 0x2e3038,
  hemiIntensity: 0.5,
  fog: 0x625a76,
  fogNear: 60,
  fogFar: 340,
  disc: 0xffe0b8,
  discSize: 0,
  halo: 0xffa060,
  haloSize: 240,
  haloOpacity: 0.3,
  stars: 0.5,
  galaxy: 0.34,
  cloud: 0xf0a898,
  cloudShade: 0x46405c,
  cloudOpacity: 1,
};

// The Sega Rally mountain sunset: magenta clouds over a purple sky, the
// disc a swollen orange coin on the rim. The horizon is a warm salmon
// rather than the glow's red, because the red belongs to the band round
// the sun; away from it the rim goes rose and the sky over it purple.
export const DUSK_SET: Rung = {
  zenith: 0x3a2f6e,
  horizon: 0xf0885c,
  glow: 0xff4f46,
  glowStrength: 1.35,
  sun: 0xff9663,
  sunIntensity: 1.15,
  hemiSky: 0xc9a0c8,
  hemiGround: 0x6e5a4a,
  hemiIntensity: 0.62,
  fog: 0xd8927c,
  fogNear: 90,
  fogFar: 430,
  disc: 0xffb36a,
  discSize: 30,
  halo: 0xff5f46,
  haloSize: 210,
  haloOpacity: 0.6,
  stars: 0.12,
  galaxy: 0,
  cloud: 0xff9a74,
  cloudShade: 0x7e5a80,
  cloudOpacity: 1,
};

// Valheim's misty peach morning, the disc pale and huge in the haze.
export const DAWN_SET: Rung = {
  zenith: 0x5670b4,
  horizon: 0xffbe96,
  glow: 0xff9a58,
  glowStrength: 1.15,
  sun: 0xffb884,
  sunIntensity: 1.1,
  hemiSky: 0xd0d0f4,
  hemiGround: 0x7e7060,
  hemiIntensity: 0.66,
  fog: 0xecc0a4,
  fogNear: 60,
  fogFar: 380,
  disc: 0xffe0b8,
  discSize: 30,
  halo: 0xffa060,
  haloSize: 200,
  haloOpacity: 0.55,
  stars: 0.1,
  galaxy: 0,
  cloud: 0xffc0a8,
  cloudShade: 0x8a7890,
  cloudOpacity: 1,
};

export const DUSK_LOW: Rung = {
  zenith: 0x3c5eb0,
  horizon: 0xffb070,
  glow: 0xff8a50,
  glowStrength: 1,
  sun: 0xffb070,
  sunIntensity: 1.3,
  hemiSky: 0xe0c8d0,
  hemiGround: 0x8a7060,
  hemiIntensity: 0.72,
  fog: 0xe8b090,
  fogNear: 100,
  fogFar: 440,
  disc: 0xffd090,
  discSize: 26,
  halo: 0xffa060,
  haloSize: 170,
  haloOpacity: 0.5,
  stars: 0,
  galaxy: 0,
  cloud: 0xffd0b0,
  cloudShade: 0xa08898,
  cloudOpacity: 1,
};

export const DAWN_LOW: Rung = {
  zenith: 0x5f7fc0,
  horizon: 0xffc9a0,
  glow: 0xff9a58,
  glowStrength: 1.1,
  sun: 0xffc08a,
  sunIntensity: 1.3,
  hemiSky: 0xd8dcff,
  hemiGround: 0x8a7a66,
  hemiIntensity: 0.72,
  fog: 0xf0c8a6,
  fogNear: 70,
  fogFar: 400,
  disc: 0xffe0b8,
  discSize: 26,
  halo: 0xffa060,
  haloSize: 170,
  haloOpacity: 0.55,
  stars: 0,
  galaxy: 0,
  cloud: 0xffd9c0,
  cloudShade: 0xa89aa8,
  cloudOpacity: 1,
};

export const MORNING: Rung = {
  zenith: 0x2b74d8,
  horizon: 0xd8e6f8,
  glow: 0xffe8c0,
  glowStrength: 0.55,
  sun: 0xffe8c4,
  sunIntensity: 1.45,
  hemiSky: 0xf6f6ff,
  hemiGround: 0xa8a090,
  hemiIntensity: 0.88,
  fog: 0xc8e0f4,
  fogNear: 130,
  fogFar: 480,
  disc: 0xfff4e0,
  discSize: 20,
  halo: 0xfff0d0,
  haloSize: 130,
  haloOpacity: 0.4,
  stars: 0,
  galaxy: 0,
  cloud: 0xfff4ea,
  cloudShade: 0xc8ccd8,
  cloudOpacity: 1,
};

// The zenith is a DEEP blue, the blue a photograph of a clear noon comes
// back with over a contrail, and the horizon the pale band under it.
export const DAY: Rung = {
  zenith: 0x1f6fd8,
  horizon: 0xbfe3ff,
  glow: 0xfff3c8,
  glowStrength: 0.35,
  sun: 0xfff2d8,
  sunIntensity: 1.5,
  hemiSky: 0xffffff,
  hemiGround: 0xb0a894,
  hemiIntensity: 0.95,
  fog: 0xbfe3ff,
  fogNear: 160,
  fogFar: 520,
  disc: 0xfff8dc,
  discSize: 18,
  halo: 0xfff3c8,
  haloSize: 110,
  haloOpacity: 0.35,
  stars: 0,
  galaxy: 0,
  cloud: 0xffffff,
  cloudShade: 0xdde4ee,
  cloudOpacity: 1,
};

/** The rungs in order of elevation, degrees, for each half of the day. */
export const KEYS: { at: number; dawn: Rung; dusk: Rung }[] = [
  { at: -12, dawn: DARK, dusk: DARK },
  { at: -5, dawn: DAWN_TWILIGHT, dusk: DUSK_TWILIGHT },
  { at: 0, dawn: DAWN_SET, dusk: DUSK_SET },
  { at: 8, dawn: DAWN_LOW, dusk: DUSK_LOW },
  { at: 22, dawn: MORNING, dusk: MORNING },
  { at: 40, dawn: DAY, dusk: DAY },
];

/** Between which elevations the key light hands over from the sun to the
 * moon, degrees under the horizon. Above the top of the band the world is
 * lit by the afterglow's skylight from the sun's side; below the bottom it
 * is moonlit from the other. */
