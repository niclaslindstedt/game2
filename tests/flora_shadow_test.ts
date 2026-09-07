// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FOREST THE SHADOW MAP SEES (pwa/src/game/flora-shadow.ts).
//
// The pool exists for one reason: a chunk's flora mesh spans the whole stage,
// so it can never be culled out of the shadow pass, and flagging it would put
// every tree on a five-kilometre stage into the depth map on every frame.
// What has to be true of the replacement is therefore a COST claim, and a
// cost claim is exactly what a screenshot cannot check:
//
//   - it never carries more than the cap, however dense the stage;
//   - it carries the plants that are actually near, and not the rest;
//   - it does not do that work again until the focus has really moved;
//   - it is off, and free, below the top LIGHTING stop.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createFloraShadows, type FloraCasterSource } from "../pwa/src/game/flora-shadow.ts";

/** `n` TREES in a line running away down +z, one every `step` metres —
 * tall enough to be worth casting from (see the undergrowth case below). */
function row(n: number, step = 5, height = 4): FloraCasterSource {
  return {
    geometry: new THREE.BoxGeometry(1, height, 1),
    material: new THREE.MeshLambertMaterial(),
    list: Array.from({ length: n }, (_, i) => ({
      x: 0,
      y: 0,
      z: i * step,
      scale: 1,
      spin: 0,
    })),
  };
}

const meshesIn = (group: THREE.Object3D): THREE.InstancedMesh[] =>
  group.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);

describe("the flora the shadow map is allowed to see", () => {
  it("never carries more than the cap, however many plants are in range", () => {
    const pool = createFloraShadows();
    // A thousand plants packed a metre apart: every one of them is inside the
    // reach, so nothing but the cap can hold the count down.
    pool.setSources([row(1000, 1)]);
    pool.setEnabled(true);
    pool.follow(new THREE.Vector3(0, 0, 0), 40);
    const [mesh] = meshesIn(pool.group);
    expect(mesh.count).toBeGreaterThan(0);
    expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
    // ...and the buffer itself is capped, so the cost is bounded at BUILD
    // time rather than by whatever the fill happens to find.
    expect(mesh.instanceMatrix.count).toBeLessThan(1000);
    pool.dispose();
  });

  it("takes the plants in range and leaves the rest of the stage alone", () => {
    const pool = createFloraShadows();
    // Five hundred metres of trees, five metres apart, and a focus at one end.
    pool.setSources([row(100, 5)]);
    pool.setEnabled(true);
    pool.follow(new THREE.Vector3(0, 0, 0), 40);
    const [mesh] = meshesIn(pool.group);
    const at = new THREE.Matrix4();
    const v = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, at);
      v.setFromMatrixPosition(at);
      // Inside the reach, plus the margin a low sun needs for a tree that
      // stands outside the frame and throws its shadow into it.
      expect(Math.abs(v.z)).toBeLessThanOrEqual(40 + 30);
    }
    pool.dispose();
  });

  it("does not refill until the focus has really moved", () => {
    const pool = createFloraShadows();
    pool.setSources([row(200, 2)]);
    pool.setEnabled(true);
    pool.follow(new THREE.Vector3(0, 0, 0), 40);
    const [mesh] = meshesIn(pool.group);
    const version = mesh.instanceMatrix.version;
    // A metre is a frame's worth of travel and must cost nothing.
    pool.follow(new THREE.Vector3(1, 0, 0), 40);
    expect(mesh.instanceMatrix.version).toBe(version);
    // Far enough that the plants in range have really changed.
    pool.follow(new THREE.Vector3(0, 0, 60), 40);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(version);
    pool.dispose();
  });

  it("carries nothing at all below the top stop", () => {
    const pool = createFloraShadows();
    pool.setSources([row(100, 2)]);
    pool.follow(new THREE.Vector3(0, 0, 0), 40);
    const [mesh] = meshesIn(pool.group);
    expect(mesh.visible).toBe(false);
    expect(mesh.count).toBe(0);
    pool.dispose();
  });

  it("leaves the undergrowth out of the pass entirely", () => {
    // The world plants ferns and tufts through the same builder as its
    // spruces. Taking them all is one mesh per VARIANT and measured at +70
    // draw calls a frame, to buy a few pixels of shadow under a plant that
    // already reads dark against the ground it sits on.
    const pool = createFloraShadows();
    pool.setSources([row(200, 2, 0.25), row(200, 2, 6)]);
    pool.setEnabled(true);
    pool.follow(new THREE.Vector3(0, 0, 0), 40);
    const meshes = meshesIn(pool.group);
    expect(meshes).toHaveLength(1);
    expect(meshes[0].count).toBeGreaterThan(0);
    pool.dispose();
  });

  it("never puts more than a handful of species in the pass", () => {
    // The other half of the cost bound: the instance cap decides how much
    // GEOMETRY is in the pass, this decides how many DRAW CALLS — so the top
    // stop costs the same on a stage in any country, rather than whatever
    // that country happens to plant.
    const pool = createFloraShadows();
    pool.setSources(Array.from({ length: 20 }, (_, i) => row(30, 3, 4 + i)));
    pool.setEnabled(true);
    pool.follow(new THREE.Vector3(0, 0, 0), 40);
    expect(meshesIn(pool.group).length).toBeLessThanOrEqual(6);
    pool.dispose();
  });

  it("casts, receives nothing, and puts no pixels on the screen", () => {
    const pool = createFloraShadows();
    pool.setSources([row(10)]);
    const [mesh] = meshesIn(pool.group);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(false);
    const material = mesh.material as THREE.Material;
    expect(material.colorWrite).toBe(false);
    expect(material.depthWrite).toBe(false);
    // `visible` must stay TRUE: three skips an invisible MATERIAL in the
    // shadow pass as well as the colour one, so switching it off here would
    // silently stop the pool casting — which is the whole point of it.
    expect(material.visible).toBe(true);
    pool.dispose();
  });
});
