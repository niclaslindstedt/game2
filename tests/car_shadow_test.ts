// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHEET EVERY CAR STANDS ON.
//
// Nothing in the world casts a real shadow, so the one under each car is a
// drawn silhouette (pwa/src/game/car-shadow.ts) built off the same
// CarBodySpec the body is lofted from. It is renderer code and there is no
// browser here — but the sheet is geometry and arithmetic, so the two ways
// it fails silently can both be caught from Node:
//
//   IT HIDES. A shadow cut to the car's own plan outline is invisible from
//   every camera the game uses, because the car is standing on it. That is
//   the same picture as having no shadow at all, and it looks like a
//   material bug rather than a size one.
//   IT IS INSIDE OUT. A flat sheet whose triangles wind the other way is
//   back-face culled and simply never appears.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createCarShadow } from "../pwa/src/game/car-shadow.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";
import { bodyHalfLength, bodyHalfWidth } from "../pwa/src/game/car/shell.ts";

const bodies = Object.entries(CAR_BODIES);

function axlesOf(spec: (typeof CAR_BODIES)[string]): number[] {
  const shift = spec.axleShift ?? 0;
  return [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift];
}

/** The one mesh the shadow is drawn as, dug out of its group. */
function sheetOf(spec: (typeof CAR_BODIES)[string]): THREE.Mesh {
  const shadow = createCarShadow(spec, 1);
  let mesh: THREE.Mesh | null = null;
  shadow.group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) mesh = obj as THREE.Mesh;
  });
  if (!mesh) throw new Error("the shadow has no mesh in it");
  return mesh;
}

describe("the shadow under a car", () => {
  it.each(bodies)("%s throws a sheet wider than the car itself", (_id, spec) => {
    const geo = sheetOf(spec).geometry;
    geo.computeBoundingBox();
    const box = geo.boundingBox as THREE.Box3;
    expect(box.max.x).toBeGreaterThan(bodyHalfWidth(spec, axlesOf(spec)));
    expect(box.min.x).toBeLessThan(-bodyHalfWidth(spec, axlesOf(spec)));
    expect(box.max.z).toBeGreaterThan(bodyHalfLength(spec));
    expect(box.min.z).toBeLessThan(-bodyHalfLength(spec));
    // Mirrored across the centerline: a shadow is aimed by the light at run
    // time, never by the geometry. (Nose and tail are NOT symmetric — the
    // silhouette is the car's own, and a car has a front.)
    expect(box.min.x).toBeCloseTo(-box.max.x, 5);
    // Flat. The lift off the ground is applied to the mesh, not baked in,
    // so it can leave along the GROUND's up rather than the world's.
    expect(box.min.y).toBe(0);
    expect(box.max.y).toBe(0);
  });

  it.each(bodies)("%s winds every triangle to face up", (_id, spec) => {
    const geo = sheetOf(spec).geometry;
    const pos = geo.getAttribute("position");
    const idx = geo.getIndex() as THREE.BufferAttribute;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(pos, idx.getX(t));
      b.fromBufferAttribute(pos, idx.getX(t + 1)).sub(a);
      c.fromBufferAttribute(pos, idx.getX(t + 2)).sub(a);
      // The y of b × c: positive is a normal pointing at the sky, which is
      // the only side of a ground sheet anybody looks at.
      expect(b.z * c.x - b.x * c.z).toBeGreaterThan(0);
    }
  });

  it.each(bodies)("%s fades out at its edge instead of stopping", (_id, spec) => {
    const geo = sheetOf(spec).geometry;
    const col = geo.getAttribute("color");
    expect(col.itemSize).toBe(4);
    let solid = 0;
    let clear = 0;
    for (let i = 0; i < col.count; i++) {
      const alpha = col.getW(i);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
      if (alpha === 1) solid++;
      if (alpha === 0) clear++;
    }
    // Both ends of the gradient are present: a core that is fully dark, and
    // an outer ring that has faded to nothing.
    expect(solid).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(0);
  });
});
