// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NIGHT SKY ITSELF — the stars, and the galaxy they are a near corner
// of. Nothing here owns a mesh or a frame: it is where the sphere of fixed
// stars has TURNED to this hour, where the Milky Way lies across it, and
// the arithmetic both skies paint that band with.
//
// Three ideas, and the whole module is them:
//
//   THE TURN     The stars are on a sphere that wheels once a day about a
//                pole standing at the country's own latitude (R40, the same
//                number `daylight.ts` puts the sun's arc on). The hour
//                spins it and the SEASON offsets it, so a winter midnight
//                and a summer one look out at different parts of the sky —
//                which is the only reason the same stage at the same clock
//                hour is a different night in December.
//   THE GALAXY   A great circle tilted 63° to that pole, at the real
//                inclination, so the band rises steeply out of one horizon
//                instead of lying round the rim like a ring. Its core is a
//                bulge, its arms are mottled, and the Great Rift is a dark
//                lane of dust down the middle of the brightest part.
//   THE WASH     Nothing here is ever seen against a black page. What takes
//                the faint sky away is the air at the horizon, the moon's
//                own glare, and the cloud in front — the first two are this
//                module's, the third is the cloud sheets drawing OVER it.
//
// Both skies read this file. The shader dome takes the GLSL below and
// evaluates the band per pixel; the simple sky takes the CPU twins and
// bakes them into a ring of points and one additive band. They are the same
// arithmetic on the same noise (`cloudFbm` has a twin on each side), which
// is what keeps the LOW setting a cheaper picture of the sky rather than a
// different sky.

import * as THREE from "three";
import type { BiomeId, Season } from "@engine";
import { biomeRules } from "@engine";

import { SOUTH } from "./daylight.ts";
import { cloudFbm, cloudHash } from "./cloud-field.ts";
import { sunDir } from "./sky.ts";

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/** How deep the galaxy's mottle and its dust are read. Three octaves: the
 * band is a broad soft thing and a fourth octave of it is film grain, which
 * at this brightness is indistinguishable from the stars in front of it. */
export const GALAXY_OCTAVES = 3;

/** Where the sphere of fixed stars stands: the pole it turns about, and how
 * far round it has come. */
export type SkyTurn = {
  /** The celestial pole's elevation, radians — the country's latitude. */
  pole: number;
  /** …and the heading it stands at: due north, in the engine's convention. */
  bearing: number;
  /** How far the sphere has turned about that pole, radians. */
  spin: number;
};

/** Where in the year each season's nights are, as a fraction of the way
 * round the sun — the same mid-season dates `DECLINATION` is written for
 * (daylight.ts). It is what makes the sky at midnight a different sky in
 * June and December, and the offset is a whole turn a year, so a quarter of
 * the year is a quarter of the sky. */
const SIDEREAL: Record<Season, number> = {
  spring: 135 / 365,
  summer: 172 / 365,
  autumn: 268 / 365,
  winter: 355 / 365,
};

/** Where the sphere of stars has turned to at `hour`, this season, over
 * this country. */
export function skyTurnAt(hour: number, season: Season, biome: BiomeId): SkyTurn {
  return {
    pole: biomeRules(biome).latitude * DEG,
    bearing: SOUTH + Math.PI,
    spin: -TAU * (hour / 24 + SIDEREAL[season]),
  };
}

/** The turn's three axes, as WORLD directions: the two spanning the equator
 * with the spin already in them, and the pole. A celestial direction times
 * these is the world one. */
function turnAxes(turn: SkyTurn): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const pole = sunDir(turn.pole, turn.bearing);
  // Any two axes across the pole will do — the spin is measured from
  // whichever one is picked, and nothing outside this file knows which.
  const seed = Math.abs(pole.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3().crossVectors(seed, pole).normalize();
  const b = new THREE.Vector3().crossVectors(pole, a);
  const c = Math.cos(turn.spin);
  const s = Math.sin(turn.spin);
  return [
    a.clone().multiplyScalar(c).addScaledVector(b, s),
    b.clone().multiplyScalar(c).addScaledVector(a, -s),
    pole,
  ];
}

/** The turn as a change of basis: multiply a WORLD direction by this and out
 * comes the same direction in celestial coordinates. What the shader dome
 * carries as a uniform, so that every pixel's ray can be asked where on the
 * sphere it is looking. */
