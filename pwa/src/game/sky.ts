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

import {
  brightestLamps,
  daylightOf,
  lampsAt,
  litAt,
  moonAt,
  sunAt,
  type Daylight,
  type LampStage,
  type SunPlace,
} from "./daylight.ts";
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

/**
 * HOW HIGH THE DECK'S LIT RIM REACHES, radians above the horizon.
 *
 * The gradient runs on the ELEVATION of the ceiling above the eye, not on
 * how far out it is — and the difference is the whole look. A driver looks
 * along the road, so the sky they can see is a band a few degrees high:
 * read against distance, that band is all "nearly at the rim" and the whole
 * visible ceiling comes out the rim's colour, which is a light grey sky in
 * a thunderstorm. Read against elevation, the rim is what it physically is
 * — the last few degrees where the line of sight passes out from under the
 * base — and everything above it is the black underside.
 *
 * Stated here rather than in either sky, because BOTH draw the ceiling
 * (clouds.ts's mesh and sky-shader.ts's dome, which interpolates the number
 * into its GLSL) and the HORIZON reads it too: the ridge rings run from the
 * skyline to about twenty degrees, so this ramp crosses the lower half of
 * the chain and a ring shaded against one flat colour hangs in front of it.
 */
export const RIM_BAND = 0.16;

/**
 * WHAT THE CEILING LOOKS LIKE at `elevation` radians above the eye — its
 * black underside overhead, its lit strip at the rim, and the ramp between
 * them. Whatever is IN the sky at that height (relief lumps, a flash) is
 * the caller's, which is why this takes a plain elevation and nothing else.
 */
export function deckToneAt(deck: Deck, elevation: number, out: THREE.Color): THREE.Color {
  const rim = 1 - Math.min(1, Math.max(0, elevation) / RIM_BAND);
  return out.set(deck.overhead).lerp(RIM_TONE.set(deck.rim), Math.pow(rim, 1.5));
}

/** Scratch for the mix above — both callers run it over hundreds of
 * vertices a repaint, and neither wants an allocation apiece. */
const RIM_TONE = new THREE.Color();

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
  /** …and how much of the DIFFUSE night sky shows — the Milky Way and the
   * galaxies behind it (starfield.ts). Its own number rather than a share
   * of the stars, because the two die at very different rates: a first
   * magnitude star is still there in the last of the twilight, and the band
   * needs a genuinely black sky before it is there at all. */
  galaxy: number;
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
  /** How much light the car is running (`LampStage`) — the stage's answer,
   * because what a driver reaches for the switch about is the sky. */
  lamps: LampStage;
  /** The lid over the sky, or null for an open one. */
  deck: Deck | null;
  /** How hard it is raining, 0..1 — what the drops and the wet beds read. */
  rain: number;
  /** How electric the sky is, 0..1 — 0 is a sky with no lightning in it. */
  thunder: number;
};

/** One rung of the ladder: everything about a clear sky that is authored
 * rather than derived, at one elevation of the sun. */
export type Rung = {
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
  galaxy: number;
  cloud: number;
  cloudShade: number;
  cloudOpacity: number;
};

import { DAY, KEYS } from "./sky-rungs.ts";

const MOON_TAKES_OVER = { from: -3, to: -9 };

/** The key light is never allowed under this, radians: a sun on the
 * horizon still lights the world from the side, and one under it would
 * light nothing at all. */
const KEY_FLOOR = 2 * DEG;

/** How little daylight a deck can leave on the road before the lamps come on
 * at all, whatever the country's own cover threshold says — a share of a
 * clear noon (`dayLight`). `WeatherLook.lampsAt` is art direction, written
 * per country and per weather in units of how THICK the lid is, and thick is
 * not the same question as dark: a squall that never reaches its country's
 * cover figure can still put less light on the stage than a rain deck that
 * does. This is the floor under it, so what settles whether a car is running
 * lights is always how much light there is. */
const LAMPS_DIM = 0.24;

/** ...and how little is left before the lamps go PAST dipped. A black storm
 * at midday still has more light on the road than this and stays on dipped
 * beams — a full driving beam under a sky that is merely dark reads as a
 * searchlight rather than as weather — where the same deck over an afternoon
 * that was already losing the light does not, which is the difference
 * between a dark day and a night that arrived early. */
const LAMPS_GLOOM = 0.06;

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
    // HOW VISIBLE THE BAND IS is far steeper than any pair of rungs can
    // blend: a sky twice as bright does not show half the Milky Way, it
    // shows almost none of it, because the band is a glow a shade over the
    // sky's own floor and the twilight it is competing with is not. So the
    // rungs author how much band a sky HAS and this is the curve between
    // them — at the bottom of the ladder the whole of it, and at nautical
    // twilight, four degrees up the ladder, a fifth.
    galaxy: rung.galaxy * rung.galaxy * rung.galaxy,
    sunElevation,
    sunAzimuth,
    sunUp: sun.elevation,
    sunBearing: sun.azimuth,
    daylight: daylightOf(sun),
    beam: 1,
    cloudShare: 1,
    lamps: lampsAt(sun.elevation),
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
  lamps: "off",
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

