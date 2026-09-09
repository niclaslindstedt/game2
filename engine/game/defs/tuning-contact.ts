// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Half of `TUNING.collision` (see `tuning.ts`): THE CONTACT ITSELF — the
// body's collision box, how hard a hit rebounds and how much of it turns
// into yaw, and what the car meets: solids, other cars, and the kerb.
// What a contact COSTS is `tuning-damage.ts`.

export const CONTACT_TUNING = {
  /** The body's collision box in the ground plane, m — half-length along
   * the nose and half-width across it. ONE box serves the whole catalog,
   * and it has to CONTAIN every drawn shell: a body poking out of its
   * collider is a car that visibly passes through trunks before anything
   * happens, which reads as the whole contact model being broken. The
   * length is measured to the BUMPER face, not the profile's end
   * station, because that is what meets the tree. The longest cars sit
   * exactly on 2.1 and the widest on 0.895, so a new car has almost no
   * room in length — tests/car_geometry_test.ts holds both ends of this
   * against pwa/src/game/car-styles.ts and fails if a spec outgrows it.
   * What a smaller car gets in exchange is a couple of centimetres of
   * early scrape, which is invisible. */
  halfLength: 2.1,
  halfWidth: 0.92,
  /** ...and the rest of that box, STANDING UP, m — measured from the
   * wheel contact plane, which is what `CarState.y` is. Where the wheels
   * meet the ground across the car, how high the sill and the roof sit,
   * and how high the weight in it rides.
   *
   * The ROLL is the only thing that reads them (`game/roll.ts`), and it
   * reads all four: they are the outline a car off its wheels turns over
   * on, and the height its centre has to be lifted through to get from
   * one face of it to the next. Everything about where a roll ENDS comes
   * out of these numbers and the car's own weight placement.
   * tests/car_geometry_test.ts holds them against the drawn shells. */
  halfTrack: 0.74,
  /** ...and how far ALONG the car those wheel contacts sit, m — half the
   * wheelbase. The shell's corners are out at `halfLength`, the tyres a
   * good metre inside them, and the difference is the whole of what a
   * PITCHED body stands on: nose-down on its wheels it rides the front
   * axle, nose-down past that it rides the bumper. The catalog runs
   * 2.38–2.44 m of wheelbase, so one number serves it as the box does. */
  halfBase: 1.2,
  floorY: 0.28,
  roofY: 1.4,
  /** ...and how high the REFERENCE weight rides, m — the box's own, for
   * a geometric question asked with no car in hand. Each car carries its
   * weight at its own height and its own place along the wheelbase
   * (`CarSpec.centreHeight`, `balance`), and the roll asks every
   * question of that one (`roll-hull.ts`, `MassSpread.weight`). */
  centreY: 0.5,
  /** Fraction of the closing speed bounced back off a solid AT A GENTLE
   * CONTACT, 0..1 — the bumpers and the bark giving and returning. It is
   * the top of a curve and not a constant: past `scuffSpeed` the arrival
   * is spent deforming the car, and deformation returns nothing, so the
   * coefficient falls as `elasticSpeed / (elasticSpeed + over)`
   * (`structure.ts`, `restitutionAt`). A constant coefficient, however
   * low, threw a car that met a wall at 120 km/h back up the road at 35 —
   * a rubber ball where there should be a wreck. */
  restitution: 0.3,
  /** ...and the closing speed over the scuff floor at which that has
   * halved, m/s. Barrier tests put a car's restitution at about a third
   * at walking pace, a tenth at 50 km/h and a twentieth at 100; this sits
   * that curve on those points: 0.1 at 50 km/h, 0.05 at 120. */
  elasticSpeed: 6,
  /** WHAT THE SHELL IS MADE OF, face by face — read through
   * `structure.ts`, which is the one place a contact asks how the car is
   * built before deciding what a blow does to it. */
  structure: {
    /** HOW MUCH OF AN ARRIVAL EACH FACE PASSES ON to the body rather than
     * folding, m/s — the asymptote a contact's reaction saturates at. A
     * structure collapses at a roughly fixed force, so the faster a
     * corner arrives the more of the arrival goes into the metal and the
     * less into turning what is left of the car: under this figure the
     * body takes nearly all of it, well over it the extra is almost
     * entirely fold. It is the same arrival `landingDamage` books the
     * crush off, priced once on each side — and it is per face because
     * the faces are different things:
     *
     * - `crumple` is the nose and the tail: zones BUILT to fold, at a
     *   moderate force, over half a metre. They pass on the least, so a
     *   car coming down on its nose is stopped by the contact.
     * - `flank` is a door skin over door bars — less room to fold, and a
     *   stiffer answer when it does.
     * - `belly` is the floorpan on the sills, met by a hard landing on
     *   the wheels. Stiff: there is no crumple zone under a car.
     * - `roof` is the CAGE, the stiffest thing on a rally car. It folds a
     *   hand's breadth and passes the rest on, so a car coming down on
     *   its roof is THROWN by the contact — which is what a rollover on a
     *   caged car looks like, and why it keeps going.
     * - `cage` is what any face becomes once it has folded to its cap:
     *   the panel is gone and the structure behind it is what the ground
     *   meets. Every face climbs toward this as it is used up, so a car
     *   gets HARDER as it is destroyed, and the fifth contact of a roll
     *   kicks the body where the first one stopped it.
     *
     * The figures are for `refMass`; a fixed force changes a heavier
     * body's speed less, so they are divided by the car's own mass ratio.
     * The old single number for every face and every car was 2.5, and the
     * spread here is centred on it: a roll's outcome is chaotic in this
     * figure (2.0 gave 0.60 g, 2.5 gave 0.41, 3.0 gave 0.68 on one seed),
     * so judge any move on `make roll`'s twelve rows, never on one crash. */
    fold: { crumple: 1.7, flank: 2.5, belly: 3.2, roof: 3.8, cage: 5.5 },
    /** How far the ROOF may fold, m — the cage's own stroke, against the
     * ring's `zoneMax`. A rally cage keeps the roof off the crew: 15 cm
     * is a roofline that has come down to the top of the door frames,
     * and past it the cage holds and only the wear goes on. It is also
     * the whole scale the health schematic reads the roof against. */
    roofMax: 0.15,
    /** ...and how much of `crushPerSpeed` a roof arrival folds, 0..1. The
     * cage is stiffer than any panel, so the same arrival dents it less —
     * and what it does not fold it passes on to the body (`fold.roof`). */
    roofCrush: 0.5,
    /** THE NOSE ATTITUDE PAST WHICH A CAR ARRIVES ON AN END OF ITSELF
     * rather than on its wheels, rad — the car's APPROACH ANGLE, and a
     * measurement off the bodywork rather than a feel knob: the bumper
     * hangs about 0.3 m off the ground at the end of about 0.7 m of front
     * overhang, so past roughly 23° the bumper is what reaches the ground
     * first and the tyres never get a say. Positive pitch lifts the nose,
     * so past this nose-DOWN the nose folds (zone 0) and past it nose-UP
     * the tail does (zone 4).
     *
     * It is a HAND-OVER and not a switch: at exactly this angle the
     * bumper and the tyres touch together, and only by
     * `attitude.pitchMax` — the steepest the body is ever allowed to
     * stand — are the springs out of the load path altogether.
     * `landingDamage` reads the two ends against each other, so a jump
     * flown a degree past the line costs what the same jump flown a
     * degree short of it did.
     *
     * The steepest a bot's landing arrives at over thirty-six stage runs
     * is 17°, which is the margin this has to keep: an ordinary jump,
     * however badly flown, is a belly arrival, and the nose folding is
     * for a car that genuinely went over an edge. */
    diveAngle: 0.4,
  },
  /** Fraction of the speed ALONG the surface kept through the contact —
   * a glancing blow scrubs paint and carries on. */
  tangentKeep: 0.82,
  /** Yaw kicked into the body by an off-center hit, rad/s per (m/s of
   * velocity change × m of lever arm) — what makes a clipped tree spin
   * the car instead of politely stopping it. */
  yawKick: 0.35,
  /** ...and the most any ONE contact may put in, rad/s. The kick above is
   * linear in both of its terms, and a car that arrives at a trunk
   * sideways at pace has its whole lateral speed reversed on the lever of
   * its own nose: thirty m/s across the car at the nose corner asked for
   * twenty-seven rad/s — four and a third turns a second, off one clipped
   * tree. Past a point the sideways speed goes into FOLDING the nose
   * rather than turning the car, which is what the zone's crush already
   * books, so the kick saturates here instead of scaling. The same
   * argument the roll's `air.tripMax` makes on the other axis: a turn a
   * second is as fast as a car is spun by being hit.
   *
   * Approached through a `tanh`, not clamped: a hard `min` would put a
   * cliff one notch either side of the limit, where two contacts a
   * fraction apart in severity come out identical. Small kicks — which is
   * every contact a car actually has — pass through unchanged. */
  yawKickMax: 6,
  /** Closing speed under which a contact is a scuff: no crush, no wear,
   * no event — parking against a rock is not an accident, m/s. Nothing
   * is knocked loose or broken under it either, for the same reason. */
  scuffSpeed: 3,

  /** THE THING ON THE OTHER SIDE OF THE CONTACT. Every solid carries a
   * mass, a rooting and a snapping strength (mapgen/solids.ts); these are
   * the numbers the CAR spends against them. */
  solids: {
    /** Impulse the ground's hold on a solid survives, N·s per kg of the
     * mass it is holding, at rooting 1. Past it the thing comes out of
     * the ground and leaves with whatever momentum the car gave it: a
     * loose rock at a walking pace, a bedded boulder only if you arrive
     * at it with a whole stage's worth of speed, an outcrop never.
     * Deliberately ABOVE what wood survives (solids.ts), so a rooted
     * tree always breaks before it is pulled out of the ground. */
    anchorPerMass: 40,
    /** How much of the closing speed comes BACK off a solid the car has
     * knocked out of its bed, 0..1 — the free-body exchange's own
     * restitution, under the wall's `collision.restitution`. A stone
     * that is going to leave does not first bounce the car off itself;
     * it is shoved, and the car pays its share of the momentum and
     * little else. This is what makes the smallest solid on a stage a
     * bang and a dent rather than a third of the car's speed. */
    looseRestitution: 0.1,
    /** Cap on how fast a solid the car knocked loose leaves, m/s. Past
     * it a stone reads as a bullet rather than as something heavy that
     * was hit very hard. */
    throwMax: 25,
    /** A thing that BROKE instead of moving leaves at this share of the
     * closing speed. Most of the impulse a snapping trunk takes goes
     * into breaking it, not into throwing it: a felled tree comes down
     * where it stood, going the way the car was going. */
    toppleKeep: 0.25,
    /** ...and how much of that speed goes UP. A rock is struck below its
     * own middle, so it lifts as it goes; a snapped trunk gets the same
     * share and topples on the way. */
    throwLift: 0.35,
    /** THE TRIP. A solid whose top is below the car's centre of mass
     * catches the bottom of the car while the rest of it keeps going —
     * which is how a rally car actually rolls: not off a bank, off a
     * rock. Roll rate per m/s of the sideways velocity the contact took,
     * rad/s. Sized so a flank sliding at pace into something low and
     * solid goes over, and an ordinary clip only leans — against the
     * velocity change a car that FOLDS against the rail actually makes
     * (`restitutionAt` at pace is a twentieth, not the constant three
     * tenths the old 0.18 was sized against, and the same rail took a
     * fifth less out of the car). The roll lane's rail is the bench. */
    trip: 0.22,
    /** Everything at or below this stands under the car's centre of mass
     * and trips it fully, m... */
    tripTop: 0.55,
    /** ...and by this — the roofline — the contact is spread up the whole
     * flank, its middle sits where the car's own mass does, and there is
     * no lever left: a trunk shoves the car sideways, it never rolls it. */
    tripFade: 1.45,
    /** Roll rate a trip has to reach before the wheels actually come off
     * the ground, rad/s — under it the car leans and the ground takes it
     * back. Past it the car is FLYING, and whatever the roll was doing it
     * now keeps doing (car.ts owns the air). */
    tripLaunch: 1.6,
    /** ...and how much lift that costs the ground, m/s per rad/s of trip.
     * Enough air for the roll to reach past upright — a car tripped hard
     * enough to leave the ground lands on its roof, not back on its
     * wheels. */
    tripLift: 1.1,
  },

  /** THE OTHER CAR. A rally stage is driven alone, but a stagger only
   * holds if everybody drives it at the same pace — catch the crew in
   * front and they are a solid that is going somewhere, and the contact
   * is between two things that both give. Which is the difference from
   * everything in `solids` above: neither side is anchored, so the
   * exchange is a two-body one and BOTH cars pay for it. */
  cars: {
    /** Fraction of the closing speed bounced back, 0..1. Lower than a
     * tree's: two crumpling shells absorb a hit rather than trade it,
     * and a pair of cars that ping apart reads as bumper cars. */
    restitution: 0.22,
    /** Fraction of the RELATIVE speed along the contact kept — high, so
     * running down the flank of the car in front is a scrape that leaves
     * both of you going, not a pair of cars welded together. */
    tangentKeep: 0.88,
    /** Yaw kicked into each body per (m/s of its own velocity change ×
     * m of lever arm). Above the tree's kick: a tap on the corner of a
     * car that is already travelling is the classic way to put one
     * round, and it is the whole point of being allowed to touch. Under
     * the same `yawKickMax` ceiling — what a body can be spun to by
     * being hit is a property of the body, not of what hit it. */
    yawKick: 0.5,
    /** How far apart in height two cars can be and still touch, m. Past
     * it one of them is over the other — a landing on somebody's roof is
     * not a contact this model has any business resolving. */
    reach: 1.6,
    /** How deeply a car-to-car hit folds panels, as a share of what the
     * same closing speed into a tree would fold. Under half each, so a
     * two-car contact costs about as much bodywork in total as one tree:
     * a post does not deform and a car does, and the energy that went
     * into the other car's panels did not go into yours. */
    crushShare: 0.45,
  },
  /** R26 — THE ANTI-CUT BLOCKS. A concrete block laid along the inside of
   * a corner is not a thing to be crashed into: it is a thing the car
   * RIDES OVER, and everything it does follows from that. The wheels on
   * one side go up and come off again, the car is shoved back out of the
   * inside, and it costs speed. What it never does is fold a panel —
   * cutting an apex has to be paid for, not punished with the run, or
   * every corner on the stage is a wreck waiting for a tidy line.
   *
   * The blocks are 0.6 m of road 3.4 m apart, so an apex taken over them
   * is several of these in a row and the costs COMPOUND: one is a thump
   * and a twitch, a whole apex cut over them is a gear and a car that
   * arrives at the exit pointing the wrong way.
   *
   * WHAT A WHOLE APEX CUT IS WORTH is the number this group is set
   * against, and it is about a fifth of the car's speed — a price a
   * driver pays on purpose to straighten a corner, not a stop. It is
   * `keep` compounded over the handful of blocks a row gets to bite, and
   * `analysis/drive.ts`'s `kerb` check measures exactly that by driving
   * the reference car down every apex row on the stage. */
  kerb: {
    /** Speed the car keeps through one block, 0..1 of what it had. Five
     * bites is a full apex row, and 0.955⁵ is the fifth above. */
    keep: 0.955,
    /** Under this the car is stepping over a block rather than mounting
     * it: no jolt, no thud, no cost, m/s of closing speed. */
    clipSpeed: 2.5,
    /** The BITE CEILING, m/s: the closing speed past which a slab bedded
     * down to `KERB_MARKER.block.proud` is simply driven over. Climbing a
     * hand's height of concrete costs what it costs; arriving twice as
     * fast does not make it taller. Everything but `keep` is priced off
     * the bite rather than the closing speed, which is what separates a
     * kerb from a wall — see `clipKerbs`. */
    biteMax: 6,
    /** Sideways shove out of the inside of the corner, m/s per m/s of
     * bite — the block doing what it was laid there to do. */
    shove: 0.32,
    /** Roll rate the mounted side is lifted at, rad/s per m/s of bite. An
     * order under `solids.tripLaunch`, and capped below it, so a kerb
     * never puts a car over however hard it is taken. */
    lift: 0.06,
    liftMax: 0.9,
    /** Yaw the shove drags the nose round by, rad/s per m/s of bite.
     * Small on purpose: a block unsettles the car, it does not spin it. */
    yaw: 0.035,
    /** Heave thrown into the springs per m/s of bite, m/s of ride rate —
     * the wheels going up over the slab and dropping off the far side,
     * which is the wobble the player actually feels. */
    heave: 0.11,
    /** How long the body is deaf to the kerbing after one bite, s. A
     * block is 0.6 m of road and the car is inside one for several steps
     * at any speed; without this it is jolted on every one of them, and
     * one block costs what a whole apex should. */
    again: 0.08,
    /** A SOLID ridden over (`clipSolids`) counts as this many blocks at
     * most, however tall it stands under the bar: the bite, the shove,
     * the roll and the heave all scale with how far it stands proud of a
     * block's `KERB_MARKER.block.proud`, capped here so the biggest stone
     * the wheels take is a hard lurch and never a launch... */
    overMax: 3,
    /** ...and the longest the body stays deaf to the next one after it,
     * s — normally the time the whole body takes to pass over the stone
     * at the pace it is doing, so a stone is one bite; at a crawl that
     * would be longer than the stone deserves. */
    overFor: 0.6,
  },

  /** Panel crush per m/s of closing speed past the scuff floor, m. A
   * 30 m/s head-on folds the nose ~0.3 m in. */
  crushPerSpeed: 0.011,
  /** A zone's panels can only fold this far, m — past it the cage holds
   * and further hits only add wear. */
  zoneMax: 0.4,
  /** Structural wear per meter of crush dealt (wear reaching 1 is the
   * wreck). ~1.1 lets a car survive several hard hits, not a dozen. */
  wearPerCrush: 2.4,
  /** ...and the share of it a fold the panel had no room for still costs,
   * 0..1. Past `zoneMax` the cage is taking the blow instead of the sheet
   * metal, and a cage taking a blow is a cage doing its job: it is spent
   * by it, but slower than the panel in front of it was. The number only
   * shows on a face hit over and over — a nose already flat, or the flank
   * a roll grinds along on for a second and a half. */
  wearPastCap: 0.3,
  /** Wear a wrecked car is patched back to when it is next put on the
   * road — rally service on the spot: drivable, but half the car's life
   * is spent. A wreck is never teleported home on its own. */
  repairTo: 0.5,
  /** Zone crush that tears each part off its bolts, m. Mirrors pop off
   * a brush; bumpers and the wing take a real hit; a bonnet or boot lid
   * only lets go once the clip around it has folded far enough to pull
   * its hinges, which is deeper than the bumper in front of it. The
   * GLASS goes between the two: a screen shatters once the cap it is
   * set into has folded past the bumper, and a door window once the
   * flank behind it has. A DOOR is the deepest thing on the flank —
   * it takes a side driven into a rock at pace, most of the way to the
   * cage — and what is left showing is the cabin. */
  partAt: {
    mirror: 0.04,
    /** The lamps sit in the very face of each cap, and they are glass:
     * they go on the first fold that is more than a brush — a wall met
     * at 30 km/h — well before the bumper under them lets go. Read per
     * LAMP, not per end: a corner folded this far takes the lamp on that
     * corner, and only a nose driven in square takes the pair. */
    lamp: 0.05,
    bumper: 0.12,
    spoiler: 0.1,
    /** THE EXHAUST, and the one bolt in this list the FLOOR shears
     * (`CarDamage.belly`) rather than a ring zone. The pipe hangs below
     * the floorpan and is the lowest thing on the car, so the ground is
     * what finds it.
     *
     * SET AGAINST WHAT A GOOD DRIVER DOES, because that is the only line
     * worth drawing here: over 36 bot runs (three cars, twelve seeds) the
     * hardest single landing is 12.4 m/s and the most floor any WHOLE run
     * folds is 0.033 m — two thirds of them fold none at all, because a
     * driver who reads a crest lands on the far side of it. So 0.05 m is
     * out of reach of a stage driven well, and one properly missed jump
     * away for anybody else: about 14.5 m/s of descent past what the
     * springs swallow free (`hardLandSpeed`), or a run that keeps
     * bottoming out on crests until the same total arrives the slow way.
     * Still the earliest bolt in the ledger against its own cap
     * (`zoneMax`, 0.4 m) — it costs the driving nothing but the noise and
     * the smoke, so it is allowed to be the thing that goes first.
     *
     * A tail driven into something takes it too, at the rear bumper's own
     * line: a pipe bolted under the rear valance does not survive the
     * valance. */
    exhaust: 0.05,
    /** The GLASS does not shear at a line — it crazes toward one. This
     * is the crush that finishes a pane rather than the crush that first
     * marks it: the whole of the way there is a screen the driver is
     * looking through a crack in (`collision.glass`). */
    glass: 0.15,
    lid: 0.2,
    door: 0.3,
    /** ...and what the ROOF folding shears, m of `CarDamage.roof`. The
     * glass is the whole point: a car on its roof loses the screen and
     * the side windows on the first proper slap, because laminated glass
     * bonded into a shell survives exactly as long as the shell keeps its
     * shape. The mirrors go with the pillars they are hung off, and the
     * lids let go last, when the folding has pulled far enough forward
     * and back to reach their hinges. */
    roofGlass: 0.04,
    /** ...and what the FLOOR folding is worth to the same glass, m of
     * `CarDamage.belly`. The argument is the roof's, from underneath: a
     * shell pulled out of true cannot hold bonded glass in it, and a car
     * that has folded its floorpan a hand's depth has moved its screen
     * aperture. Far higher than the roof's, because the cage is what the
     * glass is hung off and the floor is two feet away from it — a stage
     * driven well folds 0.03 m of floor in a whole run and leaves a
     * crack nobody can see (`crazeCurve` squares the share). A car that
     * came down flat from a height has folded ten times that, and has no
     * windows left. */
    bellyGlass: 0.3,
    /** The mirrors are the widest thing on the car and hang off the
     * pillars the same fold takes, so they go with the glass. */
    roofMirror: 0.04,
    /** ...inside the cage's own stroke (`structure.roofMax`): a bolt the
     * roof can never fold far enough to reach is a lid that never comes
     * off a rolled car. */
    roofLid: 0.12,
  },
  /** THE GLASS, and the fact that it does not simply vanish. A pane
   * CRAZES toward the crush that finishes it (`partAt.glass`, or
   * `partAt.roofGlass` of roof fold): a brush against a branch leaves a
   * mark in the corner of the screen, a proper thump leaves a web across
   * it, and only the hit that carries the ledger to 1 takes the pane out
   * of its frame — from which point it is a plate lying in the ditch
   * rather than a hole that was never a window.
   *
   * Nothing here is a rate: the crack is READ off the crush the panels
   * around the pane have already taken (`glassCrack`), so the number that
   * says when a pane is gone is the one number in `partAt` that always
   * said it, and a screen out at 0.15 m of nose is the same screen that
   * was out at 0.15 m of nose before it could crack at all. */
  glass: {
    /** The share of a square hit that an OBLIQUE zone puts through a
     * pane — a corner clipped is a screen cracked, a nose driven in
     * square is a screen gone. Under 1 by construction: a windscreen
     * lives behind the nose, and the two corners either side of it only
     * reach it at an angle. */
    oblique: 0.7,
    /** How much faster TEMPERED glass crazes than the laminated screen
     * in front of the driver. A door window and a backlight are not
     * bonded to two sheets of plastic: they hold together for a moment
     * and then they are gravel, so they spend far less of their life
     * cracked than the screen does. */
    tempered: 1.35,
    /** How the crazing RUNS from the first mark to the last, as an
     * exponent on the share of the finishing crush the panels have
     * taken. Glass does not break by degrees the way sheet metal folds:
     * a knock that dents a wing leaves a chip and two short legs in the
     * corner of the screen, and the web only fills out as the pane comes
     * up on the fold that finishes it. Above 1 is that shape; at 1 a
     * brush against a branch would leave a screen the driver could not
     * see through. */
    crazeCurve: 2,
    /** What a driver loses of their steering looking through a fully
     * crazed SCREEN, 0..1 — the one pane the car is driven through.
     * Unlike the blast through a screen that is no longer there
     * (`aero.blast`), this does not fade with the speed: a crack in the
     * glass hides the same corner at 40 km/h as at 140. */
    viewLoss: 0.12,
  },
  /** THE END OF THE RUN, short of the line. A car whose engine has died
   * (`systems.engine` at 1) or that has fewer than three wheels left is
   * never going to move under its own power again, and once it has come
   * to rest — under this speed, m/s, on the ground — the run is retired
   * where it stands (`step.ts`, the `retire` event). The wedge rescue
   * and the reset both stand aside for it: putting a dead car back on
   * the road would only park it there. */
  retire: { restSpeed: 0.8 },
  /** WHEN THE CAR SAYS SOMETHING ABOUT ITSELF: the two lines a system
   * (or the shell's wear) crosses on its way out, 0..1, each worth one
   * `systemFail` call. There is nothing to look at any more — the crush
   * is on the body and the machinery is under it — so these are what the
   * driver is told, and they are set where the DRIVING changes rather
   * than at tidy fractions. `hurt` is a little under the misfire
   * (`chassis.misfireFrom`) and the box's lost top gear
   * (`chassis.topGearAt`), so the warning arrives before the symptom;
   * `spent` is past both, where the part is doing most of what it will
   * ever do to the car. Two calls, not five: a part that reports every
   * tenth is a part nobody reads. */
  callAt: { hurt: 0.45, spent: 0.85, dead: 1 },
  /** The mass every other number here is written against, kg. A car's
   * own `mass` is read against this: heavier spins less off a clipped
   * tree, folds deeper for the same closing speed (the energy is real),
   * and rides its springs more slowly. */
  refMass: 1200,
  /** THE RIDE-OVER BAR, m over the car's own ground. A solid whose top
   * stands under it is under the bumper's lower lip and the floor — the
   * WHEELS climb it and the body passes over, resolved like an anti-cut
   * block (`clipSolids`: speed, a lurch, a thump, never a fold). Above it
   * the thing meets the body and the contact model has it. It sits a
   * little over the placement bar (`SOLID_PROP_HEIGHT`, 0.43 m — the
   * field stands up anything taller than that), so the SHORTEST solids
   * the field places are mounted rather than hit: the bottom of the nose
   * is soft, and a stone the height of a wheel is a bump in the ride and
   * not the end of the run. Held under the lowest hood by
   * tests/car_geometry_test.ts, because past the hood the body plainly
   * meets it — and the lowest hood is the four-wheel-drive's 0.74 m lip,
   * which is what put this bar where it is. */
  rideOver: 0.52,
  /** THE GROUND AS A SOLID. Grade (dy/dx) the wheels can still scrabble
   * up: below it a rise is a hill the car climbs and the grade term
   * pushes back on, above it the ground starts REFUSING the car. 0.95 is
   * a little under 45° — arcade-generous on purpose: a bank, a cut verge
   * or the landing face of a jump met from behind is a thing the car
   * bounces up over, and only ground a car plainly could not climb is
   * a wall. The generator's own verges (`STAGE_RULES.verge.climb`) stay
   * well under it. */
  climbLimit: 0.95,
  /** ...and the grade at which it refuses entirely — a cliff face, hit
   * at the full closing speed. 2.6 is about 69°. The wide band between
   * the two is what makes a steep bank a berm to lean on rather than a
   * wall: at 55° the face takes about a third of the closing speed. */
  wallSlope: 2.6,
  /** SPEED CARRIES A CAR UP A FACE. Between `climbLimit` and `wallSlope`
   * the ground is neither a hill nor a wall but a bank momentum takes:
   * at `from` m/s the wheels carry the car onto nothing steeper than
   * `climbLimit`, at `to` onto anything short of `wallSlope`, and the
   * grade they will take rises with the speed between (`climbGrade`,
   * limits.ts). A face steeper than the car's speed allows refuses it by
   * the shortfall — a crawl into a 55° bank is a stop, the same bank at
   * 80 km/h is climbed, with the grade term draining the speed on the
   * way up until it is not. Past `wallSlope` the face is a wall at any
   * speed, and it folds the nose. Whatever the ground is made of: rock
   * and soil are the same face to a wheel, and what tells them apart is
   * how steep the country stands them (R31 keeps built soil under
   * `climbLimit`; rock stands where it stands). */
  climbSpeed: { from: 6, to: 22 },
  /** Closing speed into a FACE under which the contact is a scrape and
   * not a fold, m/s — its own floor, above the solids' `scuffSpeed`,
   * because a bank is met with the wheels first and a trunk with the
   * bumper. A cliff at pace still folds the nose (the refused speed is
   * the whole closing speed); a steep bank taken at 50 km/h costs speed
   * and paint, never the run. */
  faceScuff: 6,
  /** Baseline the struck face's gradient is read over, m — short, because
   * what matters is the wall the bumper is against, not the shape of the
   * mountain behind it. */
  faceSpan: 1.5,
  /** Descent speed relative to the ground the suspension absorbs for
   * free, m/s — landing harder than this crushes the underside (or the
   * flank, on a car that came down on its side). Set just over what a
   * designed ramp jump comes down with, so the marks come from cliff
   * plunges and botched flights, not from every lip on the stage. */
  hardLandSpeed: 10,
} as const;
