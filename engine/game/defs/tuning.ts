// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Global handling tuning — the numbers that shape the FEEL, shared by every
// car (per-car numbers live in cars.ts). Grouped by what they shape: the
// grip (which is also the drift — there is no separate drift model), the
// jump (takeoff, airborne, landing), and the surfaces. Tweak here, verify
// with `npm run sim` and the drift/jump tests; the render layer never reads
// these directly.

/** The clock the whole engine runs on — see `TUNING.physicsHz`. Named out
 * here so the timestep can be derived from it rather than restated. */
const PHYSICS_HZ = 120;

export const TUNING = {
  /** HOW OFTEN THE WORLD IS SOLVED, steps a second — the rate everything
   * else in this file is quoted against, and a linear lever on what the
   * engine costs, fifteen cars included.
   *
   * IT STAYS AT 120, and the reason is the SPRINGS. Nothing else objects:
   * across 24 bot-driven stages, 60 Hz holds pace and finishing exactly and
   * the drift lab's slip angles move one to three per cent, while a solo
   * stage at 30 Hz ends in the same metre of road 0.2 s apart. But the bump
   * stops are damped EXPLICITLY (`suspension.stopDamp`), and an explicit
   * damper takes more out per second the bigger the step is — so at 60 a
   * landing no longer compresses onto the stops it was authored to reach,
   * and lands soft. Rate-correcting that damper is the price of turning
   * this knob down, and it is a change to how every landing feels.
   *
   * Below 45 the drift model degrades on its own terms regardless: drift
   * count falls 26% at 45 and 44% at 30. That is the floor even once the
   * springs are fixed.
   *
   * CONTACT does not care, which is worth knowing before anybody reaches
   * for a collision rate of its own: `collideCars` is an impulse resolver,
   * so it kills the closing speed and separates the pair whatever the rate,
   * and staging a held rub at a fixed closing speed deals exactly the same
   * crush at 120, 90, 60 and 30 (`collision_test.ts`). A heat run at two
   * rates LOOKS like it disagrees, and that is fourteen bots taking
   * different lines rather than a softer model. There is also no such thing
   * as resolving contact FASTER than this number: nothing moves between two
   * steps, so a second pass over the same positions finds `closing <= 0`
   * and returns.
   *
   * The other thing that moves with it is the FLICK, read off how fast the
   * rack is crossing and therefore off how often it is asked — so anything
   * that changes this owes `make drift` a run as well as `make sim`. */
  physicsHz: PHYSICS_HZ,
  /** ...and the same number as the timestep every rate in here is spent in,
   * seconds. Derived, never authored: two places to say one thing is one
   * place to get it wrong. */
  dt: 1 / PHYSICS_HZ,

  /** HOW OFTEN A DRIVER LOOKS UP, decisions a second — the bot's own clock,
   * which is not the same question as how often the world is solved.
   *
   * The physics has to run at `physicsHz` because that is what integrates a
   * car. The DRIVER only has to re-read the road as often as the road
   * changes, and at rally speed a car covers half a metre in a thirtieth of
   * a second. The whole corner scan hangs off this — every sample over the
   * plan horizon, the hazard beside each one, the traffic — and it is most
   * of what the bot costs, so halving it halves that. Between decisions the
   * hands stay where they were put, which is also what hands do.
   *
   * At or above `physicsHz` every step decides, exactly as it always did.
   * It lives here beside the physics rate rather than in `sim/` because the
   * two are read together: what matters is the RATIO, and a reader deciding
   * one of them needs the other in front of them.
   *
   * IT SHIPS AT THE PHYSICS RATE — every step — and the knob is here for a
   * device that cannot afford that. Halving it is genuinely nearly free on
   * the numbers a sim table shows: over 24 bot-driven stages, pace, drift
   * count and finishing are all identical and off-road is +4%. What it also
   * does is lose a run. Two seeds put a crew back on the road where one did
   * before, which is exactly what `scars_test` and `simulation_test` are
   * there to catch, and a driver who looks up half as often committing to a
   * slide it cannot see the end of is the mechanism.
   *
   * That is not worth taking by default, because of what it buys: the whole
   * engine, fifteen cars included, is about 1.5% of realtime, and halving
   * this takes ~14% off that. Two tenths of one per cent of a frame against
   * a bot that gets lost more. The render clocks are where the phone's
   * money is (`FRAME_HZ`, `MIRROR_HZ`).
   *
   * Measured floor if it is ever turned down anyway: 30 costs the same as 60
   * — the whole saving is in the first halving — and 20 breaks it outright,
   * twelve respawns against one. */
  botHz: PHYSICS_HZ,

  /** The establishing shot at the start of a stage, seconds — the beat
   * before the lights, while the camera is still circling the start area
   * and the car ahead is leaving the control. Nothing is driveable through
   * it and the clock has not started.
   *
   * It is sized so that `intro + countdown` is exactly `START_INTERVAL`
   * (sim/rivals.ts): the crew in front leaves the control on the first
   * frame of the shot, the player's lights go out one full interval later,
   * and the stagger the classification is built on is a thing the player
   * WATCHES rather than a rule they are told about. `start_test.ts` holds
   * the two numbers to that sum. */
  intro: 7,

  /** Countdown before control is handed over, seconds. */
  countdown: 3,

  /** THE MASS START — the grid a heads-up race lines up on, and the only
   * catch-up this game has (sim/grid.ts).
   *
   * A rally start is one car at a time and the classification is a list of
   * times (rivals.ts). A heads-up race is the other thing entirely: everybody
   * leaves on the same green, so the road ahead is full of cars and the
   * result is decided by who is in front at the line.
   *
   * THE GRID STANDS BEHIND THE START GATE, on the apron R24 already lays
   * there for exactly this — `startZone.apron` metres of flat dirt road
   * extrapolated straight off the first sample, with the terrain shelf held
   * flat under it. So the whole field drives THROUGH the gate at the green
   * rather than half of it starting up the road, and the apron's length is a
   * hard ceiling on how deep a grid can be.
   *
   * It ZIG-ZAGS: one car per row, alternating sides of the centre, which is
   * how a kart or club grid is actually laid out. Two abreast wastes the road
   * on a rally stage — the cars are the same distance back and there is
   * nothing to pick between the pair — where a stagger gives every car its
   * own metre of road and reads, from the back row, as a queue.
   *
   * A row back is metres given away, and the player is on the BACK row, so
   * the metres have to come back. `catchUp` is how: a slot's drive is
   * multiplied by `1 + gain` until it reaches `catchUpS` along the stage, and
   * `gain` is sized to return exactly the deficit.
   *
   * THE ARITHMETIC, and then the correction it needs. Two cars accelerating
   * at a and a(1+k) off the same standstill are apart by ½akt²; the leader
   * covers s in t = sqrt(2s/a), so by then the trailing car has taken back
   * ½ak(2s/a) = k·s metres — independent of a, of the car and of the surface.
   * That would make k = deficit/s and nothing else.
   *
   * It does not hold, because a is not constant: `engineAccel` tapers to
   * nothing at each gear's top, so most of a 200 m window is spent where a
   * percent more drive buys well under a percent more distance. Measured
   * against the real physics — two identical cars flat out on a straight, one
   * boosted, gap read where the leader reaches the window's end:
   *
   *   window   compact   classic   coupe
   *    80 m     0.75      0.67      0.90
   *   120 m     0.65      0.68      0.82
   *   200 m     0.65      0.52      0.80
   *   300 m     0.51      0.49      0.76
   *
   * The yield is flat in k (the model is linear in it) and falls with the
   * window, which is the taper. `catchUpYield` is that number for the window
   * below; `tests/mass_start_test.ts` measures what actually comes back, so a
   * handling change that moves the taper fails there rather than quietly
   * making the back row a worse place to start.
   *
   * It is deliberately the ONLY catch-up: no rubber band, no slipstream, no
   * hand on the leader's brake. It looks at the grid and never at who is
   * winning, and it is over by the first corner. */
  massStart: {
    /** Gap between rows, m. A little under a car's length
     * (`collision.halfLength` × 2), which is what makes a stagger a stagger:
     * the cars overlap nose to tail and are kept apart by the zig-zag
     * instead, which is the whole reason to lay a grid out this way. */
    rowGap: 3.5,
    /** How far off the road's centre a row stands, m — alternating sides, so
     * two cars in consecutive rows are twice this apart across the road. The
     * road is 7 m wide at R21's floor, which leaves 2.58 m for a half-body of
     * 0.92 m, so a grid stands clear of both verges on the narrowest stage
     * the generator builds — and 3.2 m between centres is a body and a half
     * of daylight between overlapping cars. */
    columnOffset: 1.6,
    /** How far up the road the catch-up runs, m. It is sized from the
     * DEEPEST slot the apron can hold: a grid sixteen rows deep stands its
     * back row 52.5 m down on pole, and the only two ways to hand that back
     * are more drive or more road. More drive is a shove — the cap below is
     * there precisely to stop it — so it is more road. `deficit / (catchUpS
     * × catchUpYield)` has to come out at or under `catchUpMax` for the last
     * row on the deepest grid, which is what sets this number; lengthen the
     * apron and it has to grow with it.
     *
     * It is spent over R1's opening straight and the fast corner off it
     * (`STAGE_RULES.launch`), which is why that straight is sized from the
     * grid as well: the two numbers are one decision. */
    catchUpS: 320,
    /** What fraction of the ideal `k·s` a real car actually takes back over
     * that window — measured, not derived, and averaged across the roster.
     * Re-measure it whenever the engine's torque taper, the gearing, or
     * `catchUpS` moves: the yield falls as the window lengthens, because a
     * car that has reached its terminal speed buys almost nothing with extra
     * drive, and most of a longer window is spent up there.
     * `tests/mass_start_test.ts` is what measures it — the back row of the
     * deepest grid, flat out, against pole. */
    catchUpYield: 0.52,
    /** Ceiling on a slot's extra drive, as a fraction: the guard that keeps
     * the compensation from becoming a launch. It has to sit ABOVE what the
     * deepest grid the apron holds actually asks for — the back row of a
     * sixteen-car grid is 52.5 m down and wants 0.30 — because a cap that
     * binds in normal use stops being a guard and silently becomes the
     * model, and then the back row is short-changed by however much the two
     * differ. Raise the apron and this has to be re-checked with it. */
    catchUpMax: 0.34,
  },

  /** Speed under which a coasting car counts as STOPPED and is snapped to
   * rest, m/s. It is what keeps a parked car from creeping down a slope,
   * and the threshold reverse hands the car back at. */
  standstill: 0.05,

  steering: {
    /** Below this speed the wheel's authority ramps in from zero — you
     * cannot pivot a parked car, m/s. Lower = livelier launches. */
    deadSpeed: 6,
    /** Speed that halves the wheel's authority at pace: the base gain is
     * steerRate / (1 + u / this), m/s. Higher = twitchier at speed,
     * lower = more straight-line stability. */
    fadeSpeed: 20,
    /** How fast the LOCK ITSELF moves toward what the driver is asking for,
     * 1/s. The rack has weight and so do the hands on it: a car whose front
     * wheels snap to full lock in one tick answers a flick before the body
     * has begun to lean, which reads as a cursor rather than a car. Small
     * enough to be felt as turn-in taking a beat, large enough that a
     * counter-steer still catches a slide. It is the LOCK that lags, not the
     * yaw — the steady-state corner is exactly the one it always was. */
    rackRate: 13,
    /** How much the slip's self-rotation acts with the wheel CENTRED,
     * 0..1, rising linearly to 1 at full lock. This is the "commitment"
     * that lets a held wheel sustain a slide, a centred wheel gather the
     * car up, and a full counter damp the catch into a clean exit. */
    commitmentFloor: 0.25,
    /** Slip angle over which the power oversteer's tail torque softens its
     * sign as the slip crosses centre, rad — the chatter guard that keeps
     * the drift's push from flip-flopping at tiny angles. */
    tailSoftSlip: 0.08,
    /** THE FLICK, first half: the rack speed a full weight throw takes,
     * lock per second. Read against `rackRate` above — a wheel slammed
     * from one side to the other tops this out, an ordinary correction
     * comes nowhere near it. It is the rack's SPEED that throws the car,
     * never its position: a wheel held at full lock throws nothing,
     * however much lock it is holding. */
    flickRate: 12,
    /** ...second half: how far onto the OTHER side of centre the hands
     * have to have crossed for that throw to count fully, in lock². The
     * hands have to be crossing the car, not chasing it — unwinding out of
     * a corner is not a flick, and neither is catching a slide. */
    flickCross: 0.25,
    /** ...and how fast the load that throw put across the car settles back,
     * 1/s. This is the whole reason a flick is a MOVE and not a twitch: the
     * hands are over the other side for about fifty milliseconds, and a
     * torque that lived only that long would do nothing at all. What the
     * tires feel is the weight, and the weight takes the better part of
     * half a second to cross the car and come back. */
    flickSettle: 2.2,
  },

  grip: {
    /** Speed a sliding tire actually burns off, 1/s — scaled by sin²(slip),
     * so ordinary cornering costs nothing and even a big drift costs little.
     * This is the number that decides whether a drift is FELT as a brake. */
    scrub: 0.36,
    /** How strongly slip self-rotates the car while sliding, rad/s per rad. */
    slipYaw: 1.6,
    /** RWD power oversteer: yaw the driven rear axle feeds the slide while
     * the power is down and the wheel is NOT steered into it, rad/s at full
     * throttle, full slide and pace. Ungated by the saturation band, so a
     * centred wheel on the power lets the slide LINGER for a beat instead
     * of snapping straight — a counter still settles it faster. Kept well
     * under the wheel's own authority (driftYaw): if the hands-off push
     * rivals what full lock adds, the drift steers itself and the wheel
     * commands only the last few degrees. */
    powerYaw: 0.55,
    /** Yaw response rate while gripping and while fully sliding, 1/s. The
     * slide rate sits a touch under the old grip-matched value so a hard,
     * over-held catch carries enough momentum to swing the pendulum into an
     * opposite slide — while a timed counter still settles without wobble. */
    yawResponse: { grip: 8, slide: 6 },
    /** Rear grip while the handbrake is pulled (multiplier)... */
    handbrakeGrip: 0.4,
    /** ...and how much of the LATERAL redirect survives the same lever,
     * 0..1. Much higher than `handbrakeGrip` above, and they are different
     * numbers because the lever locks the REAR wheels only: the fronts go on
     * rolling and go on steering, so the car loses its tail and not its
     * ability to change direction. Folded into one number the handbrake
     * pivoted the car through seventy degrees and then carried it straight
     * on past the apex on a WIDER arc than a plain lift would have taken —
     * spectacular, and useless for the hairpin it exists to get round. */
    handbrakeLat: 0.85,
    /** ...and the yaw it adds toward the steered side, rad/s. The handbrake
     * unsticks the rear; it does not teleport the car sideways. */
    handbrakeYaw: 1.5,
    /** How fast the weight actually moves forward when the throttle comes
     * up, and back again when it goes down, 1/s. The pedal is instant — a
     * key, or a finger on a trigger — and the mass it moves is not. Slow
     * enough that a stab does not rotate the car, quick enough that a
     * deliberate lift into a corner is felt as turn-in. Read `drift.liftSpan`
     * beside it: without this lag, a bot or a player breathing the throttle
     * pumps the angle the slide is asking for several times a second, and
     * one long drift is counted and drawn as a dozen twitchy little ones. */
    liftSettle: 4.5,
    /** THE BOOT: how much slide a driven axle spinning up under a sudden
     * application of throttle asks for, ×`drivetrain[].spin` × the car's own
     * `torque`. The friction circle — a tire has one budget of grip to spend,
     * and rubber already near saturation asked to put power down as well has
     * less of it left to corner with. On a driven REAR axle that is the tail
     * stepping out, which is why this is a rear-driver's move and almost
     * nothing on a front-driver, whose axle answers the same trade by losing
     * the nose instead (`pullStraight` owns that half).
     *
     * A SPIKE, like the flick, and for the same reason: what rotates the car
     * is the torque arriving faster than the tires can shed it, not the
     * throttle being down. Holding it down is `powerYaw` and the steady
     * angle the wheel is asking for; this is the stab. It rides on the same
     * lagged weight as the lift — how fast `CarState.lift` is FALLING is how
     * hard the power is coming back on — so it needs no state of its own and
     * cannot fire on a throttle that was already open.
     *
     * With it the pedal rotates the car at both ends: lift to go deeper and
     * tighter, boot it to bring the tail round again, and a maintenance
     * throttle in between to hold what you have. Without it, getting back on
     * the power mid-drift only ever made the angle fall away. */
    bootThrow: 0.7,
    /** Extra lateral grip from lifting off mid-slide (weight transfer). */
    liftGrip: 0.6,
    /** THE TRACTION CEILING, as a multiple of the car's own `gripAccel`:
     * the most lateral acceleration the tires will actually deliver, however
     * hard the geometry asks. It is what makes a corner's radius cost SPEED
     * — the tightest line the car can hold grows as u², so a long sweeper is
     * a flat-out drift and a hairpin has to be braked for or flicked round
     * on the handbrake instead of pivoted at pace. Above 1 because this is
     * an arcade rally car and not a tire model: `gripAccel` is where the
     * slide starts easing in, this is where the tires are genuinely out. Set
     * it near 1 and the car corners at its stated grip and feels heavy; take
     * it much past 2.5 and speed stops costing radius at all — every corner
     * is the same corner again, taken flat. */
    latCeiling: 1.4,
    /** ...and how much of the demand the tires still answer once they are
     * past it, 0..1 — the residual slope of the saturation curve. Zero is a
     * pure asymptote, and a pure asymptote is a cliff: the moment a corner
     * asks for the ceiling there is nothing but slip angle left to answer
     * more lock with, so the car steps from gripped to fully sideways
     * between two notches of the wheel. A little give keeps the response
     * monotone all the way up the throw — past the limit more lock still
     * tightens the line, it just costs a great deal of angle to buy very
     * little radius. */
    latGive: 0.25,
    /** WHAT A CENTRED WHEEL COSTS THE TIRES. Sideways, the front wheels sit
     * at the same angle to the travel that the body does — pointed nowhere
     * near where the car is actually going, with almost nothing to pull
     * against. LOCK is what aims them back along the travel and lets them
     * bite, and it works either way round: the lock held through a corner,
     * and the catch on the way out. So the redirect keeps its full rate
     * wherever the wheel is asking for something, and gives up `tailFade` of
     * it (0..1) only where a CENTRED wheel meets a real slip angle —
     * `tailPeak` is the angle that starts to count and `tailBand` how much
     * further past it the fade takes to arrive. Both scale with the
     * surface's own breakaway, for the same reason `angleSpan` does: a
     * sealed road's whole slip vocabulary is a few degrees wide and a fade
     * sized for gravel would never reach it.
     *
     * This is the knob that decides who owns the EXIT. At zero the tires
     * gather a dropped slide up entirely on their own — the velocity swings
     * thirty degrees back in behind the nose the moment the hands come off,
     * so the drift finishes the corner by itself and hands the car back
     * straight, on the line and carrying more speed than it went in with,
     * with nothing left to catch. Turned up, letting go leaves the car
     * going where it was already going: out toward the outside of the road,
     * aimed off the line, waiting for the wheel to tip it back into the
     * middle. Nothing below `tailPeak` changes at all, a held drift is
     * untouched because the lock is still on, and it can only ever HOLD an
     * angle, never inflate one — the redirect still decays the slip every
     * step, it just no longer erases it. */
    tailPeak: 0.22,
    tailBand: 0.4,
    tailFade: 0.93,
    /** ...and the ROTATION the same lift feeds a slide, rad/s at full slide
     * and pace. Lifting takes the weight off the driven axle and swings the
     * tail: it is what a front-driven car has instead of power oversteer,
     * and the reason one is rotated on the pedal rather than on the wheel.
     * `liftGrip` tightens the line, this swings the nose — one lift, both. */
    liftYaw: 0.5,
    /** ...and the rotation a TRAILED BRAKE feeds the same slide, rad/s at
     * full brake, full slide and pace, ×`drivetrain[].brake`. `liftYaw`
     * above is the weight coming off the driven axle; this is the whole car
     * pitching onto its nose, which is a bigger transfer and the reason a
     * brake carried past the turn-in rotates a car that a lift alone only
     * tightens. Sized over the lift and under the handbrake: it is the move
     * between the two, and like both of them it is gated by the saturation
     * band, so it takes the car to the angle `drift.brakeDepth` opened up
     * and no further. Reads the LAGGED load, so a stab is not a rotation. */
    brakeYaw: 1.6,
    /** Driven FRONT wheels pull the car toward where they POINT, so the
     * throttle is a front-driver's way OUT of a slide, rad/s per rad of slip
     * at full throttle, full slide and pace. The exact mirror of `powerYaw`
     * above, which is why the two layouts want opposite pedals mid-corner. */
    pullStraight: 2.2,
    /** ...and how hard that same pull TIGHTENS a slow corner, rad/s at full
     * lock and full throttle. It fades out as the gear runs out of torque,
     * so it is the front-driver's low-speed turn-in bite and nothing at all
     * on the straight. */
    pullIn: 0.55,
    /** THE SCANDINAVIAN FLICK, second half: the yaw that weight throw
     * actually puts into the car, rad/s at a full throw and pace. The
     * demand below only opens the door — it takes the grip away — and this
     * is what walks the car through it; without it a front-driver's flick
     * is a slide with nothing to rotate it, which is no flick at all. Kept
     * near the handbrake's own yaw: both are ways of asking the rear to let
     * go, and neither may out-argue the wheel. */
    flickYaw: 3.2,
    /** ...and first half: how much of a full slide one weight throw
     * asks for, 0..1 of a full slide. Wind the wheel away from the corner,
     * snap it back, and the mass crossing the car takes the rear wide —
     * no driven rear axle required, which is why it is the one way a
     * front-driver gets a slide started, and why the game is named after
     * it. It arrives as a SPIKE of demand and the slide's own release
     * (`drift.release`) is what carries it through the corner after the
     * hands have stopped, so the flick sets the angle up and the wheel
     * then drives it. */
    flickThrow: 1.25,
    /** How much of a full slide TORQUE alone can ask for, at the bottom of
     * the gear with the wheel turned, 0..1. Speed is not the only way to
     * unstick a driven axle: a rear axle with real torque under it spins up
     * and steps the tail out at walking pace, which is why a rear-driver
     * can be drifted at 10 km/h and a front-driver cannot be drifted at
     * all. It enters the same demand the wheel's lateral ask does, so the
     * slow slide IS the fast one — one model, one readout, one plume. */
    torqueSpin: 1.35,
  },

  /** THE ENGINE — how the torque a car's `gearAccel` promises actually
   * arrives inside a gear, and how much of it ever reaches the ground. */
  engine: {
    /** How far a car's `torque` tilts the in-gear curve, as a fraction at
     * each end of the gear. The curve PIVOTS around mid-gear, so torque
     * says where the shove lives and never how much of it there is —
     * `gearAccel` owns that. A torquey engine shoves off the bottom and
     * runs out of puff; a peaky one wants revs and rewards a driver who
     * keeps it in the band. */
    torqueSpan: 0.55,
    /** How much of the torque an axle with no bite left simply spins away,
     * 0..1 at zero bite. Worst at the bottom of the gear, where the torque
     * is highest and there is least speed to hide behind, and gone by the
     * top of it — which is why the loose-surface launch is where a
     * one-axle car loses to a four-wheel-drive and nowhere else. */
    wheelspin: 0.5,
    /** How much of a fully developed slide lights the driven axle up, 0..1
     * of the wheelspin a launch has. A tyre spending its grip sideways has
     * that much less of it left to drive with, so a driven axle on the
     * throttle mid-drift spins up at any speed at all — which is exactly the
     * wheelspin a launch does NOT have. The launch's own is gone by the top
     * of the gear (it scales with `1 - rev`); a drift's is not. */
    slideSpin: 0.55,
    /** How fast `CarState.wheelspin` — the readout the drawn wheels turn on
     * — builds and dies, 1/s. A tyre lights up in a few frames and hooks
     * back up about as fast; the lag is what keeps a throttle being fed in
     * and out of a corner from strobing the wheels between spun-up and
     * gripping. Presentation only: the torque loss itself is instant. */
    spinSettle: 9,

    /** THE LAUNCH. Everything above is the axle's standing bite; these are
     * what happens when a driver asks it for more than that off the line.
     * The rule the whole group exists to write is a start-line one: the
     * driver who sits on the line with the engine screaming and drops the
     * clutch on green leaves SLOWER than the one who waits with the pedal
     * up and picks it up as the light changes — by enough to see, and not
     * by enough to decide a stage. */

    /** How much of the axle's bite the pedal may claim before the tyres
     * start spinning instead of gripping, ×`drivetrain.bite` × the car's
     * own `traction` × the surface. Under 1 because a standing start is
     * the worst moment a driven axle has: no load on it yet, all of the
     * torque, and none of the speed that hides it. A four-wheel-drive's
     * bite is over 1 to begin with, so it clears this outright and can be
     * floored off the line — which is the whole point of one. */
    pedalHold: 0.78,
    /** How much of that excess a PEDAL alone can actually light, 0..1. Well
     * under 1: torque fed smoothly at a tyre finds a slip the tyre can live
     * at — a scrabble off the line, not a burnout — where a clutch dropping
     * a whole flywheel on it does not. Small on purpose, because this is the
     * one term that reaches past the start line: every hairpin exit in first
     * gear runs through it, and a rear-driver that lost a third of its shove
     * every time it opened the throttle would be a different car, not a
     * car with a launch. What bounds it from above is `drivetrain_test`'s
     * wet-versus-dry claim — that a four-wheel-drive keeps more of its pace
     * on a surface with nothing to hold: this term costs a car with GOOD
     * bite proportionally more of its dry launch than one with poor bite,
     * so past about `pedalSpin × spinLoss = 0.1` it inverts the layouts. */
    pedalSpin: 0.1,
    /** Revs below which dropping the clutch costs nothing, 0..1. A driver
     * blipping the engine while they wait is not doing anything wrong; one
     * sat against the limiter for the whole countdown is. */
    dumpFrom: 0.3,
    /** How much the revs held at the drop are worth as extra pedal, 0..1 at
     * the limiter. It stacks straight onto the throttle, so a full-revs
     * launch asks the tyres for more than any pedal can and lights them up
     * on every car in the roster — the four-wheel-drive least. */
    dumpSpin: 0.8,
    /** How much of `gearAccel` a fully lit axle spins away, 0..1, on top of
     * the standing `wheelspin` loss above.
     *
     * THIS AND `spinHook` ARE SET BY A STOPWATCH, not by feel, and the
     * benchmark is a reaction time. Against a driver who sat on the
     * limiter and went the instant it changed, a driver who waited with the
     * pedal up is worth 13–17 m at five seconds — so the same driver taking
     * a THIRD OF A SECOND to react is still a few metres ahead, and one
     * taking half a second has given it all back, on every car in the
     * roster. That is the whole design: waiting buys a human reaction time
     * and a car length or two, and nothing beyond it. Bigger and the start
     * decides stages; smaller and there is no reason to lift. */
    spinLoss: 0.5,
    /** How fast the axle lights up, 1/s. Near-instant: a tyre that lets go
     * lets go now, and the lag that matters is all on the way back. */
    spinLight: 14,
    /** ...and how fast it hooks back up under a pedal still on the floor,
     * 1/s. Slow on purpose — a second or so of the wheels turning faster
     * than the road is what makes a bad start LOOK like one, in the dust,
     * the needle and the noise, long enough for the player to read what
     * they did wrong. */
    spinHook: 0.9,
    /** How much FASTER it hooks up for a driver who eases off, ×`spinHook`
     * at a fully closed throttle. This is the only thing modulation buys,
     * and it is deliberately the only thing: with a binary pedal — a
     * keyboard, a phone's thumb zone — there is no feathering to be had, so
     * flooring it must stay the right call for everyone who cannot do
     * anything else. What an analogue pedal gets is a shorter mistake. */
    hookLift: 2,
  },

  /** THE DRIVETRAIN — what changes about a car when the power goes to a
   * different pair of wheels. Each entry is a SHAPE the layout HAS; the
   * catalog's own `torque` and `traction` say how much of it a given car
   * has, and the magnitudes live in `grip` and `drift` above. Between them
   * they are the whole difference between the three cars in the roster:
   * a front-driver that understeers to the limit and rotates on a lift, a
   * rear-driver that steps out on the throttle at any speed at all, and a
   * four-wheel-drive that simply goes. */
  drivetrain: {
    fwd: {
      /** Power oversteer from the driven axle, ×`grip.powerYaw`. A car with
       * no driven rear has none: what it gets instead is the two lines
       * below. */
      powerYaw: 0,
      /** The throttle pulling the car straight out of a slide,
       * ×`grip.pullStraight`. The front-driver's whole exit. */
      pullStraight: 1,
      /** ...and pulling it INTO a slow corner, ×`grip.pullIn`. */
      pullIn: 1,
      /** Rotation from lifting mid-slide, ×`grip.liftYaw`. The only way a
       * front-driver rotates without the handbrake. */
      liftYaw: 1,
      /** Slide the driven axle can spin up from torque alone, ×
       * `grip.torqueSpin`. Almost nothing: a front axle that runs out of
       * grip goes STRAIGHT ON, it does not step out. */
      spin: 0.1,
      /** Where the slide starts, ×`drift.entryAt`. Well over 1: a
       * front-driver understeers up to the limit and some way past it, and
       * has to be provoked the rest of the way. */
      entry: 1.5,
      /** ...and HOW FAR it develops once past it, 0..1 against a fully
       * developed slide — the rear-driver's, which is what every other knob
       * in the group is calibrated against. NEVER over 1: `asked` above the
       * carried `sliding` leaves `releasing` (car.ts) pinned at zero, and the
       * exit stops existing.
       *
       * THE LOWEST IN THE ROSTER, and this is the number that makes a
       * front-driver a front-driver: when the fronts give up the car WASHES
       * WIDE. Wind more lock into a tightening corner on the throttle and
       * the hatch simply runs out of road — the angle the wheel alone can
       * ask for is barely a drift at all, and every degree past it is bought
       * with a flick, a trailed brake or the lever (`drift.flickDepth`,
       * `brakeDepth`, `leverDepth`, which is the whole reason those exist).
       * Provoked, it is a lovely thing; driven like a rear-driver, it is a
       * car ploughing straight on with its nose washed out.
       *
       * `entry` alone cannot say any of that: it moves where the slide
       * begins and nothing about how deep it goes, so on the loose — where
       * the front-driver's rubber is the first to give up — `entry` alone
       * leaves the hatch hanging exactly the same tail out as the saloon,
       * only earlier. */
      depth: 0.42,
      /** How fast a slide the wheel has stopped asking for lets go,
       * ×`drift.release`. Fast — it gathers itself up. */
      release: 1.5,
      /** ...and how hard the rear weathervanes the nose back toward the
       * direction of travel while it does, ×`drift.releaseSnap`. THIS is
       * what decides whether a slide lingers once the wheel is centred, not
       * `release` above: a slower release holds the slide up, and the
       * weathervane scales with exactly that, so the two cancel. A rear
       * axle still under power resists being pulled straight; an undriven
       * one, dragging, does the pulling.
       *
       * Still the strongest in the roster, but no longer by as much as the
       * dragging rear alone would argue for: this car now reaches its real
       * angles on the lever and the brake, and a weathervane sized for a
       * slide the wheel asked for swings a provoked one back through centre
       * and out the other side — a yank into a hairpin that gathers itself
       * up, overshoots to nearly straight and then builds a second slide on
       * its own is a car arguing with the driver rather than answering. */
      snap: 0.9,
      /** Forward bite: how much torque reaches the ground, ×the car's own
       * `traction`, against the surface's grip. Two driven wheels with the
       * engine sat on top of them hook up well. */
      bite: 0.95,
      /** THE SPEED FLOOR under the whole slide, ×`drift.slideFrom`. The
       * game's floor is a rule the player is told — it will not drift under
       * 70 — so a layout only moves off 1 when it genuinely behaves
       * differently down there. A front axle that runs out of grip goes
       * STRAIGHT ON at any speed, so this one does not. */
      driftFloor: 1,
      /** Weight thrown by a flick, ×`grip.flickThrow`. A nose-heavy car
       * with an unloaded rear throws the most, and needs to: with no
       * driven rear and a throttle that only ever pulls it straight, the
       * flick is the front-driver's ENTIRE way into a slide. */
      flick: 1,
      /** ...and by a trailed BRAKE, ×`drift.brakeDepth`. The reference, for
       * the same reason: with the loaded axle at the front, standing on the
       * brakes is what finally takes the weight off the back of this car.
       * Lift and brake together are how a hatch is turned in — the pedals
       * do the rotating and the wheel only points it. */
      brake: 1,
    },
    rwd: {
      powerYaw: 0.95,
      pullStraight: 0,
      pullIn: 0,
      liftYaw: 0.25,
      spin: 1.9,
      entry: 0.82,
      // THE REFERENCE, and the reason to drive this car: a rear axle with
      // torque under it does not wash wide, it comes round, and it sits at an
      // angle neither other layout reaches. Every knob in the slide is
      // calibrated against a fully developed one, so this is the row that
      // stays at 1 — the other two are what a layout gives away.
      depth: 1,
      release: 0.75,
      snap: 0.7,
      bite: 0.7,
      // THE ONE EXCEPTION to the game's 70 km/h floor, and the reason it is
      // a per-layout number at all: a rear axle with torque under it steps
      // the tail out at walking pace, which is a real thing a rear-driver
      // does and neither of the others can. 0.06 of the floor is 1.2 m/s,
      // far enough below the ramp (`slideSpan`) that the slide is properly
      // open by 10 km/h rather than 1% open at it.
      driftFloor: 0.06,
      flick: 0.75,
      // Least of the three, and not because the brake does less to this car:
      // a rear axle already loose on the throttle has nothing left for a
      // trailed brake to unstick. The move is worth most to the layout that
      // has no other way of asking.
      brake: 0.5,
    },
    awd: {
      powerYaw: 0.5,
      pullStraight: 0.3,
      pullIn: 0.45,
      liftYaw: 0.5,
      spin: 0.4,
      entry: 1,
      // Between the two, as everything about this car is: it slides when
      // asked and it is never the one hanging furthest out. Well clear of
      // the hatch, though — with drive to the rear as well it steps out on
      // the wheel where the front-driver would only push.
      depth: 0.75,
      release: 1,
      snap: 1,
      bite: 1.2,
      driftFloor: 1,
      flick: 0.85,
      brake: 0.8,
    },
  },

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
     * It is the REAR-DRIVER's angle, on the wheel alone, at pace: the one
     * layout whose `depth` is 1. Every other car in the roster reaches some
     * fraction of it and has to be provoked for the rest, so this number is
     * the ceiling on the whole game's drift and not an average of it. */
    angleSpan: 0.36,
    /** How far past the asked angle the deepening forces take to fade to
     * nothing, rad. Wide enough that the drift is a slope to lean on rather
     * than a wall the car hits: it is the room the throttle, the lift and
     * the handbrake move the car around in. Narrower also means the car
     * sits closer to exactly the angle asked for.
     *
     * WIDER than `angleSpan` now, where it used to be a fraction of it, and
     * that is the point rather than an accident of the setpoint coming down:
     * the angle the wheel asks for is deliberately modest on two of the three
     * layouts, and the moves that make up the difference — the flick, the
     * trailed brake, the lever — all work by taking the car PAST it. Narrow
     * the band back and they have nowhere to take it: every deepening force
     * fades out a few degrees past the wheel's own ask, the provocation
     * stops paying, and a driver managing a slide finds the car falling out
     * of it under them. (The sim is unusually loud about this one: at 0.31 a
     * bot that had driven seed 1 cleanly for a year spent twenty seconds of
     * it in the trees.) */
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
    /** Slip angle at which the car READS as drifting — dust, HUD, stats.
     * Read off the ANGLE rather than the slide, because the angle is what a
     * player sees and because it moves smoothly: the slide tracks steering
     * input, which chatters, and a readout that chatters is a stuttering
     * dust plume and a meaningless drift count. Radians. */
    enterSlip: 0.18,
    /** ...and the angle it has to settle back under before that drift is
     * over. One corner is one drift, not thirty. */
    exitSlip: 0.09,
  },

  /** THE REV COUNTER. There is no crank in this model: on the move the revs
   * ARE gearing plus forward speed, which is why the needle, the shift light
   * and the engine note can never disagree with each other. The one place
   * that is not true is the GRID, where the car is not moving, no gear is
   * selected, and the throttle is still the driver's to blip — there the
   * revs are their own thing, and these are the rates they answer at. */
  revs: {
    /** How fast free revs climb toward the throttle on the grid, 1/s. */
    blip: 7,
    /** ...and fall away off it, 1/s — slower: a flywheel spinning down. */
    settle: 3.4,
    /** How far past the redline the limiter lets a gear go, ×`gearTop`. It
     * is the ceiling on the DRIVEN wheels as much as on the needle: with a
     * gear engaged the tyre cannot turn faster than the engine can spin it,
     * so it is what stops a lit-up axle winding away to nothing. It sits
     * just over 1 because a gear genuinely runs a little past its own top —
     * a tailwind or a descent pushes it there — and a ceiling exactly at the
     * top would clamp the needle flat every time it happened. */
    limiter: 1.06,
  },

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
    /** Ground acceleration the springs can pass to the body, m/s². A valley
     * floor at pace is several g held for a fifth of a second, and no spring
     * this soft holds a body against that inside a wheel arch — past this the
     * dampers are out of authority and the whole car rides the ground up,
     * which is what a bottomed suspension does. Only the ground-follow jolt
     * is capped: a landing and an impact are velocity steps of their own. */
    joltMax: 13,
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
    /** Cap on spring velocity, m/s. Sized to the travel above: the springs
     * cross their whole compression in about a tenth of a second. */
    rateMax: 3,
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
    /** Vertical launch scale from the lip's ramp slope. */
    launchScale: 1.0,
    /** Below this speed the car stays glued to the road however fast the
     * ground falls away — only pace launches you off a crest, m/s. */
    crestSpeed: 12,
    /** Baseline the road's vertical curvature is measured over, m. Wider
     * than the generator's bump layer, so a brow is judged by the shape of
     * the HILL and not by the road's texture — a short baseline turns every
     * ripple at pace into a one-frame hop. */
    crestSpan: 12,
    /** How much harder than gravity the road has to pull the car down before
     * it actually leaves the ground (`u²·curvature` against `g`). A brow the
     * car only just outruns would otherwise separate by a fraction of a
     * millimetre and land again next frame. */
    crestPull: 1.4,
    /** Steering yaw authority while airborne, rad/s — barely any. */
    yawAuthority: 0.35,
    /** Random turbulence torque while airborne, rad/s² — out of control. */
    turbulence: 1.4,
    /** Air drag on forward speed, 1/s — flight carries. */
    drag: 0.02,
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
    /** Random roll torque in flight, rad/s² — the same seeded turbulence
     * that unsettles the nose. */
    rollTurbulence: 0.5,
    /** Roll damping in the air, 1/s — the body keeps most of what it took. */
    rollDamp: 0.25,
    /** How fast the ground unwinds body roll, 1/s. It settles toward the
     * NEAREST upright, so a car already most of the way over finishes the
     * roll rather than rewinding it. */
    rollRecover: 5,
    /** Roll past this at touchdown means the car came down on its side —
     * a sloppy landing however straight the nose was, rad. */
    rollLandLimit: 0.7,
    /** Off the road only: ground falling away by more than this in one
     * step is an edge — a cliff lip, a cut bank — and throws the car
     * instead of gluing it down the face, m. Comfortably more than the
     * shelf drop at the road boundary, so leaving the verge is a curb,
     * not a takeoff. */
    edgeDrop: 0.8,
    /** Landing slip beyond this scrubs speed and wobbles the car, rad. */
    cleanSlipLimit: 0.24,
    /** Speed kept on a clean landing vs a sloppy one (fractions). */
    cleanKeep: 1.0,
    sloppyKeep: 0.78,
    /** Yaw wobble injected by a sloppy landing, rad/s. */
    sloppyWobble: 1.6,
  },

  surfaces: {
    /** Longitudinal drag per surface, 1/s. `nature` is the open landscape
     * off the road — loose but fast: the wild is a place to DRIVE, not a
     * wall of molasses at the verge. Sealed road rolls easiest of all. */
    drag: { gravel: 0.028, asphalt: 0.022, water: 0.5, nature: 0.032 },
    /** Lateral grip multiplier per surface. Asphalt is the outlier the
     * stage's paved sections are FOR: the tires hold a third again as
     * much, so the corner that needed a slide on gravel can be driven
     * round, the line tightens, and a drift there has to be asked for —
     * committed entry, handbrake, or plain too much speed. It is still a
     * rally car on a country road: ask hard enough and it goes sideways,
     * just on smoking rubber instead of flying gravel. */
    grip: { gravel: 1.0, asphalt: 1.35, water: 0.55, nature: 0.7 },
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
     * sweeper being taken at a gravel attitude and full pace. */
    breakaway: { gravel: 1.0, asphalt: 0.35, water: 1.2, nature: 1.1 },
    /** Throttle effectiveness per surface. */
    power: { gravel: 1.0, asphalt: 1.08, water: 0.7, nature: 0.8 },
    /** Rough ground caps pace where gearing cannot: above this speed the
     * nature surface pulls the car back hard (about 150 km/h) — a linear
     * per-surface drag would instead stall the box under its own upshift
     * thresholds. Grounded only: a flight keeps what it took off with. */
    natureTop: 42,
    /** How hard the wild claws back each m/s over that cap, 1/s. */
    natureOverDrag: 3,
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
       * before the water has all of it. */
      stopIn: 0.5,
      /** ...and the slower one it takes the YAW over, s. The water stops a
       * car long before it stops it turning, so the hull keeps swinging
       * gently while it floats instead of freezing on its entry heading. */
      slewIn: 2.5,
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

  collision: {
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
    /** Fraction of the closing speed bounced back off a solid, 0..1 — low:
     * a tree absorbs a rally car, it does not trampoline it. */
    restitution: 0.3,
    /** Fraction of the speed ALONG the surface kept through the contact —
     * a glancing blow scrubs paint and carries on. */
    tangentKeep: 0.82,
    /** Yaw kicked into the body by an off-center hit, rad/s per (m/s of
     * velocity change × m of lever arm) — what makes a clipped tree spin
     * the car instead of politely stopping it. */
    yawKick: 0.35,
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
       * solid goes over, and an ordinary clip only leans. */
      trip: 0.18,
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
       * round, and it is the whole point of being allowed to touch. */
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
    /** Wear a wrecked car is patched back to when it is next put on the
     * road — rally service on the spot: drivable, but half the car's life
     * is spent. A wreck is never teleported home on its own. */
    repairTo: 0.5,
    /** Zone crush that tears each part off its bolts, m. Mirrors pop off
     * a brush; bumpers and the wing take a real hit; a bonnet or boot lid
     * only lets go once the clip around it has folded far enough to pull
     * its hinges, which is deeper than the bumper in front of it. */
    partAt: { mirror: 0.04, bumper: 0.12, spoiler: 0.1, lid: 0.2 },
    /** The mass every other number here is written against, kg. A car's
     * own `mass` is read against this: heavier spins less off a clipped
     * tree, folds deeper for the same closing speed (the energy is real),
     * and rides its springs more slowly. */
    refMass: 1200,
    /** THE GROUND AS A SOLID. Grade (dy/dx) the wheels can still scrabble
     * up: below it a rise is a hill the car climbs and the grade term
     * pushes back on, above it the ground starts REFUSING the car. 0.7 is
     * about 35°. */
    climbLimit: 0.7,
    /** ...and the grade at which it refuses entirely — a cliff face, hit
     * at the full closing speed. 2.1 is about 65°. */
    wallSlope: 2.1,
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

    /** WHAT THE REST OF THE LEDGER DOES TO THE DRIVING. The systems below
     * are the machinery; these are the numbers for everything else the
     * crash left behind — the spent structure the HUD draws the body's own
     * outline in, the shell pulled out of true, the floorpan, and the
     * panels that are lying back up the road. Read in game/damage.ts.
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
      /** Drag each part left on the road costs, 1/s. A mirror is a rounding
       * error; a missing bonnet is a scoop with the whole engine bay behind
       * it, and a missing hatch is the same hole facing the other way. */
      partDrag: {
        mirrorL: 0.0008,
        mirrorR: 0.0008,
        bumperF: 0.004,
        bumperR: 0.003,
        spoiler: 0.002,
        hood: 0.009,
        hatch: 0.007,
      },
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
      /** Missing-wing lateral grip at speed, as a fraction — the downforce
       * that is no longer on the back of the car... */
      spoilerGrip: 0.12,
      /** ...faded in by pace, m/s: a wing does nothing at walking speed and
       * all of it at the top end. */
      spoilerSpeed: 34,
    },

    /** The machinery under the panels: how crush becomes internal damage
     * (per m of crush on the zones nearest each system), and how a damaged
     * system degrades its own job. All damage is 0..1 and never repaired —
     * every effect is sized so a broken system CRIPPLES, never parks. */
    systems: {
      /** Nose crush → engine (the radiator is the first thing to fold). */
      engineFromNose: 1.6,
      /** Flank crush → suspension (arms and uprights live in the arches). */
      suspensionFromFlank: 1.5,
      /** Rear crush → gearbox (the drivetrain hangs off the back). */
      gearboxFromRear: 1.5,
      /** Front-corner crush → steering (the rack's tie rods end there). */
      steeringFromCorner: 1.0,
      /** Belly crush → suspension, plus a share to the gearbox sump. */
      suspensionFromBelly: 2.2,
      gearboxFromBelly: 0.8,

      /** Fraction of engine power gone at engine damage 1 — half the
       * motor, on top of the misfire that comes with it (chassis below).
       * A beaten car has to be visibly, tiringly slow up every hill. */
      powerLoss: 0.5,
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
  },

  gearbox: {
    /** Auto shifts up at this fraction of the gear's top speed... */
    upAt: 0.94,
    /** ...and down below this fraction of the previous gear's top. */
    downAt: 0.55,
    /** Throttle cut while a manual shift engages, seconds. Short enough to
     * be a snap the driver hears rather than a pause they wait out — the
     * manual's cost is the beat and the gear they have to pick, not a lost
     * second. Long enough that shifting into the wrong gear is felt. */
    shiftCut: 0.1,

    /** What each box is WORTH, keyed by the mode the run was created with.
     * The box is a TRADE, not a difficulty setting: the automatic takes
     * every gear for you and never fluffs one, and the manual is the
     * racing set — taller ratios and less of the engine lost on the way to
     * the road — that only pays if the driver actually takes the gears.
     *
     * `gearedSpec` (defs/cars.ts) folds these into the run's `spec`, so
     * everything downstream — the shift points, the bot's target speed, the
     * rev counter, the engine note, the card's spec sheet — reads the box
     * the player chose without knowing there is a box at all. Both are multipliers on the catalog row, so no car is
     * handed a different box from any other: the spread stays the roster's.
     */
    set: {
      auto: {
        /** Ratio on every gear's ceiling — the catalog IS the road box. */
        gearing: 1,
        /** Share of the catalog's acceleration that reaches the road. */
        power: 1,
      },
      manual: {
        /** 6% taller everywhere: the same engine pulls each gear further,
         * which is where the top end comes from. It is paid for at the
         * bottom of every gear, and by `shiftCut` on each of the five
         * shifts a driver now has to take themselves. */
        gearing: 1.06,
        /** ...and 5% more of it arrives, with no converter slurring the
         * bottom of the gear away. Slightly under the gearing so the
         * headroom over drag at `upAt × gearTop` (see cars.ts) is the
         * catalog's, less a percent, rather than a new floor. */
        power: 1.05,
      },
    },
  },

  /** Backing up. Reverse is a RECOVERY, not a way to drive the stage: it
   * exists so a nose in a tree or a car parked across a ditch is something
   * the player digs out of instead of waiting out a respawn. Deliberately
   * slow — fast enough to be quick about it, far too slow to be a tactic. */
  reverse: {
    /** Top speed backwards, m/s (~29 km/h). */
    top: 8,
    /** Acceleration backwards, m/s². About a third of first gear: it takes
     * a beat to get going, which is what keeps a mis-timed brake at a
     * hairpin from becoming a reversal. */
    accel: 3.5,
    /** Forward speed at or below which a held brake stops slowing the car
     * and starts backing it out, m/s. Above walking pace the pedal is
     * unambiguously still the brake. */
    engageBelow: 0.6,
    /** How hard the drivetrain stops a car that is rolling BACKWARDS with
     * nothing asking it to, m/s². Rolling drag alone is tuned for a car
     * with an engine holding it up against it — released at reverse top
     * speed it would coast backwards for the better part of a minute. At
     * this rate the pedal coming up stops the car in about a second. */
    coastStop: 6,
  },
} as const;
