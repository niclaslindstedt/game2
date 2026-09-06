// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HIGH TRAFFIC — the airliners crossing the wilderness kilometres above the
// stage, and the contrails they leave hanging there afterwards.
//
// The point of this is not the aeroplanes. It is that the sky over a rally
// stage is a LIVED-IN place: somebody was up there ten minutes before the
// car arrived, and the white scratch they left is still spreading. A stage
// that opens on an empty sky and produces one lonely speck a minute later
// reads as a stage with a prop in it; a stage that opens on three old
// trails at different stages of coming apart reads as a stage under a
// flight path. So the sky is dressed BEFORE the lights go out (`open`) and
// only then kept topped up (`step`).
//
// Everything here is renderer-side presentation with no opinion about the
// simulation, so its randomness is its own — `rng` is a parameter purely so
// the tests can pin it, never because the sim reads any of this.
//
// DOM-free and three-free on purpose: how often a crossing comes over and
// how a contrail ages are decisions, and decisions are testable. What those
// decisions LOOK like is ambient-life.ts's half.

/** How high the lanes run, m above the stage, and how far up its own track
 * a crossing enters and leaves — with how far off to the side its line may
 * pass the camera.
 *
 * These four are one decision, because what they set between them is the
 * ELEVATION a trail is seen at, and that is the whole difference between
 * this being in the game and not. A driver looks along a road: the sky in
 * the windscreen is a band from the skyline up to about thirty degrees, and
 * traffic parked above that band is traffic nobody ever sees. So a chord
 * passes overhead at forty degrees or so and comes down through the band at
 * both ends, which is also what makes it read as CROSSING rather than as a
 * mark on the sky.
 *
 * The ends run out past the ridge rings, and that is wanted rather than
 * tolerated: a trail that ends inside the sky is a mark on it, and one that
 * runs to the horizon has come from somewhere.
 *
 * Over the EYE, not over the sea: the whole crossing is camera-relative,
 * height included, so a road up a mountain still looks up at it.
 *
 * The lanes are as high as the camera's far plane lets them be (the chord's
 * ends already run out past it, which the tip taper hides), and the rest of
 * "very high" is carried by two things that are not height at all: the
 * SIZE of the airframe, which is a speck (ambient-life.ts), and the SPEED
 * below, because what the eye reads altitude off is how slowly a thing
 * crosses the sky. */
export const LANE = { low: 330, high: 480 };
const REACH = 860;
const OFFSET = 340;

/** Ground speed, m/s. Nothing like an airliner's, and it should not be: a
 * real one crosses the visible sky in a couple of seconds at this scale and
 * reads as a bug on the lens. This is the speed at which a speck overhead
 * is clearly GOING somewhere and still takes half a minute to do it —
 * slower than the eye expects of something a few hundred metres up, which
 * is exactly what makes it read as ten kilometres up. */
const SPEED = [40, 52] as const;

/** Seconds between one crossing entering the sky and the next.
 *
 * Set against a two-minute stage AND against the fact that a driver sees
 * about a quarter of the sky at a time: six or so aircraft come over during
 * a race, a crossing outlasts a gap so there are usually two of them up at
 * once, and with the trails that outlive them there are eight or nine marks
 * on the whole sky — which is what puts one or two of them in the
 * windscreen at any moment rather than one every other race. */
const GAP = [13, 26] as const;

/** How old the trails already hanging there are when a stage loads, s. The
 * first is still inside its own crossing, so the establishing shot has an
 * aeroplane in it; the rest are up to two minutes gone, which is the
 * difference between a sharp white line and a smeared grey one — and the
 * reason to lay four at spread ages rather than one of each. */
const OPEN_AGES = [12, 40, 76, 116] as const;

/** How a contrail ages, s and m.
 *
 * `life` is the whole point of the module — a contrail is not exhaust, it
 * is ICE, and ice sits there. Three minutes is short for the real thing and
 * long enough here that a stage accumulates its own traffic history rather
 * than clearing itself between crossings.
 *
 * `widen` is the other half. A trail that only fades reads as a fading
 * line; a trail that also SPREADS reads as weather, which is what an old
 * contrail becomes. */
