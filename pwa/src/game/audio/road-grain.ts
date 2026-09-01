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

/**
 * ONE GRAIN SHAPE FOR EVERY LAYER OF THE ROAD, and it is a cross-fade: the
 * attack and the tail are each exactly one cadence, so what one grain gives up
 * the next has already taken, and the hold is three more on top — a deeper
 * stack than the engine's, because uncorrelated noise sums in POWER rather
 * than in level and a broadband bed needs more copies before it stops
 * fluttering.
 *
 * THE TEMPTATION IS TO GIVE THE BRIGHT LAYERS A SHORTER ONE so they sound
 * tighter — the crunch, the spray, the rain's patter were all written as a
 * fraction of this. They held for barely more than a cadence each, so each was
 * up on its own half the time and its level swung about 3 dB nine times a
 * second: on a bright band that is not a surface being thrown, it is a maraca,
 * and it plays for the whole run. A layer's character is its BAND, never its
 * envelope.
 */
const NOISE_LIFE_MS = GRAIN_MS * 5;
const NOISE_ATTACK_MS = GRAIN_MS;
const NOISE_HOLD_MS = GRAIN_MS * 3;

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

/** One noise layer over the surface's roar. `hz` is where it sits at a
 * crawl and `climb` how much of that speed adds on top; `q` pens it into a
 * band around there, and its ABSENCE lets it run on upward from `hz`
 * instead — which is the whole difference between a stone and a stem. A
 * chip flicked off a tread is a click with nothing under it, so gravel's
 * crunch is everything above its corner and it climbs hard with pace. Turf
 * has no top end to give: a torn stem and a flattened clod are a dull
 * mid-range tear that sounds the same at any speed, and penning it into a
 * band is what stops an off-road bed reading as a sheet of metal being
 * scoured. */
type Layer = {
  level: number;
  color: NoiseColor;
  hz: number;
  climb: number;
  q?: number;
};

/**
 * What a surface sounds like under a rolling tyre.
 *
 * `hz` is where the roar sits and `q` how narrow it is: asphalt is a dull
 * bass drumming felt through the body, gravel a broad low rush (a thousand
 * stones a second at no interval at all), water a bright hiss. `level` is
 * the bed's weight. Over the roar sit two optional layers, and which of
 * them a surface has is most of what tells them apart:
 *
 *   `body`  — a second, wider band filling the MIDDLE of the voice. A road
 *             surface does not need one: what it is made of is under the
 *             tread and it is all bottom end. A car ploughing turf does —
 *             the grass and moss going flat, the stems dragging along the
 *             underside — and without it the bed is a low boom and a
 *             bright hiss with a hole between them, which is exactly what
 *             sheet metal sounds like.
 *   `grain` — the individual pieces the tyres are actually moving, over the
 *             top of it. A sealed surface has neither.
 */
type SurfaceVoice = {
  color: NoiseColor;
  hz: number;
  q: number;
  /** The bed rolling STRAIGHT AHEAD at speed — the quiet half. */
  level: number;
  /** …and what it multiplies up to with the tyres at full lateral load. 1 is a
   * surface that sounds the same through a corner; 4 is one you only really
   * hear when you turn. It scales every layer with it, because the surface
   * only gets moved when something asks it to move. */
  corner: number;
  body?: Layer;
  grain?: Layer;
};

