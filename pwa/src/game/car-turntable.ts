// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The menu's car turntable: the real in-game body, on its own little
// canvas, turning. The eye line is a person standing beside the car —
// three meters up, six back, looking slightly DOWN over it — because that
// is the angle a car is actually admired from, and it is the one that
// shows the roofline and the shoulder at the same time.
//
// This module owns three.js, so it is loaded as its own chunk (car-picker
// imports it dynamically). Keep it out of any static import chain the app
// shell is on — the entry script has a critical-path budget.

import * as THREE from "three";
import type { CarSpec } from "@engine";

import { buildCarBody } from "./car-body.ts";
import { bodySpecFor } from "./car-styles.ts";

/** Where the viewer stands, meters: eye height and how far back. The
 * downward angle between them (~20°) is the whole point of the shot. */
const EYE_HEIGHT = 3;
const EYE_BACK = 6.2;
/** What the eye is on — a little above the sills, so the car sits in the
 * lower half of the frame with air over the roof rather than centered. */
const AIM_HEIGHT = 0.55;
/** One revolution every this many seconds. Slow enough to read a panel. */
const SPIN_PERIOD = 16;
/** The celebration: three full turns, spent over this many seconds on an
 * ease-out, so it starts as a whip and settles back into the idle spin. */
const CELEBRATE_TURNS = 3;
const CELEBRATE_SECONDS = 1.9;

export type CarTurntable = {
  /** Swap the car on the stand; the spin carries on from where it was. The
   * body is built on the next frame, not inside this call. */
  setCar: (spec: CarSpec) => void;
  /** Whip the car around three times and settle — the acknowledgement that
   * a secret on the chassis has been found. */
  celebrate: () => void;
  /** Match the canvas to its box after a layout change. */
  resize: () => void;
  dispose: () => void;
};

export function createCarTurntable(canvas: HTMLCanvasElement): CarTurntable {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(0, EYE_HEIGHT, -EYE_BACK);
  camera.lookAt(0, AIM_HEIGHT, 0);

  // The stand: a soft disc under the car so it reads as standing on
  // something rather than floating in the menu's scrim.
  const stand = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 40),
    new THREE.MeshBasicMaterial({ color: 0x0d2450, transparent: true, opacity: 0.45 }),
  );
  stand.rotation.x = -Math.PI / 2;
  stand.position.y = -0.01;
  scene.add(stand);

  const pivot = new THREE.Group();
  scene.add(pivot);

  let body: ReturnType<typeof buildCarBody> | null = null;
  let carId: string | null = null;

  const clearBody = (): void => {
    if (!body) return;
    pivot.remove(body.group);
    body.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) mat.dispose();
    });
    body = null;
  };

  /** The car the stand has been asked for but has not built yet. */
  let pending: CarSpec | null = null;

  /** A pick does not build anything — it names the car and lets the next
   * frame build it. Two things follow. The press itself paints first (the
   * arrow's own state, the name under the stand) instead of waiting behind
   * a body's worth of geometry, so the menu answers the click. And a player
   * rowing through the arrows builds only the car they STOP on rather than
   * every one they went past. */
  const setCar = (spec: CarSpec): void => {
    pending = carId === spec.id ? null : spec;
  };

  const fitCar = (spec: CarSpec): void => {
    carId = spec.id;
    clearBody();
    body = buildCarBody(bodySpecFor(spec));
    pivot.add(body.group);
  };

  const resize = (): void => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  let raf = 0;
  let last = performance.now();
  let angle = 0;
  /** How far through a celebration we are, seconds; past its length there
   * is none running. */
  let celebrating = CELEBRATE_SECONDS;

  /** Eased progress through the celebration, 0..1 — cubic ease-out, so the
   * three turns are almost spent by the halfway point and the last of them
   * glides into the idle spin instead of stopping dead. */
  const eased = (at: number): number => 1 - (1 - Math.min(1, at / CELEBRATE_SECONDS)) ** 3;

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    if (pending) {
      const spec = pending;
      pending = null;
      fitCar(spec);
    }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    angle += dt * ((Math.PI * 2) / SPIN_PERIOD);
    if (celebrating < CELEBRATE_SECONDS) {
      const before = eased(celebrating);
      celebrating += dt;
      angle += (eased(celebrating) - before) * CELEBRATE_TURNS * Math.PI * 2;
    }
    pivot.rotation.y = angle;
    renderer.render(scene, camera);
  };
  resize();
  raf = requestAnimationFrame(frame);

  return {
    setCar,
    celebrate: () => {
      celebrating = 0;
    },
    resize,
    dispose: () => {
      cancelAnimationFrame(raf);
      clearBody();
      stand.geometry.dispose();
      (stand.material as THREE.Material).dispose();
      renderer.dispose();
    },
  };
}
