// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT COLOUR THE AIR IS — where the sun is, the weather and the season
// turned into one `Preset` the renderer can hang a sky on. Pure data and
// colour arithmetic: nothing here owns a mesh, a light or a frame, which is
// what lets `environment.ts` stay about the scene it builds out of this.
//
// Four layers, applied in that order and in that order for a reason:
//
//   THE SUN      astronomy (daylight.ts) — how high it stands this hour,
//                this season, over this country, and which way it is going.
//   THE LADDER   the authored art direction, keyed on that elevation: a rung
//                for the dark, for civil twilight, for the sun on the
//                horizon, for the golden hour, for the morning and for the
//                day, with the dawn rungs and the dusk rungs painted
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

import * as THREE from "three";
import {
  CLIMATE,
  biomeRules,
  rainsIn,
  type BiomeId,
  type RaceEnv,
  type Season,
  type Weather,
} from "@engine";

import { daylightOf, litAt, moonAt, sunAt, type Daylight, type SunPlace } from "./daylight.ts";
import { CASTS, LOOKS, TAIGA_LOOKS } from "./sky-looks.ts";
import { coverOf } from "./weather.ts";

export const DOME_RADIUS = 560;

const DEG = Math.PI / 180;

/**
 * THE CLOUD DECK — an overcast sky's LID, and the whole difference between
 * weather that reads as weather and weather that reads as a grey filter.
 *
 * A clear sky is a gradient with clouds floating in it. An overcast one is
 * not: it is a ceiling a few hundred metres up, and what the player is
 * looking at over most of the sky is the UNDERSIDE of that ceiling. So the
 * deck is drawn as a real surface, and it is lit from two directions —
 * diffusely from above (which is what `overhead` says) and from the open
 * air out past the weather (`rim`).
 *
 * Those two move OPPOSITE ways between rain and a storm, and that is the
 * realism the whole model is built for:
 *
 *   * Under RAIN the deck is thin enough to glow. Overhead it is near
 *     white — brighter than anything on the ground — and it greys off
 *     toward the rim, where the line of sight runs the long way through
 *     it. A rainy day is a WHITE sky, not a dark one.
 *   * Under a STORM the deck is kilometres thick and lets nothing through.
 *     Overhead it is nearly black, and the one bright thing in the sky is
 *     the strip at the rim where daylight gets in UNDER the base. That
 *     strip is what makes a squall line look like a squall line.
 */
export type Deck = {
  /** The underside directly overhead. */
  overhead: number;
  /** …and out at the rim, where the light comes in under the base. */
  rim: number;
  /** How far above the road the base hangs, m. */
  base: number;
  /** How lumpy the underside is, 0..1 — a smooth stratus sheet at nothing,
   * a ragged mammatus ceiling at one. */
  relief: number;
};

export type Preset = {
  zenith: number;
  horizon: number;
  /** Horizon glow color around the sun's azimuth, and how far it spreads. */
  glow: number;
  glowStrength: number;
  /** THE KEY LIGHT: the sun by day, the moon by night, and a blend of the
   * two through the twilight between. */
  sun: number;
  sunIntensity: number;
  /** Radians above the horizon — never under it: a key light from below the
   * ground lights nothing. */
  sunElevation: number;
  /** World heading the key light stands at (daylight.ts's convention). */
  sunAzimuth: number;
  /** THE REAL SUN, wherever it is — under the horizon included. Anything
   * that asks how much sun a thing at altitude gets (a contrail, a cirrus
   * sheet, the mist in the valley) reads these rather than the key. */
  sunUp: number;
  sunBearing: number;
  /** The word for this light, for anything that keys on one. */
  daylight: Daylight;
  /** How much of that light arrives as a BEAM rather than as skylight that
   * has been scattered on the way down, 0..1. An open sky is all beam; a
   * deck is a lampshade over the stage, and what comes through it arrives
   * from everywhere at once. Nothing about the KEY reads this — a cloudy
   * noon is still bright — only the things a beam does that scattered light
   * cannot, the shadow under a car first among them. */
  beam: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  /** The visible disc and its halo, at the KEY's place — the sun, or the
   * moon once it has taken over. */
  disc: number;
  discSize: number;
  halo: number;
  haloSize: number;
  haloOpacity: number;
  /** 0–1 star opacity. */
  stars: number;
  /** What a cloud in full sun is coloured this hour, and what its shaded
   * underside is. By day the two are white and a pale grey; at sunset the
   * lit face is orange and the shade a purple-grey, and the layered sky
   * decides per layer which of the two a cloud gets by whether the sun
   * still reaches its altitude (`litAt`). */
  cloud: number;
  cloudShade: number;
  cloudOpacity: number;
  /** How much of the fair-weather cumulus ring this sky carries, 0..1 — a
   * COUNT, not a fade. A country with little weather in it gets fewer
   * clouds rather than see-through ones, because a thin cumulus reads as a
   * rendering fault and a half-empty sky reads as a dry one. Ignored while
   * a deck is up: a lid is a lid in any country. */
  cloudShare: number;
  headlights: boolean;
  /** The lid over the sky, or null for an open one. */
  deck: Deck | null;
  /** How hard it is raining, 0..1 — what the drops and the wet beds read. */
  rain: number;
  /** How electric the sky is, 0..1 — 0 is a sky with no lightning in it. */
  thunder: number;
};

