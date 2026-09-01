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

import { MeshBuilder, mergeGeometries, patchNormal } from "./car/builder.ts";
import { buildFront, buildRear } from "./car/fascia.ts";
import { buildGreenhouse, screenPanes, type GlassPanes } from "./car/greenhouse.ts";
import { buildCockpit, cabinOpening, type CarCockpit } from "./car/cockpit.ts";
import { bayOpening, buildEngineBay } from "./car/engine-bay.ts";
import { buildInterior, type InteriorDetail } from "./car/interior.ts";
import type { CrewLook } from "./car-crew.ts";
import { LENS_MATERIAL } from "./car/lamps.ts";
import { buildScreenRain, type ScreenRain } from "./car/screen-rain.ts";
import { buildShell, buildStations } from "./car/shell.ts";
import { buildTrim, doorSkins, type DoorSkin } from "./car/trim.ts";
import { buildWheel } from "./car/wheels.ts";
import { buildWipers, type CarWipers, type FilmDetail } from "./car/wipers.ts";

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
export type { GlassPane, GlassPanes } from "./car/greenhouse.ts";
export type { DoorSkin } from "./car/trim.ts";
export { crewSeats, steeringTurn, type InteriorDetail } from "./car/interior.ts";
export type { FilmDetail } from "./car/wipers.ts";
export {
  DIAL_TOP_SPEED,
  cabinOpening,
  cockpitEyeFor,
  cockpitWheelTurn,
  dialAngle,
  type CarCockpit,
  type CockpitEye,
} from "./car/cockpit.ts";

import type { CarBodySpec } from "./car/spec.ts";

/** What the glass carries before anything is done to it per frame: the
 * opacity of a clean, square-on pane. The baked gradient in the greenhouse
 * fades it further toward the sill, and car-mesh.ts adds the view-angle
 * glint and whatever the stage has caked on it. Low enough that the cabin
 * reads through it — the sill end of every pane fades further still — and
 * high enough that a window is never a hole in the car. */
export const GLASS_OPACITY = 0.44;

/** The name that marks the cockpit's own cabin, and the one that marks its
 * instruments. Both are DRIVEN rather than tinted (car-mesh.ts): a closed
 * cabin is darker than the paint around it and goes to almost nothing at
 * night, and a backlit dial does not go dark at all. */
export const COCKPIT_MATERIAL = "car-cockpit";
export const INSTRUMENT_MATERIAL = "car-instrument";

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
   * visual can detach one and send it flying (the engine names which).
   * HIDDEN while they are all still bolted on: one merged copy of the lot is
   * drawn in their place until `unbolt` is called. */
  breakables: Partial<Record<DamagePart, THREE.Mesh>>;
  /** Stop drawing the bolt-on panels as one mesh and give each of them its
   * own again — what the damage visual calls the instant it takes the first
   * one off, because from then on they no longer move together. Idempotent,
   * and a no-op on a car whose panels were never merged. */
  unbolt: () => void;
  /** The screens' grime and the arms that clear it — the one part of the
   * body that MOVES on its own, so it is handed out rather than baked in. */
  wipers: CarWipers;
  /** Every window, as one translucent mesh, and the material that decides
   * how much of the cabin shows through it this frame. Null on a spec with
   * no glass at all. */
  glass: THREE.MeshBasicMaterial | null;
  /** ...the mesh itself, and where each pane sits in its buffer — what the
   * damage visual takes a shattered pane out of. Null alongside `glass`. */
  glassMesh: THREE.Mesh | null;
  panes: GlassPanes;
  /** The door skins this body was built with (car/trim.ts): where each one
   * is, so the hole it leaves can be painted into the flank behind it. */
  doors: DoorSkin[];
  /** The tyre's radius, m — how far a corner drops onto its hub when the
   * wheel is gone. */
  wheelRadius: number;
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
  /** Just the FURNITURE inside that cabin — the lining, the seats, the crew.
   * Handed out apart from `cabin` because the cockpit view replaces it: from
   * the driver's own seat this is the wrong cabin (it is authored to be read
   * through glass at a car's length), while the GLASS beside it in `cabin`
   * is still wanted. Null at the `off` detail level. */
  cabinTrim: THREE.Object3D | null;
  /** The steering wheel, at the `high` detail level — null below it, where
   * the wheel is baked in where it stands. */
  steering: THREE.Object3D | null;
  /** The first-person cabin, built only when a car asks for one — one car on
   * the stage ever does. Hidden until the cockpit camera is up. */
  cockpit: CarCockpit | null;
  /** The cabin's own material, so the night can black the room out without
   * touching the paint outside it. Null on a car with no cockpit. */
  cockpitMaterial: THREE.MeshBasicMaterial | null;
  /** THE WATER ON THE WINDSCREEN (car/screen-rain.ts), for the one car
   * whose driver is behind it. Not in `group` with everything else: it is
   * drawn in a pass of its own, after the frame it refracts. Null on any car
   * built without a cockpit, and on every car when the screens are set to
   * stay clean. */
  screenRain: ScreenRain | null;
  dispose: () => void;
};

