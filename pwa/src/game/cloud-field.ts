// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT CLOUDS ARE OVER THE STAGE — the genera, at the heights the cloud
// chart puts them, dressed onto one run's sky by its weather, its country,
// its season and its seed. Everything here is a DECISION about the sky:
// what the layers are, how much they cover, how big their cells are, how
// hard their edges, which way they streak, and how fast they ride the wind.
// What they LOOK like is sky-shader.ts's half (the same layers drawn on the
// dome), and clouds.ts's for the simple sky.
//
// The heights are WORLD altitudes, metres over the sea, because the country
// is not flat: an alpine pass at six hundred metres looks UP at a cumulus
// whose base is at fifteen hundred and DOWN onto a stratus sea filling the
// valley at three, and a driver on the taiga's sea-level gravel sees the
// same two clouds a kilometre and a half over their head. The chart, roughly
// (temperate latitudes, m over the sea):
//
//   LOW     stratus, stratocumulus, cumulus, nimbostratus    0 –  2 000
//   MIDDLE  altocumulus, altostratus                     2 000 –  7 000
//   HIGH    cirrus, cirrocumulus, cirrostratus           5 000 – 13 000
//   TALL    cumulonimbus, base low and the anvil high
//
// The one thing that makes a sunset sky a sunset sky is that the sun sets
// on these one at a time, lowest first (`litAt`): the valley goes grey, then
// the cumulus, and the cirrus burns for a quarter of an hour after.
//
// DOM-free and three-free on purpose. The NOISE is here too, twice — once
// as GLSL for the dome and the ground's cloud shadows, once as the same
// arithmetic in TypeScript — so the environment can ask, on the CPU, how
// much cloud is between the car and the sun and dim the key light by it.
// The two agree to float precision, which is all a soft edge needs.

import type { BiomeId, RaceEnv, Season, Weather } from "@engine";

export type CloudGenus =
  | "cumulus"
  | "stratocumulus"
  | "stratus"
  | "nimbostratus"
  | "cumulonimbus"
  | "altocumulus"
  | "altostratus"
  | "cirrus"
  | "cirrostratus"
  | "scud"
  | "dust";

/** One sheet of cloud, as the dome draws it: a plane at an altitude with a
 * noise field on it. */
export type CloudLayer = {
  genus: CloudGenus;
  /** Where the layer's BASE is, m over the sea. */
  altitude: number;
  /** How thick it is, m — what the sun has to get through, which is what
   * decides how dark the underside is against the top. */
  thickness: number;
  /** How much of the sky it covers, 0..1. */
  coverage: number;
  /** The size of one cell of the noise, m — how big one cloud is. */
  scale: number;
  /** How hard the edge is, 0..1: a haze at nothing, a cauliflower at one. */
  sharpness: number;
  /** How far the cells are pulled out along the wind, 1 for not at all —
   * cirrus is combed into streaks, cumulus is not. */
  streak: number;
  /** How much of the lit-versus-shade contrast the body shows, 0..1. A
   * cumulus is a solid with a shadowed underside; a cirrus sheet is a veil
   * with no body to shade. */
  body: number;
  /** How fast it rides the ground wind, as a multiple of it. Scud tears
   * along under a base at nearly three times the wind on the road; cirrus
   * in the jet stream is fast too, but ten kilometres up it barely seems
   * to move. */
  drift: number;
  /** How much the sheet is combed into FIBRES, 0..1 — the fine filaments
   * along the wind that make a cirrus a cirrus (`cloudFibres`). Nothing on
   * a cumulus, which is a heap and not hair. */
  fibre: number;
  /** A seed offset into the noise, so no two layers share a pattern. */
  seed: number;
  /** Whether the sheet is the DECK — the lid of an overcast sky, painted
   * from the preset's `Deck` rather than from the cloud tones. */
  deck: boolean;
  /** WHICH SHEET THIS SKY IS, counted from the one that matters: 0 is the
   * primary — the cloud the stage is actually driven under — and each step
   * up is a sheet the sky can be read without.
   *
   * It exists because the quality ladder drops sheets off the top of the
   * stack (`SkyLook.layers`), and altitude is the wrong order to drop them
   * in from EITHER end. Under weather the primary is the DECK and the scud
   * hangs below it, so the lowest sheet is the one to lose; on a clear day
   * the primary is the cumulus at the bottom and the cirrus ten kilometres
   * over it is the one to lose. Nothing about the two altitudes says that,
   * so the chart says it here instead.
   *
   * Ranks are per sky and need not be dense: a desert that rolled no
   * cumulus can be a rank 2 cirrus on its own, and a cap of one keeps it
   * rather than emptying the sky. */
  rank: number;
};

