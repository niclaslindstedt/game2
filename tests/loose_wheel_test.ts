// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The wheel off the car (pwa/src/game/loose-wheel.ts), driven over a plane
// with no renderer: the beats the eye checks, asserted. It leaves rolling
// at the speed it left at and keeps most of it for seconds; it never goes
// through the ground; a bounce comes back up and the next one lower; a
// wheel on its face spins itself down and sleeps flat; a wheel left on its
// tread falls over; and a wheel meeting the car it came off, or a trunk,
// comes back off it. three.js's vectors are arithmetic and no DOM, so the
// root suite can run it.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TUNING, type CarState, type WildObstacle } from "@engine";

import {
  flatness,
  looseWheel,
  stepLooseWheel,
  throwWheel,
  type LooseWheel,
} from "../pwa/src/game/loose-wheel.ts";

const R = 0.315;
const HW = 0.115;
const DT = 1 / 60;
const flat = (): number => 0;

function wheelAt(
  x: number,
  y: number,
  z: number,
  vel: THREE.Vector3,
  spin: THREE.Vector3,
  quaternion?: THREE.Quaternion,
): LooseWheel {
  const object = new THREE.Object3D();
  object.position.set(x, y, z);
  if (quaternion) object.quaternion.copy(quaternion);
  return looseWheel(object, vel, spin, R, HW);
}

/** Run `seconds` of frames, calling `each` after every one. */
function run(
  w: LooseWheel,
  seconds: number,
  ground: (x: number, z: number) => number = flat,
  each?: () => void,
): void {
  for (let t = 0; t < seconds; t += DT) {
    stepLooseWheel(w, DT, ground, null);
    each?.();
  }
}

/** The axle stood on end: the wheel on its face. */
const ON_FACE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

function speed(w: LooseWheel): number {
  return Math.hypot(w.vel.x, w.vel.z);
}

