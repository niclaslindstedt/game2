// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD, AS LAYERS THAT NEVER STOP — the tyres, the wind, the weather and
// the slide, as a pure function of how the car is going.
//
// Knowing nothing about `GameState`, for two reasons that turned out to be
// the same reason: it is the half worth auditioning on its own (`make
// audition` drives it from sliders, which is the only honest way to judge a
// continuous sound), and it is the half worth testing.
//
//   TYRES    what the wheels are rolling on — the surface, heard
//   WIND     how fast the air is going past, which is what sells speed
//   SCRUB    the drift: a tyre asked to go somewhere it is not pointing —
//            and the wheelspin, which is the same tyre asked to go faster
//            than the road under it
//   RAIN     the weather, which is heard whatever the wheels are doing
//   GALE     the wind that is not the car's — the only layer here a PARKED
//            car in a storm can still hear
//
// AND WATER CHANGES WHAT A SURFACE IS, rather than merely adding to it. A
// soaked gravel road is not a gravel road with rain over the top: the
// stones stop rattling and start squelching, the roar drops, and a film of
// water under the tread makes a straight LOUDER where dry grit makes it
// quieter. So every surface has a wet twin and the bed reads somewhere
// between the two — see `WET_SURFACES`.
//
// WHY THE DRIFT IS THE LOUDEST THING HERE. This game is about the moment the
// car stops going where it is pointing; the scrub IS that moment's audio,
// it is proportional to how sideways the car actually is, and it is mixed to
// be heard over the engine at full lock. If a slide does not sound dangerous,
// nothing else in the mix will make it feel that way.
//
// AND THE COROLLARY: a straight is almost NOTHING. A tyre rolling straight
// ahead barely makes a noise — what makes the noise is a tyre being asked to
// turn the car, which is why every surface here is written as a quiet cruise
// level plus a `corner` multiplier rather than as one constant hiss. A bed
// that is as loud on the straight as it is in the corner tells the player
// nothing, and it is the loudest thing in the mix for the whole run.
//
// Because every layer is steered rather than fired, a surface change is a
// CROSS-FADE for free: the wheels leaving gravel for turf take the bed from
// one voice to the other over the glide, and drizzle genuinely lands between
// a road and its wet twin.

import type { LayerSpec, LayerTarget, NoiseColor } from "../../lib/voice.ts";

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
 * takes over from the slide once the car is actually sideways. */
const SING_FLOOR = 0.4;

/** One noise layer over the surface's roar. `hz` is where it sits at a
 * crawl and `climb` how much of that speed adds on top. Which of the two
 * layer SLOTS it goes in decides its shape: `grain` is the open highpass
 * (a chip flicked off a tread is a click with nothing under it, so gravel's
 * crunch is everything above its corner and climbs hard with pace); `tear`
 * is penned into a band (turf has no top end to give — a torn stem and a
 * flattened clod are a dull mid-range tear that sounds the same at any
 * speed, and penning it in is what stops an off-road bed reading as a sheet
 * of metal being scoured). */
type Layer = {
  level: number;
  hz: number;
  climb: number;
};

/**
 * What a surface sounds like under a rolling tyre.
 *
 * `hz` is where the roar sits: asphalt is a dull bass drumming felt through
 * the body, gravel a broad low rush (a thousand stones a second at no
 * interval at all), water a bright hiss. `color` picks which of the two
 * roar layers carries it. `level` is the bed's weight. Over the roar sit
 * three optional layers, and which of them a surface has is most of what
 * tells them apart:
 *
 *   `body`  — a wider band filling the MIDDLE of the voice. A road surface
 *             does not need one: what it is made of is under the tread and
 *             it is all bottom end. A car ploughing turf does — the grass
 *             and moss going flat, the stems dragging along the underside —
 *             and without it the bed is a low boom and a bright hiss with a
 *             hole between them, which is exactly what sheet metal sounds like.
 *   `grain` — the individual pieces the tyres are actually throwing, open
 *             upward from a corner.
 *   `tear`  — the pieces being torn, penned into a band.
 */
export type SurfaceVoice = {
  color: NoiseColor;
  hz: number;
  /** The bed rolling STRAIGHT AHEAD at speed — the quiet half. */
  level: number;
  /** …and what it multiplies up to with the tyres at full lateral load. 1 is a
   * surface that sounds the same through a corner; 5 is one you only really
   * hear when you turn. It scales every layer with it, because the surface
   * only gets moved when something asks it to move. */
  corner: number;
  body?: Layer;
  grain?: Layer;
  tear?: Layer;
};

