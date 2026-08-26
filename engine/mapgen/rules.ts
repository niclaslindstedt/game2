// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stage generator's RULE BOOK. Every constraint that keeps a generated
// stage inside "rally reality" lives here as data, separate from the
// generator's search loop (generate.ts), so tuning the vocabulary never
// touches the algorithm and the tests can assert directly against the rules.
//
// The rules, in prose (each is enforced in generate.ts and asserted in
// tests/mapgen_test.ts):
//
//   R1  A stage opens with a straight — a start grid plus room to build speed.
//   R2  A stage closes with a straight — a visible finish, no blind final turn.
//   R3  Turns come in two severities with distinct radius/angle vocabularies:
//       soft (fast, open) and hard (slow, tight — up to hairpin).
//   R4  A hard turn only follows a straight: there is always a braking zone.
//   R5  At most two consecutive same-direction turns — no endless spirals.
//   R6  Jumps sit on straights, with a clear run-up before the lip and a
//       landing zone after it; jumps keep a minimum spacing between lips.
//   R7  Water (a ford) sits on straights only, never in the landing zone of
//       a jump, and never on the opening or closing straight.
//   R8  Crests (blind brows) sit on straights and never combine with a jump
//       or a ford on the same segment.
//   R9  The whole centerline stays inside the world bounds; when the stage
//       nears the boundary the generator must turn back toward the middle.
//   R10 The centerline never crosses itself — non-adjacent parts of the
//       stage keep at least `minSelfDistance` between them.
//   R11 Total stage length lands inside [minStageLength, maxStageLength].

export type TurnSeverity = "soft" | "hard";
export type SegmentFeature = "none" | "jump" | "water" | "crest";

export const STAGE_RULES = {
  /** R11 — target stage length, meters. Sized for cars that cruise past
   * 150 km/h: stages long enough that pace has somewhere to live. */
  minStageLength: 1600,
  maxStageLength: 2600,

  /** R1/R2 — opening and closing straights, meters. */
  openingStraight: 110,
  closingStraight: 80,

  /** Straight vocabulary, meters — long enough to reach the top gears. */
  straightShort: { min: 40, max: 80 },
  straightLong: { min: 110, max: 240 },

  /** R3 — turn vocabulary: radius in meters, angle in radians. Soft turns
   * are sized to be taken flat-out or near it at speed; hard turns stay
   * tight — they are the drift moments. */
  turn: {
    soft: {
      radius: { min: 60, max: 115 },
      angle: { min: Math.PI / 6, max: Math.PI / 2.6 },
    },
    hard: {
      radius: { min: 15, max: 34 },
      angle: { min: Math.PI / 3.4, max: Math.PI / 1.5 },
    },
  },

  /** R5 — cap on same-direction turns in a row. */
  maxSameDirectionTurns: 2,

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

  /** R7 — ford placement. */
  water: {
    minStraight: 60,
    length: { min: 8, max: 16 },
    clearAfterJump: 50, // meters past a lip before water may start
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

  /** R9 — world half-extent, meters; soft margin where turn-back kicks in. */
  worldBound: 1100,
  boundMargin: 240,

  /** R10 — minimum distance between non-adjacent centerline points. */
  minSelfDistance: 30,

  /** Feature probabilities per eligible straight. */
  featureChance: { jump: 0.4, water: 0.3, crest: 0.3 },

  /** Chance a chosen turn is hard (when a braking zone precedes it). */
  hardTurnChance: 0.4,

  /** Chance the next segment is a turn rather than a straight. */
  turnChance: 0.62,
} as const;

export type SegmentPlan = {
  kind: "straight" | "turn";
  /** Arc length of the segment, meters. */
  length: number;
  /** Turn-only: +1 turns left, -1 turns right (seen from above). */
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