export function turnBasis(turn: SkyTurn): THREE.Matrix3 {
  const [e1, e2, pole] = turnAxes(turn);
  // Rows, so the product takes world into celestial rather than the other
  // way about (`Matrix3.set` reads its arguments row by row).
  return new THREE.Matrix3().set(e1.x, e1.y, e1.z, e2.x, e2.y, e2.z, pole.x, pole.y, pole.z);
}

/** …and the same turn the other way round, as a rotation for an object
 * whose vertices are ALREADY in celestial coordinates. What the simple sky
 * hangs its baked field and band on. */
export function turnRotation(turn: SkyTurn): THREE.Matrix4 {
  const [e1, e2, pole] = turnAxes(turn);
  // Columns this time: the transpose of the basis above, which for a
  // rotation is its inverse.
  return new THREE.Matrix4().set(
    e1.x,
    e2.x,
    pole.x,
    0,
    e1.y,
    e2.y,
    pole.y,
    0,
    e1.z,
    e2.z,
    pole.z,
    0,
    0,
    0,
    0,
    1,
  );
}

/** THE GALACTIC FRAME, in celestial coordinates, at the real angles: the
 * north galactic pole stands 63° off the celestial one (declination +27°),
 * the centre lies 90° from it in the band, and the third axis closes the
 * set. Written out rather than derived so the shader can have them as
 * literals and the CPU the same numbers.
 *
 * These are what tilt the band. A Milky Way laid on the celestial equator
 * would circle the sky parallel to the horizon and read as a seam in the
 * dome; at 63° it comes up out of the north-east, crosses overhead and goes
 * down in the south-west, which is what a real one does and what makes a
 * night sky look like a photograph of one. */
const GAL_POLE = [-0.86767, -0.19807, 0.45598] as const;
const GAL_CENTRE = [-0.054878, -0.873439, -0.483831] as const;
const GAL_SIDE = [0.494103, -0.444829, 0.746987] as const;

/** The same three, for anything laying geometry out in GALACTIC coordinates
 * and needing it back in celestial ones — which is the simple sky cutting
 * its band (night-sky.ts). Multiply a galactic (along, across, up) by these
 * and add. */
export const GALACTIC_FRAME = {
  along: GAL_CENTRE,
  across: GAL_SIDE,
  up: GAL_POLE,
} as const;

/** A vector as a GLSL literal. Six places, which is what the galactic
 * frame's axes need to still be orthonormal on the other side. */
const vec3 = (v: readonly number[]): string => `vec3( ${v.map((n) => n.toFixed(6)).join(", ")} )`;

/** What the band is coloured. The arms are the cold blue-white of a
 * hundred thousand faint stars smeared together; the core, seen through the
 * whole thickness of the disc's dust, is reddened to a dim amber. Fixed
 * rather than authored per rung: the galaxy is not lit by anything this
 * game has, so all the sky may do to it is take it away. */
const GALAXY_ARM = 0x8fa4d8;
const GALAXY_CORE = 0xd8b487;

/** How wide the bright part of the band is, in sines of galactic latitude —
 * a tight core with a broad faint halo either side of it, because that is
 * the shape of a disc seen edge-on from inside it. */
const BAND_TIGHT = 22;
const BAND_BROAD = 5.5;

/** HOW MUCH BAND THERE IS AT ALL, over the top of everything below. The one
 * number to move when the Milky Way is too much or not enough, and it is
 * bounded on both sides: under it the band stops being visible against the
 * dark sky's own zenith at all, and over it, it stops reading as a glow
 * behind the stars and starts reading as a light source parked behind the
 * hills. `make sky`'s night columns are how it was set and the only way to
 * move it. */
const BAND_GAIN = 0.78;

/** How far toward the centre the BULGE reaches, and how much it adds. Broad
 * and gentle: a tight peak here reads as a searchlight parked behind the
 * hills, which is the one thing the core must never look like. */
const BULGE_REACH = 4;
const BULGE_LIFT = 0.55;

/** How far the DARK LANE is off the middle of the band and how tight it is
 * — the Great Rift, the dust in our own arm cutting the light of everything
 * behind it. Only bites where the band is bright, which is why it reads as
 * a rift rather than as a stripe painted over the sky. */
const RIFT_OFF = 0.02;
const RIFT_TIGHT = 26;

