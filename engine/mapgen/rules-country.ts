// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DIALS READ. Every rule in the book is a fixed number or a band; these
// are the functions that turn a dial position into the number a rule is
// actually applied at — the difficulty multiplier and its skew (R46), the
// altitude scale a mountain country is built at (R47), the country row the
// dials leave behind (`landOf`), and the road's own width, relief, grade and
// lag. Everything downstream asks HERE rather than reading a band and
// scaling it itself, so a dial means the same thing everywhere.

import { biomeRules, type BiomeLand } from "./biomes.ts";
import { STAGE_RULES } from "./rules-book.ts";
import {
  clamp01,
  DEFAULT_KNOBS,
  knobScale,
  type FiniteStageLength,
  type StageKnobs,
} from "./rules-knobs.ts";

/** R46 — the difficulty dial as a MULTIPLIER on a rule's own number, read
 * off a `{ easy, hard }` pair: `easy` is the factor at the bottom of the
 * dial, `hard` the factor at the top, and the dial's REST POSITION is
 * exactly 1 — returned as the literal, not arrived at by arithmetic, so
 * every stage the generator has ever built is bit for bit the stage it
 * was. */
export function challengeMul(challenge: number, band: { easy: number; hard: number }): number {
  const mid = DEFAULT_KNOBS.challenge;
  if (challenge === mid) return 1;
  return challenge > mid
    ? 1 + ((challenge - mid) / (1 - mid)) * (band.hard - 1)
    : 1 + ((mid - challenge) / mid) * (band.easy - 1);
}

/** R47 — the ALTITUDE dial as a MULTIPLIER on a mountain country's crest
 * height (`STAGE_RULES.massif.altitude`). `challengeMul`'s shape, read
 * GEOMETRICALLY rather than linearly: the dial's default hands back
 * exactly 1 — so the country the alpine's row was written for is the
 * country an un-dialled seed still gets — and each end is approached by a
 * constant RATIO per notch of travel rather than a constant number of
 * metres. That is what a dial spanning forty-six times its own bottom
 * needs: read linearly, the whole of the low country would live in the
 * first two per cent of the thumb's travel and every position after it
 * would be a mountain.
 *
 * The exponents on the same multiplier — the ridge period, the elevation
 * bands, the earthworks — are the caller's, and every one of them is a
 * `Math.pow` of what comes back here. */
export function altitudeMul(altitude: number): number {
  const mid = DEFAULT_KNOBS.altitude;
  const A = STAGE_RULES.massif.altitude;
  if (altitude === mid) return 1;
  return altitude > mid
    ? Math.pow(A.up, (altitude - mid) / (1 - mid))
    : Math.pow(A.down, (mid - altitude) / mid);
}

/** R46 — the difficulty dial as a SKEW on a 0..1 roll that is about to be
 * read onto a band. `pull` says which end of that band a hard dial leans
 * the draw toward (positive the top, negative the bottom) and how hard it
 * leans; at rest the roll is handed straight back, so the dice decide the
 * stage exactly as they always have.
 *
 * A skew rather than a narrowed band on purpose: the band is the RULE, and
 * a savage stage is one that keeps rolling the corners the rule already
 * allowed, not one built out of a vocabulary nothing else has been
 * measured against. */
export function challengeSkew(u: number, challenge: number, pull: number): number {
  const mid = DEFAULT_KNOBS.challenge;
  if (challenge === mid || pull === 0) return u;
  const lean = ((challenge - mid) / (challenge > mid ? 1 - mid : mid)) * pull;
  return lean > 0 ? u ** (1 / (1 + lean)) : u ** (1 - lean);
}

/** R21/R46 — HOW WIDE THE ROAD IS, once both dials that decide it have had
 * their say. Stated once and read by the search, the compiler and the
 * streams alike: a road the search keeps its clearances off and a road the
 * compiler builds have to be the same road, and the only way to be sure of
 * that is for neither of them to work it out.
 *
 * Clamped back into `roadWidth`, because that band is not a preference —
 * the kerbs, the verge and the clearances are all sized off its ends. */
