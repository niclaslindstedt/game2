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
//       only concrete spans it. A concrete deck is WALLED: its parapet is
//       an unbroken run of solids down both edges, cast into the deck and
//       immovable, and it is the one wall on a stage that is there on
//       purpose — R31 cuts every other one away. A timber deck's rail is
//       posts and a rail, and a car goes through it.
//   R14 The inside of a sharp corner is GUARDED: a turn (or a combination)
//       that bends past `guard.angle` gets the ground between its entry and
//       its exit filled with a steep mound or a dense grove, so cutting
//       across the grass costs more than the corner does.
//   R15 Asphalt comes in RUNS, never a chequerboard: the paving field lays
//       the road down in sections hundreds of meters long, and the knobs'
//       `asphalt` is the share of the stage that comes out paved.
//   R16 The road has a CROSS-SECTION, and it is CURVED: five lines across
//       its width — a loose edge either side that nothing drives on, two
//       worn wheel tracks a real car's track apart, and the crown between
//       them — plus a berm of pushed gravel at its edges and a shoulder
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
//   R25 A SPRINT's finish line is not the end of its road. It carries on
//       past the gate for a RUN-OUT — road the car coasts down after the
//       clock stops, so the finish is a line drawn across a road rather
//       than the cliff edge of a world that ran out of budget. A circuit
//       needs none: its finish is its own start line, with a whole lap of
//       road already the other side of it.
//   R26 Red-and-white KERBING is placed where a driver needs it and nowhere
//       else: on the inside of a corner at its apex, on the outside where
//       the corner unwinds onto a straight, on the outside of the braking
//       zone before a hard turn, and around a hazard. A rally road edged in
//       stripes from end to end is a bobsleigh run, not a road — and on
//       gravel the kerb is a run of marker posts, never a continuous
//       painted band (see docs/track-generator.md for the placement guide).
//   R27 A stage is WATCHED. Spectators gather where a rally crowd actually
//       gathers — at the finish, and at the corners worth standing at — on
//       ground clear of the road, on the OUTSIDE of the bend where nothing
//       leaving the road is coming at them.
//   R28 A stage is SPLIT INTO CHECKPOINTS, roughly a quarter-minute of
//       driving apart, and every one of them stands just past the EXIT of a
//       corner — the tighter the better. A checkpoint is both a split
//       (where the run is measured against whoever it is racing) and the
//       place a lost, drowned or crashed car is put back on the road, so it
//       belongs where the road has just asked the driver a question rather
//       than in the middle of a straight where it would cost nothing.
//   R31 The road and the ground beside it are RIDEABLE. Within a BENCH of
//       a road — the route's or an abandoned branch's — the landscape never
//       stands above that road's own corridor, and past the bench it may
//       only rise at a grade the car can climb. Whatever the country was
//       doing there is CUT where it would otherwise be a wall a car sliding
//       off the road stops dead against, or a hillside the ground lattice
//       drags up through the tarmac. The bench is a LATTICE CELL DIAGONAL
//       wide because that is the reach of the triangles the ground is drawn
//       and driven on: pin every corner that could sit over a road, and no
//       triangle can cut up through one.
//       What is cut is the LANDSCAPE. A cut is taken against the road the
//       ground is beside, and it never reaches in under a DIFFERENT road's
//       own shelf — one road's rideability is not a licence to hollow out
//       the ground another is standing on. Without that, a branch running
//       sixty metres away and twenty metres below took fourteen metres of
//       hillside out from under the route, and left its ribbon hanging in
//       the air with a vertical face down the side of it.
//   R34 Where a road meets ground it cannot go round, it is CUT THROUGH it,
//       and the face it is cut through is the face that ground would stand
//       at. R31 says the country beside a road may only rise at a grade a
//       car could climb, and taken alone that is a country with no rock in
//       it: every shoulder the road forces gets battered back into the same
//       gentle ramp, and a stage laid across mountains reads as a stage laid
//       across a lawn. So the grade R31 holds the country to is not one
//       number, it is the ANGLE OF REPOSE OF WHAT IS THERE:
//         · Deep till slumps. It is battered back to R31's own climb, and a
//           car that runs wide onto it comes back down onto the road.
//         · Rock stands. Where the cover is thin the face is left standing at
//           the rock's own angle, and it reads as what it is — a cutting,
//           with the bedrock showing, nothing rooted on it and stone at its
//           foot.
//       ...and how far it is worth blasting depends on what the road is
//       worth. A SEALED road is a public road somebody engineered: it holds
//       its line and takes the shoulder out of the way. A gravel road is
//       scraped in by a grader for the cost of the diesel, and a grader goes
//       ROUND — so an unsealed stage gets the shallow cut and the sealed
//       sections get the walls. `knobs.steepness` says how hard the country
//       is on both counts.
//       The BENCH is untouched either way: a cut face begins outside the
//       flat ground R31 keeps beside every road, so a car running wide has
//       the same room it always had before it reaches the rock.

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
  /** R34 — how STEEP the country stands. Not how HIGH it stands, which is
   * `elevation`: this is the angle the same relief is held at. At 0 the
   * ice has been over everything — long slopes, whaleback summits, fault
   * steps worn back into hillsides, and a road that is graded gently into
   * whatever it crosses. At 1 the rock keeps its faces, and where the road
   * has to go through a shoulder of it rather than round, it goes through
   * a CUT: a blasted face standing over the verge instead of a bank
   * battered back to something a car could climb. */
  steepness: number;
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
  // Middling country: rock faces where the road has to force a shoulder,
  // worn slopes everywhere it does not.
  steepness: 0.5,
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
    steepness: clamp01(knobs?.steepness ?? DEFAULT_KNOBS.steepness),
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

  /** R1 — and what the opening straight has to be long enough FOR. A rally
   * start is one car and needs nothing; a HEADS-UP start is the whole field
   * stood on the apron behind the gate, and the back row is `startZone.apron`
   * metres further from the first corner than pole is. So the road off the
   * line has to hold the grid's own depth plus a run for it to string out
   * on, and the first corner may not be a slow one — sixteen cars arriving
   * at a hairpin still stacked is a pile-up, not a start.
   *
   * `launch` is the run measured from the GATE (the apron is behind it and
   * is added on top); the opening straight is drawn at least this long.
   * `firstTurn` is the tightest severity the corner at the end of it may be
   * drawn from. */
  launch: { run: 150, firstTurn: "soft" as TurnSeverity },

  /** R25 — the RUN-OUT: road built past a sprint's finish gate, meters. The clock
   * stops at the line and the car keeps going, so there has to be
   * somewhere for it to go. Long enough to shed rally pace without using
   * the brakes as a wall — a car crossing at 50 m/s coasts to walking pace
   * in well under this — and long enough that the road still reaches the
   * horizon in the shot the finish is watched from, which is what stops
   * the gate reading as the end of the world. It is NOT part of the raced
   * stage: R11's length band measures the road up to the line. */
  runOut: 220,

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

    /** R34 — and what the roll RIDES ON. A road is not a profile somebody
     * drew and then laid on a country: it is laid ALONG the country, down
     * the valleys, and it climbs only where it has to get over something.
     * The rolling noise above is the road's own character on top of that,
     * not the whole of its height.
     *
     * So the road follows the bare landscape, through a lag and two clamps
     * — which between them are what a road IS. The lag is a road builder's
     * eye: it takes the broad shape of the country and ignores every
     * hummock, so the road runs level across ground that is not. The clamps
     * are what anything is willing to drive over. Where the country is
     * gentler than they are the road simply follows it; where it is not the
     * road cannot, and the difference is CUT AND FILL — the embankment
     * across a hollow and the cutting through a shoulder, which is where
     * R34's rock faces come from and the only place they come from.
     *
     * All three are causal and per-step, so an endless stage streams
     * through this unchanged and a stage is still a pure function of its
     * seed.
     *
     * `lag` is the response length, m. `grade` is the gradient, and has to
     * leave room under `ANALYSIS.drive.grade` for the rolling noise riding
     * on top of it, which is where the rest of that budget goes — the two
     * ADD, and a follower given the whole budget puts every stage over it.
     *
     * `crest` is the VERTICAL CURVATURE, per m: how fast the gradient
     * itself may change. It is the clamp that stops the road being a ramp.
     * A gradient limit alone says nothing about the corner between two
     * gradients, so a follower that ran up to its cap and straight back
     * down built a brow at every hilltop the country had — the sim came
     * back with air time nearly doubled and three cars in the field wrecked
     * on the landings. Lengthening the lag fixes that by refusing to follow
     * the country at all, which takes the cuttings with it; this fixes it
     * where it happens. It is a real road-building number too: this is the
     * vertical curve every crest on a road is designed around, and 0.0035
     * is a radius of about 280 m.
     *
     * `freeboard` is the one thing the road refuses to follow the country
     * into: the water. A road builder goes round a lake or builds a
     * causeway over it, and never lays a carriageway on a lake bed — so
     * the height the road follows is the ground or this far over the water
     * table, whichever is higher, and low ground crossed at that height
     * comes out as the embankment it should be. Without it a stage that
     * routes across a tarn drives along the bottom of it. */
    follow: { lag: 200, grade: 0.075, crest: 0.004, freeboard: 3.5 },
  },

  /** R32 — THE GROUND, IN LAYERS. What the country beside the road is made
   * of, laid in the order it was made: rock, then the water in it, then the
   * soil on top. `geology.ts` builds the field; these are its numbers, and
   * every one of them is in meters unless it says otherwise.
   *
   * The single most important number here is `smoothness`. It is drawn per
   * seed rather than read off a dial, because it says which COUNTRY a stage
   * is in — how long the ice sat on it — and that is not a slider anybody
   * was asked about. At the low end the rock keeps its sharp crests, its
   * cliffs and its fine grain; at the high end it is planed into whaleback
   * summits, filled valleys and worn-back slopes. */
  geology: {
    /** How glacially planed a country may be, 0 (alpine) to 1 (shield).
     * Neither end is reached: a stage with no texture at all reads as a
     * heightmap, and one with nothing worn is a set of teeth.
     *
     * The band is what `steepness` moves (see `steep` below); the position
     * INSIDE it is still drawn from the seed, because a stage is set
     * somewhere and the dial only says which countries the seed may land
     * in. This pair is the worn end, held for `steepness` 0. */
    smoothness: { min: 0.5, max: 0.95 },

    /** R34 — where the `steepness` dial reaches into the rock.
     *
     * `sharp` is the smoothness band at the top of the dial: the ice barely
     * touched this country, so it keeps its crests, its fine grain and its
     * fault steps as cliffs. Reading between the two bands rather than
     * replacing one number with a dial is what keeps `smoothness` a
     * per-seed property — every dial position still builds a range of
     * countries, it just builds a different range.
     *
     * `rise` is the same dial on the SIZE of the relief, because sharp
     * country does not only hold its slopes steeper, it stands them
     * higher: the same escarpment the ice would have worn into a hillside
     * is a hundred-foot step where it did not. */
    steep: {
      sharp: { min: 0.08, max: 0.5 },
      rise: { min: 0.85, max: 1.45 },
      /** ...and how much steeper the ground BESIDE THE ROAD is allowed to
       * lean at the top of the dial — the per-side embankment grade in
       * `terrain.ts`, which is what actually stands a hillside up next to
       * the car. A multiplier on the rising half of the band only: the
       * falling half is a drop off the road's shoulder, and how far a car
       * that goes over the edge falls is not what this dial is about. */
      bank: { min: 0.8, max: 1.9 },
    },

    /** How much of the finest octave the ice planes off at full
     * smoothness — the grain that separates a weathered hillside from a
     * scoured one. */
    grain: { planed: 0.72 },

    /** The mountain's height band across the smoothness range: sharp
     * country stands its crests higher than the shield does, and the two
     * crest SHAPES (a cube against a smoothstep) do the rest. */
    mountain: { tall: 1.3, planed: 0.5 },

    bedrock: {
      /** The broad swell of the country — the wave a stage crosses two or
       * three of. `amp` is peak to trough. */
      swell: { scale: 430, amp: 54 },
      /** Hills riding on it. This is the layer a DRIVER reads: the swell is
       * slower than a stage is long, and the grain is finer than a corner,
       * so a hill you crest and a hollow you drop into is this one and
       * nothing else. It is deliberately short and tall enough to hold a
       * real grade — a country whose only shape is its swell is the country
       * you can see clean across, which is a rare view even on a plain. */
      hills: {
        scale: 130,
        amp: 21,
        /** The step the hills' own GRADIENT is differenced over, m, and the
         * grade at which the ground it describes counts as fully scoured.
         *
         * This is the only derivative `geology.ts` pays for, and it is not
         * optional. Every other steepness term in the module comes free off
         * a smoothstep — a mountain flank, an escarpment face, a pit's rim
         * — but value noise hands back nothing, and the hills are the layer
         * that carries the grade a driver actually reads. Without it the
         * soil model cannot see the slopes it is supposed to strip, and the
         * analysis quite correctly reports two metres of till lying down
         * the side of every hill on the map. */
        grade: 26,
        steep: 0.55,
      },
      /** ...and the fine grain the ice takes away. */
      grain: { scale: 46, amp: 4.5 },
      /** Where a mountain chain stands (`from` is the share of the mask
       * below which there is none) and how high its crest gets. */
      mountain: { scale: 1150, from: 0.57, height: 72 },
      /** ...and where its crest RUNS. */
      ridge: { scale: 300 },
      /** The fault steps: a wandering line the ground drops over. `span`
       * is how much of the noise the step is spread across — narrow is a
       * cliff, wide is a hillside, and the smoothness reads between them. */
      escarpment: { scale: 520, from: 0.52, span: { min: 0.042, max: 0.22 }, rise: 15 },
      /** The sea basins: broad hollows sunk under the lake table. `wetter`
       * and `deeper` are what the `water` dial adds to each. */
      /** `wetter` and `deeper` are what the `water` dial adds. Both are
       * modest: `from` is a THRESHOLD ON AN AREA, so a tenth off it is a
       * large share of the map turning to sea, and at the top of the dial
       * the land has to still be land. */
      basin: { scale: 1600, from: 0.86, span: 0.34, depth: 30, wetter: 0.18, deeper: 20 },
      /** ...and the ponds, on a tighter scale — the tarns and lakes the
       * road runs past rather than over. */
      pond: { scale: 340, from: 0.9, span: 0.1, depth: 10, wetter: 0.05, deeper: 8 },
      /** Where sea level sits relative to the rock's own zero. */
      datum: -6,
    },

    /** The groundwater. The table is the broad shape of the land dropped by
     * `depth`, plus `drain` times how steep the ground is — steep ground
     * sheds its water and stands dry, flats and hollows hold theirs and go
     * to bog. Where the table comes up through the surface the ground is
     * WET, which is what a mire is. */
    groundwater: { depth: 4.5, drain: 42 },

    /** THE PITS — the hollows that hold standing water, and the whole
     * reason a landscape has lakes in it rather than only rivers.
     *
     * They come in three sizes because the water bodies they make are three
     * different things, and the difference is not scale but the SHAPE of
     * the hollow. A pit's floor is cut toward the water table, so how far
     * BELOW that floor lands is what decides what fills it:
     *
     *   `mere`  broad and barely under the table — a wide sheet of shallow
     *           water, which is a SWAMP. Reeds and sedge stand in it, you
     *           can see the bottom, and a car can wade it. The shallowest
     *           of the three and by far the widest.
     *   `tarn`  a few hundred metres across and properly deep — a lake.
     *   `pool`  small and deep: a kettle hole, a flooded quarry, the pond
     *           at the bottom of a field.
     *
     * `from` is the share of the noise below which no pit forms (so it sets
     * how much of the country is pitted), `span` how sharp the rim is, and
     * `depth` how far under the table a fully-formed floor sits.
     *
     * A pit only forms where the water table is ALREADY near the surface:
     * flat lowland. A hollow gouged into a mountainside drains, and one cut
     * on a summit is a crater. `flat` is how steep the ground may be before
     * it stops holding water, and `lowland` how far above the table the
     * ground may stand before pits fade out entirely, m. */
    pits: {
      mere: { scale: 620, from: 0.76, span: 0.22, depth: 0.55 },
      tarn: { scale: 300, from: 0.8, span: 0.12, depth: 7 },
      pool: { scale: 110, from: 0.86, span: 0.09, depth: 4.5 },
      flat: 0.3,
      /** How far above the lake table the ground may stand before pits stop
       * forming, m. It is a SMALL number on purpose: the country's own datum
       * sits only a few metres over the table, so a generous reach makes
       * almost every flat hectare on the map eligible and a wet dial then
       * drowns the lot. Pits belong in the genuinely low ground. */
      lowland: 13,
      /** How much the `water` dial opens the thresholds. Small, because the
       * thresholds are the share of the map that is pitted and the dial is
       * multiplying an area: a tenth here is already the difference between
       * a stage with a tarn on it and a stage in an archipelago. */
      wetter: 0.06,
      /** Depth below the water table under which standing water is a SWAMP
       * rather than a lake, m: shallow enough to see the bottom of, to
       * grow reeds in, and to drive through. */
      swamp: 1.2,
    },

    /** The soil lying on the rock. Till and washed sediment: it collects
     * where water slows down and is stripped where it does not, so the
     * flanks and the escarpment faces come out bare and the valley floors
     * come out deep. Trees need it, big rocks only surface where it is
     * thin, and bare rock carries moss and grass and nothing with a root. */
    soil: {
      /** Deepest the cover ever gets, m. */
      max: 3.2,
      /** How far below the country's broad shape counts as a full hollow,
       * m — the depth over which the till gets from thin to deep. */
      hollow: 14,
      /** The patchiness of the cover: its noise scale, and the least of it
       * a patch may keep, so nowhere is scoured to nothing by chance
       * alone. */
      patch: { scale: 210, min: 0.3 },
      /** Height above which the ice scoured the ground bare, m, and the
       * band it does it over — the treeline, in effect. */
      alpine: { from: 46, over: 40 },
      /** How much a glaciated country moves off its highs and into its
       * hollows, over and above what slope alone does. */
      glacial: 0.5,
      /** Subtracted from the surface so that adding a soil layer does not
       * raise the whole country by its own mean depth — the water table
       * and every number tuned against the old ground stay where they
       * were. Half of `max`, which is roughly what the cover averages. */
      datum: 1.6,
    },
  },

  /** R33 — a gravel road is NOT SMOOTH, and a sealed one is.
   *
   * The difference is how they are built. Tarmac is LAID: a paving machine
   * leaves a plane, and a plane is what it should be — a sealed section of a
   * rally stage is a public road the event borrowed, and it reads as one
   * precisely because it is the smooth part. Gravel is BLADED, and then
   * driven on, frozen, thawed and bladed again, and what that leaves is not
   * a rougher plane: it is a good surface with things wrong with it HERE AND
   * THERE. A frost heave. A hollow worn at a corner exit. A stone the blade
   * rode over.
   *
   * So the model is sparse, not continuous. A continuous grain — noise added
   * along the whole stage — is a washboard however small you make it, and it
   * is wrong in the same way an evenly-sprinkled forest is wrong: real
   * defects come in ones, with clean road between them.
   *
   * Every bump is MARGINAL by design. A few centimetres is what the car
   * notices as a road with a surface; ten is a pothole, and a generator that
   * scatters potholes has made a different and worse game. */
  roughness: {
    /** One candidate bump per this much arc, m, and the chance it is there.
     * Together they set the spacing: at 14 m and a third, a bump every forty
     * metres or so of gravel, which is a road you can feel without a road
     * that is fighting you. */
    cell: 14,
    chance: 0.34,
    /** How proud or how sunk one is, m — a heave or a hollow, either sign.
     * The ceiling is the number that keeps this a surface rather than an
     * obstacle. */
    height: { min: 0.02, max: 0.065 },
    /** ...and how long it is, m (half-width, so a bump is twice this end to
     * end). Longer than the sample spacing by enough that the compiled road
     * actually draws the shape rather than aliasing it into a step. */
    halfWidth: { min: 1.6, max: 4.2 },

    /** R33 — and the gravel road's WIDTH wanders too. A blade cuts a road
     * a little wider on one pass and a little narrower on the next, the
     * verges creep in where nothing has run wide for a season and get
     * pushed back at every corner, and the result is a road that breathes
     * — never the same width for two hundred metres together.
     *
     * `vary` is the share of the nominal width it swings either way, so
     * 0.12 is a road that runs from 12% under to 12% over: enough to see
     * and to place the car against, nowhere near enough to change what the
     * corner asks for. `wave` is how far it takes to swing, m — long, so
     * this reads as the road opening out and pinching in rather than as a
     * ragged edge.
     *
     * SEALED road does not do this. A paving machine lays a constant width,
     * which is the same reason the tarmac has no bumps on it. */
    width: { vary: 0.12, wave: { long: 210, short: 74 }, shortShare: 0.35 },
  },

  /** R6 — jump placement. */
  jump: {
    minStraight: 90, // segment must be at least this long to carry a lip
    runUp: 35, // meters of straight before the lip
    landing: 50, // meters of straight after the lip
    minSpacing: 200, // meters of stage between two lips
    /** The ramp, as a height and the run it is raised over. What matters is
     * the RATIO — that is the launch angle, and the flight off a lip is
     * ballistics from there: at rally pace a car leaves at `v·sin(θ)` and is
     * in the air for `2v·sin(θ)/g`, so a tenth of a radian either way is
     * thirty metres of flight.
     *
     * The bands are deliberately WIDE and overlapping, so that jumps differ
     * from each other: a stage whose every lip is drawn from the same narrow
     * ratio has one jump on it, repeated. The steep end is where the moon
     * shots come from, so it is capped by the landing zone below rather than
     * chosen for its own sake — `make analyze` reports the flight, the air
     * and the height under the car for every lip on the stage, and that is
     * the measurement this band is set against. */
    lipHeight: { min: 0.9, max: 2.2 },
    rampLength: { min: 12, max: 22 },
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
  /** R26 — where the marking goes. The level-design guide states the
   * placement in prose (docs/track-generator.md); these are the numbers it
   * resolves to. A zone is an arc-length span on ONE side of the road, and
   * the four roles are the four reasons a kerb is ever painted:
   *
   *   apex   — inside the bend, around its tightest point: the target the
   *            driver aims at, and the thing that stops the line being cut
   *            into the ditch.
   *   exit   — outside the road through the last of the bend, where the
   *            corner unwinds: the edge of the usable width as the car is
   *            pushed wide under power.
   *   entry  — outside the road through the first of a hard corner: the
   *            turn-in board.
   *   hazard — wrapped around something that will hurt: a bridge parapet,
   *            a jump lip's shoulders.
   *
   * Corners under `minAngle` get nothing at all. That threshold is what
   * makes kerbing an event: on a stage of soft sweepers almost nothing is
   * marked, and the one hairpin reads from a long way out. And every corner
   * zone is CLIPPED to its corner — a straight carries no marking, so these
   * spans are ceilings the bend can be shorter than, never runs of road the
   * marking is guaranteed. */
  kerb: {
    /** Total bend a turn (or a same-direction combination) must carry
     * before it is marked at all, radians — a shade over 40°, which puts
     * every hairpin and every real medium in and leaves the sweepers bare. */
    minAngle: 0.72,
    /** ...and the bend past which the corner also earns a turn-in board on
     * its way in, radians. A hard corner is the one place a rally actually
     * boards the outside edge. */
    entryAngle: 1.25,
    /** How much of the corner the apex kerb covers, as a fraction of its
     * arc, centred on the middle of the bend — and the meters it is held
     * between, so a hairpin is not marked by a stub and a long fourth-gear
     * sweeper is not marked from end to end. */
    apexSpan: { frac: 0.5, min: 14, max: 55 },
    /** The exit kerb ends where the corner ends and reaches back this far
     * into it, meters. */
    exitRun: { min: 16, max: 40 },
    /** The turn-in board starts where the corner starts and runs this far
     * into it, meters. */
    entryRun: 34,
    /** Kerbing on either side of a hazard's own span, meters. */
    hazardPad: 12,
    /** Marker posts on gravel stand this far apart, meters (R26 — a dirt
     * road is marked by posts, not by a painted band). */
    postSpacing: 6,
    /** ...and the anti-cut blocks laid through an apex, meters. Wider than
     * the posts because a block is wider than a post and because it is a
     * thing the car is meant to be able to WEAVE at: a continuous wall
     * along the inside of a corner is a barrier, and a barrier there is a
     * corner nobody may take tight. */
    blockSpacing: 3.4,
  },

  /** R27 — the crowd. Spectators stand where a rally crowd stands: at the
   * finish, and on the outside of the corners worth watching, back far
   * enough that a car losing it does not arrive among them. */
  /** R28 — the checkpoints. `spacing` is the target gap in SECONDS of
   * driving, which is what a split is actually measured in; it becomes
   * meters through `pace`, the same measured bot pace the length bands are
   * sized from (~95 km/h). Boards are placed at corner EXITS only, and the
   * severity a corner must reach to earn one relaxes the longer the stage
   * goes without a board: nothing but a hairpin will do inside `early` of
   * the last one, a real corner will do past the target gap, and past
   * `late` any bend at all is taken rather than let the split drift. That
   * ordering is the "prefer tight corners" rule — a board just past the
   * exit of a hairpin is one a driver has to earn, and one they will feel
   * being sent back to. */
  checkpoint: {
    /** Target gap between boards, seconds of driving. */
    spacing: 15,
    /** ...at this pace, m/s — `stageLengths` is sized from the same number
     * (`make sim` measures it). Seconds × pace is the gap in meters. */
    pace: 26,
    /** Fractions of that gap at which the severity bar drops: inside
     * `early` no corner is close enough to the last board to earn one,
     * from `early` only a hard one does, from 1 a medium will do, and past
     * `late` any turn is taken. */
    early: 0.55,
    late: 1.7,
    /** How far past a corner's exit the board stands, m — far enough that
     * it reads as the corner's reward rather than part of the corner, and
     * capped by the road that follows so it never lands in the next bend
     * (a turn takes its board on the exit itself). */
    runOut: 30,
    /** No board within this much road of the finish gate, m: a split
     * measured a few car lengths before the line says nothing the line is
     * not about to say properly. */
    finishClear: 150,
  },

  crowd: {
    /** A corner earns a stand once it bends this far, radians — the same
     * corners worth marking are the ones worth watching, a shade looser. */
    minAngle: 0.9,
    /** Never two stands closer together than this along the stage, m. */
    spacing: 320,
    /** How far back from the road EDGE a stand is planted, m — a band, so
     * a run of them is not a fence ruled parallel to the road. */
    setback: { min: 7, max: 13 },
    /** How wide a stand is along the road, m, and how many rows deep. */
    width: { min: 7, max: 15 },
    rows: { min: 2, max: 4 },
    /** People per meter of front row — a crowd, not a queue. */
    density: 0.55,
    /** How far back down the road the finish crowd is banked, m: the one
     * place on the stage where the stands are guaranteed and biggest. */
    finishReach: 70,
    /** How close to the car a stand has to be before it is HEARD, m. */
    cheerRange: 46,
    /** ...and the pace under which nobody bothers, m/s. */
    cheerSpeed: 11,
  },

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
    /** R23's exemption around a junction, m of stage arc either side of it.
     * A branch leaves a junction ON the road it is leaving, so it cannot be
     * measured against that road while it is still LEAVING. Wide enough to
     * cover the corner the junction sits on and the run out of it — and it
     * lapses the moment the branch is properly clear of the stage
     * (spurs.ts), because a branch that has wandered a kilometre and folded
     * back has no claim on the road beside its own junction.
     *
     * The branch builder measures against it and the analysis exempts the
     * same window, so a junction is not reported as two roads sharing
     * ground by the one instrument that would otherwise see every one. */
    spurWindow: 240,
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

  /** R31 — the RIDEABLE VERGE: how far the ground beside a road is held
   * under it, and how steeply it may climb away past that. A rally car
   * leaves the road constantly and has to be able to get back on, so the
   * country next to the road is the one place the landscape does not get
   * the last word. */
  verge: {
    /** Half-width of the bench, m, measured from the road's centerline:
     * inside it nothing stands above the road's own corridor. The number is
     * one GROUND LATTICE CELL DIAGONAL, rounded up, and that is what makes
     * it load-bearing — every corner of a lattice cell a road crosses lies
     * inside that radius of the road, so pinning them under it is what
     * stops a ground triangle cutting up through the tarmac. Shrink it
     * below the diagonal and the guarantee stops being one; the cell size
     * lives in terrain.ts and a test pins the two together. */
    bench: 20,
    /** ...and the grade the ground may rise at past the bench, m per m.
     * Under `collision.climbLimit` with room to spare, because the lattice
     * reads a field of this grade BACK at up to `climb * SQRT2` across a
     * cell diagonal, and that steeper number is the face the car meets.
     *
     * This is the grade for ground that CANNOT stand steeper — deep till,
     * which slumps. Where the road has been cut through rock instead, R34's
     * `cut` band says what the face is held at. */
    climb: 0.45,

    /** R34 — THE CUT. What the road does with ground it cannot go round.
     *
     * These are grades past the bench, m per m, and they replace `climb`
     * by however much of a cut this piece of road is in. The face is a
     * cone like R31's and it starts at the same bench, so nothing here
     * touches the flat ground beside the road: it changes only how the
     * country stands up once it is past it.
     *
     * `face` is the band the rock is held at, read off `knobs.steepness`.
     * The top of it is a shade under 60° — steep enough that the renderer
     * paints it as bare rock and a car cannot climb it, and short of
     * vertical because the ground it is built out of is sampled on a 14 m
     * lattice and a face that turns over inside one cell is a fold, not a
     * cliff.
     *
     * `sealed` and `loose` are how much of that face each kind of road
     * actually gets. A tarmac road was engineered and blasted; a gravel
     * road was scraped in by a grader, and a grader goes round what it
     * can and battered back what it cannot. The gap between the two is
     * the whole visible difference R34 is about.
     *
     * `soil` is the depth of cover, m, past which the ground can no longer
     * hold a face at all — it is till, and till slumps to `climb`
     * whatever the road is surfaced with and whatever the dial says. The
     * cut fades out over it rather than switching, so a cutting runs out
     * into a bank instead of ending at a ruled line. */
    cut: {
      face: { min: 0.75, max: 1.7 },
      sealed: 1,
      loose: 0.34,
      soil: 0.8,
      /** How deep the road is CUT IN before there is a face beside it at
       * all — the natural ground's height at the road, minus the road's
       * own grade, m.
       *
       * This is the gate that decides WHERE a cutting is, and it is the
       * whole reason the road follows the country (`elevation.follow`)
       * rather than floating at a height of its own. A road runs down the
       * valleys, and down a valley it stands at or above the ground on its
       * own low embankment: nothing is cut, and what is beside it is soil.
       * It is only where it has to climb over a shoulder to get anywhere
       * that its grade runs under the ground, and that — and nowhere else
       * — is where anybody blasts.
       *
       * `from` is a ditch's worth, below which there is no face; by `full`
       * the road is properly down in it. */
      depth: { from: 2.5, full: 10 },
      /** How far the country has to stand ABOVE what the cut left before
       * the ground there reads as a FACE rather than as a bank, m: `over`
       * where it starts counting, `full` where it is all rock. Everything
       * that treats a cutting as a cutting reads this — nothing roots on
       * it, so the trunks and the undergrowth stop; the ground paint takes
       * the bedrock (it already does, off the slope); and the analysis
       * counts the stage's cuttings by it. */
      bare: { over: 1.5, full: 7 },
    },
  },

  /** R24 — the start zone. `apron` is the dirt extrapolated straight past
   * each stage end, m: the run-up before the gate and the run-off past the
   * flying finish. Road is drawn on it, the terrain lays its shelf under it
   * and the physics rides it, so it is stage and it is kept clear like
   * stage. `fromArc` is how far the route has to have travelled before it
   * counts as coming BACK to the start — inside it the road is simply
   * leaving, which is not a violation of anything. */
  startZone: {
    /** Meters of dirt extrapolated straight off each stage end. Its length
     * is set by the HEADS-UP GRID, because that is the only thing that
     * needs it long: a mass start stands the whole field on it behind the
     * gate, one car per row (`sim/grid.ts`), so the apron is
     * `(field - 1) * TUNING.massStart.rowGap` plus a car's own length. At
     * 3.5 m a row and a sixteen-car field that is 55 m, rounded up — and
     * the apron is what `GRID_MAX` is derived FROM, so lengthening it here
     * is how a deeper grid gets built. A rally start uses the same road as
     * a run-up and does not care how much of it there is. */
    apron: 56,
    /** How far the route has to have travelled before it counts as coming
     * BACK to the start (R24) — inside it the road is simply leaving. */
    fromArc: 160,
  },

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
  forest: {
    density: { min: 0.2, max: 2 },
    /** R32 — what the SOIL decides about a wood. A trunk needs `depth`
     * metres of cover before a cell is forest at all; from there the stand
     * thickens with the soil, from `thin` of its density up to full over
     * `full` more metres. Bare rock keeps its moss and its grass and grows
     * nothing with a trunk, which is what puts the open ground on the ridges
     * and the mountain flanks rather than scattering it at random. */
    rooting: { depth: 0.4, thin: 0.35, full: 1.6 },
  },

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
  /** R25 — set on a sprint's last segment: how many of its meters lie
   * PAST the finish gate. The line is drawn where the segment has this
   * much left to run, and everything after it is run-out. */
  runOut?: number;
};
