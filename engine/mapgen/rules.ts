// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stage generator's RULE BOOK. Every constraint that keeps a generated
// stage inside "rally reality" lives here as data, separate from the
// generator's search loop (generate.ts), so tuning the vocabulary never
// touches the algorithm and the tests can assert directly against the rules.
//
// The rules, in prose (each is enforced in generate.ts or realized in
// compile.ts, and asserted in tests/mapgen_test.ts):
//
//   R1  A stage opens with a straight — a start grid plus room to build speed.
//   R2  A finite stage closes with a straight — a visible finish, no blind
//       final turn. (An endless stage never closes.)
//   R3  Turns come in three severities with distinct radius/angle
//       vocabularies: soft (fast, open), medium (a real corner), and hard
//       (slow, tight — up to hairpin).
//   R4  A hard turn only follows a straight: there is always a braking zone.
//   R5  At most two consecutive same-direction turns — no endless spirals.
//   R6  Jumps sit on straights, with a clear run-up before the lip and a
//       landing zone after it; jumps keep a minimum spacing between lips.
//   R7  Water (a ford) sits on straights only, never in the landing zone of
//       a jump, and never on the opening or closing straight.
//   R8  Crests (blind brows) sit on straights and never combine with a jump
//       or a ford on the same segment.
//   R9  A finite stage's centerline stays inside its length's world bounds;
//       when the stage nears the boundary the generator must turn back
//       toward the middle. (An endless stage roams an unbounded world.)
//   R10 The centerline never crosses itself — non-adjacent parts of the
//       stage keep at least `minSelfDistance` between them. On an endless
//       stage the guarantee covers the trailing `endless.tailWindow` meters:
//       road further back than that is long gone behind the car.
//   R11 Total stage length lands inside the selected stage length's band.
//   R12 A ford sits in a dip: the road eases down to FLAT water and climbs
//       back out. Water never stands on a rise — it collects at a local low
//       point, fed by the stream that crosses the road there.

export type TurnSeverity = "soft" | "medium" | "hard";
export type SegmentFeature = "none" | "jump" | "water" | "crest";

/** The menu's stage lengths. The finite ones map to a length band sized for
 * the target minutes at measured bot pace; `endless` streams new sections
 * from the seed for as long as the run lasts. */
export type StageLength = "short" | "medium" | "long" | "xlong" | "endless";
export type FiniteStageLength = Exclude<StageLength, "endless">;

