// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HOMESTEAD, drawn (R37). The engine decided everything — where the
// drive leaves the stage, where the yard is, which house stands on it in
// which paint under which roof, where the cars are and where every lane
// tree stands (`engine/mapgen/homesteads.ts`). This module builds what it
// was told: the drive as a road ribbon (the same skirts and mat as the
// stage and its branches, in a lane's width), the yard as a disc of gravel
// on the pad the terrain flattened for it, the barrier across the drive's
// mouth (the blockade a branch gets, and for the same reason), the house
// from its plan, the cars from their rolls, and the lane trees through the
// flora's own instancing so they are lit and swayed like the forest.
//
// Nothing here is solid — the walls, the cars and the trunks are solids the
// terrain field stands up from the same record, and a car stops against
// them whether or not this module has drawn them yet.

import * as THREE from "three";
import { createRng, type Homestead, type Season, type Track } from "@engine";
import { buildBarn, buildSilo } from "./barn.ts";
import { buildBlockade } from "./blockade.ts";
import type { ConeField } from "./cones.ts";
import { BALE, buildBale, buildFarmGear } from "./farm-gear.ts";
import { buildFlora, type FloraPlacement } from "./flora.ts";
import { buildHouse } from "./house.ts";
import { buildFence, buildField, buildMeadow } from "./paddock.ts";
import { buildParkedCar, parkedCarSpec } from "./parked-car.ts";
import { buildRoad, buildSkirts, type GroundBeside } from "./road-mesh.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { gravelTexture } from "./textures.ts";

/** What gets planted down a drive, and how often: birch first, because a
 * birch avenue is THE Nordic lane, then the rowan and the maple a yard is
 * given for their colour, an oak for the old places, an aspen for the ones
 * nobody planted. Every id is a `flora-species.ts` variant. */
const LANE_TREES: readonly [string, number][] = [
  ["birch", 0.42],
  ["birchPair", 0.14],
  ["rowan", 0.18],
  ["maple", 0.12],
  ["oak", 0.06],
  ["aspen", 0.08],
];

function laneTree(roll: number): string {
  let r = roll;
  for (const [id, weight] of LANE_TREES) {
    if (r < weight) return id;
    r -= weight;
  }
  return LANE_TREES[0][0];
}

/** The yard's gravel, in the road's own speckle, a shade lighter than the
 * mat: a yard is raked, not driven into two ruts. */
const yardMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ map: gravelTexture(), color: 0xd9c39c }),
);

/** How far the yard's gravel is drawn above the pad the terrain flattened
 * under it: enough to win the depth test, not enough to be a step. */
const YARD_LIFT = 0.04;

export function buildHomestead(
  track: Track,
  homestead: Homestead,
  cones: ConeField,
  beside: GroundBeside,
  season: Season,
): THREE.Group {
  const group = new THREE.Group();
  // Deterministic per homestead: the facet jitter and the trees' spin come
  // off the stage's seed and the drive's arc position, so a chunk rebuilt
  // on an endless run draws the same house.
  const rng = createRng((track.seed ^ 0x48a1d3c7 ^ Math.round(homestead.atS)) >>> 0);
  const rand = () => rng.next();

  // The drive: a hair under the stage's own mat where the two overlap at
  // the mouth (the branches use the same lift, for the same depth-buffer
  // reason), with its skirt hanging from its own lip.
  const { drive } = homestead;
  group.add(buildSkirts(track, drive.samples, drive.width, 0.012, beside));
  group.add(buildRoad(track, drive.samples, drive.width, 0.012, beside));

  // The yard: a disc on the pad. Flat, because the pad is — the terrain
  // holds the ground at `yard.y` out to the rim, and the drive's last
  // stretch was eased onto the same level.
  const { yard } = homestead;
  const disc = new THREE.CircleGeometry(yard.radius, 28);
  disc.rotateX(-Math.PI / 2);
  const uv = disc.getAttribute("uv") as THREE.BufferAttribute;
  const pos = disc.getAttribute("position") as THREE.BufferAttribute;
  // World-anchored grain, at the road's own scale, so the yard's speckle
  // is the drive's speckle continued.
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (yard.x + pos.getX(i)) / 3.5, (yard.z + pos.getZ(i)) / 3.5);
  }
  const pad = new THREE.Mesh(disc, yardMaterial());
  pad.position.set(yard.x, yard.y + YARD_LIFT, yard.z);
  group.add(pad);

  // The house, facing the yard.
  const { house } = homestead;
  const building = buildHouse(house.plan, rand);
  building.position.set(house.x, house.y, house.z);
  building.rotation.y = house.heading;
  group.add(building);

  // The cars, on the yard's gravel.
  for (const car of homestead.cars) {
    const mesh = buildParkedCar(parkedCarSpec(car.roll), rand);
    mesh.position.set(car.x, car.y + YARD_LIFT, car.z);
    mesh.rotation.y = car.heading;
    group.add(mesh);
  }

  // R37 — the farm, when this is one: the barn across the yard, the silo
  // at its gable, the machinery where it was left, the fence round the
  // paddock with the meadow inside it, the field, and the bales the baler
  // dropped — those last through the cone field, so the car can send them
  // rolling. The animals are the world's (`livestock.ts`), not this
  // chunk's: they move.
  const { farm } = homestead;
  if (farm) {
    const barn = buildBarn(farm.barn.plan, rand);
    barn.position.set(farm.barn.x, farm.barn.y, farm.barn.z);
    barn.rotation.y = farm.barn.heading;
    group.add(barn);
    if (farm.silo) {
      const silo = buildSilo(farm.silo.radius, farm.silo.height, rand);
      silo.position.set(farm.silo.x, farm.silo.y, farm.silo.z);
      group.add(silo);
    }
    for (const gear of farm.gear) {
      const mesh = buildFarmGear(gear, rand);
      mesh.position.set(gear.x, beside.heightAt(gear.x, gear.z) + 0.02, gear.z);
      mesh.rotation.y = gear.heading;
      group.add(mesh);
    }
    if (farm.paddock) {
      group.add(buildFence(farm.paddock, beside.heightAt, rand));
      const meadow = buildMeadow(farm.paddock, beside.heightAt, track.seed, season);
      if (meadow) group.add(meadow);
    }
    if (farm.field) {
      group.add(buildField(farm.field, beside.heightAt, rand));
      const wrapped = farm.field.bales.length > 0 && rng.chance(0.4);
      for (const at of farm.field.bales) {
        const bale = buildBale(wrapped, rand);
        bale.position.set(at.x, beside.heightAt(at.x, at.z), at.z);
        bale.rotation.y = at.heading;
        cones.plantProp(bale, homestead.atS, {
          reach: BALE.length / 2,
          height: BALE.radius * 2,
          rest: BALE.radius,
        });
      }
    }
  }

  // The lane trees, through the flora so they are instanced, seasoned and
  // swayed with the rest of the wood. Footed on the ground the terrain
  // field made beside the drive — the record's own height is the bare
  // country's, which the drive's shelf has since moved.
  const trees: FloraPlacement[] = homestead.trees.map((tree) => ({
    id: laneTree(tree.roll),
    x: tree.x,
    y: beside.heightAt(tree.x, tree.z),
    z: tree.z,
    scale: tree.size,
    spin: rng.range(0, Math.PI * 2),
  }));
  if (trees.length > 0) group.add(buildFlora(trees, rand, season).group);

  // The barrier across the mouth of the drive, where the generator stood
  // it. Null on the rare drive that leaves no room for one clear of the
  // stage: nothing in the way beats something in the way.
  if (homestead.block) group.add(buildBlockade(homestead.block, cones));
  return group;
}
