// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CAR AGAINST CAR — the one contact in the game where nothing is anchored
// and both ledgers are written at once. A rally stage is driven alone, but
// the field leaves the control ten seconds apart, so catching the crew in
// front is a thing that happens: from there they are a solid that is going
// somewhere, and hitting one costs both of you.
//
// The car is a CAPSULE here rather than the box the wild's solids meet, so
// the tests below care about two things a box would get wrong: a normal
// that stays continuous as one car slides down another's flank, and an
// exchange that conserves momentum instead of inventing it.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  collideCars,
  compileTrack,
  createGame,
  step,
  type ContactSide,
  type GameEvent,
  type GameState,
} from "@engine";

const LONG_STRAIGHT = [{ kind: "straight", length: 4000, feature: "none" } as const];

function freshState(carId?: string): GameState {
  return createGame({
    seed: 3,
    carId,
    skipCountdown: true,
    quiet: true,
    track: compileTrack(3, LONG_STRAIGHT),
  });
}

/** Both sides of a contact, with somewhere for each one's damage to land. */
function pair(aCar?: string, bCar?: string): { a: ContactSide; b: ContactSide } {
  const side = (state: GameState): ContactSide => ({
    spec: state.spec,
    car: state.car,
    events: [] as GameEvent[],
    stats: state.stats,
  });
  return { a: side(freshState(aCar)), b: side(freshState(bCar)) };
}

/** A car's velocity in the world, m/s — forward is (sin h, cos h) and the
 * right axis is (cos h, -sin h). */
function worldVel(side: ContactSide): { x: number; z: number } {
  const { u, w, heading } = side.car;
  return {
    x: u * Math.sin(heading) + w * Math.cos(heading),
    z: u * Math.cos(heading) - w * Math.sin(heading),
  };
}

/** Put `b` `gap` metres ahead of `a` along a's nose, pointing the same way,
 * and leave both level. */
function lineUp(a: ContactSide, b: ContactSide, gap: number): void {
  b.car.heading = a.car.heading;
  b.car.x = a.car.x + Math.sin(a.car.heading) * gap;
  b.car.z = a.car.z + Math.cos(a.car.heading) * gap;
  b.car.y = a.car.y;
}

