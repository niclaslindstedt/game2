// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the handling tuning (`tuning.ts`): WHAT THE DRIVER'S
// CONTROLS DO — the steering rack, the tyres' grip and how it loads, the
// engine's torque and its revs, the drivetrain that puts it down, and the
// gearbox and reverse that choose the ratio.

export const DRIVE_TUNING = {
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
    /** THE TOP OF A GEAR, as the share of the gear's ceiling the pull is
     * faded to nothing across (`engineAccel`, smoothstepped). It is the rev
     * limiter as the handling model sees it: torque does not vanish at the
     * top of a real gear, the limiter simply stops asking for more, and this
     * is how sharply that arrives.
     *
     * IT IS ALSO WHAT DECIDES A TOP GEAR'S TOP SPEED, and the reason it is
     * a knob rather than a constant. In every gear but the last the car
     * shifts out long before the fade matters. In the LAST one there is
     * nowhere to shift to, so the car settles where the fade meets the drag
     * — and the narrower this band, the steeper that wall and the less any
     * drag matters against it. Taken too narrow, a car with its bonnet, its
     * screens and both doors torn off tops out three per cent under a sound
     * one, because the thing holding it back is arithmetic rather than the
     * hole in the front of it. Wide enough and the last gear is a real
     * equilibrium against the air again.
     *
     * The floor under it is the SHIFT POINT: a car has to be able to reach
     * `gearbox.upAt` of a gear's ceiling to leave that gear, and the fade
     * is what stands in the way. Measured together, and re-measure them
     * together — a wider band wants a lower shift point, and the pair of
     * them decides every car's top speed.
     *
     * MEASURED, and this is where it came out. Widening it does make the
     * last gear a drag equilibrium again, and it costs more than it buys:
     * at 0.32 with the shift point dropped to 0.88 to match, every car
     * still walks its box up, and the roster tops out at 175 / 204 / 165
     * km/h against the 183 / 216 / 174 it reads here — a gear's worth of
     * top end given away across the board to make the air matter at the
     * very top of it. Wider again and gears start going unreachable on
     * gravel. So the top gear stays rev-limited, and what a hole in the
     * bodywork costs is a few per cent of the top end rather than the
     * gear-drop cliff it used to cost when the ladders were flat. */
    taper: 0.18,
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
    /** THE WHEELBASE the load transfer is measured over, m — the arm that
     * turns a grade into weight moving off one axle and onto the other
     * (`driveLoadOf`, with the car's own `centreHeight` as the height).
     *
     * One number for the roster rather than one per car, because the
     * roster has no room for a second: every body is within a few
     * centimetres of `collision.halfLength × 2` long
     * (`tests/car_geometry_test.ts` holds them there), and 2.5 m is the
     * wheelbase under a four-metre body. It is a RATIO with
     * `centreHeight` and nothing else reads it, so what matters is that
     * the pair comes out near the real 0.2: a tall car on a short
     * wheelbase pitches its weight about harder, and that is the whole
     * effect. */
    wheelbase: 2.5,
    /** ...and the least of the car a driven axle is ever credited with
     * carrying, 0..1. Physics says a wheel with nothing on it pulls
     * nothing, and physics is right — but a car whose traction has reached
     * zero is one the player cannot drive out of anything, and a cliff
     * that steep is a bug however true it is. It sits far below anything a
     * drivable grade reaches (a front-driver would need a grade over two
     * to find it), so it is a floor under the arithmetic rather than a
     * number the game plays against. */
    loadFloor: 0.12,
    /** HOW MUCH OF THE DRIVEN AXLE'S BUDGET A UNIT OF GRADE EATS
     * (`driveBiteOf`). Holding station on a grade `g` needs `g` of gravity
     * out of the tyres before the car moves at all, and the friction that
     * supplies it is the same friction the pedal wants — so 1 is the
     * physically natural figure and this is the calibration around it,
     * because the bite it is subtracted from is a hook-up number rather
     * than a coefficient in gs.
     *
     * It is the number that makes a four-wheel drive worth its transfer
     * case. Off a hill its bite is over 1 and clamped, so it loses nothing
     * and cannot be given less to lose; charge every layout for the grade
     * and what is left on a 25% sand climb is 1.01 against 0.53 and 0.43 —
     * the difference between driving up a dune and digging into it.
     *
     * HALF A GRADE RATHER THAN A WHOLE ONE, and the bar is an ordinary car
     * getting up an ordinary bank. The bite this is taken out of is a
     * hook-up number rather than a coefficient in gs, so a full grade
     * over-charges it: at 1 the front-driver cannot climb the 1-in-5 the
     * explore suite drives up — it scrabbles, trips the stuck-respawn and
     * is put back on the road, which is not a car with poor traction, it is
     * a car that has stopped working. Measured up that ramp, everything at
     * 0.7 and under climbs it; 0.5 leaves the margin, and the layouts still
     * separate 2.4 to 1 between four driven wheels and two. */
    climbCost: 0.5,
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
      /** Forward bite: THE DRIVELINE's share of how much torque reaches the
       * ground, ×the car's own `traction`, ×the load its driven wheels are
       * actually carrying (`driveLoadOf`), against the surface's grip.
       *
       * It is the driveline and no longer the whole story, because the
       * bigger half of the story is now derived rather than asserted: a
       * front-driver puts down what is standing on its nose, and this row
       * says only how well the shafts and the diff between the engine and
       * that nose hand it over. The two-wheel-drive layouts are alike here
       * — one axle, one diff, a short path — and what separates them is the
       * weight over the axle, which is the car's business. */
      bite: 1.5,
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
      /** Grip clawed back where the ground holds less than gravel,
       * ×the shortfall (`surfaceGripFor`). Nothing: one driven axle spends
       * one axle's worth of a friction budget, whatever the budget is. */
      slipGrip: 0,
      /** ...and BREAKAWAY clawed back on a sealed road, ×the shortfall
       * (`surfaceBreakawayFor`). Also nothing, and this is the half of the
       * roster's tarmac story the hatch is on the wrong side of: asked for
       * an angle on a surface that peaks a few degrees off straight, driven
       * front wheels wash the nose wide. It is the FASTEST car on tarmac —
       * the sealed-road rubber in the catalog is what buys that — and the
       * one that cannot play there. */
      sealedSlip: 0,
    },
    rwd: {
      // THE THROTTLE DEEPENS THE SLIDE, which is the whole reason to drive
      // this car — sized so it deepens it no faster than a driver can
      // answer. Past about 0.9 every corner exit arrives with the tail
      // already going, and a car nobody can hold a line in is not a playful
      // one, it is a car in the roster that nobody actually plays.
      powerYaw: 0.8,
      pullStraight: 0,
      pullIn: 0,
      liftYaw: 0.25,
      // Torque alone unsticks this axle and neither of the others: the tail
      // steps out at walking pace, which is the layout's signature. It is
      // large because it is measured THROUGH `depth` below — the product is
      // what the car does at 10 km/h, and `drivetrain_test` holds it there —
      // so the two move together and neither is readable alone.
      spin: 2.4,
      // Earliest in the roster, but only just. A rear-driver that starts
      // sliding well before either other car reaches its own limit spends
      // every ordinary corner in a state the other two only reach when
      // asked, which is a car being driven for it rather than by anybody.
      entry: 0.9,
      // THE DEEPEST IN THE ROSTER, and still a fraction of the reference:
      // `drift.angleSpan` is the slide every layout is quoted against and no
      // layout sits AT it. One that does has a saturation band that never
      // shuts, and a flick then puts 48° into this car against the hatch's
      // 29° in the same corner — a spread at which one car flies and the
      // other is a fight, which is two games rather than a roster of three
      // cars. Two thirds keeps the ordering — the saloon comes round where
      // the hatch washes wide — over a spread a driver can hold every end
      // of.
      depth: 0.7,
      /** ...and the ceiling, still the roster's highest and still barely
       * over its own `depth`: a move buys this car almost nothing it does
       * not already have, which is the shape a rear-driver has. What it
       * buys is the ROTATION to get there (`grip.flickYaw` and friends),
       * which is a different question. */
      cap: 0.95,
      // Between the hatch's and the four-wheel-drive's. Together these two
      // decide whether a slide the driver has stopped asking for is still
      // there at the next corner: much under 1 and this car carries one
      // through the next two corners on its own.
      release: 1.05,
      snap: 0.85,
      // The same short driveline as the front-driver's — one axle, one diff
      // — so the same number. That a rear-driver puts its power down worse
      // is not the shafts, it is that less of the car is sitting on the
      // wheels doing it (`driveLoadOf`), and on a CLIMB that reverses.
      bite: 1.5,
      // THE ONE EXCEPTION to the game's 70 km/h floor, and the reason it is
      // a per-layout number at all: a rear axle with torque under it steps
      // the tail out at walking pace, which is a real thing a rear-driver
      // does and neither of the others can. 0.06 of the floor is 1.2 m/s,
      // far enough below the ramp (`slideSpan`) that the slide is properly
      // open by 10 km/h rather than 1% open at it.
      driftFloor: 0.06,
      // LEAST OF THE THREE, because a flick is a weight throw landing on an
      // axle that is already loose and the two compound: the move has to
      // leave this car sideways without overtaking the driver on the way,
      // and it is made into every third corner. The `depth` above is the
      // other half of that sum — read them together.
      flick: 0.55,
      // Least of the three, and not because the brake does less to this car:
      // a rear axle already loose on the throttle has nothing left for a
      // trailed brake to unstick. The move is worth most to the layout that
      // has no other way of asking.
      brake: 0.5,
      /** Nothing to claw back on the loose: one driven axle, one axle's
       * share of a small budget, and this is the car that spins its wheels
       * off the line on anything soft. */
      slipGrip: 0,
      /** ...and MORE THAN HALF OF THE SEALED ROAD'S BREAKAWAY BACK, which is
       * this car's whole day out and the reason the roster now has three
       * grounds instead of one. A sealed road is where a driven rear axle
       * stops being a liability: there is real grip to pull against, the
       * tyres will spin up against it on demand, and the angle they supply
       * is the angle the surface itself refuses to give anybody else. So the
       * saloon on tarmac is about what the hatch is on gravel — a car that
       * answers the wheel with an angle it can hold — while the other two
       * layouts get a paved section's small, stingy drift and are quicker
       * round it for taking one.
       *
       * It costs nothing on the loose, where the shortfall is zero by
       * construction, so this is an identity that arrives with the surface
       * rather than a number added to the car everywhere. Written against
       * gravel rather than named at asphalt so a sealed surface added later
       * — and there are meant to be more — collects it without a second
       * statement of who is allowed to drift on what. */
      sealedSlip: 0.55,
    },
    awd: {
      // Between the two: the pedal opens the slide and does not hold it
      // there the way a driven rear does.
      powerYaw: 0.32,
      // Driven FRONT wheels are half of this layout, so half the hatch's
      // pull: it is what lets a four-wheel-drive be driven out of a mistake
      // on the throttle rather than leaving it nothing to do but wait.
      pullStraight: 0.5,
      pullIn: 0.6,
      liftYaw: 0.5,
      spin: 0.28,
      // Nearer the hatch than the saloon: a car that puts its torque down
      // whatever it is standing on holds on a while before it lets go.
      entry: 1.05,
      // Between the two, as everything about this car is: it slides when
      // asked and it is never the one hanging furthest out. Clear of the
      // hatch — with drive to the rear as well it steps out on the wheel
      // where the front-driver would only push — but clear by a stride, not
      // by half the roster's spread.
      depth: 0.62,
      /** ...and the ceiling, a shade under the saloon's and a shade over
       * the hatch's — which is the whole roster in one line. Provoked, all
       * three go round: real layouts differ far less in the angle they can
       * be GOT to than in what holds them there, and holding them there is
       * the throttle's job (`drift.powerSpan`). What this car does not do
       * is need it: four driven wheels are what makes it quick, and what
       * makes it quick is that it does not have to be sideways. */
      cap: 0.96,
      release: 1.2,
      snap: 1,
      // FOUR DRIVEN WHEELS PAY FOR THE PRIVILEGE. The load they carry is
      // the whole car — twice a two-wheel drive's, which is where the
      // advantage comes from — so this number is the transfer case, the
      // second prop shaft and the third differential taking their cut on
      // the way. Under the others on purpose: the layout is worth what it
      // is worth because of what is standing on it, not because its
      // driveline is any better.
      bite: 1.2,
      driftFloor: 1,
      flick: 0.7,
      brake: 0.8,
      /** THE WINTER ROAD IS THIS CAR'S, and this is what makes it so.
       * Splitting the torque four ways leaves each tyre spending half as
       * much of its friction budget on going forwards — worth almost nothing
       * where the budget is large, and worth a great deal on ice, packed
       * snow, a snowfield or standing water, where it has nearly run out.
       * Sized so the alpine stage is a genuine reason to pick this car (a
       * tenth more grip on ice, a twenty-fifth on a snow road) and the
       * gravel stage is untouched, because the shortfall it is read against
       * is zero there.
       *
       * It is read through `surfaceGripFor`, so the BOT plans corners around
       * it as well — a car whose advantage the driver of it cannot see is
       * not an advantage, it is a number. */
      slipGrip: 0.14,
      /** ...and nothing back on the sealed road. Four driven wheels have no
       * more idea how to hang a car out on tarmac than two driven front ones
       * do: the surface's own answer to being asked for an angle is to
       * refuse, and only a driven REAR argues with it. */
      sealedSlip: 0,
    },
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

  gearbox: {
    /** Auto shifts up at this fraction of the gear's top speed — about
     * 6000 rpm of a 6500 shift point, which is where a full-throttle box
     * takes the next gear.
     *
     * IT HAS TO SIT CLEAR OF WHERE THE TAPER BITES. A gear's pull is faded
     * to nothing at its own ceiling (`engineAccel`), so a car left to
     * settle in a gear stops a little short of that ceiling whatever the
     * engine is worth — and if the shift point is ABOVE where it stops,
     * the box never takes the gear at all and the car is capped, at a
     * speed nobody chose, by arithmetic rather than by drag. Every gear a
     * real ladder ends in is an overdrive the car cannot pull out, which
     * is exactly the case this lands on: at 0.94 both five-speeds settle
     * in fourth within a percent of their own shift point and stay there.
     */
    upAt: 0.92,
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
         * bottom of every gear — a ratio that carries the car further
         * multiplies the engine by exactly that much less — and by
         * `shiftCut` on every shift a driver now has to take themselves. */
        gearing: 1.06,
        /** ...and 5% of the engine handed back, with no converter slurring
         * the bottom of the gear away. Read AGAINST the gearing rather than
         * on top of it (`gearedSpec`): a gear stretched 6% multiplies the
         * engine 6% less, so what the driver actually holds is 1.05/1.06 of
         * the catalog's thrust at any speed. Deliberately the short side of
         * the gearing — the racing set has to cost something at the bottom
         * of the gear or it is not a choice. */
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
