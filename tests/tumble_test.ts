// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The tumbler every loose thing falls through (pwa/src/game/tumble.ts): a
// torn-off panel, a cone, a snapped bole. The one thing the eye checks is
// that it ENDS ON THE GROUND — a piece left hanging in the air reads as
// broken from across the stage — so that is what is held here: whatever a
// body's origin, it sleeps exactly on the floor under it, and a plate
// sleeps on its face rather than planted on an edge. three.js's Object3D
// is arithmetic and no DOM, so the root suite can run it.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { stepTumble, tumbleFrom } from "../pwa/src/game/tumble.ts";

const DT = 1 / 60;
/** Longer than any bounce sequence lasts. */
const PATIENCE = 20;

function settle(body: ReturnType<typeof tumbleFrom>, ground: (x: number, z: number) => number) {
  let steps = 0;
  while (stepTumble(body, DT, ground)) {
    steps++;
    if (steps > PATIENCE / DT) throw new Error("never came to rest");
  }
  return steps * DT;
}

describe("a loose body", () => {
  it("comes to rest exactly on the ground under wherever it got to", () => {
    const ground = (x: number, z: number): number => 3 + 0.2 * x - 0.1 * z;
    for (const [vx, vy, vz] of [
      [2, 4, 1],
      [-6, 1, 3],
      [0, 8, 0],
      [4, -2, -5],
    ]) {
      const object = new THREE.Object3D();
      object.position.set(1, ground(1, -2) + 1.2, -2);
      const rest = 0.07;
      const body = tumbleFrom(
        object,
        new THREE.Vector3(vx, vy, vz),
        new THREE.Vector3(3, 5, -2),
        rest,
      );
      settle(body, ground);
      expect(body.asleep).toBe(true);
      const p = object.position;
      expect(p.y).toBeCloseTo(ground(p.x, p.z) + rest, 6);
      expect(body.vel.length()).toBe(0);
    }
  });

  it("lays a plate on its face, whichever way it was thrown", () => {
    const ground = (): number => 0;
    for (const flat of ["x", "y", "z"] as const) {
      const object = new THREE.Object3D();
      object.position.set(0, 1.5, 0);
      object.rotation.set(1.1, 0.7, 2.3);
      const body = tumbleFrom(
        object,
        new THREE.Vector3(3, 2, -1),
        new THREE.Vector3(-8, 6, 9),
        0.01,
        false,
        flat,
      );
      settle(body, ground);
      const axis = new THREE.Vector3(
        flat === "x" ? 1 : 0,
        flat === "y" ? 1 : 0,
        flat === "z" ? 1 : 0,
      ).applyQuaternion(object.quaternion);
      expect(Math.abs(axis.y)).toBeCloseTo(1, 4);
      expect(object.position.y).toBeCloseTo(0.01, 6);
    }
  });

  it("lays a long body flat, keeping the bearing it fell along", () => {
    const ground = (): number => 0;
    const object = new THREE.Object3D();
    object.position.set(0, 2, 0);
    object.rotation.set(0.3, 0.4, 0.2);
    const body = tumbleFrom(
      object,
      new THREE.Vector3(1, 0, 2),
      new THREE.Vector3(2, 0, 1),
      0.3,
      true,
    );
    settle(body, ground);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion);
    expect(Math.abs(up.y)).toBeLessThan(1e-4);
  });
});
