// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE PLAYER FEELS IN THEIR HANDS — which moments of a run are worth a
// pulse of vibration, and how big each one is.
//
// The same shape as the audio surface and for the same reason: the engine
// emits `GameEvent`s and has no idea any of them are felt, so the whole
// opinion lives out here in one table a reader can check. `route.ts` is the
// sibling worth reading beside this one — an event that makes a big noise
// usually deserves a big pulse, and where the two disagree it is on purpose.
//
// WHAT DOES NOT RUMBLE, and why. A phone has one motor and no mixer: two
// pulses at once are one pulse, so every buzz spent on news is a buzz taken
// off the next crash. So this table carries BLOWS — the car hitting things,
// the ground arriving hard, the run's end — plus the gearbox and the drift,
// and nothing else. A split board, a lap, a system giving up: read and
// heard, never felt. `partBreak`, `solidBreak` and `spin` are left out for a
// sharper reason still: each rides on an `impact` or a `landing` in the SAME
// step, so rumbling them too would only double the pulse that is already on
// its way.
//
// DOM-free, so the whole table is testable without a device: the pulse goes
// to a sink the caller hands in (`haptics.ts` is the one that touches a
// motor), and the clock is the frame's own `dt`.

import type { CarState, GameEvent } from "@engine";

/** One pulse, as the two things a device might be able to express.
 *
 * `ms` is how long the buzz lasts and is the only axis the web's Vibration
 * API has — an Android motor is on or off, and duration is the whole of how
 * big a browser pulse can be. `strength` is 0..1 of the hardest thing the
 * game ever asks for, which a native haptic engine spends on its own
 * vocabulary (`native/src/rumble.ts` turns it into a style and a count).
 * Both are authored per event rather than derived from each other: a scuff
 * down a fence is long and weak, a shift is short and weak, and a tree at
 * ninety is long and hard. */
export type Rumble = { ms: number; strength: number };

/** The knobs behind the table below, in one place so "less of all of it" is
 * one edit rather than a sweep. */
export const RUMBLE = {
  /** The longest pulse in the game, ms — the crash that ends a run. Past
   * about a quarter of a second a phone buzz stops reading as an impact and
   * starts reading as a notification. */
  longest: 260,

  /** THE DRIFT, which is the one continuous thing on this surface. A slide
   * is not an event and never becomes one: it is read off the car every
   * frame, the same way the tyre bed reads it, and paid out as a short weak
   * pulse every `driftGapMs`. Slower than that and the hand feels ticks;
   * faster and the motor never settles, which is a buzz rather than scrub —
   * and a motor held on is also the fastest way to flatten a phone. */
  driftMs: 22,
  driftGapMs: 110,
  /** How much slide there has to be before it is felt at all, 0..1 of a
   * developed slide. Under this the car is turning, not drifting, and a
   * hand buzzing through every roundabout is a hand that stops noticing. */
  driftFloor: 0.25,
  /** …and the band the pulse grows over, floor to full slide. The deepest
   * slide in the game stays under the LIGHTEST contact there is, because the
   * ask is a texture under the palms rather than a blow: a drift that can
   * out-buzz clipping a branch is a drift that has stopped meaning
   * anything. */
  driftStrength: [0.15, 0.32] as const,

  /** The gearbox: the shortest pulse in the game, and the same size up or
   * down. A shift is a click in the drivetrain rather than a blow, and both
   * directions are the same click. */
  shiftMs: 18,
  shiftStrength: 0.25,
} as const;

/** Closing speeds that separate a brush from a hit from a wreck, m/s — the
 * same three rungs the sound is banded on (`route.ts`), because they are the
 * same three events. */
const HIT_SPEED = 7;
const CRUNCH_SPEED = 15;
/** The closing speed at which a contact is as big as it ever gets, m/s. */
const IMPACT_FULL = 28;

