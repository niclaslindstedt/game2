// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Global handling tuning — the numbers that shape the FEEL, shared by every
// car (per-car numbers live in cars.ts). Grouped by what they shape: the
// grip (which is also the drift — there is no separate drift model), the
// jump (takeoff, airborne, landing), and the surfaces. Tweak here, verify
// with `npm run sim` and the drift/jump tests; the render layer never reads
// these directly.

export const TUNING = {
  /** Fixed physics timestep, seconds (120 Hz). */
  dt: 1 / 120,

  /** Countdown before control is handed over, seconds. */
  countdown: 3,

  steering: {
    /** Below this speed the wheel's authority ramps in from zero — you
     * cannot pivot a parked car, m/s. Lower = livelier launches. */
    deadSpeed: 6,
    /** Speed that halves the wheel's authority at pace: the base gain is
     * steerRate / (1 + u / this), m/s. Higher = twitchier at speed,
     * lower = more straight-line stability. */
    fadeSpeed: 20,
    /** How much the slip's self-rotation acts with the wheel CENTRED,
     * 0..1, rising linearly to 1 at full lock. This is the "commitment"
     * that lets a held wheel sustain a slide, a centred wheel gather the
     * car up, and a full counter damp the catch into a clean exit. */
    commitmentFloor: 0.25,
    /** Slip angle over which the power oversteer's tail torque softens its
     * sign as the slip crosses centre, rad — the chatter guard that keeps
     * the drift's push from flip-flopping at tiny angles. */
    tailSoftSlip: 0.08,
  },

  grip: {
    /** The slide, 0..1, is how far past the tires' lateral limit the car is
     * being asked to turn: demand (u·yawRate) over the car's grip ceiling,
     * minus 1, divided by this range. Turn gently and it stays 0 — turn hard
     * at pace and it reaches 1, which is all "drifting" means here. */
    slideRange: 0.75,
    /** A slide that is already established stays alive on slip angle alone,
     * from this angle... */
    slideSlip: 0.12,
    /** ...up to this much more, so the car does not snap back to grip in the
     * instant the wheel passes centre. Radians. */
    slipRange: 0.3,
    /** Speed a sliding tire actually burns off, 1/s — scaled by sin²(slip),
     * so ordinary cornering costs nothing and even a big drift costs little.
     * This is the number that decides whether a drift is FELT as a brake. */
    scrub: 0.5,
    /** How strongly slip self-rotates the car while sliding, rad/s per rad. */
    slipYaw: 1.6,
    /** Slip angle where the forces that DEEPEN a slide begin to fade... */
    satAt: 0.3,
    /** ...and the range over which they fade to nothing, rad. Together these
     * park a breathed-throttle slide at a stable angle instead of spinning
     * the car. The fade is deliberately WIDE: a narrow band is a cliff that
     * parks every steer past a third of lock at the same angle — spread out,
     * the equilibrium moves with the wheel, so half lock is a shallower
     * drift than full lock and the angle is COMMANDED, not self-chosen. */
    satWidth: 0.45,
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
    /** ...and the yaw it adds toward the steered side, rad/s. The handbrake
     * unsticks the rear; it does not teleport the car sideways. */
    handbrakeYaw: 0.9,
    /** Extra lateral grip from lifting off mid-slide (weight transfer). */
    liftGrip: 0.6,
  },

  drift: {
    /** Slip angle at which the car READS as drifting — dust, HUD, stats.
     * Read off the ANGLE rather than the slide, because the angle is what a
     * player sees and because it moves smoothly: the slide tracks steering
     * input, which chatters, and a readout that chatters is a stuttering
     * dust plume and a meaningless drift count. Radians. */
    enterSlip: 0.18,
    /** ...and the angle it has to settle back under before that drift is
     * over. One corner is one drift, not thirty. */
    exitSlip: 0.09,
    /** Minimum forward speed for the readout, m/s. */
    minSpeed: 9,
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
     * wall of molasses at the verge. */
    drag: { gravel: 0.028, water: 0.5, nature: 0.032 },
    /** Lateral grip multiplier per surface. */
    grip: { gravel: 1.0, water: 0.55, nature: 0.7 },
    /** Throttle effectiveness per surface. */
    power: { gravel: 1.0, water: 0.7, nature: 0.8 },
    /** Rough ground caps pace where gearing cannot: above this speed the
     * nature surface pulls the car back hard (about 150 km/h) — a linear
     * per-surface drag would instead stall the box under its own upshift
     * thresholds. Grounded only: a flight keeps what it took off with. */
    natureTop: 42,
    /** How hard the wild claws back each m/s over that cap, 1/s. */
    natureOverDrag: 3,
  },

  boost: {
    /** The whole tank, seconds of burn. Spent is spent — it never refills,
     * not even on respawn; rationing it across the stage is the game. */
    capacity: 5,
    /** Extra forward acceleration while burning, m/s² — on top of engine
     * torque, unaffected by gearing or surface. */
    accel: 9,
    /** Boost pushes past gearing up to this factor of the car's final
     * gear top, m/m — the thrust fades to zero approaching that cap so the
     * top end stretches instead of breaking. */
    overrun: 1.12,
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
  },

  crash: {
    /** Water this much over the ground is deep — a grounded car in it (or
     * an airborne one dropping under the surface) has driven into a lake
     * or the sea: splash, crash, back to the track. Stream fords stay
     * shallower than this and just slow the car. */
    deepWater: 0.9,
  },

  collision: {
    /** The body's collision box in the ground plane, m — half-length along
     * the nose and half-width across it. One size fits both cars; the
     * visual bodies differ by centimetres, not classes. */
    halfLength: 1.9,
    halfWidth: 0.85,
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
     * no event — parking against a rock is not an accident, m/s. */
    scuffSpeed: 3,
    /** Panel crush per m/s of closing speed past the scuff floor, m. A
     * 30 m/s head-on folds the nose ~0.3 m in. */
    crushPerSpeed: 0.011,
    /** A zone's panels can only fold this far, m — past it the cage holds
     * and further hits only add wear. */
    zoneMax: 0.4,
    /** Structural wear per meter of crush dealt (wear reaching 1 is the
     * wreck). ~1.1 lets a car survive several hard hits, not a dozen. */
    wearPerCrush: 2.4,
    /** Wear the wreck respawn patches the car back to — rally service on
     * the spot: drivable, but half the car's life is spent. */
    repairTo: 0.5,
    /** Zone crush that tears each part off its bolts, m. Mirrors pop off
     * a brush; bumpers and the wing take a real hit. */
    partAt: { mirror: 0.04, bumper: 0.12, spoiler: 0.1 },
    /** Descent speed relative to the ground the suspension absorbs for
     * free, m/s — landing harder than this crushes the underside (or the
     * flank, on a car that came down on its side). Set just over what a
     * designed ramp jump comes down with, so the marks come from cliff
     * plunges and botched flights, not from every lip on the stage. */
    hardLandSpeed: 10,

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

      /** Fraction of engine power gone at engine damage 1. */
      powerLoss: 0.35,
      /** Fraction of steering authority gone at steering damage 1. */
      steerLoss: 0.35,
      /** Fraction of lateral grip gone at suspension damage 1. */
      gripLoss: 0.18,
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
    /** Throttle cut while a manual shift engages, seconds. */
    shiftCut: 0.15,
  },
} as const;
