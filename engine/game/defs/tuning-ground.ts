// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the handling tuning (`tuning.ts`): WHAT THE CAR IS
// DRIVING ON AND THROUGH — the surface table (grip, drag, what a plume is
// made of), the hills, the wind and the sand it carries, and the rules for
// a car that has left the road: off-track, wrong way, the run-out past the
// line, and the crash that ends a run.

export const GROUND_TUNING = {
  surfaces: {
    /** Longitudinal drag per surface, 1/s. `nature` is the open landscape
     * off the road — loose but fast: the wild is a place to DRIVE, not a
     * wall of molasses at the verge. Sealed road rolls easiest of all.
     *
     * SAND (R40, the desert's bladed road) is the one that costs: it holds
     * a fifth less than graded stone, has to be pushed a fifth further
     * sideways before it bites, ploughs at the wheels the whole way and
     * swallows some of the throttle — which together is a road that is
     * slower in a straight line and sideways sooner in every corner, and a
     * slide that runs further and settles later than gravel's does. The
     * car's own loose-surface rubber is what it stands on there, exactly as
     * on gravel (`surfaceGripFor`).
     *
     * SNOW (R47, the alpine road above its snowline — and every loose road
     * a winter freezes, climate.ts) is packed snow over whatever was laid
     * under it. The row is the COLD winter's snow, at `CLIMATE.bite.at`
     * degrees: three quarters of gravel's hold, a breakaway a sixth
     * further out, a slide that runs further and settles later, a little
     * more drag and a share of the throttle spun away where a tyre
     * polishes it. What the temperature does to it rides the sample's
     * own `bite` (`snowBite`): glazed near freezing it drops toward the
     * old alpine ice, and in real cold it climbs most of the way back to
     * gravel. Either way it sits between the two, which is the brief —
     * a snow stage slides, and is still a stage somebody drives. Its ONE
     * gift is that it is soft: a car that comes down on it or goes over
     * on it is taken by the snow before the shell is.
     *
     * A SNOWFIELD is the open country under a winter's blanket: not a road
     * at all but half a metre and more of snow the car PLOUGHS (the depth
     * and the sink are `CLIMATE.blanket`). It drags at the whole car three
     * times what gravel does, swallows the throttle the way turf does and
     * then some (`CLIMATE.dig`), and holds the tyres about as well as wet
     * turf — the snow packs against the sidewalls, so a car in it is slow
     * rather than loose — and it is the softest thing in the game to come
     * down on. Leaving a snow road costs; getting back is always possible.
     *
     * ICE (R48) is a lake the cold has frozen solid — the surface the
     * route crosses one on, and the LEAST GRIP IN THE GAME. It holds
     * around two thirds of gravel and well under the snow road's own
     * three quarters, which is the whole reason a crossing is a moment
     * rather than a shortcut: there is nothing on it to cut down into,
     * so the tread is riding a polished floor. Everything else about it
     * follows from that one fact. It rolls the FREEST of any surface —
     * the least drag in the table, so a car that has stopped steering is
     * still going exactly as fast as it was — it breaks away furthest out
     * and comes back slowest, which is what makes a long slide on a lake
     * a thing to be steered rather than caught, and it spins the throttle
     * away worse than sand. And it GIVES almost nothing: ice is a floor,
     * so a car that goes over on a lake is a car meeting something very
     * near as hard as tarmac. */
    drag: {
      gravel: 0.028,
      sand: 0.042,
      asphalt: 0.022,
      water: 0.5,
      nature: 0.03,
      snow: 0.031,
      snowfield: 0.09,
      ice: 0.019,
    },
    /** Lateral grip multiplier per surface. Asphalt is the outlier the
     * stage's paved sections are FOR: the tires hold a third again as
     * much, so the corner that needed a slide on gravel can be driven
     * round, the line tightens, and a drift there has to be asked for —
     * committed entry, handbrake, or plain too much speed. It is still a
     * rally car on a country road: ask hard enough and it goes sideways,
     * just on smoking rubber instead of flying gravel. */
    grip: {
      gravel: 1.0,
      sand: 0.8,
      asphalt: 1.35,
      water: 0.55,
      nature: 0.7,
      snow: 0.78,
      snowfield: 0.72,
      ice: 0.55,
    },
    /** WHERE the tires let go, as a multiple of the slide's slip angles
     * (`TUNING.drift.angleSpan` and its fade band). A surface is not one
     * number: the peak force above says how HARD it holds, this says how
     * far sideways it has to be pushed to give up, and the two run
     * opposite ways. Loose gravel's breakaway sits a long way out — a rally
     * car has to be properly sideways before the tires let go, and the big
     * angle is what cuts down through the marbles to the firm surface
     * under them. A sealed road peaks a few degrees off straight and falls
     * away past it: it holds harder than gravel ever will and it hates
     * being sideways, so the same corner is DRIVEN round rather than hung
     * out, and overdoing it is a short, smoky snap rather than a rally
     * angle carried to the exit. This is the number that stops a paved
     * sweeper being taken at a gravel attitude and full pace.
     *
     * There is a FLOOR under how small it may usefully be, and asphalt used
     * to sit under it: at 0.35 the deepest angle the paved model would ask
     * for — full lock, fully provoked, on the layout that slides most — came
     * to 7°, which is under `drift.enterSlip`. A surface whose entire slip
     * vocabulary sits below the angle the game calls a drift cannot be
     * drifted at all: the dust never lights, the counter never moves, and
     * the only way to get sideways on tarmac was to overshoot the model
     * altogether and spin. Tarmac now asks for a real, small drift — a
     * provoked one clears the readout and the wheel alone still will not,
     * which is the point of a paved section. */
    breakaway: {
      gravel: 1.0,
      sand: 1.2,
      asphalt: 0.62,
      water: 1.2,
      nature: 1.1,
      snow: 1.15,
      snowfield: 1.25,
      ice: 1.45,
    },
    /** Throttle effectiveness per surface. `nature` is level with graded
     * stone, and deliberately: what the open country costs is `natureDig`
     * below, which is charged on the way UP to speed and released once the
     * car is there. A cut taken here instead would still be charged at the
     * top of every gear, where the box has almost nothing to spare. */
    power: {
      gravel: 1.0,
      sand: 0.88,
      asphalt: 1.08,
      water: 0.7,
      nature: 1.0,
      snow: 0.88,
      snowfield: 0.72,
      ice: 0.62,
    },
    /** THE GROUND GIVES. What a crashing car comes down on is not a plane
     * of steel: gravel displaces, soil furrows, sand swallows a corner, and
     * every bit of that is arrival that neither folds the shell nor turns
     * the body — the ground took it. This is that share, 0..1, of a SHELL
     * arrival (a roll's contacts, and the landing that starts one) and of a
     * hard landing's descent: the reaction the body is turned by and the
     * crush the panel is folded by are both read net of it (`roll-contact.ts`,
     * `contact`; `flight.ts`'s landing). Tarmac gives nothing, which is why
     * a rollover on a sealed road is the one that strips the car — and a
     * GRADED road gives little: a rally road is compacted stone under a
     * loose skin, and a sill scrapes the skin off and meets the base. The
     * open country and the desert are where a corner sinks in. */
    give: {
      gravel: 0.06,
      sand: 0.35,
      asphalt: 0,
      water: 0.5,
      nature: 0.25,
      snow: 0.4,
      snowfield: 0.6,
      ice: 0.05,
    },
    /** ...AND WHAT IT COSTS TO PLOUGH IT. A sill or a roof rail digging into
     * loose ground is dragging a furrow, and that is friction over and above
     * the shell's own coefficient (`air.roll.faceGrip`): added to the
     * Coulomb budget for whatever of the patch is SHELL rather than tyre,
     * because a tyre rolls over what a panel ploughs. Accident
     * reconstruction has a rollover on soil stopping harder than one on
     * pavement, and this is that difference. Small against the face's
     * own 0.4–0.6, because it is a furrow and not an anchor. */
    plough: {
      gravel: 0.03,
      sand: 0.14,
      asphalt: 0,
      water: 0,
      nature: 0.07,
      snow: 0.12,
      snowfield: 0.2,
      ice: 0.01,
    },
    /** WHAT THE OPEN COUNTRY TAKES OUT OF THE PULL FROM A STANDSTILL, 0..1
     * — and it takes it out of the ACCELERATION, never out of the top end.
     * Unconsolidated ground is something a driven wheel DIGS rather than
     * drives: there is torque to spare down there and no road speed under
     * the tyre, so what the throttle buys in a field is a trench and a
     * plume of dirt. Faded out entirely by `natureDigSpeed`, where the car
     * is skimming the ground rather than trenching it.
     *
     * This is the WHOLE of what the open country costs, and the reason it
     * is shaped as a fade rather than as a flat cut is the gearbox:
     * `gearAccel` is authored to clear drag by a hair at `gearbox.upAt` of
     * each gear's top (cars.ts), so a penalty still being charged up there
     * leaves the box short of its own upshift and parks the car in fourth
     * — a speed cap by accident, and a worse one than a stated cap because
     * it lands on a different car at a different speed. A penalty that has
     * let go by `natureDigSpeed` is charged nowhere near a shift point,
     * which is what lets the wild be slow to get out of and still have no
     * ceiling but the one the gearbox brought with it. A mile of open
     * ground is a place to find out what the car will actually do, and the
     * jump off the end of it is taken at whatever that run was worth. */
    natureDig: 0.55,
    /** ...and the speed the wheels stop digging and start skimming, m/s
     * (about 125 km/h). Chosen against the SHIFT POINTS rather than against
     * anything the ground does: the slowest car in the roster takes its top
     * gear at 42 m/s, so the dig is fully released before any car is asking
     * the box for the ratio it will finish the run in. Move it up much past
     * this and the wild starts eating the top upshift again, which is the
     * cap coming back in through the side door. */
    natureDigSpeed: 35,
  },

  /** WHAT DEPTH OF SNOW COSTS THE CAR. The surface rows above say what
   * snow IS; this says what there being a lot of it does, which is a
   * different question and the one that separates a white stage from a
   * grey one with a white paint job (`snowpack.ts`, `CLIMATE.pack`).
   *
   * Every term is read off ONE number — `snowWade`, how much snow stands
   * above where the wheels are riding, which is the snow the car is
   * actually pushing out of the way. It is the whole blanket in fresh
   * powder and almost nothing in a worn track, so a car that has been
   * through here once finds it easier the second time, and one following
   * somebody else's line finds it easier the first.
   *
   * All three are stated AT `ref`, which is what a car wades on the
   * untouched blanket a stage at freezing lays (`CLIMATE.blanket`) — so
   * an untouched winter stage is the stage it has always been, and
   * everything here is a departure from it in one direction or the
   * other. */
  snow: {
    /** The depth every number below is quoted at, m. */
    ref: 0.2,
    /** COMPACTING IT: the deceleration ploughing `ref` of snow costs at a
     * crawl, m/s². Charged as a FORCE rather than as drag, because that is
     * what it is — pressing the column under the tyre down to the density
     * that will carry the car takes the same work at 10 m/s as at 30. It
     * is what a car has to overcome to GET GOING in a field; what decides
     * how fast it can then go is `sweep`. */
    plough: 0.5,
    /** ...and how it grows with depth. Snow's pressure–sinkage curve is a
     * power law and the exponent is comfortably over 1 — twice the depth
     * is nearly three times the resistance, which is why deep snow is a
     * wall rather than a nuisance. */
    exponent: 1.5,
    /** ...and THE SNOW THROWN ASIDE, (m/s²) per (m/s)² at `ref` — the half
     * of the resistance that grows with SPEED, because the snow in front of
     * the car has to be got out of the way and getting it out of the way
     * faster costs more. Compacting the column dominates at a crawl; past
     * walking pace this is nearly all of it, and it is what puts a CEILING
     * on deep snow rather than merely a tax on it. A car in a field is
     * slow because it cannot go fast, which is what deep snow actually
     * does to one — and a car in a worn track has almost nothing to throw
     * and runs. That contrast is the whole game of a winter stage.
     *
     * It is what stops the model being a rounding error at pace: the
     * constant terms are a couple of m/s² against an engine making eight,
     * so without this a rally car simply drove through a metre of powder
     * at a hundred. */
    sweep: 0.0026,
    /** THE BELLY, m. Past this the snow is over the sills and the car is
     * bulldozing with its own floor instead of parting it with four
     * wheels — the mobility limit every over-snow vehicle is designed
     * around, and the reason a stuck car is stuck rather than slow. */
    clearance: 0.3,
    /** ...and what a metre of snow past the belly costs, m/s² per m. Kept
     * modest on purpose: the brief for this surface is that leaving a snow
     * road COSTS and that getting back is always possible (`surfaces`
     * above), so the belly is a heavy tax on the deepest cold powder and
     * never a wall a run ends against. */
    bulldoze: 4,
    /** THE WALL OF A RUT, (m/s²) per m of it. The snow a wheel pressed
     * down is gone; the snow beside it is not, so a track has a shoulder,
     * and a car sliding out of its own line has to climb it. This is the
     * tramline every winter driver knows: the ruts steer the car, a lane
     * change has to be asked for at a shallow angle, and asking for it at
     * a sharp one is how a car ends up in the field. Read against the
     * LATERAL speed alone — the wall does nothing to a car going along
     * it, which is the whole point of it. */
    wall: 24,
    /** How far outboard of a wheel the wall is measured, m: past the tyre
     * it pressed, into the snow it did not. */
    wallOut: 0.7,
    /** WHERE THE WHEELS THAT DO THE PACKING ARE, m from the car's middle:
     * `wheelAt` across (half the track width), `axleAt` along (half the
     * wheelbase). A rally car's track is about a metre and a half and its
     * wheelbase a little under three, near enough for every car in the
     * catalogue — and near enough is what is wanted, because these decide
     * where a trail's two ruts and the crown between them fall, and a
     * trail that changed shape with the car would stop reading as a trail
     * the moment a field of them crossed. The renderer's own trail
     * (`snow-marks.ts`) is drawn on the same track width. */
    wheelAt: 0.74,
    axleAt: 1.35,
    /** R47 — WHAT THE CHASSIS DOES, which is not what the wheels do.
     *
     * A car does not arrive on deep snow and then sink into it: it PARTS
     * it, and the thing that parts it is the front of the body. The snow
     * under the nose has to come down for the car to be where it is, and by
     * the time a wheel reaches that ground the body has already been over
     * it. So the pressing LEADS the wheels rather than following them, and
     * the line it is done along is the nose (`collision.halfLength` ahead of
     * the middle, which is the same box the contact model uses).
     *
     * It is carved as a LINE ACROSS THE NOSE rather than as the whole
     * footprint, and that is not an economy — it is the same thing said
     * once. The car advances a fifth of a metre a step, so a nose line
     * swept forward IS the footprint, and carving the whole of it every
     * step would press the same snow twenty times over and call it twenty
     * passes.
     *
     * `bite` is how hard it presses, against a tyre's full pass. Less,
     * because a body spreads the same weight over four square metres where
     * a tyre puts it through four patches the size of a hand — so the
     * chassis leaves a broad shallow trough and the wheels cut their own
     * ruts into the floor of it, which is exactly what a car's track
     * through deep snow looks like from behind.
     *
     * `across` is how many points the line is carved at, spanning the
     * body's width. Enough that the splat of one overlaps its neighbour at
     * `CLIMATE.pack.cell`, or the path comes out as stripes. */
    chassis: { bite: 0.55, across: 5 },
  },

  hills: {
    /** Fraction of real gravity felt along the road grade — climbing costs
     * speed, a descent gives it back. Kept arcade-soft so the top of a long
     * rise never stalls the run. Off the road the same fraction also acts
     * ACROSS the car (see slopeLat in car.ts), pulling it toward a
     * hillside's downhill side. */
    gravityAlong: 0.6,
    /** Baseline the off-road grade under the car is measured over, m —
     * wheelbase scale, so a bank pushes back the moment the wheels are on
     * it. The crest check keeps its own wide baseline (air.crestSpan): this
     * one is for the slope the car STANDS on, that one for the shape of
     * the hill ahead. */
    gradeSpan: 4,
  },

  attitude: {
    /** How fast the body settles onto the attitude the ground (or the
     * flight) asks for, 1/s — suspension travel, not a rigid weld: a curb
     * or a ripple leans the car rather than snapping it. */
    settle: 8,
    /** Nose attitude is clamped here, rad — a plunge off a cliff still
     * reads as a dive without the body standing on end. */
    pitchMax: 0.6,
  },

  wind: {
    /** Mean wind speed range per weather, m/s. The exact value inside the
     * range is seeded — every stage gets its own wind, every replay the same. */
    speed: { clear: [0, 3], rain: [3.5, 6.5], storm: [7, 11] },
    /** Gust swing as a fraction of the mean speed (0–1): the wind breathes
     * between roughly (1−gust)× and (1+gust)× its mean. */
    gust: 0.45,
    /** Wander of the wind bearing around its mean, radians. */
    veer: 0.25,
    /** Head/tailwind push on forward speed while grounded, m/s² per m/s of
     * wind along the car's axis — a storm headwind trims the top end. */
    longForce: 0.06,
    /** Fraction of the wind velocity that carries the whole car downwind
     * (dimensionless): rolling tires resist it, a drifting car resists
     * less, and in the air nothing resists — a storm gust visibly moves a
     * jump sideways. */
    carry: { grounded: 0.04, drifting: 0.12, airborne: 0.3 },
  },

  /** THE SANDSTORM (`game/sandstorm.ts`) — the desert's weather, and the
   * only one in the game that ARRIVES rather than simply being the case.
   *
   * Every number here is in seconds or metres per second and every one of
   * them is read off what a haboob actually does. A haboob is the outflow
   * of a collapsing thunderstorm: a wall of lifted sand up to 1,500 m tall
   * travelling at the speed of that outflow, gusting to around 30 m/s at
   * its leading edge, visible on the horizon for minutes and then over you
   * in under one. Once it is on you the visibility goes to nothing — the
   * threshold for a sandstorm warning is half a mile of visibility at 25
   * mph of wind, and the core of a real one is a great deal worse than the
   * threshold. */
  sand: {
    /** HOW OFTEN THE FRONTS COME, s between one wall and the next, at the
     * two ends of the dial (`sandPeriodOf` reads it geometrically, because
     * the band spans an order of magnitude and read linearly the whole
     * stormy end would live in the last tenth of the thumb's travel).
     *
     * `calm` is a quarter of an hour — twice a long stage, so the bottom of
     * the travel is a country where a storm is a thing that MIGHT happen
     * to this run. `often` is under two minutes, which against a front's
     * own length (`approach` + `front` + `core` + `tail`, near three) is a
     * run that is in sand more than it is out of it. The dial at exactly 0
     * is neither: it is OFF, and no front is scheduled at all.
     *
     * Measured against the schedule rather than guessed: a front occupies
     * about 180 s of its period counting the approach, so the share of
     * five-minute runs that meet one at all is that over the period — a
     * fifth at the bottom of the travel, about half at the default, and
     * effectively all of them at the top. */
    period: { calm: 900, often: 110 },
    /** How far into its own slot a front's arrival wanders, as a share of
     * the period. A storm every four minutes exactly is a metronome, and a
     * player learns to count rather than to look. */
    jitter: 0.55,
    /** THE APPROACH, s: how long the wall is up before it lands. This is
     * the half of the storm the player can DO something about — lift,
     * shorten the braking, get the corner done before it hits — so it is
     * long enough to be a decision and short enough that the decision is
     * still under pressure. (A real haboob is visible for far longer; so
     * is a real sunset, and the sun's clock in this game runs at an hour a
     * minute for the same reason.) */
    approach: 55,
    /** THE LEADING EDGE, s: how long the wall takes to pass over. Short,
     * and this is the number that makes it read as a wall rather than as a
     * weather front — clear air to nothing in a dozen seconds. */
    front: 12,
    /** THE CORE, s at full strength... */
    core: 40,
    /** ...and THE TAIL, s the sand takes to settle back out of the air.
     * Much the longest of the three: a haboob leaves and the dust hangs. */
    tail: 70,
    /** How strong one front is, 0..1, drawn per front. The floor is well
     * up the range on purpose — a front that arrives as nothing is a
     * horizon the player watched for a minute and got nothing from. */
    strength: { min: 0.45, max: 1 },
    /** THE WIND INSIDE THE FRONT, m/s: what the mean is carried TO at full
     * strength (blended from the stage's own mean by the sand in the air,
     * never multiplied by it — a haboob brings its own wind and does not
     * care what the afternoon was doing). Thirty is the gust at a real
     * one's leading edge, and it is also the top of the band the crosswind
     * work on desert highways finds a car losing its line in. */
    wind: 29,
    /** WHAT IS LEFT OF THE VISIBILITY at the core, 0..1 of clear air, and
     * the exponent the fall to it is read on. The exponent is what makes
     * the collapse happen at the WALL rather than evenly across the front:
     * visibility in blowing dust falls away far faster than the dust in
     * the air rises. */
    visibility: 0.03,
    visionFall: 2.2,
    /** WHAT IT DOES TO THE CAR, at full strength.
     *
     * `yaw` is the crosswind's TURNING moment, rad/s² per m/s of wind
     * across the car — the half of a crosswind that is not a shove. A car
     * is a sail with its centre of pressure ahead of its centre of mass,
     * so a gust from the side does not merely move it, it points it, and
     * the driver holds a correction into the wind for as long as it blows.
     * This is the number that makes a storm HARD rather than merely
     * blurry, and it is small: it has to be a correction a good driver
     * makes without thinking and a bad one runs wide on.
     *
     * `grip` is the share of the surface's hold that a road with sand
     * running across it does not have. Sand blown over tarmac is the
     * classic desert-road hazard and it is loose material on a hard
     * surface — the car is on ball bearings for as long as it lasts. */
    yaw: 0.004,
    grip: 0.3,
  },

  offTrack: {
    /** Lateral overhang past the road edge that still counts as verge, m.
     * Beyond it the car is exploring: the terrain owns the ground, and
     * nothing but a crash (or the reset input) brings it back. */
    verge: 1.5,
    /** Respawn forward speed, m/s. */
    respawnSpeed: 6,
    /** Wedged: the only thing that ever drags the car home by itself.
     * Hitting a tree bends the car and leaves it where it is, so the one
     * unrecoverable state left is being pinned against something with the
     * throttle buried. Asking to move for `after` seconds without covering
     * `radius` meters is that state — long enough that a slow scrabble up
     * a bank or a nudge off a rock is never mistaken for it. */
    stuck: { after: 2, radius: 1.5 },
    /** WHEN THE PLAYER IS ACTUALLY LOST — what the co-driver's RETURN TO
     * TRACK strip and the arrow under it wait for. Two wheels on the verge
     * is not lost, and neither is a car crossing a clearing with the road
     * out to one side: the guidance owes the player the moment they are
     * LEAVING, not a sign that lights every time the stage is briefly
     * beside them rather than under them. `away` is radians off the car's
     * nose, past 110° — comfortably beyond the 90° of driving
     * PERPENDICULAR to the road. These bring the sign ON only; what takes
     * it off is the car being back on the road (`trackLost`). */
    guide: { near: 20, away: 1.92 },
  },

  /** DRIVING THE STAGE BACKWARDS — what the co-driver's TURN AROUND sign
   * waits for, and what takes it back down. Two things have to be true at
   * once, because on its own each one is something a rally driver does on
   * purpose. The nose has to be POINTED back up the stage: a car reversing
   * out of a ditch is travelling the wrong way with its nose still pointing
   * down the road, and being told to turn round is the opposite of what it
   * needs. And the car has to actually be TRAVELLING that way at more than
   * walking pace: a spun car points back up the stage for a second while
   * its momentum still carries it down, and that is a moment to be driven
   * out of rather than an instruction. */
  wrongWay: {
    /** How fast the car has to be running back up the stage before the sign
     * is owed at all, m/s (~11 km/h) — measured along the ROAD, so a car
     * crossing it sideways at speed reads as barely moving up it. */
    speed: 3,
    /** Seconds both tests have to hold before the sign comes up. Long
     * enough that a three-point turn on a narrow road is finished inside
     * it, short enough that a driver who has genuinely set off the wrong
     * way is told before the next corner. */
    after: 1.2,
    /** How far off the road's own heading the nose has to be, rad — past
     * 110°, the same angle the way-home guidance calls pointed away, and
     * comfortably beyond the 90° of a car parked across the road. */
    away: 1.92,
    /** ...and how far inside it the nose has to come back for the
     * instruction to have been carried out, rad (~60°). The gap between
     * the two is the whole hysteresis: TURN AROUND is an instruction, so
     * stopping does not clear it and neither does swinging the nose to the
     * edge of the threshold it came up at. */
    back: 1.05,
  },

  /** R25 — the roll-out past the finish gate: what drives the car once the
   * clock has stopped and the player is out of the loop. The brake is a
   * TRAILING one — a car that stands on the pedal at the line stops dead
   * under the banner, which reads as a stage that ended rather than a
   * finish that was crossed — so it eases in over `brakeRamp` seconds and
   * never reaches the full pedal. */
  rollOut: {
    /** Peak brake pressure the roll-out ever asks for, 0..1. */
    brake: 0.45,
    /** Seconds it takes to get there. */
    brakeRamp: 1.6,
    /** Steering authority the roll-out has, 0..1 — enough to gather a car
     * that crossed the line sideways, not enough to place it. */
    steer: 0.35,
    /** Under this the car counts as stopped and the run is over, m/s. */
    restSpeed: 1.2,
    /** ...and the ceiling on the whole beat, seconds: a car that crossed
     * the line already wrecked, or facing a hill, still has to finish. */
    maxTime: 14,
  },

  crash: {
    /** Water this much over the ground is deep — a grounded car in it (or
     * an airborne one dropping under the surface) has driven into a lake
     * or the sea: the water takes it, and the crew put it back. Stream
     * fords stay shallower than this and just slow the car. */
    deepWater: 0.9,

    /** WHAT THE WATER DOES WITH IT. Driving into water too deep to drive
     * out of is the one mistake a stage never hands straight back: the car
     * is not lifted off the lake the instant it goes in, it is WATCHED
     * going down, and the seconds of not driving are the penalty. Three
     * beats inside `duration`, and they have to be three: the plunge (the
     * water swallows the entry and the hull corks back up), the float (it
     * rides the surface, rocking less each time, going nowhere), and the
     * sink (the water wins, nose first, until it has closed over the
     * roof). Cut any one and it reads as a teleport with a delay on it.
     *
     * The float is a race, though, and the car is allowed to win it: a car
     * that went in carrying real speed can carry that entry back out — up
     * a beach, over a shoal, across the shingle of a ford — and one that
     * reaches ground it could drive from was wading, not drowning. See
     * `shallows`. */
    drown: {
      /** Entry to back-on-the-road, s. */
      duration: 5,
      /** How long the hull rides the surface before the water starts
       * winning, s — the plunge and the whole settle happen inside this,
       * and the rest of `duration` is the car going under. It is also how
       * long the car has to drive itself out (`shallows`): once the water
       * has started taking it down there is nothing left to drive with. */
      float: 2.4,
      /** How much shallower than `deepWater` the water has to be before a
       * hull that is still afloat counts as back on ground it can drive
       * from, m. A MARGIN rather than a depth of its own: the bar to get
       * out has to sit under the bar that put the car in, or a car bobbing
       * on that bar beaches and drowns again on alternate steps. */
      shallows: 0.2,
      /** Time constant the water takes the car's speed over, s — a car
       * that hits a lake at pace still carries its line a few metres in
       * before the water has all of it. FLAT, unlike the yaw below: that
       * carry is the entry a car is allowed to wade back out on
       * (`shallows`), so shortening it takes the escape away with it. */
      stopIn: 0.5,
      /** ...and the slower one it takes the YAW over, s. The water stops a
       * car long before it stops it turning, so the hull keeps swinging
       * gently while it floats instead of freezing on its entry heading.
       * It is the constant of a GENTLE swing only — `slewAbove` is what a
       * spin meets. */
      slewIn: 2.5,
      /** ...and the yaw rate at which that bite has DOUBLED, rad/s. Water
       * resists with the square of the rate through it, so a hull that
       * arrives spinning is stopped in a fraction of the time a drifting
       * one is, and the yaw needs saying because a car LANDS in water: a
       * plain time constant sheds the same fraction per second however fast
       * the spin is, so 6 rad/s off a jump carried the car through two full
       * turns on the surface before it settled. This sits an order under
       * the spin a crash arrives with (`drift.overYaw`), so the water has
       * all but stopped a violent one inside half a second while the
       * quarter-turn swing of a float — a fifth of a rad/s — barely feels
       * it. */
      slewAbove: 0.35,
      /** Fastest the entry is allowed to drive the body under, m/s — a
       * plunge off a bridge would otherwise put the car on the lakebed
       * before it has floated at all. */
      plunge: 7,
      /** How far under the surface the wheels sit while it floats, m — the
       * sills at the waterline, which is what a car ABOUT to go down looks
       * like from behind. */
      draft: 0.5,
      /** ...and how far under they are by the time the crew reach it, m.
       * Clamped to the bed it is sinking toward: in a shallow tarn the car
       * settles on the bottom instead of sinking through it. */
      depth: 3.4,
      /** Roof height over the wheels' contact, m — where the water closes
       * over the car, which is the moment worth a sound and a gulp of
       * foam. */
      roof: 1.3,
      /** Buoyancy spring, 1/s²... */
      buoyancy: 15,
      /** ...and its damping, 1/s. Deliberately UNDERdamped: a hull that
       * eases onto its waterline has not been swallowed by anything, and
       * the two or three bobs are the whole reason this is a beat and not
       * a wait. */
      damping: 2.2,
      /** How far the hull rocks as it settles, rad, at this rate, rad/s,
       * dying over `calm` seconds. */
      rock: 0.12,
      rockRate: 2.4,
      calm: 1.4,
      /** How far the nose drops as it goes under, rad — the engine is the
       * heavy end of a car, so it sinks nose first. */
      noseDown: 0.32,
      /** How fast the attitude forgets the crash that put it there and
       * takes the water's instead, 1/s. */
      settle: 3,
    },
  },
} as const;