export function roadWidthOf(knobs: StageKnobs): number {
  const R = STAGE_RULES;
  const width =
    knobScale(knobs.width, R.roadWidth) * challengeMul(knobs.challenge, R.challenge.width);
  return Math.min(R.roadWidth.max, Math.max(R.roadWidth.min, width));
}

/** R34/R46 — how high the country stands its relief, as the DIALS decide
 * it: the `elevation` knob over its band, and what the difficulty dial
 * makes of that. The country's own share (`BiomeLand.relief`) is the
 * caller's to multiply in — a desert is a worn place whatever either dial
 * says. */
export function reliefOf(knobs: StageKnobs): number {
  return (
    knobScale(knobs.elevation, STAGE_RULES.elevation.knob) *
    challengeMul(knobs.challenge, STAGE_RULES.challenge.relief)
  );
}

/** R47 — THE COUNTRY AT THIS ALTITUDE: the biome's own land row with
 * everything the ALTITUDE dial reaches already read onto it, so that
 * every side of the world — the geology that builds the rock, the search
 * that lays the road on it, the compiler, the terrain, the paint, the
 * planting and the audio — asks one function how high this country stands
 * and gets one answer. A caller reading `biomeRules(knobs.biome).land`
 * directly is reading the country the row was WRITTEN for rather than the
 * one the dial built, which is the same country only at the dial's
 * default.
 *
 * Four things move together, and they have to: the crest's HEIGHT, the
 * ground it stands on (`scale`, more slowly, which is what makes a high
 * mountain a steep one), the elevation BANDS the paint and the planting
 * read (more slowly still, so a taller mountain has more of itself above
 * the treeline rather than being a taller picture of the same one), and
 * the EARTHWORKS a road may be built on, which track the flank's grade
 * because that is what a cut is paying for. A country with no massif has
 * no altitude to dial and is handed back untouched.
 *
 * Memoized on the two dials it reads, because the paint asks it per
 * ground cell: a fresh row per query is an allocation in the hot path and
 * the answer cannot change while the pair is the same. */
const LAND_CACHE = new Map<string, BiomeLand>();

/** R47 — WHAT THE ALTITUDE DIAL MULTIPLIES, all four factors at once and
 * derived in one place, because they are one idea seen from four sides and
 * a caller that re-derives `Math.pow(mul, …)` for itself is a caller that
 * will still be raising the old exponent after somebody moves it.
 *
 * A country with no massif has no altitude to dial, and every factor is 1.
 */
export type AltitudeScale = {
  /** The crest's HEIGHT over its valley floor. The dial itself. */
  height: number;
  /** The GROUND it stands on — the ridge system's period. Grows more
   * slowly than the height, which is the whole trick. */
  ground: number;
  /** …so the flank's GRADE is what is left over, and it is what makes a
   * high mountain a sheer one. Read by everything that has to survive the
   * slope rather than draw it: the earthworks a road is built on, and how
   * far from level a start's footprint is allowed to come out. */
  grade: number;
  /** The elevation BANDS — the treeline, the rock, the snowline, and the
   * air's lapse rate read against them. Slower again than the height. */
  bands: number;
  /** HOW FAR THE SUMMIT HAS BEEN CUT INTO A SHELF, 0 (the flank the row
   * describes, running to a point) to 1 (a ledge across the top with the
   * mountain falling away either side of it). 0 at and below the dial's
   * default, so the tuned country is untouched. */
  shelf: number;
  /** R47 — HOW HIGH THE COUNTRY ITSELF STANDS, m above the sea. The half
   * of the dial's travel that is NOT relief inside the stage's box: the
   * bands, the air and what the slider prints all read it, and no geometry
   * does. See `massif.altitude.reliefCap` for why the travel splits. */
  base: number;
  /** What is left of the massif's flank after the valley floor has taken
   * its share (`BiomeLand.massif.valley`), as a fraction of the tuned
   * country's: under 1, so the same ridge holds a wider floor and a
   * narrower — and therefore steeper again — flank. */
  flank: number;
};