export const STAGE_RULES = {
  /** R11 — the length bands, meters, and the world half-extent (R9) each is
   * searched inside. Bands are sized from the sim's measured bot pace
   * (~95–105 km/h on the current vocabulary) so the menu's minutes come out
   * roughly true: 1 / 3 / 5 / 7 minutes of driving. Bigger stages get a
   * bigger world so the search folds the line instead of fighting the
   * boundary. */
  stageLengths: {
    short: { minutes: 1, band: { min: 1450, max: 1800 }, worldBound: 900 },
    medium: { minutes: 3, band: { min: 4400, max: 5200 }, worldBound: 1500 },
    long: { minutes: 5, band: { min: 7400, max: 8400 }, worldBound: 2000 },
    xlong: { minutes: 7, band: { min: 10400, max: 11800 }, worldBound: 2500 },
  },

  /** The endless stage: sections stream ahead of the car forever. `horizon`
   * is how much compiled road is kept ahead of the car; `tailWindow` is how
   * far back the self-distance guarantee (R10) reaches — road behind that is
   * out of sight and out of the search's memory, which is what lets the
   * stream run in a bounded working set. */
  endless: {
    horizon: 700,
    tailWindow: 1200,
    /** How much road the very first compile materializes, meters — enough
     * that the grid never sees the world being built. */
    initial: 1100,
    /** The stream is point-to-point: it follows a course bearing that
     * random-walks by up to `courseDrift` radians per segment, and the
     * road's heading stays within `maxCourseError` of it (turns that would
     * stray further are steered back). That forward pull is what keeps an
     * unbounded walk from curling into its own tail — and what makes an
     * endless run read as a journey rather than a scribble. The error
     * budget still clears a 150° hairpin. */
    courseDrift: 0.12,
    maxCourseError: 2.6,
    /** How far the search runs ahead of the road it hands out. Only plans
     * this far behind the generation frontier are final; inside the lag the
     * stream may still backtrack out of a pocket, exactly like the finite
     * search — the one escape hatch an infinite road cannot live without. */
    commitLag: 900,
  },

  /** R1/R2 — opening and closing straights, meters. */
  openingStraight: 110,
  closingStraight: 80,

  /** Straight vocabulary, meters. Short breathers between corners are the
   * norm; the long bucket is where the top gears live, drawn less often so
   * the stage reads as corners connected by straights rather than the other
   * way around. */
  straightShort: { min: 30, max: 70 },
  straightLong: { min: 100, max: 190 },
  longStraightChance: 0.4,

  /** R3 — turn vocabulary: radius in meters, angle in radians. Soft turns
   * are taken flat-out or near it; mediums are real corners that ask for a
   * lift and a line; hards are the drift moments — down to proper hairpins
   * (the angle ceiling is ~150°). */
  turn: {
    soft: {
      radius: { min: 55, max: 100 },
      angle: { min: Math.PI / 6, max: Math.PI / 2.4 },
    },
    medium: {
      radius: { min: 32, max: 55 },
      angle: { min: Math.PI / 4.5, max: Math.PI / 1.6 },
    },
    hard: {
      radius: { min: 13, max: 30 },
      angle: { min: Math.PI / 3.2, max: Math.PI * 0.85 },
    },
  },

  /** Severity mix for a drawn turn. Hard needs the braking zone a preceding
   * straight provides (R4); when the previous segment is a turn, the hard
   * share re-rolls as medium so the corner density survives without an
   * unbrakeable ambush. The remainder is soft. */
  severityChance: { hard: 0.45, medium: 0.32 },

  /** R5 — cap on same-direction turns in a row, and on how much heading a
   * same-direction run may accumulate. The angle cap kills near-loops
   * before the self-distance probe has to: two tight turns summing much
   * past a half circle curl the line back onto itself, which R10 would
   * reject anyway after the geometry is built and probed. */
  maxSameDirectionTurns: 2,
  maxSameDirectionAngle: Math.PI * 1.15,

  /** Road width, meters (full width, centerline to edge is half). Broad,
   * Sega Rally style — the road is a boulevard through the landscape. */
  roadWidth: 16,

  /** Rolling elevation, laid under the feature ramps: seeded value NOISE
   * summed over a few octaves along arc length, so no two hills on a stage
   * are the same shape and none of them repeat. Sine layers do repeat —
   * every rise identical to the last — and a layer shorter than a few dozen
   * meters is not a hill at all but a washboard, a grade that flips sign
   * every ripple across a road sampled every 2 m. Hence: one amplitude, one
   * length, and octaves that only ever get SMALLER than it. Per-stage
   * character is drawn from these ranges, so a seed can be near-flat or
   * genuinely hilly. Applied to GENERATED stages only — synthetic test
   * tracks stay flat rigs. */
  elevation: {
    /** Height of the longest wave, meters (peak to trough is twice this). */
    amplitude: { min: 3, max: 7 },
    /** Length of that longest wave, meters. */
    wavelength: { min: 450, max: 750 },
    /** How many further octaves ride under it, each half as long... */
    octaves: 4,
    /** ...and this much of the amplitude. Well under 0.5, so the shorter the
     * wave the gentler its grade — that is what keeps the road rolling
     * rather than rippling. */
    roughness: { min: 0.28, max: 0.38 },
  },

  /** R6 — jump placement. */
  jump: {
    minStraight: 90, // segment must be at least this long to carry a lip
    runUp: 35, // meters of straight before the lip
    landing: 50, // meters of straight after the lip
    minSpacing: 200, // meters of stage between two lips
    lipHeight: { min: 1.4, max: 2.4 },
    rampLength: { min: 10, max: 16 },
  },

  /** R7/R12 — ford placement and the dip it sits in. The apron is the
   * carved approach on each side: the road eases down from the rolling
   * grade to the flat water over this many meters, and the water surface
   * sits `bedDepth` below the lowest surrounding grade — a stream bed, not
   * a puddle on a hilltop. Water keeps at least an apron's distance from
   * both segment ends so the whole dip lives on its own straight. */
  water: {
    minStraight: 100,
    length: { min: 8, max: 16 },
    clearAfterJump: 50, // meters past a lip before water may start
    apron: 30,
    bedDepth: 0.5,
  },

  /** R8 — crest placement. A blind brow is a long, gentle rise that hides
   * what is past it, not a ramp: the height/length ratio here keeps its
   * steepest grade around 13%, in the same band as the rolling ground it
   * sits on. */
  crest: {
    minStraight: 70,
    height: { min: 1.2, max: 2.6 },
    length: { min: 60, max: 100 },
  },

  /** R9 — soft margin inside the world bound where turn-back kicks in: at
   * least `min` meters, growing with the world (`frac` of the bound) so a
   * long stage starts circulating well before it can drive itself into a
   * corner it then has to backtrack out of. (The bound itself is per stage
   * length, `stageLengths[*].worldBound`.) */
  boundMargin: { min: 240, frac: 0.18 },

  /** R10 — minimum distance between non-adjacent centerline points. */
  minSelfDistance: 30,

  /** Feature probabilities per eligible straight. */
  featureChance: { jump: 0.4, water: 0.35, crest: 0.3 },

  /** Chance the next segment is a turn rather than a straight. */
  turnChance: 0.72,
} as const;

export type SegmentPlan = {
  kind: "straight" | "turn";
  /** Arc length of the segment, meters. */
  length: number;
  /** Turn-only: rotation sense of the heading walk; +1 grows the heading
   * (which the chase cam reads as a LEFT turn — the rendered world mirrors
   * the engine's map view). */
  dir?: 1 | -1;
  /** Turn-only: radius in meters. */
  radius?: number;
  /** Turn-only: severity bucket the radius/angle were drawn from. */
  severity?: TurnSeverity;
  feature: SegmentFeature;
  /** Feature geometry offsets within the segment, meters from its start. */
  featureStart?: number;
  featureEnd?: number;
  /** Jump-only: lip height in meters. */
  lipHeight?: number;
  /** Crest-only: brow height in meters. */
  crestHeight?: number;
};
