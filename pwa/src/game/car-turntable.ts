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

/** WHERE THE VIEWER STANDS, as a direction rather than a place: the eye is
 * this high for every meter it is back, which is the ~15° looking-down that
 * shows the roofline and the shoulder at the same time. How FAR back it
 * ends up is not authored — `frameCar` works it out from the car and the shape
 * of the canvas, so the same stand fills a phone's tall pane and a laptop's
 * wide one with the same car rather than with the same empty scrim. */
const EYE_RISE = 0.27;
/** How much of the frame is left as air around the car, as a multiple of
 * the distance the car alone would need. Barely over one: this stand is the
 * whole reason the pre-race card exists, and a picture framed like a
 * catalog photograph is a picture with the car in it. */
const FRAME_MARGIN = 1.22;
/** HOW HIGH THE CAR SITS, as a share of the frame's height above the
 * middle. The pre-race card writes the car's name across the head of the
 * stage and its line of billing across the foot, and neither wants bodywork
 * behind it — so the air the margin buys is spent UNDER the car rather than
 * split evenly around it. Bounded by the air there actually is: on a frame
 * the car only just fits into, this quietly comes to nothing rather than
 * lifting the roof out of the picture. */
const FRAME_LIFT = 0.09;
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

  // The stand: a soft disc under the car so it reads as standing on
  // something rather than floating in the menu's scrim. Sized to the car it
  // carries (see `frameCar`) — a fixed disc is a saucer around a hatchback and
  // a coaster under anything longer.
  const stand = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
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

  /** WHAT THE STAND HAS TO FRAME: how far the car reaches from the spin
   * axis, and how high it stands. Measured off the body that was actually
   * built rather than authored beside the catalog, so a longer car is
   * simply framed from further back and nobody has to remember a second
   * table exists. The defaults are a mid-sized rally car, for the frames
   * before the first body has arrived. */
  let carRadius = 2.3;
  let carTop = 1.5;

  const box = new THREE.Box3();

  const fitCar = (spec: CarSpec): void => {
    carId = spec.id;
    clearBody();
    body = buildCarBody(bodySpecFor(spec));
    pivot.add(body.group);
    box.setFromObject(body.group);
    // The car TURNS, so what has to fit is the circle its plan sweeps out
    // about the axis, not the box: the far corner of the box is the whole
    // constraint, and it is the same one at every angle.
    carRadius = Math.max(
      Math.hypot(box.min.x, box.min.z),
      Math.hypot(box.min.x, box.max.z),
      Math.hypot(box.max.x, box.min.z),
      Math.hypot(box.max.x, box.max.z),
    );
    carTop = box.max.y;
    // The disc is the car's own footprint with a little apron, so it reads
    // as a stand under this car rather than as a saucer around it.
    stand.scale.setScalar(carRadius * 1.15);
    frameCar();
  };

  /** Stand the eye where the whole car fills the canvas, whatever shape the
   * canvas is. The pane is a tall slot on a phone and a wide one on a
   * laptop, and a camera parked at an authored distance fills one of them
   * and leaves the other mostly scrim — which on the card whose whole job
   * is showing the car is the one thing it must not do.
   *
   * Two constraints, and the distance is whichever wants more room. SIDEWAYS
   * it is the plan circle above. VERTICALLY it is the roofline plus what
   * that same circle projects into the frame's height once the eye is
   * looking down at it — at this angle a long car takes up screen height by
   * being long as well as by being tall, and a fit that only measured the
   * roof would crop the nose off every wide pane. */
  const frameCar = (): void => {
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const pitch = Math.atan(EYE_RISE);
    // Fit about the car's OWN middle, which is the closest the eye can
    // stand: fitting about an authored eye line instead makes the taller
    // half of the car pay for the shorter one and pushes the shot back.
    const middle = carTop / 2;
    const vNeed = middle * Math.cos(pitch) + carRadius * Math.sin(pitch);
    const dist = FRAME_MARGIN * Math.max(vNeed / Math.tan(vHalf), carRadius / Math.tan(hHalf));
    // Then spend the air below the car rather than around it, by aiming
    // under its middle — never further than the air there is, so the lift
    // gives way before the roofline does.
    const half = dist * Math.tan(vHalf);
    const drop = Math.max(0, Math.min(2 * half * FRAME_LIFT, half - vNeed)) / Math.cos(pitch);
    const aim = middle - drop;
    const back = dist / Math.hypot(1, EYE_RISE);
    camera.position.set(0, aim + back * EYE_RISE, -back);
    camera.lookAt(0, aim, 0);
  };

  /** The box the buffer was last cut to, in CSS pixels. */
  const cut = new THREE.Vector2();

  /** Match the buffer to the canvas box, unless it already is. Checked in
   * DEVICE pixels as well as CSS ones: a backing store a mobile browser
   * reclaimed while the app was away still reads back the size three last
   * asked for, and only the pixels show it. */
  const resize = (): void => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const ratio = renderer.getPixelRatio();
    renderer.getSize(cut);
    if (
      cut.x === w &&
      cut.y === h &&
      canvas.width === Math.floor(w * ratio) &&
      canvas.height === Math.floor(h * ratio)
    ) {
      return;
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // The eye stands where the new SHAPE wants it, not merely where the old
    // one did with a stretched frustum: a pane that goes from wide to tall
    // is a different photograph of the same car, and the distance is part
    // of taking it.
    frameCar();
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
    // Every frame, because a resize EVENT is not the only way a canvas
    // changes size: an iOS PWA comes back from the background into a box it
    // never announced, and a stand that trusted the last event would show
    // the car stretched across the wrong buffer until something rotated.
    resize();
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
