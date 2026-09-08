// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RALLY RULE BOOK — every band a trait is read against, as data, in one
// place. `analysis/budgets.ts` is this file's opposite number and the
// difference between them is the difference between the two modules: that
// one is full of CEILINGS a stage must stay under, and this one is full of
// BANDS a stage has to land inside.
//
// HOW THE NUMBERS GOT HERE, and the rule for changing one. Every band was
// set from a MEASURED POPULATION — `make rate COUNT=… --stats` over the
// three countries, four length bands and both shapes — and then moved by
// hand only where the population and the craft disagreed. A band is not
// where the seeds happen to sit: if it were, half of every sweep would score
// perfectly by construction and the tool would be a very slow random number
// generator. It is where a GOOD stage sits, with the population telling you
// what the generator can actually reach.
//
// So the two failure modes to watch for, and the reason each number carries
// its population beside it:
//
//   A BAND THE WHOLE SWEEP IS INSIDE measures nothing. If every seed passes
//   `flow.corners`, that trait is not choosing anything and its weight is
//   being spent on a constant.
//
//   A BAND THE WHOLE SWEEP IS OUTSIDE is a wish, not a threshold. If no seed
//   in five hundred reaches `scenery.landmarks`, the generator cannot build
//   it and the band is quietly taxing every stage the same amount — which is
//   the same as measuring nothing, with a worse score attached.
//
// The healthy shape is a band a third to two thirds of the sweep clears.
// `make rate --stats` prints exactly that share per trait, and the
// `level-rating` skill's calibration loop is the procedure for reading it.
//
// Bands are quoted PER KILOMETRE wherever they can be, because the stage
// lengths run 1.5 km to 11.8 km and a count is otherwise a measurement of
// the length band rather than of the road.
//
// WHAT IS BORROWED FROM OUTSIDE THIS PROJECT, and where each thing came
// from. Several numbers here are not this game's opinion at all — they are
// the sport's, or arcade racing's, and where one exists it beats anything a
// sweep of this generator's own seeds could say:
//
//   * THE PACENOTE RADII (`walk.ts`, not here — a corner's severity is a
//     fact about its radius, not a threshold anyone chose).
//   * 130 km/h AVERAGE. The FIA's own indicator for whether a special stage
//     is too fast to be run; not a written regulation since 2007, but what
//     an inspector weighs. Real WRC rallies average 75-130 km/h across the
//     calendar, and the fastest event ever run came to 130.0. It is the
//     ceiling under `pace.mean`.
//   * ±30% SPEED SPREAD. Racing-game track-design analysis puts an ARCADE
//     title's standard deviation in vehicle speed inside plus or minus
//     thirty per cent, notably tighter than a simulator's. It is the
//     ceiling under `pace.swing` — and the floor under it is this file's
//     own, because the same analysis has nothing to say about a stage with
//     no variation at all and this game does.
//   * ON-CAMBER. The same analysis says every corner in an arcade racer
//     should be on-camber. `relief.offCamber` follows it: that band's floor
//     is zero, which makes it the one measurement in this file that cannot
//     be too small. Kept as a band rather than moved to `analysis/` because
//     what it is measuring is still a quality of the road rather than a
//     defect in it — a little adverse camber on a mountain descent is where
//     a stage gets its reputation, and the band says how little.
//   * TWENTY SECONDS. Rally level-design practice: a section shorter than
//     that is over before a player has adapted to it, and a minute is the
//     figure to aim at. It is `flow.sections` and `sampling.windowSeconds`.
//   * SPEED + WIDTH + GRIP + VISIBILITY. The same source's account of what
//     actually makes a corner hard — not its angle. `risk.pinch` is width
//     against speed, the `slick` character axis is grip, and
//     `flow.blind` is visibility — the share of a stage committed to
//     before it comes into view.

import type { Band } from "./types.ts";

/** The band, its fall-off either side, in one literal. */
const band = (min: number, max: number, under: number, over: number): Band => ({
  min,
  max,
  under,
  over,
});

