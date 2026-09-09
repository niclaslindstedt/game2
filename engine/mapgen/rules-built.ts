// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the stage generator's rule book (`rules.ts`): THE NETWORK
// THE STAGE MEETS — junctions onto the public roads, the square crossings
// over them, the railway, and the traffic that does not stop for the rally.
// Spread into `STAGE_RULES` by `rules-book.ts`.

export const BUILT_RULES = {
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

    /** R17 — THE MOUTH: how the MINOR road opens out where it meets the
     * sealed one. A dirt road that arrives at a junction the same width it
     * ran at leaves a wedge of country between its near edge and the main
     * road's, tapering to a knife point — which is the tell that two
     * ribbons collided rather than two roads meeting. In life there is no
     * wedge, and the reason is traffic: every car that turns out of the
     * lane cuts the corner, and season after season the mouth is worn and
     * bladed WIDER until the two mats are one piece of ground.
     *
     * So the minor road's mat is flared into a TRUMPET, and three
     * properties of that shape are the whole point. Getting any of them
     * wrong is visible from the air, and each has been:
     *
     * - It is WIDEST AT THE TARMAC. The mouth's job is to give a car
     *   leaving the dirt road room to turn either way onto the seal, and
     *   that room is needed where the two meet. A flare that peaks a few
     *   meters short and closes again reads as a bulge in a lane.
     * - It opens GRADUALLY. Narrow down the length of the lane, opening
     *   over a stretch of it, not a step.
     * - It STOPS at the main road's edge, and the dirt stops with it. Past
     *   that line the ground belongs to the through road, which is already
     *   paving it — carrying the flare across puts a mushroom of dirt out
     *   into the field on the far side, and carrying the SURFACE across
     *   drives a band of gravel through the middle of a sealed road.
     *
     * `wide` is the extra half-width at the tarmac and `taper` the length of
     * lane it opens over, both as shares of the road's own width, so the
     * mouth of a lane and the mouth of a boulevard are the same PLACE at two
     * scales. At 0.6 and 1.1 the throat is a little over twice the road and
     * opens over a road and a bit of it — which is what a graded side road
     * meeting a country highway looks like. `run` bounds how far back the
     * widening may reach at all, in road widths: a corner that hugs the main
     * road for a hundred meters is not a hundred meters of mouth. */
    mouth: { run: 3, wide: 0.45, taper: 1.1 },
    /** R17 — how far a junction's abandoned arm is allowed to be from the
     * edge of the map, as a share of the run a branch may take getting
     * there. A junction is only built where the arm it abandons can LEAVE:
     * a branch that cannot get clear of the country stops in a field, and a
     * tarmac road ending in a field is the loudest mistake the generator
     * can make. Measured as a share of the box's own diagonal, so it means
     * the same on a sprint and on a stage four times the size — and well
     * under 1, because a branch does not fly straight out: it wanders, and
     * it steers round water and round the road it left. */
    armReach: 0.8,
    /** R23's exemption around a junction: how far from the MEETING POINT
     * the route and the arm it abandons are still one road, m of plain
     * ground distance.
     *
     * A junction IS two carriageways sharing ground, so R23 cannot bind
     * there. What it binds on is everything else — and the exemption has to
     * be a PLACE, because that is what a junction is. Stated as an arc
     * window along the stage instead, it exempted every piece of route
     * within a few hundred metres of arc no matter where that route had
     * wandered to on the ground: measured over seeds 1-12 at medium, four
     * branches lay within a metre of the route a hundred metres and more up
     * their own length, one of them 5.9 m below it, and the analysis
     * exempted exactly the same stretch so not one of them was reported.
     * Two roads on one piece of ground at two heights is a cliff between
     * them, which is what the terrain has to build to keep both standing.
     *
     * The size is what it takes the two to actually part. A junction's own
     * platform reaches `reach.max`; past that the branch holds the main
     * road's line (`SPUR.straight`) while the route swings away through the
     * corner, and by 80 m from the meeting point the pair measure 33-40 m
     * apart on the seeds above — near enough `roadClearance` that the rule
     * has nothing left to forgive.
     *
     * The branch builder measures against it and the analysis exempts the
     * same neighbourhood, so a junction is not reported as two roads
     * sharing ground by the one instrument that would otherwise see every
     * one. It also lapses the moment the branch is properly clear of the
     * stage (spurs.ts): a branch that has wandered a kilometre and folded
     * back has no claim on the road beside its own junction. */
    parting: 80,
  },

  /** R36 — THE LEVEL CROSSING: the route going STRAIGHT OVER a public road
   * instead of turning onto it.
   *
   * A crossing is not a small junction and none of `junction`'s numbers
   * describe it. A junction is a corner — the two roads share a tangent and
   * the whole craft of it is the length over which they PART. A crossing has
   * no corner in it at all: the gravel arrives square, spends one road width
   * on the tarmac and is gone, and the two dirt arms are one straight line
   * through the middle of the seal. That is what makes it legal under R23
   * (see R36): the ground the two roads share is a place a car is on for
   * half a second, not a stretch either of them runs along.
   *
   * So the shape is stated the other way round from a junction's. A
   * junction's platform is elongated ALONG the main road, because that is
   * where the two mats overlap; a crossing's is elongated ACROSS it, along
   * the RALLY, because what has to be graded is the ramp the gravel climbs
   * to get up onto the seal. */
  crossing: {
    /** How far the route runs dead straight either side of the tarmac's
     * centerline, m. It is the whole reason the crossing is square: the
     * approach solves onto a pose this far short of the road, and the
     * straight that carries the route over it is `2 * clear` long — which
     * has to be a length the vocabulary can draw (`straightLong`), because
     * a crossing is an ordinary straight with a road lying across it.
     *
     * It also has to outreach the mats. Half a boulevard plus its verge is
     * about 15 m and R23's clearance a little over 40, so a route that
     * straightens up 55 m out is off the tarmac's ground before the corner
     * that aimed it there ever begins. */
    clear: 55,
    /** How far off the route a road is worth crossing from, m, and the
     * stretch of it the rendezvous is looked for over. Shorter than the
     * BORROW's reach on purpose: a borrow is the stage going and finding a
     * road because the dial asked for tarmac, and it is worth a detour. A
     * crossing is not something the stage wants — it is what the stage does
     * about a road that is in the way — so it only ever looks at road it has
     * nearly arrived at. */
    seek: 420,
    meet: { reach: 420, step: 55 },
    /** How far the route travels before a look that found nothing is worth
     * repeating, m. The solve is the same expensive turn-straight-turn
     * closure the borrow pays for (`paving.borrow.look` says why). */
    look: 200,

    /** R36 — HOW HIGH THE TARMAC STANDS above the country the rally crosses
     * it on, m, and over how much gravel the climb happens.
     *
     * This is the jump, and it is a jump nobody built. A public road is laid
     * on a graded formation — cut, filled, drained and rolled until it holds
     * one line across country that does not — and a rally track is scraped
     * along whatever the field was doing. Where the two cross, the field has
     * to come up to meet the road and go back down the other side, and a car
     * doing that at stage speed leaves the ground. Every rally in the world
     * has one of these and everybody remembers it.
     *
     * `stand` is deliberately modest. What throws the car is not the height,
     * it is the RATE — and `ramp` is metres of RALLY ROAD, measured from
     * where the platform's own flat top ends. Its steepest point is half
     * again as steep as the average, because the ramp eases in and out on a
     * smoothstep and a smoothstep's peak slope is 1.5. That is the
     * arithmetic to do before touching either number, and it is the one that
     * was missed the first time these were chosen: 1.3 m over an
     * eight-metre ramp measured 22% at the middle before the country under
     * it was counted, and with it, 33%.
     *
     * At 1 m and 14 the steepest point is 11%, and the curvature over the
     * lip throws the car off the ground from about 65 km/h up — which is
     * what a road crossing is for, and comfortably under the speed anything
     * arrives at one. Raising `stand` instead of shortening `ramp` buys the
     * same jump on a taller embankment, and an embankment is a wall for
     * anything that runs wide.
     *
     * It is a RAMP AND NOT A PLATFORM, and that separation is the whole
     * reason this is its own number. The graded, paved, levelled area is the
     * junction's own (`spread`) — twenty metres, the tarmac's mat with a toe
     * either side. Sized to the ramp instead, the platform was a
     * sixty-metre plateau of bare earth with a face round its rim, sitting
     * in a field: what a crossing needs graded is the road, and what it
     * needs RAISED is the road and the ramps up to it. So the ramps move the
     * elevation only. They keep their crown, their camber and their gravel,
     * and the terrain's shelf follows them the way it follows any road —
     * which is a narrow embankment along the rally rather than a car park. */
    stand: 1,
    ramp: 14,
    /** ...and how far the crossing's graded platform runs ALONG the tarmac,
     * in road widths. Enough for the seal's own mat plus the mouths the
     * gravel opens either side of it — the crossing's whole footprint on the
     * public road, and no more: a platform that reaches further is a paved
     * square in the countryside. */
    reach: 1.45,
    /** R36 — how much of a junction's DRAG-OUT a crossing gets, as a share.
     *
     * A junction's smear is laid down by cars TURNING: a tire under lateral
     * load scrubs gravel off the dirt road and prints it on the seal, and in
     * life it is the most obvious thing about the place. Nobody turns at a
     * crossing. What goes across is what the tread happened to be holding,
     * which is a dirty band, not a resurfacing.
     *
     * It is worth a number of its own because at a junction the smear is off
     * to one side of the carriageway and at a crossing it is dead centre and
     * continuous — so the same strength that reads as dirt at one reads at
     * the other as the gravel road CARRYING ON through the tarmac, which is
     * the exact lie R17 spends a paragraph forbidding. At full strength the
     * seal disappeared under it for the whole width of the rally road. */
    drag: 0.45,
  },

  /** R41 — THE RAILWAY, and the ramp the rally crosses it on. Meters and
   * seconds unless noted. */
  rail: {
    /** How many of a railway country's seeds carry a line at all. Most:
     * the train is the point, and a railway with no crossing on the stage
     * costs nothing but the search's clearance round it. The land still
     * refuses some (a rim in a lake, a line that never gets clear). */
    chance: 0.75,
    /** THE LINE itself: how wide its formation is, ballast shoulder to
     * shoulder — what the terrain shelves, the forest keeps off, and the
     * search keeps the route clear of, in place of a road's carriageway. */
    line: { width: 6 },
    /** How far the route runs dead straight either side of the rails: the
     * crossing's own `clear`, longer than a road's because the run-up and
     * the ramp have to fit in it before the lip, and R6's landing after.
     * `2 * clear` has to be a straight the vocabulary can draw
     * (`straightLong`). */
    clear: 65,
    /** How far off the route a line is worth crossing from, the stretch of
     * it the rendezvous is looked for over, and how far the route travels
     * before a look that found nothing is repeated — the road crossing's
     * numbers, for the road crossing's reasons. */
    seek: 420,
    meet: { reach: 420, step: 55 },
    look: 200,
    /** How far short of the rails' centerline the lip stands, m. The rails
     * are laid flush with the road at grade, so past the lip the car is in
     * the air over a drop of the lip's height with the line under it — and
     * the closer the lip is to the rails, the higher the car is over them.
     * Just past the crossing deck's own half-width, so the ramp is built
     * beside the line rather than on it. */
    gap: 6,
    /** THE RAMP: how high its lip stands over the road at grade, m, and how
     * much road it climbs over. This is what a car has to be thrown over a
     * train by — `RAILCAR.height` (3.4 m) of it, standing on rails at
     * grade — so the lip is a third of a metre short of the train's roof
     * and the flight makes up the rest: a car leaving a 22% lip at 15 m/s
     * is climbing at 3.2 m/s and is 4 m over the rails 6 m out, a car at
     * 10 m/s is 3.2 m over them and hits the wagon. That is the rule: fast
     * clears, slow does not. The ramp's own grade is `height / ramp`, and
     * the ramp rises on a square (`segmentElevation`), so the launch angle
     * at the lip is twice that: 0.13 average, 0.26 at the lip. The
     * analysis's `jumps` checks (`impact`, `height`) measure the landing
     * this throws. The ramp is as long as `clear - gap` leaves after R6's
     * `jump.runUp` off the approach corner — `rules_test` holds the three
     * together. */
    lip: { height: 3.1, ramp: 24 },
    /** THE TRAIN and its timetable. */
    train: {
      /** The pace a driver's arrival at the crossing is guessed at, m/s —
       * the sim's mean over the roster, near enough — from which the first
       * train's time is set. */
      pace: 22,
      /** How far either side of that guessed arrival the first train's
       * head reaches the crossing, s. Skewed late: a train that has just
       * gone is a train nobody saw, one arriving as the car does is the
       * whole feature. */
      lead: { min: -3, max: 9 },
      /** How far either side of the crossing a train exists, m: it comes
       * out of the fog there and goes back into it. Past the fog ceiling,
       * so it is never seen appearing; short enough that one train has
       * cleared the whole of it before the next is due. */
      reach: 700,
      /** Seconds between trains. A single line is not this busy anywhere,
       * and it is this busy here so a second run at the stage meets one.
       * The floor is the reach's transit at the slowest speed with the
       * longest train (`rules_test` holds it), or two trains would be on
       * one line pointing at each other. */
      period: { min: 90, max: 140 },
      /** Line speed, m/s — a country railway's, not a main line's. */
      speed: { min: 18, max: 26 },
      /** How often the train is a RAILBUS (one or two cars, no wagons)
       * rather than a locomotive and freight. */
      railbus: 0.35,
      /** How many wagons a freight hauls. */
      wagons: { min: 3, max: 7 },
      /** Vehicle lengths over the buffers, m — a two-axle railbus, a
       * four-axle diesel, and the wagons. */
      length: { railbus: 24.5, loco: 15.5, timber: 19, box: 15, tank: 13 },
    },
  },

  /** R44 — THE TRAFFIC ROUTES over the public roads (`traffic.ts`). The
   * rally closes the road it borrows, so the traffic lives on the arms it
   * abandons (R17, R36) and the lanes into the car parks (R42): every
   * journey runs between the places those roads reach — the edge of the
   * map, a town, a car park, the tape across the closed road. */
  traffic: {
    /** Where a lane begins past the barrier across an arm, m beyond the
     * block: a motorist turned back at the tape waits outside it, never
     * in the junction. */
    pastBlock: 10,
    /** How far from a junction a town on the ROUTE still counts as what
     * is behind the tape, m — the journey then starts "from town". */
    townReach: 320,
    /** How far either side of a village street on an arm the town limit
     * holds, m: the sign stands before the first house, not level with it. */
    townMargin: 40,
    /** Spacing of the vehicles' own samples along a route, m — the arms'
     * and the lanes' own, so a route is walked by index. */
    step: 4,
    /** THE SPEED LIMIT SIGNS: how far past the road's edge one stands, m,
     * how far along a lane the first one stands from where the limit
     * starts, m, and how often it is repeated down a long road, m. */
    sign: { out: 1.2, after: 8, every: 600 },
  },
} as const;
