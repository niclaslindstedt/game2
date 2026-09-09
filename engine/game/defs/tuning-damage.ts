// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The other half of `TUNING.collision` (see `tuning.ts`): WHAT A CONTACT
// COSTS — the crush per unit of closing speed and the zone ledger it goes
// into, when a panel, a pane or a wheel comes off, when a system is called
// hurt, spent or dead, and what finally retires a run. The mounts that
// hold the engine and the wheels on are the top of it, because everything
// below is what happens once one of them lets go.

export const DAMAGE_TUNING = {
  /** WHAT THE CAR IS BOLTED TOGETHER WITH, and what those bolts are
   * rated for. Folding panels is only half of an arrival: everything
   * HANGING off the car has to be brought to a stop with it, and a mount
   * does that by pulling on the mass behind it. The load is that mass
   * times the deceleration, the deceleration is the arrival divided by
   * how far the car travelled while it stopped, and past a point the
   * mount is simply not rated for the answer. `game/mounts.ts` is the
   * arithmetic; collision.ts writes what it costs.
   *
   * This is the whole difference between a wall and a cliff, and it is
   * why neither one has to be special-cased. A car driven into a wall at
   * 100 km/h stops over half a metre of crumple zone BUILT to take it
   * and keeps all four wheels. The same car arriving at the foot of a
   * mountain at its terminal speed (`air.aero` — about 65 m/s) asks the
   * same arms for ten times the load, and they let go: the wheels leave,
   * the engine goes on falling until the bulkhead stops it, and what
   * reaches the ground is not a car any more. */
  mounts: {
    /** The sidewalls' own squash under a vertical arrival, m — the part
     * of a WHEELS-first stroke that is not the springs
     * (`suspension.travel`, which is the rest of it). */
    tyreSquash: 0.045,
    /** ...and what a face of the SHELL has instead: the skin's give
     * before the structure behind it is what is folding, m. Small on
     * purpose — a door is a panel, not a spring, and this is why the
     * same descent taken on a flank pulls harder than one taken on the
     * tyres. */
    shellSquash: 0.02,
    /** Floor under the stroke, m — a guard against an arrival that
     * folded nothing dividing by nothing. */
    minStroke: 0.03,
    /** WHAT THE UPRIGHTS, THE ARMS AND THE BOLTS THROUGH THEM CARRY, in
     * g of vertical load. A rally car's suspension is built for a few g
     * of it all day and a big landing now and then; this is the line
     * past which the arm bends and the hub leaves with the wheel on it.
     *
     * Read as a descent on the car's own wheels, which is the only form
     * it can be judged in: 130 g is about 30 m/s of arrival — a 45 m
     * drop — where the springs, the tyres and the floorpan folding
     * together are still just enough. The hardest landing a bot takes on
     * a stage is 13 m/s and pulls 50 g, so nothing the road does gets
     * near it; a 150 m fall arrives at 60 and pulls three times it. */
    hubG: 130,
    /** ...and what ONE MULTIPLE past that rating spends of a wheel's
     * ledger (`CarDamage.wheels`, gone at 1). A fall long enough to
     * reach terminal speed is a bit over two multiples over on the
     * tyres and three on the nose, so it takes every wheel off the car —
     * which, with the engine below, is what `beyondDriving` ends the run
     * on. Sized against the SOFTEST way down there is — flat on the
     * floorpan, onto loose ground, with the springs still under the car
     * and half a metre of floor to fold (`surfaces.give`): even that
     * takes all four. */
    hubPerOver: 1.3,
    /** THE ENGINE MOUNTS, in g. Higher than the arms: the block sits on
     * three or four mounts with steel through the rubber and a car is
     * not designed to have its engine anywhere but where it is. Past it
     * the block tears loose and goes on falling inside the shell until
     * the bulkhead and the floorpan stop it — which is what actually
     * destroys an engine in a fall, not the landing itself. */
    engineG: 200,
    /** HOW FAR THE ARRIVAL IS REDISTRIBUTED ACROSS THE FOUR CORNERS by
     * the attitude the car came down at, as the swing either side of an
     * even share (`mounts.ts`, `cornerLoads`). At 0.25 the corner the car
     * landed on takes 1.25 of a share and the one still in the air takes
     * 0.75, and the four always sum to four — a car that arrives level
     * pays exactly what it always paid.
     *
     * It is what stops a plunge shedding its wheels in formation, and
     * both ends of it are measured. Too little and nothing is
     * distinguished: at 0.2 a car that spears in from 100 m leaves every
     * wheel bolted on at 0.96 of its ledger, which is the old symmetric
     * answer with extra steps. Too much and the corner that was still in
     * the air is SAVED by an attitude it held for ten milliseconds:
     * at 0.45 a fall of 150 m leaves its rear pair at 0.60, and the car
     * has more wheels than a fall from 100 m did.
     *
     * A quarter puts the interesting cases where they belong. A 100 m
     * nose-first arrival tears the front pair off and leaves the rears
     * flat; a fall long enough to reach terminal speed takes three and
     * leaves the fourth hanging by a thread, which reads as a car that
     * came apart rather than one that was disassembled. */
    tiltShare: 0.25,
    /** ...and how deep a corner has to sit under the body's middle for
     * that swing to be fully spent, m. It is a measurement off the body:
     * the collision box's corner is 2.1 m from the middle, so a car at
     * the steepest attitude it can hold (`attitude.pitchMax`, 34°) has
     * its nose corners 1.17 m down, and a metre puts that at the top of
     * the swing with a little in hand.
     *
     * The point of it is that the swing is GRADED. Too short and the
     * share saturates on any attitude at all, which turns a car landing
     * eleven degrees nose-down — an ordinary plunge, near enough flat —
     * into one that sheds its front wheels and keeps its rears. Over the
     * metre: eleven degrees is a 1.18/0.82 split and all four still go,
     * the front pair first and hardest; a proper nose-first spear is
     * 1.45/0.55 and genuinely leaves the rear pair hanging off a car
     * that has no front left. */
    tiltReach: 1,
    /** WHAT A PART LEAVES THE CAR AT, as a share of the speed of
     * whatever took it off. A wheel is trapped between the ground and
     * its own arch as the car comes down on it, and what the structure
     * cannot hold it against squeezes it out sideways — a wedge ratio,
     * which is why it is a fraction and a small one. */
    shedPerSpeed: 0.16,
    /** ...and the floor under it, m/s — what a part has always been
     * thrown off with, so a gentle loss stays exactly as gentle as it
     * was and only a violent one is thrown harder. A contact under about
     * 23 m/s never beats it, which is every ordinary crash in the game. */
    shedFloor: 3.72,
    /** ...and what the shell is spent by EVERY mount that lets go, per
     * multiple over summed across the three. A hub does not leave
     * cleanly: it tears its mounting points out of the floor on the way,
     * and the block goes through the bulkhead behind it. So a car that
     * has shed its arms, its shafts and its engine is not a shape any
     * more (`CarDamage.wear`, wrecked at 1), whatever its panels read —
     * which is the difference between a car folded by a wall, where only
     * the struck face is spent, and one that arrived at the bottom of a
     * mountain, where everything bolted to it left at once. */
    wearPerMount: 0.15,
    /** ...and what one multiple past THAT spends of the engine's ledger.
     * At 1 the engine is dead and the run is over (`beyondDriving`), and
     * a terminal-speed arrival is over a multiple past the rating: a
     * car that falls off a mountain does not drive away from it. */
    enginePerOver: 2,
    /** THE DRIVE SHAFTS, in g — the half-shafts and the joints at either
     * end of them, which are the part of the drivetrain a LANDING loads
     * rather than a corner. A wheel slammed up its travel drives its
     * shaft through the whole of its plunge and then past it, and a
     * joint at the end of its plunge is a solid bar: what gives is the
     * cage, the boot, or the shaft itself.
     *
     * Just above the arms (`hubG`) so the order reads right on the way
     * up — the uprights are the first thing a fall takes, the shafts
     * follow, and the engine leaves its mounts last. On the car's own
     * wheels that is about 32 m/s of arrival, a 50 m drop. */
    driveG: 150,
    /** ...and what one multiple past that spends of the drivetrain's
     * ledger (`systems.gearbox` — a box and the shafts out of it are one
     * thing in this model). A bad landing costs a tenth of it; the
     * bottom of a mountain finishes it, and the car that is dragged home
     * is short its top two ratios (`damage.ts`, `gearsLost`). */
    drivePerOver: 1.3,
  },

  /** WHAT THE REST OF THE LEDGER DOES TO THE DRIVING. The systems below
   * are the machinery; these are the numbers for everything else the
   * crash left behind — the spent structure, the shell pulled out of
   * true, the floorpan, and the panels that are lying back up the road.
   * Read in game/damage.ts.
   *
   * The whole group is sized against the same bar as the systems: a car
   * with every one of these at its worst is EXHAUSTING to drive and
   * still gets to the finish. A car that cannot be driven home is a
   * respawn, and a respawn is not a consequence. */
  chassis: {
    /** Fraction of lateral grip gone at wear 1 — a shell twisted past
     * saving never holds its suspension geometry under load. */
    wearGrip: 0.22,
    /** ...and of braking, at wear 1: bent hubs and a rubbing wheel pull
     * the car up long, which is what actually ends a run. */
    wearBrake: 0.3,
    /** Extra longitudinal drag at wear 1, 1/s. Against a gravel road's
     * own 0.028, a spent chassis is about half as much again — the top
     * end falls away without the acceleration going anywhere. */
    wearDrag: 0.014,
    /** ...per m of floorpan crush, 1/s. A folded underside is a plough. */
    bellyDrag: 0.03,
    /** ...and per m of panel crush anywhere, 1/s. A car folded on every
     * corner is not the shape it was drawn as. */
    crushDrag: 0.006,
    /** THE PULL. Lock the car carries with the wheel dead straight, per m
     * of left-right crush difference — a body folded harder down one side
     * drags that way, and the driver holds a corner of opposite lock down
     * every straight for the rest of the stage. A whole side folded to
     * `zoneMax` is 1.2 m of crush, which is about a tenth of the wheel —
     * roughly 6°/s of unasked-for yaw at rally pace, so the correction is
     * constant and small rather than a fight... */
    pullPerCrush: 0.09,
    /** ...and this is the most it can ever be, in lock, however badly the
     * car is folded on both sides at once. Past this the correction stops
     * being a nuisance and becomes the only thing the driver is doing. */
    pullMax: 0.11,
    /** Whatever the systems, the structure and the missing wing take off
     * the tires together, they never take more than leaves this: the
     * floor under lateral grip, as a fraction of the sound car's. Below
     * about two thirds the car simply cannot be pointed. */
    gripFloor: 0.62,
    /** THE MISFIRE. Engine damage under this just makes less power; past
     * it the ignition starts dropping beats and the car lurches. */
    misfireFrom: 0.55,
    /** How fast the stutter's carrier runs, rad/s... */
    misfireRate: 9,
    /** ...against a second wave this much faster, whose beat against the
     * first is what keeps the misfire from settling into a rhythm. An
     * irrational-ish ratio: a tidy one would be a drum machine. */
    misfireDetune: 1.618,
    /** Share of the time the engine is dead at engine damage 1, 0..1.
     * A third of the beats missing is a car that still crawls home. */
    misfireDuty: 0.34,
    /** Gearbox damage at which the top gear stops engaging — the box is
     * driven on what is left of it, which caps the stage's top end
     * without ever stopping the car. */
    topGearAt: 0.75,
    /** THE RACK PULLED OFF CENTRE. Bent tie rods do not only answer late
     * (`systems.steerLoss`) — they answer CROOKED, and the wheel the
     * driver holds straight is no longer the wheel the car goes straight
     * on. In lock at steering damage 1, toward whichever front corner is
     * folded deeper; a nose driven in square bends both rods the same and
     * pulls nowhere. Under the shell's own `pullMax`, which caps the two
     * together. */
    steerPull: 0.05,
    /** Gearbox damage at which a SECOND ratio goes, on top of the top
     * gear `topGearAt` already took. A box this far gone is being driven
     * on its middle gears, which is a stage finished at a crawl and never
     * a stage that cannot be finished. */
    secondGearAt: 0.95,

    /** THE WHEELS. Each one carries its own ledger (`damage.wheels`), fed
     * by the crush on its corner and its flank (`systems.wheelFrom…`),
     * and it costs the car in two steps. Past `wheelFlat` the tyre is
     * DOWN and the rim is bent: that corner has less to hold with
     * (`flatGrip` of the lateral grip, per flat), the car pulls toward it
     * (`flatPull`, in lock), and the rim on the road drags (`flatDrag`,
     * 1/s). At 1 the wheel is OFF THE CAR and the corner rides on its
     * hub: `wheelOffGrip`, `wheelOffPull` and `wheelOffDrag` are the same
     * three costs at the size that buys, and `wheelOffPower` is what is
     * left of the engine's push once a driven corner is a hub ploughing
     * the road — a car on three wheels crawls, and it crawls crookedly.
     * Two wheels gone is a car that cannot be driven at all: it retires
     * where it stops. */
    wheelFlat: 0.4,
    flatGrip: 0.1,
    flatPull: 0.05,
    flatDrag: 0.012,
    wheelOffGrip: 0.28,
    wheelOffPull: 0.14,
    wheelOffDrag: 0.06,
    wheelOffPower: 0.45,
    /** ...and the floor under grip once a wheel is off: below the
     * ordinary `gripFloor`, because a car on three wheels genuinely
     * cannot be pointed well, and never under this. */
    wheelOffGripFloor: 0.3,
    /** WHAT STOPS A CAR THAT CANNOT DRIVE. The surface's own drag is a
     * share of the speed and never quite brings a coasting car to rest;
     * these are the constant retardations, m/s², that do. A dead engine
     * with a gear in it is a seized crank on the driven wheels — the car
     * stops in a few lengths, not a few hundred metres — and a corner on
     * its hub ploughs the road at every speed, each one. */
    deadEngineBrake: 2.5,
    hubBrake: 1.0,
  },

  /** THE AIR, AND THE HOLES A CRASH PUTS IN IT. Every loss in `chassis`
   * above is MECHANICAL — a rim ploughing the road, a rubbing hub, a
   * shell that is no longer straight — and every one of them is a share
   * of the speed, which is what a rolling loss is. This group is the
   * other kind. The air a car pushes goes as the SQUARE of the speed, so
   * a hole in the bodywork is worth nothing at all in a hairpin and the
   * whole top end on a straight: a car with its doors gone still pulls
   * out of a corner like a rally car and never sees the speed it used to.
   *
   * Everything here is stated as CdA — drag coefficient times frontal
   * area, m², the number a wind tunnel actually reports — because that is
   * the only form in which the entries can be compared with each other or
   * with anything real. game/damage.ts adds them up and car.ts spends the
   * total the way the air spends it: `½·ρ·CdA·u²` over the car's own
   * mass, so a heavy car carries a hole better than a light one does, for
   * the same reason it always has.
   *
   * A sound car's total is exactly 0. The roster's top speeds are its
   * gearing and its rolling drag; nothing here is felt until something
   * comes off. */
  aero: {
    /** Air, kg/m³ — sea level, and the same everywhere: a stage that
     * changed the density with its altitude would be a physics lesson
     * nobody asked for. */
    density: 1.225,
    /** Added CdA per part left on the road, m². A whole rally car is
     * about 0.65 of these (Cd ≈ 0.35 over 1.9 m² of frontal area), and
     * these are the tunnel's own proportions against it: a window down is
     * worth about a twentieth of a car's drag, a door gone rather more
     * than twice that, an open engine bay a quarter, and a windscreen
     * that is no longer there a third — the cabin stops being a shape the
     * air goes over and becomes a bucket it goes into.
     *
     * WHAT THAT BUYS, driven: the small stuff is a few tenths of a per
     * cent of the top end and is felt nowhere, which is correct — a car
     * missing a mirror is a car missing a mirror. The big openings cost
     * a per cent or so each until the total reaches the point where the
     * box will no longer pull its highest ratio at all, and from there
     * the top end falls off a cliff: a car with no windscreen tops out a
     * whole gear down, around 165 km/h against 205. That cliff is the
     * gearbox's and not the air's, and it is the honest shape of the
     * thing — a wrecked car does not top out slightly lower, it stops
     * being able to pull top gear.
     *
     * The WING is the one negative entry, and it is the honest number: a
     * rear wing is drag bought on purpose, so a car that has left its
     * wing in a ditch is fractionally FASTER in a straight line and gives
     * back rather more than that in `lift` the moment the road turns.
     * The wheels are a mechanical loss and are costed on their own ledger
     * (`chassis.wheelOffDrag`); they sit at zero here. */
    part: {
      mirrorL: 0.01,
      mirrorR: 0.01,
      bumperF: 0.033,
      bumperR: 0.02,
      lampFL: 0.005,
      lampFR: 0.005,
      lampRL: 0.004,
      lampRR: 0.004,
      spoiler: -0.033,
      /** A pipe left in a ditch is a car that is fractionally CLEANER
       * underneath and a few kilos lighter, and neither is worth a
       * number: what a lost exhaust costs is noise and smoke, not pace.
       * Zero on purpose, so the ledger says the honest thing rather than
       * quietly rewarding a driver for bottoming out. */
      exhaust: 0,
      hood: 0.16,
      hatch: 0.05,
      glassF: 0.23,
      glassB: 0.026,
      glassL: 0.032,
      glassR: 0.032,
      doorL: 0.08,
      doorR: 0.08,
      wheelFL: 0,
      wheelFR: 0,
      wheelRL: 0,
      wheelRR: 0,
    },
    /** ...and per m of crush anywhere on the shell, m² of CdA. A folded
     * car is not the shape it was drawn as, and the air finds every new
     * edge of it: a metre of fold spread over the body — a hard stage,
     * not a single accident — is about a fifth of the car's drag again,
     * without a single panel having left it. A stage's worth of ordinary
     * bot contact is a few centimetres and worth nothing, which is what
     * keeps this off the balance table. */
    crush: 0.13,
    /** THE PACE the speed-faded numbers below are quoted at, m/s — near
     * the top of what a stage sees. Under it they fade with the square of
     * the speed, like the drag itself: nothing aerodynamic happens to a
     * rally car at the exit of a hairpin. */
    speed: 34,
    /** Lateral grip lost at `speed` per part left on the road, as a
     * fraction of the sound car's — the downforce that is no longer being
     * made. The WING is most of it and always was. A bonnet is the other
     * kind: with the bay open the air gets under the nose and lifts it,
     * and the front of the car stops being the end that turns. */
    lift: {
      mirrorL: 0,
      mirrorR: 0,
      bumperF: 0.02,
      bumperR: 0,
      lampFL: 0,
      lampFR: 0,
      lampRL: 0,
      lampRR: 0,
      spoiler: 0.12,
      exhaust: 0,
      hood: 0.06,
      hatch: 0.03,
      glassF: 0.03,
      glassB: 0,
      glassL: 0,
      glassR: 0,
      doorL: 0,
      doorR: 0,
      wheelFL: 0,
      wheelFR: 0,
      wheelRL: 0,
      wheelRR: 0,
    },
    /** Steering authority lost at `speed` with NO WINDSCREEN, as a
     * fraction. Not the rack: the driver. A hundred and forty of open air
     * in the face is a hundred and forty the driver is squinting through,
     * and the line goes where it can be seen rather than where it should
     * be. Faded by pace like everything else here — a screen that is gone
     * costs nothing at all in a village. */
    blast: 0.22,
    /** THE CAR WITH A HOLE DOWN ONE SIDE. Drag standing off the
     * centreline is a yaw moment, and the car wanders toward the open
     * flank all the way down every straight. Lock carried per m² of
     * one-sided CdA, at `speed`: one door gone (0.08 m²) is 0.02 of lock,
     * a fifth of what a whole side folded to the cage is worth — a
     * nuisance to be held down every straight, never a fight. The shell's
     * own `chassis.pullMax` caps the two together. */
    yawPerDrag: 0.25,
  },

  /** THE COOLING SYSTEM — the one piece of damage in the game that takes
   * its TIME. A radiator stands ahead of everything else on the car, so a
   * nose-on fold hard enough to matter has holed it before it has touched
   * the block behind it. What that costs is not power. The engine keeps
   * making its heat, the coolant that carried the heat away is on the
   * road two corners back, and the needle climbs: past boiling the engine
   * starts eating itself, and an engine that has eaten itself is the run
   * over where it stops.
   *
   * Which makes it the one piece of damage a driver can DRIVE around.
   * Heat is made by the throttle and shed by the air coming through what
   * is left of the core, so lifting on the straights, short-shifting and
   * giving away ten seconds a split is the difference between limping a
   * holed radiator to the line and parking it in a forest. That trade is
   * the whole reason this group exists — everything else in the ledger is
   * a thing that has already happened to you, and this is a thing you are
   * still deciding.
   *
   * `CarState.heat` is the gauge, 0 (running temperature) .. 1 (boiling).
   * Written by game/cooling.ts, and the only number in the damage model
   * that ever comes back down. */
  cooling: {
    /** Gauge made per second at full throttle, and per second by an
     * engine merely running. A sound car sheds both without the needle
     * ever leaving its peg — `still` and `ram` below are sized to beat
     * them by a wide margin, because a stage is not a thing a healthy car
     * overheats on. */
    loadHeat: 0.1,
    idleHeat: 0.01,
    /** Gauge shed per second standing still with a SOUND system — the fan
     * and the mass of the block, and the whole of what a car sitting on a
     * start line has... */
    still: 0.05,
    /** ...plus the ram air through the core, per second at `airSpeed`,
     * scaled linearly by the pace: this is why a hurt car cools on a fast
     * straight and boils in a hairpin sequence. */
    ram: 0.1,
    airSpeed: 30,
    /** Share of ALL of that shedding a holed core has lost, at cooling
     * damage 1 — nearly all of it. A system with no coolant in it is a
     * fan blowing over a dry block, and a dry block is what boils. */
    lost: 0.7,
    /** Where the needle goes into the red, 0..1 of the gauge: the
     * `overheat` call goes up here and the engine starts taking damage
     * for every second past it... */
    redline: 1,
    /** ...and where it is called back out again, so a needle sitting on
     * the line does not announce itself twice a second. */
    clearAt: 0.88,
    /** The first warning, 0..1 — far enough under the red line that
     * lifting off is still a choice rather than a reaction... */
    warnAt: 0.62,
    /** ...and the share of it the needle has to fall back through before
     * that warning can be given again, so a car cooling and heating
     * around one line does not say so on every lap of it. */
    rearm: 0.8,
    /** Engine damage taken per second at the red line, and again per
     * second per gauge-point past it: a needle pinned hard over cooks the
     * engine in well under a minute, a needle wavering on the line takes
     * a stage to do it. */
    cookRate: 0.02,
    cookPerOver: 0.05,
    /** ...and how far past 1 the gauge is allowed to go, so the cooking
     * has a ceiling rather than running away with the arithmetic. */
    heatMax: 1.6,
    /** Fraction of engine power gone with the needle on the red line —
     * the timing pulled out of a hot engine, which is what a driver
     * actually feels before anything breaks. Faded in from `warnAt`. */
    heatPower: 0.25,
  },

  /** The machinery under the panels: how crush becomes internal damage
   * (per m of crush on the zones nearest each system), and how a damaged
   * system degrades its own job. All damage is 0..1 and never repaired.
   * Every effect is sized so a hurt system CRIPPLES the car long before
   * it parks it — and one of them does park it: an engine at 1 is dead,
   * and a dead engine is the run over (`retire`). */
  systems: {
    /** Nose crush → engine (the radiator is the first thing to fold, and
     * the block is right behind it). Sized so that a wall met square at
     * 100 km/h — 0.27 m of fold — is the engine gone, and one met at
     * 50 km/h is a third of it: a head-on at any road speed is a bad
     * day, and above about 50 it is the run. */
    engineFromNose: 4.4,
    /** ...and nose crush → the COOLING, which stands in FRONT of the
     * block and is therefore holed first and holed harder. Above
     * `engineFromNose` on purpose, and that ordering is the whole point:
     * a wall met at 50 km/h leaves an engine that still pulls and a
     * cooling system that no longer works, so a modest head-on does not
     * end a run — it starts a clock the driver can still race
     * (`collision.cooling`). At 70 the core is finished outright, and
     * getting home is a question of how slowly you are willing to go. */
    coolingFromNose: 6,
    /** ...multiplied by this once the FRONT BUMPER is off the car: the
     * bar and the valance under it are the only things standing between
     * a rally car's core and the next tree, and once they are gone the
     * core is the bumper. */
    coolingBareCore: 1.6,
    /** Flank crush → suspension (arms and uprights live in the arches). */
    suspensionFromFlank: 1.5,
    /** Rear crush → gearbox (the drivetrain hangs off the back). */
    gearboxFromRear: 1.5,
    /** Front-corner crush → steering (the rack's tie rods end there). */
    steeringFromCorner: 1.0,
    /** Belly crush → suspension, plus a share to the gearbox sump. */
    suspensionFromBelly: 2.2,
    gearboxFromBelly: 0.8,
    /** ...and to the ENGINE, through the sump. The oil pan and the
     * bellhousing are the lowest parts of the motor and a floorpan
     * folding up into them is how a rally car retires without ever
     * hitting anything — but a crossmember and the pan's own bash plate
     * stand between the ground and the casting, so this is a quarter of
     * what the same fold on the NOSE is worth (`engineFromNose`, where
     * the radiator is the first thing there): the floorpan folded to its
     * cap is half an engine, not a dead one. A stage driven well folds
     * 0.03 m of floor in a whole run and pays four hundredths of it. */
    engineFromBelly: 1.2,
    /** ...and to the STEERING, through the rack. It is bolted low and
     * forward, ahead of the floorpan and behind the crossmember, so the
     * ground finds it — later than it finds the sump, and with the
     * subframe taking most of what reaches it. */
    steeringFromBelly: 0.6,
    /** Corner and flank crush → the brakes (the lines and calipers live
     * in the wheel wells), and belly crush → the same, from underneath. */
    brakesFromCorner: 0.9,
    brakesFromFlank: 0.5,
    brakesFromBelly: 0.7,
    /** Corner crush → THAT corner's wheel; flank crush → both wheels on
     * that side, half each; belly crush → all four, a little. Per m of
     * fold, against a wheel ledger that reads flat at `chassis.wheelFlat`
     * and gone at 1: a corner driven into a trunk hard enough to fold it
     * a third of a metre is a wheel on the road. */
    wheelFromCorner: 3.6,
    wheelFromFlank: 4.0,
    wheelFromBelly: 0.6,
    /** ...and a landing taken ON THE SIDE, where the flank crush already
     * dealt to that side's wheels is not the whole of it: the wheels are
     * what the car came down on. Per m of the landing's crush, on top. */
    wheelFromSideLand: 1.4,
    /** ...and a car that came down ON ITS ROOF. Nothing mechanical lives
     * up there, but the load goes down the pillars into the floor and out
     * to every mount hanging off it: all four corners are flailing on
     * their springs with the car's weight on top of them, and the column
     * is in the cabin that just folded. Per m of roof crush. */
    wheelFromRoof: 0.7,
    suspensionFromRoof: 1.6,
    steeringFromRoof: 1.2,

    /** Fraction of engine power gone at engine damage 1 — half the
     * motor, on top of the misfire that comes with it (chassis below).
     * A beaten car has to be visibly, tiringly slow up every hill. And
     * AT 1 the engine is dead: no power at all, and the car coasts to
     * wherever it stops. */
    powerLoss: 0.5,
    /** Fraction of the brake pedal gone at brakes damage 1 — never the
     * whole pedal: a rally car has two circuits, and one of them is
     * usually left. */
    brakeLoss: 0.6,
    /** ...and of the LEVER. The handbrake is one cable to the rear, and
     * it goes almost entirely: a car with broken brakes cannot be flicked
     * round a hairpin on it, which is most of what the lever is for. */
    leverLoss: 0.9,
    /** Fraction of steering authority gone at steering damage 1. Enough
     * that the corner the sound car turned in for has to be braked for,
     * and short of the car simply refusing to change direction. */
    steerLoss: 0.45,
    /** Fraction of lateral grip gone at suspension damage 1. The tires
     * are also being taxed by the structure and the missing wing, and
     * `chassis.gripFloor` is what stops the three of them stacking into
     * a car that cannot be pointed at all. */
    gripLoss: 0.26,
    /** Fraction of the hard-landing tolerance gone at suspension 1 —
     * shot dampers turn ordinary jumps into underside hits. */
    landTolerance: 0.45,
    /** Extra sloppy-landing yaw wobble at suspension 1 (multiplier-1). */
    wobble: 1.0,
    /** Manual shift cut stretches by this factor at gearbox 1... */
    shiftCut: 2.5,
    /** ...and the auto box, seamless when sound, cuts this long per
     * shift at gearbox 1, s. */
    autoCut: 0.3,
  },
} as const;