export const RATING = {
  /** How the rating samples. It runs at development time, next to
   * `analysis/`, and it is what a curator iterates WITH — so a sweep of a
   * few dozen seeds has to stay in the seconds. */
  sampling: {
    /** Every Nth track sample the road walks visit. Samples are 2 m apart,
     * so 3 is a probe every 6 m: fine enough that no corner is missed,
     * coarse enough to rate a ladder while thinking about the last one. */
    stride: 3,
    /** How long a stretch of stage has to last before it counts as A PLACE
     * rather than a metre of road, SECONDS. Everything that asks how much a
     * stage varies asks over these.
     *
     * Twenty-two seconds because rally level-design practice puts the floor
     * at twenty: a technical section shorter than that is over before the
     * player has adapted to it and reads as arbitrary, and the advice is to
     * aim for a minute. So this is the shortest thing that can honestly be
     * called part of the stage, and `flow.sections` is the trait that holds
     * the stage to it.
     *
     * A TIME rather than a distance, because the same 240 m is a third of a
     * section on a mountain road and two of them on a Finnish blast. */
    windowSeconds: 22,
    /** How far off the road the world is looked at, m. Two rings: what is
     * against the car, and what is on the horizon. */
    near: 26,
    far: 320,
    /** Probes around each road station in the scenery rings. */
    spokes: 8,
    /** HOW FAR FROM THE ROAD THE STAGE STILL IS, m — the edge of the
     * country this rating is about, and the band inside it where a thing is
     * simply beside the road.
     *
     * The generator builds a whole map and a rally is a road through part
     * of it. A village four kilometres off the route is not on this stage:
     * nobody driving it will ever know the village is there, and counting
     * it credits the seed for scenery the player never sees. So everything
     * that counts what is BESIDE the stage counts it with a fade — full
     * weight out to `close`, falling to nothing at `notice`.
     *
     * A kilometre because that is about as far as anything reads from a car
     * at rally pace on this game's scale, and `close` is where a thing is
     * beside the road and its exact distance has stopped mattering. */
    notice: 1000,
    close: 250,
  },

  flow: {
    /** Corners per km. Under this a stage is a road between two places;
     * over it there is no room left to do anything but turn.
     *
     * MEASURED over 144 stages — three countries, four length bands, both
     * shapes: 5.7 to 10.5 with a median of 8.8. Counted on the pacenote
     * scale, so a bend a co-driver would call counts whoever drew it. */
    corners: band(8.0, 10.2, 2.5, 3.0),
    /** Share of the stage's turns drawn from R3's `hard` bucket — the
     * corners that need the car slowed and pointed. A stage with none is
     * flat out and forgettable; a stage of nothing else is a car park. */
    hairpins: band(0.12, 0.3, 0.1, 0.2),
    /** HOW MANY KINDS OF CORNER the stage really has, as an effective count
     * over the soft / medium / hard split (`effectiveKinds`). Three is one
     * of each in even thirds; 1.4 is a stage of one corner repeated with
     * two exceptions. The one trait with a natural ceiling rather than a
     * chosen one — three buckets is three — so `over` is a formality. */
    severityMix: band(2.15, 3.0, 0.9, 0.01),
    /** Share of the corner-to-corner transitions that CHANGE DIRECTION. The
     * left-right flip is the most rally thing a road does; a run of corners
     * the same way round is a spiral, and R5 caps it at two.
     *
     * A SHARE rather than a count per km, and the first run of this tool is
     * why: switches per km came out at 8.6 against 9.9 corners per km, which
     * is not a second measurement at all — it is `flow.corners` again with a
     * constant on it. What is actually worth knowing is how OFTEN the road
     * changes its mind, and that is a ratio. */
    switches: band(0.76, 0.95, 0.3, 0.05),
    /** Share of the stage's metres on a straight. Too little and the car
     * never gets out of a corner; too much and the stage is a transport
     * section with turns at the ends. */
    straightShare: band(0.3, 0.48, 0.15, 0.18),
    /** The longest stretch where NOTHING happens, m — no corner past soft,
     * no jump, no crest, no water, no junction. Every stage needs one place
     * to breathe and no stage survives two kilometres of it. */
    quietRun: band(190, 400, 140, 380),
    /** Share of the stage the driver has to COMMIT TO BLIND: places where
     * the braking has to start before the road that needs it comes into
     * view. Visibility is one of the four things that decide how hard a
     * corner is and the only one a corner-counting measure cannot see; this
     * is the fraction of the stage where it is the deciding one.
     *
     * Both ends are real. A stage with none of it is a stage nothing on
     * which is ever a surprise; a stage that is mostly this cannot be
     * driven on sight at all, only memorized, and that is the fault rally
     * design warns about when it says a driver must see the apex or the
     * exit early enough to pick a line. */
    blind: band(0.07, 0.2, 0.07, 0.2),
    /** HOW LONG THE STAGE HOLDS ONE CHARACTER, s. The floor is the
     * twenty-second one: a section shorter than that reads as arbitrary.
     * The ceiling is where a section stops being a section and becomes the
     * stage. */
    sections: band(20, 70, 12, 60),
    // Both ends of `sections` are BORROWED, so neither moves to make this
    // tool discriminate better: most of the sweep clears them, and that is
    // the generator being right rather than the trait being idle.
  },

  pace: {
    /** THE REFERENCE CAR IS `ANALYSIS.drive`, and it is not restated here.
     * Every speed in this group is quoted against the same modest car
     * `analysis/speed.ts` profiles with, because they read the same
     * profile — a second copy of its top speed is a second answer to what
     * "flat out" means, and the first thing to go stale. `pace.ts` reads
     * it. */
    /** Top speed reached, km/h. */
    top: band(150, 215, 40, 15),
    /** Mean speed over the stage, km/h — the pace the stage is actually
     * driven at, which is the number a player feels.
     *
     * The ceiling is the FIA's own: 130 km/h is the average an inspector
     * weighs a special stage against, and a road faster than that is one a
     * real organiser would be asked to reroute. It is quoted here against
     * `reference`'s modest car rather than against the quickest thing in
     * the garage, which is the conservative reading of it. The floor is
     * the slow end of the real calendar — a mountain tarmac rally averages
     * the middle seventies and nothing runs much under it. */
    mean: band(80, 118, 22, 20),
    /** THE VARIANCE TRAIT: the spread of the speed profile as a share of
     * its own mean. A stage that is all one speed is one idea repeated,
     * however fast that idea is — nothing on it is fast, because nothing on
     * it was slow a moment ago.
     *
     * The ceiling is ARCADE's, and it is the surprising half: track-design
     * analysis of shipped racing games puts an arcade title's speed
     * standard deviation inside ±30% and a simulator's well outside it. So
     * a stage this generator builds with a swing of 0.5 is not a more
     * dramatic stage, it is a stage from a different genre — the player
     * spends it braking. The floor is this project's, from the sweep: the
     * flattest seeds sit near 0.15 and they are the dull ones. */
    swing: band(0.24, 0.3, 0.08, 0.1),
    /** The slowest point of the stage, km/h. Every rally stage needs one
     * proper second-gear moment, and a stage whose slowest corner is still
     * a fourth-gear sweep has no shape to it. */
    slowest: band(40, 51, 8, 24),
    /** Heavy braking events per km — a sustained shed of at least
     * `brakeDrop` m/s. What a pacenote is FOR. */
    brakings: band(3.0, 4.2, 1.2, 2.0),
    /** ...and how much speed a shed has to lose to be one, m/s. */
    brakeDrop: 8,
    /** Share of the stage held above `flatOutOf` of the reference car's own
     * top speed. The stage's flat-out sections: some is the reward for the
     * corners, and a lot is a bypass.
     *
     * `flatOutOf` is 0.72 rather than something nearer 1 because the
     * reference car's top speed is a straight-line ceiling nothing on a
     * rally stage reaches — measured at 0.9 the first sweep put every seed
     * in the game at four per cent, which is a measurement of the car
     * rather than of the road. Three quarters of it is the speed a stage is
     * actually flat out AT. */
    flatOut: band(0.05, 0.2, 0.05, 0.2),
    flatOutOf: 0.72,
  },

  relief: {
    /** Total ascent per km of stage, m. Under this the stage is on a
     * table; over it the road is a staircase. */
    climb: band(16, 42, 13, 32),
    /** Blind brows per km — the crest the road drops away behind. The most
     * frightening thing a rally road has and the fastest to become a joke. */
    crests: band(0.25, 1.1, 0.25, 1.2),
    /** THE STEEP CURVES: the share of the stage's CORNER metres taken on a
     * gradient past `steepGrade`. A corner on a slope is a different corner
     * — the weight is somewhere else through it — and a stage that has
     * none has kept its two hard things apart on purpose. */
    steepCorners: band(0.12, 0.48, 0.12, 0.36),
    /** ...and the grade that makes a corner a steep one, m per m. */
    steepGrade: 0.05,
    /** How ALIVE the road is under the car: the RMS vertical acceleration
     * the reference car takes from the road's own shape at the speed it
     * drives it, m/s². Zero is a billiard table; a big number is a road the
     * car never settles on. Jumps and their landings are stepped over — the
     * feature is not the surface. */
    undulation: band(3.4, 5.6, 1.4, 3.0),
    /** Share of the corner metres where the road is banked AGAINST the
     * turn.
     *
     * THE ONE BAND IN THIS FILE WITH NO FLOOR, and the reason is borrowed:
     * arcade track-design practice says every corner should be on-camber,
     * because the bank is what lets a player turn without fighting the car.
     * So a stage with none of this is not thin, it is correct, and the
     * question is only how much of it a stage is allowed before the road
     * reads as one nobody built on purpose. R19 banks every corner the
     * generator draws, so what this actually catches is a corner on a
     * hillside whose cross-fall the ground won — which is a real place and
     * worth a few per cent of a stage. */
    offCamber: band(0, 0.04, 0.02, 0.06),
    /** The steepest grade the road sustains over 60 m, m per m. */
    steepest: band(0.08, 0.15, 0.05, 0.1),
  },

  features: {
    /** Jumps per km. */
    jumps: band(0.2, 0.9, 0.2, 0.9),
    /** Water crossings per km — a ford, a bridge or a culvert; all three
     * are the road meeting a stream and all three read from the seat. */
    crossings: band(0.15, 0.9, 0.2, 1.0),
    /** HOW MANY SURFACES the stage really runs on, as an effective count
     * over the metres of each (`effectiveKinds`). Two is a proper
     * gravel-into-tarmac stage; one is a stage on which nothing ever
     * changes underfoot. */
    surfaceMix: band(1.5, 3.0, 0.5, 0.4),
    /** Share of the stage on sealed road (R15/R17). The gravel-into-tarmac
     * hand-over is one of this game's own things and a stage with none of
     * it is missing a trick, but a rally stage is a gravel stage. */
    sealedShare: band(0.05, 0.4, 0.09, 0.3),
    /** How many DISTINCT kinds of set piece the stage has at all — jump,
     * ford, bridge, culvert, crest, tunnel, level crossing, junction,
     * narrow. What makes a stage a place you can describe in a sentence. */
    kinds: band(4, 8, 3, 2),
    /** Share of the stage where the road is narrower than `narrowOf` of
     * its nominal width (R33's wander, plus what the corridor does to it). */
    narrowShare: band(0.12, 0.24, 0.1, 0.14),
    narrowOf: 0.9,
  },

  scenery: {
    /** Share of the road's metres with something standing close on at
     * least one side — trunks, a rock cutting, a wall. The trees crowding
     * the road is what makes a forest stage a forest stage, and a stage
     * that is closed in end to end is a corridor with no view out. */
    enclosure: band(0.22, 0.5, 0.18, 0.25),
    /** ...and how much that CHANGES along the stage: the spread of the
     * enclosure measured over `sampling.window` stretches. Forest, then out
     * onto the open ground, then back in — the trait that makes a stage
     * read as a journey rather than as a length of the same place. */
    enclosureSwing: band(0.11, 0.3, 0.1, 0.2),
    /** Things people built, passed per km: a town, a homestead, a farm, a
     * wind or solar field, a power line crossed, a level crossing, a
     * grandstand, a car park. A rally goes THROUGH a country. */
    landmarks: band(0.5, 2.2, 0.5, 2.0),
    /** Share of the road's metres with standing water in sight — a lake, a
     * river, the sea. */
    water: band(0.04, 0.42, 0.06, 0.3),
    /** How much country the eye reaches over, m: the mean spread between
     * the high and low ground of the far ring around each station. A stage
     * whose horizon never moves is a stage in a bowl. */
    skyline: band(30, 160, 25, 120),
    /** THE SEALED ROADS GO SOMEWHERE: the share of the public roads (R17)
     * that have something at BOTH ends of the stretch running past this
     * stage — a village, a farm, a car park, a level crossing, the junction
     * the rally itself meets them at, or open water.
     *
     * A road is a thing built BETWEEN two places. R17 lays these across the
     * country before the route exists, whole, off one edge of the map and
     * out the other — and a sealed road drawn like that with nothing
     * anywhere near it is scenery pretending to be infrastructure. It is
     * the fault a picture makes obvious at a glance and that no count of
     * corners can see.
     *
     * The floor is not 1: some of a country's roads are passing through on
     * their way somewhere off the map, and a stage that has to justify
     * every metre of tarmac is a stage in a theme park. A stage with no
     * sealed road near it is not measured here at all — whether it should
     * HAVE tarmac is `features.sealedShare`'s question. */
    roadsGo: band(0.6, 1.0, 0.6, 0.01),
    /** HOW MANY KINDS OF GROUND the road actually runs past, as an
     * effective count over the soil / rock / sand / snow / ice / water
     * shares (`effectiveKinds`). Under two is a stage that crosses one
     * country and sees it once. */
    groundMix: band(2.0, 4.0, 0.8, 1.5),
  },

  risk: {
    /** Share of the road's metres with the ground falling away past
     * `dropGrade` inside the shoulder on at least one side — the stage's
     * exposure, and the reason a mistake on a mountain road is a different
     * mistake from one in a field. */
    exposure: band(0.02, 0.3, 0.04, 0.3),
    /** ...and how hard the ground has to fall to count, m per m.
     *
     * MEASURED. Across the sweep the ground beside the road falls at a
     * median of 0.06-0.07 in the taiga and 0.11 in the alps, with the
     * alpine tail reaching 0.8; a threshold up at 0.55 caught precisely
     * nothing anywhere and reported the whole game as unexposed. A little
     * over one in five is where a fall stops being a slope you would rejoin
     * from — and it separates the countries, which is right: the alps ARE
     * the exposed one. */
    dropGrade: 0.22,
    /** Solid things within a road-width of the road's edge, per km. What
     * the car actually hits. */
    furniture: band(8, 16, 5, 14),
    /** Share of the stage where the road is TIGHT FOR THE SPEED: less than
     * `pinchSeconds` of road width per second of travel — a measure that
     * puts a narrow lane at 60 km/h and a broad one at 160 in the same
     * bucket, which is what it feels like, and one leg of the four things
     * that actually decide how hard a corner is.
     *
     * MEASURED: the ratio runs a median near 0.6 s and a tenth percentile
     * near 0.33 across the sweep, so the threshold sits just above that
     * tenth — the tightest-for-the-speed part of a stage, not an arbitrary
     * fraction of it. */
    pinch: band(0.06, 0.32, 0.06, 0.3),
    pinchSeconds: 0.36,
    /** Share of the hard corners R14 guarded — the corners whose inside
     * costs more to cut than to drive. Low means the stage can be
     * shortcut; total means every corner is walled. */
    guards: band(0.35, 1.0, 0.3, 0.02),
  },

  /** THE LADDER — what a SET of stages has to be, which is a different
   * question from what any one of them has to be and the reason this module
   * exists rather than a sweep of `analysis/`.
   *
   * The six best-scoring seeds in a sweep make a bad campaign, reliably.
   * They score well for the same reasons, so they are the same road six
   * times: the player learns it on level one and drives it five more times
   * with different trees. What a campaign needs is stages that are UNLIKE
   * each other and that get harder in order — and neither of those is
   * visible in any one stage's rating.
   *
   * Every band here is over the levels of ONE LOCATION, which is the unit
   * the game actually presents: six stages of a country, in order, on a
   * ladder that has to climb. */
  ladder: {
    /** How well the ladder's difficulties agree with its order, as the
     * share of consecutive pairs that go up. Not 1: a ladder that rises by
     * exactly the same amount at every rung is a spreadsheet, and one rung
     * that steps back before the last climb is how a real championship
     * breathes. */
    climb: band(0.7, 1.0, 0.5, 0.01),
    /** How far the ladder travels: the difficulty of its hardest stage less
     * its easiest. Too little and the last stage is the first one again;
     * too much and either the opener is a tutorial or the closer is a wall. */
    spread: band(0.16, 0.42, 0.12, 0.2),
    /** The biggest single step between two consecutive rungs. This is the
     * wall: one stage that asks for twice what the one before it did is
     * where a campaign loses the player, whatever the spread says. */
    step: band(0.02, 0.14, 0.02, 0.12),
    /** How unlike each other the two MOST SIMILAR stages on the ladder are
     * (`characterDistance`). The trait the whole thing turns on — a ladder
     * is only as varied as its closest pair, and a mean would let four
     * distinct stages hide a duplicate.
     *
     * MEASURED, and it had to be: an eyeballed 0.14 was a wish that all
     * three committed ladders failed, which is a threshold measuring
     * nothing with a worse score attached. Four thousand random six-slot
     * ladders per country — one seed per length-and-shape slot, the way a
     * location's ladder is actually built — put the closest pair at a
     * median of 0.074 in the taiga, 0.081 in the desert and 0.103 in the
     * alps, with the whole range 0.03 to 0.20. So the floor sits above the
     * median: a ladder drawn at random is EXPECTED to have two stages that
     * are nearly the same, and picking one that does not is the work. */
    apart: band(0.09, 0.6, 0.06, 0.02),
    /** ...and the same across the WHOLE campaign, where the closest pair is
     * a minimum over ten times as many pairs and is therefore lower for
     * arithmetic reasons rather than for design ones. */
    campaignApart: band(0.06, 0.6, 0.05, 0.02),
    /** Share of the levels that LEAD the ladder on at least one character
     * axis — the tightest, the fastest, the most exposed. A stage that is
     * nothing's extreme is a stage with no reason to be on the ladder, and
     * this is the cheapest test of whether every rung earns its place. */
    identity: band(0.66, 1.0, 0.6, 0.01),
    /** How well the ladder covers the CONDITIONS it could be run in: the
     * three weathers, the four seasons, and day / dusk / night. One number,
     * as the mean of the three coverages, because a campaign that is clear
     * summer noon six times has thrown away the cheapest variety it has. */
    conditions: band(0.55, 1.0, 0.5, 0.01),
    /** ...and the CARS. Every car in the garage should be the right car
     * somewhere on the ladder — a change from uphill to downhill, or from
     * winding to straight, is what makes the difference between two cars
     * mean anything. Measured as the smallest, over the three cars, of the
     * best share that car reaches on any level of the ladder: a campaign
     * where nothing ever asks for the classic scores low however varied its
     * roads are. */
    cars: band(0.4, 1.0, 0.3, 0.01),
    /** How mixed the ladder's shapes and length bands are. */
    formats: band(0.5, 1.0, 0.45, 0.01),
    /** ...and the quality floor under all of it: the mean stage rating of
     * the ladder, out of 100. Variety is not a licence to ship six bad
     * roads that are bad in different ways. */
    quality: band(62, 100, 22, 0.01),
    /** Which day-parts a level's start hour falls in — the third leg of the
     * conditions coverage. Dusk is a band rather than an hour because the
     * sun's clock runs on from the start at an hour a minute, so a stage
     * that starts at 17:30 is driven into it. */
    dayParts: { night: 5.5, day: 16.5, dusk: 20.5 },

    /** HOW MUCH OF A RUNG'S DEMAND IS THE CONDITIONS rather than the road.
     *
     * The road's own `difficulty` is a fact about geometry, and it is only
     * ever half of what a campaign climbs with. The committed ladder makes
     * this obvious: its taiga stages run 0.30, 0.29, 0.37, 0.34 on the road
     * alone and read as a ladder that does not climb — while what actually
     * happens over those four levels is noon-clear, dawn-clear, dusk-rain,
     * midnight-storm. Rated on the road alone this tool would have told a
     * curator to re-seed four levels that were doing exactly the right
     * thing with the cheapest lever the game has.
     *
     * A THIRD rather than a half, because a storm does not make a straight
     * road into a rally stage: conditions are the multiplier on what the
     * road already asks, and a campaign that climbs on weather alone is one
     * that ran out of roads. */
    conditionShare: 0.32,
    /** ...and what makes the conditions hard, as shares of that third. The
     * weather leads because rain and a storm change the grip under every
     * wheel; the dark is close behind because it takes away the sightline
     * `flow.blind` measures; the season is the smallest because it mostly
     * changes what the stage LOOKS like — except where it freezes the road,
     * which the `slick` axis has already counted on the road side. */
    conditionWeights: { weather: 0.45, dark: 0.38, season: 0.17 },
    /** How hard each weather is, 0..1. */
    weatherDemand: { clear: 0, rain: 0.55, storm: 1 },
    /** ...and each season, on the same scale. */
    seasonDemand: { summer: 0, spring: 0.25, autumn: 0.4, winter: 1 },
  },

  /** What each facet is worth in the stage's score. Flow and pace lead
   * because a rally stage is first a road with a rhythm; scenery and risk
   * are what separate a good road from a good STAGE, and they are weighted
   * under it rather than beside it because a beautiful road that drives
   * badly is not a rally stage at all. */
  weights: {
    flow: 1.15,
    pace: 1.15,
    relief: 1.1,
    features: 1.0,
    scenery: 0.95,
    risk: 0.85,
  },

  /** THE CHARACTER AXES' own scales: the measurement each axis is read
   * off, and the low and high ends it is stretched between. Nothing here is
   * a threshold — these numbers only decide how far apart two stages LOOK,
   * so what they have to be is honest about the range the generator can
   * actually build. An axis whose high end nothing reaches compresses every
   * stage into the bottom of it and stops separating them. */
  character: {
    tight: { lo: 4.5, hi: 12.5 },
    fast: { lo: 82, hi: 116 },
    vertical: { lo: 8, hi: 55 },
    airborne: { lo: 0, hi: 1.2 },
    sealed: { lo: 0, hi: 0.6 },
    enclosed: { lo: 0.04, hi: 0.6 },
    exposed: { lo: 0.01, hi: 0.3 },
    slick: { lo: 0, hi: 0.4 },
    long: { lo: 1400, hi: 11800 },
  },

  /** HOW HARD THE STAGE IS, as the weighted blend of the measurements that
   * actually cost a driver time and paint. The one number a ladder is
   * ordered on, so the shares are the argument: tight corners and a
   * punishing road either side of them are most of what makes a stage hard,
   * speed multiplies whatever else is there, and length is the tax at the
   * end — an easy road is still harder over eleven kilometres than over
   * one. */
  difficulty: {
    tight: 0.24,
    exposed: 0.2,
    slick: 0.16,
    fast: 0.14,
    vertical: 0.12,
    airborne: 0.08,
    long: 0.06,
  },

  /** WHICH CAR THE ROAD ASKS FOR. Each row weights the character axes into
   * one car's share, and the three are normalized against each other — so
   * what comes out is not "how much grip does this stage need" but "of the
   * three boxes in the garage, which one is this road for".
   *
   * The rows restate the catalog's three sentences as geometry: the compact
   * is the sealed-road car that hates rotating, the coupé is the powerful
   * tall-geared one that wants somewhere to use it, and the classic turns a
   * loose, tight, slippery stage into a series of drifts. */
  demand: {
    grip: { sealed: 1.0, fast: 0.45, tight: 0.3, slick: -0.5, exposed: 0.2 },
    power: { fast: 1.0, vertical: 0.5, long: 0.35, tight: -0.45, sealed: 0.15 },
    slide: { tight: 0.9, slick: 0.9, sealed: -0.6, enclosed: 0.25, airborne: 0.25 },
    /** WHAT EACH ROW'S OWN MIDDLE IS, from the sweep — the three rows
     * divided by these before they are compared.
     *
     * Without it the rows are three sums with different natural sizes and
     * the comparison between them is meaningless: measured raw, the median
     * stage in the game came out 0.53 slide against 0.27 grip and 0.21
     * power, so the audit reported that NOTHING in the entire committed
     * campaign is a stage for either of the other two cars. That was the
     * arithmetic, not the roster — `slide` leans on `tight`, and every
     * stage this generator builds is fairly tight.
     *
     * So each row is divided by its own median contribution across the
     * 144-stage sweep, which puts a stage with no opinion at a third each
     * and lets the shares say what they are for: which of the three this
     * road is MORE for than the average road is. Re-measure these whenever
     * the generator moves enough to shift the character axes. */
    scale: { grip: 0.31, power: 0.32, slide: 0.55 },
    /** The floor each share is lifted to before they are normalized. Every
     * road can be driven in every car, so a share of zero would be a lie
     * about the game — and a set of shares that can hit zero makes the
     * campaign's coverage check trip on rounding. */
    floor: 0.12,
  },
} as const;
