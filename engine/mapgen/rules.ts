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
//   R13 A water crossing too wide to wade carries a BRIDGE instead of a
//       ford: the road stays level across it, the water runs in a ravine
//       below, and the deck is timber up to `bridge.timberMax` — past that
//       only concrete spans it.
//   R14 The inside of a sharp corner is GUARDED: a turn (or a combination)
//       that bends past `guard.angle` gets the ground between its entry and
//       its exit filled with a steep mound or a dense grove, so cutting
//       across the grass costs more than the corner does.
//   R15 Asphalt comes in RUNS, never a chequerboard: the paving field lays
//       the road down in sections hundreds of meters long, and the knobs'
//       `asphalt` is the share of the stage that comes out paved.
//   R16 The road has a CROSS-SECTION: a crown it sheds water off, two worn
//       wheel tracks, a berm of pushed gravel at its edges, and a shoulder
//       that falls gently away to the landscape. No ditch — a trench beside
//       a rally road is a trap the eye reads as a scar, not as drainage.
//   R17 Roads MEET at a planned junction, ON the centerline: the route turns
//       off (or onto) the road at a real corner, the arm it abandons carries
//       straight on along the corner's tangent and runs off the map, and the
//       ground where the two carriageways overlap is one graded platform —
//       no borders, no markings, one surface, one plane.
//   R19 Turns are BANKED. A road built through a corner is superelevated so
//       water and cars both stay on it: the cross-fall rolls from the crown
//       into the turn over a runoff, tops out at `bank.max` for the
//       surface, and rolls back out again. Never a wall of a bank — this is
//       a country road, not a speedway.
//   R20 A JUMP never sits on sealed road. A tarmac section is a public road
//       the rally borrows; nobody builds a launch ramp into one.
//   R21 The road's WIDTH is a dial: `knobs.width` runs from a narrow lane
//       the trees crowd to a broad boulevard with room to place the car.
//   R22 A stage is SHAPED as a sprint or as a CIRCUIT. A circuit's last
//       sample lands back on its first, on the same heading, so the start
//       line is also the finish line and the stage can be raced over laps:
//       the line leaves the grid, is steered around a ring by a bearing
//       that turns once through a full circle over the target lap, and is
//       closed onto the grid exactly by a solved turn-straight-turn.
//       Everything else — the vocabulary, R3 through R8, R10's
//       self-distance (measured cyclically), the features — is the sprint's.
//   R23 No two pieces of road share ground. The terrain lays its shelf under
//       ONE road, so a second corridor over the same country is left hanging
//       in the air with nothing under it and nothing to drive on. R10's
//       distance is therefore a floor, not the rule: the rule is `roadClear`,
//       measured centerline to centerline and sized from the road's own
//       width, and it binds the abandoned branches (R17) exactly as it binds
//       the route.
//   R24 The START is a PLACE, not a line: the grid, the APRON of dirt behind
//       it, and `roadClear` of country around both belong to the start. On a
//       sprint the route may not come back into it and no branch may cross
//       it — a road floating over the start is the first thing a run ever
//       sees. A circuit closes onto its own start line by construction
//       (R22), so what it must not do is come at it ACROSS the apron; its
//       closure lies along it.

/** Sample spacing along the compiled centerline, meters. It lives here
 * because it is not only the compiler's business: a search that has to land
 * a road exactly on a point (R22's closure) must walk it the way the
 * compiler will, step for step. */
export const SAMPLE_STEP = 2;

export type TurnSeverity = "soft" | "medium" | "hard";
/** R22 — how a stage is laid out: a sprint runs from a start line to a
 * finish somewhere else; a circuit comes back to where it started, which is
 * what makes laps possible. */
export type StageShape = "sprint" | "circuit";
export type SegmentFeature = "none" | "jump" | "water" | "crest";
/** How a stage crosses water: wade through it, or span it. */
export type Crossing = "ford" | "timber" | "concrete";

/** The generator's DIALS — four numbers, each 0..1, that a player (or the
 * tooling) turns to ask for a different kind of stage. They never break a
 * rule: they move the ranges the rules draw from, and 0.5 on every dial is
 * the stage this generator built before they existed. */
export type StageKnobs = {
  /** How hilly: the rolling road profile's amplitude and the landscape's
   * relief around it. 0 is a plain, 1 is mountain country. */
  elevation: number;
  /** How wet: how often water crosses the road (and how wide, which is
   * what decides ford vs bridge), and how much of the nature is lake. */
  water: number;
  /** How forested: the density of the solid trunk field the car crashes
   * into. 0 is open heath, 1 is closed forest. */
  trees: number;
  /** The share of the road that is asphalt, 0..1 — grip, tighter lines,
   * and tire smoke instead of a gravel plume. */
  asphalt: number;
  /** R21 — how wide the road is, 0..1 across `roadWidth`'s band. 0 is a
   * narrow lane where the line is the only line there is; 1 is a broad
   * boulevard with room to throw the car at a corner and still be on the
   * road when it lands. */
  width: number;
};