export type CarBodyOptions = {
  /** How much cabin is built behind the glass. `off` also leaves the glass
   * solid, which is the car this game shipped with. */
  interior?: InteriorDetail;
  /** Who is sat in it (car-crew.ts). Left off, it is the player's own crew —
   * one car on a stage is the player's, and every tool that builds a body
   * without saying whose it is is looking at that one. */
  crew?: CrewLook;
  /** Also build the first-person cabin (car/cockpit.ts), and cut the deck
   * out from under it so there is a cabin to build. The player's car only:
   * it is a fascia, two live dials and a wheel at arm's length, and nothing
   * that is only ever seen from outside has any use for it. */
  cockpit?: boolean;
  /** The rear view, for the pane in the cockpit's mirror — the mirror
   * pass's own texture (mirror.ts), and the aspect it renders at. Left off,
   * the mirror is a dark housing with no picture in it. */
  rearView?: { texture: THREE.Texture; aspect: number };
  /** How finely the screens carry the GRIME FILM the wipers clear
   * (car/wipers.ts). The arms are built either way. `fine` is for the car
   * being driven, where the swept arc is read close up; `coarse` is for
   * everyone else, where the glass only has to go brown; `off` leaves every
   * screen permanently clean. Defaults to `fine`, so every tool that builds
   * a body without saying whose it is gets the full one. */
  screens?: FilmDetail;
};

