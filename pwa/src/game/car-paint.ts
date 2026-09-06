// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR'S COLOUR BUFFER, AND THE TWO WRITERS THAT SHARE IT.
//
// A car's paint is baked vertex colours, and two modules re-derive them
// wholesale from pristine copies of their own. car-damage.ts rewrites every
// panel from the livery whenever the ledger moves — bent, lit again for the
// plane the fold left it in, scuffed. car-dirt.ts rewrites the whole car
// from the paint whenever the coat thickens by a visible step. Either one
// alone is right; the two on one attribute take turns UNDOING each other.
// A crash wipes the stage's grime off every panel, and the next fleck of
// dust puts the grime back and takes the scuff off with it. That is the
// disappearing filth, and it is why a knock is what brings it on.
//
// So neither of them writes the attribute any more. A vertex's colour is a
// STACK, in a fixed order: the BASE — the car as the damage model leaves
// it, which is the only thing that knows what shape and what shade the
// panel is now — with the COAT over it, the dirt as the painter leaves it.
// Each writer owns one layer and reads neither the other's nor the buffer,
// and `compose` is the only thing that ever touches the attribute. Order of
// writes stops mattering, which is the whole point: a bend mid-stage and a
// fleck the same frame both land, in either order, on a car that is bent
// AND filthy.
//
// The layers hang off the GEOMETRY rather than off either module, because
// the geometry is what the two of them actually share — the same buffer
// reached through two meshes is one stack, and the four wheels are one
// geometry however many meshes stand on it.

import * as THREE from "three";

export type PaintLayers = {
  /** The car under the dirt: rgb per vertex, unpacked from the stride the
   * attribute happens to carry. car-damage.ts owns it. */
  base: Float32Array;
  /** The dirt over it: r, g, b, amount per vertex — amount 0 is bare paint.
   * car-dirt.ts owns it. */
  coat: Float32Array;
  /** Vertices in the buffer. */
  count: number;
  /** Set once the mesh has torn off and become debris: its vertices have
   * been moved onto their own centre, so anything that decides a colour
   * from WHERE a face sits on the car (the dirt painter does) would be
   * reading a bonnet as though it were parked at the middle of the car. A
   * piece that has left keeps the colours it left with. */
  detached: boolean;
  /** Write the stack into the attribute. Alpha is never touched — the glass
   * carries its own in the fourth channel, and a pane the damage model has
   * shattered stays shattered however filthy the car gets. */
  compose: () => void;
};

const LAYERS = new WeakMap<THREE.BufferGeometry, PaintLayers>();

/** The layers of a geometry's colour buffer, made on first ask from
 * whatever it was baked with — that bake is the base, and the coat starts
 * empty. Null for a geometry with no colours, which is nothing either
 * writer has anything to say about. */
export function paintLayers(geo: THREE.BufferGeometry): PaintLayers | null {
  const found = LAYERS.get(geo);
  if (found) return found;
  const col = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (!col) return null;
  const stride = col.itemSize;
  const arr = col.array as Float32Array;
  const count = col.count;
  const base = new Float32Array(count * 3);
  for (let j = 0; j < count; j++) {
    base[j * 3] = arr[j * stride];
    base[j * 3 + 1] = arr[j * stride + 1];
    base[j * 3 + 2] = arr[j * stride + 2];
  }
  const coat = new Float32Array(count * 4);
  const layers: PaintLayers = {
    base,
    coat,
    count,
    detached: false,
    compose: (): void => {
      for (let j = 0; j < count; j++) {
        const b = j * 3;
        const c = j * 4;
        const i = j * stride;
        const a = coat[c + 3];
        arr[i] = base[b] + (coat[c] - base[b]) * a;
        arr[i + 1] = base[b + 1] + (coat[c + 1] - base[b + 1]) * a;
        arr[i + 2] = base[b + 2] + (coat[c + 2] - base[b + 2]) * a;
      }
      col.needsUpdate = true;
    },
  };
  LAYERS.set(geo, layers);
  return layers;
}