/** The default dial positions — the stage the rules built before the knobs
 * existed, so an un-knobbed call keeps its old character. */
export const DEFAULT_KNOBS: StageKnobs = {
  elevation: 0.5,
  water: 0.5,
  trees: 0.5,
  // Sealed road is a guest on a rally stage, not the host: a quarter of it
  // is enough for the tarmac sections to be an event, and the sim says
  // that is about what the stage's drift time can pay for.
  asphalt: 0.25,
  // The width the stage vocabulary — turn radii, the bot's line, the drift
  // tuning — was measured against.
  width: 0.55,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0;
}

/** Fill in and clamp a partial set of dials. Every entry point takes
 * `Partial<StageKnobs>` and runs it through here, so a knob is always a
 * number in 0..1 by the time any rule reads it. */
export function resolveKnobs(knobs?: Partial<StageKnobs>): StageKnobs {
  return {
    elevation: clamp01(knobs?.elevation ?? DEFAULT_KNOBS.elevation),
    water: clamp01(knobs?.water ?? DEFAULT_KNOBS.water),
    trees: clamp01(knobs?.trees ?? DEFAULT_KNOBS.trees),
    asphalt: clamp01(knobs?.asphalt ?? DEFAULT_KNOBS.asphalt),
    width: clamp01(knobs?.width ?? DEFAULT_KNOBS.width),
  };
}

/** Read a knob onto a `{ min, max }` band — the one way a dial ever
 * reaches a rule. */
