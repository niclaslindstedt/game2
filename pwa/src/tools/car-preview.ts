// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Car preview harness — the page scripts/car-preview.mjs drives. Reads
// /variants.json ({ cars: [{ id, spec }] }), builds each car with the real
// in-game builder, and renders a contact sheet: one row per car, one
// column per view — the chase-cam gaming angle first (straight and mid-
// drift), then turntable angles for judging the shape. Sets window.__done
// so the screenshot tool knows the sheet is on screen.

import * as THREE from "three";

import { buildCarBody, type CarBodySpec } from "../game/car-body.ts";
import { createDirtPainter, wheelSpray, type DirtCoat } from "../game/car-dirt.ts";
import { gravelTexture } from "../game/textures.ts";

declare global {
  interface Window {
    __done?: boolean;
  }
}

type Variant = { id: string; spec: CarBodySpec };

type View = {
  name: string;
  fov: number;
  /** Chase-cam replica: fixed behind-the-car position; yaw turns the CAR
   * so the drift angle shows exactly as it does in game. */
  game?: { carYaw: number };
  /** Turntable: azimuth from the nose, elevation, distance in car lengths. */
  orbit?: { az: number; el: number; dist: number };
  /** Bake this much grime onto the car before rendering. Dirt only ever
   * accumulates, so a dirty view has to come after every clean one. */
  dirt?: DirtCoat;
};

const VIEWS: View[] = [
  { name: "game", fov: 64, game: { carYaw: 0 } },
  { name: "game drift", fov: 64, game: { carYaw: 0.55 } },
  { name: "front 3/4", fov: 35, orbit: { az: 0.62, el: 0.26, dist: 1.55 } },
  { name: "side", fov: 35, orbit: { az: Math.PI / 2, el: 0.1, dist: 1.45 } },
  { name: "rear 3/4", fov: 35, orbit: { az: Math.PI - 0.62, el: 0.28, dist: 1.55 } },
  { name: "top", fov: 35, orbit: { az: 0.4, el: 1.15, dist: 1.5 } },
  // A stage's worth of grime, in the view that has to survive it.
  {
    name: "dirty",
    fov: 35,
    orbit: { az: 0.62, el: 0.26, dist: 1.55 },
    dirt: { dust: 0.85, mud: 0.6 },
  },
  // Dead astern, because the back window is the one panel of the car the
  // player looks at for a whole stage — and because the fan a single wiper
  // cuts out of a caked screen is a SHAPE, which is only a shape from
  // square on. Every other cell here can be judged at three quarters; this
  // one cannot.
  {
    name: "dirty rear",
    fov: 35,
    orbit: { az: Math.PI, el: 0.16, dist: 1.15 },
    dirt: { dust: 0.9, mud: 0.35 },
  },
];

const CELL_W = 440;
const CELL_H = 310;

async function main(): Promise<void> {
  const res = await fetch("/variants.json");
  const { cars } = (await res.json()) as { cars: Variant[] };

  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const width = CELL_W * VIEWS.length;
  const height = CELL_H * cars.length;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(width, height, true);
  renderer.setScissorTest(true);

  const labels = document.getElementById("labels") as HTMLDivElement;
  const addLabel = (text: string, col: number, row: number, dy = 0): void => {
    const div = document.createElement("div");
    div.className = "label";
    div.textContent = text;
    div.style.left = `${col * CELL_W}px`;
    div.style.top = `${row * CELL_H + dy}px`;
    labels.appendChild(div);
  };

  const camera = new THREE.PerspectiveCamera(60, CELL_W / CELL_H, 0.1, 300);

  cars.forEach((variant, row) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#3fa9f5");
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshBasicMaterial({ map: gravelTexture() }),
    );
    (ground.material.map as THREE.Texture).repeat.set(48, 48);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const car = buildCarBody(variant.spec);
    scene.add(car.group);
    const dirty = createDirtPainter(car.group, wheelSpray(variant.spec));

    const zs = variant.spec.profile.map((p) => p.z);
    const length = Math.max(...zs) - Math.min(...zs);

    VIEWS.forEach((view, col) => {
      if (view.dirt) {
        dirty(view.dirt);
        // The screens soil on their own clock (car/wipers.ts), so a dirty
        // car with showroom glass is a lie the sheet would tell every time.
        // A stage's worth of grime in one step, and then a couple of seconds
        // at a frame at a time so the blades take ONE stroke through it and
        // park: the swept fan is the whole look of a rally car's glass, and
        // a screen caked evenly to the edges says nothing about the wipers
        // it is wearing.
        // A stage's worth of grime in one step, and then TEN SECONDS a
        // frame at a time. The blades run on demand and wait between
        // strokes on a dry screen (car/wipers.ts's `REST.dry`), so a handful
        // of frames catches them parked in the middle of that wait and the
        // sheet photographs a screen nobody has wiped. Ten seconds is longer
        // than the wait, so every cell lands on or just after a stroke —
        // which is the state worth looking at, because the swept fan is the
        // whole look of a rally car's glass.
        const level = Math.max(view.dirt.dust, view.dirt.mud);
        car.wipers.update(0, level, 20);
        for (let n = 0; n < 500; n++) car.wipers.update(0, level, 0.02);
      }
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
      if (view.game) {
        car.group.rotation.y = view.game.carYaw;
        camera.position.set(0, 2.5, -7.2);
        camera.lookAt(0, 1.05, 6);
      } else if (view.orbit) {
        car.group.rotation.y = 0;
        const { az, el, dist } = view.orbit;
        const d = dist * length;
        const target = new THREE.Vector3(0, 0.62, 0);
        camera.position.set(
          target.x + Math.sin(az) * Math.cos(el) * d,
          target.y + Math.sin(el) * d,
          target.z + Math.cos(az) * Math.cos(el) * d,
        );
        camera.lookAt(target);
      }
      const y = height - (row + 1) * CELL_H;
      renderer.setViewport(col * CELL_W, y, CELL_W, CELL_H);
      renderer.setScissor(col * CELL_W, y, CELL_W, CELL_H);
      renderer.render(scene, camera);
      if (row === 0) addLabel(view.name, col, 0);
    });
    addLabel(variant.id, 0, row, 20);
  });

  window.__done = true;
}

void main();
