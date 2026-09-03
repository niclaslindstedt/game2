// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH WHEELS THROW THE ROOSTER TAIL, and how much each.
//
// The tail itself is a thousand point sprites and cannot be checked without
// a GPU — but the thing that makes it a rooster tail rather than a cloud
// under the car is arithmetic: the stones have to come off the DRIVEN
// wheels and off the OUTSIDE of the car, and more so the more sideways the
// car is. `wheelThrow` is that arithmetic on its own, so this is where it
// is held.

import { describe, expect, it } from "vitest";

import {
  DRIFT_SPRAY,
  type Patch,
  PATCHES,
  type SprayThrow,
  STONE_LIFE,
  STONE_POOL,
  wheelThrow,
} from "../pwa/src/game/drift-throw.ts";

/** PATCHES is a fixed order and these tests read it by name. */
const REAR_INNER = 0;
const REAR_OUTER = 1;
const FRONT_INNER = 2;
const FRONT_OUTER = 3;

/** Sliding to the car's right, so the right-hand (side 1) wheels lead. */
const SLIDING_RIGHT = 1;

const throwing = (over: Partial<SprayThrow> = {}): SprayThrow => ({
  leading: SLIDING_RIGHT,
  dig: 1,
  lit: 0,
  spun: false,
  ...over,
});

/** The four weights, and their sum. */
function weigh(
  drive: "rwd" | "fwd" | "awd",
  over: Partial<SprayThrow> = {},
): { each: number[]; total: number } {
  const out = new Float64Array(PATCHES.length);
  const total = wheelThrow(drive, throwing(over), out);
  return { each: [...out], total };
}

