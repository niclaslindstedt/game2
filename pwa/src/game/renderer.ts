// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The renderer facade: owns the THREE scene, swaps worlds when a new stage
// arrives, and draws one frame from the GameState the engine produced. The
// engine never imports THREE; this module never steps physics.

import * as THREE from "three";
import type { GameEvent, GameState } from "@engine";

import { createGameCamera, type CameraMode } from "./camera.ts";
import { buildCar, type CarVisual } from "./car-mesh.ts";
import { createDust } from "./dust.ts";
import { buildWorld, type World } from "./world.ts";
import { PALETTE } from "../identity.ts";

export type GameRenderer = {
  setGame: (state: GameState) => void;
  cycleCamera: () => CameraMode;
  render: (state: GameState, dt: number) => void;
  onEvents: (state: GameState, events: GameEvent[]) => void;
  resize: () => void;
  dispose: () => void;
};

export function createRenderer(canvas: HTMLCanvasElement): GameRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.horizon, 160, 520);

  // Cloud puffs: flattened white spheres parked high up; they follow the
  // camera laterally so the sky never runs out.
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({ color: "#ffffff", fog: false });
  const cloudGeo = new THREE.SphereGeometry(1, 7, 5);
  for (let i = 0; i < 10; i++) {
    const puff = new THREE.Mesh(cloudGeo, cloudMat);
    const angle = (i / 10) * Math.PI * 2;
    const radius = 220 + (i % 3) * 90;
    puff.position.set(Math.sin(angle) * radius, 90 + (i % 4) * 22, Math.cos(angle) * radius);
    const s = 18 + (i % 5) * 7;
    puff.scale.set(s, s * 0.35, s * 0.8);
    clouds.add(puff);
  }
  scene.add(clouds);

  const chase = createGameCamera(canvas.clientWidth || 1, canvas.clientHeight || 1);
  const dust = createDust();
  scene.add(dust.points);

  let world: World | null = null;
  let car: CarVisual | null = null;
  let dustClock = 0;

  const setGame = (state: GameState): void => {
    if (world) {
      scene.remove(world.group);
      world.dispose();
    }
    if (car) {
      scene.remove(car.group, car.shadow);
      car.dispose();
    }
    world = buildWorld(state.track);
    scene.add(world.group);
    car = buildCar(state.spec);
    scene.add(car.group, car.shadow);
  };

  const onEvents = (state: GameState, events: GameEvent[]): void => {
    const c = state.car;
    for (const ev of events) {
      if (ev.type === "landing") {
        chase.kick(ev.clean ? 0.25 : 0.5);
        dust.spawn(c.x, c.y + 0.2, c.z, 0xb29268, ev.clean ? 14 : 26, 4);
      } else if (ev.type === "splash") {
        chase.kick(0.2);
        dust.spawn(c.x, c.y + 0.3, c.z, 0x4fa0f0, 30, 5);
      } else if (ev.type === "takeoff") {
        dust.spawn(c.x, c.y + 0.1, c.z, 0xb29268, 10, 3);
      } else if (ev.type === "respawn") {
        chase.kick(0.3);
      }
    }
  };

  const render = (state: GameState, dt: number): void => {
    const c = state.car;
    // Rooster tail: dust streams off the rear while drifting or off-road.
    dustClock += dt;
    const sideways = Math.abs(c.slip) > 0.12 && !c.airborne && c.u > 6;
    if ((sideways || state.offRoad) && dustClock > 0.03) {
      dustClock = 0;
      const back = 1.6;
      const bx = c.x - Math.sin(c.heading) * back;
      const bz = c.z - Math.cos(c.heading) * back;
      const inWater = state.track.samples[state.progressIndex]?.surface === "water";
      dust.spawn(bx, c.y + 0.15, bz, inWater ? 0x4fa0f0 : 0xb29268, 4, 3);
    }
    dust.update(dt);
    car?.update(state, dt);
    chase.update(state, dt);
    // The hood cam sits inside the car — hide the body so it doesn't fill
    // the frame; the blob shadow stays for ground reference.
    if (car) car.group.visible = chase.mode() !== "hood";
    clouds.position.set(chase.camera.position.x, 0, chase.camera.position.z);
    renderer.render(scene, chase.camera);
  };

  const resize = (): void => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    chase.resize(w, h);
  };

  const dispose = (): void => {
    world?.dispose();
    car?.dispose();
    dust.dispose();
    cloudGeo.dispose();
    cloudMat.dispose();
    renderer.dispose();
  };

  resize();
  return { setGame, cycleCamera: () => chase.cycle(), render, onEvents, resize, dispose };
}
