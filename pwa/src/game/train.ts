// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAIN (R41), drawn. The engine owns everything that matters about it
// — the line it runs, the timetable, where every vehicle is at this second
// and the solids the car meets there (`engine/mapgen/railway.ts`). This
// module dresses those positions: a consist of merged low-poly vehicles,
// one mesh each, posed every frame from `trainCars(crossing, state.t)` so
// the wagon the car hits is the wagon it sees.
//
// The vocabulary is a Swedish branch line's: the Y1 railbus that runs the
// Inland Line — cream over red, a band of windows the length of it — and,
// for the freights, an orange diesel of the T44 shape hauling timber on
// stanchion flats, box vans, or tank wagons. Each is a dozen boxes and its
// wheels, built through the flora's `GeoBuilder` so it is lit and speckled
// like everything else that stands in the world.
//
// Local frame: wheels on y = 0 (the rail head), +z is the FRONT, and
// `rotation.y = heading` turns it down the line the way every placed thing
// is turned.

import * as THREE from "three";
import { lineAt, trainCars, type RailCrossing, type Track, type TrainCar } from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import { box } from "./house.ts";
import { RAIL } from "./railway.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture } from "./textures.ts";

const PAINT = {
  railbusRed: new THREE.Color(0xa8262a),
  railbusCream: new THREE.Color(0xe9dfc6),
  locoOrange: new THREE.Color(0xd4581c),
  locoBand: new THREE.Color(0x2a2a2c),
  roof: new THREE.Color(0x6f7174),
  glass: new THREE.Color(0x232c36),
  frame: new THREE.Color(0x2c2c2e),
  bogie: new THREE.Color(0x1f1f21),
  wheel: new THREE.Color(0x3a3a3c),
  lamp: new THREE.Color(0xf2e9c8),
  buffer: new THREE.Color(0x4a4a4c),
  timberFlat: new THREE.Color(0x5a4a3c),
  stanchion: new THREE.Color(0x3d3a36),
  log: new THREE.Color(0x8a6a48),
  logEnd: new THREE.Color(0xc9b892),
  boxBrown: new THREE.Color(0x6b3d2e),
  boxRoof: new THREE.Color(0x565553),
  tank: new THREE.Color(0x2e2e30),
  tankBand: new THREE.Color(0x8a8a8c),
};

const trainMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);

/** Body width and the height of the frame over the rail head, m — the
 * same on every vehicle, which is what makes them a train. */
const BODY_W = 2.9;
const FRAME_Y = 1.05;
const WHEEL_R = 0.46;

/** A bogie: a dark block with two wheels showing under it each side. */
function bogie(b: GeoBuilder, z: number): void {
  box(b, PAINT.bogie, 0, 0.62, z, BODY_W - 0.7, 0.36, 2.6);
  for (const side of [-1, 1]) {
    for (const dz of [-0.9, 0.9]) {
      const wheel = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.12, 10);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(side * (RAIL.gauge / 2 + 0.02), WHEEL_R, z + dz);
      b.add(wheel, PAINT.wheel);
    }
  }
}

/** The frame every vehicle stands on, with a buffer beam at each end. */
function frame(b: GeoBuilder, length: number): void {
  box(b, PAINT.frame, 0, FRAME_Y - 0.12, 0, BODY_W - 0.3, 0.24, length - 0.3);
  for (const end of [-1, 1]) {
    box(b, PAINT.buffer, 0, FRAME_Y - 0.1, end * (length / 2 - 0.08), BODY_W - 0.4, 0.34, 0.16);
    for (const side of [-1, 1]) {
      box(b, PAINT.buffer, side * 0.85, FRAME_Y - 0.1, end * (length / 2 + 0.12), 0.3, 0.3, 0.3);
    }
  }
  bogie(b, length / 2 - 2.4);
  bogie(b, -(length / 2 - 2.4));
}

/** A row of windows along both flanks of a body between two heights. */
function windows(
  b: GeoBuilder,
  from: number,
  to: number,
  y: number,
  h: number,
  pitch: number,
): void {
  for (let z = from + pitch / 2; z < to; z += pitch) {
    for (const side of [-1, 1]) {
      box(b, PAINT.glass, side * (BODY_W / 2 + 0.01), y, z, 0.03, h, pitch * 0.62);
    }
  }
}

