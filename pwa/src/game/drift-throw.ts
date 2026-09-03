// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROOSTER TAIL IS MADE OF, as numbers — every knob the tail is
// tuned by, and the one piece of arithmetic that decides WHICH WHEELS throw
// the stones and how hard each one throws them.
//
// Separate from `drift-spray.ts`, which draws it, because this half touches
// neither three.js nor the DOM: which wheels throw is most of what the
// effect IS, and a screenshot of a thousand stones in the air cannot measure
// it — so the arithmetic lives where `tests/drift_spray_test.ts` can read it
// directly. The drawn half owns the pool, the spawning and the geometry.

import { type DriveLayout } from "@engine";

/** How long a stone is in the air, s, and how many the cloud keeps room
 * for. Here rather than beside the rest of the stones' matter in
 * `DRIFT_STONES` because the pool is DERIVED — it is `rate` times the most
 * `wheelThrow` can return times the longest life — and the three numbers
 * have to move together or the tail recycles a stone that has not landed.
 * `drift_spray_test.ts` holds them to each other.
 *
 * Sized over dry ground. Soaked ground throws nearly twice as many stones
 * (`WET_THROW` in dust.ts) and is deliberately not covered: sizing for it
 * would double the pool for a surface that is dark, slow and half spray
 * anyway. */
export const STONE_LIFE = { min: 0.7, max: 1.3 };
export const STONE_POOL = 8192;

/** Per-axle shares of the throw, 0..1 each, by drivetrain. */
export type AxleShare = { rear: number; front: number };

/**
 * THE KNOBS — every number the tail is made of.
 *
 * Angles are radians and speeds metres per second, like the rest of the
 * engine and the renderer. A knob's comment says what it buys, so a change
 * can be made for a reason rather than by feel alone.
 */
export const DRIFT_SPRAY = {
  /** HOW SIDEWAYS the car has to be before anything is thrown, and where
   * the throw is at full strength — both on `CarState.slide` (0 gripping,
   * 1 fully sliding). A ramp rather than a switch, so the tail thickens as
   * the angle develops instead of appearing whole; `from` sits above the
   * scrub an ordinary cornering tyre reads as, so a committed turn on grip
   * throws nothing. */
  slide: { from: 0.18, full: 0.7 },
  /** The tyre's own SIDEWAYS speed over the ground it needs, m/s (`|w|`) —
   * below `from` a scrubbing tyre is shoving stones about rather than
   * throwing them; at `to` it is excavating. Both the count and how hard
   * the stones leave ride on it, which is what makes a lazy slide a
   * trickle and a full-lock flick a wall. */
  scrub: { from: 1.5, to: 9 },
  /** Road speed on top of that, m/s: nothing under `from`, so a car being
   * turned round at walking pace does not spray, and full at `to`. */
  speed: { from: 5, to: 20 },
  /** STONES PER SECOND per unit of `wheelThrow` at full slide, full scrub
   * and full pace — the amount knob. A unit is one undriven leading wheel
   * on a fully loaded axle; a rear-driver held sideways on the power is
   * carrying about four of them across its four contact patches. Per
   * second, never per frame, and the fraction owed is carried between
   * frames, so the tail is the same tail at 20 fps as at 120. */
  rate: 760,
  /** The longest frame the rate is paid for, s — a tab back from the
   * background must not fire a second of stones into one point. */
  maxStep: 0.1,
  /** What the TRAILING wheel of an axle throws as a share of the leading
   * one — and it is not one number, it CLOSES as the car goes sideways.
   * Barely scrubbing, the two wheels of an axle are doing much the same
   * work and throw much the same amount (`grip`). Dragged hard across the
   * ground, the leading wheel — the one on the side the tail is going —
   * meets ground nothing has touched and bulldozes it, while the trailing
   * one is running in the furrow the leading one just dug and finds far
   * less left to throw (`sideways`). That gap IS the rooster tail: it is
   * what makes the stones leave from the OUTSIDE of the car rather than
   * from under the middle of it, and it is why the tail thickens on the
   * outside as the angle comes on. Ramped on the `scrub` fraction. Never
   * zero — a slide throws off both sides, just not equally. */
  trailing: { grip: 0.5, sideways: 0.1 },
  /** WHICH AXLE THROWS, by drivetrain: the rear's share and the front's,
   * 0..1 each. The rear axle throws on every layout — a sliding tail moves
   * sideways whatever is driving the car, and that motion alone is what
   * ploughs the stones out — so `rear` is high everywhere. `front` is what
   * the steered axle adds: on a rear-driver the fronts are counter-steered
   * into the travel and barely scrub, on a front-driver they are the ones
   * being spun, and all-wheel drive sits between. */
  axle: {
    rwd: { rear: 1, front: 0.2 },
    fwd: { rear: 0.75, front: 0.65 },
    awd: { rear: 1, front: 0.45 },
  } satisfies Record<DriveLayout, AxleShare>,
  /** THE DRIVEN WHEELS, which throw more than the ones that are merely
   * being dragged. A tyre with torque through it is digging DOWN into the
   * surface as well as being pushed across it, so it excavates where an
   * undriven one only ploughs — and that is why a rear-driver throws its
   * tail off the back and a front-driver off the nose.
   *
   * `base` is what a driven wheel adds before it has broken loose at all,
   * as a multiple of the plain sideways throw, and `gain` is what it adds
   * on top once it has — ramped from `from` to `lit` on how far the driven
   * wheels are outrunning the road (`CarState.wheelspin`, m/s). So a driven
   * wheel throws half as much again as an undriven one on a balanced
   * throttle, and nearly four times it with the power fully lit, which is
   * the difference between a drift on the power and one that is only being
   * steered. */
  spin: { from: 0.6, lit: 7, base: 0.5, gain: 2.2 },
  /** A spun car (`CarState.spun`) is dragging all four wheels sideways at
   * once, so its front axle throws as the rear does, whatever the layout. */
  spunFront: 1,
  /** HOW HARD the stones leave, as a multiple of the tyre's sideways speed
   * over the ground: a stone leaves the tread a little faster than the tyre
   * is moving, because the tread flicks it. `max` caps the flight, m/s —
   * past it a stone is a projectile leaving the frame. */
  fling: { gain: 1.15, max: 13 },
  /** …and the SPIN's own throw, m/s straight back in the car's frame at a
   * fully lit axle. A spinning tyre fires what it digs out of the arch
   * behind it; this is what leans a powered drift's tail backward where a
   * steered one's fans straight out to the side. */
  kick: 6,
  /** How much of the CAR's forward speed a stone keeps, 0..1. The stones
   * are left behind — they never had the car's speed, only the tyre's flick
   * — so it is low, and the tail streams away behind the car as it goes.
   * At 1 the stones would travel with the car; at 0 they would drop where
   * they were born and be gone under the camera. */
  wake: 0.3,
  /** THE ANGLE the stones leave the ground at, rad above the horizontal
   * (0.42 rad is about 24°), and how far each stone's own angle wanders
   * either side of it. Low and flat is a rally rooster tail — stones
   * skipping out across the road — and steep is a fountain; between them
   * `pitch` decides how high the tail stands and how long each stone is in
   * the air. */
  pitch: 0.42,
  pitchVary: 0.22,
  /** How wide the fan is, rad either side of the throw's own direction.
   * Narrow is a jet; wide is a sheet. The direction it is centred on is
   * the tyre's sideways travel leaned back by the wake and the kick. */
  fan: 0.38,
  /** The scatter of birth speeds on top of the aimed throw, m/s — the
   * grain-to-grain jitter that stops the fan reading as a drawn line. */
  scatter: 1.2,
  /** WHERE a stone is born, relative to the contact patch: `out` metres
   * toward the side the car is sliding (out from under the tyre's
   * shoulder, so they are not born inside the wheel) and `lift` metres
   * above the ground. */
  out: 0.35,
  lift: 0.1,
  /** WHAT THE STONES ARE COLOURED, against the dust the same ground gives:
   * `shade` is how much darker a stone is than the haze (a stone is the
   * road itself, lit from one side; the dust is lit from every side and
   * pale for it), and `grit` the share of the stones that are the pale
   * dust tone anyway — a tail is stones with grit through it, not one or
   * the other. */
  shade: 0.68,
  grit: 0.3,
};