/**
 * HOW MUCH DAY THERE IS IN THE AIR, 0..1 — the elevation, degrees, read as
 * a ramp: one for any sun above the horizon, gone by nautical twilight.
 *
 * The colours of the AIR are all statements about sunlight in it — the
 * weather's grey lid, the lit strip under a gust front, September's warm
 * horizon band, winter's ice haze. Not one of them is a property of the air
 * itself, and after dark there is no sun to make any of them, so each is
 * shown in this proportion.
 *
 * The mixes it guards cannot simply be left at full strength after dark.
 * `mixHex` mixes in LINEAR light, where a midnight sky sits four orders
 * under a bright authored grey — so a fifth of the way toward one lands two
 * thirds of the way up the sRGB ramp, and the far ridges, which take their
 * colour from the fog and the zenith (horizon.ts), came out a mid-grey
 * chain hanging in front of a ceiling drawn black.
 *
 * Keyed on the SUN rather than on the light there is, because neither of
 * the two numbers for that can tell night from weather: `dayLight` is the
 * key light and therefore the moon after dark, reading 0.10 at a clear
 * midnight against 0.09 under a storm at noon, and `light` below is how lit
 * the deck's own underside is, which a real morning has barely started to
 * do at five degrees. The ladder can tell — its rungs ARE elevations.
 */