export function altitudeScale(knobs: StageKnobs): AltitudeScale {
  const M = biomeRules(knobs.biome).land.massif;
  if (M === null) {
    return { height: 1, ground: 1, grade: 1, bands: 1, shelf: 0, flank: 1, base: 0 };
  }
  const A = STAGE_RULES.massif.altitude;
  // R47 — THE DIAL'S TRAVEL SPLITS. Everything the slider prints is still
  // `altitudeMul`; what changes is where it goes. Up to `reliefCap` it is
  // RELIEF — the massif's own amplitude inside the stage's box — and past
  // that it lifts the whole country instead, as metres above the sea that
  // no geometry ever reads.
  const full = altitudeMul(knobs.altitude);
  const height = Math.min(full, A.reliefCap);
  const base = M.height * A.summit * (full - height);
  const ground = Math.pow(height, A.spread);
  const flank = 1 / Math.pow(height, A.valleyPull);
  return {
    height,
    ground,
    grade: height / (ground * flank),
    // The BANDS are absolute lines — a snowline is a height above the sea,
    // not above whatever valley happens to be under it — so they read the
    // whole of the dial and `landOf` subtracts the base off them.
    bands: Math.pow(full, A.zones),
    // How far the summit has been cut into a SHELF, 0 (the row's own
    // flank, all the way to a point) to 1 at the relief cap. Nothing below
    // the dial's default: a mountain smaller than the tuned one is the
    // tuned one, and only a big one gets a ledge blasted across it.
    shelf: clamp01(Math.log(Math.max(height, 1)) / Math.log(A.reliefCap) / A.plateau),
    flank,
    base,
  };
}

/** R40/R47 — THE COUNTRY THE DIALS BUILT: the biome's own land row with
 * everything the ALTITUDE and DUNE dials reach already read onto it, so
 * that every side of the world — the geology that builds the rock, the
 * search that lays the road on it, the compiler, the terrain, the paint,
 * the planting and the audio — asks one function what this country is and
 * gets one answer. A caller reading `biomeRules(knobs.biome).land`
 * directly is reading the country the row was WRITTEN for rather than the
 * one the dials built, which is the same country only at their defaults.
 *
 * Five things move together under the ALTITUDE dial, and they have to: the
 * crest's HEIGHT, the GROUND it stands on, how hard the flank is BENT
 * about that crest, how much of the country between the ridges is VALLEY
 * FLOOR, and the elevation BANDS the paint and the planting read.
 * `massif.altitude` says what each of them is worth and why. The DUNE dial
 * moves the sand the same way and for the same reason (`dunesAt`). A
 * country with neither a massif nor sand is handed back untouched, and so
 * is one whose dials are both at rest.
 *
 * `earthworks` is deliberately NOT among them. A shelf road on a face is
 * paid for by CUT and only by cut, and the two halves of that row do not
 * scale together: `generate.ts` opens the cut with the flank's grade,
 * while the FILL stays exactly where the taiga measured it. A hundred
 * metres of fill is not an embankment, it is a mesa with a vertical side
 * and a road along the top of it — the thing R34's cap was written to
 * refuse — and a flank is the one place in the game where the search can
 * ask for one on nearly every candidate it draws.
 *
 * Memoized on the dials it reads, because the paint asks it per ground
 * cell: a fresh row per query is an allocation in the hot path, and the
 * answer cannot change while they are the same. */