function railbus(b: GeoBuilder, L: number): void {
  frame(b, L);
  const bodyL = L - 0.6;
  const h = 2.35;
  // Red below the waist, cream above, under a grey roof.
  box(b, PAINT.railbusRed, 0, FRAME_Y + 0.55, 0, BODY_W, 1.1, bodyL);
  box(b, PAINT.railbusCream, 0, FRAME_Y + 1.1 + (h - 1.1) / 2, 0, BODY_W, h - 1.1, bodyL);
  box(b, PAINT.roof, 0, FRAME_Y + h + 0.12, 0, BODY_W - 0.3, 0.26, bodyL - 0.4);
  windows(b, -bodyL / 2 + 1.6, bodyL / 2 - 1.6, FRAME_Y + 1.75, 0.95, 1.9);
  // A cab window and a headlamp at each end.
  for (const end of [-1, 1]) {
    box(b, PAINT.glass, 0, FRAME_Y + 1.75, end * (bodyL / 2 + 0.01), BODY_W - 0.7, 0.95, 0.03);
    box(b, PAINT.lamp, 0, FRAME_Y + 1.0, end * (bodyL / 2 + 0.03), 0.34, 0.24, 0.06);
  }
}

function loco(b: GeoBuilder, L: number): void {
  frame(b, L);
  const bodyL = L - 0.8;
  // A long hood behind a cab that sits a third of the way along: the
  // road-switcher silhouette, orange with a black waist band.
  const hoodH = 2.0;
  box(b, PAINT.locoOrange, 0, FRAME_Y + hoodH / 2, -1.2, BODY_W - 0.5, hoodH, bodyL - 2.4);
  box(b, PAINT.locoBand, 0, FRAME_Y + 0.35, -1.2, BODY_W - 0.44, 0.5, bodyL - 2.4);
  const cabZ = bodyL / 2 - 3.2;
  box(b, PAINT.locoOrange, 0, FRAME_Y + 1.35, cabZ, BODY_W, 2.7, 2.8);
  box(b, PAINT.roof, 0, FRAME_Y + 2.82, cabZ, BODY_W - 0.2, 0.24, 2.9);
  for (const side of [-1, 1]) {
    box(b, PAINT.glass, side * (BODY_W / 2 + 0.01), FRAME_Y + 2.05, cabZ, 0.03, 0.8, 1.6);
  }
  box(b, PAINT.glass, 0, FRAME_Y + 2.05, cabZ + 1.41, BODY_W - 0.6, 0.8, 0.03);
  // A short nose ahead of the cab, the exhaust stack on the hood, lamps.
  box(b, PAINT.locoOrange, 0, FRAME_Y + 0.7, bodyL / 2 - 0.9, BODY_W - 0.6, 1.4, 1.8);
  box(b, PAINT.locoBand, 0, FRAME_Y + hoodH + 0.3, -3.5, 0.5, 0.6, 0.8);
  for (const end of [-1, 1]) {
    const z = end > 0 ? bodyL / 2 : -bodyL / 2;
    for (const side of [-1, 1]) {
      box(b, PAINT.lamp, side * 0.7, FRAME_Y + 0.9, z + end * 0.03, 0.26, 0.22, 0.06);
    }
  }
}

function timberWagon(b: GeoBuilder, L: number): void {
  frame(b, L);
  const bedL = L - 0.8;
  box(b, PAINT.timberFlat, 0, FRAME_Y + 0.1, 0, BODY_W, 0.2, bedL);
  // Four pairs of stanchions, and the logs stacked between them in two
  // bunks, ends showing pale.
  for (let k = 0; k < 4; k++) {
    const z = -bedL / 2 + bedL * ((k + 0.5) / 4);
    for (const side of [-1, 1]) {
      box(b, PAINT.stanchion, side * (BODY_W / 2 - 0.1), FRAME_Y + 1.2, z, 0.14, 2.2, 0.14);
    }
  }
  const logR = 0.19;
  const logL = bedL / 2 - 0.5;
  for (const half of [-1, 1]) {
    const cz = half * (bedL / 4);
    let row = 0;
    for (let y = FRAME_Y + 0.2 + logR; y < FRAME_Y + 2.1; y += logR * 1.75, row++) {
      const across = Math.max(2, 6 - row);
      for (let i = 0; i < across; i++) {
        const x = (i - (across - 1) / 2) * logR * 2.1;
        const log = new THREE.CylinderGeometry(logR, logR, logL, 6);
        log.rotateX(Math.PI / 2);
        log.translate(x, y, cz);
        b.add(log, PAINT.log);
        for (const end of [-1, 1]) {
          const cap = new THREE.CylinderGeometry(logR * 0.9, logR * 0.9, 0.04, 6);
          cap.rotateX(Math.PI / 2);
          cap.translate(x, y, cz + end * (logL / 2 + 0.01));
          b.add(cap, PAINT.logEnd);
        }
      }
    }
  }
}