/** A ramp from 0 at `from` to 1 at `to`, held at either end. */
export function ramp(x: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (x - from) / (to - from)));
}

/** One contact patch: which side of the car it is on (-1 left, 1 right) and
 * the axle it belongs to. WHERE it sits along the car is geometry the drawn
 * half owns; the throw only cares which of the four it is. */
export type Patch = { side: number; rear: boolean };

/** The four contact patches, in a fixed order so the weights can be a plain
 * array over it — and so the drawn half and the tests agree on which index
 * is which wheel. */
export const PATCHES: Patch[] = [
  { side: -1, rear: true },
  { side: 1, rear: true },
  { side: -1, rear: false },
  { side: 1, rear: false },
];

/** What the car is doing to its tyres, as the throw reads it. */
export type SprayThrow = {
  /** The side the car is sliding TOWARDS: -1 its left, 1 its right. The
   * two wheels on that side are the leading pair. */
  leading: number;
  /** How hard the tyres are being dragged across the ground, 0..1 — the
   * `scrub` ramp, and what the leading-to-trailing gap opens on. */
  dig: number;
  /** How far the driven wheels are outrunning the road, 0..1 — the `spin`
   * ramp. */
  lit: number;
  /** A spun car is dragging all four wheels sideways at once, so its front
   * axle throws as its rear does whatever the layout. */
  spun: boolean;
};

/**
 * HOW HARD EACH WHEEL THROWS, in `PATCHES` order, written into `out` and
 * summed as the return. The unit is the plain sideways throw of one
 * undriven leading wheel on a fully loaded axle — the unit `DRIFT_SPRAY.rate`
 * is written in.
 *
 * Three things multiply, and each answers a different question about the
 * wheel: which AXLE it sits on (`axle`, the drivetrain's word on which end
 * of the car is being dragged), which SIDE of that axle (`trailing`, which
 * is how the tail comes off the outside of the car and not out from under
 * it), and what the ENGINE is doing through it (`spin`, which is how the
 * driven wheels come to throw more than the rest).
 *
 * Pure, and exported, because WHICH WHEELS THROW is most of what this
 * effect is — and a screenshot of a thousand stones in the air cannot
 * measure it.
 */
export function wheelThrow(drive: DriveLayout, throwing: SprayThrow, out: Float64Array): number {
  const K = DRIFT_SPRAY;
  const share = K.axle[drive];
  const front = throwing.spun ? K.spunFront : share.front;
  const drivenRear = drive !== "fwd";
  const drivenFront = drive !== "rwd";
  const trailing = K.trailing.grip + (K.trailing.sideways - K.trailing.grip) * throwing.dig;
  let total = 0;
  for (let i = 0; i < PATCHES.length; i++) {
    const wheel = PATCHES[i] as Patch;
    const axle = wheel.rear ? share.rear : front;
    const side = wheel.side === throwing.leading ? 1 : trailing;
    const driven = wheel.rear ? drivenRear : drivenFront;
    const power = driven ? 1 + K.spin.base + throwing.lit * K.spin.gain : 1;
    const weight = axle * side * power;
    out[i] = weight;
    total += weight;
  }
  return total;
}
