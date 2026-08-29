// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ANALYSIS rule book — every threshold the checks score against, as
// data, in one place. `rules.ts` is this file's opposite number: that one
// says what the generator may BUILD, this one says what the result has to
// COME OUT like. Keeping them apart matters, because a threshold moved to
// make a seed score better is a change to the definition of good, and it
// should be as visible in a diff as a change to the vocabulary is.
//
// Every number carries its unit and the reason it is that number. A
// threshold nobody can justify is a threshold that will be quietly widened
// the first time it fails.

export const ANALYSIS = {
  /** How densely the analyzers sample. These are the analyzer's own cost
   * dial: it runs at development time, not in the game, so it is allowed
   * to be far more expensive than the generator — but it is also the thing
   * being iterated WITH, so a full sweep has to stay in the seconds. */
  sampling: {
    /** Every Nth track sample the rollers and the drivability walk visit.
     * Samples are 2 m apart, so 2 puts a probe every 4 m — fine enough to
     * catch a step a wheel would find, coarse enough to sweep a dozen
     * seeds while thinking about the last one. */
    stride: 2,
    /** Ground cells across the stage's bounding box, per side, for the
     * distribution sweep. 96² is ~9k probes of the analytic field: a
     * couple of hundred milliseconds, and enough resolution to measure a
     * share to a percent. */
    groundGrid: 96,
    /** How far outside the road's own bounding box the ground sweep looks,
     * m — the country the stage is set in, not just the strip it runs
     * through. */
    groundMargin: 260,
  },

  /** The ROLLERS: a rank of balls the width of a wheel, rolled down the
   * stage side by side, each writing down the surface it touches. What
   * comes back is a height field of the corridor as the CAR meets it, and
   * everything that is wrong with a road surface is an outlier in it. */
  rollers: {
    /** Ball radius, m — a rally tyre, so a step it cannot roll over is a
     * step the car cannot either. */
    radius: 0.34,
    /** Lateral spacing between adjacent balls, m. Tighter than the ball is
     * wide, so nothing narrow slips between two lanes unseen. */
    spacing: 0.6,
    /** How far past the road EDGE the rank still rolls, m. A rally car
     * spends half a stage out here, and R31 promises it is rideable — so
     * it is analyzed exactly like the mat, at a looser tolerance. */
    verge: 6,
    /** Biggest surface step a lane may take over one stride and still be
     * road, m per m of travel. The paving grade tops out near 0.085
     * (`rules.ts`), a ford's ramp a little more; past this the car is
     * meeting an edge rather than a slope. */
    grade: { mat: 0.16, verge: 0.42 },
    /** ...and where the lane is simply broken, m per m — a cliff in the
     * corridor at any tolerance. */
    gradeFail: { mat: 0.5, verge: 1.1 },
    /** Biggest height difference between two ADJACENT lanes, m, over and
     * above what the camber and the bank already explain. The cross-fall
     * of a banked corner is applied to the whole corridor, so it cancels
     * out of this and what is left is a wall or a trench. */
    cross: { mat: 0.22, verge: 0.75 },
    /** A BUMP: the second difference of a lane's profile, m. A hollow or a
     * pimple between two otherwise even strides — the thing a slope
     * measurement misses because both its sides are legal. */
    bump: { mat: 0.16, verge: 0.55 },
    /** How far past a jump lip the surface is not analyzed, m. The lip IS
     * a drop and the landing IS a step: they are the feature, and R6
     * already owns whether they are placed legally. */
    jumpSkip: 40,
    /** Share of probes allowed to be outliers before the check starts
     * losing points. Not zero: a stage is thousands of probes and the
     * analytic field is noise, so a handful of marginal strides is the
     * measurement, not the road. */
    tolerated: 0.001,
  },

  /** The WATER. Every one of these is a rule of nature stated as a number:
   * water runs down, gathers as it goes, starts high and ends in
   * something bigger. */
  water: {
    /** How far a course may climb between two consecutive points, m,
     * before it is running uphill. Not zero — the points are on a meander
     * and the level is quantized by the walk — but close to it. */
    climb: 0.02,
    /** How much a course may NARROW downstream, m of half-width. A river
     * that thins as it collects is drawn backwards. */
    narrow: 0.15,
    /** Total fall from source to mouth a course has to manage, m. Less
     * than this and the water is a canal, not a river. */
    fall: 5,
    /** How far above the ground a course's surface may sit before it is
     * floating, m. A little is right — the channel is cut into the ground
     * and the surface stands in it — but a sheet of water drawn over a
     * hillside is the most visible bug the generator can ship. */
    float: 0.75,
    /** How close to standing water (or to the edge of the world) a mouth
     * has to get to have ENDED somewhere, m. */
    mouth: 40,
    /** How far off the road a course has to stay where it is not crossing
     * it, as a multiple of the road's own clearance. Water routed under a
     * road it does not cross digs the ground out from under the ribbon. */
    roadKeep: 0.5,
    /** Window either side of a crossing where the course IS allowed on the
     * road, m — it is crossing it there. */
    crossWindow: 45,
  },

  /** The ROAD NETWORK: where the roads go, and whether any of them go
   * nowhere. */
  roads: {
    /** How far past the stage's bounding box a branch has to reach before
     * it counts as having left the map, m. Under `SPUR.escape`, because a
     * branch that stopped a little short of its target still ran off the
     * frame; one that stopped in the middle of the stage did not. */
    escape: 90,
    /** Two roads are PARALLEL when they run within this much of each other
     * — as a multiple of R23's clearance — on headings within
     * `parallelAngle`, for `parallelRun` meters. Legal, and still wrong:
     * two ribbons side by side across a landscape read as one road drawn
     * twice. */
    parallelNear: 3,
    parallelAngle: 0.32,
    parallelRun: 130,
    /** ...and the same test for a road against ITSELF, which is a different
     * question. A rally stage in a bounded world folds back on itself
     * constantly — that is what makes it a stage rather than a drive — so
     * one road running near its own line is only wrong when it does it for
     * long enough, and close enough, to read as a doubled ribbon rather
     * than as a switchback. Both numbers are therefore stricter than the
     * road-against-road pair's. */
    selfNear: 2,
    selfRun: 300,
    /** How much of the stage's own bounding box should be within reach of
     * SOME road, as a share — the distribution check. Too little and the
     * stage is a thread across an empty map; too much and the country is
     * more road than land. */
    coverage: { min: 0.12, max: 0.62 },
    /** ...measured at this distance from a centerline, m. Roughly how far
     * a road is still a presence in the landscape rather than a line on
     * a map. */
    coverageReach: 130,
    /** How square the route's own footprint should be — the shorter side
     * of its bounding box over the longer. A stage that runs down a
     * corridor uses none of the country it was given. */
    boxFill: { min: 0.3, max: 1 },
  },

  /** DRIVABILITY: whether the geometry asks the car for something it does
   * not have. The reference car is deliberately a MODEST one — a stage
   * only the best car can hold is a stage most runs cannot. */
  drive: {
    /** Lateral grip the reference car has to hold a corner with, m/s².
     * Around 1.2 g: gravel with a car that is being driven properly. */
    latAccel: 11.5,
    /** ...and how hard it can slow down, m/s². */
    brake: 9,
    /** Top speed the profile is capped at, m/s (~230 km/h). */
    topSpeed: 64,
    /** Steepest the road may climb or fall, m per m. Above `warn` a stage
     * is hard work; above `fail` a car with a load of damage stops
     * climbing it at all. */
    grade: { warn: 0.13, fail: 0.22 },
    /** Vertical acceleration a crest or a compression may put through the
     * car at the speed the profile says it arrives at, m/s². Past this a
     * crest throws the car and a dip bottoms it — neither of which is the
     * road's decision to make outside a jump. */
    heave: 26,
    /** How much of the corner the bank may be tilted the WRONG way before
     * it is adverse camber, m per m. R19 banks INTO the turn; a corner
     * banked out of it is a corner nothing can hold. */
    adverse: 0.01,
    /** Share of the brake figure a car can put down as DRIVE at low speed
     * — the forward pass's acceleration limit. Well under 1: everything
     * accelerates slower than it stops. */
    pullShare: 0.55,
  },

  /** THE JUMPS. Height and length are not defects — they are what a jump
   * IS — so the first two of these are MEASUREMENTS with a band around
   * them, and only the landing is pass or fail. */
  jumps: {
    /** How far back from the lip the ramp's angle is read, in samples.
     * Three samples is 6 m of a 10–16 m ramp: long enough to average out
     * the compiler's own steps, short enough to be the ramp and not the
     * straight before it. */
    rampProbe: 3,
    /** How finely the flight is walked, m, and how far it is followed
     * before a jump is simply reported as enormous. */
    step: 2,
    maxFlight: 260,
    /** How far a jump throws the car, m: past `warn` it is a big one, past
     * `fail` the car is a projectile and the landing zone R6 measured
     * ALONG the stage has nothing to do with where it comes down. */
    length: { warn: 42, fail: 75 },
    /** Most air under the car anywhere in the flight, m. A rally jump puts
     * a metre or two of daylight under the car; past `fail` the camera has
     * lost the road and the landing is a crash. */
    height: { warn: 4.5, fail: 9 },
    /** Vertical speed at touchdown, m/s. Suspension travel absorbs the
     * first few; past `fail` the car is landing on its bump stops. */
    impact: { warn: 9, fail: 14 },
    /** How wide a corridor around the flight path has to be clear of
     * anything solid, m — a car in the air cannot steer round a tree. */
    corridor: 3,
    /** Jumps per kilometre a stage wants at least one of. Not a defect —
     * a stage with no air on it is a legal stage — but it is the number
     * that says the vocabulary went quiet, and it is worth seeing. */
    perKm: { min: 0.25 },
    /** ...and what a stage with NO jumps scores on that check. Most of the
     * marks, because there is nothing wrong with it. */
    emptyScore: 0.7,
  },

  /** THE TWO ENDS — the start line and the finish line. These are the
   * pass-or-fail ones: what hangs off them is whether a mode works, not
   * how good a stage feels. */
  ends: {
    /** How many cars a heads-up field is, and therefore how many the start
     * apron has to stand. The grid is one car per row (`sim/grid.ts`), so
     * this and `TUNING.massStart.rowGap` together are what
     * `STAGE_RULES.startZone.apron` has to be long enough for. */
    grid: 16,
    /** Clearance every grid slot needs around it, m. */
    slotClear: 2.4,
    /** How far out of level the apron under the grid may be, end to end,
     * m. The apron is one extrapolated plane, so anything much here is the
     * terrain failing to lay a shelf under it rather than a slope. */
    apronStep: 0.6,
    /** How far up the road from the GATE the field is stringing out, m,
     * and the tightest corner allowed inside it. A grid sixteen deep
     * arrives at the first corner still stacked if it comes too soon —
     * this is the straight R1 exists to provide, measured. */
    launch: 150,
    launchRadius: 95,
    /** How far either side of the finish gate the line has to sit on road
     * straight enough for a plane across it to be uncrossable-around, m,
     * and the radius that means. `crossedFinish` tests a PLANE: on a tight
     * enough corner a car is past it before it meets it. */
    gate: 30,
    gateRadius: 110,
    /** ...and the radius the closing straight (R2) has to hold. */
    approachRadius: 90,
    /** Share of R25's run-out that actually has to be there. */
    runOutShare: 0.95,
    /** How much of the run-out has to be straight and clear for a car
     * nobody is steering any more to coast down, m, and its radius. */
    settle: 120,
    settleRadius: 70,
  },

  /** The GROUND the stage is laid across — the layers, and whether the
   * shares of them read as a country. */
  ground: {
    /** Share of the analyzed country standing under water. Some water is
     * what makes a landscape; a map that is mostly lake is a seascape with
     * a road drawn on it. */
    water: { min: 0.01, max: 0.34 },
    /** Share carrying closed forest. */
    forest: { min: 0.12, max: 0.78 },
    /** Share where the bedrock is at or near the surface — rock, scree and
     * thin moss rather than soil. This is the number that separates a
     * glaciated Swedish landscape from a Norwegian one. */
    rock: { min: 0.02, max: 0.55 },
    /** Relief: the spread between the 5th and 95th percentile of ground
     * height across the country, m. Flat is boring, and a wall of mountain
     * either side of the road is a corridor. */
    relief: { min: 18, max: 260 },
    /** Share of the country steep enough that a car could not climb it. */
    cliff: { max: 0.3 },
    /** SOIL PLAUSIBILITY: soil is till and washed sediment, so it collects
     * in hollows and is scoured off steep ground. Deep soil standing on a
     * cliff is the layering not being obeyed. `steep` is the slope past
     * which ground counts as steep, m per m; `deep` is the soil depth that
     * has no business being there, m. */
    soil: { steep: 0.45, deep: 1.4, share: 0.06 },
    /** Soil depth under which the ground counts as BARE ROCK, m — moss,
     * grass and flowers, nothing with a root. */
    bare: 0.25,
    /** ...and the depth a tree needs to stand in, m, plus how far around a
     * bare-rock probe a trunk still counts as standing ON it. The reach is
     * a couple of cells of the trunk lattice: a trunk right on the edge of
     * a patch of rock is rooted in the soil next to it. */
    rootDepth: 0.4,
    rootReach: 3,
    /** Grove density at or above which a patch counts as CLOSED forest
     * (`GROVES` in props.ts: a meadow is 0.06, a spruce wood is 1). */
    closed: 0.8,
    /** How far off the band each share may drift before the check has lost
     * all of its points — the slack `within` scores against. */
    slack: 0.3,
    reliefSlack: 140,
  },

  /** COST. The generator runs in the game, on a phone, every time a stage
   * starts; the analyzer runs here. So the analyzer is allowed to be slow
   * and the generator is not, and the only way that stays true is for the
   * analyzer to time it. */
  perf: {
    /** Wall time to build a whole stage — plan, compile, terrain field —
     * ms. A stage is built behind a loading card, so a quarter second is
     * invisible and a second and a half is a stutter somebody notices on a
     * phone. */
    build: { budget: 260, fail: 1400 },
    /** ...and the share of that the PLAN's search may take. A search that
     * has started rejecting whole attempts shows up here long before it
     * shows up as a livelock. */
    plan: { budget: 90, fail: 700 },
    /** Per-call cost of the terrain field's hot queries, microseconds.
     * `groundAt` is read several times per physics step at 120 Hz and once
     * per ground tile per frame; `waterAt` per step; `obstaclesNear` per
     * step for the contact model. These are the numbers that decide
     * whether a landscape change costs frames. */
    query: {
      ground: { budget: 4, fail: 30 },
      water: { budget: 4, fail: 30 },
      obstacles: { budget: 12, fail: 90 },
    },
    /** How many calls each query timing averages over. Enough to be past
     * the JIT's warm-up and out of the noise. */
    samples: 4000,
  },

  /** What each metric is worth in the stage score. Water and the road
   * surface carry the most because they are what a player reads as "this
   * world is fake" fastest; cost carries real weight because a beautiful
   * stage nobody can load is not a stage. */
  weights: {
    rollers: 1.6,
    water: 1.4,
    roads: 1.2,
    drive: 1.4,
    jumps: 1.2,
    /** The ends carry the most of any metric: every other check is a
     * question of how good a stage is, and these are the ones that decide
     * whether a mode runs on it. */
    ends: 1.8,
    ground: 1,
    perf: 0.8,
  },
} as const;
