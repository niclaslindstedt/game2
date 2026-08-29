// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT COLOUR THE AIR IS — the time of day, the weather and the season
// turned into one `Preset` the renderer can hang a sky on. Pure data and
// colour arithmetic: nothing here owns a mesh, a light or a frame, which is
// what lets `environment.ts` stay about the scene it builds out of this.
//
// Three layers, applied in that order and in that order for a reason:
//
//   TIME OF DAY  the authored art direction — where the sun is and what
//                colour it makes everything (`PRESETS`).
//   WEATHER      a LID over the top of it (`weathered`). Rain and a storm
//                are not the same sky dimmed by different amounts: one is
//                white and one is black, and both replace the gradient
//                overhead with the underside of a cloud deck.
//   SEASON       astronomy under both (`seasoned`): how high the sun gets
//                at this latitude at this time of year, and how much air
//                its beam has to come through to arrive.

import * as THREE from "three";
import type { RaceEnv, Season, TimeOfDay, Weather } from "@engine";

import { coverOf } from "./weather.ts";

/** Where the sun/moon sits on the compass, radians — fixed for every stage
 * so dawn and dusk always have a lit side; stages bend enough that every
 * run crosses the light at some point. */
export const SUN_AZIMUTH = 0.9;
export const DOME_RADIUS = 560;

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
  /** How far above the camera the base hangs, m. */
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
  /** The directional "sun" (the moon at night). */
  sun: number;
  sunIntensity: number;
  /** Radians above the horizon. */
  sunElevation: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  /** The visible disc and its halo. */
  disc: number;
  discSize: number;
  halo: number;
  haloSize: number;
  haloOpacity: number;
  /** 0–1 star opacity. */
  stars: number;
  cloud: number;
  cloudOpacity: number;
  headlights: boolean;
  /** The lid over the sky, or null for an open one. */
  deck: Deck | null;
  /** How hard it is raining, 0..1 — what the drops and the wet beds read. */
  rain: number;
  /** How electric the sky is, 0..1 — 0 is a sky with no lightning in it. */
  thunder: number;
};

// The four times of day, authored for clear weather. Dawn is Valheim's
// misty peach morning; day is the bright arcade baseline; dusk is the Sega
// Rally mountain sunset (magenta clouds over a purple sky); night is a
// moonlit blue that stays readable.
const PRESETS: Record<TimeOfDay, Preset> = {
  dawn: {
    zenith: 0x5f7fc0,
    horizon: 0xffc9a0,
    glow: 0xff9a58,
    glowStrength: 1.1,
    sun: 0xffc08a,
    sunIntensity: 1.3,
    sunElevation: 0.14,
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
    cloudOpacity: 1,
    headlights: false,
    deck: null,
    rain: 0,
    thunder: 0,
  },
  day: {
    zenith: 0x1f7fe0,
    horizon: 0xbfe3ff,
    glow: 0xfff3c8,
    glowStrength: 0.35,
    sun: 0xfff2d8,
    sunIntensity: 1.5,
    sunElevation: 0.95,
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
    cloudOpacity: 1,
    headlights: false,
    deck: null,
    rain: 0,
    thunder: 0,
  },
  dusk: {
    zenith: 0x3a2f6e,
    horizon: 0xff6a3d,
    glow: 0xff4f5a,
    glowStrength: 1.25,
    sun: 0xff9663,
    sunIntensity: 1.15,
    sunElevation: 0.09,
    hemiSky: 0xc9a0c8,
    hemiGround: 0x6e5a4a,
    hemiIntensity: 0.62,
    fog: 0xe08a6a,
    fogNear: 90,
    fogFar: 430,
    disc: 0xffb36a,
    discSize: 30,
    halo: 0xff5f46,
    haloSize: 210,
    haloOpacity: 0.6,
    stars: 0.15,
    cloud: 0xd86a8a,
    cloudOpacity: 1,
    headlights: true,
    deck: null,
    rain: 0,
    thunder: 0,
  },
  night: {
    zenith: 0x0a1230,
    horizon: 0x1d2d55,
    glow: 0x9fb6ff,
    glowStrength: 0.5,
    sun: 0xb8ccff,
    sunIntensity: 0.55,
    sunElevation: 0.65,
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
    cloudOpacity: 0.85,
    headlights: true,
    deck: null,
    rain: 0,
    thunder: 0,
  },
};

/** The clear-weather baseline, for anything that needs a reference sky
 * rather than the one being drawn (the car's tint measures against noon). */
export const NOON = PRESETS.day;

/**
 * ONE WEATHER, AT ITS LIGHTEST AND AT ITS HEAVIEST.
 *
 * Every pair here is read at the stage's own `cover` (see `coverOf`), so no
 * two wet stages are the same sky: one rally is run under a high thin
 * ceiling with the light still coming through it, the next under a low
 * black one. A single authored grey is what makes every wet stage in a game
 * look like the same wet stage.
 */
type WeatherLook = {
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
  /** The deck's underside overhead, thin cover → thick. */
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
};

const LOOKS: Record<Exclude<Weather, "clear">, WeatherLook> = {
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
  },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Mix two packed colours, `t` of the way from `a` to `b`. */
