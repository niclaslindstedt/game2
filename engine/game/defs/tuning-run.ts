// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the handling tuning (`tuning.ts`): THE RUN'S OWN CLOCK
// and the moments either side of the driving — the fixed timestep the whole
// engine steps on, the bot's decision rate beside it, the intro and the
// countdown, the mass start's grid, and what counts as standing still.

/** The clock the whole engine runs on — see `TUNING.physicsHz`. Named out
 * here so the timestep can be derived from it rather than restated. */
const PHYSICS_HZ = 120;

export const RUN_TUNING = {
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
} as const;
