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
//
// FOUR MATERIALS come out of here, not one, and each split buys something
// one material cannot do. The body, the parts and the wheels share an opaque
// fullbright material. The GLASS is translucent, so it cannot share a buffer
// with them — it gets its own, and the cabin car/interior.ts furnishes is
// drawn behind it as ordinary opaque geometry. The grime FILM on the screens
// gets a third, because a clean screen has to be invisible now rather than
// merely the same colour as the glass under it. And the LAMP LENSES get a
// fourth: everything else on the car takes the time of day as a multiply
// into its material colour, and a lamp is the one surface that has to get
// BRIGHTER as the light goes (car/lamps.ts explains the rest).

import * as THREE from "three";
import type { DamagePart } from "@engine";

import { MeshBuilder, patchNormal } from "./car/builder.ts";
import { buildFront, buildRear } from "./car/fascia.ts";
import { buildGreenhouse, screenPanes } from "./car/greenhouse.ts";
import { buildInterior, type InteriorDetail } from "./car/interior.ts";
import { LENS_MATERIAL } from "./car/lamps.ts";
import { buildShell, buildStations } from "./car/shell.ts";
import { buildTrim } from "./car/trim.ts";
import { buildWheel } from "./car/wheels.ts";
import { buildWipers, type CarWipers } from "./car/wipers.ts";

export type {
  CarBodySpec,
  DeckStripes,
  FrontSpec,
  Grille,
  Lights,
  ProfilePoint,
  RearSpec,
  SideBand,
  Spoiler,
  TailLights,
  WheelStyle,
} from "./car/spec.ts";
export { bodyHalfLength, bodyHalfWidth } from "./car/shell.ts";
export { LENS_MATERIAL, frontLampAnchors, rearLampAnchors, type LampAnchor } from "./car/lamps.ts";
export { steeringTurn, type InteriorDetail } from "./car/interior.ts";

import type { CarBodySpec } from "./car/spec.ts";

/** What the glass carries before anything is done to it per frame: the
 * opacity of a clean, square-on pane. The baked gradient in the greenhouse
 * fades it further toward the sill, and car-mesh.ts adds the view-angle
 * glint and whatever the stage has caked on it. Low enough that the cabin
 * reads through it — the sill end of every pane fades further still — and
 * high enough that a window is never a hole in the car. */
export const GLASS_OPACITY = 0.44;

/** The backlight's outward normal in car-local metres. This is the pane the
 * game is actually watched through — every driving camera but the hood one
 * stands behind the car — so it is the pane whose angle to the eye decides
 * how hard the whole greenhouse catches the light (car-mesh.ts). Square on,
 * down a straight, the glass is at its clearest and the crew show through
 * it; thrown sideways in a drift the same pane goes glancing and flares. */
export function backlightNormal(spec: CarBodySpec): THREE.Vector3 {
  const n = patchNormal(screenPanes(spec).rear.patch);
  return new THREE.Vector3(n[0], n[1], n[2]);
}

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
  /** The lamp lenses: their own mesh, so their own material, so the light
   * failing over a stage can make them brighter while it makes the paint
   * around them darker. It crumples with the shell — a lamp sits exactly
   * where a nose gets crushed, and one left standing in its pristine place
   * on a folded cap is the most obvious thing on the car. Null on a spec
   * with no lamps at either end. */
  lenses: THREE.Mesh | null;
  /** The pieces an impact can tear off, each its own mesh so the damage
   * visual can detach one and send it flying (the engine names which). */
  breakables: Partial<Record<DamagePart, THREE.Mesh>>;
  /** The screens' grime and the arms that clear it — the one part of the
   * body that MOVES on its own, so it is handed out rather than baked in. */
  wipers: CarWipers;
  /** Every window, as one translucent mesh, and the material that decides
   * how much of the cabin shows through it this frame. Null on a spec with
   * no glass at all. */
  glass: THREE.MeshBasicMaterial | null;
  /** The lenses' own material — what car-mesh.ts switches between the off
   * and the lit tone. Null alongside `lenses`. */
  lens: THREE.MeshBasicMaterial | null;
  /** The cabin behind that glass, and the glass itself. Handed out as one
   * object because it is the one part of the car the rear-view mirror must
   * NOT draw: the mirror's lens sits between this car's own seats, so left
   * in, it shows the back of the bulkhead through the inside of the rear
   * screen instead of the road. Every other car on the stage keeps both —
   * those are seen from outside, which is the whole point of them. */
  cabin: THREE.Object3D;
  /** The steering wheel, at the `high` detail level — null below it, where
   * the wheel is baked in where it stands. */
  steering: THREE.Object3D | null;
  dispose: () => void;
};

export type CarBodyOptions = {
  /** How much cabin is built behind the glass. `off` also leaves the glass
   * solid, which is the car this game shipped with. */
  interior?: InteriorDetail;
};

