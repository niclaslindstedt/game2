// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TOWN, drawn (R39). The engine decided everything — which piece of
// sealed road the town stands on, where every lot is and what stands on it,
// where the cars are parked outside (`engine/mapgen/towns.ts`). This module
// builds what it was told: each lot's pad as a disc of gravel on the ground
// the terrain graded level with the street, the building on it from its
// plan, and the cars from their rolls. The street itself is road already on
// the track — the route's own ribbon, or a branch's — so nothing here is a
// road.
//
// Nothing here is solid either — the walls and the cars are solids the
// terrain field stands up from the same record, and a car stops against
// them whether or not this module has drawn them yet.

import * as THREE from "three";
import { createRng, type Town, type Track } from "@engine";
import { buildBuilding } from "./building.ts";
import { buildParkedCar, parkedCarSpec } from "./parked-car.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { gravelTexture } from "./textures.ts";

/** A lot's gravel: the road's own speckle, a shade paler and greyer than a
 * farmyard's — a village yard is walked on more than it is driven on. */
const lotMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ map: gravelTexture(), color: 0xd3c7ab }),
);

/** How far the pad's gravel is drawn above the ground the terrain flattened
 * under it: enough to win the depth test, not enough to be a step. */
const PAD_LIFT = 0.04;

export function buildTown(track: Track, town: Town): THREE.Group {
  const group = new THREE.Group();
  // Deterministic per town: the facet jitter comes off the stage's seed and
  // the town's arc position, so a chunk rebuilt on an endless run draws the
  // same buildings.
  const rng = createRng((track.seed ^ 0x7b3d19e5 ^ Math.round(town.atS)) >>> 0);
  const rand = () => rng.next();

  for (const lot of town.lots) {
    const { pad, building } = lot;
    const disc = new THREE.CircleGeometry(pad.radius, 24);
    disc.rotateX(-Math.PI / 2);
    const uv = disc.getAttribute("uv") as THREE.BufferAttribute;
    const pos = disc.getAttribute("position") as THREE.BufferAttribute;
    // World-anchored grain at the road's own scale, so one lot's speckle
    // is the next lot's continued where the two pads overlap — and the
    // disc laid on the pad's own plane, which falls along the street with
    // the road.
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (pad.x + pos.getX(i)) / 3.5, (pad.z + pos.getZ(i)) / 3.5);
      pos.setY(i, pad.grade.x * pos.getX(i) + pad.grade.z * pos.getZ(i));
    }
    disc.computeVertexNormals();
    const ground = new THREE.Mesh(disc, lotMaterial());
    ground.position.set(pad.x, pad.y + PAD_LIFT, pad.z);
    group.add(ground);

    const mesh = buildBuilding(building.plan, rand);
    mesh.position.set(building.x, building.y, building.z);
    mesh.rotation.y = building.heading;
    group.add(mesh);

    for (const car of lot.cars) {
      const parked = buildParkedCar(parkedCarSpec(car.roll), rand);
      parked.position.set(car.x, car.y + PAD_LIFT, car.z);
      parked.rotation.y = car.heading;
      group.add(parked);
    }
  }
  return group;
}
