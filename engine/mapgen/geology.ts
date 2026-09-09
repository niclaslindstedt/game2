// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R32 — THE GROUND, IN LAYERS. A landscape is not a height: it is rock
// with things lying on top of it, and almost everything a stage looks like
// follows from which layer is showing where.
//
// The layers, laid in the order the country was made:
//
//   1. BEDROCK. The rock the whole map is cut from — broad swell, hills,
//      mountain chains along their ridges, and the fault steps between
//      them. Everything else is deposited on it or dissolved out of it.
//      In a mountain country (R47, `BiomeLand.massif`) a MASSIF stands on
//      all of that: a ridge system hundreds of metres high whose flanks
//      are concave — a gentle foot, a steep last pitch — and whose valley
//      floors are flattened to the level the ice left them at, so the
//      lakes and the villages have somewhere to be.
//
//      Bedrock has a SMOOTHNESS, and it is the single number that decides
//      what country the stage is in. Sweden and Norway are made of the same
//      rock; what separates them is that the ice sat on one and ran off the
//      other. A smooth country is planed: broad whaleback summits, filled
//      valleys, and none of the fine grain left — the ice took it. A rough
//      one stands its mountains higher and keeps its texture.
//
//      Whatever the smoothness, the rock is CURVES. The ground is drawn on
//      a 14 m lattice, and a crease in the field is a fold on it that reads
//      from a kilometre up; so a crest is a whaleback and a fault step is a
//      worn slope unless somebody asked otherwise. The two sharp things the
//      country can have — the alpine knife-edge along a crest, the fault
//      step standing as a cliff — are opened by the `steepness` dial past
//      its midpoint (`steep.crease`) and by nothing else, and `sharpAt`
//      says where they are so the analysis can hold everything else to a
//      curve.
//
//   2. GROUNDWATER. The water table is a smoothed copy of the land, sitting
//      a few metres under it: it follows the topography without following
//      its detail, so it runs shallow under flats and hollows and deep
//      under anything steep, because steep ground drains. Where the table
//      comes up through the surface the ground is WET — a bog, a mire, a
//      spring line. Where a basin's floor is under the lake table, it is a
//      lake.
//
//   3. SOIL. Till and washed sediment lying on the rock. It collects in
//      hollows and on flats and is stripped off anything steep, so the
//      mountain flanks and the escarpment faces are bare rock and the
//      valley floors are deep. Trees need it; big rocks only surface where
//      it is thin; bedrock carries moss, grass and flowers and nothing with
//      a root.
//
// Everything here is analytic, deterministic in the seed, and — this is the
// constraint that shapes the whole module — CHEAP. The generator runs in
// the game every time a stage starts, and `surfaceAt` is read for every
// ground lattice corner, every prop, every road sample and every water
// query. So the layers are computed together in one pass over the shared
// noise rather than as four independent fields, and nothing here takes a
// gradient: the steepness terms are read off the shaping functions that
// were already evaluated (a smoothstep's own `t(1-t)` peaks exactly on its
// face), which is a derivative for free.

import { smooth, valueNoise } from "../lib/noise.ts";
import { createRng } from "../lib/prng.ts";
import { biomeRules } from "./biomes.ts";
import {
  STAGE_RULES as R,
  altitudeScale,
  challengeMul,
  knobScale,
  landOf,
  reliefOf,
  siteBiasOf,
  type StageKnobs,
} from "./rules.ts";

/** The water table: ground below this stands under open water — the lakes
 * and the sea. It is where the groundwater surfaces at the map's own base
 * level, so it is the floor under every other water level here, m. */
export const LAKE_Y = -11;

/** R40 — how far under the lake table a dry country's groundwater sits,
 * m. Deep enough that no hollow the relief can cut reaches it: the
 * desert's floor keeps the surface above the table by construction, and
 * this keeps the table out of every "is it wet" answer besides. */
const ARID_TABLE = 40;

/** R40 — the knee a dry country's pans are flattened over, m: how far
 * above the floor the hillside starts easing onto it. */
const PAN_KNEE = 8;

/** R40 — the share of the dune mask under which there is no sand, and the
 * span it fades in over. Value noise sits mostly between 0.3 and 0.7, so
 * this puts full-height dunes over roughly a third of the country, fading
 * ones over another third, and pan and scrub over the rest. */
const DUNE_FIELD_FROM = 0.3;
const DUNE_FIELD_SPAN = 0.25;

/** R40 — how much sharper a dune's crest is than the rounded fold of the
 * ridged noise (`STAGE_RULES.dunes.crest`), lifted out of the rule book
 * once because `duneAt` is on the per-ground-cell path. */
const DUNE_CREST = R.dunes.crest;

/** R47 — THE SUMMIT LEDGE, as shares of the ridge field: the ground stands
 * level above `MASSIF_LEDGE`, rolls over into that level between
 * `MASSIF_BROW` and it, and below `MASSIF_BROW` is exactly the flank the
 * biome row describes — at every position of the ALTITUDE dial.
 *
 * That last clause is the whole of it. The ledge exists because R35 has to
 * find somewhere level to put a start on a six-thousand-metre mountain, and
 * because a road descends at `follow.grade` and no faster, so ground falling
 * away faster than that is ground the compiler builds the road in the air
 * over. What it must NOT do is flatten the mountain, and a shelf blended in
 * as a downward parabola over the whole climb does exactly that: its slope
 * is steepest at the valley floor and falls to nothing at the crest, so the
 * summit spreads into a tableland. MEASURED over seeds 1-6 at the top of the
 * dial, 20-71% of the box stood within 5% of the summit — against 0.2-0.3%
 * at the dial's default, which is what a mountain with a peak on it reads
 * as. The stage was on a mesa, and `ground.summit` is the check that now
 * says so.
 *
 * So the ledge is a CAP on the top of the climb rather than a reshaping of
 * it: the flank keeps the row's own profile — gentle over the talus at the
 * foot, steepest under the crest — right up to the brow, and only the last
 * stretch is rolled level. */
