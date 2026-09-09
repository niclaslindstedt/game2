// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the analyzer's scoreboard (`budgets.ts`): WHAT THE GROUND
// BESIDE THE ROAD MAY BE — the shelf and the verge, the lanes off it, the
// wires over it, what a frame may cost to draw, and the weights every
// finding is scored against.

export const GROUND_BUDGETS = {
  /** The GROUND the stage is laid across — the layers, and whether the
   * shares of them read as a country. */
  ground: {
    /** R40 — what a COUNTRY has to come out like, per biome: the shares
     * that say "this is a taiga" are not the shares that say "this is a
     * desert", and a check that held both to one band would fail the one
     * it was not written for on every seed. */
    country: {
      taiga: {
        /** Share of the analyzed country standing under water. Some water
         * is what makes a landscape; a map that is mostly lake is a
         * seascape with a road drawn on it. */
        water: { min: 0.01, max: 0.34 },
        /** Share carrying closed forest. */
        forest: { min: 0.12, max: 0.78 },
        /** Relief: the spread between the 5th and 95th percentile of
         * ground height across the country, m. Flat is boring, and a wall
         * of mountain either side of the road is a corridor. */
        relief: { min: 18, max: 260 },
        /** Whether the country is expected to hold shallow water as well
         * as deep — the swamp band below is only asked where it is. */
        swamps: true,
        /** The slope past which soil has no business lying, m per m — the
         * `soil` check's `steep`. Till is washed off anything steeper. */
        soilSteep: 0.45,
        /** Share where the bedrock is at or near the surface — rock, scree
         * and thin moss rather than soil. This is the number that separates
         * a glaciated Swedish landscape from a Norwegian one. */
        rock: { min: 0.02, max: 0.55 },
        /** Share of the country steep enough that a car could not climb it. */
        cliff: { max: 0.3 },
      },
      desert: {
        /** None. A drop of standing water on a desert stage is a defect. */
        water: { min: 0, max: 0 },
        /** A saguaro stand is the closest thing the desert has to a wood,
         * and it is nowhere near closed: the band is a ceiling, not a
         * floor. */
        forest: { min: 0, max: 0.2 },
        /** Worn low, but still country: the dunes alone are a seven-metre
         * spread, and the ranges behind them are what stops it reading as
         * a table. */
        relief: { min: 10, max: 200 },
        swamps: false,
        /** Sand is soil the WIND put there, and it lies at its own angle of
         * repose — about 34°, which is 0.67 m per m — on the slip face of
         * every dune. Till's rule would report every dune on the map. */
        soilSteep: 0.7,
        rock: { min: 0.02, max: 0.55 },
        cliff: { max: 0.3 },
      },
      alpine: {
        /** Tarns on the shoulders and a lake in the valley — never a
         * seascape: the country is mostly mountain. */
        water: { min: 0.003, max: 0.2 },
        /** A mountain forest below a treeline: closed on the flanks under
         * it, nothing above it, so the share runs lower than the taiga's
         * and may run to nearly nothing on a stage set high. */
        forest: { min: 0.02, max: 0.6 },
        /** R47 — the massif: hundreds of metres between the valley floor
         * and the crests inside one stage's box, and the whole point. */
        relief: { min: 120, max: 1100 },
        /** A fen on an alp, not the taiga's mires: too rare to hold to a
         * band. */
        swamps: false,
        /** A mountain forest stands on slopes till would slide off — the
         * flank's scour line (`massif.flankRef`) is what strips it. */
        soilSteep: 0.6,
        /** Most of a massif above its treeline is rock. */
        rock: { min: 0.05, max: 0.9 },
        /** ...and much of a flank is steeper than a car can climb: the
         * road is the way down, not the hillside.
         *
         * R47 — this is also the check that says a massif is a MOUNTAIN
         * and not a wall, which is what it was too loose to do. At 0.65 it
         * accepted a country where two thirds of the ground stood steeper
         * than 1:1 — and that is exactly what the ALTITUDE dial built
         * before the relief was capped, because it grew the crest 13-fold
         * while growing the ground under it 2.2-fold. MEASURED over seeds
         * 1,3,4,7,11,17 at the top of the dial: 0.123-0.513 with the
         * uncapped relief, 0.014-0.125 with the mountain the row now
         * builds. The ceiling sits between the two, so the spike fails on
         * most seeds and a real mountain passes on all of them. */
        cliff: { max: 0.2 },
      },
    },
    /** ...and the share past which it is not a wet stage but a SEASCAPE: the
     * land has gone and what is left is the road standing on its own verge
     * cone. An error rather than a warning, because no dial position should
     * be able to produce it. */
    drowned: 0.5,
    /** SOIL PLAUSIBILITY: soil is till and washed sediment, so it collects
     * in hollows and is scoured off steep ground. Deep soil standing on a
     * cliff is the layering not being obeyed. The slope past which ground
     * counts as steep is the country's (`country.soilSteep`); `deep` is the
     * soil depth that has no business being there, m. */
    soil: { deep: 1.4, share: 0.06 },
    /** Soil depth under which the ground counts as BARE ROCK, m — moss,
     * grass and flowers, nothing with a root. */
    bare: 0.25,
    /** ...and the depth a tree needs to stand in, m, plus how far around a
     * bare-rock probe a trunk still counts as standing ON it. The reach is
     * a couple of cells of the trunk lattice: a trunk right on the edge of
     * a patch of rock is rooted in the soil next to it. */
    rootDepth: 0.4,
    rootReach: 3,
    /** R32 — the SWAMPS: standing water shallower than `deep` metres, which
     * is water you can see the bottom of, grow reeds out of and drive
     * through. `share` is how much of the country should be that rather
     * than open lake — a band, because a landscape with no shallow water
     * has no reed beds and no mires in it, and one that is all shallow
     * water is a marsh with no horizon. It sits low: a swamp is a feature
     * you come across, not the ground you drive on.
     *
     * `deep` matches `STAGE_RULES.geology.pits.swamp`, which is what the
     * generator classifies against — the two are the same claim measured
     * from opposite sides, so they move together. */
    swamp: { deep: 1.2, share: { min: 0.004, max: 0.09 } },
    /** Grove density at or above which a patch counts as CLOSED forest
     * (`GROVES` in props.ts: a meadow is 0.06, a spruce wood is 1). */
    closed: 0.8,
    /** How far off the band each share may drift before the check has lost
     * all of its points — the slack `within` scores against. */
    slack: 0.3,
    reliefSlack: 140,

    /** R47 — IS THE HIGH GROUND A SUMMIT, OR A TABLELAND? Asked only where
     * the biome row carries a massif; `summitShare` in ground.ts says how
     * it is measured.
     *
     * The companion question — is the mountain a mountain or a WALL — is
     * `country.cliff` above, which already had the right shape and only
     * needed its ceiling brought down to where it could answer.
     *
     * `near` — how close to the summit counts as summit, as a share of the
     * country's own spread. A twentieth: on a 1,000 m massif that is the
     * top 50 m, which is a summit ridge and not a shoulder. */
    summit: {
      near: 0.05,
      /** Share of the box standing that close to the top, MEASURED over
       * alpine seeds 1,3,4,7,11,17 on a 96-cell grid. The tuned country
       * reads 0.1-0.6% and the dialled one 0.2-0.8%, so the band is
       * generous either way and still fails a tableland by a mile: before
       * the summit ledge was cut back to the top of the climb, the flat
       * spread over 20-75% of the box on every seed at the top of the dial
       * and NOTHING in this metric reported it — the mesa scored 97.5.
       * Held against the shape deliberately: a wide ledge measures 0.600
       * here and scores zero. The floor is the opposite failure — a
       * country with no ground near its own summit is a spike. */
      share: { min: 0.0004, max: 0.06 },
    },

    /** THE CORRIDOR — the country the road actually runs THROUGH, as
     * against `relief`, which is the country the stage is set in.
     *
     * They are not the same measurement and the difference is the whole
     * point of having both. Every other check in this metric reads the bare
     * geology, and the bare geology can be a mountain range while the
     * ground a driver sees out of the window is a lawn: R31 cuts the
     * country back to a cone beside every road, so a stage can score full
     * marks for relief and still be a ribbon laid across a table with the
     * hills all pushed over the horizon. This one is measured on the
     * terrain field — the ground that is drawn and driven — and it is the
     * only check that can tell the difference.
     *
     * `rise` is how far the ground stands over the road at the far probe,
     * m, at the 75th percentile of the flanks: a BAND, because a stage with
     * nothing standing beside it is a plain you can see clean across and
     * one with everything standing beside it is a trench. `probe` is where
     * the flanks are read, m from the centerline — starting outside R31's
     * bench, because inside it the answer is "flat" by construction and
     * measuring it would only prove the bench exists. */
    corridor: { rise: { min: 3.5, max: 26 }, probe: { from: 22, to: 62, step: 8 }, slack: 9 },

    /** R34 — THE CUTTINGS. How much of a stage runs through rock rather
     * than over it, as the share of road flanks with a cut face standing
     * beside them.
     *
     * ONE-SIDED, and that is the measurement talking. A cutting is where a
     * road could not go round, and a road that follows the country
     * (`elevation.follow`) mostly can: on seed 3 at the default dials 0.9%
     * of flanks come out as rock, at full steepness 5.6%, and only with the
     * stage fully sealed does it reach a quarter. All three of those are
     * right — a soft country genuinely has no cuttings in it, and a floor
     * under this would be a check demanding rock that nature did not put
     * there. What is NOT right is a stage that is all cutting, so the
     * ceiling is where the points are.
     *
     * The flat-world regression this metric exists to catch is `corridor`'s
     * to catch, not this one's: a generator that stopped cutting because it
     * stopped having hills fails there, where it belongs.
     *
     * `face` is how much of `terrain.cutAt` counts as a cutting at all —
     * under it the ground beside the road is a bank, not a wall. `walled`
     * is the run of road, m, with a face up BOTH sides at once past which
     * it stops being a cutting and becomes a corridor with nowhere to go;
     * `walledShare` is how much of a stage may be that before it is a
     * finding. R34 benches the road into the hillside — cut one side,
     * filled the other — so this should stay at zero, and a seed where it
     * does not is a seed where that broke. */
    cut: { share: { min: 0, max: 0.45 }, slack: 0.15, face: 0.35, walled: 260, walledShare: 0.05 },

    /** R32 — THE COUNTRY IS CURVES. The ground is drawn on a 14 m lattice,
     * and every triangle edge on it is a FOLD the player sees; this holds
     * the country to folds a curve makes, and a sharp edge to somewhere it
     * was asked for.
     *
     * Three kinds of ground, told apart before anything is scored. BUILT
     * ground is anything a road shaped — cut, fill, cone, shelf, pad — and
     * its folds are the road's cuttings and embankments: a cutting has an
     * edge, and this does not score one. SHARP ground is what R32 says is
     * deliberately sharp (`geology.sharpAt`): an alpine crest opened by the
     * steepness dial, an escarpment standing as a cliff. Everything else
     * is the COUNTRY, and the country is held to `fold`.
     *
     * `fold` is the dihedral angle across a lattice edge, degrees, past
     * which a fold is a crease rather than a curve: a hill with a radius
     * of curvature of 80 m turns 10° per cell, so 20° is a radius under
     * 40 m — three cells — which is what a knife-edge crest or a fault
     * step drawn without its worn slope looks like on this lattice, and
     * what nothing rounded does. `share` is how much of the country may
     * fold past it before the check has lost all its points.
     *
     * MEASURED over seeds 1-8 at the default dials: with the crests drawn
     * as whalebacks and the crease left to the dial, between 0.01% and
     * 0.2% of the country's edges fold past 20°, against 0.3-1.1% with the
     * old crests — and the worst of those was a 100° knife-edge a hundred
     * metres long. `share.tolerated` sits over that healthy population and
     * `share.fail` is where the check has nothing left.
     *
     * `wall.slope` is a triangle SLOPE, m per m, past which ground is a
     * wall wherever it is and whatever built it: the steepest face rock is
     * ever held at (`verge.cut.face.max`, 1.7) read back across a cell
     * diagonal (× √2), with a little over. What it catches is the
     * query-range seam — a cone that stopped being asked one lattice
     * column before the mountain it was cutting stopped — and it is an
     * error, because no rule stands ground vertical. `wall.fail` is how
     * many such triangles empty the check. `explicit` is the `sharpAt`
     * past which a fold is that feature's rather than the country's —
     * low, because `sharpAt` carries the feature's own weight, and a small
     * mountain's crest creases as deliberately as a big one's. */
    crease: {
      fold: 20,
      share: { tolerated: 0.002, fail: 0.005 },
      wall: { slope: 2.6, fail: 10 },
      explicit: 0.25,
    },

    /** R31 — NOTHING STOPS THE CAR BUT ROCK. The share of the drawn
     * lattice's triangles, past the road's bench, standing steeper than
     * `TUNING.collision.climbLimit` — the grade the physics stops climbing
     * at and starts refusing — on ground that is neither a declared rock
     * face (`cutAt` past `cut.face`: a cutting, or a cone letting go of a
     * mountain) nor the rock's deliberate edge (`sharpAt`). The slope is
     * the physics' own number and is read from there, not restated here.
     *
     * A share and not a count, because a bigger map has more of
     * everything; and a small tolerance rather than zero, because the
     * bare country keeps a few of its own — a hill's scoured flank, a
     * tarn's rim just under the sharp bar, a lattice diagonal reading a
     * curve back steeper than it is. MEASURED over seeds 1-24 at the
     * default dials with the cone letting go, the branch shelves running
     * out, the banks and rims widened, the mounds lowered and the apron
     * seam closed: three seeds in four stand 0.00-0.03% of their triangles
     * that steep, and the rest 0.08-0.19% — a branch standing over a
     * basin, a fill on a hillside — where before it was 0.05-1.9% on every
     * seed and the worst was a cone standing a grass hillside up at sixty
     * degrees. `tolerated` sits over the healthy three quarters, so the
     * rest are reported as the queue they are; `fail` is a stage with such
     * a hillside beside every corner. */
    climb: { tolerated: 0.0006, fail: 0.004 },
  },

  /** COST. The generator runs in the game, on a phone, every time a stage
   * starts; the analyzer runs here. So the analyzer is allowed to be slow
   * and the generator is not, and the only way that stays true is for the
   * analyzer to time it. */
  /** THE OTHER ROADS (`lanes.ts`): every branch, drive and car park lane,
   * rolled down on the ridden ground the way the rollers roll the stage. */
  lanes: {
    /** Stride along the road, m. A metre — under the samples' own spacing
     * (`SPUR.step`), so a step that falls BETWEEN two samples is met: the
     * staircase this metric was written to catch had a tread every four
     * metres and read as an 8% grade at a four-metre stride. */
    stride: 1,
    /** How far past a road's end the walk runs onto the pad or the yard it
     * reaches, m, so the hand-over there is measured as road. Never past
     * the end that stands on another road: that walk crosses the other
     * road's crown square, which is a bump no car drives. */
    past: 6,
    /** The two wheel-track balls' offset from the centerline, m — inside a
     * lane's own mat (the narrowest is `carPark.road.width`, 5 m). */
    track: 0.9,
    /** Biggest step the ground may take over one stride, m per m — the
     * rollers' mat budget, and the same failure bar: past `fail` the car
     * meets an edge. */
    step: { warn: 0.16, fail: 0.5 },
    /** A BUMP, m: the second difference over three strides. Tighter than
     * the rollers' because the stride is shorter — the same hollow reads a
     * quarter as big at a quarter the spacing. MEASURED: after the index
     * was made to interpolate, seeds 1, 38, 75 and 112 roll under 0.03 m
     * everywhere but the joins into another lane, which reach 0.25. */
    bump: { warn: 0.06, fail: 0.25 },
    /** How far over its own ceiling a road's grade may be laid before it
     * is reported, m per m — the pad's plane is allowed to be a shade
     * steeper than the lane onto it — and where a grade is an error
     * whatever the road: the drivability metric's own failure bar. */
    gradeSlack: 0.02,
    gradeFail: 0.22,
    /** How fast the grade may change, m per m per m: a shade over the
     * minor road's own crest rule (`elevation.follow.minorCrest`), which is
     * what every road off the stage is bent by — and a lane still meets a
     * pad's plane and a road's cross-section at a kink of its own; `fail`
     * is a brow a car leaves the ground over. */
    crest: { warn: 0.016, fail: 0.05 },
    /** How far the ridden ground may stand off the profile at a sample,
     * m — a crown's worth — and where it is a face. */
    agree: { warn: 0.3, fail: 1 },
    /** As the rollers': a few marginal strides in thousands are the
     * measurement, not the road. */
    tolerated: 0.001,
  },

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
     * `groundAt` is read several times per physics step and once
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
  /** R45 — THE GRID. The line is PLANNED against the survey (the bare
   * country, and the route's samples where a road stands over it) and
   * MEASURED here against what got built, so every slack below is the gap
   * between those two allowed to be a blemish rather than a defect. */
  wires: {
    /** How far apart a span is sampled along its length, m, and how fat
     * the wayleave's tree probe is. Finer than the placer's own probe:
     * this is the measurement, and it is allowed to cost more than the
     * thing it measures. */
    step: 8,
    wayleaveStep: 14,
    wayleaveProbe: 3,
    /** How near a road a point has to be before the span over it owes the
     * road's clearance rather than the country's, m — the widest corridor
     * plus its verge, with room for the road to have wandered (R33). */
    roadReach: 24,
    /** How much nearer a road than R45 allows a tower may stand before it
     * is a finding, m. The placer measures to the route's CENTERLINE at
     * the stage's nominal width; the terrain answers from the road's own
     * edge at the width it came out, and R33's wander moves that. */
    clearSlack: 4,
    /** ...and how much more fall across a tower's base the BUILT ground
     * may show than the survey read, as a multiple of the placer's own
     * limit. A tower at the top of a cutting stands on ground the road
     * blasted after the line was surveyed. */
    levelSlack: 1.6,
    /** The share of a line's spans that may be STRETCHED ones before the
     * line stops reading as a designed line and starts reading as a walk
     * that kept failing. One crossing span in a line is the picture; half
     * of them stretched means the band is wrong. */
    stretchShare: 0.25,
    /** How far from the nearest road a line's END has to be before it is
     * out of sight, m — past the fog, with room for the draw-distance
     * option's own reach. */
    fog: 700,
  },

  weights: {
    rollers: 1.6,
    water: 1.4,
    roads: 1.2,
    /** A stage has one or two junctions and they are the two places on it
     * where the world has to look BUILT — so a defect at one is worth as
     * much as a defect anywhere else on the road, over a hundredth of the
     * ground. */
    junctions: 1.2,
    drive: 1.4,
    jumps: 1.2,
    /** The ends carry the most of any metric: every other check is a
     * question of how good a stage is, and these are the ones that decide
     * whether a mode runs on it. */
    ends: 1.8,
    ground: 1,
    /** The roads off the stage are driven by a player who ignores the
     * tape, and by nobody else — but a staircase down one is a staircase
     * on every branch of every stage. */
    lanes: 0.8,
    /** R45 — one line on a little under half the seeds, and nothing on the
     * rest. Light for that reason and no lighter: the one thing it can get
     * wrong is a wire hanging over the road at head height, which is the
     * kind of defect a player photographs. */
    wires: 0.8,
    perf: 0.8,
  },
} as const;
