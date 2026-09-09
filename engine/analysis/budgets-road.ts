// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the analyzer's scoreboard (`budgets.ts`): WHAT THE ROAD
// AND THE THINGS ON IT MAY BE — how often it is sampled, the rollers a
// profile may carry, the water it crosses, the public roads it meets, the
// junctions onto them, what driving it should cost, the jumps, and the two
// ends.

export const ROAD_BUDGETS = {
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
    verge: 8,
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
    /** R16 — THE ROAD'S EDGE: the grade the ground may take across the
     * corridor's outer band, m per m, and where it stops being an edge and
     * becomes a face. The budget is R31's `verge.climb` read the other way
     * round — a road's edge may fall away no harder than a car could drive
     * back up it — and the failure bar is a slope nothing gets back off.
     * Kept here rather than derived from the rule book so that changing
     * what counts as a good edge is a visible line in a diff. */
    edge: { grade: 0.45, fail: 1.2 },
    /** R16 — THE SEAM, as opposed to the edge above: how big a STEP the
     * ground may take across the corridor's outer band, m, measured as the
     * worst second difference along a fine walk of it. A slope of any
     * steepness reads zero here; only a kink registers, which is what
     * separates a road on a hillside from a road with a face at its lip.
     *
     * `stride` is how finely the band is walked, m — under the ribbon's own
     * outermost station spacing, so a step that falls between two of the
     * drawn vertices is still met head on.
     *
     * MEASURED, not chosen. Across ~85,000 probes — seeds 1-11 at short and
     * medium, and again at the ends of the elevation, water and width dials
     * — the median kink is 0.007 m, the 99.9th percentile 0.091, and the
     * worst anywhere 0.222. So the budget sits above the whole healthy
     * population with room to spare, and what it is above is not the road:
     * the floor under this measurement is the GROUND LATTICE'S OWN
     * FACETING. The landscape is drawn low-poly on purpose, its 14 m
     * triangles crease at every edge, and the corridor's lip is where the
     * ribbon hands over onto them — so the last stride of the band always
     * crosses one. That crease is the art direction, not a defect, and a
     * budget tight enough to report it would be reporting the terrain.
     *
     * What it catches instead is a STEP, which is a different size of
     * thing: cutting the hand-over off at the shoulder — the defect R16
     * exists to prevent — measures 3.48 m here, an order of magnitude past
     * `fail`. `fail` itself is where a wheel meets it as an edge rather
     * than a bump. */
    seam: { kink: 0.3, fail: 0.6, stride: 0.35 },
    /** How thick a barrier across an abandoned branch (R17) is, measured
     * along the branch, m — half of it either side of the line it stands
     * on. A line of cones is a hand's width and a row of round bales is
     * over a metre; this is the deep end of the vocabulary, because what
     * is being asked is whether the road the stage takes is clear, and the
     * answer has to hold for whichever furniture the seed rolled. */
    blockDepth: 0.9,
    /** How far past a jump lip the surface is not analyzed, m. The lip IS
     * a drop and the landing IS a step: they are the feature, and R6
     * already owns whether they are placed legally. */
    jumpSkip: 40,
    /** Share of probes allowed to be outliers before the check starts
     * losing points. Not zero: a stage is thousands of probes and the
     * analytic field is noise, so a handful of marginal strides is the
     * measurement, not the road. */
    tolerated: 0.001,

    /** R33 — HOW OFTEN THE GRAVEL HAS A BUMP IN IT, as a band.
     *
     * This is the one measurement in the module where BOTH ends are
     * defects, and it is worth being explicit about why. Every other check
     * here looks for damage: less is better and zero is perfect. Bumps are
     * not damage. A gravel road that measures zero is a ribbon nobody
     * bladed, drove on or froze — the loudest tell there is, and exactly
     * what a generator produces if nobody asks it not to. So too SMOOTH
     * costs as much as too rough.
     *
     * Counted in bumps per kilometre OF GRAVEL, not per kilometre of stage:
     * a mostly-sealed stage has less gravel to put them on and would
     * otherwise read as under-bumped for having tarmac on it.
     *
     * A count and not an average, because the thing being measured is
     * sparse. A road with one heave in it and a road with a continuous
     * ripple of the same energy average identically and are nothing alike. */
    bumpy: { min: 12, max: 45 },
    bumpySlack: 22,
    /** The second difference, m, over which a sample counts as being in a
     * bump. Above the analytic profile's own curvature and well under the
     * smallest authored bump, so it separates the two cleanly. */
    bumpFloor: 0.004,
    /** ...and how much CLEAN ROAD closes one, m. A defect is a defect, not
     * a run of rough samples: a broad heave curves the other way down its
     * flanks and so reads as several separate runs, which counted the one
     * thing a driver feels as three. Comfortably over the inflection
     * spacing of the longest bump R33 authors (`roughness.halfWidth.max`)
     * and well under the spacing between two of them. */
    bumpGap: 9,

    /** R21 — HOW WIDE THE ROAD IS. A band, because both ends are wrong: at
     * the bottom of the `width` dial the road is a lane with no room to
     * place a car sideways, and at the top it is an arcade boulevard where
     * nothing is a commitment. The dial spans `STAGE_RULES.roadWidth`
     * (9–22 m) and this is the part of it that is a rally road, so the ends
     * of the dial are meant to score under 100 — that is what a dial having
     * ends means. */
    width: { min: 11, max: 20 },
    widthSlack: 6,

    /** ...and how much the RIDEABLE CORRIDOR pinches and opens out along
     * the stage: the standard deviation of how far either side of the
     * centre the rank keeps finding ground a car could be on, m.
     *
     * This is the WORLD's half of the question — the forest, the water and
     * the walls crowding in and standing back — and it now moves with the
     * road's own width as well, since R33 cuts the gravel narrow and opens
     * it at the bends. `breathes` and `opens` below are the road's half.
     *
     * MEASURED. Across seeds 1-8 at medium the spread runs 6-10 m; the top
     * of the band is where the corridor is no longer a road with a world
     * beside it but a clearing with wheel tracks through it. */
    varies: { min: 0.6, max: 12 },
    variesSlack: 4,

    /** R33 — THE MAT'S OWN WIDTH, on gravel, as two bands.
     *
     * `breathes` is the standard deviation of the cut width as a share of
     * its own mean. Zero is a ribbon extruded to one number from the line
     * to the flag, which is the single loudest tell that a road was
     * generated rather than built; too much is a road that changes width
     * under the car, which reads as a fault in the mesh rather than as a
     * road. The generator's `roughness.width` swings ±11% of the nominal on
     * two long waves and adds up to 24% back at the bends, and what that
     * comes out at over seeds 1-8 is 9-11%.
     *
     * `opens` is how much wider a BEND is cut than the straights, as a
     * share of them. A drift needs somewhere to go: a corner no wider than
     * the road either side of it can only be driven neatly. Too much and
     * the bend is a lay-by. Same seeds: 15-19%.
     *
     * `cornerAt` is the curvature a sample counts as being in a bend at,
     * 1/m — a 150 m radius, which is where a road stops being straight and
     * starts being a corner a driver places the car for. */
    breathes: { min: 0.04, max: 0.2 },
    breathesSlack: 0.06,
    opens: { min: 0.06, max: 0.35 },
    opensSlack: 0.12,
    cornerAt: 1 / 150,
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
    /** How close a course may come to ground it has already covered, m,
     * before it has run back over itself. Water does not, ever: a course
     * that returns to a point it left is a walk stuck swapping between two
     * cells, and it draws a full-width sheet of standing water on one spot
     * rather than a river.
     *
     * Three quarters of the tracer's own step (`STEP`, 14 m), which is the
     * distance the walk itself uses to decide it is circling — one rule,
     * measured the same way on both sides. */
    retrace: 10.5,
    /** ...after this much TRAVEL, m. The drawn points carry the meander's
     * sway, which swings them past each other by design, so distance alone
     * cannot tell a bend from a cycle — how far the water ran in between
     * can. Over seeds 1-24 at medium the longest a healthy course runs
     * before coming back within `retrace` of itself is 85 m (one sway),
     * and seed 2's cycle ran 3624 m before returning to the same spot. */
    retraceRun: 200,
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

    /** R20 — how much of the SEALED road may bend tighter than
     * `STAGE_RULES.paving.minRadius`, as a share of the sealed road on the
     * stage. A public road the rally borrowed sweeps; a hairpin on one
     * reads as a race track painted grey, and the tight corners are what
     * the rally has its own gravel for.
     *
     * Not zero, and `sweepClear` is why. The tarmac reaches into every
     * junction the route leaves it at — the main road's mat carries the
     * corner until the route's own line is clear of it — and a minor road
     * leaving a main one at a sharp angle is a T-junction, which is R17's
     * business and not a defect. So the crossings are excluded, out to
     * `sweepClear` metres of arc either side of the junction.
     *
     * That reach is derived rather than guessed: the mat carries a corner
     * of radius r for `r·acos(1 - half/r)` metres, which at this check's
     * own ceiling (a 32 m corner on a 16 m road) is 23 m. Thirty is clear
     * of that and still an order under the shortest hairpin there is — a
     * 180° turn at 25 m radius is 78 m of road — so a real one is caught
     * whole while the crossings drop out.
     *
     * Measured: with R20 enforced, every seed of 1-24 at medium comes out
     * at 0.0%; with it off, the worst is 6.1% of the sealed road. */
    sweeps: 0.01,
    sweepClear: 30,

    /** R39 — how much BORROWED tarmac a stage may carry before it owes a
     * town on it, m of sealed route in one run. The town placer needs
     * `town.street.min` of open street between the two junctions' own
     * ground (`junction.parting` each), plus some slack for the corners at
     * either end of the run, which are sealed and not straight. A run this
     * long with no town on it is tarmac that leads nowhere. */
    townRun: 370,
    /** ...and how far past the road's verge a lot's front wall may stand,
     * m. The placer's own front yards top out at `town.lot.front.max`, and
     * a wide building pushes its wall back by what its pad needs to clear
     * the verge — a block of flats lands a couple of metres further out
     * than a house. Past this the building is not ON the street. */
    townFront: 12,
    /** ...and how far the GROUND under a building may stand from the
     * building's own floor, m — measured on `groundAt`, which is the
     * surface the world draws and the car rides, not the analytic field
     * between its corners.
     *
     * This is the check the flying houses got past. A lot is graded level
     * with its street, but a pad ten metres across is narrower than the
     * ground lattice (`lattice.ts`): graded one lot at a time the
     * flattening fell BETWEEN the lattice corners, never reached the drawn
     * ground at all, and four houses in five stood on the country's own
     * slope — hanging a couple of metres over it downhill, buried in it
     * uphill. Read over the whole footprint, wings included, because the
     * corner that hung in the air was usually a villa's wing.
     *
     * The budget is what a level-floored box on a graded street cannot get
     * under: `town.lot.step` is the fall a front is allowed to span, half
     * of it stands clear at one end, and the lattice's own interpolation
     * adds a little. Measured: over seeds 1-40 at medium the worst
     * building is 0.56 m out and 1% of them are past half a metre; before
     * the town's platform it was 7.5 m and 79%. */
    townFooting: 0.7,

    /** ...how long a trail from a car park to a stand may be, m — the
     * placer's own walk (`STAGE_RULES.carPark.walk`), plus the pad the
     * trail starts at the rim of. */
    parkWalk: 500,
    /** ...and the share of a stage's stands that may go without a car park
     * before the check starts scoring. ZERO, and it is a structural zero
     * rather than an aspiration: a stand the placer cannot serve is now a
     * stand it hands back, and the crowd at that corner is taken off the
     * stage rather than left standing in a field nobody could have walked
     * in from (R42). Anything this finds is a stand that outlived its
     * refusal — a bug in the hand-back, not a hard seed. */
    unservedShare: 0,

    /** R43 — how much more fall a solar farm's ground may show, as a
     * multiple of the placer's own `energy.solar.slope`, before it is a
     * hillside. The placer reads the BARE country at a lattice of probes;
     * the check reads the SHAPED ground at the corners and the middle, and
     * a road's shelf or a guard's mound at the near corner moves it. */
    energySlopeSlack: 1.5,

    /** R31 — how much HEIGHT two roads passing each other may have between
     * them, over and above what R31's own verge cone allows for the ground
     * they are apart on. Under `stepFloor` nothing is reported at all: the
     * cone is measured off centerlines strided every twenty metres and the
     * roads have camber, bank and a metre of lift between them, so a metre
     * of disagreement is the instrument rather than a defect.
     *
     * What it catches is the case a one-sided cone is blind to. Bound only
     * upward — a branch on stilts beside the stage — a branch BELOW it
     * builds the same wall from the other side, because the terrain holds
     * each road's shelf flat to its own corridor lip and then drops the
     * whole difference between the two lips. Measured on seeds 1-12 at
     * medium with the cone bound one way: four branches lay
     * within a metre of the route more than a hundred metres up their own
     * length, the worst 5.9 m below it, and seed 38's short sprint ran 140
     * m at twelve metres from the route and ten below it — a sheer earth
     * face beside the road, in the picture that started this.
     *
     * `stepFail` is where it stops being a bank and becomes a drop: three
     * metres is over the roof of the car. */
    stepFloor: 1.2,
    stepFail: 3,

    /** R17/R20 — how many surface changes the ROUTE may make away from a
     * junction. Not zero: R20 ends a borrowed road's surfacing where the
     * route runs into a corner too tight for a public road to have, which
     * is a change with no crossing at it and a deliberate, argued trade
     * (see `compile.ts`). One such joint on a stage is a rural road that
     * ran out of money; three is a generator painting stripes.
     *
     * Measured over seeds 1-12 at medium: 9 orphaned changes over 12
     * stages, none of them on more than one stage at a time. */
    orphans: 1,
  },

  /** R17 — THE JUNCTIONS, as places two roads meet at rather than as seams
   * one road changes surface across. Every threshold here answers a defect
   * somebody found by looking at a picture of one. */
  junctions: {
    /** Cell of the raster the mouth is swept on, m. A junction's defects
     * are metres across, so this only has to resolve a splinter of grass —
     * and it is squared into the cost, over a box tens of metres a side,
     * once per junction. */
    cell: 1,
    /** How far past the mouth the sweep still looks, m. Room for the open
     * country beside a junction to be recognized as open country: a box
     * that stopped at the paving would measure the field as one more
     * sliver of grass and report it. Comfortably over `mouth.seam`. */
    margin: 26,
    /** How big a stranded scrap of grass has to be before it is worth
     * reporting, m². Under this it is the raster's own edge — a mat is
     * swept as a disc per sample and its boundary lands between cells. */
    splinterArea: 6,
    /** ...and how thin a patch of country between two roads has to be
     * before it is a SPLINTER rather than a field, m. A junction whose
     * grass runs to a knife point is the tell that nobody planned it: below
     * a car and a half across, the ground between two carriageways is a
     * seam somebody should have paved, not an island. */
    splinterThick: 7,
    /** R17 — the angle the dirt road has to arrive at the tarmac at,
     * measured where its centerline crosses the main road's edge. `min` is
     * where a junction stops being one: two roads sharing a tangent there
     * have MERGED, and a merge with a barrier across one arm reads as a
     * slip road with a mistake on it rather than as a crossing. A right
     * angle is the ideal and needs no ceiling — it is what a lane joining a
     * road looks like everywhere.
     *
     * 35° rather than something stricter because the corner the junction
     * sits on is drawn from the stage's own vocabulary (`junctionAngle`,
     * 64°-112°) and the route is still turning through it where it crosses
     * the edge — so what is being asked is that the two roads are visibly
     * at an angle, not that a rally stage is a road atlas. */
    angle: { min: 0.61, slack: 0.6 },
    /** How far either side of the meeting point the checks read the route,
     * m — the corner the junction sits on plus the run out of it. */
    approach: 120,
    /** How much UNSEALED road the sealed one may have in it through a
     * crossing, m. The dirt road stops AT the tarmac; a band of gravel
     * running under the sealed road and out the far side is the surface
     * change painted across the minor road instead of along the main
     * road's edge, and it takes the tarmac's markings with it.
     *
     * Not zero, because the seam is a real place and the samples that carry
     * it are two meters apart — one of them lands on whichever side of the
     * edge line it lands on. Two samples' worth of slack; anything past
     * that is a band, not a seam. */
    throughGap: 5,
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
    /** ...measured over this baseline either side of the sample, m. Longer
     * than a wheelbase and than R33's surface grain, so what is measured is
     * the road heaving the BODY rather than the texture the suspension is
     * there to absorb. */
    heaveSpan: 12,
    /** How much of the corner the bank may be tilted the WRONG way before
     * it is adverse camber, m per m. R19 banks INTO the turn; a corner
     * banked out of it is a corner nothing can hold. */
    adverse: 0.01,

    /** R19 — ...and how far over a gravel corner should LIE, m per m of
     * road width, as the median cross-fall of the samples in one. The
     * other half of the camber question, and the half nothing measured: a
     * stage whose corners are all banked correctly at one percent is a
     * stage of flat ground with a road painted on it, and it passes
     * `camber` with full marks.
     *
     * A band. Under the floor the corner does not read as a corner from
     * inside the car; over the ceiling it is a bowl, the inside edge is a
     * gutter and a car that runs wide on the exit is thrown at the outside
     * of it. `STAGE_RULES.bank` puts the typical gravel corner at 7-8%
     * over seeds 1-8, which is the middle of this.
     *
     * `tiltAt` is the curvature a sample counts as being in a corner at,
     * 1/m — a 120 m radius, matching the `camber` check above so the two
     * halves of R19 are asked about the same corners. */
    tilt: { min: 0.05, max: 0.11 },
    tiltSlack: 0.04,
    tiltAt: 1 / 120,

    /** R34 — HOW UNEVEN THE ROAD IS: metres of climb plus descent per
     * kilometre of it, jumps excluded. The simplest statement there is of
     * "the road is not a plane", and the one number that moves when the
     * road is laid closer along the country it crosses.
     *
     * A band at both ends. Under the floor the stage is a table with a
     * ribbon on it — the tell that the road was drawn rather than laid.
     * Over the ceiling the car never settles between one heave and the
     * next, which the sim reports as air time and respawns rather than as
     * character.
     *
     * MEASURED, on seeds 1, 3 and 7 at medium: 30 / 56 / 33 m per km at a
     * `follow.lag` of 200, 39 / 52 / 41 at 120, and 48 / 64 / 47 at 70.
     * The floor sits just under what a 120 m lag delivers on the flattest
     * of them and the ceiling just over the hilliest, so the band is the
     * population rather than a wish. */
    rolling: { min: 34, max: 72 },
    rollingSlack: 14,

    /** R26 — WHAT AN APEX CUT COSTS: the share of its speed the reference
     * car loses running the length of a row of anti-cut blocks, driven
     * through the real contact model. A band, because both ends are
     * defects — see `apexTariff` in `drive.ts` for why.
     *
     * `kerbSpeed` is the speed the cut is driven at, m/s (~90 km/h: a car
     * straightening a third-gear corner). `kerbSteps` at `kerbStep` is
     * two seconds of it, which is longer than any row on any stage.
     * `kerbRowGap` is the arc gap, m, past which two blocks belong to
     * different corners — comfortably over `STAGE_RULES.kerb.blockSpacing`
     * and well under the shortest straight between two bends. */
    kerb: { min: 0.08, max: 0.32 },
    kerbSlack: 0.12,
    kerbSpeed: 25,
    kerbStep: 1 / 120,
    kerbSteps: 240,
    kerbRowGap: 6,
    /** Share of the brake figure a car can put down as DRIVE at low speed
     * — the forward pass's acceleration limit. Well under 1: everything
     * accelerates slower than it stops. */
    pullShare: 0.55,

    /** R38 — THE LONGEST THE ROAD ASKS FOR NOTHING, in SECONDS of driving.
     * A rally stage is corners joined by straights; a straight long enough
     * to be a destination of its own is the road forgetting what it is for,
     * and the player holding a wheel that does nothing.
     *
     * Seconds rather than metres, because metres are not what the boredom
     * is made of: two hundred of them out of a hairpin is a gear-change and
     * a lift, and the same two hundred met at rally pace is a moment. The
     * speed profile already says how fast the road arrives, so the check
     * asks the one question a driver would — how long am I doing nothing.
     *
     * FIVE, because that is the ask: never drive straight for longer than
     * that. It is also about where the vocabulary already sat — the long
     * straight's old 190 m ceiling ran to 6.0-6.4 s out of a slow corner
     * over seeds 1-16 — so it is a trim of what a straight may be rather
     * than a new kind of stage.
     *
     * `straightFail` is where it stops being a long straight and becomes a
     * runway: past this the stage has a stretch nobody is driving. */
    straight: 5,
    straightFail: 8,
    /** ...and what counts as STRAIGHT: the radius, m, past which the road
     * is being held rather than steered. At rally pace a 700 m bend asks
     * about a third of a g — a lean, not a corner — and it is comfortably
     * clear of everything either kind of road calls a corner: the rally
     * vocabulary tops out at a 100 m soft turn (`STAGE_RULES.turn`) and a
     * public road never bends wider than 220 (`HIGHWAY.minRadius`), so
     * neither can have a corner of its own counted as straight.
     *
     * Geometry alone, deliberately, with no speed in it: the check's
     * ANSWER is already in seconds, so putting the speed into the
     * definition as well would let one fast straight and one slow one
     * disagree about whether they are straights at all. What is straight
     * is a property of the road; how long it lasts is the driver's. */
    straightRadius: 700,
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
    /** R41 — how much daylight the car has to have over a train's roof
     * (`RAILCAR.height`) as it passes over the rails at the profile's speed,
     * m. A third of a metre is a wheel's bounce: under it the ramp is a
     * ramp INTO the wagon on a bad day. Under the roof itself is an error. */
    train: { margin: 0.3 },
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
} as const;