export const PUFF = {
  /** How far apart the puffs are laid along the track, m. Under `born`, so
   * a fresh trail is a continuous line and never a string of beads. */
  step: 2.5,
  life: 156,
  /** How long a puff takes to appear. Short: the ice forms a wingspan or
   * two behind the engines, and a trail that fades in over a hundred metres
   * has the aeroplane flying well ahead of its own wake. */
  rise: 0.5,
  /** How long the fade-out takes, counted back from the end of `life`. */
  fall: 92,
  /**
   * Width when it is laid, and what it spreads to, m.
   *
   * A contrail is a SCRATCH: it reads as one because it is hair-thin
   * against an enormous sky, and the eye takes its distance from that
   * thinness. Laid tens of metres wide it stops being a line and becomes a
   * soft wedge with a bright end — a light shaft, or a comet — and the sky
   * looks like it has a lens problem rather than an aeroplane in it. Three
   * metres four hundred up is a few pixels at the zenith and one or two at
   * the horizon, which is what a fresh trail is in a photograph; the eight
   * times it spreads to is the broad pale band the same trail is a couple
   * of minutes later, and `puffFade` thins each puff by that spread to the
   * power one and a half: once because the ice in it is being shared out,
   * not made, and half as much again because a puff six times as wide
   * overlaps more of its neighbours on every pixel (`trailRead` says how
   * many). Thinned in proportion only, the old band composited solid
   * white and outshone the fresh line; by the square it was a ghost.
   */
  born: 4,
  spread: 24,
  /** …over this long. */
  widen: 110,
  /** How solid one puff is at the tail, 0..1 — the material's opacity.
   * Near enough white: a fresh contrail is the brightest thing in a blue
   * sky, and everything older is `puffFade` taking it down from here. */
  alpha: 0.85,
  /** A twin-engined airliner lays TWO trails, one behind each engine, this
   * far apart, m. Fresh they are two hair-lines side by side; once each has
   * spread past this they are one band, which is the whole way a contrail
   * tells you it is a machine and not a scratch on the sky. */
  cores: 5.5,
} as const;

/** How an old trail COMES APART. It stays STRAIGHT — a contrail is a ruled
 * line across the sky to the end of its life, and one that wanders reads
 * as a stream of smoke, not as ice — but its brightness breaks up into
 * lumps as it spreads, on the same `widen` clock. `lump` is how much of
 * the brightness the thin stretches of a fully aged trail have lost, 0..1;
 * `along` is the wavelength the lumps are cut on, m down the chord — long
 * enough that at four hundred metres they are variation and not beads. */
export const AGEING = {
  lump: 0.4,
  along: 140,
} as const;

/** How much of the wind a contrail takes. A fraction, and a small one: the
 * air up there is not the air the dust is blowing around in, and a trail
 * that translates bodily across the sky at ground wind speed ends the
 * minute over the horizon. The spreading is what carries the age. */
export const DRIFT = 0.12;

/** One aircraft's whole crossing: a straight chord over the stage, held in
 * camera-relative metres because the sky has no parallax (clouds.ts rides
 * the camera for the same reason, and a contrail is further away than any
 * of them). */
export type Crossing = {
  /** Unit heading across the ground. */
  dirX: number;
  dirZ: number;
  /** Altitude over the CAMERA, m — like `fromX`/`fromZ`, camera-relative,
   * so a road up a mountain looks up at the traffic the way a road in a
   * valley does. */
  y: number;
  /** Ground speed, m/s. */
  speed: number;
  /** Where it came into the sky, relative to the camera. */
  fromX: number;
  fromZ: number;
  /** How long it stays up, s. */
  span: number;
  /** How long ago it entered, s — the only field that moves. A crossing
   * handed out by `open` starts with this already run on, which is what
   * lets one code path lay both a live trail and an old one. */
  age: number;
  /** Where along its lump pattern this trail starts, rad — so no two old
   * trails break up the same way. */
  wave: number;
};

export type SkyTraffic = {
  /** The traffic already up there when the stage loads. */
  open: () => Crossing[];
  /** Advance the sky's clock. Returns a crossing on the frame one enters,
   * and null on every other — a gap is many seconds and a frame is
   * milliseconds, so this allocates almost never. */
  step: (dt: number) => Crossing | null;
};

/** How much of the chord each END of a trail fades over, as a fraction of
 * its length. A contrail that simply STOPS in mid-sky reads as a mark on
 * the lens rather than as something a long way off, because the one thing
 * every distant object does is lose its edges first. The near end of a live
 * one is nowhere near this: the aeroplane is somewhere in the middle of its
 * own chord, and only starts thinning as it leaves the sky. */
