// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROOSTER TAIL — the stones a sliding car throws SIDEWAYS, off the side
// it is sliding towards. It is a third substance beside the grit the wheel
// arches scatter (dust.ts, from the renderer's wheel logic) and the fine
// cloud the underside tows (plume.ts): those two come off the car in the
// direction it is travelling, and this one comes off it in the direction
// it is SLIDING, which on a car with any angle on it is a different
// direction, and is the whole of the picture a drift makes from outside.
//
// Two things throw it, and they add. A tyre being dragged sideways across
// loose ground bulldozes what is in front of it — so the leading wheels,
// the ones on the side the tail is going, plough a fan of stones out ahead
// of themselves, however the car is driven. And a DRIVEN wheel that is
// also outrunning the road is spinning on the same patch and firing what
// it digs out backward, so the axle the drivetrain lights up throws more,
// and throws it further back. Which axle that is comes off the car's own
// layout, so a front-driver held sideways sprays off its nose and a
// rear-driver off its tail.
//
// Every number is a knob, in `DRIFT_SPRAY`, with its unit beside it: the
// angle the stones leave at, how wide they fan, how hard they are flung,
// how many, and which wheels get to throw them.
//
// Presentation only: reads a live `GameState`, writes nothing back, and
// draws its jitter from `Math.random` — the sim never reads any of it.

import * as THREE from "three";

import { type DriveLayout, type GameState } from "@engine";

import { AXLE, createDust, type Dust, type DustStyle, type DustTint } from "./dust.ts";

/** THE STONES, as matter. Bigger than a grain of the grit the arches
 * scatter and heavier: a stone flung off a sliding tyre keeps its speed and
 * comes down hard rather than hanging. No `rise` of its own and almost no
 * `updraft` — the throw's elevation is `DRIFT_SPRAY.pitch`'s business, and a
 * style that lifted them as well would be a second, hidden angle knob.
 * Capped on screen: the tail streams stones past the chase camera all
 * corner long, and an uncapped sprite going by the lens is a square a hand
 * across for a frame. */
export const DRIFT_STONES: DustStyle = {
  size: 0.09,
  opacity: 1,
  rise: 0,
  gravity: 11,
  updraft: 0.25,
  pixelCap: 0.028,
  life: { min: 0.7, max: 1.3 },
  /** Four wheels at the top rate with the spin bonus on, for the longest
   * life a stone has — the pool has to hold every stone still in the air
   * or the tail tears a hole in itself at exactly the moment it is thickest. */
  pool: 1536,
};

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
  /** STONES PER SECOND off the leading rear wheel at full slide, full scrub
   * and full pace — the amount knob. Per second, never per frame, and the
   * fraction owed is carried between frames, so the tail is the same tail
   * at 20 fps as at 120. */
  rate: 340,
  /** The longest frame the rate is paid for, s — a tab back from the
   * background must not fire a second of stones into one point. */
  maxStep: 0.1,
  /** What the TRAILING wheel of an axle throws as a share of the leading
   * one. The leading side (the side the tail is going) carries the load and
   * ploughs; the other is light and only skips. Not zero — a slide throws
   * off both sides, just not equally. */
  trailing: 0.3,
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
  /** WHEELSPIN, on the driven axle only: how far the driven wheels are
   * outrunning the road (`CarState.wheelspin`, m/s) before the spin adds
   * anything, where it is fully lit, and what a lit axle adds — `gain` is
   * the extra as a multiple of the axle's plain sideways throw, so 1.2 is
   * more than twice the stones off a wheel the power has broken loose.
   * This is the difference between a drift on the power and one that is
   * merely being steered. */
  spin: { from: 1, lit: 8, gain: 1.2 },
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
function ramp(x: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (x - from) / (to - from)));
}

export type DriftSpray = {
  points: THREE.Points;
  /**
   * One frame: age the stones in the air, then throw this frame's share.
   * `fx` is the effects budget, `amount` how much the ground under the car
   * gives up as a share of a dry gravel road (0 for a sealed one, which
   * throws nothing, above 1 for a soaked one), and `color` what it is
   * coloured — read only once a stone is actually owed, so a car on grip
   * never pays for the terrain lookup behind it.
   */
  update: (
    state: GameState,
    dt: number,
    fx: number,
    amount: number,
    color: () => number | DustTint,
  ) => void;
  dispose: () => void;
};

/** One contact patch: metres along the car's own axis, which side (-1 left,
 * 1 right), and the axle it belongs to. */
type Wheel = { along: number; side: number; rear: boolean };

/** The four contact patches, in a fixed order so the weights below can be a
 * plain array over it. */
const WHEELS: Wheel[] = [
  { along: -AXLE.rear, side: -1, rear: true },
  { along: -AXLE.rear, side: 1, rear: true },
  { along: AXLE.front, side: -1, rear: false },
  { along: AXLE.front, side: 1, rear: false },
];