export function buildCarBody(spec: CarBodySpec, options: CarBodyOptions = {}): CarBodyParts {
  const detail = options.interior ?? "high";
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

  // The glass carries alpha and the body does not, which is why they are two
  // builders rather than one mesh with two draw ranges.
  const g = new MeshBuilder(true);
  // The lit surfaces of every lamp, kept out of the body's buffer because
  // they are switched rather than tinted — one mesh for both ends.
  const l = new MeshBuilder();
  buildShell(b, spec, buildStations(spec, axles));
  buildGreenhouse(b, g, spec);
  buildFront({ body: b, lens: l }, spec, axles, part);
  buildRear({ body: b, lens: l }, spec, axles, part);
  buildTrim(b, spec, axles, part);

  const chassis = new THREE.Group();
  group.add(chassis);
  const bodyGeo = b.geometry();
  const body = new THREE.Mesh(bodyGeo, material);
  chassis.add(body);

  let lensMat: THREE.MeshBasicMaterial | null = null;
  let lensGeo: THREE.BufferGeometry | null = null;
  let lenses: THREE.Mesh | null = null;
  if (!l.empty) {
    lensMat = new THREE.MeshBasicMaterial({ name: LENS_MATERIAL, vertexColors: true });
    lensGeo = l.geometry();
    lenses = new THREE.Mesh(lensGeo, lensMat);
    chassis.add(lenses);
  }

  // The cabin goes on BEFORE the glass, because it is what the glass is for.
  const cabin = new THREE.Group();
  chassis.add(cabin);
  const interior = buildInterior(spec, detail, material);
  if (interior.group) cabin.add(interior.group);

  // DOUBLE-sided, and drawn without writing depth. Both are about looking
  // THROUGH a car rather than at it. Front faces only would leave the far
  // window of the cabin culled, so a look through the near one comes out the
  // other side untinted — a hole in the car, and the more obviously a hole
  // the better the interior behind it is. And not writing depth is what
  // keeps the dust and spray thrown up around the car from being clipped
  // away by a sheet of glass they are nowhere near. That leaves the near and
  // far panes blending in buffer order, which for two panes of the same
  // glass is a difference nothing can see. The render orders are the one
  // ordering that does matter: glass over the cabin, film over the glass.
  // At the `off` level none of that applies: there is no cabin to see, so the
  // pane goes back to being a solid panel — front faces, writing depth, in
  // the opaque pass with the body it belongs to.
  const solid = detail === "off";
  let glassMat: THREE.MeshBasicMaterial | null = null;
  let glassGeo: THREE.BufferGeometry | null = null;
  if (!g.empty) {
    glassMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: !solid,
      opacity: GLASS_OPACITY,
      depthWrite: solid,
      side: solid ? THREE.FrontSide : THREE.DoubleSide,
    });
    glassGeo = g.geometry();
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.renderOrder = 1;
    cabin.add(glass);
  }

  const breakables: Partial<Record<DamagePart, THREE.Mesh>> = {};
  const partGeos: THREE.BufferGeometry[] = [];
  for (const [name, builder] of partBuilders) {
    const geo = builder.geometry();
    const mesh = new THREE.Mesh(geo, material);
    chassis.add(mesh);
    breakables[name] = mesh;
    partGeos.push(geo);
  }

  // Last onto the chassis: the film has to be laid over glass that already
  // exists, and the blades over the film. The blades are hardware and stay
  // on the body's own material; the film is a coat of dirt with nothing
  // under it when the screen is clean, so it carries its own alpha.
  const filmMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const wipers = buildWipers(spec, material, filmMat);
  wipers.film.renderOrder = 2;
  chassis.add(wipers.group);

  const wheelGroups: THREE.Group[] = [];
  const wheelSpin: THREE.Object3D[] = [];
  // All four wheels share one geometry — only their transforms differ, so
  // it is built once and disposed once.
  const wheelGeo = buildWheel(spec);
  for (const axle of axles) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.position.set(side * spec.trackHalf, spec.wheelRadius, axle);
      const spin = new THREE.Mesh(wheelGeo, material);
      wheel.add(spin);
      group.add(wheel);
      wheelGroups.push(wheel);
      wheelSpin.push(spin);
    }
  }

  const dispose = (): void => {
    wipers.dispose();
    interior.dispose();
    bodyGeo.dispose();
    for (const geo of partGeos) geo.dispose();
    glassGeo?.dispose();
    lensGeo?.dispose();
    wheelGeo.dispose();
    material.dispose();
    glassMat?.dispose();
    lensMat?.dispose();
    filmMat.dispose();
  };
  return {
    group,
    chassis,
    wheelGroups,
    wheelSpin,
    body,
    lenses,
    breakables,
    wipers,
    glass: glassMat,
    lens: lensMat,
    cabin,
    steering: interior.steering,
    dispose,
  };
}