const TIP = 0.16;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Smoothstep, so a tip goes out on a curve rather than on a corner. */
const ease = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/** How solid the trail is this far along its own chord, 0..1. */
export function tipFade(along: number): number {
  return ease(along / TIP) * ease((1 - along) / TIP);
}

/** How far along the spreading an age is, 0..1, eased out: a trail does
 * most of its spreading in the first half-minute behind the aircraft and
 * then only creeps, which is what separates the hard line near the tail
 * from the smear at the far end of the same trail. */
function spreading(age: number): number {
  const t = clamp01(age / PUFF.widen);
  return 1 - (1 - t) * (1 - t);
}

/** How wide a puff of contrail is at this age, m. */
export function puffWidth(age: number): number {
  return PUFF.born + (PUFF.spread - PUFF.born) * spreading(age);
}

/** …and how much of ONE PUFF is left to see, 0..1: in over `rise`, out
 * over the last `fall` seconds, and between the two DILUTED by the spread
 * squared (see `PUFF.spread`) — the ice that made a three-metre line is
 * the same ice smeared over twenty-four, so an old trail is a broad faint
 * band and never a broad bright one. `trailRead` is what the band this
 * puff is part of adds up to on screen. */
export function puffFade(age: number): number {
  if (age < 0 || age > PUFF.life) return 0;
  const dilute = Math.pow(PUFF.born / puffWidth(age), 1.5);
  return Math.min(1, age / PUFF.rise) * clamp01((PUFF.life - age) / PUFF.fall) * dilute;
}

/** How much of a puff's box its sprite actually fills, on average — the
 * mask is a soft disc (`contrailTexture`), so a pixel under the middle of
 * the band sees about half of each overlapping puff's peak. */
const SPRITE_FILL = 0.5;

/** What a trail of this age READS as on screen, 0..1: its puffs composited
 * over one another — as many as overlap one pixel across the band, both
 * cores — each at `puffFade` of the material's `alpha`. This is the number
 * the eye sees, where `puffFade` is only what one sprite is handed; the
 * tests judge the trail on this one. */
export function trailRead(age: number): number {
  const stacked = ((2 * puffWidth(age)) / PUFF.step) * SPRITE_FILL;
  return 1 - Math.pow(1 - PUFF.alpha * puffFade(age), stacked);
}

/** How much of the brightness the lumps have taken at this age, 0..1,
 * before `trailLump` says where along the trail. */
export function puffLump(age: number): number {
  return AGEING.lump * spreading(age);
}

/** How much of the brightness is missing at `along` metres down the chord
 * of a trail that started its pattern at `wave`, 0..1 (times `puffLump`).
 * A wave rather than noise, because the puffs are laid two and a half
 * metres apart and noise at that pitch is a speckled line. */
export function trailLump(along: number, wave: number): number {
  return 0.5 + 0.5 * Math.sin((along / AGEING.along) * Math.PI * 2 + wave);
}

export function createSkyTraffic(rng: () => number = Math.random): SkyTraffic {
  const between = (lo: number, hi: number): number => lo + rng() * (hi - lo);

  /** A crossing on a random bearing, entering `REACH` back down its own
   * track and passing somewhere within `OFFSET` of the camera. The stage
   * itself is never consulted: at this altitude the road below is a detail
   * of the ground, and a flight path has no interest in it. */
  const cross = (age: number): Crossing => {
    const heading = rng() * Math.PI * 2;
    const dirX = Math.sin(heading);
    const dirZ = Math.cos(heading);
    const across = between(-OFFSET, OFFSET);
    const speed = between(SPEED[0], SPEED[1]);
    return {
      dirX,
      dirZ,
      y: between(LANE.low, LANE.high),
      speed,
      // Off to one side of the camera means off the LINE, so the offset is
      // taken across the heading rather than along either axis.
      fromX: -dirX * REACH - dirZ * across,
      fromZ: -dirZ * REACH + dirX * across,
      span: (REACH * 2) / speed,
      age,
      wave: rng() * Math.PI * 2,
    };
  };

  let next = between(GAP[0], GAP[1]);

  return {
    open: () => OPEN_AGES.map((age) => cross(age * between(0.75, 1.25))),
    step: (dt) => {
      next -= dt;
      if (next > 0) return null;
      next = between(GAP[0], GAP[1]);
      return cross(0);
    },
  };
}