/** One rung of the ladder: everything about a clear sky that is authored
 * rather than derived, at one elevation of the sun. */
type Rung = {
  zenith: number;
  horizon: number;
  glow: number;
  glowStrength: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  disc: number;
  discSize: number;
  halo: number;
  haloSize: number;
  haloOpacity: number;
  stars: number;
  cloud: number;
  cloudShade: number;
  cloudOpacity: number;
};

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
const DARK: Rung = {
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
  cloud: 0x2b3a5a,
  cloudShade: 0x1a2438,
  cloudOpacity: 0.85,
};

const DUSK_TWILIGHT: Rung = {
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
  cloud: 0xe0868e,
  cloudShade: 0x3a3054,
  cloudOpacity: 1,
};

const DAWN_TWILIGHT: Rung = {
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
  cloud: 0xf0a898,
  cloudShade: 0x46405c,
  cloudOpacity: 1,
};

// The Sega Rally mountain sunset: magenta clouds over a purple sky, the
// disc a swollen orange coin on the rim. The horizon is a warm salmon
// rather than the glow's red, because the red belongs to the band round
// the sun; away from it the rim goes rose and the sky over it purple.
const DUSK_SET: Rung = {
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
  cloud: 0xff9a74,
  cloudShade: 0x7e5a80,
  cloudOpacity: 1,
};

// Valheim's misty peach morning, the disc pale and huge in the haze.
const DAWN_SET: Rung = {
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
  cloud: 0xffc0a8,
  cloudShade: 0x8a7890,
  cloudOpacity: 1,
};

const DUSK_LOW: Rung = {
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
  cloud: 0xffd0b0,
  cloudShade: 0xa08898,
  cloudOpacity: 1,
};

const DAWN_LOW: Rung = {
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
  cloud: 0xffd9c0,
  cloudShade: 0xa89aa8,
  cloudOpacity: 1,
};

const MORNING: Rung = {
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
  cloud: 0xfff4ea,
  cloudShade: 0xc8ccd8,
  cloudOpacity: 1,
};

// The zenith is a DEEP blue, the blue a photograph of a clear noon comes
// back with over a contrail, and the horizon the pale band under it.
const DAY: Rung = {
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
  cloud: 0xffffff,
  cloudShade: 0xdde4ee,
  cloudOpacity: 1,
};

