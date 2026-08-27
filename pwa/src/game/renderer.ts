// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The renderer facade: owns the THREE scene, swaps worlds when a new stage
// arrives, and draws one frame from the GameState the engine produced. The
// engine never imports THREE; this module never steps physics. Sky, fog,
// lights, and weather live in environment.ts; this file wires them to the
// run and drives the ground-contact and exhaust particle systems.

import * as THREE from "three";
import type { GameEvent, GameState } from "@engine";

import { createAmbientLife } from "./ambient-life.ts";
import { createGameCamera, type CameraMode } from "./camera.ts";
import { buildCar, type CarVisual } from "./car-mesh.ts";
import { createDust } from "./dust.ts";
import { createEnvironment } from "./environment.ts";
import { createFumes } from "./fumes.ts";
import { createRain } from "./rain.ts";
import { buildWorld, type World } from "./world.ts";

export type GameRenderer = {
  setGame: (state: GameState) => void;
  /** Re-light an already-built stage (the pre-race menu flipping time of
   * day / weather) without rebuilding its geometry. */
  setConditions: (state: GameState) => void;
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
  const environment = createEnvironment(scene);

  const chase = createGameCamera(canvas.clientWidth || 1, canvas.clientHeight || 1);
  const dust = createDust();
  scene.add(dust.points);
  const fumes = createFumes();
  scene.add(fumes.points);
  const rain = createRain();
  scene.add(rain.lines);
  const life = createAmbientLife();
  scene.add(life.group);

  let world: World | null = null;
  let car: CarVisual | null = null;
  let dustClock = 0;
  let fumeClock = 0;

  /** The environment's light tint, pushed onto everything that carries its
   * own baked or vertex colors (the car, the particles). */
  const applyTint = (): void => {
    const tint = environment.carTint();
    car?.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.PointsMaterial) {
            mat.color.copy(tint);
          }
        }
      }
    });
    (dust.points.material as THREE.PointsMaterial).color.copy(tint);
    (fumes.points.material as THREE.PointsMaterial).color.copy(tint);
    life.setTint(tint);
  };

  const setConditions = (state: GameState): void => {
    environment.apply(state.env);
    rain.setIntensity(state.env.weather === "storm" ? 1 : state.env.weather === "rain" ? 0.55 : 0);
    applyTint();
  };

  const setGame = (state: GameState): void => {
    if (world) {
      scene.remove(world.group);
      world.dispose();
    }
    if (car) {
      scene.remove(car.group, car.shadow, car.debris);
      car.dispose();
    }
    world = buildWorld(state.track);
    scene.add(world.group);
    car = buildCar(state.spec);
    scene.add(car.group, car.shadow, car.debris);
    setConditions(state);
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
      } else if (ev.type === "impact") {
        // The hit lands where the engine says it did: a debris-grey burst
        // at that point on the body, and a camera jolt sized to the speed.
        chase.kick(Math.min(0.9, 0.25 + ev.speed * 0.02));
        const a = c.heading + ev.angle;
        const reach = ev.belly ? 0 : 1.6;
        dust.spawn(
          c.x + Math.sin(a) * reach,
          c.y + (ev.belly ? 0.1 : 0.5),
          c.z + Math.cos(a) * reach,
          0x8a8578,
          Math.min(30, 8 + Math.round(ev.speed)),
          3.5,
        );
      }
    }
    car?.onEvents(state, events);
  };

  const render = (state: GameState, dt: number): void => {
    const c = state.car;
    const fwdX = Math.sin(c.heading);
    const fwdZ = Math.cos(c.heading);
    const rightX = Math.cos(c.heading);
    const rightZ = -Math.sin(c.heading);

    // Gravel kicked up at the wheels — the ground-contact half of the speed
    // feel. Three overlapping sources, strongest first: the drift/off-road
    // rooster tail, the braking plume, and the plain rolling kickup that
    // rides with pace. Particles inherit part of the car's wake plus the
    // wind, so every cloud streams backward and leans downwind.
    dustClock += dt;
    if (!c.airborne && dustClock > 0.03) {
      dustClock = 0;
      // The engine tracks the driven surface — road fords AND the wild's
      // lakes and streams throw the blue spray.
      const color = state.surface === "water" ? 0x4fa0f0 : 0xb29268;
      const wakeX = -fwdX * c.u * 0.35 + state.wind.x * 0.6;
      const wakeZ = -fwdZ * c.u * 0.35 + state.wind.z * 0.6;
      // The tires letting go is what throws gravel — `slide` is that
      // number, so the plume comes up the instant the car is asked for more
      // grip than it has, not once the angle has already developed.
      const sideways = c.slide > 0.15 && c.u > 6;
      const rear = (side: number, count: number, spread: number): void =>
        dust.spawn(
          c.x - fwdX * 1.5 + rightX * side * 0.8,
          c.y + 0.15,
          c.z - fwdZ * 1.5 + rightZ * side * 0.8,
          color,
          count,
          spread,
          wakeX,
          wakeZ,
        );
      if (sideways || state.offRoad) {
        // The drift plume also blows toward the slide, off the outside
        // wheels, and thickens as the slide deepens.
        const thrown = 4 + Math.round(c.slide * 5);
        rear(-1, thrown, 3.5);
        rear(1, thrown, 3.5);
      } else if (c.braking && c.u > 8) {
        rear(-1, 4, 2.5);
        rear(1, 4, 2.5);
      } else if (c.u > 15) {
        rear(Math.random() < 0.5 ? -1 : 1, 2, 1.6);
      }
    }

    // Exhaust: puffs off the tailpipe, faster and sootier on throttle and
    // boost, handed to the wind the moment they leave the pipe.
    fumeClock += dt;
    const fumeEvery = c.boosting ? 0.02 : c.u > 1 ? 0.045 : 0.12;
    if (!c.airborne && fumeClock > fumeEvery) {
      fumeClock = 0;
      const shade = c.boosting ? 0.9 : 0.35 + 0.4 * Math.min(1, c.u / 30);
      fumes.spawn(
        c.x - fwdX * 1.9 + rightX * 0.35,
        c.y + 0.32,
        c.z - fwdZ * 1.9 + rightZ * 0.35,
        -fwdX * c.u * 0.15 + state.wind.x * 0.85,
        -fwdZ * c.u * 0.15 + state.wind.z * 0.85,
        shade,
      );
    }

    dust.update(dt);
    fumes.update(dt);
    // An endless run streams its world: the road chunks and terrain tiles
    // ahead get built here, the ones far behind get dropped.
    world?.sync(state);
    world?.update(dt);
    car?.update(state, dt);
    chase.update(state, dt);
    environment.update(state, chase.camera, dt);
    const cam = chase.camera.position;
    rain.update(cam.x, cam.y, cam.z, state.wind.x, state.wind.z, dt);
    life.update(cam.x, cam.z, state.wind.x, state.wind.z, dt);
    // The hood cam sits inside the car — hide the body so it doesn't fill
    // the frame; the blob shadow stays for ground reference.
    if (car) car.group.visible = chase.mode() !== "hood";
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
    fumes.dispose();
    rain.dispose();
    life.dispose();
    environment.dispose();
    renderer.dispose();
  };

  resize();
  return {
    setGame,
    setConditions,
    cycleCamera: () => chase.cycle(),
    render,
    onEvents,
    resize,
    dispose,
  };
}
