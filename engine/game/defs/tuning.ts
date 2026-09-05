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
   * money is (`FRAME_HZ`, `MIRROR_TIERS`).
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
    /** ...and HOW HARD IT STOPS THE CAR, as a share of the car's own braking
     * (`CarSpec.brake`). A locked pair of wheels is a pair of wheels being
     * DRAGGED down the road, and for a long time this model had none of it:
     * the lever lowered the rear's grip, added yaw and cost the car nothing
     * at all, so the fastest way through a slow corner was to pull it and
     * the one move that is supposed to be a last resort was free.
     *
     * A third, because the lever reaches ONE axle and the rear axle is
     * about a third of a car's braking once the weight has pitched forward
     * — and dragged rather than rolled, so it is the third the pedal would
     * have found there and not a bit more. Never added to the pedal, but
     * taken as the deeper of the two demands (`car.ts`): with the brake
     * already on the floor the rears are locked either way and the lever
     * has nothing left to add, which is exactly why a driver reaching for
     * both gets one. */
    handbrakeBrake: 0.34,
    /** ...and how much harder a car SIDEWAYS on the lever scrubs its speed
     * off, ×`grip.scrub`. The line above is the retardation along the nose,
     * which is all a straight-line yank has; this is the other half of what
     * a dragged axle costs, and it is the half a driver feels in the corner
     * the lever was pulled for. Sized well under the spin's own
     * (`drift.spinScrub`): two tyres dragged is not four, and the exit of a
     * hairpin has to be drivable. */
    handbrakeScrub: 2.4,
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
    /** HOW MUCH OF THE TIRES' GRIP REACHES THE WHEEL, 0..1 — the fraction of
     * a surface's grip advantage OVER GRAVEL (`surfaceGripFor` against the
     * car's own loose-surface rubber, so the tire and the ground together)
     * that turns into steering authority.
     *
     * Without it, grip only ever took things away. `latCeiling` bounds what
     * the tires deliver and `breakaway` says how far sideways they go, but
     * nothing in the model let a grippier surface actually POINT the car:
     * `steerRate` is a property of the rack alone, so in the gripped range
     * the yaw was `steer × steerGain` with no surface in it whatever. Every
     * car in the roster took a WIDER line on tarmac than on gravel at the
     * same lock — the hatch 107 m against 100, the coupe 140 against 119 —
     * while arriving a third faster, which is a paved section that exists to
     * be run wide off. `limits.ts` was meanwhile quoting the bot a paved
     * corner speed off a ceiling the car could not turn tightly enough to
     * spend.
     *
     * Under 1 because the rack is not the only thing in the way — a tire with
     * twice the grip does not give the driver twice the yaw — but far enough
     * over 0 that a paved corner is genuinely a tighter corner, and that mud
     * and standing water genuinely wash wide. */
    steerGrip: 0.55,
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
     * step, it just no longer erases it.
     *
     * BOTH halve with `drift.angleSpan`, and have to: they are angles in
     * the same family, and this gate is the one that decides who owns the
     * exit. Left where they were while the span came down, a full-lock
     * slide on the reference layout no longer reached the peak at all —
     * the fade barely engaged, and the tyres went back to swinging a
     * dropped drift most of the way round the corner on the driver's
     * behalf. Sized so the same drift meets the same fade it always did. */
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
      /** ...and the DEEPEST it ever goes, however hard it is provoked,
       * 0..1 of the same reference. HIGH, and deliberately so: a
       * front-driver snapped into a hairpin on the lever goes round a long
       * way, and this is the one moment one is properly sideways — 25° off
       * the lever against the 10° it holds on the wheel, which is the whole
       * reason a hatch is driven on the pedals. What it must not do is HOLD
       * it, and nothing here is what stops it: the throttle is
       * (`drift.powerSpan` gives this layout nothing and
       * `grip.pullStraight` takes the angle away). Big transient, no
       * sustain — the shape a front-driver actually has.
       *
       * A ceiling still has to EXIST, just under the rear-driver's. Lifted
       * to the reference like every other layout — which is what this did
       * before it was a number — the hatch on the lever was the most
       * sideways car in the roster, because the layout with the least of
       * its own got the biggest lift out of the same move. */
      cap: 0.92,
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
      /** ...and the ceiling, which for the reference layout is the
       * reference: THE deepest slide in the game is a rear-driver's, on
       * the throttle, and every other number in this group is a fraction
       * of it. A move buys this car nothing it does not already have —
       * what it buys is the ROTATION to get there (`grip.flickYaw` and
       * friends), which is a different question. */
      cap: 1,
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
      /** ...and the ceiling, a shade under the saloon's and a shade over
       * the hatch's — which is the whole roster in one line. Provoked, all
       * three go round: real layouts differ far less in the angle they can
       * be GOT to than in what holds them there, and holding them there is
       * the throttle's job (`drift.powerSpan`). What this car does not do
       * is need it: four driven wheels are what makes it quick, and what
       * makes it quick is that it does not have to be sideways. */
      cap: 0.96,
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
     * the ceiling on the whole game's drift and not an average of it.
     *
     * HALF what it was, and the halving is the whole scale: the deepest
     * slide in the game is the rear-driver's, and every layout under it is
     * a fraction of THIS number and of `drivetrain[].cap` beside it. The
     * roster used to spread 0.42 / 0.75 / 1 of a span twice this size and
     * then hand all three the same ceiling the moment a move was made, so
     * the hatch on the lever was as sideways as the saloon on the throttle
     * and there was nothing to choose between the cars but which one
     * gathered itself up afterwards. The span halves and the ceilings
     * separate, in one change: they are the same statement made twice.
     *
     * The layouts then sit at 30 / 40 / 50 of what the old rear-driver held
     * — 10° / 13.5° / 18° at full lock on gravel — and that is a TIGHT
     * spread on purpose. Real layouts do not differ two to one in how far
     * sideways they can be got; what separates them is whether the THROTTLE
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
     * number into the springs that the next step cannot take back. */
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
     * on gravel (`surfaceGripFor`). */
    drag: { gravel: 0.028, sand: 0.042, asphalt: 0.022, water: 0.5, nature: 0.032 },
    /** Lateral grip multiplier per surface. Asphalt is the outlier the
     * stage's paved sections are FOR: the tires hold a third again as
     * much, so the corner that needed a slide on gravel can be driven
     * round, the line tightens, and a drift there has to be asked for —
     * committed entry, handbrake, or plain too much speed. It is still a
     * rally car on a country road: ask hard enough and it goes sideways,
     * just on smoking rubber instead of flying gravel. */
    grip: { gravel: 1.0, sand: 0.8, asphalt: 1.35, water: 0.55, nature: 0.7 },
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
    breakaway: { gravel: 1.0, sand: 1.2, asphalt: 0.62, water: 1.2, nature: 1.1 },
    /** Throttle effectiveness per surface. */
    power: { gravel: 1.0, sand: 0.88, asphalt: 1.08, water: 0.7, nature: 0.8 },
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
    give: { gravel: 0.06, sand: 0.35, asphalt: 0, water: 0.5, nature: 0.25 },
    /** ...AND WHAT IT COSTS TO PLOUGH IT. A sill or a roof rail digging into
     * loose ground is dragging a furrow, and that is friction over and above
     * the shell's own coefficient (`air.roll.faceGrip`): added to the
     * Coulomb budget for whatever of the patch is SHELL rather than tyre,
     * because a tyre rolls over what a panel ploughs. Accident
     * reconstruction has a rollover on soil stopping harder than one on
     * pavement, and this is that difference. Small against the face's
     * own 0.4–0.6, because it is a furrow and not an anchor. */
    plough: { gravel: 0.03, sand: 0.14, asphalt: 0, water: 0, nature: 0.07 },
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
      /** The mirrors are the widest thing on the car and hang off the
       * pillars the same fold takes, so they go with the glass. */
      roofMirror: 0.04,
      /** ...inside the cage's own stroke (`structure.roofMax`): a bolt the
       * roof can never fold far enough to reach is a lid that never comes
       * off a rolled car. */
      roofLid: 0.12,
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
     * little over the placement bar (`SOLID_PROP_HEIGHT`, 0.5 m — the
     * field stands up anything taller than that), so the SHORTEST solids
     * the field places are mounted rather than hit: the bottom of the nose
     * is soft, and a stone the height of a wheel is a bump in the ride and
     * not the end of the run. Held under the lowest hood by
     * tests/car_geometry_test.ts, because past the hood the body plainly
     * meets it. */
    rideOver: 0.6,
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