/** Take a value from `lo`..`hi` to 0..1. */
function ramp(value: number, lo: number, hi: number): number {
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

/** What one event is worth in the hands. Null means it is not felt.
 *
 * A rival's panel is not a special case: the field's contacts come back
 * through the same `impact` door the trees do (`rubRivals`), so hitting a
 * car and hitting a boulder are sized by the one thing that decides how bad
 * either was — how fast the two were closing. */
export function rumbleForEvent(event: GameEvent): Rumble | null {
  switch (event.type) {
    case "impact": {
      // A brush past a branch is a knock and nothing more; past the scuff
      // rungs the pulse grows to the longest and hardest thing here.
      if (event.speed < HIT_SPEED) return { ms: 45, strength: 0.35 };
      const big = ramp(event.speed, HIT_SPEED, IMPACT_FULL);
      const heavy = event.speed >= CRUNCH_SPEED;
      return { ms: 90 + 140 * big, strength: (heavy ? 0.75 : 0.6) + 0.25 * big };
    }

    // The ground arriving. A clean landing is the suspension doing its job
    // and is felt as nothing; a slam is the car hitting the world with its
    // whole underside, which is an impact by another name.
    case "landing": {
      if (event.clean) return null;
      const slam = ramp(Math.abs(event.slam), 3, 11);
      return { ms: 70 + 90 * slam, strength: 0.5 + 0.4 * slam };
    }

    // The car going over. Only the first flank is felt here — every side
    // that hits after it arrives as a `landing` of its own.
    case "rollover": {
      const hard = ramp(event.rate, 2.4, 10);
      return { ms: 180 + 60 * hard, strength: 0.85 + 0.15 * hard };
    }

    // The run, over. The one moment worth the whole of what the motor has.
    case "crash":
      return { ms: RUMBLE.longest, strength: 1 };

    // R26 — an anti-cut block ridden over. A slab is a jolt through the
    // wheels rather than a blow to the body, and it stays a jolt however
    // fast it was taken.
    case "kerbHit": {
      const hard = ramp(event.speed, 3, 14);
      return { ms: 30 + 30 * hard, strength: 0.3 + 0.25 * hard };
    }

    case "shift":
      return { ms: RUMBLE.shiftMs, strength: RUMBLE.shiftStrength };

    default:
      return null;
  }
}

/** What the SLIDE is worth right now, or null while the car is merely
 * turning. Read off the car every frame rather than off an event, because a
 * drift is a state the car is in and not a thing that happens to it. */
export function rumbleForDrift(car: Pick<CarState, "drifting" | "slide">): Rumble | null {
  if (!car.drifting) return null;
  const deep = ramp(car.slide, RUMBLE.driftFloor, 1);
  if (deep <= 0) return null;
  const [weak, full] = RUMBLE.driftStrength;
  return { ms: RUMBLE.driftMs, strength: weak + (full - weak) * deep };
}

/** The run's rumble: events in, pulses out, plus the drift underneath. */
export type RunRumble = {
  /** Translate one step's events into pulses. */
  events: (list: readonly GameEvent[]) => void;
  /** Advance the drift's pulse train; call once per rendered frame, and
   * only on the frames the player is actually driving — a frame that is not
   * fed is a frame that is not felt, which is what a menu over the top of a
   * held run should be. */
  frame: (car: Pick<CarState, "drifting" | "slide">, dt: number) => void;
};

/**
 * ONE MOTOR, SO ONE PULSE AT A TIME.
 *
 * A device has a single vibrator and no mixer: asking for a second pulse
 * while the first is still running does not layer them, it CUTS the first
 * one off and starts the new one. So the ledger below keeps what is
 * currently running and refuses anything weaker until it has finished —
 * without that, the drift's tick every tenth of a second would truncate
 * every crash it landed on top of, and the hardest moment in the game would
 * be the shortest buzz in it.
 *
 * The clock is the frame's own `dt` rather than a wall clock, which keeps
 * this module DOM-free and its behaviour exactly reproducible in a test.
 * Events arrive from inside the step loop, so several land on one frame's
 * reading of the clock: that is the same simultaneity the audio funnel
 * treats as one moment, and here the strongest of them wins outright.
 */
export function createRunRumble(shake: (pulse: Rumble) => void): RunRumble {
  let clock = 0;
  let busyUntil = 0;
  let busyStrength = 0;
  let nextDrift = 0;

  const fire = (pulse: Rumble): void => {
    if (clock < busyUntil && pulse.strength <= busyStrength) return;
    busyUntil = clock + pulse.ms / 1000;
    busyStrength = pulse.strength;
    shake(pulse);
  };

  return {
    events(list) {
      let biggest: Rumble | null = null;
      for (const event of list) {
        const pulse = rumbleForEvent(event);
        if (pulse && (!biggest || pulse.strength > biggest.strength)) biggest = pulse;
      }
      if (biggest) fire(biggest);
    },

    frame(car, dt) {
      clock += dt;
      if (clock < nextDrift) return;
      const pulse = rumbleForDrift(car);
      if (!pulse) return;
      nextDrift = clock + RUMBLE.driftGapMs / 1000;
      fire(pulse);
    },
  };
}