/** Everything over one stage. Ordered by altitude, lowest first — which is
 * the order the dome walks to paint them far-to-near. */
export type SkyDressing = {
  layers: CloudLayer[];
};

/** How many layers the dome can draw at once — the uniform arrays are sized
 * to it. The chart below rolls at most three (a base, a mid sheet and
 * cirrus; under weather it is a deck and its scud, which is two), and the
 * fourth slot is headroom for a chart that grows one. */
export const MAX_LAYERS = 4;

/** Where a stage's cumulus base sits over each country, m over the sea. The
 * base of a cumulus is the condensation level, and it stands higher over
 * dry ground — a desert's puffs are two kilometres up on a summer day, a
 * forest's barely one. The alpine's are given the mountain's own height
 * to build over: the country's roads run to nine hundred metres. */
const CUMULUS_BASE: Record<BiomeId, [number, number]> = {
  taiga: [1000, 1500],
  desert: [1900, 2600],
  alpine: [1700, 2300],
};

/** A uniform draw on [0,1) from a seed — a tiny hash, so the same stage
 * always dresses the same sky. Nothing in the simulation reads it. */
function dice(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function between(roll: () => number, lo: number, hi: number): number {
  return lo + roll() * (hi - lo);
}

/** The seed a run's sky is dressed from: the wind the engine seeded, which
 * is already unique to the seed and the weather, quantised so the same
 * stage always brings the same clouds back. */
export function skySeed(env: Pick<RaceEnv, "gustPhase" | "windDir">): number {
  return Math.floor(env.gustPhase * 1000) * 7919 + Math.floor(env.windDir * 1000);
}

/**
 * DRESS THE SKY for one run. `cover` is how heavy the weather is (0..1,
 * `coverOf`), and only the wet skies read it.
 *
 * The clear sky is the country's and the season's: a summer forest builds
 * cumulus all afternoon, a winter one sits under a flat stratocumulus
 * sheet; a desert has a few cumulus a long way up and cirrus more often
 * than not; the Alps build cumulus over the peaks and comb altocumulus
 * into lenticular streaks in the wind. Rain is a deck (nimbostratus in a
 * wet country, blown sand in a dry one) with scud under it; a storm is the
 * same deck lower and blacker with the scud tearing.
 */
/** The stack in the order the dome paints it: lowest sheet first, so the
 * shader's walk from the far side of the sky comes out far-to-near whether
 * the ray is going up or down. The chart pushes in the order it THINKS in
 * — a base, then whatever is over it — and that is not always the order the
 * altitudes are in (a desert's winter altostratus is rolled after the
 * cirrus and sits five kilometres under it). */
function byAltitude(layers: CloudLayer[]): CloudLayer[] {
  return [...layers].sort((a, b) => a.altitude - b.altitude);
}

export function dressSky(
  env: RaceEnv,
  biome: BiomeId,
  cover: number,
  deckBase: number | null,
): SkyDressing {
  const roll = dice(skySeed(env));
  const layers: CloudLayer[] = [];
  const season: Season = env.season;
  const weather: Weather = env.weather;

  if (weather !== "clear" && deckBase !== null) {
    // THE DECK — one sheet that covers everything. Its altitude is the
    // preset's own `base` over the road, which the environment turns into a
    // world height. Blown sand is the desert's deck.
    const dry = biome === "desert" && !(season === "winter");
    layers.push({
      genus: dry ? "dust" : weather === "storm" ? "cumulonimbus" : "nimbostratus",
      altitude: deckBase,
      thickness: weather === "storm" ? 4000 : 1200,
      coverage: 1,
      scale: 380,
      sharpness: 0.15,
      streak: 1.3,
      body: 1,
      drift: 1,
      fibre: 0,
      seed: 3,
      deck: true,
      rank: 0,
    });
    // SCUD — the ragged fragments torn along under the base, darker than
    // the ceiling and moving visibly faster than anything else in the
    // frame. Most of what makes a storm sky read as violent.
    layers.unshift({
      genus: "scud",
      altitude: deckBase - between(roll, 60, 110),
      thickness: 60,
      coverage: 0.22 + 0.3 * cover,
      scale: 230,
      sharpness: 0.35,
      streak: 1.35 + 0.6 * cover,
      body: 0.6,
      drift: 2.6,
      fibre: 0,
      seed: 5,
      deck: false,
      rank: 1,
    });
    return { layers: byAltitude(layers) };
  }

  // ── The clear sky ────────────────────────────────────────────────────
  const [baseLo, baseHi] = CUMULUS_BASE[biome];
  const summerish = season === "summer" || season === "spring";
  if (biome === "taiga") {
    if (season === "winter") {
      // A flat grey stratocumulus sheet with holes in it — the northern
      // winter sky — over a country that is white anyway.
      layers.push(sheet("stratocumulus", 700 + roll() * 300, between(roll, 0.3, 0.75), roll, 0));
    } else {
      layers.push(
        heaps(
          "cumulus",
          between(roll, baseLo, baseHi),
          between(roll, 0.18, summerish ? 0.55 : 0.45),
          roll,
          0,
        ),
      );
    }
    if (roll() < (season === "spring" ? 0.3 : 0.18)) {
      layers.push(mackerel(between(roll, 3200, 4200), between(roll, 0.15, 0.4), roll, 1));
    }
    if (roll() < 0.65)
      layers.push(wisps(between(roll, 7500, 9500), between(roll, 0.12, 0.5), roll, 2));
  } else if (biome === "desert") {
    // A handful of cumulus in a great deal of blue, two kilometres up.
    if (roll() < 0.8) {
      layers.push(
        heaps("cumulus", between(roll, baseLo, baseHi), between(roll, 0.04, 0.22), roll, 0),
      );
    }
    if (roll() < 0.7)
      layers.push(wisps(between(roll, 8500, 11000), between(roll, 0.15, 0.55), roll, 2));
    if (season === "winter" && roll() < 0.5) {
      // The wet season's sheet, thin and high.
      layers.push(
        sheet("altostratus", between(roll, 3500, 4500), between(roll, 0.3, 0.6), roll, 1),
      );
    }
  } else {
    // R47 — the Alps: cumulus building over the peaks by afternoon,
    // altocumulus combed into lenticular streaks by the wind over the
    // range, and the airliners' cirrus.
    layers.push(heaps("cumulus", between(roll, baseLo, baseHi), between(roll, 0.15, 0.5), roll, 0));
    if (roll() < 0.6) {
      const lens = mackerel(between(roll, 3800, 5200), between(roll, 0.25, 0.5), roll, 1);
      lens.streak = between(roll, 2, 3.2);
      lens.scale *= 1.6;
      layers.push(lens);
    }
    if (roll() < 0.7)
      layers.push(wisps(between(roll, 8000, 10000), between(roll, 0.15, 0.5), roll, 2));
  }
  layers.sort((a, b) => a.altitude - b.altitude);
  return { layers: byAltitude(layers.slice(0, MAX_LAYERS)) };
}

/** Fair-weather heaps: hard-edged, solid, shadowed underneath, riding the
 * wind at about the speed of the wind. */
function heaps(
  genus: CloudGenus,
  altitude: number,
  coverage: number,
  roll: () => number,
  rank: number,
): CloudLayer {
  return {
    genus,
    altitude,
    thickness: 500 + coverage * 900,
    coverage,
    scale: between(roll, 700, 1100),
    sharpness: 0.75,
    streak: 1.15,
    body: 1,
    drift: 1,
    fibre: 0,
    seed: 11,
    deck: false,
    rank,
  };
}

/** A flat sheet with holes in it. */
function sheet(
  genus: CloudGenus,
  altitude: number,
  coverage: number,
  roll: () => number,
  rank: number,
): CloudLayer {
  return {
    genus,
    altitude,
    thickness: 350,
    coverage,
    scale: between(roll, 900, 1400),
    sharpness: 0.3,
    streak: 1.6,
    body: 0.6,
    drift: 1,
    fibre: 0,
    seed: 17,
    deck: false,
    rank,
  };
}

/** Altocumulus — the mackerel sky: cells a long way up, in a sheet that
 * is mostly cell. The cells are big for the genus — real ones are a
 * degree or two across, which at this resolution is noise on the dome. */
function mackerel(
  altitude: number,
  coverage: number,
  roll: () => number,
  rank: number,
): CloudLayer {
  return {
    genus: "altocumulus",
    altitude,
    thickness: 250,
    coverage,
    scale: between(roll, 650, 950),
    sharpness: 0.45,
    streak: 1.5,
    body: 0.7,
    drift: 1.3,
    fibre: 0,
    seed: 23,
    deck: false,
    rank,
  };
}

/** Cirrus — ice ten kilometres up, combed into long streaks along the
 * wind, with no body to shade: what burns after the sun has gone. The
 * sheet says where the veil is; the fibres are what it is made of — the
 * hair-like filaments a cirrus reads by, drawn over the sheet rather than
 * as it, so a big soft sweep of it still has fine structure inside. */
function wisps(altitude: number, coverage: number, roll: () => number, rank: number): CloudLayer {
  return {
    genus: "cirrus",
    altitude,
    thickness: 120,
    coverage,
    scale: between(roll, 2600, 3600),
    sharpness: 0.18,
    streak: between(roll, 3.5, 5),
    body: 0.1,
    drift: 1.8,
    fibre: between(roll, 0.6, 0.85),
    seed: 29,
    deck: false,
    rank,
  };
}

// ── The noise, twice ─────────────────────────────────────────────────────
//
// Once as GLSL and once on the CPU, walking the same lattice with the same
// hash so the cloud the player sees over the sun is the cloud the light
// answers to. Each octave is turned and scaled by the same matrix on both
// sides; a change to one is a change to the other.

/** The two fbm arms `cloudField` reads an `octaves`-deep field from: the
 * MASS, and the detail that erodes its edges. Stated once, in TypeScript,
 * because the emitter below and every caller asking for a field have to
 * agree on which arms that field needs compiled. */
export function fieldArms(octaves: number): [number, number] {
  return [Math.min(octaves, 2), Math.max(octaves - 2, 1)];
}

/** How deep the FIBRES are read, whatever the sheet over them is read at —
 * see `cloudFibres`. Emitted unconditionally, because every caller that
 * reads a field can comb one. */
const FIBRE_OCTAVES = 2;

/** THE NOISE, EMITTED AT THE DEPTHS THE CALLER ACTUALLY READS IT AT.
 *
 * The depth has to be a LITERAL, which is why this is an emitter and not
 * one `cloudFbm(p, octaves)` taking the depth as an argument. A trip count
 * the compiler cannot see is a loop it cannot unroll, so every octave of
 * every sample carries a compare, a branch and a live counter — on a shader
 * that covers the whole sky and, through the fog graft, every lit fragment
 * in the frame. One function per depth makes each bound a constant, which
 * unrolls, folds the amplitudes and the divisor, and leaves no control flow
 * at all.
 *
 * `fields` and `fbms` are the depths asked for: a `cloudField<n>` plus both
 * its arms for each of the first, a bare `cloudFbm<n>` for each of the
 * second. Ask for the depths that are read and no others — every one
 * emitted is another function for a phone to compile at the first frame it
 * is needed. The lattice and the fibres come out whatever is asked, because
 * every field is read off the one and can be combed by the other. */
export function cloudNoiseGlsl(fields: readonly number[], fbms: readonly number[] = []): string {
  const wanted = new Set<number>([FIBRE_OCTAVES, ...fbms]);
  for (const octaves of fields) for (const arm of fieldArms(octaves)) wanted.add(arm);
  const fbm = (n: number): string => `
float cloudFbm${n}( vec2 p ) {
  float v = 0.0;
  float a = 0.5;
  float total = 0.0;
  for ( int i = 0; i < ${n}; i ++ ) {
    v += a * cloudNoise( p );
    total += a;
    p = vec2( 1.6 * p.x + 1.2 * p.y, - 1.2 * p.x + 1.6 * p.y ) + vec2( 17.3, 9.1 );
    a *= 0.5;
  }
  return v / total;
}`;
  // THE FIELD a sheet is cut from: a few big masses, and detail that only
  // erodes their edges. Thresholding six octaves of fbm directly gives a sky
  // of small islands — a mackerel sky at noon whatever the genus — because
  // the fine octaves put the threshold over and under everywhere; weighting
  // the mass first is what makes a cumulus a heap with a ragged edge rather
  // than a scatter of flecks.
  const field = (n: number): string => {
    const [mass, detail] = fieldArms(n);
    return `
float cloudField${n}( vec2 uv ) {
  return 0.76 * cloudFbm${mass}( uv ) + 0.24 * cloudFbm${detail}( uv * 2.6 + vec2( 7.1, 3.3 ) );
}`;
  };
  const sorted = [...wanted].sort((a, b) => a - b);
  const once = [...new Set(fields)].sort((a, b) => a - b);
  return `${CLOUD_HASH_GLSL}${sorted.map(fbm).join("")}${CLOUD_FIBRES_GLSL}${once
    .map(field)
    .join("")}
`;
}

/** THE FIBRES a cirrus is combed into: the field read again at a pitch that
 * is fine ACROSS the wind and long along it (the uv is already stretched
 * along the wind by the streak, so the squeeze is across), and used to
 * modulate the sheet where it already is rather than to cut it — a filament
 * is a place the veil is denser, not a cloud of its own.
 *
 * Read at `FIBRE_OCTAVES` whatever the sheet over it is read at: the fibres
 * are already the finest thing in the sky, and a third octave of them is
 * shimmer. Emitted after the fbm block, because GLSL wants a function
 * declared before it is called. */
const CLOUD_FIBRES_GLSL = /* glsl */ `
float cloudFibres( vec2 uv, float n, float fibre ) {
  if ( fibre <= 0.0 ) return n;
  float f = cloudFbm${FIBRE_OCTAVES}( vec2( uv.x * 1.7, uv.y * 9.0 ) + vec2( 3.7, 11.9 ) );
  return mix( n, n * ( 0.5 + 1.0 * f ), fibre );
}`;

/** The lattice itself, shared by every depth above. Value noise from a hash
 * that does not go through `sin` — the classic
 * `fract(sin(dot(...)) * 43758.5453)` loses its mind in mediump and
 * disagrees with itself between a phone and a desktop, and this one is
 * products and fractions the whole way. */
const CLOUD_HASH_GLSL = /* glsl */ `
float cloudHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float cloudNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = cloudHash( i );
  float b = cloudHash( i + vec2( 1.0, 0.0 ) );
  float c = cloudHash( i + vec2( 0.0, 1.0 ) );
  float d = cloudHash( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}`;

function fract(v: number): number {
  return v - Math.floor(v);
}

/** The same hash, on the CPU. */
export function cloudHash(x: number, y: number): number {
  let px = fract(x * 0.1031);
  let py = fract(y * 0.1031);
  let pz = fract(x * 0.1031);
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d;
  py += d;
  pz += d;
  return fract((px + py) * pz);
}

export function cloudNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = cloudHash(ix, iy);
  const b = cloudHash(ix + 1, iy);
  const c = cloudHash(ix, iy + 1);
  const d = cloudHash(ix + 1, iy + 1);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

/** The same field as `cloudField` in the GLSL: the mass at two octaves,
 * eroded by detail at the rest. */
export function cloudField(x: number, y: number, octaves: number): number {
  const mass = cloudFbm(x, y, Math.min(octaves, 2));
  const detail = cloudFbm(x * 2.6 + 7.1, y * 2.6 + 3.3, Math.max(octaves - 2, 1));
  return 0.76 * mass + 0.24 * detail;
}

/** The same fibres as `cloudFibres` in the GLSL, on the CPU — at the same
 * fixed depth, so the cirrus dimming the sun is the cirrus on the dome. */
export function cloudFibres(u: number, v: number, n: number, fibre: number): number {
  if (fibre <= 0) return n;
  const f = cloudFbm(u * 1.7 + 3.7, v * 9.0 + 11.9, FIBRE_OCTAVES);
  return n + (n * (0.5 + 1.0 * f) - n) * fibre;
}

/** How much of a sheet's fibres are drawn on a ray at this elevation
 * (`up`, the ray's or the sun's y), 0..1. Toward the horizon a sheet ten
 * kilometres up is seen a hundred kilometres away, where the fibres are
 * under a pixel and only sparkle: they are faded out over the lowest
 * fifteen degrees, and the veil is left to the haze. Stated once for the
 * dome and the CPU's cloud-over-the-sun. */
export function fibreAt(up: number): number {
  const t = Math.abs(up) / 0.25;
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

export function cloudFbm(x: number, y: number, octaves: number): number {
  let v = 0;
  let a = 0.5;
  let total = 0;
  let px = x;
  let py = y;
  for (let i = 0; i < Math.min(6, octaves); i++) {
    v += a * cloudNoise(px, py);
    total += a;
    const nx = 1.6 * px + 1.2 * py + 17.3;
    const ny = -1.2 * px + 1.6 * py + 9.1;
    px = nx;
    py = ny;
    a *= 0.5;
  }
  return total > 0 ? v / total : 0;
}

/** Where a layer's noise is read for a point on it: the world position,
 * the layer's own drift offset, turned so the streak runs along the wind
 * and scaled to the layer's cells. Stated once so the GLSL and the CPU
 * take the same sample — the shader restates it (`cloudUv` in
 * sky-shader.ts), and `tests/cloud_field_test.ts` holds the two together. */
export function cloudUv(
  layer: Pick<CloudLayer, "scale" | "streak" | "seed">,
  x: number,
  z: number,
  offsetX: number,
  offsetZ: number,
  windX: number,
  windZ: number,
): [number, number] {
  const px = x + offsetX;
  const pz = z + offsetZ;
  // Along the wind (`windX`, `windZ` is its unit vector) and across it.
  const along = px * windX + pz * windZ;
  const across = -px * windZ + pz * windX;
  return [along / (layer.scale * layer.streak) + layer.seed * 13.7, across / layer.scale];
}

/** How much cloud there is at a field value `n` on a layer, 0..1: the
 * coverage sets the threshold and the sharpness how soft the edge is.
 * `cloudField` runs about 0.2..0.8, so the threshold walks that band and a
 * coverage of one is a sky with no hole in it. */
export function cloudDensity(layer: Pick<CloudLayer, "coverage" | "sharpness">, n: number): number {
  const threshold = 0.5 + (0.5 - layer.coverage) * 0.5;
  const soft = 0.04 + 0.3 * (1 - layer.sharpness);
  const t = (n - threshold) / soft + 0.5;
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** The same rule, as GLSL. */
export const CLOUD_DENSITY_GLSL = /* glsl */ `
float cloudDensity( float coverage, float sharpness, float n ) {
  float threshold = 0.5 + ( 0.5 - coverage ) * 0.5;
  float soft = 0.04 + 0.3 * ( 1.0 - sharpness );
  return smoothstep( 0.0, 1.0, ( n - threshold ) / soft + 0.5 );
}
`;

/**
 * HOW MUCH CLOUD IS BETWEEN A POINT AND THE SUN, 0..1 — what the key light
 * is dimmed by, so the stage goes dull as a cumulus comes over the sun and
 * brightens again as it passes, and the shadow under the car goes soft with
 * it.
 *
 * The ray from `(x, y, z)` toward the sun pierces a layer above it at one
 * point; the noise there is the answer. A layer under the point does not
 * shade it, and a sun under the horizon shades nothing (the sky is dark
 * anyway). Read with the same octaves the dome draws, so the cloud the
 * player sees over the sun is the cloud the light answers to.
 */
export function sunOcclusion(
  layer: CloudLayer,
  x: number,
  y: number,
  z: number,
  sunDir: { x: number; y: number; z: number },
  offsetX: number,
  offsetZ: number,
  windX: number,
  windZ: number,
  octaves: number,
): number {
  if (sunDir.y <= 0.02 || layer.altitude <= y) return 0;
  const dist = (layer.altitude - y) / sunDir.y;
  const px = x + sunDir.x * dist;
  const pz = z + sunDir.z * dist;
  const [u, v] = cloudUv(layer, px, pz, offsetX, offsetZ, windX, windZ);
  const n = cloudFibres(u, v, cloudField(u, v, octaves), layer.fibre * fibreAt(sunDir.y));
  return cloudDensity(layer, n) * Math.min(1, layer.body + 0.3);
}
