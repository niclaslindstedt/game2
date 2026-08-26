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
    satAt: 0.46,
    /** ...and the range over which they fade to nothing, rad. Together these
     * park a held slide at a stable angle instead of spinning the car. */
    satWidth: 0.2,
    /** Yaw response rate while gripping and while fully sliding, 1/s. */
    yawResponse: { grip: 8, slide: 6.4 },
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
    /** Landing slip beyond this scrubs speed and wobbles the car, rad. */
    cleanSlipLimit: 0.24,
    /** Speed kept on a clean landing vs a sloppy one (fractions). */
    cleanKeep: 1.0,
    sloppyKeep: 0.78,
    /** Yaw wobble injected by a sloppy landing, rad/s. */
    sloppyWobble: 1.6,
  },

  surfaces: {
    /** Longitudinal drag per surface, 1/s. */
    drag: { gravel: 0.035, water: 0.5, grass: 0.9 },
    /** Lateral grip multiplier per surface. */
    grip: { gravel: 1.0, water: 0.55, grass: 0.5 },
    /** Throttle effectiveness per surface. */
    power: { gravel: 1.0, water: 0.7, grass: 0.55 },
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
     * rise never stalls the run. */
    gravityAlong: 0.6,
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
    /** Lateral overhang past the road edge that still counts as verge, m. */
    verge: 1.5,
    /** Offset beyond which the car is lost and gets respawned, m. */
    lostOffset: 16,
    /** Seconds off the road before an automatic respawn. */
    lostAfter: 2.5,
    /** Respawn forward speed, m/s. */
    respawnSpeed: 6,
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