export const SURFACES: Record<string, SurfaceVoice> = {
  // Tarmac: a DULL BASS RUMBLE and nothing else. A sealed surface under a
  // tyre rolling straight ahead is the quietest a car ever is — there is
  // nothing being thrown and nothing being crushed, only the tread drumming
  // the body, which is felt more than heard and lives below everything else
  // in the mix. So: brown noise down where the engine's own bottom end is,
  // no crunch at all, and a level that leaves the straight to the engine.
  // What tarmac HAS is the corner — the singing tyre further down, which is
  // where all of this surface's drama is kept.
  asphalt: { color: "brown", hz: 125, q: 0.7, level: 0.0016, corner: 2.4 },
  // Graded gravel: the game's home surface. Broad and busy, but a RUSH rather
  // than a roar until the car turns — then it is the surface being thrown.
  // The bed has to say something by CHANGING, and a dirt road as busy pointed
  // straight as it is sideways says nothing for the whole run, so the cruise
  // is kept quiet and the corner carries the multiplier.
  //
  // AND IT IS THE THING THE PLAYER HEARS MOST, so it is mixed UNDER the
  // engine rather than over it: this is the surface a whole rally is driven
  // on, and a rush that has to be shouted over is one nobody can enjoy for
  // twenty minutes. Its band sits low too — a dirt road is a rumble with grit
  // on top, not a hiss.
  gravel: {
    color: "pink",
    hz: 250,
    q: 0.8,
    level: 0.0034,
    corner: 5.2,
    // The stones themselves: bright, and brighter still with speed, because
    // faster means more of them a second and each one hit harder.
    grain: { level: 0.0013, color: "white", hz: 1500, climb: 0.87 },
  },
  // Water: a hiss with weight behind it and no crunch at all. Barely cares
  // which way the car is pointing — a ford is loud because it is being ploughed
  // through, not because it is being cornered on.
  water: { color: "pink", hz: 900, q: 0.6, level: 0.024, corner: 1.3 },
  // OFF THE ROAD ENTIRELY — turf, moss, rutted forest floor. The one surface
  // in the game with no hard material anywhere in it, and the whole trick to
  // it is that its energy is spread across the MIDDLE instead of split
  // between a bottom and a top. Most of what a car ploughing a field makes
  // is the suspension working, so the roar is broad and low and stays loud on
  // the straight — being off the road should sound like a mistake. Over it,
  // the grass itself: a wide soft band of stems going flat and dragging along
  // the underside, and above that a dull tear rather than a crunch. Nothing
  // out here rings, nothing sizzles, and nothing is bright.
  nature: {
    color: "brown",
    hz: 150,
    q: 0.45,
    level: 0.0118,
    corner: 1.6,
    body: { level: 0.0082, color: "pink", hz: 560, climb: 0.22, q: 0.5 },
    grain: { level: 0.004, color: "pink", hz: 1150, climb: 0.18, q: 0.7 },
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
  // wet churn with no stones in it at all, and the corner is the surface
  // being thrown in lumps rather than sprayed in grains.
  gravel: {
    color: "pink",
    hz: 190,
    q: 0.75,
    level: 0.0078,
    corner: 3.4,
    grain: { level: 0.0002, color: "white", hz: 1500, climb: 0.87 },
  },
  // Wet tarmac: the one surface the rain makes BRIGHTER. A sealed road
  // holds a film of water the tread has to cut through, and that hiss is
  // the whole sound of a wet sealed stage — the dull bass drumming of the
  // dry road is still under it, but it is no longer the only thing there.
  asphalt: { color: "pink", hz: 1150, q: 0.6, level: 0.0084, corner: 1.9 },
  // Sodden turf: heavier and duller still, and squelching rather than
  // rough. Being off the road in the rain should sound like a worse
  // mistake than being off it in the dry. Every band moves DOWN — wet grass
  // does not rustle, it is dragged — and the tear over the top all but goes,
  // which leaves the middle carrying more of the voice than it does dry.
  nature: {
    color: "brown",
    hz: 130,
    q: 0.5,
    level: 0.014,
    corner: 1.4,
    body: { level: 0.01, color: "pink", hz: 430, climb: 0.22, q: 0.45 },
    grain: { level: 0.0022, color: "pink", hz: 780, climb: 0.18, q: 0.8 },
  },
  // Water is already water. Left identical on purpose, so a ford sounds
  // like a ford whatever the sky is doing.
  water: { color: "pink", hz: 900, q: 0.6, level: 0.024, corner: 1.3 },
};

/** The dry surface and its wet twin, mixed. `wet` is 0 on a clear stage,
 * about half in rain and 1 in a storm, so drizzle genuinely lands between
 * the two rather than flipping to mud at a threshold. The noise COLOUR
 * cannot be mixed, so it goes with whichever side is carrying more of the
 * sound — which is inaudible where they are level, because that is exactly
 * where the two spectra overlap most. */
function surfaceUnder(surface: string, wet: number): SurfaceVoice {
  const dry = SURFACES[surface] ?? (SURFACES.gravel as SurfaceVoice);
  const soaked = WET_SURFACES[surface];
  if (soaked === undefined || wet <= 0) return dry;
  const mix = (a: number, b: number): number => a + (b - a) * wet;
  return {
    color: wet > 0.5 ? soaked.color : dry.color,
    hz: mix(dry.hz, soaked.hz),
    q: mix(dry.q, soaked.q),
    level: mix(dry.level, soaked.level),
    corner: mix(dry.corner, soaked.corner),
    body: mixLayer(dry.body, soaked.body, wet),
    grain: mixLayer(dry.grain, soaked.grain, wet),
  };
}

/** One optional layer, mixed the same way. A side that HAS the layer where
 * the other does not is faded by its own weight rather than dropped: rain
 * does not delete the grass a car is ploughing through, it only changes
 * what the grass sounds like. */
function mixLayer(
  dry: Layer | undefined,
  soaked: Layer | undefined,
  wet: number,
): Layer | undefined {
  if (dry === undefined) return soaked && { ...soaked, level: soaked.level * wet };
  if (soaked === undefined) return { ...dry, level: dry.level * (1 - wet) };
  const mix = (a: number, b: number): number => a + (b - a) * wet;
  const near = wet > 0.5 ? soaked : dry;
  return {
    level: mix(dry.level, soaked.level),
    color: near.color,
    hz: mix(dry.hz, soaked.hz),
    climb: mix(dry.climb, soaked.climb),
    q: near.q,
  };
}

/** How loud the weather itself is, and where it sits. Two layers, because
 * rain heard from inside a moving car is two things: the SHEET of it in
 * the air all around, and the PATTER of the drops that are hitting the
 * car. Both lift with speed — a car standing still is rained on, a car at
 * 140 km/h is driving INTO the rain, and the difference is most of what
 * makes weather feel like part of the driving rather than a backdrop. */
const RAIN = { sheet: 0.0102, patter: 0.0067, pace: 0.55 };

/** How much of the rain's level the squall owns. Rain does not fall at one
 * rate: it comes in waves, and a sheet that holds a constant level for two
 * minutes is the same fault as a tyre bed that is as loud on the straight
 * as it is in the corner — the loudest thing in the mix, saying nothing. */
const SQUALL_SWING = 0.45;

/** THE WIND THAT IS NOT THE CAR'S. The air layer above is the car pushing
 * through still air and it is silent at a standstill; this is air that is
 * moving on its own, and it is most of what a storm sounds like when the
 * player lifts. Two layers, because a gale is a low roar with something
 * thin on top of it — the roar is the mass of air, the whistle is what it
 * is being dragged over. */
const GALE = { roar: 0.0125, whistle: 0.0044 };

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
  /** How wet the stage is, 0..1 — clear, rain, storm. It picks the surface
   * (see `WET_SURFACES`) and it is the weather's own voice. */
  wet: number;
  /** How hard it is coming down this instant, 0..1 — the squall breathing
   * around the stage's own rate. The ROAD does not dry out between gusts,
   * so this rides the sheet's level and never `wet`. */
  squall: number;
  /** How much wind there is in the air, 0..1 of a full gale — the weather's
   * other voice, and the only one a parked car can still hear. */
  gale: number;
};

