// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Parametric car builder: turns a CarBodySpec — a JSON-friendly bundle of
// dimensions, parts and colors — into the low-poly meshes of a rally car.
// This module is the assembly line; the parts are built by the modules in
// car/, and the specs themselves live in car-styles.ts.
//
// What comes out is one crumpleable shell mesh plus a mesh per breakable
// part, all hanging off a sprung `chassis` group with the wheels bolted to
// the root — so the suspension can squat and rebound the body without
// pushing the tires through the gravel.

import * as THREE from "three";
import type { DamagePart } from "@engine";

import { MeshBuilder } from "./car/builder.ts";
import { buildFront, buildRear } from "./car/fascia.ts";
import { buildGreenhouse } from "./car/greenhouse.ts";
import { buildShell, buildStations } from "./car/shell.ts";
import { buildTrim } from "./car/trim.ts";
import { buildWheel } from "./car/wheels.ts";

export type {
  CarBodySpec,
  FrontSpec,
  Grille,
  Lights,
  ProfilePoint,
  RearSpec,
  SideBand,
  Spoiler,
  WheelStyle,
} from "./car/spec.ts";
export { bodyHalfLength, bodyHalfWidth } from "./car/shell.ts";
export { frontLampAnchors, rearLampAnchors, type LampAnchor } from "./car/fascia.ts";

import type { CarBodySpec } from "./car/spec.ts";

export type CarBodyParts = {
  /** The whole car, origin at ground level under the body center. */
  group: THREE.Group;
  /** The SPRUNG mass — every panel, and nothing that touches the ground.
   * The wheels hang off `group` instead, so the suspension can squat and
   * rebound the body without pushing the tires through the gravel. */
  chassis: THREE.Group;
  /** [FL, FR, RL, RR] — rotate .y for steering. */
  wheelGroups: THREE.Group[];
  /** Same order — rotate .x to spin with road speed. */
  wheelSpin: THREE.Object3D[];
  /** The bendable shell — the mesh the damage visual crumples. */
  body: THREE.Mesh;
  /** The pieces an impact can tear off, each its own mesh so the damage
   * visual can detach one and send it flying (the engine names which). */
  breakables: Partial<Record<DamagePart, THREE.Mesh>>;
  dispose: () => void;
};

export function buildCarBody(spec: CarBodySpec): CarBodyParts {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const shift = spec.axleShift ?? 0;
  const axles = [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift];

  const b = new MeshBuilder();
  const partBuilders = new Map<DamagePart, MeshBuilder>();
  const part = (name: DamagePart): MeshBuilder => {
    let builder = partBuilders.get(name);
    if (!builder) partBuilders.set(name, (builder = new MeshBuilder()));
    return builder;
  };

  buildShell(b, spec, buildStations(spec, axles));
  buildGreenhouse(b, spec);
  buildFront(b, spec, axles, part);
  buildRear(b, spec, axles, part);
  buildTrim(b, spec, axles, part);

  const chassis = new THREE.Group();
  group.add(chassis);
  const bodyGeo = b.geometry();
  const body = new THREE.Mesh(bodyGeo, material);
  chassis.add(body);

  const breakables: Partial<Record<DamagePart, THREE.Mesh>> = {};
  const partGeos: THREE.BufferGeometry[] = [];
  for (const [name, builder] of partBuilders) {
    const geo = builder.geometry();
    const mesh = new THREE.Mesh(geo, material);
    chassis.add(mesh);
    breakables[name] = mesh;
    partGeos.push(geo);
  }

  const wheelGroups: THREE.Group[] = [];
  const wheelSpin: THREE.Object3D[] = [];
  // All four wheels share one tire and one rim — only their transforms
  // differ, so the geometry is built once and disposed once.
  const wheelGeos = buildWheel(spec);
  for (const axle of axles) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.position.set(side * spec.trackHalf, spec.wheelRadius, axle);
      const spin = new THREE.Group();
      for (const geo of wheelGeos) spin.add(new THREE.Mesh(geo, material));
      wheel.add(spin);
      group.add(wheel);
      wheelGroups.push(wheel);
      wheelSpin.push(spin);
    }
  }

  const dispose = (): void => {
    bodyGeo.dispose();
    for (const g of partGeos) g.dispose();
    for (const g of wheelGeos) g.dispose();
    material.dispose();
  };
  return { group, chassis, wheelGroups, wheelSpin, body, breakables, dispose };
}