export function landOf(knobs: StageKnobs): BiomeLand {
  const land = biomeRules(knobs.biome).land;
  const M = land.massif;
  const A = altitudeScale(knobs);
  const dunes = dunesAt(land.dunes, knobs.dunes);
  // Any dial at rest hands the ROW ITSELF back, not a copy of it built out
  // of multiplications by one: `1 - (1 - 0.3) * 1` is 0.30000000000000004,
  // and a country that differs from its own row in the last bit of a float
  // is a country whose seeds differ from the ones the game shipped.
  if (A.height === 1 && A.base === 0 && dunes === land.dunes) return land;
  const key = `${knobs.biome}|${knobs.altitude}|${knobs.dunes}`;
  const had = LAND_CACHE.get(key);
  if (had) return had;
  const Z = land.zones;
  // A country is RAISED when the altitude dial moved either half of its
  // travel — the crest's own height, or the datum under it. A dune dial
  // alone moves neither, so a desert never rebuilds a massif it has not got.
  const raised = M !== null && (A.height !== 1 || A.base !== 0);
  // R47 — the bands are ABSOLUTE lines the country is then raised THROUGH.
  // `bands` stretches the row's treeline, rock line and snowline up to
  // where the real Alps put them, and the base is subtracted off, so what
  // the rest of the engine reads is each line as a height in the stage's
  // own coordinates. A country standing above its own snowline gets a
  // NEGATIVE line, which is the correct answer and reads as "all of it is
  // above the snow" everywhere the lines are compared against ground.
  const line = (v: number): number => v * A.bands - A.base;
  const built: BiomeLand = {
    ...land,
    dunes,
    massif:
      M === null || !raised
        ? M
        : {
            ...M,
            height: M.height * A.height,
            scale: M.scale * A.ground,
            valley: 1 - (1 - M.valley) * A.flank,
          },
    zones: !raised
      ? Z
      : {
          treeline: line(Z.treeline),
          rock: { from: line(Z.rock.from), to: line(Z.rock.to) },
          snow: Z.snow === null ? null : line(Z.snow),
        },
  };
  LAND_CACHE.set(key, built);
  return built;
}

/** R40 — THE DUNE FIELD AT THIS POSITION OF THE DUNE DIAL. The row itself
 * at the dial's rest, so a desert seed nobody has dialled is the desert the
 * row describes; null at the bottom, because a country with no sand in it
 * has no dune field rather than a flat one; and otherwise the same field
 * built at a new size — the height the dial asks for, with the period
 * across the wind and the erg it lies in grown under `dunes.spread` so the
 * faces stay under the angle of repose (`STAGE_RULES.dunes`).
 *
 * The period has a FLOOR under it and the height does not: a dial near the
 * bottom asks for low sand, and low sand drawn at a proportionately short
 * period is a washboard on the drawn lattice rather than a landscape. */
function dunesAt(row: BiomeLand["dunes"], dial: number): BiomeLand["dunes"] {
  if (row === null) return null;
  // The rest position hands the ROW back on the DIAL, not on the metres it
  // reads onto: `100 * 0.22` is 22.000000000000004, so a country compared
  // on its height would rebuild itself out of a ratio of one and differ
  // from its own row in the last bit of a float.
  if (dial === DEFAULT_KNOBS.dunes) return row;
  const D = STAGE_RULES.dunes;
  const amp = knobScale(dial, D.height);
  if (amp <= 0) return null;
  const grow = Math.pow(amp / row.amp, D.spread);
  return {
    amp,
    scale: Math.max(D.floor, row.scale * grow),
    stretch: row.stretch,
    field: Math.max(D.floor, row.field * grow),
  };
}

/** R40 — ...and HOW HIGH THE SAND STANDS, m: what the DUNE row prints, and
 * the one number the dial is really about. A full-grown dune over the
 * trough beside it, where the erg is deepest — most of the country is
 * lower. 0 in a country the wind has never had sand to pile in, which is
 * what "there are no dunes here" reads as on a row that is not offered
 * there anyway. */
export function duneHeightOf(knobs: StageKnobs): number {
  const D = landOf(knobs).dunes;
  return D === null ? 0 : D.amp;
}

/** R47 — ...and HOW HIGH THE MOUNTAIN TOPS OUT over its valley floor, m.
 * What the ALTITUDE row prints, and the one number the dial is really
 * about. The massif's own amplitude read through `massif.altitude.summit`,
 * which is the measured distance between that figure and the ground the
 * country actually stands at once its relief, its rise and the swell and
 * hills on top of it are in. 0 in a country with no massif, which is what
 * "there is no mountain here" reads as on a row that is not offered there
 * anyway. */
