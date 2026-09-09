// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the stage generator's rule book (`rules.ts`): THE COUNTRY
// THE ROAD RUNS THROUGH — the rolling elevation profile, the massif and the
// dunes standing on it, how rough the ground is, the bank a corner is laid
// on, the verge falling away from the road, and how wet and how forested the
// country is. Spread into `STAGE_RULES` by `rules-book.ts`.

export const LAND_RULES = {
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
    /** Height of the longest wave, meters (peak to trough is twice this).
     *
     * A word about what this band is NOT for, because it looks like the
     * knob to reach for and it is not. How far the road actually travels up
     * and down over a kilometre is dominated by `follow` below — the
     * COUNTRY the road is laid along — and this noise is the road's own
     * character riding on top of it. Measured on seeds 1-8 at medium, the
     * roll contributes about 5 m/km against the country's 29, and raising
     * the band by half moved a stage's total travel by under a metre per
     * kilometre while pushing the road's crossings far enough off the
     * ground to float R18's watercourses. Reach for `follow.lag` instead:
     * that is the number that says how much of the country reaches the
     * road, and it moves the answer. */
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
     * `lag` is the response length, m — AND IT IS THE STAGE'S UNEVENNESS,
     * which is not obvious and is worth stating where somebody looking for
     * that knob will find it. How much the road travels up and down is
     * almost entirely how much of the country reaches it, and this is the
     * number that decides that: it is the eye of the man who laid it out.
     * Long, and he is a highway engineer running a graded line across the
     * landscape and reading nothing under a quarter of a kilometre — a
     * road that is smoother than the ground it is on, everywhere, which
     * over a whole stage reads as a ribbon laid on a picture of a country.
     * Short, and he is following the ground with a bulldozer, and the road
     * rises and dips with every shoulder and hollow it crosses.
     *
     * MEASURED. Over seeds 1, 3 and 7 at medium the road's total travel is
     * 30 / 56 / 33 m per km at 200, 39 / 52 / 41 at 120, and 48 / 64 / 47
     * at 70. 120 is where the road is plainly following the country
     * without the cut and fill (and the analyzer's ground findings) that
     * comes with hugging every hummock of it. `analysis/drive.ts`'s
     * `rolling` check is what holds it there.
     *
     * `grade` is the gradient, and has to leave room under
     * `ANALYSIS.drive.grade` for the rolling noise riding on top of it,
     * which is where the rest of that budget goes — the two ADD, and a
     * follower given the whole budget puts every stage over it.
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
    follow: {
      lag: 140,
      grade: 0.075,
      crest: 0.004,
      /** ...and the crest rule for a MINOR road — a branch, a drive, a car
       * park's lane (`followStep`): three times the route's. A rally road
       * is crested for a car at pace; a lane into a car park is driven at
       * a walk, and it has to make a pad's plane or a road's edge over a
       * few dozen metres, which the route's own rule cannot bend fast
       * enough to do. */
      minorCrest: 0.012,
      freeboard: 3.5,
    },
    /** R34 — how far the road may stand OFF the country it crosses, m: up
     * on fill, down in cut. The lag and the grade clamp say how fast the
     * road may follow the land; nothing said how far behind it was allowed
     * to get, and over ground that falls away faster than the clamp lets
     * the road descend, the answer was as far as it liked.
     *
     * That is what builds a road flying thirty metres over a hollow with a
     * sixty-degree side, which is not an embankment — it is a wall the car
     * goes over and does not come back from. The terrain cannot fix it
     * either way round: hold the fill up and it is a mesa, let it go and
     * the road hangs in the air.
     *
     * Measured rather than guessed. Over 24 seeds the fill a stage
     * actually needs is 6.7 m at the median and 18.2 m at the ninetieth
     * percentile — and then a tail running to 68 m, which is a viaduct
     * nobody asked for. The cap sits above the ninetieth so ordinary cut
     * and fill is untouched and only the tail is refused; the search then
     * draws a different line, which is what it is for. */
    maxFill: 22,
    maxCut: 24,
    /** R34/R47 — THE STEEPEST GROUND A ROAD MAY BE PLANNED ACROSS, m per m
     * of the bare land under a probe point.
     *
     * The caps above ask how far the road stands OFF the country; this asks
     * whether there is any country under it to stand off. A road descends
     * at `follow.grade` and no faster, so ground falling away faster than
     * that has to be crossed along its contour — and the search draws its
     * corners blind. Where the land runs at ten to one, a candidate that
     * looks level at one probe point is five hundred metres in the air at
     * the next, and the offset caps never see it: they are measured on the
     * search's own coarse walk, and it is the COMPILER'S finer one that
     * finds the drop. So the ground itself is refused, and the search does
     * what it does with any refusal — draws a different line.
     *
     * Set above anything the countries actually build at the middle of the
     * ALTITUDE dial (the alpine's flank tops out at 2.5 there), so it is a
     * dead rule on every stage the game shipped with and comes alive only
     * where R47 stands the rock up. MEASURED at the top of the dial over
     * seeds 1-6: without it 31% of a stage's samples stood more than 40 m
     * off the land, the worst of them 893 m — a road in the sky. */
    maxLandGrade: 3,
    /** ...and how the cap RELAXES when a country will not yield a stage
     * inside it, the way the water's setback does. Some countries are all
     * ridge and ravine, and a stage has to cross them somehow; the last
     * rung is no cap at all, which is where this rule started. */
    fillLadder: [1, 1.7, 3, 0],
  },

  /** R47 — THE MOUNTAIN, as the SEARCH sees it (the massif itself is the
   * biome row's, `BiomeLand.massif`, and the bore's numbers are `tunnel`
   * above). */
  massif: {
    /** How the search READS THE COUNTRY when a corner is drawn in a
     * country that steers (`BiomeLand.steer`): the mirrored corner is kept
     * when it fits the land better by `margin` metres, and a corner's fit
     * is charged `climb` metres of misfit per metre of height it gains
     * (and credited the same per metre it loses), so the stage comes down
     * off the mountain rather than contouring round it forever. Over the
     * fill cap's own size on purpose: a corner that turns down the flank
     * stands further off the land than one that holds the ridge, and read
     * on fit alone the search keeps every stage on the crest it started
     * on — seeds 1-6 came down under 150 m of a 560 m start at 0.6.
     *
     * At 1.6 that charge was still far too small to be the thing deciding
     * a corner: the off-land term it is added to runs to tens of metres,
     * so a corner turning twenty metres downhill was credited thirty-two
     * against it and the search went on contouring. MEASURED over seeds
     * 1,3,4,7,11,17 at the top of the dial, the stage's net descent goes
     * 88 m at 1.6, 112 m at 4 and 142 m at 9, and stops moving on that
     * sweep above it.
     *
     * It is 20 rather than 9 because a MEDIUM seed sweep is the wrong
     * place to read this: the shorter a stage is, the fewer corners the
     * charge gets to act on, so a short one goes on contouring long after
     * a medium one has committed. The campaign's own stages say it plainly
     * — at 9 the short `alpine-1` descends 29 m over 1.75 km (1.7%, with
     * 164 m of mountain under its start), and at 20 it descends 81 m,
     * while `alpine-2` goes 115 m to 210 and `alpine-4` 217 m to 346.
     * Tune this against the campaign's four sprint lengths, never against
     * one of them.
     *
     * What is left holding the road back is R23 in HEIGHT
     * (`armSeparation`): two legs of a switchback stacked twenty metres
     * apart need eighty-four metres of horizontal room, because the ground
     * between them has to be climbable, and a real hairpin stack holds it
     * with a retaining wall the terrain does not build. That is the next
     * thing to move, and it is a terrain feature before it is a number. */
    contour: { margin: 1, climb: 20 },
    /** What the `peaks` dial does to a massif: MULTIPLIERS on its ridge
     * period (`massif.scale`) and on the share of the folded noise that is
     * VALLEY FLOOR (`massif.valley`), read the way the difficulty dial
     * reads its own (`challengeMul`): `easy` is the factor at the bottom
     * of the dial, `hard` at the top, and the middle is exactly the row.
     * At 0 the period is two and a half times the tuned country's and
     * twice as much of the ground is floor — one mountain in a plain; at 1
     * the period is little over half and the floors are narrow — a range. */
    peaks: { scale: { easy: 2.5, hard: 0.6 }, valley: { easy: 2, hard: 0.7 } },
    /** R47 — WHAT THE ALTITUDE DIAL DOES TO A MASSIF.
     *
     * `down` and `up` are MULTIPLIERS on the row's own crest height
     * (`BiomeLand.massif.height`), read geometrically about the dial's
     * default (`altitudeMul`), so the middle of the dial is exactly the
     * country the row was written for.
     *
     * `summit` is what turns that amplitude into the number the SLIDER
     * PRINTS. The massif's own height is not how high the country ends up
     * standing: the taiga's swell and hills ride on top of it, the
     * `elevation` dial's relief and the `steepness` dial's rise multiply
     * it, and the ground tops out well over the figure in the row.
     * MEASURED over seeds 1-6 at four positions of this dial, the ratio is
     * 1.34 to 1.38 and does not drift with it — so one factor states it,
     * `altitudeOf` reads the row through it, and `up` is set so the top of
     * the travel builds a mountain that really does top out at six
     * thousand metres rather than at eight. The bottom of the travel is a
     * 175 m shoulder. `tests/alpine_test.ts` holds both ends against the
     * GROUND, not against the arithmetic, which is the only way this stays
     * true.
     *
     * `reliefCap` — THE LOAD-BEARING ONE, and where the dial's travel
     * SPLITS. A realistic mountain and its own peak cannot both fit a
     * stage's box above about 1,500 m of relief: for a peak to be IN the
     * box the ridge period has to stay near the box's own size, and for
     * the flank to be a mountainside rather than a wall the height has to
     * stay under about half that period. Ignoring that is what the dial
     * did — it grew the crest 13-fold and the ground under it 2.2-fold,
     * and MEASURED at the top of the travel the country came out with a
     * median grade of 1.08 and a 99th percentile of 16.5, which is not a
     * mountain but a spike field. `ground.cliff` now refuses it.
     *
     * So only the first `reliefCap` of the travel is RELIEF. Past it the
     * dial lifts the whole country instead — `AltitudeScale.base`, metres
     * above the sea that NO geometry reads: the lakes, the pits and the
     * water table keep their origin near 0 and are untouched, while the
     * bands, the air's lapse rate and the figure the slider prints all
     * read the country as standing that high. At the top of the travel
     * that is a 748 m massif on a country standing 4,982 m up — the slider
     * still says 6,000 M, and it is now true in the way the Andes are
     * true rather than by drawing a six-kilometre spike in a two-kilometre
     * box. Everything above the snowline is snow and rock, because at
     * 5,000 m it is.
     *
     * The other four are EXPONENTS on the CAPPED multiplier, and between
     * them they are the character of the mountain. The idea they are all
     * made of: NOTHING about a mountain scales with its height. A range
     * twice as high is not a photograph of a smaller one enlarged — it
     * stands on more ground; it is bent harder about its own crest; more
     * of it is above the snow; and more of what is between its ridges is
     * flat valley floor rather than hillside. Every figure below is over
     * seeds 1,3,4,7,11,17, medium sprints, at the top of the dial unless
     * it says otherwise.
     *
     * `spread` — how fast the ridge system's PERIOD grows with the relief.
     * It carries the whole of the realism: the flank's grade is the height
     * over the period, so this is what decides whether the country is a
     * mountainside or a wall. At 0.3, where it was, the top of the dial
     * measured a 99th-percentile grade of 16.5 — the spike above. At 0.74
     * the ridges stand 4.7 km apart under a 748 m crest and the same
     * measurement is 0.88 to 1.33, against 0.74 to 0.88 for the tuned
     * country: a mountain half again as steep as the one the row
     * describes, which is what a dialled-up mountain should be, and one a
     * road can be laid down.
     *
     * `valleyPull` — how much of the fold the VALLEY FLOOR takes as the
     * mountain grows (`BiomeLand.massif.valley`, pulled toward 1). What
     * keeps the bottom of the mountain a place rather than a line: the
     * floor widens into a proper valley with room for the lakes and the
     * green, and the flank is squeezed into a narrower band of the same
     * period, which stands it up again for free.
     *
     * `plateau` — how fast the summit is cut into a LEDGE as the mountain
     * grows (`altitudeScale.shelf`, a blend from the row's own flank to
     * the capped one; `ledgeCap` in geology.ts is the shape and says why
     * the flank UNDER the brow is left exactly as the row wrote it). The
     * ledge is what gives R35 somewhere level to put a start and what
     * keeps the road on the land at the top; what it must not do is
     * flatten the mountain, which is the failure `ground.summit` was
     * written to catch after an earlier pass spread the summit over
     * 20-75% of the box. It now measures 0.2-0.8%, against 0.1-0.6% for
     * the tuned country.
     *
     * `siting` — how hard a metre of unlevel ground counts against the
     * height it buys when R35 picks its shoulder, as an exponent on the
     * relief. It was 3, which on the uncapped height was 3,277 m of
     * penalty per metre of spread — so the flattest ground won whatever
     * its height, and the flattest ground on a mountain is the valley
     * floor. With the relief capped it is a far smaller lever anyway; at
     * 1 the start sits 78% of the way up its mountain on average, against
     * 66% at 3, and dropping it to 0 puts the grid on a face and costs 26
     * errors against 2.
     *
     * `zones` — how fast the country's own bands climb, read against the
     * WHOLE travel rather than the capped part, because a snowline is a
     * height above the sea. Three quarters is what lands the alpine's
     * bands on the real Alps' own lines — a treeline near 1,600 m and
     * permanent snow near 2,900 — while leaving the tuned country
     * untouched at the middle. */
    altitude: {
      down: 0.38,
      up: 12.975,
      reliefCap: 2.2,
      spread: 0.74,
      valleyPull: 0.25,
      plateau: 1,
      summit: 1.36,
      siting: 1,
      zones: 0.84,
    },
    /** How many iterations one sub-seed attempt is given before it is
     * given up on, in a country with a massif. The taiga's cap is a
     * thousand plus half the band; a mountain attempt that has not found
     * its way down inside this many is walking a pocket on the flank with
     * no way out, and every winning attempt over the first forty long and
     * extra-long seeds closed inside 2,500 — while the ones that failed
     * burned the taiga's whole cap first. Restarting is cheaper than
     * unpicking (`circuit.ts` found the same). */
    iterations: 2500,
  },

  /** R40 — THE SAND, as the DIAL sees it (the field itself is the biome
   * row's, `BiomeLand.dunes`, and the country a rest dial builds is the
   * numbers in that row). */
  dunes: {
    /** What the DUNE row PRINTS: how high a full-grown dune stands over
     * the trough beside it, m. Nothing at the bottom — a country the wind
     * has stripped to its rock — and a hundred metres at the top, which is
     * a real erg: the Namib's and the Empty Quarter's big transverse dunes
     * run between fifty and a hundred and fifty. The dial reads onto it
     * LINEARLY because a height is a quantity a player can picture at every
     * point of the travel, unlike a mountain's (`altitudeMul`), which spans
     * forty-six times its own bottom and has to be read geometrically. */
    height: { min: 0, max: 100 },
    /** How fast the dune's PERIOD across the wind — and with it the ERG,
     * the field the sand sea occupies at all — grows with its height.
     *
     * Under 1, so a bigger dune is also a STEEPER one: that is what a real
     * dune field does as it matures, and it is what makes the top of the
     * dial read as something other than a photograph of the bottom of it
     * enlarged. It cannot go much further under 1 than this, because sand
     * has a ceiling no exponent may cross — the angle of repose (about
     * 34°, `budgets.ts`'s `soilSteep`) — and the top of the travel is set
     * to arrive just under it. A dune standing steeper than repose is a
     * wall of something that is physically a liquid. */
    spread: 0.75,
    /** How much SHARPER the crest is than the rounded fold the ridged
     * noise gives on its own: the exponent the profile is raised to. Above
     * 1 it presses the troughs flat and leaves the sand standing in
     * distinct dunes with interdune corridors between them, which is what
     * a sand sea looks like from the ground and what the bare fold does
     * not — the bare fold is a corrugation, every metre of it on a slope.
     *
     * It is held LOW because all of the exponent's curvature lands on the
     * CREST, and curvature is the one thing the drawn lattice cannot hold:
     * a ridge that turns over inside a 14 m cell reads back as a bump on
     * the verge rather than as a dune. Measured over eight desert seeds at
     * the dial's rest, the verge's bump tally ran 97 findings at 1, 102 at
     * 1.25 and 133 at 1.6 — the interdune corridors are worth a hundred,
     * the sharper ridge is not worth a hundred and thirty. */
    crest: 1.25,
    /** The shortest period the sand is ever drawn at, m — the floor under
     * `spread`'s shrinking. The ground is TRIANGULATED on a 14 m lattice
     * (`GROUND_CELL`), and a wave near that spacing is not a landscape, it
     * is a washboard: it turns over inside a couple of cells, reads as
     * corrugation and launches the car off every ripple. Six cells and a
     * half, so the bottom of the dial gives low sand rather than fine
     * sand. */
    floor: 90,
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
   * Every bump is MARGINAL by design. A hand's height is what the car
   * notices as a road with a surface; half a metre is a pothole, and a
   * generator that scatters potholes has made a different and worse game.
   *
   * THE BAND THIS COVERS IS THE POINT, and it is why the numbers are wider
   * than "a bump" sounds. The road's own rolling profile
   * (`elevation.wavelength`) is hundreds of metres long and the country it
   * follows is longer still, so between those and a stone under the blade
   * there was NOTHING: no shape at the ten-to-thirty-metre scale, which is
   * exactly the scale a car reads as the road being uneven. A road with
   * long hills and a clean surface between them reads as a ribbon somebody
   * extruded, however far it climbs. So a defect here runs from a couple of
   * metres — a stone, a scour — up to a frost heave the length of a house,
   * which is what real frost heaves are. */
  roughness: {
    /** One candidate bump per this much arc, m, and the chance it is there.
     * Together they set the spacing: at 14 m and a bit under a half, a bump
     * every thirty metres or so of gravel, which is a road you can feel
     * without a road that is fighting you. */
    cell: 14,
    chance: 0.45,
    /** How proud or how sunk one is, m — a heave or a hollow, either sign.
     * The ceiling is the number that keeps this a surface rather than an
     * obstacle: at the long end of `halfWidth` it is a grade of two per
     * cent, which the car breathes over, and at the short end it is the
     * lip of a scour. */
    height: { min: 0.03, max: 0.14 },
    /** ...and how long it is, m (half-width, so a bump is twice this end to
     * end). Longer than the sample spacing by enough that the compiled road
     * actually draws the shape rather than aliasing it into a step, and
     * capped under `cell` so that summing the three cells around a query
     * catches the whole of one — a bump whose tail reached past that would
     * be cut off at a cell boundary, which is a step, which is the one
     * thing this must not produce. */
    halfWidth: { min: 2.2, max: 11 },

    /** R33 — and the gravel road's WIDTH is not one number either. A dirt
     * road is TIGHT for most of its length — as narrow as the traffic on it
     * can live with, because every metre of it had to be cut and has to be
     * bladed again every spring — and it opens out here and there where two
     * vehicles have to be able to meet, and at the corners, where the
     * sweep of anything long enough to need one has widened the bend.
     *
     * Three terms, and they are three different facts about the road:
     *
     * `narrow` is the share of the stage's nominal width the gravel is
     * actually cut to. Under 1 on purpose: `roadWidth` is the width the
     * turn vocabulary, the grid and R23's clearance are all sized from, and
     * every one of those wants the wide answer, but the road a car drives
     * down should be tighter than that or a corner is not a commitment.
     *
     * `vary` is the share of the nominal it then swings either way, so the
     * road runs from `narrow - vary` to `narrow + vary` of the stage's
     * width — enough to see, to place the car against, and to notice
     * arriving. `wave` is how far it takes to swing, m: long, so this reads
     * as the road opening out and pinching in rather than as a ragged edge.
     *
     * `corner` gives it back at the bends. A drift needs somewhere to go,
     * and a road cut to a lane everywhere is a stage that can only be
     * driven neatly — so a corner opens out toward the nominal again,
     * `gain` of the width at its widest and half of that at `pivotRadius`.
     * It is the same shape the bank uses and for the same reason: what is
     * being asked is how much of a corner this is.
     *
     * SEALED road does none of this. A paving machine lays a constant
     * width, which is the same reason the tarmac has no bumps on it. */
    width: {
      narrow: 0.8,
      vary: 0.11,
      wave: { long: 210, short: 74 },
      shortShare: 0.35,
      corner: { gain: 0.24, pivotRadius: 70 },
      /** Meters of road the width rolls in and out over. Curvature steps at
       * a segment boundary, so the corner term steps with it — and a mat
       * that gains a metre inside one 2 m sample is a notch in the edge of
       * the road, not a road opening out. The same triangular walk the bank
       * gets (`R.bank.runoff`), for the same reason. */
      runoff: 40,
    },
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
    max: { gravel: 0.125, asphalt: 0.055 },
    /** The radius that earns half the ceiling, m — tighter corners bank
     * harder, and the curve flattens off rather than running away.
     *
     * PER SURFACE, because the two cross-falls have different causes. A
     * sealed road's is DESIGNED: a highway engineer superelevates the
     * corners that need it and leaves the rest of the road on its camber,
     * so the tilt is reserved for genuinely tight geometry and the pivot is
     * short. A gravel road's is WORN — every car that has ever turned here
     * has pushed loose stone from the inside of the bend to the outside,
     * and that happens on any corner at all, not just the ones an engineer
     * would have banked. So the gravel pivot is long: the tilt is in by the
     * time the road is merely bending, which is what stops a stage of
     * fourth-gear sweepers reading as flat ground with a line painted on
     * it. Verified by `analysis/drive.ts`'s `tilt` check, which measures
     * what the gravel corners on a stage actually come out at. */
    pivotRadius: { gravel: 105, asphalt: 42 },
    /** Meters of road the cross-fall rolls in and out over. A road does not
     * change its cross-section in a step; the runoff is what makes a banked
     * corner something the car settles into instead of hits. */
    runoff: 34,
  },

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
    /** THE STEEPEST GROUND A ROAD MAY SHAPE SHORT OF ROCK, m per m. Every
     * slope the terrain BUILDS beside a road — the cone letting go of the
     * country at the end of its reach, a branch's embankment running out to
     * the field, a stream's bank — is held under this, and anything a road
     * leaves standing steeper is a ROCK FACE and has to say so
     * (`terrain.cutAt`): bedrock paint, nothing rooted on it, exempt from
     * the analysis's climb check. That is the whole rule about nature and
     * the car: the country never stops the car unless it is rock, and rock
     * is a thing somebody asked for. Held under `collision.climbLimit` by
     * the lattice's own margin (a triangle across a cell diagonal reads a
     * field back at up to √2 times its grade), which `rules_test` pins;
     * `climb` above is the gentler grade the RUNOFF is battered to, and
     * this is the most any built slope past it may steepen to. */
    climbable: 0.62,
    /** THE CREST OF A FILL — how far past the lip an embankment's side is
     * rounded over before it falls at its own grade, m. The lip is level
     * and the side falls at `climb` or steeper, and a KINK between the two
     * is a shape the ground lattice cannot draw: a tile triangle from a
     * corner on the verge to one down the face chords under the crest by
     * up to half a cell's fall — one to four metres on a tall fill — and
     * along the road that chord comes and goes once a cell, a step in the
     * verge on every country that the analysis reports as a face
     * (`rollers.grade`) and the picture shows as the ribbon's edge standing
     * over a trench. So the side leaves the lip LEVEL and steepens evenly
     * over this run until it is falling at the fill's grade, and is straight
     * at that grade from there; the fill's top is half this run wider and
     * its face no different. Three lattice cells: a chord `c` long sags
     * under the arc by `grade · c² / (8 · crest)`, the cell diagonal by a
     * metre and a quarter on a face at a grade of one, which the lattice
     * takes up inside the verge's own tolerance. A RUN and not a bend,
     * because a fill on a steep hillside stands at its hillside's grade
     * plus a little, and a crest rounded to a fixed bend held such a fill
     * out over the falling country for a hundred metres — landing it on a
     * face at `climbable` at the end of its reach. (`rules_test` holds the
     * run to the lattice.) */
    crest: 42,
    /** ...and where the cone LETS GO: how much of the END of its reach it
     * blends back onto the country over, m. A cone is a min, and a min that
     * simply stops being asked past its reach ends in a WALL — the country
     * standing however high it stands one query cell further out, ruled
     * dead straight along the lattice. Beside a mountain that was fifty
     * metres of vertical rock two hundred metres from any road, on ground
     * no rule had touched. So over the last `fade` metres the cone rises to
     * meet the ground it was cutting, by exactly the excess that ground
     * stands over it and no more: where the country is a few metres over
     * the cone the join is a shoulder a car drives over, and where a
     * mountain stands fifty metres over it the join is a face — declared as
     * rock, because it is steeper than `climbable`. Nothing is ever left as
     * a seam. A branch's cone lets go inside the reach its index is
     * guaranteed to find it within, for the same reason. */
    fade: 60,

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
    /** R35 — what the dial does to the ROUTE's setback from that water, as
     * a multiplier on `water.routeClear`.
     *
     * It has to shrink as the dial rises, and the reason is not a tuning
     * preference — it is that the rule inverts the dial otherwise. Turning
     * the water up puts more lakes on the map, a fixed setback then pushes
     * the route into whatever dry corridors are left, and the stage you
     * drive comes out with LESS water beside it than a dry seed's: the
     * analysis measured a wet stage at 0.29 of water against a dry one's
     * 0.37, which is the dial working backwards.
     *
     * It is also simply what lakeland roads do. In dry country a road can
     * afford to keep its distance from the one pond it passes; in a
     * country that is half water there is nowhere to keep it, so the road
     * runs the shore — which is the whole character of the place. */
    routeSetback: { min: 1.3, max: 0.3 },
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
} as const;
