// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the handling tuning (`tuning.ts`): THE SLIDE. There is no
// separate drift model — this is the grip model read sideways — so every
// number here is about the hand-over into a slide, how deep a given lock
// goes, how it lets go, and the spin at the far end of the same curve.
// The `drift-feel` skill owns what each one does to the feel.

export const DRIFT_TUNING = {
  /** THE DRIFT — every knob that shapes the slide itself: where it starts,
   * how it comes in, how deep it goes, how it lets go, and when it READS as
   * a drift. The `drift-feel` skill is the map to this group; change these
   * before reaching for anything in `grip`. */
  drift: {
    /** Where the slide begins to come in, as a fraction of the lateral grip
     * the tires actually have (`gripAccel`). Under 1 on purpose: the slide
     * starts easing in just BEFORE the tires are truly out of grip, so
     * nothing happens at the limit itself — there is no instant where the
     * car changes what it is doing. Lower = the drift lives in more of the
     * wheel's travel and ordinary corners start to move. */
    entryAt: 0.3,
    /** ...and how much further past that the slide takes to develop fully,
     * in the same units. Wider = a longer, gentler hand-over from grip to
     * slide; narrower = the angle arrives with less lock, at the cost of
     * the transition being something you can feel happen. */
    entrySpread: 2.5,
    /** Slip angle a fully developed slide is asking for, rad. This is the
     * DEPTH of a committed drift: the setpoint every deepening force fades
     * toward, scaled by how far the slide has come in. It is what makes the
     * angle commanded rather than self-chosen — half the slide is half the
     * angle, and a centred wheel asks for zero, which is grip gathering the
     * car up.
     *
     * THE REFERENCE SLIDE, which no layout actually sits at: every car in
     * the roster reaches some fraction of it (`drivetrain[].depth`) and has
     * to be provoked toward its own ceiling (`cap`) for the rest, so this
     * number is the ceiling on the whole game's drift and not an average of
     * it. It is a scale rather than a car, which is what lets the roster be
     * retuned without every knob quoted against it moving too.
     *
     * The layouts sit at 0.42 / 0.62 / 0.70 of it — about 8.7° / 12.8° /
     * 14.5° at full lock on gravel — and that is a TIGHT spread on purpose.
     * Real layouts do not differ two to one in how far sideways they can be
     * got; what separates them is which GROUND suits them
     * (`sealedSlip`, `slipGrip`) and whether the THROTTLE
     * sustains the angle once it is there. A rear-driver has a genuine
     * steady-state drift on power. A front-driver has none at all — the
     * driven front pulls the velocity back under the nose, so its big
     * angles are entry transients off the lever, the brake or a lift, and
     * they die the moment the power goes down. A four-wheel-drive is
     * between the two and is driven turning INTO the corner rather than on
     * opposite lock. All three of those live in `drivetrain[].pullStraight`
     * and `powerYaw`, not here — so this group can stay narrow and
     * believable while the cars still feel nothing like each other. */
    angleSpan: 0.36,
    /** How far past the asked angle the deepening forces take to fade to
     * nothing, rad. Wide enough that the drift is a slope to lean on rather
     * than a wall the car hits: it is the room the throttle, the lift and
     * the handbrake move the car around in. Narrower also means the car
     * sits closer to exactly the angle asked for.
     *
     * A LITTLE wider than `angleSpan`, and it has to stay at least that:
     * the angle the wheel asks for is deliberately modest on two of the
     * three layouts, and the moves that make up the difference — the flick,
     * the trailed brake, the lever — all work by taking the car PAST it.
     * Narrow the band under the span and they have nowhere to take it:
     * every deepening force fades out a few degrees past the wheel's own
     * ask, the provocation stops paying, and a driver managing a slide
     * finds the car falling out of it under them. (The sim is unusually
     * loud about this one: at 0.31 against a span of 0.36 a bot that had
     * driven seed 1 cleanly for a year spent twenty seconds of it in the
     * trees.) So it moves WITH the span rather than staying put — it is a
     * room measured around the setpoint, not a distance from zero.
     *
     * It is also where a corner's angle really comes from, which is why it
     * had to move at all. The setpoint is what the wheel ASKS for and the
     * band is how far past it the car is still being pushed, and a band
     * two and a half times the span meant every layout ran out to much the
     * same angle whatever it had asked for: at full lock the hatch sat at
     * 19°, the four-wheel-drive at 25° and the saloon at 35° — a spread of
     * barely two to one over a roster whose setpoints differ by five. Sized
     * on the span, the wheel's own ask is what a held slide is worth again:
     * 9° / 11° / 18°. */
    angleBand: 0.42,
    /** How fast a slide the wheel has stopped asking for lets go, 1/s. The
     * only thing holding a slide up once the lock comes off, so it is what
     * carries one corner's angle into the next instead of snapping back to
     * grip the instant the wheel passes centre. */
    /** WHAT A MOVE BUYS, 0..1 of the reference slide. `drivetrain[].depth`
     * is what the WHEEL alone develops, and on anything but a rear-driver
     * that is deliberately not much: turn into a hairpin in the hatch on
     * the throttle and it washes wide, which is what a front-driven car
     * does. These three are the ways a driver takes the weight off the rear
     * and asks for the angle anyway, each lifting that ceiling toward the
     * reference — the layout's own `depth` is where the lift starts from,
     * so the move is worth most to the car that has the least of its own.
     *
     * The order they sit in is the order a driver reaches for them: the
     * flick is free and sets a corner up from a long way out, the brake is
     * the one that can be trailed all the way to the apex, and the lever is
     * the last resort that gets a car round something too tight for either.
     *
     * None of them ROTATES anything by itself — they open the slide, and
     * `grip.flickYaw`, `grip.liftYaw` and `grip.handbrakeYaw` are what walk
     * the car through the gap. A demand with no yaw behind it is a car that
     * has lost its grip and is still going straight on. */
    leverDepth: 0.8,
    flickDepth: 0.85,
    /** ...and the brake's, ×`drivetrain[].brake`. Trail braking is the move
     * this game is named after minus the hands: the nose goes down, the rear
     * goes light, and the corner tightens under a car that was understeering
     * a moment ago. It reads off the LAGGED brake load (`CarState.brakeLoad`)
     * and not the pedal, so a stab down the straight does nothing and a
     * brake carried into the corner does everything. */
    brakeDepth: 0.8,
    /** ...and the LIFT's, ×`drivetrain[].liftYaw`. The mildest of the four
     * and the only one that does not argue with the speed floor, which is
     * the whole shape of what a closed throttle is worth: breathe it in a
     * fast corner and the tail comes round a little, carry that into a slow
     * one and the floor closes on the slide as the car runs out of speed.
     * The lever and the brake are deliberate asks and claim the floor
     * exception (`provokeFloor`); coming off the power is not an ask, it is
     * a driver stopping doing something, and a car that could be drifted at
     * walking pace by lifting would have no floor at all.
     *
     * `liftSpan` beside it is the same pedal moving the SETPOINT within
     * whatever depth the layout already has; this is the pedal raising the
     * depth itself. Both are needed for the same reason a move needs a
     * demand and a yaw: on a layout whose own `depth` is 0.42 there is
     * nothing under the setpoint to move. */
    liftDepth: 0.45,
    /** ...and how far a full provocation lowers the SPEED FLOOR under all of
     * it, ×`slideFrom`. The floor is a rule the player is told — it will not
     * drift under 70 — and this is the one thing that argues with it,
     * because the corners that need a move are the slow ones: brake hard
     * enough to rotate a hatch into a hairpin and the car is under the floor
     * before the nose has come round, so without this the move that the
     * tight corner exists to demand is the one move the tight corner will
     * not allow. Only a MOVE claims it, and only as far as it goes — the
     * wheel alone never does. A scrabble out of a ditch, a nudge on the
     * grid and a hairpin taken badly are all still exactly as gripped as
     * they were: none of them is anybody asking for anything. */
    provokeFloor: 0.45,
    /** ...and how fast a provocation the driver has stopped making fades
     * back out, 1/s. The lever comes up in one tick and the weight it moved
     * does not: read raw, letting go of it drops the slide the car is
     * allowed in a single step, and the exit's own spring — which is sized
     * off exactly that drop — slams a car that is still mid-corner with the
     * lock still on straight again. Same shape as `steering.flickSettle`
     * and `grip.liftSettle`, and for the same reason. */
    provokeSettle: 1.1,
    /** How much DEEPER a fully closed throttle asks the slide to go, as a
     * fraction of `angleSpan`. The lift is the driver's other way into a
     * corner: the weight goes forward, the driven axle unloads, and the tail
     * comes round further than the wheel on its own would ever take it.
     *
     * It moves the SETPOINT, not the forces — `askedSlip` is what every
     * deepening term fades out against, the lift's own `liftYaw` among them,
     * so a lift that only pushed harder would be pushing against a band that
     * had already shut and the pedal would do nothing to the angle at all.
     * Moving the setpoint reopens the band and lets the whole slide carry
     * the car there. `grip.liftGrip` is the same lift's other half, pulling
     * the line tighter while this takes it further round.
     *
     * The MILD version of the pedal, deliberately: a bare lift is a driver
     * breathing the throttle, and the deliberate ask is the brake beside it
     * (`brakeDepth`). Taken much higher it out-deepens the rear-driver's own
     * throttle — `tests/drivetrain_test.ts` asserts the throttle deepens a
     * rear-driven slide and a lift does not, and that inverts around 0.45. */
    liftSpan: 0.35,
    /** ...and the OTHER pedal's version, ×`drivetrain[].powerYaw` — how much
     * deeper a fully open throttle asks a DRIVEN REAR to go. The lift's
     * mirror, and the thing that makes the layouts different cars rather
     * than three settings of one.
     *
     * A rear-driver on the power has a real steady-state drift: the rear
     * tyre's longitudinal force is what holds the car at a big angle, so it
     * sits there for as long as the throttle is down. A front-driver has no
     * such equilibrium at all — the driven wheels pull the velocity back
     * under the nose (`grip.pullStraight`), so its big angles are entry
     * transients off the lever, the brake or a lift, and they die the moment
     * the power goes on. Scaled by the layout's own `powerYaw`, that is
     * exactly what this says: 0.95 of it to the saloon, half to the
     * four-wheel-drive, none at all to the hatch.
     *
     * It has to move the SETPOINT rather than push harder, for the same
     * reason the lift does: every deepening force — `grip.powerYaw` among
     * them — fades out as the car reaches the angle being asked for, so a
     * throttle that only pushed would be pushing against a band that had
     * already shut. Pushing was in fact all it did, and the measurement is
     * why this exists: asked to hold twenty degrees the saloon settled at
     * 15.6° on the power against 12.6° off it, and raising `grip.powerYaw`
     * to four times its value moved that number DOWN, because the extra
     * rotation only bought more of the driver's own counter-steer.
     *
     * Off the LAGGED pedal (`1 - car.lift`), like everything else that
     * shifts weight: read raw, a throttle a player is feathering pumps the
     * angle several times a second. */
    powerSpan: 0.35,
    release: 0.4,
    /** THE OVERSHOOT on the way out, 0..1. How much the car's rotation
     * outlives the lock that made it: while the slide is letting go, the
     * yaw answers its target this much more slowly, so the nose keeps
     * swinging after the hands have stopped and carries a little past
     * centre — which is what makes a big drift's exit ask for a dab of
     * opposite lock. Zero is a clean gather-up with nothing to catch; a TAD
     * is the point, and past ~0.8 the exit becomes a second drift the other
     * way that has to be caught properly. */
    releaseHang: 0.88,
    /** ...and how hard the rear pulls the nose back toward the direction of
     * travel while it does, rad/s per rad of slip. This is the SPRING and
     * `releaseHang` is its damping: together they decide whether the exit
     * eases to straight (low) or swings back through centre and asks for a
     * dab of opposite lock (high). */
    releaseSnap: 10,
    /** THE FLOOR UNDER THE WHOLE SLIDE, m/s of ground speed. Below it the
     * car does not drift at all — the wheel steers it and that is the only
     * thing the wheel does. A slow car going sideways is not the drama this
     * game is about: it is a car that will not go where it is pointed, and
     * it is what a hairpin taken at walking pace, a scrabble out of a ditch
     * and a nudge on the grid all turn into without a floor. 19.44 m/s is
     * 70 km/h on the speedo the player is reading. */
    slideFrom: 19.44,
    /** ...and how much further up the speed range the slide takes to reach
     * full authority, m/s. Not zero: a hard edge at the floor would be a
     * car that changes what it is at one speed, which is the two-state
     * response the smoothstep in `slideFactor` exists to avoid. Kept narrow
     * — five km/h — because the floor is a RULE the player is told, and a
     * wide ramp would quietly move it: 75 has to drift like 75, not like a
     * car still half-gripped. */
    slideSpan: 1.39,
    /** Slip angle at which the car READS as drifting — dust, smoke, HUD,
     * stats. Read off the ANGLE rather than the slide, because the angle is
     * what a player sees and because it moves smoothly: the slide tracks
     * steering input, which chatters, and a readout that chatters is a
     * stuttering plume and a meaningless drift count. Radians, ×the
     * surface's own `breakaway`.
     *
     * That scaling is the same one `angleSpan`, `angleBand`, `tailPeak` and
     * `spinAt` all carry, and this was the one angle in the group without
     * it — which is why tarmac could not be drifted. A paved surface's whole
     * slip vocabulary is a fraction of gravel's BY CONSTRUCTION: every
     * technique on asphalt lands at almost exactly `breakaway` times what
     * the same technique buys on gravel. Held against one absolute
     * threshold, that put the entire paved range under the angle the game
     * calls a drift — a driver could throw the car at a corner on the lever
     * and get no smoke, no counter and no dust for it, and the only route to
     * a reading was to overshoot the model far enough to spin. Sized in the
     * surface, tarmac drifts at tarmac angles: less of them than gravel, and
     * really happening.
     *
     * The BOT reads `car.drifting` to decide whether the trailed brake it is
     * carrying has done its job, so this threshold has to sit above the angle
     * a trail-braked front-driver carries through an ordinary corner — under
     * it the pedal comes off, the slide shuts, the pedal goes back down, and
     * one corner is driven as a dozen quarter-second drifts. Tried at 0.12
     * once, it cost the sim three finishers, four spins and half a minute a
     * stage in the trees. */
    enterSlip: 0.18,
    /** ...and the angle it has to settle back under before that drift is
     * over. One corner is one drift, not thirty. Scaled with the surface for
     * the same reason, so the hysteresis keeps its ratio everywhere — half
     * the entry angle, wherever the entry angle goes. */
    exitSlip: 0.09,

    /** THE LINKED DRIFT — how much a drift takes out of the tires for the
     * NEXT one, 0..1 per drift, capped at a full chain. Rubber that has just
     * spent a corner scrubbing is hot, greasy and already past its peak: the
     * second corner of a chicane is entered on tires that have less to give
     * than the first one had, and the third less again. That is the whole
     * reason a sequence of corners is harder than the same corners a
     * kilometre apart, and the model had nothing that said so — every corner
     * met a fresh car.
     *
     * Booked on the drift COUNT, not on time spent sliding, and that is
     * deliberate: a term that grew with the slide would be the feedback loop
     * this group exists to avoid (more angle → less grip → more angle), and
     * it would punish one long committed drift instead of a series of quick
     * ones. This only ever fires where the player can see the reason for it
     * — a drift ENDED and another began before the tires came back. */
    linkStep: 0.34,
    /** ...how fast the chain cools, 1/s. It has to outlive the GAP between
     * two corners or it buys nothing at all: one step is worth about three
     * seconds and a full chain about eight, so a chicane, a corner that
     * tightens and a hairpin taken in two bites all inherit what the last one
     * left, while a straight hands the driver fresh rubber back. Sized
     * straight off the probe — at 0.34/s a drift's whole step had cooled
     * before the next corner arrived, and three provocations in a row
     * measured the same as three taken minutes apart. */
    linkFade: 0.12,
    /** ...how much DEEPER a fully chained drift goes, ×`angleSpan`. The
     * second drift is bigger than the first because it started with less
     * grip, which is the thing the player is being asked to plan around. */
    linkDepth: 0.5,
    /** ...and how much EARLIER it lets go, ×`entryAt`. Greasy tires break
     * away sooner as well as further, so a linked corner does not merely go
     * deeper once provoked — it arrives at the slide on less lock. */
    linkEntry: 0.35,

    /** THE SPIN — the slip angle past which the car is simply gone, rad,
     * ×the surface's own `breakaway` like every other angle in this group.
     * Well past the deepest drift any technique asks for: this is not a big
     * drift, it is the end of one. Past it the front tires are pointed so
     * far from where the car is travelling that neither the lock nor the
     * catch reaches the road any more, so the car keeps rotating on what it
     * has and scrubs its speed away doing it.
     *
     * There has to BE one. Without it the only cost of overdoing a drift was
     * a slower corner, so the deepest possible angle was also the fastest way
     * round — and the linked drift above, which exists to make a sequence
     * escalate, would have escalated into nothing at all. This is the wall
     * the escalation runs into, and finding it is the mistake the player is
     * being given room to make. */
    spinAt: 1.05,
    /** THE FALLING SIDE OF THE TYRE — how hard the tail RUNS once the car
     * is past everything the wheel asked for, rad/s of yaw at `spinAt`.
     * Up to the top of the fade band (`angleSpan` and its `angleBand`, at
     * the lock the driver is holding) the model finds an equilibrium for
     * every lock and a held slide parks in it. Past that top the wheel has
     * nothing left, and a real rear tyre is past its peak: the force
     * holding the tail FALLS as the angle grows, so a car carried beyond
     * what the wheel asked for — a flick thrown too hard, the lever held,
     * the power kept on, a landing taken crossed up — keeps coming on its
     * own, and only counter-steer holds it. That is the whole difference
     * between a drift and a spin being something the player does.
     *
     * Against the wheel's own full counter at pace (`steerRate` through
     * `fadeSpeed`, plus `driftYaw`), sized so a catch made anywhere short
     * of `spinAt` gathers the car and none at all does not: the lever held
     * on the rear-driver at 120 km/h runs to a spin in about a second, a
     * flick held on at 100 parks a hand short of the wall (the deepest
     * drift in the game, and one lift from over it), and a full lock held
     * on the wheel alone still parks, because the wheel named that angle. */
    overYaw: 6,
    /** ...where in the wheel's fade band the run BEGINS, 0..1 of
     * `angleBand` past the angle the lock asked for. A held slide parks
     * about two thirds of the way through the band (the deepening forces
     * balance the redirect there), so this sits just above the park: what
     * the wheel finds is still an angle it holds, and the room the moves
     * take past it is where the tail starts to run. */
    overFrom: 0.7,
    /** How fast the throw that drives the run fades out of the car, 1/s
     * (`CarState.thrown`). Slower than `provokeSettle`: the weight a move
     * shifted is back inside a second, the rotation it put into the car is
     * not, and a flick thrown too hard has to be able to keep coming for
     * the couple of seconds the tail takes to go all the way round. */
    thrownSettle: 0.4,
    /** ...and how far past the slide's speed floor (`slideFrom`) the run
     * reaches full strength, ×`slideFrom`. Nothing at the floor — 70 km/h
     * on the speedo — and all of it at half again that, so a hairpin taken
     * on the lever under the floor is a pivot the driver owns, and the same
     * over-commitment at rally pace is a car that has to be caught. */
    overSpeed: 0.5,
    /** ...and the least room the run has to develop in, rad ×`breakaway`.
     * The band runs from there to `spinAt`, which at full lock is a narrow
     * gap; this keeps a lift-deepened or chained ask that reaches past the
     * wall from turning the run into a cliff. */
    overBand: 0.25,
    /** ...and the angle it has to come back under to be caught, rad — the
     * hysteresis, ×`breakaway` as well. Meaningfully under `spinAt`: a
     * threshold with no gap in it chatters a car sitting near the limit in
     * and out of a spin several times a second, which is a stutter rather
     * than a moment. */
    spinBack: 0.72,
    /** ...and the speed a spin needs on BOTH sides of it, m/s: under this a
     * car is never spun, however far round it is pointing. A car that has
     * scrubbed itself down to walking pace is not spinning any more, and a
     * car beached on a bank or scrabbling out of a ditch at an angle was
     * never spinning to begin with — both are pointing the wrong way, which
     * is something the wheel and the throttle are supposed to be able to
     * answer. Guarding only the exit left the slow ones entering on angle
     * and leaving on speed in the same step, chattering the event and the
     * counter while the scrub pinned them there and took away the steering
     * they needed to drive out. */
    spinOut: 6,
    /** How much of the wheel's own authority survives a spin, 0..1. Not
     * zero: the fronts are still rolling and still pointed somewhere, and a
     * spin the driver cannot influence at all is a cutscene. Just far too
     * little to save the corner. */
    spinSteer: 0.22,
    /** ...and how much harder a spinning car scrubs its speed off,
     * ×`grip.scrub`. Four tires dragged sideways across the road is the most
     * effective brake in the game, which is exactly why a spin costs the run
     * far more than the corner it happened in. Sized for a car going ROUND
     * (`spinCarry`), which is broadside only half the time: a spin entered
     * at 130 km/h is under 60% of it inside a second and a half, and at
     * walking pace inside three. */
    spinScrub: 6.5,
    /** THROUGH THE SPIN. A spun car is rotating on the momentum it has,
     * and nothing under it is holding the tail any more: it keeps turning
     * the way it was turning (`CarState.spinDir`) at this rate, rad/s, past
     * `spinAt`, through backwards and on, scrubbing whenever it is
     * sideways, until the speed is gone (`spinOut`) — where it stops is
     * where it stops, and often enough that is facing the way it came.
     * Scaled by the ground speed over the slide floor, and the driver's
     * counter takes only `spinSteer` of it away, which is the spin the
     * driver cannot influence enough to save. Without it a spun car
     * SCRUBBED itself back into a drift: the four dragged tyres took the
     * speed and the redirect gathered the nose, so the deepest spin in the
     * game ended thirty degrees out and still driving, and nobody ever
     * ended up reversing. */
    spinCarry: 3,
    /** ...and how much of the tyre's hold on the car's TRAVEL survives a
     * spin, 0..1 — the redirect that turns the velocity back under the nose
     * (`grip.latCeiling`), and with it the weathervane and the slip's own
     * self-straightening, which are the same tyre read as a torque. Past
     * its peak the tyre has let go: a spun car does not gather its nose
     * back over its travel at drift rates, it scrubs sideways and keeps
     * turning. At one, every spin in the game ended thirty degrees out and
     * still driving forward. */
    spinHold: 0.3,
  },
} as const;