/** Book one of a surface's optional layers. `weight` is what the driving has
 * already made of its level, and `roll` how fast the wheels are turning,
 * which is what moves its band.
 *
 * EVERY LAYER GETS THE FULL GRAIN, however bright or busy it is meant to
 * sound. A shorter one is up on its own between overlaps and its level
 * swings several dB at the cadence, which on a bright band is a maraca
 * playing for the whole run — see `NOISE_LIFE_MS`. A layer's character is
 * its BAND, never its envelope. */
function layer(synth: Synth, voice: Layer, at: number, weight: number, roll: number): void {
  const hz = voice.hz * (1 + voice.climb * roll);
  synth.noise({
    at,
    durationMs: NOISE_LIFE_MS,
    attackMs: NOISE_ATTACK_MS,
    holdMs: NOISE_HOLD_MS,
    color: voice.color,
    volume: voice.level * weight,
    filter:
      voice.q === undefined
        ? { type: "highpass", frequency: hz }
        : { type: "bandpass", frequency: hz, q: voice.q },
  });
}

/**
 * Book one grain of the road at absolute time `at`.
 *
 * Returns nothing: unlike the engine, none of these layers carries phase from
 * one grain to the next — noise has none to carry.
 */
export function playRoadGrain(synth: Synth, voice: RoadVoice, at: number): void {
  const { speed, air, surface, corner, slide, sideways, airborne, wet, squall, gale } = voice;

  // ── The air ────────────────────────────────────────────────────────────
  // Wind is the layer that actually sells pace: pitch says revs, noise says
  // SPEED. Squared, because the ear reads air noise as roughly its power and a
  // linear ramp leaves a fast car sounding like a slightly quicker slow one.
  // It is the one bed that keeps going in the air — louder there, in fact,
  // with nothing under the wheels to mask it.
  if (air > 0) {
    synth.noise({
      at,
      durationMs: NOISE_LIFE_MS,
      attackMs: NOISE_ATTACK_MS,
      holdMs: NOISE_HOLD_MS,
      color: "pink",
      volume: 0.023 * air * air * (airborne ? 1.35 : 1),
      filter: { type: "highpass", frequency: 400 + 1500 * air },
    });
  }

  // ── The weather ────────────────────────────────────────────────────────
  // Rain is the one bed that has nothing to do with the car: it plays over
  // a stationary one, it plays over a car in the air, and it does not stop
  // when the tyres do. Only its urgency is the driver's — the faster the
  // car goes the harder it is being rained ON.
  if (wet > 0) {
    const drive = (1 + RAIN.pace * air) * (1 - SQUALL_SWING + 2 * SQUALL_SWING * squall);
    // The sheet: everything falling everywhere, up above the tyres where
    // nothing else in the mix lives.
    synth.noise({
      at,
      durationMs: NOISE_LIFE_MS,
      attackMs: NOISE_ATTACK_MS,
      holdMs: NOISE_HOLD_MS,
      color: "pink",
      volume: RAIN.sheet * wet * drive,
      filter: { type: "highpass", frequency: 2600 },
    });
    // …and the drops that are actually hitting the car, which is the layer
    // that puts the player INSIDE it rather than under it. Shorter and
    // narrower: a body panel being struck has a pitch, where the sky does
    // not.
    synth.noise({
      at,
      durationMs: NOISE_LIFE_MS,
      attackMs: NOISE_ATTACK_MS,
      holdMs: NOISE_HOLD_MS,
      color: "brown",
      volume: RAIN.patter * wet * drive,
      filter: { type: "bandpass", frequency: 620 + 260 * air, q: 1.1 },
    });
  }

  // ── The gale ───────────────────────────────────────────────────────────
  // Wind the car is not making. Squared, like the car's own air layer,
  // because the ear reads air noise as roughly its power — and it plays
  // through every early return below for the same reason the rain does: a
  // storm does not stop while the car is in the air, and it is the one
  // thing still audible when the player has stopped altogether.
  if (gale > 0) {
    synth.noise({
      at,
      durationMs: NOISE_LIFE_MS,
      attackMs: NOISE_ATTACK_MS,
      holdMs: NOISE_HOLD_MS,
      color: "brown",
      volume: GALE.roar * gale * gale,
      filter: { type: "lowpass", frequency: 300 + 500 * gale, q: 1.3 },
    });
    // The thin edge on top: only a real blow has it, so it comes in on the
    // fourth power rather than the second.
    synth.noise({
      at,
      durationMs: NOISE_LIFE_MS,
      attackMs: NOISE_ATTACK_MS,
      holdMs: NOISE_HOLD_MS,
      color: "pink",
      volume: GALE.whistle * Math.pow(gale, 4),
      filter: { type: "bandpass", frequency: 1150 + 700 * gale, q: 2.4 },
    });
  }

  // Airborne, the only things left are the engine (free-revving, which the
  // load model handles), the wind and the weather. The silence where the tyres were is what
  // a jump sounds like, and it is worth more than any effect that could be put
  // in its place.
  if (airborne || speed < ROLL_FLOOR) return;

  // ── The tyres ──────────────────────────────────────────────────────────
  const road = surfaceUnder(surface, wet);
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
  // The middle of the voice: the surface being pushed around rather than the
  // pieces of it moving.
  if (road.body !== undefined) layer(synth, road.body, at, lean * (0.25 + 0.75 * roll), roll);
  // …and over the top of both, the individual pieces the tyres are throwing
  // or tearing.
  if (road.grain !== undefined) layer(synth, road.grain, at, lean * roll, roll);

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
    // A WET TYRE DOES NOT SING. The squeal is rubber gripping and letting
    // go against the road several hundred times a second, and a film of
    // water is exactly the thing that stops it happening — what a sealed
    // road gives in the rain is the hiss already in its wet voice above.
    const scrub =
      Math.max(slip, Math.max(0, (corner - SING_FLOOR) / (1 - SING_FLOOR))) *
      roll *
      (1 - 0.6 * wet);
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
      bed: true,
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
    volume: 0.038 * scrub,
    filter: { type: "bandpass", frequency: 520 + 680 * scrub, to: 1250 + 1050 * scrub, q: 0.7 },
  });
  synth.noise({
    at,
    durationMs: NOISE_LIFE_MS,
    attackMs: NOISE_ATTACK_MS,
    holdMs: NOISE_HOLD_MS,
    volume: 0.014 * scrub,
    filter: { type: "highpass", frequency: 2150 + 1250 * scrub },
    // Thrown to the outside of the slide, so a drift is a drift the player can
    // hear the direction of with the camera behind the car.
    pan: Math.max(-0.6, Math.min(0.6, -sideways / 12)),
  });
}