export const SURFACES: Record<string, SurfaceVoice> = {
  // Tarmac: a DULL BASS RUMBLE and nothing else. A sealed surface under a
  // tyre rolling straight ahead is the quietest a car ever is — there is
  // nothing being thrown and nothing being crushed, only the tread drumming
  // the body, which is felt more than heard and lives below everything else
  // in the mix. What tarmac HAS is the corner — the singing tyre further
  // down, which is where all of this surface's drama is kept.
  asphalt: { color: "brown", hz: 125, level: 0.004, corner: 2.8 },
  // Graded gravel: the game's home surface. Broad and busy, but a RUSH rather
  // than a roar until the car turns — then it is the surface being thrown.
  // It is the thing the player hears most, so it is mixed UNDER the engine:
  // a rush that has to be shouted over is one nobody can enjoy for twenty
  // minutes. Its band sits low too — a dirt road is a rumble with grit on
  // top, not a hiss.
  gravel: {
    color: "pink",
    hz: 250,
    level: 0.0085,
    corner: 5.2,
    // The stones themselves: bright, and brighter still with speed, because
    // faster means more of them a second and each one hit harder.
    grain: { level: 0.0032, hz: 1500, climb: 0.87 },
  },
  // SAND (R40, the desert's road): gravel with the stones taken out of it.
  // Nothing rattles — a tyre in sand is being ploughed rather than pelted —
  // so there is no grain and the bed drops into a soft, heavy hiss that is
  // louder pointed straight than gravel's is (the drag is audible) and gains
  // less in the corner, because a slide on sand throws a sheet rather than
  // a spray. The top of the voice is the sand itself blowing off the tread.
  sand: {
    color: "pink",
    hz: 210,
    level: 0.011,
    corner: 3.6,
    body: { level: 0.006, hz: 700, climb: 0.5 },
  },
  // Water: a hiss with weight behind it and no crunch at all. Barely cares
  // which way the car is pointing — a ford is loud because it is being
  // ploughed through, not because it is being cornered on.
  water: { color: "pink", hz: 900, level: 0.06, corner: 1.3 },
  // OFF THE ROAD ENTIRELY — turf, moss, rutted forest floor. The one surface
  // in the game with no hard material anywhere in it, and the whole trick to
  // it is that its energy is spread across the MIDDLE instead of split
  // between a bottom and a top. Most of what a car ploughing a field makes
  // is the suspension working, so the roar is broad and low and stays loud
  // on the straight — being off the road should sound like a mistake.
  nature: {
    color: "brown",
    hz: 150,
    level: 0.03,
    corner: 1.6,
    body: { level: 0.02, hz: 560, climb: 0.22 },
    tear: { level: 0.01, hz: 1150, climb: 0.18 },
  },
};

/**
 * THE SAME FOUR SURFACES WITH WATER STANDING ON THEM.
 *
 * Not a filter over the dry voice — a different surface, because that is
 * what rain makes of one. Two things move on every row and they move
 * opposite ways: the `grain` all but disappears (a wet stone is a stone
 * that has been stuck to the road, and mud does not rattle), while `level`
 * goes UP, because the loudest thing about a wet road is the water itself
 * being squeezed out from under the tread — which is also why the `corner`
 * multipliers come down. A wet surface is loud all the time, so it has
 * less left to say when the car turns.
 */
export const WET_SURFACES: Record<string, SurfaceVoice> = {
  // MUD, which is what this game's home surface becomes in the rain: the
  // dry road's busy mid-range rush drops most of an octave into a heavy
  // wet churn with no stones in it at all.
  gravel: {
    color: "pink",
    hz: 190,
    level: 0.0195,
    corner: 3.4,
    grain: { level: 0.0005, hz: 1500, climb: 0.87 },
  },
  // Wet sand packs hard and goes quiet — a beach at low tide. (It only ever
  // happens off a Roam dial: the desert's own sky never rains.)
  sand: {
    color: "brown",
    hz: 170,
    level: 0.009,
    corner: 2.2,
    body: { level: 0.002, hz: 600, climb: 0.3 },
  },
  // Wet tarmac: the one surface the rain makes BRIGHTER. A sealed road
  // holds a film of water the tread has to cut through, and that hiss is
  // the whole sound of a wet sealed stage.
  asphalt: { color: "pink", hz: 1150, level: 0.021, corner: 1.9 },
  // Sodden turf: heavier and duller still, and squelching rather than
  // rough. Every band moves DOWN — wet grass does not rustle, it is dragged.
  nature: {
    color: "brown",
    hz: 130,
    level: 0.035,
    corner: 1.4,
    body: { level: 0.025, hz: 430, climb: 0.22 },
    tear: { level: 0.0055, hz: 780, climb: 0.18 },
  },
  // Water is already water. Left identical on purpose, so a ford sounds
  // like a ford whatever the sky is doing.
  water: { color: "pink", hz: 900, level: 0.06, corner: 1.3 },
};

