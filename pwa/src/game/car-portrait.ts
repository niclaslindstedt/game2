// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PORTRAIT STAND — one car, photographed once, front three-quarter, onto
// a small canvas that becomes a picture. The result sheet (results-sheet.tsx)
// puts one beside every crew's name: the car IS the crew at the distance a
// results row is read from, and Blink's electric blue hatch says who that
// row is before the letters do.
//
// It is a STILL, not a stand that keeps turning: fifteen live turntables on
// one card would be fifteen WebGL contexts and a frame budget spent on
// pictures the size of a stamp. So the body is built, shot, and torn down
// again in one call, and the picture is what is kept — car-portraits.ts owns
// the roll, and the pace the shots are taken at.
//
// This module owns three.js, so it is loaded as its own chunk (the roll
// imports it dynamically). Keep it out of any static import chain the app
// shell is on — the entry script has a critical-path budget.

import * as THREE from "three";
import type { CarSpec } from "@engine";

import { buildCarBody } from "./car-body.ts";
import type { Livery } from "./car-livery.ts";
import { bodySpecFor } from "./car-styles.ts";

/** The picture, in device pixels. A results row shows it about 3.6rem wide,
 * which is under 120 CSS px on any screen this game runs on, so this is a
 * clean 2x on a phone and more than that on a laptop. */
export const PORTRAIT_WIDTH = 240;
export const PORTRAIT_HEIGHT = 150;

/** Where the camera stands, off the car's own size: azimuth from the nose
 * (radians), elevation above the sills (radians), and distance in car
 * lengths. The front three-quarter is the angle a car is identified from —
 * the grille, the flank and the roof colour all at once. */
const AZIMUTH = 0.62;
const ELEVATION = 0.24;
const DISTANCE = 1.42;

/** The narrow lens the shot is framed with. A long lens at a car and a half
 * keeps the near wheel and the far wheel the same size, which is what makes
 * a stamp-sized picture read as a CAR rather than as a wedge. */
const FOV = 26;

export type PortraitStand = {
  /** Build `spec` in `paint` (the player's own colours when no paint is
   * given), shoot it, and hand back the picture as a data URL. The body
   * exists only for the duration of the call. */
  shoot: (spec: CarSpec, paint?: Livery) => string;
  dispose: () => void;
};

export function createPortraitStand(): PortraitStand {
  const canvas = document.createElement("canvas");
  canvas.width = PORTRAIT_WIDTH;
  canvas.height = PORTRAIT_HEIGHT;
  // Transparent, so the picture sits on whatever row it is put on — a
  // highlighted row, a plain one — without a box round it. The drawing
  // buffer is kept because it is read back the moment it is drawn.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, PORTRAIT_WIDTH / PORTRAIT_HEIGHT, 0.1, 60);
  const bounds = new THREE.Box3();
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();

  const shoot = (spec: CarSpec, paint?: Livery): string => {
    // Nothing behind the glass and nothing on it: at this size the cabin is
    // a dark shape either way, and the crew's own helmets would be two
    // pixels. The paint is the whole portrait.
    const body = buildCarBody(bodySpecFor(spec, paint), { interior: "off", screens: "off" });
    scene.add(body.group);
    // Framed off the body that was actually built rather than off a number
    // per car: a long sedan and a short hatch both fill the frame.
    bounds.setFromObject(body.group);
    bounds.getSize(size);
    bounds.getCenter(centre);
    const length = Math.max(size.z, 1);
    const d = DISTANCE * length;
    const aim = new THREE.Vector3(centre.x, bounds.min.y + size.y * 0.42, centre.z);
    camera.position.set(
      aim.x + Math.sin(AZIMUTH) * Math.cos(ELEVATION) * d,
      aim.y + Math.sin(ELEVATION) * d,
      aim.z + Math.cos(AZIMUTH) * Math.cos(ELEVATION) * d,
    );
    camera.lookAt(aim);
    renderer.render(scene, camera);
    const picture = canvas.toDataURL("image/png");
    scene.remove(body.group);
    body.dispose();
    return picture;
  };

  return {
    shoot,
    dispose: () => {
      renderer.dispose();
      // The context itself, not just the objects on it: a browser allows a
      // page a handful of WebGL contexts, and a stand that has taken its
      // pictures has no claim on one.
      renderer.forceContextLoss();
    },
  };
}