function daytime(elevation: number): number {
  return clamp01((elevation / DEG + 10) / 8);
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
  const day = daytime(sun.elevation);
  /** The lid's grey on one of the LIGHTS: taken whole, because a deck
   * kilometres thick greys the moon as surely as it greys the sun. */
  const toward = (c: number): number => mixHex(c, look.grey, look.mix);
  /** …and on one of the SKY's own colours, which is cloud with the DAY on
   * it: a midnight lid is not grey, it is black, and the deck below says so
   * (`overhead`). Left at full strength this was the whole of why a night
   * storm had a daylight-grey horizon and a chain of grey ridges standing
   * in front of a black ceiling. */
  const greyed = (c: number): number => mixHex(c, look.grey, look.mix * day);
  p.zenith = greyed(p.zenith);
  p.horizon = greyed(p.horizon);
  p.glow = greyed(p.glow);
  p.glowStrength *= 0.4;
  p.sun = toward(p.sun);
  p.sunIntensity *= lerp(look.dim[0], look.dim[1], cover);
  p.hemiSky = toward(p.hemiSky);
  p.hemiGround = toward(p.hemiGround);
  p.hemiIntensity *= lerp(look.hemi[0], look.hemi[1], cover);
  // Dark enough to drive on lights. A rally car under a black sky at noon
  // has its lamps on, and the pair of pools it lays down the road is most
  // of what makes a storm read as something to be careful in — and once the
  // deck has taken enough of the day with it that the stage is night in
  // everything but the clock, the driving lamps go on with them. Read off
  // `dayLight` rather than off the cover, so it is the light actually left
  // on the road that decides, and a heavy deck late in the afternoon asks
  // for main beam where the same deck at noon does not.
  const under = dayLight(p);
  if (cover >= look.lampsAt || under <= LAMPS_DIM) p.lamps = brightestLamps(p.lamps, "dipped");
  if (under <= LAMPS_GLOOM) p.lamps = brightestLamps(p.lamps, "main");
  p.fog = greyed(p.fog);
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
  // The band goes first and goes further: it is a glow a shade over the
  // sky's own black, and the thinnest sheet of cloud is brighter than it.
  p.galaxy *= 0.06 * through;
  p.cloud = greyed(p.cloud);
  p.cloudShade = greyed(p.cloudShade);
  const overheadLit = mixHex(look.overhead[0], look.overhead[1], cover);
  const deck: Deck = {
    // The underside is lit from ABOVE, by whatever day there is: at night
    // it is as dark as the sky it hides.
    overhead: mixHex(0x06080c, overheadLit, 0.06 + 0.94 * light),
    // The rim is the hour's own horizon pulled toward the strip's tone, so
    // a midnight storm keeps a dark one and a noon storm gets the lit gap
    // under the base. The strip IS daylight arriving under the base from
    // outside the weather, so after dark there is none of it to arrive and
    // the rim is the hour's horizon and nothing else — and the rim band is
    // the band of sky the lower half of the ridge chain stands in
    // (`RIM_BAND`), so a lit strip left under a night storm is a lit strip
    // drawn exactly where the mountains are.
    rim: mixHex(p.horizon, look.rim, look.rimMix * day),
    base: lerp(look.base[0], look.base[1], cover),
    relief: lerp(look.relief[0], look.relief[1], cover),
  };
  p.deck = deck;
  // The distance goes the colour of the ceiling, which is what turns a
  // rainy stage milk-white a hundred metres out and a stormy one to soot.
  p.fog = mixHex(p.fog, deck.overhead, look.fogDeck);
  p.rain = lerp(look.rain[0], look.rain[1], cover);
  // Nobody can SEE the zenith under a lid, so the blue behind it is pulled
  // most of the way to the ceiling: what is left of it shows only where the
  // deck does not quite reach (the dome's own gradient under the base) and
  // as the colour the canvas is cleared to. The ridges used to dissolve
  // into it and no longer do — they read the ceiling itself, at their own
  // height (`deckToneAt`, horizon.ts).
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
  const day = daytime(p.sunUp);
  /** One of the season's colour casts, shown in proportion to the DAY
   * (`daytime`): all of them are statements about sunlight in that air —
   * September's warm horizon band, May's pollen milk, winter's ice haze —
   * and what the season keeps after dark is how CLEAR the air is
   * (`fogFar`), which is true at any hour. */
  const cast = (c: number, to: number, t: number): number => mixHex(c, to, t * day);
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
    p.zenith = cast(p.zenith, 0x0d4f9e, 0.18 + 0.14 * cold);
    p.horizon = cast(p.horizon, 0xd8e6f4, 0.22);
    p.fog = cast(p.fog, 0xdfe8f0, 0.28);
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
    p.cloud = cast(p.cloud, 0xe8eef6, 0.2);
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
    p.zenith = cast(p.zenith, 0x0f5fb0, 0.22);
    p.horizon = cast(p.horizon, 0xffd9a8, 0.2);
    p.fog = cast(p.fog, 0xe8d3ac, 0.18);
    p.fogFar *= 1.08;
    // Skylight is the other half of the key, and there is less of it under
    // a low sun. The ground BOUNCES a different colour too: what comes back
    // up off a straw-and-bilberry landscape is warm, not green.
    p.hemiIntensity *= 0.88;
    p.hemiGround = mixHex(p.hemiGround, 0xa8843f, 0.5);
    p.cloud = cast(p.cloud, 0xffe6cc, 0.15);
  } else {
    // May: the air still carries haze and birch pollen, so the sky is
    // milkier and the distance closes in a little.
    p.zenith = cast(p.zenith, 0x8fb4dc, 0.16);
    p.fog = cast(p.fog, 0xd8e2e8, 0.12);
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

/** How much of the sky's light a flake keeps once there is no daylight left
 * to keep any of — the LIT sheet's floor: enough that it still falls past a
 * lit window or a rival's tail lamps, far too little to compete with a
 * beam. */
const NIGHT_SNOW = 0.1;

/** …and the UNLIT sheet's, which has to be far higher for the opposite
 * reason: with no lamps reaching the flakes, the sky is the only thing that
 * can show them, so a sheet honestly dark is a sheet nobody can tell is
 * falling. */
const UNLIT_SNOW = 0.35;

/** What colour a FLAKE reads as IN THE SKY'S OWN LIGHT — the ambient half
 * of it. `lit` says whether anything else is going to reach the flakes: on
 * the DETAIL row's top stop the car's lamps are summed per flake on top of
 * this (snowfall.ts), and below it this is all there is.
 *
 * A flake is not a lens: it is a white body lit by whatever light there is,
 * so it takes the sky's own light and goes grey under a storm and blue at
 * night rather than flipping sign the way a drop does. Held off pure white
 * so a daylight blizzard is a sheet of grey-white against a white sky
 * rather than a screen of blown-out dots.
 *
 * WHEN THE LAMPS ARE COMING, IT RIDES THE DAYLIGHT DOWN, and that is the
 * whole reason a night blizzard reads as one. Snow is the brightest thing
 * in the frame by day, and by night it is nothing at all until something
 * lights it: what the driver sees is a cone of flakes burning in the beams
 * against black air, and how hard that cone reads is the CONTRAST between
 * the two, not how bright the lit half is. Floor the ambient at a grey and
 * there is no contrast to have — every flake is already near white, the
 * lamps add nothing a screen can show, and a blizzard at midnight comes out
 * as the same flat sheet it is at noon.
 *
 * With no lamps coming there is no contrast to protect and the floor goes
 * back up: the two stops are lit-and-dark against evenly-grey, which is the
 * honest shape of that trade rather than one being the other dimmed. */
export function snowTone(p: Preset, lit: boolean): THREE.Color {
  const day = Math.max(lit ? NIGHT_SNOW : UNLIT_SNOW, dayLight(p));
  const light = new THREE.Color(p.hemiSky).multiplyScalar(Math.max(0.35 * day, p.hemiIntensity));
  return light.lerp(new THREE.Color(0xffffff), 0.45 * day).multiplyScalar(0.92);
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