const MASSIF_BROW = 0.88;
const MASSIF_LEDGE = 0.97;

/** R47 — the massif's two further octaves of ridge, as divisors of its
 * scale: the side ridges that run down off a main crest, and the gullies
 * between them, and what each is worth against the main crest's own fold.
 * `MASSIF_GULLY_SHARE` is read against the row's `spurs`, so a country
 * with no spurs has no gullies either. */
const MASSIF_SPUR = 2.6;
const MASSIF_GULLY = 6.5;
const MASSIF_GULLY_SHARE = 0.4;

/** R47 — THE SUMMIT LEDGE as a function of the ridge field: the identity
 * below the brow, a cubic that arrives at the top of the climb with no
 * slope left, and flat above the ledge line. Both joints are C1 — the
 * cubic leaves the flank at exactly the flank's own slope and meets the
 * ledge at zero — which is what keeps a rim off `ground.crease`, the same
 * property the taiga's `rounded` crest is built for.
 *
 * `a` is how much of the room between the brow and the crest the roll-over
 * is given; the rest is ledge. It is also the roll's opening slope
 * relative to the flank's, so it must stay in (0, 1]: at 1 there is no
 * ledge at all, only a rounded summit. */
function ledgeCap(r: number): number {
  if (r <= MASSIF_BROW) return r;
  if (r >= MASSIF_LEDGE) return 1;
  const a = (MASSIF_LEDGE - MASSIF_BROW) / (1 - MASSIF_BROW);
  const s = (r - MASSIF_BROW) / (MASSIF_LEDGE - MASSIF_BROW);
  return MASSIF_BROW + (1 - MASSIF_BROW) * (((a - 2) * s + (3 - 2 * a)) * s + a) * s;
}

/** `ledgeCap`'s own slope, for the free gradient the flank estimate is read
 * off: 1 under the brow, 0 over the ledge, and the cubic's derivative
 * between them. */
function ledgeSlope(r: number): number {
  if (r <= MASSIF_BROW) return 1;
  if (r >= MASSIF_LEDGE) return 0;
  const a = (MASSIF_LEDGE - MASSIF_BROW) / (1 - MASSIF_BROW);
  const s = (r - MASSIF_BROW) / (MASSIF_LEDGE - MASSIF_BROW);
  // d/dr, so the cubic's derivative in `s` over the width it is spread on
  // — which is what makes this exactly 1 at the brow and 0 at the ledge.
  return ((3 * (a - 2) * s + 2 * (3 - 2 * a)) * s + a) / a;
}
/** ...and how much steeper the folded noise runs per unit than a single
 * octave's quarter-period climb, once the spurs are folded in — the
 * factor the flank's free gradient estimate carries. */
const MASSIF_OCTAVE_GRADE = 1.5;
/** How far a footprint may be from level and still be a shoulder a stage
 * can start on, m of spread between its highest and lowest point, and how
 * hard a metre of spread counts against a metre of height when the
 * highest such shoulder is chosen (R35, `startHigh`). `SHOULDER_OVER_SNOW`
 * is how far above the snowline the grid may stand before height stops
 * counting for it: a stage starts BESIDE the snow, with the peaks over it
 * and the whole descent under it, not on the summit where every way down
 * is a wall and the first two kilometres are white.
 *
 * R47 — the SPREAD is the tuned country's and stays absolute: a start grid
 * has to be level enough to hold a field whatever the country around it is
 * doing. What the ALTITUDE dial moves is the two things it is COMPARED
 * against — the height on offer (`massif.altitude.siting`) and the snowline
 * the ceiling is measured from (`altitudeScale.bands`).
 *
 * ...and `SHOULDER_OVER_CREST` is the OTHER ceiling, as a share of the
 * mountain's own crest, taken whenever it stands higher than the snow one.
 * On the country the alpine's row describes the snow ceiling is the higher
 * of the two and this changes nothing; on a mountain standing kilometres
 * over its own snowline, "beside the snow" IS the valley floor, and holding
 * the start to it put four seeds in six down at the bottom with the
 * mountain they were meant to come down standing beside them. */
const SHOULDER_SPREAD = 60;
const SHOULDER_PENALTY = 1.5;
const SHOULDER_OVER_SNOW = 30;
const SHOULDER_OVER_CREST = 1;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** One point's worth of ground, every layer at once. Read together because
 * they are computed together: asking for the soil after the rock costs a
 * second pass over the same six noise lookups. */
export type GroundSample = {
  /** Top of the rock, m. */
  bedrock: number;
  /** Soil lying on it, m — 0 is bare rock at the surface. */
  soil: number;
  /** The ground you stand on: bedrock + soil, m. */
  surface: number;
  /** Groundwater level here, m. At or above the surface, the ground is
   * waterlogged; below `LAKE_Y` it is the lake table. */
  table: number;
};

/** Standing water at a point. `depth` is how far the surface lies under the
 * lake table, m — 0 on dry ground. */
export type Wetland = {
  kind: "dry" | "swamp" | "lake";
  depth: number;
};