describe("two cars meeting", () => {
  it("ignores each other with a car's length of road between them", () => {
    const { a, b } = pair();
    lineUp(a, b, 6);
    a.car.u = 30;
    collideCars(a, b);
    expect(a.car.u).toBe(30);
    expect(b.car.u).toBe(0);
    expect(a.events).toHaveLength(0);
  });

  it("a rear-ender shoves the car in front and slows the one behind", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.3);
    a.car.u = 26;
    collideCars(a, b);
    expect(a.car.u).toBeLessThan(26);
    expect(b.car.u).toBeGreaterThan(2);
  });

  it("conserves momentum through the exchange", () => {
    const { a, b } = pair("compact", "coupe");
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.3);
    a.car.u = 24;
    b.car.u = 8;
    const before = worldVel(a).z * a.spec.mass + worldVel(b).z * b.spec.mass;
    collideCars(a, b);
    const after = worldVel(a).z * a.spec.mass + worldVel(b).z * b.spec.mass;
    // Along the shared heading the pair is a closed system: the impulse is
    // equal and opposite, so whatever one loses the other takes.
    expect(after).toBeCloseTo(before, 4);
  });

  it("costs the heavy car less of its speed than the light one", () => {
    const heavy = pair("coupe", "compact");
    const light = pair("compact", "compact");
    for (const { a, b } of [heavy, light]) {
      lineUp(a, b, TUNING.collision.halfLength * 2 - 0.3);
      a.car.u = 25;
      collideCars(a, b);
    }
    expect(25 - heavy.a.car.u).toBeLessThan(25 - light.a.car.u);
  });

  it("pushes them out of each other rather than leaving them overlapped", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.5);
    a.car.u = 20;
    const apart = (): number => Math.hypot(b.car.x - a.car.x, b.car.z - a.car.z);
    const before = apart();
    collideCars(a, b);
    expect(apart()).toBeGreaterThan(before);
  });

  it("folds panels on BOTH cars, nose on one and tail on the other", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.4);
    a.car.u = 28;
    collideCars(a, b);
    // Zone 0 is the nose, zone 4 the tail (state.ts's DAMAGE_ZONES ring).
    expect(a.car.damage.zones[0]).toBeGreaterThan(0);
    expect(b.car.damage.zones[4]).toBeGreaterThan(0);
    expect(a.events.some((e) => e.type === "impact")).toBe(true);
    expect(b.events.some((e) => e.type === "impact")).toBe(true);
  });

  it("leaves a gentle nudge as a nudge — no crush, no event", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.3);
    // Under the scuff floor the contact still separates them, but nothing
    // is damaged: rolling up behind somebody is not an accident.
    a.car.u = TUNING.collision.scuffSpeed - 0.5;
    collideCars(a, b);
    expect(a.car.damage.wear).toBe(0);
    expect(b.car.damage.wear).toBe(0);
    expect(a.events).toHaveLength(0);
    expect(b.events).toHaveLength(0);
  });

  it("puts a car ROUND when the hit lands off its centre", () => {
    const { a, b } = pair();
    // A tap on the back corner: alongside and a little behind, closing on
    // the flank rather than on the tail.
    b.car.heading = a.car.heading;
    const right = { x: Math.cos(a.car.heading), z: -Math.sin(a.car.heading) };
    b.car.x = a.car.x + right.x * 1.4 + Math.sin(a.car.heading) * 1.6;
    b.car.z = a.car.z + right.z * 1.4 + Math.cos(a.car.heading) * 1.6;
    b.car.y = a.car.y;
    a.car.u = 30;
    a.car.w = 6;
    collideCars(a, b);
    expect(Math.abs(b.car.yawRate)).toBeGreaterThan(0.05);
  });

  it("never reaches a car that is flying over the top of it", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength);
    b.car.y = a.car.y + TUNING.collision.cars.reach + 0.2;
    a.car.u = 30;
    collideCars(a, b);
    expect(a.car.u).toBe(30);
    expect(b.car.u).toBe(0);
  });

  it("does nothing to a pair already separating", () => {
    const { a, b } = pair();
    lineUp(a, b, TUNING.collision.halfLength);
    b.car.u = 20;
    collideCars(a, b);
    expect(b.car.u).toBe(20);
    expect(a.car.u).toBe(0);
  });

  it("is a scrape, not a weld, down a flank at speed", () => {
    const { a, b } = pair();
    // Side by side, a hair inside each other, both travelling fast: the
    // pair must come apart still going, with the speed along the contact
    // largely intact.
    b.car.heading = a.car.heading;
    const right = { x: Math.cos(a.car.heading), z: -Math.sin(a.car.heading) };
    const overlap = TUNING.collision.halfWidth * 2 - 0.15;
    b.car.x = a.car.x + right.x * overlap;
    b.car.z = a.car.z + right.z * overlap;
    b.car.y = a.car.y;
    a.car.u = 34;
    a.car.w = 3;
    b.car.u = 32;
    collideCars(a, b);
    expect(a.car.u).toBeGreaterThan(30);
    expect(b.car.u).toBeGreaterThan(30);
  });

  it("holds a stationary field on one start line until it is stepped", () => {
    // Every rival in the field is built on the same grid sample, so a whole
    // field spawns inside itself. Nothing separates them because nothing is
    // closing: the contact only exists once somebody is going somewhere.
    const { a, b } = pair();
    b.car.x = a.car.x;
    b.car.z = a.car.z;
    b.car.heading = a.car.heading;
    collideCars(a, b);
    expect(a.car.x).toBe(b.car.x);
    expect(a.events).toHaveLength(0);
  });
});

describe("a contact inside a real run", () => {
  it("takes a driven car's speed and hands some of it to the one hit", () => {
    const behind = freshState();
    const ahead = freshState();
    const side = (state: GameState): ContactSide => ({
      spec: state.spec,
      car: state.car,
      events: [] as GameEvent[],
      stats: state.stats,
    });
    const a = side(behind);
    const b = side(ahead);
    // Four seconds of throttle to get the chasing car up to pace, with the
    // car in front parked a stage's width down the road, then walked back
    // onto its bumper.
    for (let i = 0; i < 480; i++) step(behind, { ...NEUTRAL_INPUT, throttle: 1 });
    const pace = behind.car.u;
    expect(pace).toBeGreaterThan(15);
    lineUp(a, b, TUNING.collision.halfLength * 2 - 0.2);
    collideCars(a, b);
    expect(behind.car.u).toBeLessThan(pace);
    expect(ahead.car.u).toBeGreaterThan(1);
    expect(behind.stats.impacts).toBe(1);
    expect(ahead.stats.impacts).toBe(1);
  });
});