/** The SMUDGES: the other galaxies, each a faint oval a couple of degrees
 * across at a fixed place on the sphere. Three of them — a big spiral well
 * off the band, and the two ragged companions low on the other side. They
 * are the whole of the "and galaxies" this sky claims: at a naked eye's
 * resolution that is honestly all any of them is.
 *
 * Each is a direction in celestial coordinates, the angular radius of its
 * long axis in radians, how much it is squashed across, and how bright. */
const SMUDGES: readonly { at: readonly number[]; size: number; squash: number; lit: number }[] = [
  { at: [0.562047, 0.415809, 0.714987], size: 0.055, squash: 0.42, lit: 0.55 },
  { at: [0.218878, -0.310569, -0.925008], size: 0.075, squash: 0.78, lit: 0.4 },
  { at: [0.356219, -0.127607, -0.925648], size: 0.045, squash: 0.85, lit: 0.28 },
];

/** THE NIGHT SKY AS GLSL — the stars, the band and the smudges, added to a
 * sky colour that has already been painted. Emitted rather than written out
 * because the frame it lands in has to compile the noise it reads at a
 * literal depth (`cloudNoiseGlsl` owns why), and because the caller decides
 * whether it is emitted at all.
 *
 * `cloudFbm${GALAXY_OCTAVES}` and `cloudHash` are the caller's to provide —
 * every sky that draws clouds already has both.
 *
 * The one function it leaves behind takes the ray in CELESTIAL coordinates
 * and its world elevation, and returns what to add. It is guarded on the
 * strengths by its caller: by day both are zero and none of it is
 * evaluated. */