/** One optional layer, mixed. A side that HAS the layer where the other
 * does not is faded by its own weight rather than dropped: rain does not
 * delete the grass a car is ploughing through, it only changes what the
 * grass sounds like. */
function mixLayer(
  dry: Layer | undefined,
  soaked: Layer | undefined,
  wet: number,
): Layer | undefined {
  if (dry === undefined) return soaked && { ...soaked, level: soaked.level * wet };
  if (soaked === undefined) return { ...dry, level: dry.level * (1 - wet) };
  const mix = (a: number, b: number): number => a + (b - a) * wet;
  return {
    level: mix(dry.level, soaked.level),
    hz: mix(dry.hz, soaked.hz),
    climb: mix(dry.climb, soaked.climb),
  };
}

/** The dry surface and its wet twin, mixed. `wet` is 0 on a clear stage,
 * about half in rain and 1 in a storm, so drizzle genuinely lands between
 * the two rather than flipping to mud at a threshold. The noise COLOUR
 * cannot be mixed, so it goes with whichever side is carrying more of the
 * sound — which is inaudible where they are level, because that is exactly
 * where the two spectra overlap most. */
export function surfaceUnder(surface: string, wet: number): SurfaceVoice {
  const dry = SURFACES[surface] ?? (SURFACES.gravel as SurfaceVoice);
  const soaked = WET_SURFACES[surface];
  if (soaked === undefined || wet <= 0) return dry;
  const mix = (a: number, b: number): number => a + (b - a) * wet;
  return {
    color: wet > 0.5 ? soaked.color : dry.color,
    hz: mix(dry.hz, soaked.hz),
    level: mix(dry.level, soaked.level),
    corner: mix(dry.corner, soaked.corner),
    body: mixLayer(dry.body, soaked.body, wet),
    grain: mixLayer(dry.grain, soaked.grain, wet),
    tear: mixLayer(dry.tear, soaked.tear, wet),
  };
}

/** How loud the weather itself is, and where it sits. Two layers, because
 * rain heard from inside a moving car is two things: the SHEET of it in
 * the air all around, and the PATTER of the drops that are hitting the
 * car. Both lift with speed — a car standing still is rained on, a car at
 * 140 km/h is driving INTO the rain. */
const RAIN = { sheet: 0.024, patter: 0.016, pace: 0.55 };

/** How much of the rain's level the squall owns. Rain does not fall at one
 * rate: it comes in waves, and a sheet that holds a constant level for two
 * minutes is the same fault as a tyre bed that is as loud on the straight
 * as it is in the corner — the loudest thing in the mix, saying nothing. */
const SQUALL_SWING = 0.45;

/** THE WIND THAT IS NOT THE CAR'S. A low roar with something thin on top —
 * the roar is the mass of air, the whistle is what it is being dragged over. */
const GALE = { roar: 0.03, whistle: 0.01 };

/** The road under one car at one instant. Everything the layers need, and
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
  /** How lit the driven wheels are, 0..1 — a launch, or a gear that has
   * more than the road will take. The same tyre noise as a slide, going
   * the other way. */
  spin: number;
  /** Which way the back end has gone: sideways velocity, m/s. Only its sign
   * and rough size matter — it places the spray on the stereo stage. */
  sideways: number;
  /** Nothing under the wheels. */
  airborne: boolean;
  /** How wet the stage is, 0..1 — clear, rain, storm. It picks the surface
   * (see `WET_SURFACES`) and it is the weather's own voice. */
  wet: number;
  /** How hard it is coming down this instant, 0..1 — the squall breathing
   * around the stage's own rate. */
  squall: number;
  /** How much wind there is in the air, 0..1 of a full gale. */
  gale: number;
};

/** What the seat does to the road — four of the listener's numbers. */
export type RoadMix = {
  tyres: number;
  scrub: number;
  wind: number;
  weather: number;
};