export function createDriftSpray(): DriftSpray {
  const cloud: Dust = createDust(DRIFT_STONES);
  /** Stones owed but not yet thrown — the fraction a frame's rate leaves. */
  let debt = 0;
  /** Per-wheel throw weights for the frame, cumulative, so a stone picks
   * its wheel with one random draw and no allocation. */
  const weights = new Float64Array(WHEELS.length);
  /** The frame's stone colour, rewritten in place: spawning runs many
   * times a second and a fresh object each time is garbage the collector
   * answers with a pause mid-corner. */
  const shade = new THREE.Color();
  const stones: DustTint = { base: 0, fleck: 0, fleckMix: 0 };

  const update = (
    state: GameState,
    dt: number,
    fx: number,
    amount: number,
    color: () => number | DustTint,
  ): void => {
    cloud.update(dt);
    const car = state.car;
    if (fx <= 0 || amount <= 0 || car.airborne) return;
    const K = DRIFT_SPRAY;
    // WHICH WAY THE TAIL IS GOING: `w` is the car's sideways speed along
    // its own right axis, so its sign is the side the stones come off and
    // its size is how hard the tyres are being dragged across the ground.
    const scrub = Math.abs(car.w);
    const slide = ramp(car.slide, K.slide.from, K.slide.full);
    const dig = ramp(scrub, K.scrub.from, K.scrub.to);
    const pace = ramp(Math.abs(car.u), K.speed.from, K.speed.to);
    const strength = slide * dig * pace;
    if (strength <= 0) {
      debt = 0;
      return;
    }

    // Which wheels, and how much each. The drivetrain's axle shares, the
    // leading side over the trailing one, and the spin bonus on whichever
    // axle the engine is turning.
    const share = K.axle[state.spec.drive];
    const front = car.spun ? K.spunFront : share.front;
    const lit = ramp(car.wheelspin, K.spin.from, K.spin.lit);
    const drivenRear = state.spec.drive !== "fwd";
    const drivenFront = state.spec.drive !== "rwd";
    const leading = Math.sign(car.w || 1);
    let total = 0;
    for (let i = 0; i < WHEELS.length; i++) {
      const wheel = WHEELS[i] as Wheel;
      const axle = wheel.rear ? share.rear : front;
      const side = wheel.side === leading ? 1 : K.trailing;
      const driven = wheel.rear ? drivenRear : drivenFront;
      const spin = driven ? 1 + lit * K.spin.gain : 1;
      total += axle * side * spin;
      weights[i] = total;
    }
    if (total <= 0) return;

    debt += K.rate * strength * total * amount * fx * Math.min(dt, K.maxStep);
    const count = Math.floor(debt);
    debt -= count;
    if (count <= 0) return;

    const fwdX = Math.sin(car.heading);
    const fwdZ = Math.cos(car.heading);
    const rightX = Math.cos(car.heading);
    const rightZ = -Math.sin(car.heading);
    // THE THROW, in the car's frame. Sideways: the tyre's own scrub, flicked
    // a little harder than the tyre moves and capped. Along: the share of
    // the car's speed a stone keeps, LESS the kick a lit axle fires it
    // backward with — so the tail leans back on the power and fans straight
    // out off a slide that is only being steered.
    const flung = Math.min(K.fling.max, scrub * K.fling.gain) * leading;
    const carry = car.u * K.wake;
    // The ground's own tint, darkened into stone, with the ground's pale
    // grit left through it grain by grain. A two-tone ground (turf over
    // earth, wet clods) keeps its fleck and only darkens its body.
    const ground = color();
    const body = typeof ground === "number" ? ground : ground.base;
    stones.base = shade.set(body).multiplyScalar(K.shade).getHex();
    stones.fleck = typeof ground === "number" ? ground : ground.fleck;
    stones.fleckMix = typeof ground === "number" ? K.grit : ground.fleckMix;
    for (let n = 0; n < count; n++) {
      // Pick the wheel by weight — one draw against the cumulative table.
      const pick = Math.random() * total;
      let i = 0;
      while (i < WHEELS.length - 1 && (weights[i] as number) < pick) i++;
      const wheel = WHEELS[i] as Wheel;
      const driven = wheel.rear ? drivenRear : drivenFront;
      const back = driven ? K.kick * lit : 0;
      // Horizontal throw in the car's frame, then fanned about its own
      // direction by a random angle either side.
      const along = carry - back;
      const across = flung;
      const turn = (Math.random() * 2 - 1) * K.fan;
      const cosT = Math.cos(turn);
      const sinT = Math.sin(turn);
      const tAlong = along * cosT - across * sinT;
      const tAcross = along * sinT + across * cosT;
      // Elevation off the flung speed (what the tread put into the stone),
      // not off the carry: a stone keeping pace with the car is not being
      // thrown UP by anything.
      const pitch = K.pitch + (Math.random() * 2 - 1) * K.pitchVary;
      const up = (Math.abs(flung) + back) * Math.tan(Math.max(0.05, pitch));
      const sx = car.x + fwdX * wheel.along + rightX * (wheel.side * AXLE.side + leading * K.out);
      const sz = car.z + fwdZ * wheel.along + rightZ * (wheel.side * AXLE.side + leading * K.out);
      cloud.spawn(
        sx,
        car.y + AXLE.height + K.lift,
        sz,
        stones,
        1,
        K.scatter,
        fwdX * tAlong + rightX * tAcross,
        fwdZ * tAlong + rightZ * tAcross,
        up,
      );
    }
  };

  return { points: cloud.points, update, dispose: cloud.dispose };
}
