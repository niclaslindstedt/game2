// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SLIDE'S OWN ALGEBRA — how far sideways the car is allowed to be, and
// what the rest of the game is told about it afterwards.
//
// There is no drift MODE anywhere in this game: a slide is a turn the tyres
// cannot pay for. What lives here is the pair of questions that framing
// leaves — the GATE (how much slide the drivetrain, the surface and the
// speed are opening right now, and how fast a slide already carried is let
// go of) and the READOUT (whether what the car is doing counts as a drift,
// for the dust, the HUD and the balance table). Neither is a decision the
// handling model branches on; the model is in `car.ts`, and the knobs are
// `TUNING.drift`.

import { clamp } from "../lib/math.ts";
import { TUNING } from "./defs/tuning.ts";
import type { CarState, RunStats } from "./state.ts";

const T = TUNING;
/** The drift group, which is nearly every line here. */
const D = TUNING.drift;

/** How sideways the car is, 0..1 — the one number the whole drift is made
 * of. The turn being ASKED for costs more lateral grip than the tires have,
 * and what was asked a moment ago has not fully let go yet, which is what
 * keeps a slide alive through the instant the wheel passes centre and makes
 * the transition between two corners one continuous motion.
 *
 * Demand is the turn the WHEEL commands — speed times the gripping steer
 * gain, plus whatever the driven axle is spinning up on its own — never the
 * yaw the car ended up with. That distinction is the whole
 * shape of the control. The slide feeds extra yaw authority (`driftYaw`)
 * back into the car, so a demand measured off the resulting yaw closes a
 * positive loop of gain `u · steer · driftYaw / (ceiling · entrySpread)`,
 * which is well above 1 at any real corner speed. Such a loop has no
 * equilibrium in the middle: every lock either stays gripped at a couple of
 * degrees or runs away to the same deep drift, a notch of wheel apart.
 * Commanded demand keeps the slide a monotone function of speed and lock,
 * so the angle moves WITH the wheel. Do not be tempted back to `car.yawRate`
 * here — it reads more physical and it costs the car its whole mid-range. */
export type SlideState = {
  /** What the WHEEL is asking for past the limit — the only thing allowed to
   * DEEPEN a slide, so that the angle answers to the driver. */
  asked: number;
  /** Whether the tires are sliding at all, held up by the angle the car is
   * already at — what grip, scrub, the dust and the readout run off. */
  sliding: number;
  /** How much of a slide this speed allows at all, 0..1 — the speed floor,
   * open above `slideFrom` and shut below it. Everything that puts the car
   * sideways rather than round the corner has to pass through it. */
  open: number;
};

/** The four numbers the DRIVETRAIN moves in the slide: where the floor under
 * it sits, where it starts once past that floor, HOW FAR it develops, and how
 * fast it lets go again (TUNING.drivetrain). */
export type SlideLimits = { floor: number; entryAt: number; depth: number; release: number };

export function slideFactor(car: CarState, demand: number, limits: SlideLimits): SlideState {
  // THE SPEED FLOOR comes first, because under it there is no slide to
  // shape. Read off GROUND speed — the number on the speedo — so the rule
  // the player is told is the rule the car obeys, and so a car already
  // sideways loses the angle as it slows into the floor rather than
  // carrying it down to a standstill. WHERE the floor sits is the
  // drivetrain's: a rear axle with torque under it steps the tail out at
  // walking pace, which is a real thing a rear-driver does and no
  // front-driver ever does.
  const gate = clamp((Math.hypot(car.u, car.w) - limits.floor) / D.slideSpan, 0, 1);
  const open = gate * gate * (3 - 2 * gate);
  // SMOOTHSTEP, not a clamped line: the ramp has to leave zero and reach one
  // with no corner in it. A linear clamp puts a kink in the car's response
  // exactly at the limit, and a kink is an event — the moment a player feels
  // the car "change into" a drift. Starting below the limit (`entryAt`) and
  // easing in means nothing happens AT the limit at all. Where that entry
  // sits is the DRIVETRAIN's too: a front-driver understeers past the limit
  // before it steps out, a rear-driver has gone before it gets there.
  // ...and HOW FAR it develops past that is the drivetrain's as well, because
  // the two are different questions and only the first one used to be asked.
  // Every layout ran up the same ramp once over its threshold, so a front
  // axle out of grip produced the same tail-out slide as a lit-up rear one —
  // and since the front-driver's rubber is what gives out first on the loose,
  // it ended up the slidiest car in the game on the surface it is supposed to
  // wash wide on. A front axle that runs out of grip GOES STRAIGHT ON: it
  // still crosses the threshold, it just never develops much of a slide.
  const t = clamp((demand - limits.entryAt) / D.entrySpread, 0, 1);
  const asked = t * t * (3 - 2 * t) * open * limits.depth;
  // A slide the wheel has stopped asking for lets go over a beat instead of
  // in a step: last step's slide decays, and the wheel can take it straight
  // back up. Holding it up on the ANGLE instead — which is the one thing a
  // sideways car always has — is a feedback loop: more angle is more slide,
  // more slide is less lateral grip, and the car inflates its own drift well
  // past anything the driver asked for.
  const released = car.slide - limits.release * T.dt;
  // The gate caps the CARRIED slide too: a drift that runs out of speed is
  // let go by the floor closing on it, on the floor's own ramp.
  return { asked, sliding: Math.min(open, Math.max(asked, released)), open };
}

/** WHAT THE REST OF THE GAME IS TOLD, once the step has settled. Nothing in
 * the model branches on any of it: it is what the dust, the HUD and the
 * balance table read off a car that happens to be sideways.
 *
 * `breakaway` is the surface's own idea of how far sideways is sideways —
 * what counts on a sealed road is a fraction of what counts on gravel, and
 * one absolute threshold made tarmac a surface that could not be drifted
 * rather than one that is drifted less. */
export function readDrift(
  car: CarState,
  sliding: number,
  breakaway: number,
  stats: RunStats,
  dt: number,
): void {
  car.slide = sliding;
  // In the surface's own units, like every other angle in this group: what
  // counts as sideways on a sealed road is a fraction of what counts as
  // sideways on gravel, and one absolute threshold made tarmac a surface
  // that could not be drifted rather than one that is drifted less.
  const angle = (car.drifting ? T.drift.exitSlip : T.drift.enterSlip) * breakaway;
  // A car has to be genuinely SLIDING to be drifting, not merely pointed a
  // few degrees off its own line: below the layout's speed floor the slide
  // is shut and a hard turn is understeer, which is not a drift and must not
  // light the dust, the HUD or the balance table's counter.
  const drifting = Math.abs(car.slip) > angle && sliding > 0;
  // THE CHAIN cools the whole time and is stepped once per drift STARTED,
  // which is the one place in the step that knows a drift began rather than
  // continued. Booking it off the count rather than off time spent sliding
  // is what keeps it out of the feedback loop this whole group is built to
  // avoid: nothing a deep drift does makes it deeper, and one long committed
  // slide leaves no more behind than one short one.
  car.chain = Math.max(0, car.chain - D.linkFade * dt);
  if (drifting) {
    if (!car.drifting) {
      stats.driftCount += 1;
      car.chain = Math.min(1, car.chain + D.linkStep);
    }
    stats.driftTime += dt;
    stats.driftScore += Math.abs(car.slip) * car.u * dt;
  }
  car.drifting = drifting;
}