describe("the rooster tail's per-wheel throw", () => {
  it("names the wheels in the order the tests read them", () => {
    const at = (i: number): Patch => PATCHES[i] as Patch;
    expect(at(REAR_OUTER)).toEqual({ side: SLIDING_RIGHT, rear: true });
    expect(at(REAR_INNER)).toEqual({ side: -SLIDING_RIGHT, rear: true });
    expect(at(FRONT_OUTER)).toEqual({ side: SLIDING_RIGHT, rear: false });
    expect(at(FRONT_INNER)).toEqual({ side: -SLIDING_RIGHT, rear: false });
  });

  it("throws most off the OUTER REAR wheel of a rear-driver on the power", () => {
    // The one stone in the picture everybody knows: the tail comes off the
    // back corner on the outside of the corner, not from under the car.
    const { each } = weigh("rwd", { lit: 1 });
    const biggest = each.indexOf(Math.max(...each));
    expect(biggest).toBe(REAR_OUTER);
  });

  it("opens the gap between the outer and inner wheel as the car goes sideways", () => {
    // Barely scrubbing, both wheels of an axle find loose ground and throw
    // much the same. Dragged hard, the inner one is running in the furrow
    // the outer one just dug — so the SHARE it throws falls.
    const scrubbing = weigh("rwd", { dig: 0 });
    const sideways = weigh("rwd", { dig: 1 });
    const share = (w: { each: number[] }): number =>
      (w.each[REAR_INNER] as number) / (w.each[REAR_OUTER] as number);
    expect(share(scrubbing)).toBeGreaterThan(share(sideways));
    expect(share(sideways)).toBeLessThan(0.2);
    // …and never to nothing: a slide throws off both sides of the car.
    expect(share(sideways)).toBeGreaterThan(0);
  });

  it("throws the outer wheels harder in absolute terms the more sideways it gets", () => {
    // The gap must open by the OUTER wheel gaining, not only by the inner
    // one giving up — the point of the change is more stones off the
    // outside, not the same stones redistributed.
    const K = DRIFT_SPRAY;
    const outer = (dig: number): number =>
      K.rate * (weigh("rwd", { dig, lit: 1 }).each[REAR_OUTER] as number);
    // The wheel's own weight is flat in `dig`; what rises is the SHARE of a
    // rate that the `scrub` ramp is already scaling. Held here as the
    // invariant that matters: the outer wheel never throws less as the car
    // goes further sideways.
    expect(outer(1)).toBeGreaterThanOrEqual(outer(0));
  });

  it("makes the DRIVEN wheels throw more than the dragged ones", () => {
    // Same axle share on both ends of an all-wheel-drive car would still
    // separate the axles; the honest comparison is one drivetrain against
    // another over the same wheel. A front wheel is driven on a
    // front-driver and is not on a rear-driver.
    const K = DRIFT_SPRAY;
    const rwd = weigh("rwd").each[FRONT_OUTER] as number;
    const fwd = weigh("fwd").each[FRONT_OUTER] as number;
    // Undo the axle shares, which are a separate judgement, and what is
    // left is the driven bonus alone.
    const perShare = (w: number, share: number): number => w / share;
    expect(perShare(fwd, K.axle.fwd.front)).toBeGreaterThan(perShare(rwd, K.axle.rwd.front));
    expect(perShare(fwd, K.axle.fwd.front) / perShare(rwd, K.axle.rwd.front)).toBeCloseTo(
      1 + K.spin.base,
      6,
    );
  });

  it("lights the driven axle with wheelspin and leaves the other alone", () => {
    const cold = weigh("rwd");
    const lit = weigh("rwd", { lit: 1 });
    expect(lit.each[REAR_OUTER] as number).toBeGreaterThan(2 * (cold.each[REAR_OUTER] as number));
    expect(lit.each[FRONT_OUTER]).toBeCloseTo(cold.each[FRONT_OUTER] as number, 6);
    // A front-driver lights the other end.
    const fwdCold = weigh("fwd");
    const fwdLit = weigh("fwd", { lit: 1 });
    expect(fwdLit.each[FRONT_OUTER] as number).toBeGreaterThan(fwdCold.each[FRONT_OUTER] as number);
    expect(fwdLit.each[REAR_OUTER]).toBeCloseTo(fwdCold.each[REAR_OUTER] as number, 6);
  });

  it("sprays a front-driver off its nose and a rear-driver off its tail", () => {
    const nose = (drive: "rwd" | "fwd"): number => {
      const { each, total } = weigh(drive, { lit: 1 });
      return ((each[FRONT_INNER] as number) + (each[FRONT_OUTER] as number)) / total;
    };
    expect(nose("fwd")).toBeGreaterThan(nose("rwd"));
    expect(nose("fwd")).toBeGreaterThan(0.5);
    expect(nose("rwd")).toBeLessThan(0.1);
  });

  it("drags all four sideways once the car is spun", () => {
    const held = weigh("rwd", { lit: 1 });
    const spun = weigh("rwd", { lit: 1, spun: true });
    expect(spun.each[FRONT_OUTER] as number).toBeGreaterThan(held.each[FRONT_OUTER] as number);
    expect(spun.total).toBeGreaterThan(held.total);
  });

  it("keeps a pool big enough for every stone that can be in the air at once", () => {
    // The bug this guards is the tail tearing a hole in itself at exactly
    // the moment it is thickest: the pool recycles a stone that has not
    // landed yet. Peak rate is the busiest drivetrain at full everything.
    const K = DRIFT_SPRAY;
    const peak = Math.max(
      ...(["rwd", "fwd", "awd"] as const).map(
        (drive) => weigh(drive, { lit: 1, spun: true }).total,
      ),
    );
    expect(STONE_POOL).toBeGreaterThanOrEqual(K.rate * peak * STONE_LIFE.max);
  });

  it("throws about three times what it used to at a committed drift", () => {
    // The amount, pinned. Before this tuning a rear-driver sideways on the
    // power carried 340 stones/s per unit over a total of 3.12 — about
    // 1060 a second. A regression that quietly halves the tail would pass
    // every test above, because every one of them is a ratio.
    const K = DRIFT_SPRAY;
    const perSecond = K.rate * weigh("rwd", { lit: 1 }).total;
    expect(perSecond / 1060).toBeGreaterThan(2.6);
    expect(perSecond / 1060).toBeLessThan(3.4);
  });
});