describe("a loose wheel", () => {
  it("rolls on at the speed it left at, upright, and keeps most of it for seconds", () => {
    const u = 20;
    const w = wheelAt(0, R, 0, new THREE.Vector3(0, 0, u), new THREE.Vector3(u / R, 0, 0));
    let lowest = Infinity;
    run(w, 4, flat, () => {
      lowest = Math.min(lowest, w.object.position.y);
    });
    expect(w.asleep).toBe(false);
    expect(w.object.position.z).toBeGreaterThan(60);
    expect(speed(w)).toBeGreaterThan(u * 0.85);
    expect(speed(w)).toBeLessThan(u);
    expect(flatness(w)).toBeLessThan(0.2);
    expect(lowest).toBeGreaterThan(R - 0.01);
    // Rolling, not skidding: the tread's speed matches the road's.
    expect(Math.abs(w.spin.x) * R).toBeCloseTo(speed(w), 0);
  });

  it("never goes through the ground, on a slope and thrown hard", () => {
    const ground = (x: number, z: number): number => 2 + 0.25 * x - 0.15 * z;
    const w = wheelAt(
      1,
      ground(1, -2) + 2,
      -2,
      new THREE.Vector3(7, -9, 4),
      new THREE.Vector3(30, 12, -8),
    );
    const above = (): number => {
      const p = w.object.position;
      // The deepest the centre can honestly sit is a face's half-width
      // over the ground straight under it, less the slope's own lean.
      return p.y - ground(p.x, p.z);
    };
    run(w, 6, ground, () => expect(above()).toBeGreaterThan(HW - 0.08));
  });

  it("bounces on its tyre, lower each time, and comes to rest", () => {
    const w = wheelAt(0, 2.5, 0, new THREE.Vector3(), new THREE.Vector3());
    const peaks: number[] = [];
    let rising = false;
    let top = 0;
    run(w, 6, flat, () => {
      const y = w.object.position.y;
      if (w.vel.y > 0.05) {
        rising = true;
        top = Math.max(top, y);
      } else if (rising && w.vel.y < -0.05) {
        rising = false;
        peaks.push(top);
        top = 0;
      }
    });
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    expect(peaks[0]).toBeGreaterThan(R + 0.1);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeLessThan(peaks[i - 1]);
    expect(w.vel.length()).toBeLessThan(0.5);
  });

  it("dropped on its face and spinning, spins down fast and sleeps flat on the ground", () => {
    const w = wheelAt(0, 1, 0, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 25, 0), ON_FACE);
    let settled = Infinity;
    let t = 0;
    run(w, 8, flat, () => {
      t += DT;
      if (w.asleep && settled === Infinity) settled = t;
    });
    expect(w.asleep).toBe(true);
    expect(settled).toBeLessThan(5);
    expect(flatness(w)).toBeCloseTo(1, 5);
    expect(w.object.position.y).toBeCloseTo(HW, 6);
    expect(w.vel.length()).toBe(0);
  });

  it("left slow on its tread, falls over and sleeps flat", () => {
    const w = wheelAt(0, R, 0, new THREE.Vector3(0, 0, 0.4), new THREE.Vector3(0.4 / R, 0, 0));
    run(w, 12);
    expect(w.asleep).toBe(true);
    expect(flatness(w)).toBeCloseTo(1, 5);
    expect(w.object.position.y).toBeCloseTo(HW, 6);
  });

  it("settles far sooner on its face than it stops on its tread", () => {
    const rolling = wheelAt(0, R, 0, new THREE.Vector3(0, 0, 8), new THREE.Vector3(8 / R, 0, 0));
    const fallen = wheelAt(
      0,
      HW,
      0,
      new THREE.Vector3(0, 0, 8),
      new THREE.Vector3(0, 8 / R, 0),
      ON_FACE,
    );
    run(rolling, 3);
    run(fallen, 3);
    expect(speed(rolling)).toBeGreaterThan(6);
    expect(fallen.asleep).toBe(true);
  });

  it("leaves the car rolling the way the car was going, at the corner's own speed", () => {
    const car = {
      x: 0,
      y: 0,
      z: 0,
      heading: 0.7,
      u: 18,
      w: 0,
      vy: 0,
      yawRate: 0,
    } as CarState;
    const axle = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    const { vel, spin } = throwWheel(car, { fwd: 1.2, right: 0.74 }, axle, R, { out: 0, up: 0 });
    expect(vel.x).toBeCloseTo(Math.sin(car.heading) * car.u, 6);
    expect(vel.z).toBeCloseTo(Math.cos(car.heading) * car.u, 6);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
    const w = wheelAt(0, R, 0, vel, spin, q);
    run(w, 2);
    // Still doing the car's speed two seconds on: the spin it left with
    // was ROLLING spin, not a skid the tread had to burn off first.
    expect(speed(w)).toBeGreaterThan(car.u * 0.9);
    expect(flatness(w)).toBeLessThan(0.2);
  });

  it("comes back off the car it came off, once it has left the arch", () => {
    const car = {
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      u: 0,
      w: 0,
      vy: 0,
      yawRate: 0,
    } as CarState;
    // Born at the arch, inside the box: it is let out, not thrown out.
    const born = wheelAt(0.74, R, 1.2, new THREE.Vector3(2, 3, 0), new THREE.Vector3());
    stepLooseWheel(born, DT, flat, car);
    expect(born.free).toBe(false);
    expect(born.vel.x).toBeCloseTo(2, 3);
    // Outside and thrown at the flank: it bounces off it.
    const w = wheelAt(3, 0.7, 0, new THREE.Vector3(-8, 0, 0), new THREE.Vector3());
    w.free = true;
    let closest = Infinity;
    let away = -Infinity;
    for (let t = 0; t < 1; t += DT) {
      stepLooseWheel(w, DT, flat, car);
      closest = Math.min(closest, w.object.position.x);
      away = Math.max(away, w.vel.x);
    }
    expect(closest).toBeGreaterThanOrEqual(TUNING.collision.halfWidth + R - 1e-6);
    // Back off the flank at a fraction of what it arrived with — the shell
    // took the rest — and spun up by the hit.
    expect(away).toBeGreaterThan(1.5);
    expect(away).toBeLessThan(4);
    expect(w.spin.length() + away).toBeGreaterThan(0);
  });

  it("bounces off a trunk", () => {
    const trunk = {
      x: 0,
      z: 10,
      y: 0,
      kind: "tree",
      size: 1,
      spin: 0,
      radius: 0.3,
      height: 12,
      mass: 800,
      rooted: 1,
      snap: Infinity,
    } as WildObstacle;
    const standing = {
      treesNear: (x: number, z: number, r: number) =>
        Math.hypot(x - trunk.x, z - trunk.z) < r + trunk.radius ? [trunk] : [],
      obstaclesNear: () => [],
    };
    const w = wheelAt(0, R, 0, new THREE.Vector3(0, 0, 12), new THREE.Vector3(12 / R, 0, 0));
    let furthest = -Infinity;
    for (let t = 0; t < 2; t += DT) {
      stepLooseWheel(w, DT, flat, null, standing);
      furthest = Math.max(furthest, w.object.position.z);
    }
    expect(furthest).toBeLessThan(trunk.z - trunk.radius);
    expect(w.object.position.z).toBeLessThan(furthest);
  });
});