export function starfieldGlsl(): string {
  return /* glsl */ `
const vec3 GAL_POLE = ${vec3(GAL_POLE)};
const vec3 GAL_CENTRE = ${vec3(GAL_CENTRE)};
const vec3 GAL_SIDE = ${vec3(GAL_SIDE)};

// The colour of one star, from a spectral class rolled 0..1: blue-white
// through white to amber. The roll reaching this is already skewed warm,
// which is the sky's own census — the eye's brightest stars are a mixed
// bag but its faint ones are overwhelmingly small and orange.
vec3 starTone( float t ) {
  vec3 hot = vec3( 0.70, 0.80, 1.00 );
  vec3 mid = vec3( 1.00, 0.98, 0.94 );
  vec3 warm = vec3( 1.00, 0.78, 0.58 );
  return t < 0.5 ? mix( hot, mid, t * 2.0 ) : mix( mid, warm, ( t - 0.5 ) * 2.0 );
}

// ONE SHELL OF STARS: the sky quantised into cells, one star to a cell
// that rolls high enough, jittered off the cell's middle so the field is a
// field and not a lattice.
//
// The pixel argument is how many radians a screen pixel is worth (the
// caller measures it), and it is what a star is SIZED by. A star drawn at an angular size
// is the one thing here that cannot be authored: at a contact sheet's 400
// pixels it comes out under a pixel across and vanishes, and at 1080p the
// same number is a five pixel blob. Sized in pixels instead, the grid is
// left doing the one job it is good at — deciding how MANY stars there
// are — and every screen gets the same sky.
vec3 starShell( vec3 sky, float cells, float thresh, float pixel, float time, float scint ) {
  vec3 sd = sky * cells;
  vec3 cell = floor( sd );
  float h = cloudHash( vec2( cell.x + cell.z * 57.0, cell.y + cell.z * 13.0 ) );
  if ( h < thresh ) return vec3( 0.0 );
  float rank = ( h - thresh ) / max( 1.0 - thresh, 1e-4 );
  float g = cloudHash( vec2( cell.z + h * 311.0, cell.x - cell.y * 7.0 ) );
  // Where in its cell, and how bright. The magnitude is a steep power of
  // the rank, so a cell that only just qualifies is a speck and the rare
  // one at the top of the roll is a proper star.
  vec3 jitter = vec3( fract( g * 13.0 ), fract( g * 71.0 ), fract( g * 191.0 ) );
  float mag = pow( rank, 2.1 );
  float d = length( fract( sd ) - mix( vec3( 0.28 ), vec3( 0.72 ), jitter ) );
  // A pixel and a bit for the faintest, two and a half for the brightest,
  // in cells — and never past a cell's own half, which is where a star
  // would start being cut off by the grid that placed it.
  float radius = min( pixel * cells * ( 1.15 + 1.35 * mag ), 0.42 );
  float disc = smoothstep( radius, 0.0, d );
  if ( disc <= 0.0 ) return vec3( 0.0 );
  // SCINTILLATION: air, not the star. Each has its own rate and phase, and
  // the amplitude is the caller's — it grows toward the horizon, where the
  // line of sight runs the long way through the atmosphere.
  float rate = 2.0 + fract( h * 53.0 ) * 6.0;
  float twinkle = 1.0 + scint * sin( time * rate + g * 40.0 );
  // The floor is high on purpose. A star is a point light against a nearly
  // black sky and the eye finds it however faint it is; a star drawn as a
  // fraction of a pixel at a fraction of the sky's own brightness is not a
  // faint star, it is no star.
  return starTone( pow( fract( g * 29.0 ), 0.7 ) ) * disc * ( 0.55 + 1.15 * mag ) * twinkle;
}

// THE BAND. The argument is the ray in celestial coordinates; the return
// is how much galaxy is behind this pixel and what colour it is.
vec3 milkyWay( vec3 sky ) {
  float lat = dot( sky, GAL_POLE );
  float along = dot( sky, GAL_CENTRE );
  float across = dot( sky, GAL_SIDE );
  float lon = atan( across, along );
  // A disc seen edge-on: a tight bright ridge inside a broad faint halo.
  float band = 0.72 * exp( - lat * lat * ${BAND_TIGHT.toFixed(1)} )
             + 0.28 * exp( - lat * lat * ${BAND_BROAD.toFixed(1)} );
  if ( band <= 0.004 ) return vec3( 0.0 );
  // THE BULGE toward the centre, and the arms falling away behind us.
  float bulge = pow( max( along, 0.0 ), ${BULGE_REACH.toFixed(1)} );
  band *= 0.42 + 0.58 * pow( max( along * 0.5 + 0.5, 0.0 ), 1.6 ) + ${BULGE_LIFT.toFixed(2)} * bulge;
  // The mottle, read along the band rather than across it, so the clumps
  // are drawn out the way star clouds are.
  vec2 uv = vec2( lon * 2.4, lat * 6.5 );
  float clumps = cloudFbm${GALAXY_OCTAVES}( uv * 1.9 + vec2( 4.7, 1.3 ) );
  float dust = cloudFbm${GALAXY_OCTAVES}( uv * 1.05 + vec2( 31.0, 7.0 ) );
  band *= 0.42 + 1.05 * clumps;
  // THE GREAT RIFT: dust in our own arm, a dark lane wandering down the
  // brightest part of the band and nowhere else.
  float off = lat - ${RIFT_OFF.toFixed(3)} * ( 1.0 + 2.0 * dust );
  float lane = exp( - off * off * ${(RIFT_TIGHT * RIFT_TIGHT).toFixed(1)} );
  band *= 1.0 - 0.62 * lane * smoothstep( 0.0, 0.55, bulge + 0.25 );
  vec3 tone = mix( ${vec3(new THREE.Color(GALAXY_ARM).toArray())},
                   ${vec3(new THREE.Color(GALAXY_CORE).toArray())},
                   clamp( bulge * 0.9 + 0.1 * clumps, 0.0, 1.0 ) );
  return tone * band * ${BAND_GAIN.toFixed(2)};
}

vec3 smudge( vec3 sky, vec3 at, float size, float squash, float lit ) {
  float along = dot( sky, at );
  if ( along < 0.9 ) return vec3( 0.0 );
  // The offset from its middle, split into the oval's two axes.
  vec3 off = sky - at * along;
  vec3 major = normalize( cross( at, GAL_POLE ) );
  float u = dot( off, major );
  float v = length( off - major * u );
  float r = length( vec2( u, v / max( squash, 0.05 ) ) ) / size;
  // A core inside a halo, the way every one of them looks: bright middle,
  // long faint skirt.
  float glow = 0.55 * exp( - r * r * 2.2 ) + 0.45 * exp( - r * r * 0.35 );
  return vec3( 0.78, 0.80, 0.92 ) * glow * lit;
}

// The other galaxies: ovals, and small enough that the whole of each is
// two hashes' worth of light.
vec3 smudges( vec3 sky ) {
  vec3 sum = vec3( 0.0 );
${SMUDGES.map(
  (s) =>
    `  sum += smudge( sky, ${vec3(s.at)}, ${s.size.toFixed(3)}, ${s.squash.toFixed(2)}, ${s.lit.toFixed(2)} );`,
).join("\n")}
  return sum;
}

// EVERYTHING ABOVE, over one ray: the ray in celestial coordinates, its
// world elevation, how close it is to the moon (1 at the disc, 0 away from
// it), and the two strengths, which are the preset's own.
vec3 nightSky( vec3 sky, vec3 ray, float up, float glare, float stars, float galaxy, float time ) {
  // HOW BIG A PIXEL IS, in radians — measured off the view ray rather than
  // assumed, so the field is the same field on a phone, on a desktop and on
  // a contact sheet. Taken here, where the flow is still uniform: the
  // branch above is on a uniform and the ones below are not, and a
  // derivative asked for inside those is undefined.
  float pixel = max( length( fwidth( ray ) ), 1e-5 );
  // EXTINCTION: five airmasses at the rim take most of a star and all of a
  // galaxy, and under the horizon there is nothing to see through at all.
  float air = smoothstep( - 0.005, 0.10, up );
  air *= 0.42 + 0.58 * smoothstep( 0.03, 0.42, up );
  if ( air <= 0.0 ) return vec3( 0.0 );
  // The moon's own sky glow: a wash round the key that the faint sky
  // simply does not survive, and the reason a full moon is worth driving
  // under at all — it takes the galaxy and leaves the bright stars.
  float wash = 1.0 - 0.85 * glare;
  float scint = 0.14 + 0.55 * pow( 1.0 - min( up, 1.0 ), 7.0 );
  vec3 col = vec3( 0.0 );
  if ( galaxy > 0.0 ) {
    col += ( milkyWay( sky ) + smudges( sky ) ) * galaxy * air * wash * wash;
  }
  if ( stars > 0.0 ) {
    // Two shells: the naked eye's few hundred bright stars on a coarse
    // grid, and the thousands of faint ones on a fine one. The faint shell
    // is the one the band thickens — a Milky Way IS its unresolved stars,
    // so the drift of pinpricks and the glow behind them are the same
    // object seen at two resolutions.
    float lat = dot( sky, GAL_POLE );
    float crowd = exp( - lat * lat * 9.0 );
    // The counts these two thresholds buy, over the whole sphere: about
    // four hundred and fifty on the coarse grid and six thousand on the
    // fine one — a naked eye's census of a dark sky, split
    // the way the eye splits it into the stars it names and the ones it
    // only registers as a crowd.
    col += starShell( sky, 70.0, 0.9925, pixel, time, scint ) * stars * air;
    col += starShell( sky, 150.0, 0.9790 - 0.0120 * crowd, pixel, time, scint )
         * stars * air * wash * ( 0.50 + 0.30 * crowd );
  }
  return col;
}
`;
}

