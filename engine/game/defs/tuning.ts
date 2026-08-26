// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Global handling tuning — the numbers that shape the FEEL, shared by every
// car (per-car numbers live in cars.ts). Grouped by the moments that matter:
// the drift (start, hold, exit), the jump (takeoff, airborne, landing), and
// the surfaces. Tweak here, verify with `npm run sim` and the drift/jump
// tests; the render layer never reads these directly.

export const TUNING = {
  /** Fixed physics timestep, seconds (120 Hz). */
  dt: 1 / 120,

  /** Countdown before control is handed over, seconds. */
  countdown: 3,

  drift: {
    /** Minimum forward speed for a drift to start, m/s. */
    minSpeed: 9,
    /** Handbrake sideways kick: lateral speed injected at drift start, m/s. */
    kick: 4.5,
    /** Yaw impulse at drift start in the steered direction, rad/s. */
    yawKick: 1.1,
    /** How strongly slip self-rotates the car while drifting, rad/s per rad. */
    slipYaw: 1.6,
    /** Counter-steer damping while drifting — the tug-of-war authority. */
    counterDamp: 2.4,
    /** Clean-exit boost cap, m/s. */
    boostCap: 6,
    /** Average slip a drift must hold for its exit to count as clean, rad. */
    cleanSlip: 0.22,
    /** Seconds a drift must last before the exit boost applies. */
    minDuration: 0.5,
  },

  air: {
    /** Gravity, m/s². */
    gravity: 9.8 * 1.6, // arcade gravity: floatier hangs read as slow-motion
    /** Vertical launch scale from the lip's ramp slope. */
    launchScale: 1.0,
    /** Steering yaw authority while airborne, rad/s — barely any. */
    yawAuthority: 0.35,
    /** Random turbulence torque while airborne, rad/s² — out of control. */
    turbulence: 1.4,
    /** Air drag on forward speed, 1/s — flight carries. */
    drag: 0.02,
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