export type GeologyField = {
  /** Every layer at a point. */
  groundAt: (x: number, z: number) => GroundSample;
  /** The ground surface alone — the hot path, so it skips what it can. */
  surfaceAt: (x: number, z: number) => number;
  /** Soil depth alone, m. */
  soilAt: (x: number, z: number) => number;
  /** How far the groundwater stands ABOVE the surface, m: 0 on dry ground,
   * positive in a mire. What decides where the bogs are. */
  wetAt: (x: number, z: number) => number;
  /** What is standing on this ground, and how deep it is. The difference
   * between the two wet kinds is depth and nothing else, which is exactly
   * what it is in the world: a SWAMP is water shallow enough to see the
   * bottom of, grow reeds out of and drive through; a LAKE is water that is
   * not. Everything that plants at a waterline reads this. */
  wetlandAt: (x: number, z: number) => Wetland;
  /** How glacially planed this country is, 0 (alpine, sharp) to 1 (shield,
   * rounded) — drawn from the seed, so every stage is somewhere. */
  smoothness: number;
  /** How much of the ground here is a DELIBERATELY sharp feature, 0..1: an
   * alpine crest's crease, an escarpment standing as a cliff — both opened
   * by the `steepness` dial and nothing else — and the bank of a pit whose
   * rim is narrower than the ground lattice can curve (`pits.sharpRim`).
   * The rock is curves everywhere else, and the analysis holds it to that:
   * a fold on the lattice where this is low is a defect, and where it is
   * high is the feature. */
  sharpAt: (x: number, z: number) => number;
};

/** Build the layers for a seed at its dial positions. Deterministic in
 * both and in nothing else: the same country every time. */