export function altitudeOf(knobs: StageKnobs): number {
  const M = landOf(knobs).massif;
  if (M === null) return 0;
  // R47 — the country's own height above the sea, plus the mountain
  // standing on it. Below the relief cap the base is 0 and this is exactly
  // the crest over the valley floor, as it always was.
  return altitudeScale(knobs).base + M.height * STAGE_RULES.massif.altitude.summit;
}

/** R47 — how fast the air cools with height in this country, °C per metre.
 * The climate's own rate at the dial's default, divided by the same factor
 * the elevation bands were multiplied by: the freezing line is a height
 * like the treeline and the snowline are, and a country whose bands have
 * been stretched up a mountain with its frost line left where it was is a
 * country whose road is snow a long way under its own snowline. Scaling
 * them together is what keeps a cold dial meaning the same thing at every
 * position of this one. */
export function lapseOf(knobs: StageKnobs, base: number): number {
  return base / altitudeScale(knobs).bands;
}

/** R34/R47 — the grade the road may follow the country at in this
 * country: the rule book's, times the biome's own multiplier. Stated once
 * because two walks read it — the compiler's, which builds the road, and
 * the search's, which judges the line — and a road judged at one grade
 * and built at another is a road that stands off the land it was passed
 * on. */
export function followGradeOf(knobs: StageKnobs): number {
  return STAGE_RULES.elevation.follow.grade * biomeRules(knobs.biome).land.grade;
}

/** R34/R40 — ...and HOW FAR BEHIND THE COUNTRY the road is allowed to run
 * in it, m (`BiomeLand.lag`). Stated beside the grade and read by the same
 * two walks for the same reason: the road the search judges and the road
 * the compiler builds have to be one road, and a trial that smooths the
 * country over a different window from the build is a trial that accepts
 * lines the build cannot lay.
 *
 * It is the lag rather than the grade that decides whether a road RIDES a
 * landscape — the filter levels away anything shorter than its window, so
 * a country whose shape is finer than the lag arrives at the road as a
 * flat. The two are tuned together (`BiomeLand.lag`). */
export function followLagOf(knobs: StageKnobs): number {
  return STAGE_RULES.elevation.follow.lag * biomeRules(knobs.biome).land.lag;
}

/** R35/R49 — WHICH WAY THE ORIGIN LOOKS for its site, -1..1. Above zero it
 * walks to the highest level shoulder it can find, so the stage runs DOWN
 * off it; below zero to the lowest ground it can start on, so the stage
 * climbs; and the magnitude is how much height it is willing to trade for
 * level ground to put a grid on.
 *
 * The country's own appetite (`BiomeLand.startHigh` — a mountain stage
 * comes down a mountain, R47) plus the TILT dial's, clamped to the travel.
 * At the middle of the dial a country that does not start high gets
 * exactly zero, which is R35's plain spiral and the site every seed has
 * always had. */
export function siteBiasOf(knobs: StageKnobs): number {
  const country = biomeRules(knobs.biome).land.startHigh ? 1 : 0;
  const bias = country + (knobs.tilt - 0.5) * 2;
  return bias < -1 ? -1 : bias > 1 ? 1 : bias;
}

/** R22 — the band ONE LAP of a circuit is searched inside: the sprint band
 * for the same stage length divided by the laps it is raced over, so a
 * "medium" circuit is the same three minutes of driving a medium sprint is.
 * The floor is what stops the short band collapsing into a roundabout. */
export function circuitLapBand(length: FiniteStageLength): { min: number; max: number } {
  const band = STAGE_RULES.stageLengths[length].band;
  const { laps, minLap } = STAGE_RULES.circuit;
  return { min: Math.max(minLap, band.min / laps), max: Math.max(minLap * 1.3, band.max / laps) };
}
