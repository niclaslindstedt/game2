// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Progressive dirt on the car: the run is written onto the paint. Driving
// gravel dusts the car slowly, drifting throws more up, the grass verge is
// muddier still, and a ford splashes the heaviest coat. Dirt only ever
// accumulates — a stage ends with the car looking driven — and resets with
// the next stage's fresh meshes.
//
// The whole car is baked vertex colors on fullbright material, so dirt is
// applied the same way: each mesh's colors are re-lerped toward a mud tone,
// weighted low-heavy (sills and wheels first, roof last) and speckled per
// face so the coat looks splattered rather than airbrushed.

import * as THREE from "three";
import { clamp } from "../lib/util.ts";
import type { GameState } from "@engine";

type DirtTarget = {
  geo: THREE.BufferGeometry;
  /** Pristine copy of the mesh's baked colors. */
  orig: Float32Array;
  /** Mesh origin height above the ground in car space, m — wheels hang
   * lower than the body shell and take the coat sooner. */
  baseY: number;
};

export type CarDirt = {
  update: (state: GameState, dt: number) => void;
};

// Dried gravel-dust tan rather than dark wet mud: against the saturated
// paint colors a light coat is what actually reads as "dirty".
const MUD = new THREE.Color(0x9c7f57);

/** Deterministic per-face speckle in 0..1 — the splatter pattern. */
function speck(face: number): number {
  const s = Math.sin(face * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function createCarDirt(root: THREE.Group): CarDirt {
  const targets: DirtTarget[] = [];
  root.updateMatrixWorld(true);
  const rootY = new THREE.Vector3();
  root.getWorldPosition(rootY);
  const pos = new THREE.Vector3();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geo = obj.geometry as THREE.BufferGeometry;
    const color = geo.getAttribute("color");
    if (!color) return;
    obj.getWorldPosition(pos);
    targets.push({
      geo,
      orig: new Float32Array(color.array as Float32Array),
      baseY: pos.y - rootY.y,
    });
  });

  let dirt = 0;
  let applied = -1;

  const apply = (): void => {
    for (const t of targets) {
      const color = t.geo.getAttribute("color") as THREE.BufferAttribute;
      const arr = color.array as Float32Array;
      const positions = t.geo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < color.count; i++) {
        const y = t.baseY + positions.getY(i);
        // Low-heavy: rocker panels and wheels coat fully, the roof keeps
        // most of its paint even at max dirt.
        const height = clamp(1.25 - 0.7 * y, 0.2, 1);
        const m = Math.min(0.72, dirt * height * (0.55 + 0.9 * speck(Math.floor(i / 3))));
        arr[i * 3] = t.orig[i * 3] + (MUD.r - t.orig[i * 3]) * m;
        arr[i * 3 + 1] = t.orig[i * 3 + 1] + (MUD.g - t.orig[i * 3 + 1]) * m;
        arr[i * 3 + 2] = t.orig[i * 3 + 2] + (MUD.b - t.orig[i * 3 + 2]) * m;
      }
      color.needsUpdate = true;
    }
  };

  const update = (state: GameState, dt: number): void => {
    const car = state.car;
    if (state.phase !== "racing" || car.airborne) return;
    const surface = state.track.samples[state.progressIndex]?.surface;
    let rate = 0;
    if (state.offRoad) rate = 0.14;
    else if (surface === "water") rate = 0.5;
    else if (car.drifting) rate = 0.07;
    else if (car.u > 10) rate = 0.012;
    if (rate === 0) return;
    dirt = Math.min(1, dirt + rate * dt);
    // Re-baking colors is a whole-buffer write — only do it per visible
    // step of grime, not per frame.
    const quantized = Math.round(dirt * 25);
    if (quantized !== applied) {
      applied = quantized;
      apply();
    }
  };

  return { update };
}
