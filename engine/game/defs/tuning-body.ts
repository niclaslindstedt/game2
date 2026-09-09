// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the handling tuning (`tuning.ts`): THE BODY ON ITS
// SPRINGS AND IN THE AIR — the suspension's travel, rate and damping, and
// everything that happens once the wheels leave the ground: the takeoff,
// the attitude in flight, the aerodynamics, the landing, and the roll.

export const BODY_TUNING = {
  /** THE SUSPENSION — the springs the body sits on, and the only reason
   * the car reads as WEIGHING something. The wheels follow the ground
   * exactly; the body does not, and every sudden change in what the wheels
   * are doing (a dip flattening out, a landing, a bank stopping the nose)
   * is a jolt the springs have to swallow and then give back. What the
   * player sees is the body squatting, rebounding and settling over a beat
   * or two — the difference between a car and a sprite sliding on a plane.
   * The `collision` skill owns this group together with the contact model. */
  suspension: {
    /** Natural frequency of the body on its springs, Hz. Rally-soft, but
     * only so soft: the whole travel below is smaller than a wheel arch, so
     * a spring that took a second to answer would spend the whole stage on
     * its stops. Scaled per car by its mass (a heavier body on the same
     * springs rides more slowly). */
    freq: 1.9,
    /** Damping ratio, 0..1. Under 1 on purpose — the body has to OVERSHOOT
     * and come back, because a spring that just eases to rest reads as a
     * cushion rather than as weight. Around 0.45 gives one clear rebound and
     * a trace of a second; much under that and the body never stops moving,
     * which reads as a broken car rather than a heavy one. */
    damping: 0.45,
    /** Fraction of a sudden change in the wheels' vertical speed that the
     * body refuses to follow, 0..1 — the jolt that loads the spring. */
    absorb: 0.85,
    /** Ground acceleration the springs can pass to the body from the SHAPE
     * of the ground, m/s². A valley floor at pace is several g held for a
     * fifth of a second, and no spring this soft holds a body against that
     * inside a wheel arch — past this the dampers are out of authority and
     * the whole car rides the ground up, which is what a bottomed suspension
     * does. Only the smoothed ground-follow is capped here: a landing and an
     * impact are velocity steps of their own, and a bump has its own
     * ceiling below. */
    joltMax: 13,
    /** The most wheel speed one BUMP may throw into the springs, m/s — a
     * kerb, the shoulder's step off the mat, a lattice crease, the face of a
     * jump met from behind: everything the smoothed grade did not predict
     * (ground.ts, `groundJolt`). A bump is a one-step spike, so this is the
     * whole of it arriving at once, and it has to clear what a real step
     * puts in — a hand's width of kerb at rally pace is fifteen-odd m/s —
     * or the kerb is quietly clamped out of existence. What bounds the body
     * is the bump stops and `heaveMax`, not this; this only keeps a
     * degenerate reading (a lattice seam metres tall) from throwing a
     * number into the springs that the next step cannot take back.
     *
     * ...and it is the line past which a FACE MET AT PACE reaches the
     * belly (car.ts): the foot of a bank arriving under a car at speed
     * throws the wheels upward at the bank's grade times the car's speed
     * — a 45° bank at 90 km/h is twenty-five — and the springs lift the
     * body with them up to this; past it the underside has hit the face
     * and folds by the rest, charged through `landingDamage` with the
     * tolerance shot dampers narrow. A bank taken at the speed that
     * carries the car up it (`collision.climbSpeed`) is free across the
     * whole climbable band; the same bank at twice that speed is not. */
    bumpMax: 25,
    /** THE TRAVEL IS A BODYWORK MEASUREMENT, not a spring one: the arches
     * clear the tires by 0.08–0.11 m (car-styles.ts), and past that the
     * chassis is visibly sliding off its own wheels. Compression before the
     * bump stops, m... */
    travel: 0.075,
    /** ...and droop travel before the springs top out, m. Shorter than the
     * compression, as it is on the car: the wheel hanging out of the arch
     * reads wrong sooner than the arch swallowing it. */
    droop: 0.055,
    /** How much stiffer the bump stops are than the springs (multiplier on
     * the spring rate) — a slam is caught, not swallowed... */
    stopRate: 16,
    /** ...and the extra damping they add, 1/s, so the stop absorbs the slam
     * instead of firing it straight back out. It is the damping ON THE WAY
     * IN only... */
    stopDamp: 26,
    /** ...and this is the share of it still there as the spring comes back
     * OUT of the stop, which is the rebound of a landing — the body thrown
     * off its own wheels, and the moment the tires go light. Well under 1
     * so there IS a rebound; well over 0 so it is one rebound and not a
     * pogo (the chassis's own bounce, below, is the capped version of that
     * and the only one allowed to leave the ground). */
    stopRelease: 0.3,
    /** Hard limits on the body's offset, m — whatever the stops let through
     * never puts the shell through the wheels or up off them. Held at the
     * tightest arch gap on the roster, so the worst landing in the game still
     * draws as a car on its bump stops. */
    heaveMax: 0.1,
    /** Cap on spring velocity, m/s — a guard against a runaway integration,
     * not a look budget. It has to sit ABOVE the wheel speed a kerb puts in
     * (a hand's width of step at rally pace is fifteen-odd m/s for one
     * step), because a bump is a one-step spike that the next step takes
     * back out: clamp the spike and the take-back is left standing, and the
     * body ends the pair exactly where it started — a kerb the springs
     * never felt. What bounds the travel is the bump stops above, and the
     * `heaveMax` clamp under them. */
    rateMax: 20,
    /** A CAR THAT HAS JUST ARRIVED IS NOT STANDING ON ITS TIRES YET. The
     * wheels hammer on their own rubber for the better part of a second
     * after a landing, and a wheel that is intermittently in the air holds
     * intermittently — so the grip goes with it, and a landing becomes a
     * MOMENT rather than a bump in the road. `car.settle` carries that, and
     * this is what a full one costs (`tyreLoad`).
     *
     * It is deliberately NOT read off the springs, which is the model that
     * suggests itself and does not work. `car.ride` cannot tell a landing
     * from a road: R16's cross-section (the crown, the ruts, the worn
     * tracks) moves the body 3–5 cm every time the car crosses it, which is
     * MORE than the ~2 cm rebound out of a bottomed landing. Coupled to
     * grip, that took a fifth of the tires away in every steered corner on
     * an ordinary road — the drift lab's hard corners gained 3–4° of slip
     * and five of its 120 rows ran off the road, none of it anything to do
     * with a jump. The landing needs a signal that says "a landing", and
     * that is what `settle` is for.
     *
     * The number the BOTS feel, too: they plan every corner against the
     * static ceiling and cannot see a landing coming, so this is the one
     * knob here with a sim cost. At 0.45 the 72-run sweep threw two runs
     * off the road; at 0.38, none, for the same drift time. */
    loadSkitter: 0.38,
    /** How hard the wheels have to arrive for the skitter to be full, m/s
     * of descent, and how fast it settles out, 1/s. Set from the SMALL end
     * on purpose: R6's shallowest lip (0.9 m over 22 m) comes down at about
     * 5–6 m/s, and that is the landing this whole model exists for, so the
     * ramp is sized to have most of the skitter in it by then. Everything
     * bigger is already at the cap, which is why lowering this costs the
     * bots nothing. */
    settleSlam: 5.5,
    settleFade: 2.6,
    /** The lightest the tires ever get, 0..1. A floor, because a car that
     * can be made unpointable by one landing is a car nobody can drive out
     * of a jump — the slide has to be recoverable. */
    loadFloor: 0.5,
    /** WHAT THE GROUND ITSELF IS DOING TO THE WEIGHT ON THE TIRES. A tire
     * is worth the load on it, and the load on it is not the car's weight
     * wherever the ground is CURVED under the direction of travel: over a
     * brow, or where a bank the car has ridden up straightens out again,
     * part of the weight goes into following the ground down and the tires
     * keep the rest. Through a compression — a dip's floor, the inside of a
     * banked corner — it is the other way and the car is pressed on.
     *
     * It is the same number the takeoff reads (`pace²·curvature` against
     * `g`), and that is the point: going light and flying are one continuum,
     * not two rules. The car crests, the grip bleeds off, the slide comes
     * easier and the nose gets harder to hold — and if there is enough speed
     * in it the body comes up off its wheels (`hold`, `loft`) and leaves
     * the ground (`leave`). Nothing here is a separate "you are about to
     * jump" state.
     *
     * `weightGain` is how much of that pull reaches the CONTACT PATCH. Not
     * all of it does: the springs and the unsprung mass between the chassis
     * and the rubber take their share of a transient, which is most of what
     * a suspension is for. It is also the knob with a sim cost, for the same
     * reason `loadSkitter` is — the bots plan every corner against the
     * static ceiling and cannot see a brow coming, so what this really sets
     * is how much of an ordinary undulating road they have to drive around.
     * At 1 the 24-run sweep doubled its respawns and threw two clean runs
     * off the road; the FLOOR made no difference to that at all, because
     * what costs them is the ±10% of an ordinary road, not the rare deep
     * unloading. At 0.32 the sweep is back to its own pace, drift time and
     * respawn count, one spin up, and the road the bots plan against is
     * roughly the road they get.
     *
     * It scales the grip and NOTHING else: the takeoff reads the pull
     * itself, so where a shape throws the car is a fact about the shape and
     * this cannot move it. What it sets is how light the car goes on the way
     * there — 35% of the tires by the launch threshold, about a sixth of
     * them crossing a 10 m gravel road at 110 km/h.
     *
     * `weightRate` is how fast the tires answer, 1/s — the load takes a beat
     * to arrive, and the lag is also what keeps a seam between two ground
     * models (road corridor to open terrain) from being a step in the grip.
     * The two bounds are the usual reason: a tire with nothing on it is a
     * car nobody can drive, and a compression that doubled the grip would
     * make a dip the fastest place on the stage. */
    weightGain: 0.32,
    weightFloor: 0.6,
    weightCeil: 1.1,
    weightRate: 12,
    /** Nose attitude the springs take per m/s² of longitudinal
     * acceleration, rad — the dive under brakes and the squat on the
     * power. A couple of degrees at full braking: enough to read at the
     * chase cam, not enough to look like a boat. */
    pitchPerAccel: 0.004,
    /** How fast that load pitch answers, 1/s. */
    pitchRate: 7,
    /** Body heave a solid contact throws into the springs, m/s per m/s of
     * closing speed — the car rocks on its springs after a hit... */
    impactHeave: 0.09,
    /** ...and the dive it throws in, rad per m/s of closing speed, signed
     * by where on the body the hit landed (a nose hit pitches down, a
     * rear-ender lifts the nose). */
    impactPitch: 0.004,
    /** Descent the springs can no longer swallow, m/s: past this the whole
     * CHASSIS comes back off the ground instead... */
    bounceSpeed: 9,
    /** ...with this fraction of the excess as rebound speed... */
    bounceKeep: 0.24,
    /** ...capped here, m/s, so a slam is a bounce and never a second jump. */
    bounceMax: 4.5,
  },

  air: {
    /** Gravity, m/s². */
    gravity: 9.8 * 1.6, // arcade gravity: floatier hangs read as slow-motion
    /** Below this speed the car stays glued to the road however fast the
     * ground falls away — only pace launches you off a crest, m/s. */
    crestSpeed: 12,
    /** Baseline the road's vertical curvature is measured over, m. Wider
     * than the generator's bump layer, so a brow is judged by the shape of
     * the HILL and not by the road's texture — a short baseline turns every
     * ripple at pace into a one-frame hop. */
    crestSpan: 12,
    /** ...and the baseline its CROSS-SECTION is read over, as a share of the
     * road's own HALF-WIDTH. The two directions cannot share a baseline:
     * `crestSpan` laid across an 8 m road reaches into the country on both
     * sides and reads the whole shelf, and the road's own width read along
     * the stage turns every ripple into a hop.
     *
     * A share rather than a distance because the road is what sets the
     * scale on this axis: R16's crown IS a half-width parabola and the break
     * at the shoulder is a half-width out, while everything that has to be
     * smoothed away sits well inside that — the wheel tracks (`rut.maxAt`
     * caps them at 0.42 of it), the berm, the chamfer off a paved edge.
     * Those are things a wheel rides over, not shapes the car goes over, and
     * a fixed 2.5 m baseline straddled a rut trough and read it as a
     * compression: grip went UP in the wheel tracks, on every road, which is
     * the transverse version of exactly what `crestSpan` is wide to avoid. */
    crossSpan: 0.8,
    /** HOW HARD THE GROUND CAN PULL THE CAR DOWN AFTER ITSELF, as a share of
     * `gravity`. Over a brow the ground asks for `pace²·curvature` of
     * downward acceleration to be followed; the car's body has only its
     * weight to answer with, and past this share of it the body stops
     * following — it carries the vertical speed it had into the shape and
     * starts to LIFT off the wheels (`car.loft`), which is what the springs
     * reaching for the ground over a crest is.
     *
     * Under 1 on purpose. `gravity` is arcade-heavy so that a FLIGHT comes
     * down quickly, but a takeoff judged against 1.6 g would keep the car
     * on every brow a real one leaves: a 30° climb rounding off over forty
     * metres at 100 km/h asks for 11 m/s², which is more than the world
     * the player knows can hold and less than this one. So the ground is
     * allowed to hold the car to about a real g, and the flight's own
     * gravity takes over once it has let go. A brow between the two is a
     * HOP — the body lifts, the arcade gravity has it back before it has
     * gone far, and the car bobs over the crest instead of driving flat
     * across it (`launch`'s `hop`). */
    hold: 0.65,
    /** HOW FAR THE WHEELS REACH FOR GROUND THAT IS FALLING AWAY before the
     * tyres carry nothing, m — the droop, the tyres unloading and the body
     * clearing the arches, together. Under this the car is grounded and
     * going LIGHT (`tyreLoad` bleeds toward `weightFloor` as the gap
     * opens) with the body drawn lifted by it. It is also how far below
     * where a wheel should be its ground may fall before the wheel is
     * hanging and says nothing about the body (ground.ts, `corners`). */
    loft: 0.15,
    /** ...and how far the body has to come off its wheels before the car is
     * FLYING, m. Between `loft` and this the car is SKIPPING: the wheels are
     * off the ground for a few tenths over a bump, the crown of a road
     * crossed at pace, a lattice crease — light on its tyres, drawn up off
     * them, still steered and still driven. A car that skipped over a bump
     * mid-drift and lost its whole lateral grip for those tenths came
     * down thirty degrees further round than it went up, and spun; a real
     * car's wheels touch intermittently there, which is what going light
     * is. Past this the ground has genuinely gone — a brow at pace, a
     * steepening descent, an edge — and the body leaves with whatever
     * vertical speed it has carried. R16's wheel tracks and the bump layer
     * open a gap to `loft` at rally pace and no further. */
    leave: 0.45,
    /** How long the foot's vertical speed is read over, s — what the wheels
     * have BEEN doing, which is the slowest fall the body may arrive at a
     * step with (car.ts). A few steps: long enough that one step's blip in
     * the four-wheel mean — a rut crossed sideways, a kerb under one
     * wheel — is not a speed the body has to answer, short enough that a
     * brow's turn-down still reaches the body a step or two after the
     * wheels. */
    footLag: 0.04,
    /** The upward speed under which a launch is a HOP rather than a jump,
     * m/s — the body's own, as the wheels run out of reach. Under it the
     * flight is a skip the arcade gravity ends in a few tenths: it bobs
     * the car and books nothing, and the bot drives through it. A rise
     * this size is half a metre of air under the flight's gravity — a
     * lattice crease or a soft kink at pace, and well under the smallest
     * lip R6 builds. */
    hopRate: 4,
    /** ...and how long a hop (or a bounce) may last before it has become a
     * flight, s. Neither ever lasts this long on its own — a hop's lift is
     * under `hopRate` and the chassis bounce is capped at
     * `suspension.bounceMax`, and both are back down inside half a second
     * — so the only way past it is the ground leaving: a lip, an edge, a
     * brow that steepens under the car. A DURATION rather than a height,
     * because a body propped up on a face by its nose and backing off it
     * drops a metre and a half without ever having flown. */
    hopTime: 0.6,
    /** Steering yaw authority while airborne, rad/s — barely any. */
    yawAuthority: 0.35,
    /** Random turbulence torque while airborne, rad/s² — out of control. */
    turbulence: 1.4,
    /** THE AIR A CAR OFF THE GROUND IS PUSHING THROUGH, as CdA — drag
     * coefficient times the area presented, m², one per FACE of the body.
     * The same form `collision.aero` states its holes in, and for the same
     * reason: it is the only form in which a number can be checked against
     * anything real.
     *
     * Stated per face because a falling car is not a shape with ONE drag.
     * The air meets whichever side of the box is turned into it, and the
     * three sides differ by a factor of five — which is the whole of why a
     * car that dives off a cliff nose-first goes on gathering speed and one
     * that goes off it flat stops gathering at all. `game/aero.ts` blends
     * them by the direction the air is actually coming from.
     *
     * The Cd here is a BLUFF one, not the 0.35 a car is quoted at. That
     * figure is a shape sitting on a road with the flow attached over it;
     * a car in free air, at an attitude nobody drew it for, has the flow
     * off the back of it everywhere, and the coefficient is what a box of
     * that proportion gets. What the pair buy, against a 1200 kg car under
     * this world's gravity: about 515 km/h nose-on, 275 km/h on a flank and
     * 225 km/h flat — and 234 km/h in the attitude a long plunge actually
     * settles at, `attitude.pitchMax` of nose-down under a near-vertical
     * drop. That last one is the number the game has: a fall off anything
     * tall tops out half again past what the road will give, and takes a
     * couple of hundred metres to do it.
     *
     * Checked against the world with the real 9.8: the flat figure becomes
     * 180 km/h, which is what a car dropped from a helicopter does. */
    aero: {
      /** Nose- or tail-on, m² — the STREAMLINED case, and the one an
       * ordinary jump flies in: the nose follows its arc, so the air stays
       * end-on the whole way over and the flight carries. Cd ≈ 0.45 over the
       * 1.9 m² of frontal area `collision.aero` quotes — a little above the
       * 0.35 a car is quoted at on the road, because out of ground effect
       * the air gets under the floor as well as over the roof.
       *
       * A lip taken at 170 km/h is the fastest anything flies end-on, and
       * this costs it under a metre per second per second there. Anything
       * much blunter and the biggest jumps on the stage stop throwing the
       * car: `tests/jump_test.ts` holds the landing to nine tenths of the
       * speed the lip was left at. */
      nose: 0.85,
      /** Floor- or roof-on, m² — Cd ≈ 1.2, a flat plate, over the box's
       * own plan area less the corners it does not fill. The dirty case,
       * and the one a car goes over a cliff in. */
      plan: 7.8,
      /** Flank-on, m² — Cd ≈ 1.1 over the side of the box. Only a car that
       * has gone over ever falls this way. */
      side: 5.3,

      /** WHAT A REAR WING DOES WITH THE FLOW IT IS IN. Both are read
       * against the blade's own plan area (`CarSpec.aero.wing`), and the
       * pair are why one rule covers a jump and a fall at once — a wing is
       * an aerofoil to the air running ALONG the car and a flat plate to
       * the air coming UP through it.
       *
       * `down` is the downforce it makes end-on: it pushes the TAIL down,
       * and a force at the tail is a nose-up moment. That is the effect a
       * wing is bolted on for and the one that shows over a jump.
       *
       * `plate` is the same blade in a fall, where the car is travelling
       * through its own floor and the flow comes at the blade from below.
       * Now it is pushed UP, at the same lever, and the moment is the other
       * way: the wing goes to the BACK of the fall and the nose leads it
       * down, which is a shuttlecock and is why an arrow has feathers. */
      wingDown: 0.9,
      wingPlate: 1.2,

      /** THE ARCADE DIAL ON ALL OF IT, as a multiplier on the drag — 1 is
       * the air the world actually has, and everything above is quoted at
       * it. This is the knob to reach for when a fall wants to be more fun
       * rather than more correct, and the one to leave alone when the
       * question is whether the model is right.
       *
       * Terminal velocity goes as `1/sqrt(bite)`, so the arithmetic is
       * easy to hold: half the bite is a fifth again more speed at the
       * bottom of a cliff and a fall that takes half as long to feel
       * frightening; double it and the air catches the car early and the
       * drop reads as heavy rather than fast. It scales the WHOLE area, so
       * it moves the jumps with it — anything under about 0.8 starts to
       * hand back the speed a big lip is meant to cost. */
      bite: 1,

      /** ...AND HOW FAR THAT MOMENT ACTUALLY POINTS THE NOSE, rad of pitch
       * per unit of (the moment / the moment the car's own weight makes at
       * half its length). The trim a body would settle at, in other words,
       * written as a share rather than solved for — a flight has no
       * restoring aerodynamic stiffness in this model to solve it against,
       * and a pitch rate of its own belongs to a car that is going OVER
       * (`roll.ts`), not to one flying an arc.
       *
       * What 2 buys, across the roster: over a jump taken at 110 km/h the
       * winged car lifts its nose 2.6° and at 160 km/h 5.6°, where the two
       * carrying only a lip manage a third of a degree and two thirds. In a
       * long fall it works the other way and the order reverses — the blade
       * holds the winged car flattest, at 20° of nose-down and 207 km/h,
       * while the slippery four-door with nothing on its boot noses fully
       * over and reaches 255.
       *
       * The trim on its own stays inside `attitude.pitchMax` on every car
       * at every speed (`tests/aero_test.ts`), deliberately: a term that
       * pegged there would stop telling the cars apart. What can still peg
       * is the trim plus the ARC the nose is already following, and that is
       * correct — a car falling nearly straight down is asking for an
       * attitude no car in this game is drawn at. */
      trim: 2,
    },
    /** A car that leaves the ground crossed up trips over its outside
     * wheels. The roll it takes into the air is its sideways speed times
     * this... */
    rollFromSlide: 0.055,
    /** ...plus the rotation already in the body times this, rad/s per rad/s.
     * Straight and level flies flat; properly sideways goes a long way over,
     * and the unluckiest launches go all the way round. */
    rollFromYaw: 0.5,
    /** The same trip, about the other axis: the tires that were holding a
     * slide let go all at once, so the car keeps turning the way the slide
     * was already turning it. Rad/s of yaw per m/s of sideways speed — a
     * car that leaves a ledge sideways SPINS, which is the whole difference
     * between a jump and going over the edge in a drift. */
    yawFromSlide: 0.05,
    /** ...and the PITCH's, rad/s². Only a body that is going over ever has
     * a pitch rate of its own to be knocked about (`CarState.pitchRate`);
     * an ordinary flight's nose follows its arc and this never touches it. */
    pitchTurbulence: 1.1,
    /** Random roll torque in flight, rad/s² — the same seeded turbulence
     * that unsettles the nose. */
    rollTurbulence: 0.5,
    /** Roll damping in the air, 1/s — the body keeps most of what it took. */
    rollDamp: 0.25,
    /** How fast the ground unwinds body roll, 1/s. It settles toward the
     * NEAREST upright, so a car already most of the way over finishes the
     * roll rather than rewinding it. */
    rollRecover: 5,
    /** THE LINE BETWEEN FOUR WHEELS AND TWO, rad of lean off the camber.
     * Inside it the springs carry the body and the recovery above settles
     * it onto the ground's own angle; past it the car is a rigid body
     * pivoting on its outer contact line and `leanTorque` is what turns it.
     * `CarState.planted` is that same line, written down. */
    leanFree: 0.45,
    /** ...and how fast a roll RATE the ground was handed dies on the
     * springs, 1/s — a landing that tripped the car short of going over
     * lurches it this far before the recovery above has it back. Faster
     * than the recovery, so the lurch is a beat and not a wobble. */
    leanDamp: 6,
    /** Roll past this at touchdown means the car came down on its side —
     * a sloppy landing however straight the nose was, rad. */
    rollLandLimit: 0.7,
    /** Ground falling away by more than this in one step, at pace, is an
     * edge — a cliff lip, a cut bank — and throws the car instead of
     * gluing it down the face, m. Comfortably more than the shelf drop at
     * the road boundary, so leaving the verge is a curb, not a takeoff. */
    edgeDrop: 0.8,
    /** How fast the body has to be leaving the ground — its own vertical
     * speed over the wheels' — for the takeoff to be SUDDEN, m/s: the
     * tyres that were holding a slide a step ago letting go all at once,
     * which is the trip a crossed-up car takes into the air off a ledge or
     * a lip (`rollFromSlide`, `yawFromSlide`). A body that lifted off its
     * wheels over a brow left tyres that had already unloaded across the
     * whole of the loft, and they let go of nothing. Twenty-odd m/s is a
     * 2 m lip at rally pace; a rounded brow parts the two by a few. */
    edgeSpeed: 8,
    /** Share of the wheels' climbing speed the car LEAVES a jump lip with,
     * 0..1 — or the smoothed grade's, whichever is more. The wheels are on
     * the steepest last metre of the ramp when the ground drops away; the
     * body, a wheelbase long and still pitching up, is carrying the ramp's
     * average, which on R6's eased-in ramp is about half the end grade. A
     * flight carrying the wheels' whole speed off the landing face of a
     * 2 m lip met from behind at rally pace would be a twenty-metre moon
     * shot. Only a flagged lip launches this way; every other shape throws
     * the body at the speed it has actually got. */
    launchKeep: 0.5,
    /** Landing slip beyond this scrubs speed and wobbles the car, rad. */
    cleanSlipLimit: 0.24,
    /** Speed kept on a clean landing vs a sloppy one (fractions). */
    cleanKeep: 1.0,
    sloppyKeep: 0.78,
    /** Yaw wobble injected by a sloppy landing, rad/s. */
    sloppyWobble: 1.6,

    /** THE TRIP ON LANDING. A car that comes down crossed up is a car whose
     * tyres bite while the body is still going sideways: the bottom of it
     * stops and the top of it does not, and it goes over its outside
     * wheels. This is the sideways speed at touchdown that is spent
     * without going over, m/s — a landing a little off line skips and
     * scrubs and stays on its wheels... */
    tripSlide: 9,
    /** ...and past it, the roll rate every further m/s of sideways speed
     * puts into the body, rad/s, FOR A TYRE BITING AT ITS REFERENCE. What
     * a tyre actually bites with is the surface under it and what the
     * driver has done with the car (`tripBite`, flight.ts), and both are
     * multipliers on this — so the number here is the trip a car takes
     * settling onto gravel with nothing asked of the wheel or the pedals
     * and its springs barely troubled, which is the softest version of it
     * there is. A car that slams down gets half again as much.
     *
     * Whether that is enough to go over is not a threshold anywhere — it
     * is the body's inertia against the lift up to its own sill corner —
     * but the trip a hard landing gets away with works out at around
     * twelve m/s across the car: 26° of yaw at 100 km/h, 20° at 130, 15°
     * at 170. The faster the jump, the straighter it has to be landed,
     * which is the whole reason a flick before a lip is a mistake. Under
     * that the car lurches on its springs and the ground takes it back. */
    tripRoll: 0.6,
    tripPitch: 0.16,
    /** ...capped here, rad/s: a body does not go over faster than about a
     * turn and a half a second whatever it was doing, because past that
     * the sideways speed is spent folding the car rather than turning it
     * — which is what the flank's crush already books. Without a cap a
     * cliff-face deflection landed at 25 m/s across the car came down at
     * thirteen rad/s and took three wheels off in one contact. */
    tripMax: 9,
    /** How much of the sideways speed the trip leaves in the car, 0..1 —
     * the tyres dug in and the rest went into the roll. Scaled by the same
     * bite the roll is: rubber that is not gripping is not scrubbing
     * sideways speed off either, which is the price of every save below. */
    tripKeep: 0.35,
    /** WHAT THE DRIVER CAN DO ABOUT IT. The trip is the tyres refusing to
     * go sideways, and how hard they refuse is not fixed — it is the load
     * on them and the direction they are pointed, both of which are
     * decided in the air, before the wheels are anywhere near the ground.
     * That is the whole of what makes a crossed-up landing a moment of
     * SKILL rather than a dice roll: the hands and the pedals are already
     * committed when the tyres bite, and nothing after the bite can undo
     * them.
     *
     * How far a full lock points the front wheels off straight ahead, rad
     * — a rally car's road-wheel lock. The front tyres' own slip is the
     * body's slip angle less this much of it, and their share of the
     * moment goes with the sine of that: aim them along the way the car is
     * actually travelling and the front axle stops tripping the car
     * altogether. */
    tripLock: 0.55,
    /** ...and how much of the bite is the FRONT axle's, 0..1 — the share
     * the hands can point out of it. Half: the rear pair are pointed
     * wherever the body is and no counter-steer reaches them, so even a
     * perfectly caught landing still trips on half the car. */
    tripFront: 0.5,
    /** The most a lock turned the WRONG way can multiply the front axle's
     * bite by. A tyre's lateral force peaks well short of a right angle
     * and the sine alone would run to nearly double at full lock into the
     * slide; this is the plateau. */
    tripMiss: 1.5,
    /** How much of the tyres' one budget a fully applied pedal spends
     * LONGITUDINALLY, 0..1 — what is left for the bite is the other side
     * of the friction circle, `sqrt(1 - this²)`. At 0.85 a full brake or a
     * full boot roughly halves the trip: the correct rally answer to a
     * landing you know is crossed up, and one that costs you the sideways
     * speed you would rather have scrubbed off. */
    tripPedal: 0.85,
    /** ...and how much harder a tyre bites for arriving HARD, at the slam
     * the suspension calls a full one (`suspension.settleSlam`). The
     * moment is the lateral force times the weight's height and the force
     * is what the load will pay for, so a car that slams down loads its
     * tyres far past its own weight for the tenth of a second the springs
     * are swallowing the arrival. Landing FLAT and soft is the other half
     * of the save. */
    tripLoad: 0.6,
    /** THE ROLL. What the car does once the trip has actually put it past
     * its outside wheels — and, deliberately, NOT how far it goes. There
     * is no turn count here and no rate at which a roll is declared over:
     * `game/roll.ts` turns the body over the corners of the box above on
     * the roll it is carrying, and it goes over exactly as long as it can
     * lift its own centre to the next corner. Two or three turns is what
     * these numbers usually buy; a big arrival buys more, a small one buys
     * a lurch and nothing else, and whichever face the energy runs out on
     * is the face the car is left lying on. */
    roll: {
      /** HOW THE CAR'S MASS IS SPREAD, as the measured relation between what
       * a car WEIGHS and what it therefore resists turning with. Not five
       * numbers any more, and not one set shared by every car: the roster's
       * three differ by 27% in mass and their mass distributions differ with
       * them.
       *
       * These are the NHTSA Light Vehicle Inertial Parameter Database's own
       * regressions, for CARS specifically — several hundred vehicles put on
       * a Vehicle Inertia Measurement Facility and swung. Mass in kg, moment
       * in kg m^2:
       *
       *   roll   Ixx = 0.497 m - 181.4    (R^2 0.86)
       *   pitch  Iyy = 3.079 m - 1728.8   (R^2 0.91)
       *   yaw    Izz = 3.176 m - 1754.2   (R^2 0.92)
       *
       * Divided by the mass they become the radii of gyration squared, m^2,
       * which is what this module wants — every term in `roll.ts` is
       * mass-normalised and the mass itself divides straight out, so what
       * survives is the SPREAD and nothing else. That is why a heavy car
       * does not roll more slowly for being heavy; it rolls more slowly
       * because its weight is further from its axes, and the intercept in
       * each line above is exactly that effect.
       *
       * For this roster (1020-1300 kg) they come out at roll 0.32-0.36,
       * pitch 1.38-1.75 and yaw 1.46-1.83 m^2 — which is where the five
       * hand-tuned constants they replace already sat (0.4 / 1.4 / 1.6),
       * so the model was right about the shape of a car and is now right
       * about the SPREAD of one too. */
      spread: {
        rollSlope: 0.497,
        rollBase: -181.4,
        pitchSlope: 3.079,
        pitchBase: -1728.8,
        yawSlope: 3.176,
        yawBase: -1754.2,
        /** ...AND THE CAGE, which none of the database's cars carried. A
         * rally cage is forty-odd kilograms of tube welded out at the
         * sills, up the pillars and across the roof: mass at the very
         * edge of the body, which is where it counts most against an
         * axis. Its own radii of gyration, m, about each of the car's
         * axes — roughly the half-width and the half-height for the roll,
         * the cabin's half-length for the other two — at this mass, added
         * to each spread per kilogram of the car it is in. Three to four
         * per cent on every axis for this roster, all of it resisting the
         * turn. The cage's own share of the weight's HEIGHT is the car's
         * `centreHeight` to state. */
        cage: { mass: 45, roll: 0.62, pitch: 1.05, yaw: 1.05 },
      },
      /** ...and how much of that exchange a SPRUNG corner gives back
       * instead of taking, 0..1. A shell corner arriving at the ground is
       * sheet metal and pays the swap in full; a WHEEL arriving is what
       * the springs are there to swallow, and they hand the blow back to
       * the body rather than dissipating it. High, because they are good
       * at it — and because near zero a car cannot be rolled at all: the
       * first thing any trip does is lever the body up through level, and
       * charging that as a flat-on-both-wheels impact takes nine tenths of
       * the trip before the car has even come off its wheels. */
      sprung: 0.88,
      /** THE FRICTION A BODY OFF ITS WHEELS HAS, as a Coulomb coefficient
       * under WHATEVER OF IT IS ON THE GROUND — one per face, blended
       * across the quarter turns between them.
       *
       * A body on the ground has one contact patch and one budget,
       * pointing against the way it is travelling, and `roll.ts` spends it
       * on both jobs at once: the share ACROSS the car works on the lever
       * of its own centre height and turns it over, the share ALONG it
       * simply retards it. That is the whole reason a roll is a roll
       * rather than one flip — a car with fifteen metres a second still
       * across it is a car the ground keeps turning over — and it is also
       * why one STOPS: the roll ends when the travel does, not when a
       * counter runs out.
       *
       * It is also the ONLY thing that slows a car that is over, so what
       * it is worth on each face is what decides how far a rollover goes
       * and how long a car lies grinding at the end of one. Accident
       * reconstruction measures those as drag factors, and they are not
       * one number:
       *
       * - `wheels` is RUBBER, being dragged sideways. It is the highest of
       *   the three, and it is what bites at the start of a trip — the
       *   tyre that catches while the body keeps going.
       * - `flank` is a door skin and a sill on gravel: smooth, and the
       *   longest slide of the three.
       * - `roof` is glass, gutters, the pillars and whatever aerial is
       *   still on it, all of which dig in. A car on its roof stops
       *   noticeably faster than one on its side, and that difference is
       *   the loudest few seconds of most accidents.
       *
       * The whole group used to be one number at a tyre's 0.85, which put
       * a rollover over a g and had a car going over at 165 km/h walking
       * two seconds later — with a flat 2.6/s exponential scrub beside it
       * that took nine tenths of the speed out of every second of contact.
       * Between them, the read that made a rollover look like a car
       * hitting glue and then spinning on the spot.
       *
       * The three SHELL faces were each a couple of hundredths higher while
       * the ledger was leaking a fifth of every fast roll: a body handed
       * free energy at each hand-over needs more friction to come to rest in
       * a plausible distance, and the numbers had quietly absorbed that.
       * With the hand-overs settled they read a crash as harder than any
       * that has been measured — a bare roll at 0.64 against a real one's
       * 0.45 — so they are re-read here against the reconstruction range
       * they come from (0.4-0.6 for a body sliding on its shell over soil
       * and gravel) rather than defended. `wheels` does not move: it is a
       * tyre being dragged sideways, it is what bites at the start of a
       * trip, and nothing about the ledger was ever an argument about
       * rubber. */
      faceGrip: { wheels: 0.85, flank: 0.42, end: 0.5, roof: 0.58 },
      /** How much of an arrival the shell passes on to the body rather than
       * folding is not a number here any more: it is the FACE that arrived,
       * the mass behind it and how much of that face is already folded —
       * `collision.structure.fold`, read through `structure.ts`. A
       * rollover is not a stop, and a car is not one material. */
      /** How fast the roll bleeds into the ground it is grinding round on,
       * 1/s. Panels are not tyres. */
      drag: 0.9,
      /** ...and of its yaw, 1/s. Low, and deliberately: a car does not
       * trip from a straight line. It is already sliding and already
       * ROTATING when its centre of gravity goes past its leading tyres,
       * and that yaw is still in it all the way over — a rolled car ends
       * up pointing wherever the roll left it, which is very rarely where
       * it was going. Damping it out is what turned a roll into a tidy
       * barrel roll down the road. */
      yawDamp: 0.55,

      /** NO FACE ARRIVES FLAT, and that is the corkscrew — one of the
       * standard rollover tests is named for it, and it is what makes two
       * rolls off the same lip end up facing different ways.
       *
       * It used to be four knobs seeding it: a pitch kick, a yaw kick, a
       * ceiling on the yaw and an arrival speed to scale them by. There is
       * nothing left to seed. The hull is a box rather than a cross-section
       * now, so it knows perfectly well that the corner reaching the ground
       * reaches it before the rest of that face does, and the ground's own
       * friction — one budget under one patch, on the arm that patch has
       * from the weight — throws the body about all three of its axes every
       * time one arrives. A crash's spin answers to how fast it is going,
       * is checked by the ground, and changes hand with the slide, none of
       * which a seeded kick could do.
       *
       * How fast a pitch rate dies while the body is grinding round on
       * the ground, 1/s — faster than the roll's own, because the length
       * of the car is lying on the ground and the roll's axis is not. */
      pitchDamp: 2.4,
      /** HOW FAR FROM PARALLEL a face of the box and the ground under it
       * may be and still be the same contact, rad.
       *
       * A face is METRES long, so asking this as a height — is every corner
       * of it within a millimetre of the lowest — asks a four-metre roof to
       * be within a hundredth of a degree of the ground before it counts as
       * being on it, which over five crash scenarios was true in one step
       * out of nineteen hundred. The body was up on a single point for the
       * whole of every accident: nothing answered the friction's moment
       * (`spanAcross`/`spanAlong` were both zero), and the roll could never
       * report that it had come to lie on anything, so a car that stopped
       * off its wheels was never handed back and the crew were never taken
       * to the board. Asked as an ANGLE it is scale-free and says what it
       * means — a car on its roof a couple of degrees off is lying on its
       * roof, and the load shifts across that roof as it rocks the last of
       * it down. */
      settled: 0.12,
      /** ...AND HOW FAR A CONTACT HAS TO REACH IN BOTH DIRECTIONS to be a
       * FACE rather than an EDGE, m.
       *
       * Counting the points near the plane is not enough on its own. A car
       * up on one side has FOUR of them — two wheels and the two sill
       * corners above them — and they lie in a LINE two metres long and a
       * hand's breadth wide. Asked as "four points are down" that is a car
       * lying flat on a face, and the consequences are both ways round: the
       * settle hands back a car balanced on its edge as one that has come
       * to rest, and the run then books it overturned and takes the crew to
       * the last board for an attitude the roll had just called upright.
       *
       * The smallest real face on the box is an END — the body's width one
       * way and the depth from floor to roof the other, a little over half
       * a metre. An edge is a fifth of that, so this sits between them and
       * is not near either. */
      faceSpan: 0.3,
      rest: 0.7,
      /** ...and, for a body that came to rest on a face that is NOT its
       * wheels, when it has stopped TRAVELLING as well, m/s.
       *
       * A car on its roof has no tyres on the ground; it has a roof, and
       * the ground goes on taking the travel out of it at the same
       * friction that was turning it over a moment earlier. So the slide
       * belongs to the roll and the roll keeps the car until it is over —
       * which for 70 km/h onto a roof is three seconds and thirty metres
       * of grinding, and the loudest, longest thing in the whole accident.
       *
       * Without it a roll handed the car back the instant the ROTATION
       * stopped, whatever it was still carrying, and `stepOverturned`
       * returns before anything moves: the car settled onto its roof at
       * 63 km/h and became a statue on the spot for `lieFor`, with the
       * speed still sitting in its velocity, unspent. A car that comes
       * down on its WHEELS still going is the opposite case and is handed
       * straight back — that one is a car that drives on. */
      restSpeed: 1.2,
      /** How close the NEXT corner of the hull has to be to the ground for
       * a contact to reach the rotation, m. A body lying flat on a face
       * has it at zero and pays `spin`'s exchange in full; a body balanced
       * on one corner with the next one this far up pays none of it,
       * because the ground has arrived at the corner it was already
       * turning about. It is the difference between a roll tapping its way
       * round and a roll stopping dead on the face it puts down. */
      reach: 0.3,
      /** Roll rate under which a face arriving at the ground is a settle
       * rather than a slam, rad/s: nothing folds and nothing is heard. */
      slamAt: 1.5,
      /** How hard a contact HITS, m/s of landing slam per rad/s of the roll
       * the ground took out of the body — the arriving corner meeting the
       * ground, stated on the LANDING's scale so `landingDamage` can price
       * it (it reads the attitude to pick which face folds).
       *
       * The arm the corner actually swings on, a little over a metre for
       * this hull, and no more: what a shell arrival costs is priced by
       * `shellFree` below rather than by inflating the speed it arrives at.
       * The rest of the model keeps this honest — a grinding contact takes
       * no roll and so pays nothing, and a wheel arriving is swallowed by
       * its spring. */
      slam: 1.7,
      /** What a SHELL arrival gets for free, m/s. The landing's own
       * tolerance (`collision.hardLandSpeed`) is a SPRUNG car's: 10 m/s of
       * descent a suspension travels through without marking the car. A
       * flank or a roof has nothing under it, so almost nothing is free —
       * a body dropped a hand's breadth onto a door skin dents the door.
       *
       * This is the number that makes a roll read as a roll. Charging shell
       * arrivals a sprung car's tolerance meant a car could turn over three
       * times and pay for two of the dozen contacts it made, and walk away
       * with a folded flank and a mirror gone. */
      shellFree: 4.6,
      /** How long a car lies there once the roll has stopped with it OFF
       * ITS WHEELS, s, before the crew are sent back to the last split
       * board. A car on its roof is not a car anybody is driving away, so
       * there is nothing to wait for beyond reading what happened. */
      lieFor: 1.4,
      /** WHAT THE DRIVER STILL HAS while the car is going over.
       *
       * A rally driver does not take their hands off the wheel because the
       * car has lifted a pair of wheels, and there is no reason for the
       * model to either. The pedals and the steering reach the world
       * through the tyres and through nothing else, so what the driver has
       * left is whatever of the contact patch is still rubber
       * (`tyreShare`): all of it on the wheels, about 0.7 balanced over at
       * 45°, and nothing at all from the flank round to the roof. Nobody
       * writes a rule that says "the crash is now unrecoverable" — the
       * geometry says it.
       *
       * Each of the three is a share of THE SAME Coulomb budget the ground
       * is already spending, and the three are clamped to a friction circle
       * before any of it is spent. A tyre has one budget whether it is
       * being asked to stop the car, turn it or drive it, and writing them
       * as three independent forces is how a contact patch ends up making
       * three times the grip it has. */
      driver: {
        /** THE THROTTLE, as a share of that budget — the only term in the
         * whole crash that may ADD speed, because it is the only one with
         * an engine behind it. Under half: a driven pair scrabbling at an
         * attitude nobody chose is not a standing start. */
        power: 0.45,
        /** THE BRAKE, and the lever, which while the car is over are the
         * same ask. It may only ever take travel away — a pedal cannot push
         * a car backwards — so it is free to have the whole patch.
         *
         * What that is worth is not a harder stop, and it should not be
         * tuned as though it were: a body already sliding has the ground
         * dragging at the whole of the patch's budget in the direction it is
         * going, and no pedal can ask for more friction than the patch has.
         * It is not a shorter accident either — swept over ninety trips the
         * brake moves a roll's LENGTH by a hundredth of a second, and it
         * cannot do otherwise for the same reason. (It was written down here
         * as four tenths off the roll, measured at one staging; a rollover is
         * chaotic enough that any single staging shows a pedal doing
         * something, half the time the opposite of what it does.)
         *
         * What it buys is where the car is POINTING when it stops. The same
         * budget spent through the tyres the driver still has turns the body
         * differently from the ground merely dragging on it, and one accident
         * in ten that would have left the car lying there for the crew ends
         * with it on its wheels instead — the difference between a bad moment
         * and a retirement. */
        brake: 1,
        /** THE STEERING: the lateral force the tyres still down will make.
         * This is the term that lets the driver change how the crash GOES
         * rather than merely how fast it ends, because it works on the
         * lever of the weight's own height exactly as the ground's friction
         * does — steer into the side the car is standing on and the body is
         * pushed back down, steer away and it is held up there or taken
         * over. The same authority `leanTorque` hands the handling model
         * for a car balanced on two wheels, not switched off at the moment
         * the body commits. */
        steer: 0.9,
      },
    },
  },
} as const;