export type RoadLayer =
  | "wind"
  | "rainSheet"
  | "rainPatter"
  | "galeRoar"
  | "galeWhistle"
  | "roarPink"
  | "roarBrown"
  | "body"
  | "grain"
  | "tear"
  | "dig"
  | "spray"
  | "sing"
  | "singTone";

/** What each layer is BUILT from. Two roar layers rather than one because
 * a noise source's colour is the one thing that cannot be steered, and the
 * surfaces disagree about it. */
export const ROAD_LAYERS: Record<RoadLayer, LayerSpec> = {
  wind: { kind: "noise", color: "pink", filter: { type: "highpass" } },
  rainSheet: { kind: "noise", color: "pink", filter: { type: "highpass" } },
  rainPatter: { kind: "noise", color: "brown", filter: { type: "bandpass", q: 1.1 } },
  galeRoar: { kind: "noise", color: "brown", filter: { type: "lowpass", q: 1.3 } },
  galeWhistle: { kind: "noise", color: "pink", filter: { type: "bandpass", q: 2.4 } },
  roarPink: { kind: "noise", color: "pink", filter: { type: "bandpass", q: 0.75 } },
  roarBrown: { kind: "noise", color: "brown", filter: { type: "bandpass", q: 0.6 } },
  body: { kind: "noise", color: "pink", filter: { type: "bandpass", q: 0.5 } },
  grain: { kind: "noise", color: "white", filter: { type: "highpass" } },
  tear: { kind: "noise", color: "pink", filter: { type: "bandpass", q: 0.7 } },
  dig: { kind: "noise", color: "pink", filter: { type: "bandpass", q: 0.7 } },
  spray: { kind: "noise", color: "white", filter: { type: "highpass" } },
  sing: { kind: "noise", color: "white", filter: { type: "bandpass", q: 7 } },
  singTone: {
    kind: "tone",
    type: "sawtooth",
    detuneCents: 14,
    drive: 1,
    vibrato: { rateHz: 7.5, depthCents: 22 },
    filter: { type: "bandpass", q: 3 },
  },
};

/** How fast each layer follows, s. The surface itself takes a tenth — a
 * wheel leaving the road is a cross-fade, not a switch — and the weather
 * a good deal longer, because a squall arrives rather than happens. */
export const ROAD_GLIDE: Record<RoadLayer, number> = {
  wind: 0.08,
  rainSheet: 0.25,
  rainPatter: 0.2,
  galeRoar: 0.3,
  galeWhistle: 0.3,
  roarPink: 0.1,
  roarBrown: 0.1,
  body: 0.1,
  grain: 0.08,
  tear: 0.1,
  dig: 0.06,
  spray: 0.06,
  sing: 0.05,
  singTone: 0.05,
};

const SILENT: LayerTarget = { level: 0 };

/**
 * Where every layer of the road should be for `voice`, heard from `mix`.
 *
 * The wind and the weather play through everything — a storm does not stop
 * while the car is in the air, and the gale is the one thing still audible
 * when the player has stopped altogether. The tyres and the scrub are only
 * there with wheels on the ground and turning.
 */