// ── The same sky, on the CPU, for the simple one to bake ──────────────────

/** One star of the simple sky's field: where it stands on the celestial
 * sphere, how big a point it is worth, and what colour. */
export type NightStar = {
  x: number;
  y: number;
  z: number;
  /** Point size in pixels, before the twinkle. */
  size: number;
  /** Its own 0..1, for a scintillation nothing else is in step with. */
  seed: number;
  r: number;
  g: number;
  b: number;
};

/** The star colour ramp, the same one `starTone` is in GLSL. */
function tone(t: number): THREE.Color {
  const hot = new THREE.Color(0.7, 0.8, 1);
  const mid = new THREE.Color(1, 0.98, 0.94);
  const warm = new THREE.Color(1, 0.78, 0.58);
  return t < 0.5 ? hot.lerp(mid, t * 2) : mid.lerp(warm, (t - 0.5) * 2);
}

/** A deterministic 0..1 from a counter — `cloudHash` is the sky's own, and
 * using it here rather than `Math.random` is what makes a screenshot of the
 * simple sky the same picture twice. */
function roll(i: number, salt: number): number {
  return cloudHash(i * 0.7391 + salt * 19.73, salt * 0.311 + i * 0.0179);
}

/** How much of the field is drawn INTO the band rather than spread over the
 * whole sphere. A little under half: enough that the Milky Way reads as a
 * river of stars in the simple sky, which is the only way that sky can say
 * it at all. */