function boxWagon(b: GeoBuilder, L: number): void {
  frame(b, L);
  const bodyL = L - 0.8;
  const h = 2.4;
  box(b, PAINT.boxBrown, 0, FRAME_Y + h / 2, 0, BODY_W, h, bodyL);
  box(b, PAINT.boxRoof, 0, FRAME_Y + h + 0.1, 0, BODY_W - 0.2, 0.22, bodyL - 0.2);
  // A sliding door in the middle of each flank, proud of the wall.
  for (const side of [-1, 1]) {
    box(b, PAINT.frame, side * (BODY_W / 2 + 0.04), FRAME_Y + h / 2, 0, 0.06, h - 0.3, 2.6);
  }
}

function tankWagon(b: GeoBuilder, L: number): void {
  frame(b, L);
  const tankL = L - 1.6;
  const r = 1.25;
  const tank = new THREE.CylinderGeometry(r, r, tankL, 12);
  tank.rotateX(Math.PI / 2);
  tank.translate(0, FRAME_Y + 0.2 + r, 0);
  b.add(tank, PAINT.tank);
  for (const end of [-1, 1]) {
    const cap = new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.1, 12);
    cap.rotateX(Math.PI / 2);
    cap.translate(0, FRAME_Y + 0.2 + r, end * (tankL / 2 + 0.03));
    b.add(cap, PAINT.tankBand);
  }
  for (const z of [-tankL / 3, 0, tankL / 3]) {
    const band = new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.12, 12);
    band.rotateX(Math.PI / 2);
    band.translate(0, FRAME_Y + 0.2 + r, z);
    b.add(band, PAINT.tankBand);
  }
  box(b, PAINT.tankBand, 0, FRAME_Y + 0.2 + 2 * r + 0.15, 0, 0.6, 0.3, 0.6);
}

/** One vehicle of the consist as a mesh, `rand` being the facet jitter. */
export function buildTrainCar(car: TrainCar, rand: () => number): THREE.Mesh {
  const b = new GeoBuilder(rand);
  switch (car.kind) {
    case "railbus":
      railbus(b, car.length);
      break;
    case "loco":
      loco(b, car.length);
      break;
    case "timber":
      timberWagon(b, car.length);
      break;
    case "box":
      boxWagon(b, car.length);
      break;
    case "tank":
      tankWagon(b, car.length);
      break;
  }
  const mesh = new THREE.Mesh(b.build(), trainMaterial());
  mesh.frustumCulled = true;
  return mesh;
}

export type Trains = {
  group: THREE.Group;
  /** Pose every train from the stage clock. */
  update: (track: Track, t: number) => void;
  dispose: () => void;
};

/** The trains of a stage: one consist per crossing, built the first time
 * its line is asked about (an endless stage grows crossings as it goes),
 * posed from the engine's timetable and hidden while no train is on the
 * line. */
export function createTrains(rand: () => number): Trains {
  const group = new THREE.Group();
  const consists = new Map<RailCrossing, THREE.Mesh[]>();
  const railHead = RAIL.sleeper.height * 0.5 + RAIL.rail.height;

  const consistFor = (crossing: RailCrossing): THREE.Mesh[] => {
    const had = consists.get(crossing);
    if (had) return had;
    const meshes = crossing.schedule.cars.map((car) => {
      const mesh = buildTrainCar(car, rand);
      mesh.visible = false;
      group.add(mesh);
      return mesh;
    });
    consists.set(crossing, meshes);
    return meshes;
  };

  const update = (track: Track, t: number): void => {
    for (const crossing of track.rails) {
      const meshes = consistFor(crossing);
      const cars = trainCars(crossing, t);
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        const placed = cars[i];
        if (!placed) {
          mesh.visible = false;
          continue;
        }
        const at = lineAt(crossing.line, placed.s);
        mesh.visible = true;
        mesh.position.set(at.x, at.y + railHead, at.z);
        // The line's heading runs one way; a train running the other way
        // is turned about so its front leads.
        mesh.rotation.y = at.heading + (placed.direction < 0 ? Math.PI : 0);
      }
    }
  };

  const dispose = (): void => {
    for (const meshes of consists.values()) {
      for (const mesh of meshes) {
        group.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    consists.clear();
  };

  return { group, update, dispose };
}