function mixHex(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

/** Weather sits on top of the time of day. Clear leaves it alone; anything
 * else puts a lid on the sky, closes the air, and takes the sun away. */
function weathered(time: TimeOfDay, weather: Weather, cover: number): Preset {
  const p = { ...PRESETS[time] };
  if (weather === "clear") return p;
  const look = LOOKS[weather];
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
  // and behind a storm's deck it is not there at all.
  const through = weather === "rain" ? 1 - cover : 0;
  p.haloOpacity *= 0.3 * through;
  p.haloSize *= 1.5;
  p.discSize = 0;
  p.stars *= 0.2 * through;
  p.cloud = toward(p.cloud);
  const deck: Deck = {
    overhead: mixHex(look.overhead[0], look.overhead[1], cover),
    // The rim is the time of day's own horizon pulled toward the strip's
    // tone, so a midnight storm keeps a dark one and a noon storm gets the
    // lit gap under the base.
    rim: mixHex(p.horizon, look.rim, look.rimMix),
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

// ── The seasons, as astronomy rather than art direction ───────────────────
// The single biggest difference between a May stage and a September one is
// not the leaves — it is where the sun IS. A taiga rally is run at around
// 62°N (central Scandinavia), and the sun's noon elevation there is
// 90° − latitude + declination. The declination runs from +23.44° at the
// summer solstice down through zero at the equinoxes, so:
//
//   mid-May          90 − 62 + 17.5  ≈ 45° above the horizon at noon
//   summer solstice  90 − 62 + 23.4  ≈ 51°
//   late September   90 − 62 −  1.8  ≈ 26°
//
// Half the height, at the season the north's colour peaks. Everything else
// here falls out of that one number: longer shadows, a dimmer and warmer
// beam, and a colder, lower key over the whole landscape.

/** Where the taiga is, degrees north. */
const LATITUDE = 62;

/** The sun's declination in the middle of each season, degrees — mid-May,
 * the June solstice, and the last week of September, which is when "ruska"
 * (the north's autumn colour) peaks. Winter is not a season of this biome:
 * the boreal forest under snow is the arctic one. */
const DECLINATION: Record<Season, number> = { spring: 17.5, summer: 23.4, autumn: -1.8 };

/** The sine of the noon solar elevation — which is both how high the sun
 * gets and, because irradiance on flat ground goes as the cosine of the
 * zenith angle, how much of its light lands there. */
function noonSun(season: Season): number {
  return Math.sin(((90 - LATITUDE + DECLINATION[season]) * Math.PI) / 180);
}

/** Rayleigh optical depth of the whole clear atmosphere at sea level, per
 * air mass, at the wavelengths the renderer's three channels stand for
 * (~650, 550 and 450 nm). Scattering goes as λ⁻⁴, so blue is stripped out
 * of a beam about four and a half times as fast as red — which is why the
 * sky is blue, why a low sun is orange, and why a September noon is warmer
 * than a June one before a single cloud is involved. */
const RAYLEIGH = { r: 0.049, g: 0.097, b: 0.221 };

/** The season sits UNDER the time of day: it decides how high the sun gets
 * at all, and the time of day then says where along that arc it is. So the
 * elevation is SCALED rather than shifted — a dawn sun sits on the horizon
 * in every season; it is the noon one that moves — and the extra air the
 * lower beam has to come through is charged once, at the season's own noon,
 * rather than compounded onto a dawn that is already the length of the
 * atmosphere. */
function seasoned(p: Preset, season: Season): Preset {
  if (season === "summer") return p;
  const here = noonSun(season);
  const peak = noonSun("summer");
  p.sunElevation = Math.asin(Math.min(1, Math.sin(p.sunElevation) * (here / peak)));
  // Air mass is 1/sin(elevation): the path a beam takes through the
  // atmosphere, in units of the straight-up one.
  const extraAir = 1 / here - 1 / peak;
  const through = (depth: number): number => Math.exp(-depth * extraAir);
  const tr = through(RAYLEIGH.r);
  const tg = through(RAYLEIGH.g);
  const tb = through(RAYLEIGH.b);
  // What survives the trip, channel by channel. Applied to the sun's COLOR
  // rather than its intensity because that is what it physically is: a beam
  // that has lost more blue than red is both warmer and weaker, and one
  // multiply says both.
  const sun = new THREE.Color(p.sun);
  p.sun = sun.setRGB(sun.r * tr, sun.g * tg, sun.b * tb).getHex();
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

/** The whole sky for one run's conditions. */
export function skyFor(env: RaceEnv): Preset {
  return seasoned(weathered(env.timeOfDay, env.weather, coverOf(env)), env.season);
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
  const here = keyLight(p);
  const noon = keyLight(NOON);
  const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const full = lum(noon);
  return full > 0 ? Math.min(1, lum(here) / full) : 1;
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

/** Direction from the origin toward the sun for elevation `el`. */
export function sunDir(el: number): THREE.Vector3 {
  const c = Math.cos(el);
  return new THREE.Vector3(Math.sin(SUN_AZIMUTH) * c, Math.sin(el), Math.cos(SUN_AZIMUTH) * c);
}