export function knobScale(knob: number, band: { min: number; max: number }): number {
  return band.min + (band.max - band.min) * knob;
}

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

  /** R22 — the circuit. A lap is the stage length's band divided by the
   * laps a circuit is raced over, so "medium" means the same three minutes
   * of driving whichever shape it is built in — with a floor, because a
   * ring shorter than that is a roundabout and not a race track.
   *
   * The search steers the line around a ring by a bearing that turns once
   * through a full circle over `target` meters (radius `target / 2π`), then
   * CLOSES it: from `closeFrom` of the way round, every iteration tries to
   * solve a turn-straight-turn back onto the grid's own pose. The solve is
   * exact — it lands on the start line to the millimeter — so the only
   * question is whether the corners it asks for are ones this generator
   * would have drawn anyway, which is what `closeRadii` and R3's own angle
   * bands decide. */
  circuit: {
    /** Laps a circuit is raced over, and the divisor the lap band uses. */
    laps: 3,
    /** Shortest lap worth building, m. */
    minLap: 1150,
    /** How far round the ring before the line stops following the ring
     * bearing and starts being steered at the grid itself. The CLOSURE is
     * not gated on this — it is tried wherever one could land inside the
     * band — but a line that never turns for home rarely gives it the
     * chance. */
    homeFrom: 0.7,
    /** How many radii per severity the closure is solved at. The radii
     * themselves come out of `turn` — a closing corner is drawn from the
     * same vocabulary as every other corner (R3), and the solve's job is
     * to find a place on the lap where one of them fits. */
    closeRadii: 3,
    /** The straight between the closure's two arcs. The ceiling is where a
     * circuit gets its MAIN STRAIGHT from — a lap wants one long enough to
     * pull top gear down before the line — and it is also what decides how
     * far from the grid a closure can be solved at all, so it is the one
     * number that says how often a lap manages to shut. Long enough to read
     * as a straight,
     * short enough that the closure is a corner combination and not a
     * runway bolted onto the end of the lap. */
    closeStraight: { min: 25, max: 380 },
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

  /** R21 — road width, meters (full width; centerline to edge is half).
   * The `width` dial reads this band: the low end is a real country lane,
   * where the road is the only line and a corner is a commitment; the high
   * end is an arcade boulevard with room to place the car sideways and
   * still land on tarmac. The default position (0.55) is the width the
   * turn vocabulary and the drift tuning were measured against, so moving
   * the dial changes the stage's character and not its rules. */
  roadWidth: { min: 9, max: 22 },

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
    /** The `elevation` knob multiplies the amplitude by this band — a flat
     * dial still rolls a little (a billiard table is not a rally stage),
     * a full one doubles the hills the road climbs. */
    knob: { min: 0.4, max: 2 },
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
    /** Widest water the wheels may go THROUGH, meters (R13). Anything
     * wider is a river, and a river gets a deck over it — this is the one
     * number that decides which. */
    fordMax: 16,
    clearAfterJump: 50, // meters past a lip before water may start
    apron: 30,
    bedDepth: 0.5,
  },

  /** R13 — the crossings a car cannot wade. A ford is water the wheels go
   * THROUGH; past `fordMax` the water is a river, and a river gets a deck
   * over it. The span decides the architecture: a timber deck is two
   * trunks and a plank floor, which only reaches so far — a wider gap
   * needs concrete piers. The road stays level across the whole deck (a
   * bridge is the one place the rolling profile is switched off) and the
   * water runs `clearance` below it, deep enough to drown a car that
   * misses the parapet. */
  bridge: {
    minStraight: 120,
    /** Span band, meters. The `water` knob decides where in it a crossing
     * lands, so a wet stage gets the big concrete spans. */
    span: { min: 18, max: 52 },
    /** Widest span a timber deck carries; past it, concrete. */
    timberMax: 28,
    /** Level road each side of the deck, meters — the run-on that keeps
     * the approach readable and the deck out of the segment's ends. */
    margin: 20,
    /** Water surface below the deck, meters, per deck kind. */
    clearance: { timber: 3.2, concrete: 5.5 },
    /** How deep the channel is cut below its own surface, m — deeper than
     * TUNING.crash.deepWater, so going over the side is a sinking. */
    depth: 1.8,
    /** Meters past a jump's lip before a deck may start. */
    clearAfterJump: 70,
  },

  /** R14 — the corner guard. A sharp corner whose inside is open grass is
   * not a corner at all: the fast line is straight across it. Every turn
   * combination that bends past `angle` gets its inside filled — a steep
   * mound where there is room for one, a dense grove where there is not.
   * Neither is a wall: a mound can be climbed and a grove threaded, but
   * both cost more than the corner they replace, which is the point. */
  guard: {
    /** Total bend that makes a combination worth cutting, radians. */
    angle: 1.5,
    /** Spacing of guard patches along the shortcut, meters. */
    spacing: 10,
    /** Widest one patch gets, meters. */
    maxRadius: 15,
    /** Clearance a grove keeps from the road EDGE, meters... */
    groveClear: 4,
    /** ...and the wider berth a mound keeps, since its slope reaches out
     * past its crown and must never lift the road's own shelf. */
    moundClear: 9,
    /** Under this radius a patch is not worth building at all, and under
     * `minMoundRadius` it can only ever be a grove, m. */
    minRadius: 2.5,
    minMoundRadius: 7,
    /** Mound height per meter of its radius, and the ceiling — a mound is
     * always steep enough that climbing it beats nothing. */
    rise: 0.9,
    maxHeight: 18,
  },

  /** R15 — the paving field. The stage ALTERNATES: a run of gravel, a run
   * of asphalt, a run of gravel. `run` is how long one sealed section is,
   * meters — long, because what the tarmac has to read as is a road the
   * rally borrows for a while (R17) and not a chequerboard — and the
   * gravel between two of them is stretched to whatever makes
   * `knobs.asphalt` the share of the stage that comes out sealed, inside
   * `gap`. Under `floor` the dial means none at all: one short section of
   * tarmac in a seven-kilometer stage is not a feature, it is a mistake. */
  paving: {
    run: { min: 350, max: 800 },
    gap: { min: 260, max: 6000 },
    floor: 0.03,
    /** R17 — a surface change is a JUNCTION, and a junction is a place
     * where one road meets another, not a place where two roads dissolve
     * into each other. So the change only ever happens at a CORNER inside
     * this angle band: the route arrives on one road, turns onto the
     * other, and the road it turned off carries straight on past the
     * junction (taped shut). Too shallow a corner and the two roads merge
     * at a glance instead of meeting; too tight and the junction is a
     * hairpin, which is not how roads are laid out either. */
    junctionAngle: { min: Math.PI / 2.8, max: Math.PI * 0.62 },
    /** ...and only at a corner tight enough that the two carriageways
     * actually PART. The route's corner and the arm it abandons share a
     * tangent at the meeting point, so they run over the same ground until
     * the corner has swung the route clear of the main road's mat. Let
     * that take long enough and what the picture shows is two ribbons
     * peeling slowly away from each other — a slip road, not a junction.
     * Measured in road WIDTHS, because how a junction reads is a matter of
     * proportion: a narrow lane may part in fifteen meters and a boulevard
     * take forty, and both look like the same place. */
    junctionParts: 2.4,
  },

  /** R17 — the junction PLATFORM: the graded area where the two roads
   * overlap and become one piece of ground. */
  junction: {
    /** How far from the meeting point the platform reaches, as a multiple
     * of the separation distance the two carriageways need — the whole
     * region where their mats overlap, plus a little. Inside it neither
     * road wears a border, a marking or a camber, and the ground is one
     * plane on the through road's own grade. */
    platform: 0.95,
    /** ...clamped, m, so a junction is a junction and not a car park. */
    reach: { min: 20, max: 40 },
    /** Where the two carriageways have parted by this much, the paving
     * stops and the grass gore between them starts, m. Below it the gap is
     * a seam, not an island, and paving over it is what keeps a junction
     * from ending in a knife edge of grass. */
    goreNose: 7,
  },

  /** R19 — SUPERELEVATION: how far a turn is banked into itself. A road
   * built through a corner is tilted so the outside edge stands proud of
   * the inside; it is what stops the water — and the cars — running off
   * the outside. The rate is read off the turn's radius against
   * `pivotRadius` (a corner twice as tight banks twice as hard, up to the
   * ceiling), and the ceiling itself is a real road's, not a speedway's:
   * a rally car has to be able to stop on it, and a road nobody could park
   * on is a road nobody built. Gravel takes more than tarmac — a graded
   * surface is shaped by the blade every season, and a bladed corner is
   * always banked harder than a paved one. */
  bank: {
    /** Cross-fall ceiling, m per m of road width, per surface. */
    max: { gravel: 0.085, asphalt: 0.055 },
    /** The radius that earns half the ceiling, m — tighter corners bank
     * harder, and the curve flattens off rather than running away. */
    pivotRadius: 42,
    /** Meters of road the cross-fall rolls in and out over. A road does not
     * change its cross-section in a step; the runoff is what makes a banked
     * corner something the car settles into instead of hits. */
    runoff: 34,
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

  /** R10 — floor under the distance between non-adjacent centerline points,
   * m. The distance actually enforced is R23's `roadClear`, which grows with
   * the road: this is only the least it may ever be. */
  minSelfDistance: 30,

  /** R23 — the room a road keeps to itself. `margin` is the bare country
   * left between two corridors' outer LIPS, m; what the rule enforces is
   * that plus both corridors' full reach, so it widens with the `width`
   * dial instead of letting a boulevard-wide stage lay its mats over each
   * other. The margin is the most room that can be asked for without
   * costing the stage vocabulary its tightest folds: the hairpin's two arms
   * are a road's width apart by definition, and pushing this further starts
   * rejecting hard corner combinations instead of crossings (the sim's
   * severity mix is the measurement that says where the line is). */
  roadClear: { margin: 13 },

  /** R24 — the start zone. `apron` is the dirt extrapolated straight past
   * each stage end, m: the run-up before the gate and the run-off past the
   * flying finish. Road is drawn on it, the terrain lays its shelf under it
   * and the physics rides it, so it is stage and it is kept clear like
   * stage. `fromArc` is how far the route has to have travelled before it
   * counts as coming BACK to the start — inside it the road is simply
   * leaving, which is not a violation of anything. */
  startZone: { apron: 30, fromArc: 160 },

  /** Feature probabilities per eligible straight. The water entry is the
   * chance of ANY crossing; the `water` knob scales it and splits it into
   * fords and bridges. */
  featureChance: { jump: 0.4, water: 0.35, crest: 0.3 },

  /** Everything the `water` knob reaches. */
  wet: {
    /** Multiplier on `featureChance.water`: a dry stage fords the odd
     * stream, a wet one meets water every other straight. */
    crossingChance: { min: 0.3, max: 1.8 },
    /** Share of crossings too wide to wade — the ones that get a deck. */
    bridgeShare: { min: 0.15, max: 0.7 },
    /** How far up the bridge span band a stage reaches, 0..1: the dial is
     * what decides whether its rivers need concrete. */
    spanReach: { min: 0.3, max: 1 },
    /** How much of the far landscape sinks under the water table into
     * ponds and lakes — the water the road runs PAST rather than over. */
    ponds: { min: 0, max: 1 },
  },

  /** The `trees` knob multiplies the solid trunk field's density. */
  forest: { density: { min: 0.2, max: 2 } },

  /** Chance the next segment is a turn rather than a straight. */
  turnChance: 0.72,
} as const;

/** R22 — the band ONE LAP of a circuit is searched inside: the sprint band
 * for the same stage length divided by the laps it is raced over, so a
 * "medium" circuit is the same three minutes of driving a medium sprint is.
 * The floor is what stops the short band collapsing into a roundabout. */
export function circuitLapBand(length: FiniteStageLength): { min: number; max: number } {
  const band = STAGE_RULES.stageLengths[length].band;
  const { laps, minLap } = STAGE_RULES.circuit;
  return { min: Math.max(minLap, band.min / laps), max: Math.max(minLap * 1.3, band.max / laps) };
}

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
  /** Water-only (R13): how the road gets across — waded, or on a deck. */
  crossing?: Crossing;
};