export function createGeology(seed: number, knobs: StageKnobs): GeologyField {
  const rng = createRng((seed ^ 0x1b873593) >>> 0);
  const noiseSeed = rng.int(1, 1 << 30);
  const G = R.geology;
  // R40 — the country the dials are read against: how flat the ice, or
  // the sun, has worn it, whether its hollows hold water, and whether the
  // wind has piled sand across it.
  const B = biomeRules(knobs.biome);
  // R47 — the country AT THIS ALTITUDE, not the row it was written from:
  // the massif's height and the ground it stands on are the dial's.
  const L = landOf(knobs);
  // How hard the country's own relief is turned up, and how much of it
  // stands under water — the `elevation` and `water` dials reach the world
  // beside the road here, exactly as they reach the road itself. A dry
  // country has no ponds to dial: its water knob still reaches the route
  // (R35's setbacks) and nothing else.
  const relief = reliefOf(knobs) * L.relief;
  const ponds = B.water ? knobScale(knobs.water, R.wet.ponds) : 0;
  // R34 — the one number that says which country this is, drawn from the
  // seed inside the band the `steepness` dial opens. The dial moves the
  // BAND and the seed picks the position in it, so a stage is still set
  // somewhere: what the dial says is which countries a seed may land in,
  // not which country this one is.
  const smoothness = rng.range(
    knobScale(knobs.steepness, { min: G.smoothness.min, max: G.steep.sharp.min }),
    knobScale(knobs.steepness, { min: G.smoothness.max, max: G.steep.sharp.max }),
  );
  // ...and how SHARP that country may be. Everything the rock does is a
  // curve, with two deliberate exceptions: the alpine crest — the fold of
  // the ridge noise, cubed, which is a knife-edge on the ground lattice —
  // and the escarpment drawn as a cliff rather than a worn step. Both are
  // the dial's (`steep.crease`): nothing until the dial is past it, and
  // above it the dial's own excess times how far down the sharp band the
  // seed fell, so a seed that came out worn keeps its whalebacks and its
  // hillsides at any dial position, and one that came out sharp is creased
  // along every crest and cliffed along every fault at the top.
  const sharpShare =
    clamp01((knobs.steepness - G.steep.crease) / (1 - G.steep.crease)) *
    clamp01((G.steep.sharp.max - smoothness) / (G.steep.sharp.max - G.steep.sharp.min));
  // ...and how big the relief that country holds is. Sharp country stands
  // its steps and its crests higher as well as steeper — the same fault the
  // ice would have worn into a hillside is a cliff where it did not.
  const rise = knobScale(knobs.steepness, G.steep.rise);
  // The ice took the fine grain with it, worked the sharp crests into
  // whalebacks, and wore the fault steps back into slopes.
  const grainAmp = G.bedrock.grain.amp * (1 - G.grain.planed * smoothness);
  const peak =
    G.bedrock.mountain.height *
    rise *
    L.mountains *
    (G.mountain.tall - G.mountain.planed * smoothness);
  const escRise = G.bedrock.escarpment.rise * rise;
  // R47 — THE MASSIF, where the country has one: how high its crests
  // stand, off the same dial and the same seed the taiga's chains read,
  // and how much of the taiga's own swell and hills is left under it.
  const M = L.massif;
  const massifPeak = M ? M.height * relief * rise : 0;
  // R47 — the `peaks` dial: how far apart the crests stand and how much of
  // the country between them is floor. One mountain in a plain at one
  // end, a range at the other.
  const altitude = altitudeScale(knobs);
  const massifScale = M ? M.scale * challengeMul(knobs.peaks, R.massif.peaks.scale) : 0;
  const massifValley = M
    ? Math.min(0.85, M.valley * challengeMul(knobs.peaks, R.massif.peaks.valley))
    : 0;
  const swellAmp = G.bedrock.swell.amp * (M ? M.swell : 1);
  const hillsAmp = G.bedrock.hills.amp * (M ? M.hills : 1);
  // The treeline is the country's (`BiomeLand.zones`): where the ice, or
  // the cold, leaves the ground bare.
  const treeline = L.zones.treeline;
  const escSpan =
    G.bedrock.escarpment.span.max -
    (G.bedrock.escarpment.span.max - G.bedrock.escarpment.span.min) * sharpShare;

  /** R40 — THE DUNES, where the country has them: wind-blown sand lying on
   * the rock as a ridged field. One bearing for the whole stage — one
   * prevailing wind piled all of it — and the ridges run ALONG it, several
   * times longer than they are wide, so a road crossing the wind meets
   * them as a washboard of brows and a road running with it rides a crest
   * for hundreds of metres. A slow mask says where the sand sea is at all;
   * between its fields the country is bare pan.
   *
   * Drawn AFTER the taiga's own draws, and only in a country with dunes, so
   * the rng sequence every existing seed was built on is untouched. */
  const D = L.dunes;
  const duneBearing = D ? rng.range(0, Math.PI * 2) : 0;
  const duneCos = Math.cos(duneBearing);
  const duneSin = Math.sin(duneBearing);
  const duneAt = (x: number, z: number): number => {
    if (!D) return 0;
    const mask = smooth(
      clamp01((valueNoise(x, z, D.field, noiseSeed + 61) - DUNE_FIELD_FROM) / DUNE_FIELD_SPAN),
    );
    if (mask <= 0) return 0;
    const along = x * duneCos + z * duneSin;
    const across = -x * duneSin + z * duneCos;
    const n = valueNoise(along / D.stretch, across, D.scale, noiseSeed + 67);
    // Ridged: the fold of the noise is the crest, and the smoothstep rounds
    // the slip face off into something a car can take at speed. Raised to
    // `dunes.crest`, which presses the low ground FLAT and leaves the sand
    // standing in separate dunes with interdune corridors between them —
    // the bare fold is a corrugation with every metre of it on a slope,
    // which is a washboard rather than a sand sea.
    return mask * D.amp * Math.pow(smooth(1 - Math.abs(2 * n - 1)), DUNE_CREST);
  };

  /** R40 — THE PANS. A country with no water has hollows that never fill;
   * they silt up flat instead, and this flattens the rock into them. A
   * soft knee rather than a clamp, for the same reason the pits are
   * blended rather than clamped: a `Math.max` creases where the two
   * surfaces cross, and the crease is a step in the ground nothing else
   * knows about. Quadratic across the knee, so the slope runs continuously
   * from the hillside down onto the flat. */
  const panFloor = L.floor === null ? null : LAKE_Y + L.floor;
  const onPan = (rock: number): number => {
    if (panFloor === null) return rock;
    const over = rock - panFloor;
    if (over >= PAN_KNEE) return rock;
    if (over <= -PAN_KNEE) return panFloor;
    return panFloor + ((over + PAN_KNEE) * (over + PAN_KNEE)) / (4 * PAN_KNEE);
  };

  /** Everything both the rock and the water table are made of, evaluated
   * once. `broad` is the country without its detail — the shape the water
   * table follows — and `face` is how steep the point is, read straight off
   * the shaping functions rather than measured with a gradient. */
  const layers = (
    x: number,
    z: number,
  ): {
    rock: number;
    broad: number;
    face: number;
    sheer: number;
    sunk: number;
    sharp: number;
  } => {
    const swell = (valueNoise(x, z, G.bedrock.swell.scale, noiseSeed) - 0.5) * swellAmp;
    const H = G.bedrock.hills;
    const hillRaw = valueNoise(x, z, H.scale, noiseSeed + 7);
    const hills = (hillRaw - 0.5) * hillsAmp;
    // ...and how steep the hills are HERE, differenced rather than read off
    // a shaping function, because value noise has none to read. See
    // `hills.grade`: this is the only gradient the module pays for and the
    // soil model does not work without it.
    const hx = (valueNoise(x + H.grade, z, H.scale, noiseSeed + 7) - hillRaw) / H.grade;
    const hz = (valueNoise(x, z + H.grade, H.scale, noiseSeed + 7) - hillRaw) / H.grade;
    const roll = clamp01((Math.hypot(hx, hz) * hillsAmp * relief) / H.steep);
    const grain = (valueNoise(x, z, G.bedrock.grain.scale, noiseSeed + 13) - 0.5) * grainAmp;

    // The mountain chains: a slow mask says where one stands, a ridged
    // field says where its crest runs, and the dial says whether the crest
    // is a peak or a whaleback. Both shapes top out at 1, so the height
    // band is the whole of the difference in scale between them.
    //
    // The whaleback is a PARABOLA over the ridge noise: the same crest
    // line as the fold, a third of the curvature at the crest that a
    // smoothstep over the fold has, and no crease anywhere — a curve on
    // the lattice however steeply the noise under it happens to run. A
    // smoothstep over the fold looks rounded and is not: its curvature is
    // all at the crest, where a steep run of the noise turns it over inside
    // one ground cell. The alpine crest is the fold itself, cubed, and a
    // crease by design.
    const mask = smooth(
      clamp01(
        (valueNoise(x, z, G.bedrock.mountain.scale, noiseSeed + 17) - G.bedrock.mountain.from) /
          (1 - G.bedrock.mountain.from),
      ),
    );
    const ridgeRaw = valueNoise(x, z, G.bedrock.ridge.scale, noiseSeed + 19);
    const ridge = 1 - Math.abs(2 * ridgeRaw - 1);
    const alpine = ridge * ridge * ridge;
    const rounded = 4 * ridgeRaw * (1 - ridgeRaw);
    const crest = rounded + (alpine - rounded) * sharpShare;
    const mountain = mask * crest * peak;

    // R47 — THE MASSIF. Three octaves of folded noise — the main ridge
    // system, the spurs off it and the gullies between them — summed into
    // one ridge field (0 in a valley, 1 on a crest) and bent concave by a
    // power, so a flank is a quarter grade at its foot and near one under
    // the crest. The fold is a crease by construction, and it is meant to
    // be: an arête is the sharp thing an alpine country has, and
    // `massifCrest` says where it is so the analysis can hold the rest of
    // the flank to a curve. The flank's own grade is estimated off the
    // shaping function — the fold climbs from valley to crest over a
    // quarter of its period, the power's chain rule on top — rather than
    // differenced, for the same reason the taiga's chains are.
    let massif = 0;
    let massifFlank = 0;
    let massifCrest = 0;
    if (M) {
      const fold = (n: number): number => 1 - Math.abs(2 * n - 1);
      // R47 — the three octaves are CARVED into one another, not stacked.
      // A spur is a ridge running down off a bigger ridge, and a gully is
      // cut between two spurs; neither is a thing that happens on its own
      // in the middle of a valley floor. So each finer octave is admitted
      // only in proportion to the one above it, and the grain lies on the
      // flanks that already stand up and dies out on the floors the ice
      // filled — which is both what a massif looks like and what keeps the
      // valleys the stage comes down into smooth.
      //
      // Summing three independent folds instead — which is what this was —
      // puts a crease every half-period of the FINEST octave across the
      // whole country, valley floors included, each one carrying its full
      // share of the mountain's height. At the top of the ALTITUDE dial
      // that is a 600 m needle every 200 m, and it reads from a kilometre
      // up as a bed of nails rather than as a range. `ground.summits`
      // counts them.
      //
      // The gate is on the WEIGHTS and not on the sum, which is the part
      // that has to be got right: multiplying the finer folds into the
      // coarser one and dividing by the old normalizer drops the whole
      // field's level, and since the valley floor is a fixed threshold
      // under it, the mountain then vanishes — measured, seed 11 came out
      // as a 25 m hummock where it had been a six-thousand-metre massif.
      // Dividing by what is actually ADMITTED here instead leaves the
      // level where the calibration expects it (mid-flank 0.484 against
      // the old 0.5) and takes only the needles out of the valleys (0.281
      // against 0.487, where the main ridge itself stands at 0.2).
      const f1 = fold(valueNoise(x, z, massifScale, noiseSeed + 71));
      const f2 = fold(valueNoise(x, z, massifScale / MASSIF_SPUR, noiseSeed + 73));
      const f3 = fold(valueNoise(x, z, massifScale / MASSIF_GULLY, noiseSeed + 79));
      const spur = M.spurs * f1;
      const folded =
        (f1 + spur * f2 + spur * MASSIF_GULLY_SHARE * f2 * f3) /
        (1 + spur * (1 + MASSIF_GULLY_SHARE));
      // The floor: everything under `valley` is the valley, flat at zero,
      // and the rest is stretched to climb the whole height.
      const ridgeSum = clamp01((folded - massifValley) / (1 - massifValley));
      // R47 — THE SHELF. The row's own flank runs to a point, and there is
      // nothing on top of it a road could be laid along. That is a mountain
      // at 340 m and a wall at six thousand, so as the ALTITUDE dial raises
      // it, the top of the climb — and only the top — is blended toward a
      // LEDGE: the shape a pass road is blasted into, and the thing this
      // level is about. `ledgeCap` says where the brow is and why the flank
      // below it is left exactly as the row wrote it.
      const point = Math.pow(ridgeSum, M.sharp);
      const ledge = Math.pow(ledgeCap(ridgeSum), M.sharp);
      const shaped = point + (ledge - point) * altitude.shelf;
      massif = shaped * massifPeak;
      // ...and how steep it is HERE, off the shaping function rather than
      // differenced. The chain rule is taken through the SHAPED profile and
      // not through the row's flank alone, because the ledge is the part
      // that matters: read off `point`, a summit rolled level still reports
      // as the steepest ground on the mountain, and `sheer` is what decides
      // whether soil lies, water stands and props stand up. The ledge is
      // ground, and it has to measure as ground.
      const slope = (p: number, dp: number): number =>
        M.sharp * Math.pow(Math.max(p, 1e-3), M.sharp - 1) * dp;
      const dShaped =
        slope(ridgeSum, 1) +
        (slope(ledgeCap(ridgeSum), ledgeSlope(ridgeSum)) - slope(ridgeSum, 1)) * altitude.shelf;
      const grade =
        massifPeak * dShaped * (4 / massifScale / (1 - massifValley)) * MASSIF_OCTAVE_GRADE;
      massifFlank = clamp01(grade / M.flankRef);
      // A crest is where any of the three folds turns over, weighted by
      // how much of the height that fold carries; the eighth power keeps
      // the mark to the band along the crease itself. The finer folds are
      // already carved by the ones above them, so this now dies out in the
      // valleys with the creases it is marking.
      const nearCrest = Math.max(f1, f1 * f2 * (0.5 + 0.5 * M.spurs), f1 * f2 * f3 * 0.5 * M.spurs);
      massifCrest = Math.pow(nearCrest, 8) * smooth(clamp01(shaped * 4));
    }

    // The escarpments: a wandering fault line where the ground steps down.
    // A cliff where the country is sharp, a hillside where the ice has been
    // over it. `esc * (1 - esc)` peaks exactly on the face of the step —
    // the smoothstep's own slope, without differencing anything.
    const escT =
      (valueNoise(x, z, G.bedrock.escarpment.scale, noiseSeed + 29) - G.bedrock.escarpment.from) /
      escSpan;
    const esc = smooth(clamp01(escT));

    // The basins: the sea, and the ponds a wetter dial sinks into the
    // country. They are cut into the ROCK — the ice gouged them — and they
    // fill because their floors are under the lake table. A dry country
    // has none: nothing was ever gouged, because nothing was ever going to
    // fill it.
    const b = G.bedrock.basin;
    const seaMask = B.water
      ? smooth(
          clamp01(
            (valueNoise(x, z, b.scale, noiseSeed + 23) - (b.from - ponds * b.wetter)) / b.span,
          ),
        )
      : 0;
    const p = G.bedrock.pond;
    const pond =
      ponds > 0
        ? smooth(
            clamp01(
              (valueNoise(x, z, p.scale, noiseSeed + 31) - (p.from - ponds * p.wetter)) / p.span,
            ),
          )
        : 0;
    const sunk = seaMask * (b.depth + ponds * b.deeper) + pond * (p.depth + ponds * p.deeper);

    const rock = onPan(
      (swell + hills + grain + mountain + esc * escRise) * relief + massif - sunk + G.bedrock.datum,
    );
    // The water table follows the land without its detail: the swell and
    // the mountains, and nothing finer. That is what puts a mire in a
    // hollow the broad shape does not know about.
    const broad = onPan((swell + mountain) * relief + massif - sunk + G.bedrock.datum);
    // How steep it is here, 0..1, and it comes in TWO strengths because two
    // rules ask it and they are not asking the same question.
    //
    // `face` is all of the slope there is — a mountain's flank, an
    // escarpment's step and the side of an ordinary hill. That is what
    // strips SOIL: till is deposited by water slowing down, and water does
    // not slow down on a hillside either.
    //
    // `sheer` leaves the hills out. It is what says the ground is too steep
    // to HOLD WATER, and a hill is not: a hollow on a broad rise still
    // gathers a mire in it, and the pond at the bottom of a sloping field
    // is the most ordinary water there is. Handing the pits the full face
    // shuts them off over most of a hilly country, and what is left is the
    // deep sea basins — a map whose every shoreline drops away too steeply
    // for a car to drive back out of.
    //
    // The max and not the sum, in both: a hillside on a mountain flank is
    // scoured once.
    const flank = Math.max(mask * 4 * crest * (1 - crest), massifFlank);
    const step = 4 * esc * (1 - esc);
    const sheer = clamp01(Math.max(flank, step));
    const face = clamp01(Math.max(sheer, roll));
    // How much of the ground here is a DELIBERATELY sharp feature: a crest,
    // or the escarpment's face, in a country the dial has opened. WHERE a
    // feature is, not how hard it creases — a quarter of the dial's excess
    // is already a crease along every crest, so the word saturates there.
    // A crest counts from a quarter of the mask up, because a small
    // mountain's knife-edge is as deliberate as a big one's; a face counts
    // for a span and a half beyond both its edges, because it is the FOOT
    // and the BROW of a cliff that fold on the lattice, both lie a cell
    // outside the face itself, and where the noise runs steep the face is
    // barely a cell wide. Everything else the rock does is a curve, and the
    // analysis holds it to one.
    const crestMark = smooth(clamp01(2 * mask)) * ridge * ridge;
    const faceMark = 1 - smooth(clamp01((Math.abs(escT - 0.5) - 0.5) / 1.5));
    const sharp = Math.max(clamp01(sharpShare * 4) * Math.max(crestMark, faceMark), massifCrest);
    return { rock, broad, face, sheer, sunk, sharp };
  };

  /** THE PITS — how far the ground is cut BELOW THE WATER TABLE here, m, and
   * therefore how deep the water standing in it is. Zero on dry ground.
   *
   * A pit is cut toward the table rather than by a fixed depth from the
   * surface, because that is what a hollow holding water actually is: the
   * ground goes down, the groundwater does not, and the difference fills.
   * It is what makes a wide, barely-cut pit a SWAMP and a narrow, deeply cut
   * one a tarn, out of the same mechanism.
   *
   * Two gates keep the pits where water could be. Steep ground DRAINS — a
   * hollow on a mountainside empties out of its own downhill side — and high
   * ground is above the table entirely, so a pit gouged into it is a dry
   * crater. Both fade rather than switch, so a shoreline is a gradient of
   * shallowing water and not a drawn line. */
  const pitAt = (
    x: number,
    z: number,
    rock: number,
    face: number,
  ): { t: number; full: number; rim: number; sharp: number } => {
    const P = G.pits;
    const none = { t: 0, full: 0, rim: 0, sharp: 0 };
    // R40 — no groundwater, no pit: a hollow in a dry country is a pan.
    if (!B.water) return none;
    // Flat, and low. Above `lowland` metres over the lake table there is no
    // groundwater to fill anything. Gated on the ROCK rather than on the
    // finished surface, which would need the soil, which needs the pit's own
    // rim — the soil is at most a few metres and the gate fades over tens,
    // so nothing is lost by asking the layer underneath.
    const flat = 1 - clamp01(face / P.flat);
    if (flat <= 0) return none;
    const lowland = 1 - clamp01((rock - LAKE_Y) / P.lowland);
    const holds = flat * lowland;
    if (holds <= 0) return none;
    const open = ponds * P.wetter;
    let strength = 0;
    let full = 0;
    let rim = 0;
    let sharp = 0;
    const cut = (
      pit: { scale: number; from: number; span: number; depth: number },
      salt: number,
    ): void => {
      const tRaw = (valueNoise(x, z, pit.scale, noiseSeed + salt) - (pit.from - open)) / pit.span;
      // A rim narrower than the ground lattice can curve is a CUT edge by
      // construction — a kettle hole's bank — and says so, for a lattice
      // cell's worth of ground beyond both its edges, because it is the top
      // and the toe of the bank that fold and each lies a cell out.
      const rimWidth = pit.span * pit.scale * (2 / 3);
      if (rimWidth < P.sharpRim) {
        const beyond = Math.max(0, Math.abs(tRaw - 0.5) - 0.5) * rimWidth;
        sharp = Math.max(sharp, 1 - smooth(clamp01(beyond / P.sharpRim)));
      }
      const t = smooth(clamp01(tRaw));
      if (t <= 0) return;
      // The three take the DEEPEST rather than the sum: a tarn inside a mere
      // is a tarn, not a tarn plus half a metre. Summing them also makes
      // every overlap deeper than any pit was authored to be, which is how a
      // landscape ends up with one enormous hole in it.
      if (t * pit.depth > strength * full) {
        strength = t;
        full = pit.depth;
      }
      // ...and the RIM, which is where the ground tips into the hollow.
      // `t(1-t)` peaks exactly on the shoulder of the smoothstep, which is
      // the same free-derivative trick the mountain flanks use.
      rim = Math.max(rim, 4 * t * (1 - t));
    };
    cut(P.mere, 41);
    cut(P.tarn, 43);
    cut(P.pool, 47);
    return { t: strength * holds, full, rim: rim * holds, sharp: sharp * clamp01(holds * 2) };
  };

  /** Soil depth over the rock, m. Till collects where water slows down and
   * is stripped where it does not: deep in the hollows and on the flats,
   * gone on the flanks and the faces, patchy everywhere in between, and
   * thinning out on the high ground the ice scoured hardest. */
  const soilOf = (x: number, z: number, rock: number, broad: number, face: number): number => {
    const S = G.soil;
    const patch = S.patch.min + (1 - S.patch.min) * valueNoise(x, z, S.patch.scale, noiseSeed + 37);
    // Below the broad shape of the country is downhill of everywhere near
    // it, which is where everything washed off the tops ends up.
    const hollow = clamp01(0.5 + (broad - rock) / S.hollow);
    const bare = 1 - face;
    const alpine = 1 - clamp01((rock - treeline) / S.alpine.over);
    // A glaciated country has MORE in its hollows and LESS on its highs:
    // the ice is what moved it from one to the other.
    const carried = 1 + S.glacial * smoothness * (hollow - 0.5) * 2;
    return Math.max(0, S.max * patch * bare * bare * (0.35 + 0.65 * hollow) * alpine * carried);
  };

  /** The finished ground at a point: the layers, then the pit cut into
   * them. Everything reads this, because the order is the whole of the
   * model — the pit's RIM is a slope, and a slope is scoured, so the soil
   * has to be computed knowing where the rims are or the analysis quite
   * correctly reports two metres of till lying down the side of every tarn
   * on the map. */
  const finish = (
    x: number,
    z: number,
  ): {
    rock: number;
    soil: number;
    surface: number;
    broad: number;
    face: number;
    sharp: number;
  } => {
    const { rock, broad, face, sheer, sharp } = layers(x, z);
    // `sheer` and not `face`: what stops a hollow holding water is a
    // mountainside, not a hill (see `layers`).
    const pit = pitAt(x, z, rock, sheer);
    const steep = Math.max(face, pit.rim);
    // R40 — the sand is SOIL: it lies on the rock like till does, it is
    // what a cactus roots in, and it buries the stone under it exactly as
    // a metre of till buries a boulder field.
    const soil = soilOf(x, z, rock, broad, steep) + duneAt(x, z);
    const dry = rock + soil - G.soil.datum;
    // The pit is BLENDED in, not clamped. `Math.min(dry, floor)` looks like
    // the same thing and is not: a min of two surfaces creases where they
    // cross, and the crease is a cliff whose position has nothing to do with
    // the pit's own rim — so the soil model cannot know to strip the soil
    // off it, and the analysis quite rightly reports till lying down the
    // side of every tarn on the map. Sinking the ground by the pit's own
    // smoothstep instead keeps the derivative bounded and puts the steepest
    // ground exactly where `rim` says it is.
    const floor = LAKE_Y - pit.full;
    const surface = pit.t > 0 ? dry - Math.max(0, dry - floor) * pit.t : dry;
    return { rock, soil, surface, broad, face: steep, sharp: Math.max(sharp, pit.sharp) };
  };

  /** Everything above works in COUNTRY space — the seed's landscape, at
   * the coordinates its own noise is written in. The stage is then sited
   * somewhere in it (below), and the public field reads through that
   * offset, so the world the game sees has its origin on ground a stage
   * can start from. */
  const rawGround = (x: number, z: number): GroundSample => {
    const { rock, soil, surface, broad, face } = finish(x, z);
    const W = G.groundwater;
    // Steep ground drains: the table drops away under a flank far faster
    // than it does under a flat. In a dry country it is tens of metres
    // down everywhere and never surfaces at all.
    const table = B.water
      ? Math.max(LAKE_Y, broad - (W.depth + W.drain * face))
      : LAKE_Y - ARID_TABLE;
    return { bedrock: rock, soil, surface, table };
  };

  /** R35 — where in the country this stage stands.
   *
   * The stage's origin is not chosen by anything: the route search draws
   * outward from (0, 0), and the start apron is laid on it before any rule
   * gets a say. So it is the COUNTRY that moves. The origin walks a spiral
   * until the whole footprint a start needs stands clear of the water, and
   * every query below is answered from there.
   *
   * The dryness test is the ground against its own local groundwater
   * table, which is the same number the pour in `water.ts` settles a lake
   * to — so a site that passes here is a site the pour will leave dry,
   * without this having to run a pour of its own to find out.
   *
   * No rng: a seed's landscape is exactly the landscape it always was, and
   * only the window onto it moves. */
  const site = ((): { x: number; z: number } => {
    const S = G.siting;
    // R47 — HOW FAR THE ORIGIN MAY WALK TO FIND ITS SITE, scaled with the
    // spacing of the country's own features (`altitudeScale.ground`). The
    // walk's job is to be able to leave whatever it started in — a basin,
    // or on a mountain the valley between two ridges — and a fixed 2.6 km
    // cannot do that in a country whose ridges stand six kilometres apart:
    // the high shoulder R35 is looking for is simply outside the spiral,
    // and four seeds in six started in the valley with the mountain they
    // were meant to come down beside them. The STEP is scaled with it, so
    // the walk costs the same number of probes at every altitude.
    const siteStep = S.step * altitude.ground;
    const siteFar = S.far * altitude.ground;
    /** How far the WORST point of the footprint stands clear of the water
     * under it, m — negative anywhere wet — and the footprint's height:
     * its mean, and the spread between its highest and lowest point. */
    const footprint = (ox: number, oz: number): { clear: number; mean: number; spread: number } => {
      let worst = Infinity;
      let sum = 0;
      let n = 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (let r = 0; r <= S.rings; r++) {
        const radius = (S.reach * r) / S.rings;
        const points = r === 0 ? 1 : S.ring;
        for (let a = 0; a < points; a++) {
          const angle = (a / points) * Math.PI * 2;
          const g = rawGround(ox + radius * Math.cos(angle), oz + radius * Math.sin(angle));
          const clear = g.surface - Math.max(LAKE_Y, g.table) - S.freeboard;
          if (clear < worst) worst = clear;
          sum += g.surface;
          n++;
          if (g.surface < lo) lo = g.surface;
          if (g.surface > hi) hi = g.surface;
        }
      }
      return { clear: worst, mean: sum / n, spread: hi - lo };
    };
    const buildable = (ox: number, oz: number): number => footprint(ox, oz).clear;
    // R47 — A MOUNTAIN STAGE STARTS HIGH. The whole spiral is walked and
    // the highest SHOULDER taken: the site with the most height, less a
    // penalty for every metre its footprint is from level, because a start
    // on a crest with the country falling away under the grid is a start
    // the opening straight cannot be laid from (R34). The biggest value
    // wins, so a country with no shoulder still gets its flattest high
    // ground rather than failing.
    // R49 — ...and the TILT dial asks for the same walk in a country that
    // would not otherwise take it, or for its opposite. Zero is the plain
    // spiral below, so a stage that asks for no tilt in a country that
    // does not start high is sited exactly where it always was.
    const bias = siteBiasOf(knobs);
    if (bias !== 0) {
      let best = { x: 0, z: 0 };
      let bestScore = -Infinity;
      const snowCeiling =
        L.zones.snow === null ? Infinity : L.zones.snow + SHOULDER_OVER_SNOW * altitude.bands;
      // R47 — the crest ceiling is the ground's OWN summit, not the row's
      // amplitude. `L.massif.height` is what the massif contributes before
      // the country's relief and the steepness dial's rise multiply it, and
      // the ground tops out `summit` higher again — so reading it as "the
      // crest" set the ceiling a third of the way down the mountain, and
      // since height counts AGAINST a site past the ceiling, the search was
      // hunting for mid-flank and taking the valley floor when the flank
      // was not level enough. `massifPeak` is the same number the rock is
      // actually built from.
      const ceiling = Math.max(snowCeiling, massifPeak * SHOULDER_OVER_CREST);
      const allowance = SHOULDER_SPREAD;
      // A metre of height buys the same amount of unlevel ground it always
      // did: the height counts at the crest's scale and the spread at the
      // flank's, so the penalty carries the difference between them.
      // R47 — ...and what a metre of it COSTS, against the height it is
      // being traded for. It climbs faster than the mountain does
      // (`massif.altitude.siting`): the taller the country, the more
      // height there is to tempt the site up onto a face, and a start on a
      // face is a stage the search then has to lay down off one.
      const penalty = SHOULDER_PENALTY * Math.pow(altitude.height, R.massif.altitude.siting);
      const reach = siteFar * Math.abs(bias);
      const consider = (ox: number, oz: number): void => {
        const f = footprint(ox, oz);
        if (f.clear < 0) return;
        // Height counts up to the ceiling and against past it, so the
        // best shoulder is the one nearest the snowline from below. The
        // ceiling is a rule about standing a grid in the snow, so it binds
        // a site walking UP and has nothing to say to one walking down.
        const capped = f.mean <= ceiling ? f.mean : ceiling - (f.mean - ceiling);
        // R49 — the BIAS says only WHICH WAY to look. How FAR it looks is
        // what makes the dial graduated (`reach` above): scaling the score
        // does nothing at all, because the best site is the best site
        // whatever the terms are multiplied by, and a dial at a tenth
        // picked exactly the same shoulder as a dial at one. Bounding the
        // WALK is what a gentle setting should mean anyway — a stage that
        // wants a small descent starts on the high ground NEARBY, not on
        // the best shoulder in the county.
        const height = bias > 0 ? capped : -f.mean;
        const score = height - penalty * Math.max(0, f.spread - allowance);
        if (score > bestScore) {
          bestScore = score;
          best = { x: ox, z: oz };
        }
      };
      consider(0, 0);
      for (let radius = siteStep; radius <= reach; radius += siteStep) {
        const points = Math.max(6, Math.round((2 * Math.PI * radius) / siteStep));
        for (let a = 0; a < points; a++) {
          const angle = (a / points) * Math.PI * 2;
          consider(radius * Math.cos(angle), radius * Math.sin(angle));
        }
      }
      if (bestScore > -Infinity) return best;
    }
    let best = { x: 0, z: 0 };
    let bestClear = buildable(0, 0);
    if (bestClear >= 0) return best;
    // A spiral of whole steps: rings of increasing radius, each walked in
    // the same fixed order, so the first site that passes is a property of
    // the country alone.
    for (let radius = siteStep; radius <= siteFar; radius += siteStep) {
      const points = Math.max(6, Math.round((2 * Math.PI * radius) / siteStep));
      for (let a = 0; a < points; a++) {
        const angle = (a / points) * Math.PI * 2;
        const ox = radius * Math.cos(angle);
        const oz = radius * Math.sin(angle);
        const clear = buildable(ox, oz);
        if (clear >= 0) return { x: ox, z: oz };
        if (clear > bestClear) {
          bestClear = clear;
          best = { x: ox, z: oz };
        }
      }
    }
    return best;
  })();

  const groundAt = (x: number, z: number): GroundSample => rawGround(x + site.x, z + site.z);
  const surfaceAt = (x: number, z: number): number => finish(x + site.x, z + site.z).surface;

  return {
    groundAt,
    surfaceAt,
    soilAt: (x, z) => finish(x + site.x, z + site.z).soil,
    wetAt: (x, z) => {
      const g = groundAt(x, z);
      return Math.max(0, g.table - g.surface);
    },
    wetlandAt: (x, z) => {
      const depth = LAKE_Y - surfaceAt(x, z);
      if (depth <= 0) return { kind: "dry", depth: 0 };
      return { kind: depth < G.pits.swamp ? "swamp" : "lake", depth };
    },
    smoothness,
    sharpAt: (x, z) => finish(x + site.x, z + site.z).sharp,
  };
}