const IN_BAND = 0.34;

/** THE SIMPLE SKY'S FIELD. Stars on the celestial sphere, most of them
 * spread evenly and the rest crowded along the galactic equator, each with
 * a magnitude and a colour drawn the same way the shader draws them. */
export function nightStars(count: number): NightStar[] {
  const pole = new THREE.Vector3(...GAL_POLE);
  const centre = new THREE.Vector3(...GAL_CENTRE);
  const side = new THREE.Vector3(...GAL_SIDE);
  const out: NightStar[] = [];
  for (let i = 0; i < count; i++) {
    const a = roll(i, 1);
    const b = roll(i, 2);
    const dir = new THREE.Vector3();
    if (i % 100 < IN_BAND * 100) {
      // In the band: a longitude anywhere, a latitude squeezed toward the
      // equator, and the crowd thickening toward the centre.
      const lon = a * TAU;
      const lat = (b - 0.5) * 0.44 * (0.5 + roll(i, 5));
      const c = Math.cos(lat);
      dir
        .copy(centre)
        .multiplyScalar(Math.cos(lon) * c)
        .addScaledVector(side, Math.sin(lon) * c)
        .addScaledVector(pole, Math.sin(lat))
        .normalize();
    } else {
      const z = a * 2 - 1;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const t = b * TAU;
      dir.set(Math.cos(t) * r, Math.sin(t) * r, z).normalize();
    }
    // The same steep magnitude curve the shader uses, so the two fields
    // have the same population of bright stars rather than the same count.
    const mag = Math.pow(roll(i, 3), 2.1);
    const c = tone(Math.pow(roll(i, 4), 0.7)).multiplyScalar(0.28 + 0.72 * mag);
    out.push({
      x: dir.x,
      y: dir.y,
      z: dir.z,
      size: 1.1 + 2.4 * mag,
      seed: roll(i, 6),
      r: c.r,
      g: c.g,
      b: c.b,
    });
  }
  return out;
}

/** THE BAND, on the CPU — the same arithmetic `milkyWay` is above, for the
 * simple sky to bake into the vertex colours of one additive strip. Takes a
 * unit direction in celestial coordinates; returns the tone, band strength
 * already in it.
 *
 * It is written twice on purpose and has to stay written twice: the shader
 * needs it as GLSL and this needs it as numbers, and neither can import the
 * other. Change one, change both — `make sky` shoots the two skies side by
 * side for exactly this. */
export function milkyWayAt(x: number, y: number, z: number): THREE.Color {
  const lat = x * GAL_POLE[0] + y * GAL_POLE[1] + z * GAL_POLE[2];
  const along = x * GAL_CENTRE[0] + y * GAL_CENTRE[1] + z * GAL_CENTRE[2];
  const across = x * GAL_SIDE[0] + y * GAL_SIDE[1] + z * GAL_SIDE[2];
  const lon = Math.atan2(across, along);
  let band = 0.72 * Math.exp(-lat * lat * BAND_TIGHT) + 0.28 * Math.exp(-lat * lat * BAND_BROAD);
  if (band <= 0.004) return new THREE.Color(0, 0, 0);
  const bulge = Math.pow(Math.max(along, 0), BULGE_REACH);
  band *= 0.42 + 0.58 * Math.pow(Math.max(along * 0.5 + 0.5, 0), 1.6) + BULGE_LIFT * bulge;
  const u = lon * 2.4;
  const v = lat * 6.5;
  const clumps = cloudFbm(u * 1.9 + 4.7, v * 1.9 + 1.3, GALAXY_OCTAVES);
  const dust = cloudFbm(u * 1.05 + 31, v * 1.05 + 7, GALAXY_OCTAVES);
  band *= 0.42 + 1.05 * clumps;
  const off = lat - RIFT_OFF * (1 + 2 * dust);
  const lane = Math.exp(-off * off * RIFT_TIGHT * RIFT_TIGHT);
  const rift = Math.min(1, Math.max(0, (bulge + 0.25 - 0) / 0.55));
  band *= 1 - 0.62 * lane * (rift * rift * (3 - 2 * rift));
  return new THREE.Color(GALAXY_ARM)
    .lerp(new THREE.Color(GALAXY_CORE), Math.min(1, bulge * 0.9 + 0.1 * clumps))
    .multiplyScalar(band * BAND_GAIN);
}