/** The rungs in order of elevation, degrees, for each half of the day. */
const KEYS: { at: number; dawn: Rung; dusk: Rung }[] = [
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
const MOON_TAKES_OVER = { from: -3, to: -9 };

/** The key light is never allowed under this, radians: a sun on the
 * horizon still lights the world from the side, and one under it would
 * light nothing at all. */
const KEY_FLOOR = 2 * DEG;

/** Under this the car has its lights on — the sun's own rule; the weather
 * has its own (`WeatherLook.lampsAt`). Four degrees: the golden hour is
 * driven on daylight, the sunset on lamps. */
const LAMPS_UNDER = 4 * DEG;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Mix two packed colours, `t` of the way from `a` to `b`. */
function mixHex(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

/** One rung blended into the next. */
function blendRung(a: Rung, b: Rung, t: number): Rung {
  const out = {} as Rung;
  for (const key of Object.keys(a) as (keyof Rung)[]) {
    const x = a[key];
    const y = b[key];
    // Colours are the fields authored as hex; everything else is a number
    // on a scale. The two are told apart by which fields they are, not by
    // their size — a fog distance of 400 is not a colour.
    out[key] = COLOUR_FIELDS.has(key) ? mixHex(x, y, t) : lerp(x, y, t);
  }
  return out;
}

const COLOUR_FIELDS = new Set<keyof Rung>([
  "zenith",
  "horizon",
  "glow",
  "sun",
  "hemiSky",
  "hemiGround",
  "fog",
  "disc",
  "halo",
  "cloud",
  "cloudShade",
]);

/** The clear sky for this much sun, going this way. */
function rungAt(elevation: number, rising: boolean): Rung {
  const el = elevation / DEG;
  const side = rising ? "dawn" : "dusk";
  if (el <= KEYS[0].at) return { ...KEYS[0][side] };
  for (let i = 1; i < KEYS.length; i++) {
    if (el <= KEYS[i].at) {
      const t = (el - KEYS[i - 1].at) / (KEYS[i].at - KEYS[i - 1].at);
      return blendRung(KEYS[i - 1][side], KEYS[i][side], smooth(t));
    }
  }
  return { ...KEYS[KEYS.length - 1][side] };
}

function smooth(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** THE CLEAR SKY for a sun at `sun`: the rung, and the key light placed. */
function clearSky(sun: SunPlace): Preset {
  const rung = rungAt(sun.elevation, sun.rising);
  const moon = moonAt(sun);
  // How far the moon has taken the key over, 0..1.
  const handed = clamp01(
    (sun.elevation / DEG - MOON_TAKES_OVER.from) / (MOON_TAKES_OVER.to - MOON_TAKES_OVER.from),
  );
  // The sun's side of the sky keeps the key while the afterglow lasts; the
  // moon's takes it as the dark comes down. Both stand off the floor.
  const sunKey = Math.max(KEY_FLOOR, sun.elevation);
  const moonKey = Math.max(KEY_FLOOR, moon.elevation);
  const sunElevation = lerp(sunKey, moonKey, handed);
  const sunAzimuth = sun.azimuth + Math.PI * handed;
  return {
    ...rung,
    sunElevation,
    sunAzimuth,
    sunUp: sun.elevation,
    sunBearing: sun.azimuth,
    daylight: daylightOf(sun),
    beam: 1,
    cloudShare: 1,
    headlights: sun.elevation < LAMPS_UNDER,
    deck: null,
    rain: 0,
    thunder: 0,
  };
}

/** The clear-weather baseline, for anything that needs a reference sky
 * rather than the one being drawn (the car's tint measures against noon). */
export const NOON: Preset = {
  ...DAY,
  sunElevation: 0.95,
  sunAzimuth: 0.9,
  sunUp: 0.95,
  sunBearing: 0.9,
  daylight: "day",
  beam: 1,
  cloudShare: 1,
  headlights: false,
  deck: null,
  rain: 0,
  thunder: 0,
};

function countried(p: Preset, biome: BiomeId): Preset {
  const cast = CASTS[biome];
  if (!cast) return p;
  p.horizon = mixHex(p.horizon, cast.horizon[0], cast.horizon[1]);
  p.zenith = mixHex(p.zenith, cast.zenith[0], cast.zenith[1]);
  p.fog = mixHex(p.fog, cast.fog[0], cast.fog[1]);
  p.fogNear *= cast.fogReach;
  p.fogFar *= cast.fogReach;
  p.sun = mixHex(p.sun, cast.sun[0], cast.sun[1]);
  p.sunIntensity *= cast.sunStrength;
  p.hemiGround = mixHex(p.hemiGround, cast.hemiGround[0], cast.hemiGround[1]);
  p.cloudOpacity *= cast.cloudCover;
  p.cloudShare *= cast.cloudShare;
  return p;
}

/** Weather sits on top of the hour. Clear leaves it alone; anything else
 * puts a lid on the sky, closes the air, and takes the sun away. `wet`
 * says the weather RAINS here (`rainsIn`, climate.ts): a desert in its wet
 * season is under the taiga's own deck, a real one that comes down, rather
 * than under its dry haze and its wall of sand. */
function weathered(
  sun: SunPlace,
  weather: Weather,
  cover: number,
  biome: BiomeId,
  wet: boolean,
): Preset {
  const p = countried(clearSky(sun), biome);
  if (weather === "clear") return p;
  // How lit the deck is from above, 0..1 — what its own brightness is
  // scaled by, so a ceiling over a sun that has set is dark rather than a
  // white sheet over a dark stage. Saturating: any real daylight lights a
  // rain deck to its authored white (an autumn noon is half a June one and
  // the sky under rain is white in both), and it is only the last of the
  // light going that takes the ceiling down with it.
  const light = smooth((dayLight(p) - 0.1) / 0.4);
  const look = (wet && !biomeRules(biome).rain ? TAIGA_LOOKS : LOOKS[biome])[weather];
  const toward = (c: number): number => mixHex(c, look.grey, look.mix);
  p.zenith = toward(p.zenith);
  p.horizon = toward(p.horizon);
  p.glow = toward(p.glow);
  p.glowStrength *= 0.4;
  p.sun = toward(p.sun);
  p.sunIntensity *= lerp(look.dim[0], look.dim[1], cover);
  p.hemiSky = toward(p.hemiSky);
  p.hemiGround = toward(p.hemiGround);
  p.hemiIntensity *= lerp(look.hemi[0], look.hemi[1], cover);
  // Dark enough to drive on lights. A rally car under a black sky at noon
  // has its lamps on, and the pair of pools it lays down the road is most
  // of what makes a storm read as something to be careful in.
  if (cover >= look.lampsAt) p.headlights = true;
  p.fog = toward(p.fog);
  p.fogNear *= lerp(look.fogNear[0], look.fogNear[1], cover);
  p.fogFar *= lerp(look.fogFar[0], look.fogFar[1], cover);
  // A lit sun behind a deck is a bright PATCH, never a disc with an edge —
  // behind a storm's deck it is not there at all, and through blowing sand
  // it is a pale coin the whole way.
  const through = lerp(look.through[0], look.through[1], cover);
  // …and the same fraction is all that is left of the BEAM. A thin sheet of
  // rain cloud still puts a soft shadow under a car; a storm's ceiling puts
  // none at all, which is the difference between an overcast stage and one
  // that merely has weather over it.
  p.beam = through;
  p.haloOpacity *= 0.3 * through;
  p.haloSize *= 1.5;
  p.discSize = 0;
  p.stars *= 0.2 * through;
  p.cloud = toward(p.cloud);
  p.cloudShade = toward(p.cloudShade);
  const overheadLit = mixHex(look.overhead[0], look.overhead[1], cover);
  const deck: Deck = {
    // The underside is lit from ABOVE, by whatever day there is: at night
    // it is as dark as the sky it hides.
    overhead: mixHex(0x06080c, overheadLit, 0.06 + 0.94 * light),
    // The rim is the hour's own horizon pulled toward the strip's tone, so
    // a midnight storm keeps a dark one and a noon storm gets the lit gap
    // under the base.
    rim: mixHex(p.horizon, look.rim, look.rimMix * (0.35 + 0.65 * light)),
    base: lerp(look.base[0], look.base[1], cover),
    relief: lerp(look.relief[0], look.relief[1], cover),
  };
  p.deck = deck;
  // The distance goes the colour of the ceiling, which is what turns a
  // rainy stage milk-white a hundred metres out and a stormy one to soot.
  p.fog = mixHex(p.fog, deck.overhead, look.fogDeck);
  p.rain = lerp(look.rain[0], look.rain[1], cover);
  // The far ridges are seen against the CEILING rather than against a
  // zenith nobody can see under it, so that is what they dissolve into.
  p.zenith = mixHex(p.zenith, deck.overhead, 0.55);
  p.thunder = lerp(look.thunder[0], look.thunder[1], cover);
  return p;
}

// ── The seasons, as what they do to the AIR ───────────────────────────────
// Where the sun stands in each season is astronomy and is already in the
// elevation this preset was built for (daylight.ts). What is left to the
// season here is the colour of the air and of the ground under it: pollen
// haze in May, the straw-and-bilberry bounce in September, and the cold
// clear air of a winter that reaches every country.

function seasoned(p: Preset, season: Season, biome: BiomeId, temperature: number): Preset {
  if (season === "summer") return p;
  // WINTER is the one cast every country shares, because it is not a
  // colour of the ground so much as of the AIR: cold air holds almost no
  // water, so a clear winter sky is the deepest blue of the year and the
  // view runs furthest — and under it the ground is white wherever the
  // climate froze it, so what comes back up is the sky's own blue rather
  // than any green (`hemiGround`). The colder it is the more of both:
  // ice haze closes the far distance in again below `CLIMATE.bite.at`,
  // the way a real cold snap greys the horizon.
  if (season === "winter") {
    const cold = clamp01((CLIMATE.freeze - temperature) / 20);
    const frozen = temperature <= CLIMATE.freeze;
    p.zenith = mixHex(p.zenith, 0x0d4f9e, 0.18 + 0.14 * cold);
    p.horizon = mixHex(p.horizon, 0xd8e6f4, 0.22);
    p.fog = mixHex(p.fog, 0xdfe8f0, 0.28);
    p.fogFar *= frozen ? 1.1 - 0.25 * cold : 1.04;
    p.hemiIntensity *= 0.92;
    if (frozen && biomeRules(biome).land.zones.snow !== null) {
      p.hemiGround = mixHex(p.hemiGround, 0xb8c8dc, 0.7);
    } else if (frozen) {
      p.hemiGround = mixHex(p.hemiGround, 0xb8c8dc, 0.6);
    } else {
      // A wet-season desert, or a thaw: a damp ground bounces less.
      p.hemiGround = mixHex(p.hemiGround, 0x8a8478, 0.35);
    }
    p.cloud = mixHex(p.cloud, 0xe8eef6, 0.2);
    return p;
  }
  // The colour casts below are the TAIGA's year — pollen haze in May, the
  // straw-and-bilberry bounce in September. The desert's year is the
  // astronomy and very little else: a wet spring puts a little more dust
  // in the air, and that is the whole of it.
  if (biome !== "taiga") {
    if (season === "spring") p.fogFar *= 0.96;
    return p;
  }
  if (season === "autumn") {
    // September air in the north is dry and clean — the humidity and the
    // pollen haze of high summer are gone — so the sky reads deeper and
    // the view opens out, while the low sun warms the horizon band.
    p.zenith = mixHex(p.zenith, 0x0f5fb0, 0.22);
    p.horizon = mixHex(p.horizon, 0xffd9a8, 0.2);
    p.fog = mixHex(p.fog, 0xe8d3ac, 0.18);
    p.fogFar *= 1.08;
    // Skylight is the other half of the key, and there is less of it under
    // a low sun. The ground BOUNCES a different colour too: what comes back
    // up off a straw-and-bilberry landscape is warm, not green.
    p.hemiIntensity *= 0.88;
    p.hemiGround = mixHex(p.hemiGround, 0xa8843f, 0.5);
    p.cloud = mixHex(p.cloud, 0xffe6cc, 0.15);
  } else {
    // May: the air still carries haze and birch pollen, so the sky is
    // milkier and the distance closes in a little.
    p.zenith = mixHex(p.zenith, 0x8fb4dc, 0.16);
    p.fog = mixHex(p.fog, 0xd8e2e8, 0.12);
    p.fogFar *= 0.94;
    p.hemiIntensity *= 0.97;
    p.hemiGround = mixHex(p.hemiGround, 0x9a9060, 0.35);
  }
  return p;
}

/** The whole sky at `hour` on one run's conditions, over one country
 * (R40). The hour is the SUN's clock rather than the stage's start: the
 * environment reads it off the race clock every frame (`sunHourAt`). */
export function skyAt(env: RaceEnv, biome: BiomeId, hour: number): Preset {
  const wet = rainsIn(biome, env.season);
  const sun = sunAt(hour, env.season, biome);
  return seasoned(
    weathered(sun, env.weather, coverOf(env), biome, wet),
    env.season,
    biome,
    env.temperature,
  );
}

/** The sky a run STARTS under. */
export function skyFor(env: RaceEnv, biome: BiomeId = "taiga"): Preset {
  return skyAt(env, biome, env.hour);
}

/** How dark the car is ever allowed to get, as a fraction of its daylight
 * paint. Everything else in the world is lit by the scene's own lights and
 * simply goes where they go; the car cannot, and past this it stops reading
 * as a car and starts reading as a silhouette with tail lamps. */
const CAR_FLOOR = 0.2;

/** The light a preset actually puts on a horizontal surface: the sky half
 * of the hemisphere plus what is left of the sun at its elevation. Linear
 * light, because that is the space three.js multiplies colors in. */
function keyLight(p: Preset): THREE.Color {
  const sky = new THREE.Color(p.hemiSky).multiplyScalar(p.hemiIntensity);
  const sun = new THREE.Color(p.sun).multiplyScalar(
    p.sunIntensity * Math.max(0, Math.sin(p.sunElevation)),
  );
  return sky.add(sun);
}

/** What the failing light does to the CAR. The body is fullbright — its
 * shading is baked into vertex colors so the arcade look never pops — which
 * means no light in the scene can reach it: at dusk the whole world goes
 * down and the car alone stays at noon, sitting on the landscape like a
 * sticker. This is the light put back on it: the preset's OWN key, measured
 * against the day preset's, so the car is as dark as the ground it stands
 * on and any retune of the lighting (or of the weather that dims it) is
 * carried onto the paint for free. */
export function carTintFor(p: Preset): THREE.Color {
  const here = keyLight(p);
  const noon = keyLight(NOON);
  const ratio = (a: number, b: number): number =>
    CAR_FLOOR + (1 - CAR_FLOOR) * Math.min(1, b > 0 ? a / b : 1);
  return new THREE.Color(ratio(here.r, noon.r), ratio(here.g, noon.g), ratio(here.b, noon.b));
}

/** ...and the same question for a cloud of dust, which is answered
 * differently because a cloud is not a car. The body needs a floor under it
 * or it stops reading as a car at all; hanging dust in the dark is SUPPOSED
 * to disappear — a plume you can see by is a plume that is emitting light.
 * So this floor is barely a floor, and what is left of a night cloud is
 * whatever the lamps put back on it (dust-light.ts). */
const DUST_FLOOR = 0.12;

/**
 * WHAT THE FAILING LIGHT DOES TO A CLOUD.
 *
 * Same measurement as the car's, and a different curve on it, because the
 * two fail differently. A car under a night sky is a shape the player has
 * to keep steering; a plume under a night sky is a thing that should barely
 * be there until a lamp finds it.
 *
 * So the two ends are pinned and the shape between them is what differs.
 * At noon this is 1 and the cloud is exactly what it has always been — the
 * daylight plume was never the complaint. Squaring the ratio is what makes
 * the failing light bite: dusk takes a cloud down markedly further than it
 * takes the paint, which is the hour the two are seen side by side. And the
 * floor under it is barely a floor, because what is left of a night cloud
 * should be whatever the lamps put back on it (dust-light.ts) — enough that
 * the mass is still THERE against the road, not enough to see by.
 */
export function dustTintFor(p: Preset): THREE.Color {
  const here = keyLight(p);
  const noon = keyLight(NOON);
  const ratio = (a: number, b: number): number => {
    const lit = Math.min(1, b > 0 ? a / b : 1);
    return DUST_FLOOR + (1 - DUST_FLOOR) * lit * lit;
  };
  return new THREE.Color(ratio(here.r, noon.r), ratio(here.g, noon.g), ratio(here.b, noon.b));
}

/**
 * HOW MUCH DAYLIGHT THERE IS, 0..1 against a clear noon.
 *
 * Two things in the world are not lit by the scene's lights and have to be
 * told: the snow on the far peaks (a vertex-colour lift, which under a
 * black sky would otherwise be the brightest thing in the frame) and the
 * car's own lamps, which are a POOL on the ground in the dark and barely
 * visible in the day. One number answers both, and it follows any retune of
 * the weather for free.
 */
export function dayLight(p: Preset): number {
  const full = lum(keyLight(NOON));
  return full > 0 ? Math.min(1, lum(keyLight(p)) / full) : 1;
}

/** Perceived brightness of a colour, 0..1 — the Rec. 709 weights, which is
 * what "how much light is this" means for anything measured against
 * another light rather than mixed with it. */
function lum(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/**
 * HOW HARD THE LIGHT THROWS A CAR'S SHADOW, 0..1.
 *
 * The stage's one directional light carries the shadow map every car is
 * drawn into (car-shadow.ts), and which way that light points is already
 * the shadow's direction. What the light cannot say on its own is whether
 * it is a BEAM at all: under a deck the key is still there — the stage
 * would be black without it — but the light it stands in for arrives from
 * everywhere at once and throws nothing. This is that share.
 *
 * Hardness is the beam's share of the light on the ground, not its
 * strength: a shadow is the absence of the direct half, so what decides how
 * dark it goes is how much of the light would be missing — a low sun over a
 * dark sky throws a harder shadow than a high one over a bright one, which
 * is why dusk shadows read black and a bright overcast noon has none.
 * Measured against a clear noon's own share rather than left as a raw
 * fraction for the reason the car's tint is: the day the game's shadows
 * are authored for sits at 1, so retuning the weather carries.
 */
export function sunHardness(p: Preset): number {
  const noon = beamShare(NOON);
  return noon > 0 ? Math.min(1, beamShare(p) / noon) : 0;
}

/** The beam's share of the light on the ground, 0..1 — what is missing from
 * the shadow, which is what makes it dark. What the country's shadow and a
 * cloud's take off the ground (height-fog.ts) is the same share. */
export function beamShareOf(p: Preset): number {
  return beamShare(p);
}

function beamShare(p: Preset): number {
  const beam = lum(new THREE.Color(p.sun)) * p.sunIntensity * Math.sin(Math.max(0, p.sunElevation));
  const sky = lum(new THREE.Color(p.hemiSky)) * p.hemiIntensity;
  const total = beam * p.beam + sky;
  return total > 0 ? (beam * p.beam) / total : 0;
}

/**
 * WHAT COLOUR THE RAIN READS AS under this sky.
 *
 * A raindrop does not emit light, it refracts what is behind it — so what
 * makes a streak visible is CONTRAST with the sky, and the sign of that
 * contrast flips. Against a bright overcast the drops are darker than the
 * background and rain reads as grey hatching; against a storm's black
 * ceiling, or at night, they catch the little light there is and read pale.
 * One pale grey for both is why rain so often disappears on precisely the
 * weather that has the most of it.
 */
export function rainTone(p: Preset): THREE.Color {
  const sky = new THREE.Color(p.deck ? p.deck.overhead : p.horizon);
  const lum = 0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b;
  // The crossover is where the sky stops being able to sit behind a pale
  // streak. Below it the sheet is lit; above it the sheet is a shadow.
  if (lum < 0.28) return new THREE.Color(0xd6e4f2);
  return sky.multiplyScalar(0.45);
}

/** What colour a FLAKE reads as. A flake is not a lens: it is a white body
 * lit by whatever light there is, so it takes the sky's own light and goes
 * grey under a storm and blue at night rather than flipping sign the way
 * a drop does. Held off pure white so a daylight blizzard is a sheet of
 * grey-white against a white sky rather than a screen of blown-out dots. */
export function snowTone(p: Preset): THREE.Color {
  const light = new THREE.Color(p.hemiSky).multiplyScalar(Math.max(0.35, p.hemiIntensity));
  return light.lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(0.92);
}

/**
 * WHAT COLOUR A THING AT ALTITUDE IS LIT — a cloud, a contrail.
 *
 * The sun sets on the ground first. A cirrus sheet ten kilometres up is in
 * full sun for a quarter of an hour after the valley has lost it, so it
 * burns the sunset's orange over a landscape that has gone grey, and then
 * goes grey itself — and a contrail at airliner height does exactly the
 * same. The lit tone and the shade are the preset's; how much of each a
 * given altitude gets is where the real sun is (`litAt`).
 */
export function highLightFor(p: Preset, altitude: number): THREE.Color {
  const lit = litAt(altitude, p.sunUp);
  return new THREE.Color(p.cloudShade).lerp(new THREE.Color(p.cloud), lit);
}

/** Direction from the origin toward a light at elevation `el` on world
 * heading `az`. */
export function sunDir(el: number, az: number): THREE.Vector3 {
  const c = Math.cos(el);
  return new THREE.Vector3(Math.sin(az) * c, Math.sin(el), Math.cos(az) * c);
}