export function buildCarBody(spec: CarBodySpec, options: CarBodyOptions = {}): CarBodyParts {
  // A cockpit car keeps an interior whatever the video option says: it is
  // the interior's pan that closes the cut-open deck in every view the
  // cockpit itself is not up in, and `off` would also solidify the glass.
  const detail = options.cockpit
    ? options.interior === "off"
      ? "low"
      : (options.interior ?? "high")
    : (options.interior ?? "high");
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
  // TWO HOLES IN THE TOP DECK, and neither is optional to whatever asks for
  // it. Under the BONNET the deck is cut away so there is an engine bay to
  // see once an impact tears the panel off (car/engine-bay.ts, which closes
  // the hole again with a well). Under the CABIN it comes out on a car that
  // is going to be SAT IN, which is the only way a driver and a wheel fit in
  // one (car/cockpit.ts) — closed by the cockpit's own hull while that
  // camera is up and by car/interior.ts's pan in every other view, which is
  // why a cockpit car is never built with its interior off.
  const stations = buildStations(spec, axles);
  const bay = bayOpening(spec);
  buildShell(b, spec, stations, {
    openings: [...(options.cockpit ? [cabinOpening(spec)] : []), ...(bay ? [bay] : [])],
  });
  const engineBay = buildEngineBay(b, spec, stations, axles, detail);
  const panes = buildGreenhouse(b, g, spec);
  buildFront({ body: b, lens: l }, spec, axles, part, { engineBay });
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
  const interior = buildInterior(spec, detail, material, options.crew);
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
  let glassMesh: THREE.Mesh | null = null;
  if (!g.empty) {
    glassMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: !solid,
      opacity: GLASS_OPACITY,
      depthWrite: solid,
      side: solid ? THREE.FrontSide : THREE.DoubleSide,
    });
    glassGeo = g.geometry();
    glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.renderOrder = 1;
    cabin.add(glassMesh);
  }

  const breakables: Partial<Record<DamagePart, THREE.Mesh>> = {};
  const partGeos: THREE.BufferGeometry[] = [];
  for (const [name, builder] of partBuilders) {
    const geo = builder.geometry();
    // A part a spec never authored builds no triangles, and an empty mesh is
    // still an object to transform, cull, sort and issue a draw for on every
    // pass of every frame — on every car on a grid. There is nothing there
    // to break off either, so it is simply not made.
    if ((geo.getAttribute("position")?.count ?? 0) === 0) {
      geo.dispose();
      continue;
    }
    const mesh = new THREE.Mesh(geo, material);
    // Bolted on, so not drawn: `boltOns` below is drawing all of them at
    // once. It stays parented to the chassis all the same — the mesh a part
    // becomes when it tears off is this one, and it has to be standing in
    // the right place in the world when `unbolt` hands it back.
    mesh.visible = false;
    chassis.add(mesh);
    breakables[name] = mesh;
    partGeos.push(geo);
  }

  // ...AND THE SAME PANELS AS ONE MESH, which is the one that is actually
  // drawn while they are all still bolted on.
  //
  // A bumper, a bonnet, a hatch, two mirrors and a wing are separate meshes
  // for one reason and one reason only: an impact tears one off, and a piece
  // the world takes over has to be its own object to be taken over. Nothing
  // else about them is separate — same material, same transform, never
  // moving relative to the panel they are bolted to — and every one of them
  // is a draw call on every car on the road, for geometry that is rigidly
  // part of the body in every frame but the handful after a shunt.
  //
  // So they are drawn as one until one of them comes off (`unbolt`), and
  // individually from then on. A car nothing has hit — which is most cars,
  // most of the time — pays one draw for the lot: measured with
  // `make profile`, that is 702 draws down to 654 on a heads-up grid.
  const boltOnGeo = partGeos.length > 1 ? mergeGeometries(partGeos) : null;
  const boltOns = boltOnGeo ? new THREE.Mesh(boltOnGeo, material) : null;
  if (boltOns) chassis.add(boltOns);
  else for (const mesh of Object.values(breakables)) mesh.visible = true;

  /** The moment one of them tears off: the merged mesh goes and the meshes
   * it stood in for come back, the torn one included — `car-damage.ts`
   * re-parents that one into the world on the same frame. */
  const unbolt = (): void => {
    if (!boltOns || !boltOns.visible) return;
    boltOns.visible = false;
    for (const mesh of Object.values(breakables)) mesh.visible = true;
  };

  // Last onto the chassis: the film has to be laid over glass that already
  // exists, and the blades over the film. The blades are hardware and stay
  // on the body's own material; the film is a coat of dirt with nothing
  // under it when the screen is clean, so it carries its own alpha.
  const filmMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const wipers = buildWipers(spec, material, filmMat, options.screens ?? "fine");
  if (wipers.film) wipers.film.renderOrder = 2;
  chassis.add(wipers.group);

  // The cockpit hangs off the same sprung chassis as everything else, so it
  // squats into a landing with the panels around it — and so the camera's
  // own mount, which is worked out from the same body-local metres, stays
  // exactly where the wheel and the dials are.
  let cockpit: CarCockpit | null = null;
  let tintMat: THREE.MeshBasicMaterial | null = null;
  let cockpitMat: THREE.MeshBasicMaterial | null = null;
  let instrumentMat: THREE.MeshBasicMaterial | null = null;
  let mirrorMat: THREE.MeshBasicMaterial | null = null;
  if (options.cockpit) {
    // The sun strip's own material rather than the grime film's: the film is
    // painted per frame by the wipers, and a band of tint that came and went
    // with the weather is not what a strip on a screen does.
    tintMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    cockpitMat = new THREE.MeshBasicMaterial({ name: COCKPIT_MATERIAL, vertexColors: true });
    instrumentMat = new THREE.MeshBasicMaterial({ name: INSTRUMENT_MATERIAL, vertexColors: true });
    if (options.rearView) {
      mirrorMat = new THREE.MeshBasicMaterial({
        name: INSTRUMENT_MATERIAL,
        map: options.rearView.texture,
      });
    }
    cockpit = buildCockpit(
      spec,
      { shell: cockpitMat, instrument: instrumentMat, tint: tintMat, mirror: mirrorMat },
      options.rearView?.aspect ?? 3.2,
    );
    chassis.add(cockpit.group);
  }

  // THE WATER ON THAT SCREEN, for the driver sat behind it. It rides the
  // same sprung chassis as the glass it is on — but it is not PARENTED to
  // it, because a drop refracts the frame and therefore has to be drawn
  // after the frame exists (car/screen-rain.ts). The chassis is handed over
  // as the thing to read a matrix off instead. It rides the same video row
  // as the grime film: a player who has asked for clean screens is asking
  // for clean screens.
  const screenRain =
    options.cockpit && (options.screens ?? "fine") !== "off"
      ? buildScreenRain(spec, chassis)
      : null;

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
    cockpit?.dispose();
    screenRain?.dispose();
    bodyGeo.dispose();
    for (const geo of partGeos) geo.dispose();
    boltOnGeo?.dispose();
    glassGeo?.dispose();
    lensGeo?.dispose();
    wheelGeo.dispose();
    material.dispose();
    glassMat?.dispose();
    lensMat?.dispose();
    filmMat.dispose();
    tintMat?.dispose();
    cockpitMat?.dispose();
    instrumentMat?.dispose();
    mirrorMat?.dispose();
  };
  return {
    group,
    chassis,
    wheelGroups,
    wheelSpin,
    body,
    lenses,
    breakables,
    unbolt,
    wipers,
    glass: glassMat,
    glassMesh,
    panes,
    doors: doorSkins(spec),
    wheelRadius: spec.wheelRadius,
    lens: lensMat,
    cabin,
    cabinTrim: interior.group,
    cockpitMaterial: cockpitMat,
    steering: interior.steering,
    cockpit,
    screenRain,
    dispose,
  };
}