export function roadTargets(voice: RoadVoice, mix: RoadMix): Record<RoadLayer, LayerTarget> {
  const { speed, air, surface, corner, slide, spin, sideways, airborne, wet, squall, gale } = voice;

  // ── The air ────────────────────────────────────────────────────────────
  // Wind is the layer that actually sells pace: pitch says revs, noise says
  // SPEED. Squared, because the ear reads air noise as roughly its power and a
  // linear ramp leaves a fast car sounding like a slightly quicker slow one.
  // Louder in the air, with nothing under the wheels to mask it.
  const wind: LayerTarget = {
    level: 0.05 * air * air * (airborne ? 1.35 : 1) * mix.wind,
    cutoff: 400 + 1500 * air,
  };

  // ── The weather ────────────────────────────────────────────────────────
  const drive = (1 + RAIN.pace * air) * (1 - SQUALL_SWING + 2 * SQUALL_SWING * squall);
  const rainSheet: LayerTarget = { level: RAIN.sheet * wet * drive * mix.weather, cutoff: 2600 };
  const rainPatter: LayerTarget = {
    level: RAIN.patter * wet * drive * mix.weather,
    cutoff: 620 + 260 * air,
  };

  // ── The gale ───────────────────────────────────────────────────────────
  // Squared, like the car's own air layer; the thin edge on top only a real
  // blow has, so it comes in on the fourth power rather than the second.
  const galeRoar: LayerTarget = {
    level: GALE.roar * gale * gale * mix.weather,
    cutoff: 300 + 500 * gale,
  };
  const galeWhistle: LayerTarget = {
    level: GALE.whistle * Math.pow(gale, 4) * mix.weather,
    cutoff: 1150 + 700 * gale,
  };

  const out: Record<RoadLayer, LayerTarget> = {
    wind,
    rainSheet,
    rainPatter,
    galeRoar,
    galeWhistle,
    roarPink: SILENT,
    roarBrown: SILENT,
    body: SILENT,
    grain: SILENT,
    tear: SILENT,
    dig: SILENT,
    spray: SILENT,
    sing: SILENT,
    singTone: SILENT,
  };

  // Airborne, the only things left are the engine, the wind and the
  // weather. The silence where the tyres were is what a jump sounds like,
  // and it is worth more than any effect that could be put in its place.
  if (airborne || speed < ROLL_FLOOR) return out;

  // ── The tyres ──────────────────────────────────────────────────────────
  const road = surfaceUnder(surface, wet);
  const roll = Math.min(1, air / 0.8);
  // The cornering multiplier: 1 dead ahead, `road.corner` with the tyres at
  // their lateral limit. It is what makes a straight quiet and a corner an
  // event, and it lifts the crunch with the roar because a stone is only
  // thrown by a tyre that is pushing it sideways.
  const lean = 1 + (road.corner - 1) * corner;
  const weight = lean * (0.25 + 0.75 * roll) * mix.tyres;
  const roar: LayerTarget = { level: road.level * weight, cutoff: road.hz * (0.7 + 0.5 * roll) };
  if (road.color === "brown") out.roarBrown = roar;
  else out.roarPink = roar;
  if (road.body) {
    out.body = {
      level: road.body.level * weight,
      cutoff: road.body.hz * (1 + road.body.climb * roll),
    };
  }
  if (road.grain) {
    out.grain = {
      level: road.grain.level * lean * roll * mix.tyres,
      cutoff: road.grain.hz * (1 + road.grain.climb * roll),
    };
  }
  if (road.tear) {
    out.tear = {
      level: road.tear.level * weight,
      cutoff: road.tear.hz * (1 + road.tear.climb * roll),
    };
  }

  // ── The scrub ──────────────────────────────────────────────────────────
  // How far past gripping the tyres actually are, either way — sideways in
  // a slide, or spinning up under a launch. On a loose surface this is the
  // whole story; on tarmac it is only the half that arrives last.
  const slip = Math.max(Math.max(0, (slide - SCRUB_FLOOR) / (1 - SCRUB_FLOOR)), spin * 0.9);

  if (surface === "asphalt") {
    // ON TARMAC A TYRE SINGS, AND IT STARTS SINGING BEFORE IT LETS GO. The
    // rubber grips, releases and grips again at a rate the ear hears as a
    // pitch — so the sealed-surface corner is a resonant band with a driven
    // note inside it, and it is the one place in this game anything squeals.
    // A WET TYRE DOES NOT SING: a film of water is exactly the thing that
    // stops the grip-and-release happening.
    const scrub =
      Math.max(slip, Math.max(0, (corner - SING_FLOOR) / (1 - SING_FLOOR))) *
      Math.max(roll, spin) *
      (1 - 0.6 * wet);
    if (scrub <= 0) return out;
    const sing = 780 + 520 * scrub;
    out.sing = { level: 0.075 * scrub * mix.scrub, cutoff: sing };
    out.singTone = {
      level: 0.04 * scrub * scrub * mix.scrub,
      hz: sing,
      cutoff: sing * 1.6,
      grit: 0.5,
    };
    return out;
  }
  // ON GRAVEL A TYRE DIGS. There is nothing to grip and let go of, so there
  // is no pitch, and no protest before the fact either: a loose surface only
  // makes a new noise once the car is genuinely sideways, and what that
  // sounds like is the surface being thrown — a wide rush that opens up the
  // more sideways the car is, with the stones spraying off the top of it.
  const scrub = slip * Math.max(roll, spin);
  if (scrub <= 0) return out;
  out.dig = { level: 0.08 * scrub * mix.scrub, cutoff: 700 + 1300 * scrub };
  out.spray = {
    level: 0.03 * scrub * mix.scrub,
    cutoff: 2150 + 1250 * scrub,
    // Thrown to the outside of the slide, so a drift is a drift the player
    // can hear the direction of with the camera behind the car.
    pan: Math.max(-0.6, Math.min(0.6, -sideways / 12)),
  };
  return out;
}
