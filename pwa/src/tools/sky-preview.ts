// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sky preview harness — the page scripts/sky-preview.mjs drives. Renders a
// contact sheet of the REAL atmosphere module (environment.ts, over sky.ts,
// clouds.ts, storm.ts and rain.ts): one row per weather, one column per
// time of day, plus a row that catches a lightning strike at its peak.
//
// It exists because the sky is the one part of this game a screenshot of a
// RUN cannot review. Weather is chosen per stage, a flash lasts a fifth of
// a second, and the difference between the skies is a comparison — you have
// to see the white one beside the black one to know either is right. Sets
// window.__done so the screenshot tool knows the sheet is on screen.

import * as THREE from "three";
import type { GameState, RaceEnv, TimeOfDay, Weather } from "@engine";

import { createEnvironment } from "../game/environment.ts";

declare global {
  interface Window {
    __done?: boolean;
  }
}

/** One row: a weather at a chosen place in its own band. The wind speed IS
 * the dial — `coverOf` reads how heavy a stage's weather is out of where
 * its seeded wind sits inside the band its weather allows. */
type Row = {
  name: string;
  weather: Weather;
  windSpeed: number;
  /** Hold the frame until a strike is at its brightest. */
  catchStrike?: boolean;
};

const ROWS: Row[] = [
  { name: "clear", weather: "clear", windSpeed: 1.5 },
  { name: "rain — thin, high deck", weather: "rain", windSpeed: 3.5 },
  { name: "rain — low and leaden", weather: "rain", windSpeed: 6.5 },
  { name: "storm — squall", weather: "storm", windSpeed: 7 },
  { name: "storm — black anvil", weather: "storm", windSpeed: 11 },
  { name: "storm — the strike", weather: "storm", windSpeed: 11, catchStrike: true },
];

const TIMES: TimeOfDay[] = ["dawn", "day", "dusk", "night"];

const CELL_W = 460;
const CELL_H = 300;

/** How long the sky is run before it is photographed, s, and at what step.
 * The clouds have to have drifted and the rain has to have filled the box. */
const WARM_S = 6;
/** …and how long the strike row is allowed to wait for one, s. A storm
 * strikes several times a minute at its peak, so this is many chances. */
const HUNT_S = 90;
/** How bright a flash has to be before it is worth photographing, 0..1 of
 * the light it puts on the world. Set where the strike is inside a
 * kilometre and a half, which is where a CHANNEL is drawn rather than only
 * the cloud lighting up from inside — a distant sheet flash is a real part
 * of a storm and a poor portrait of one. Brighter than this and the flash
 * blows the frame out, hiding the very thing the row is for. */
const WORTH_A_SHOT = 0.15;
const STEP = 1 / 60;
/** How fast the camera is travelling while it warms up, m/s — rally pace,
 * because the rain is drawn at the velocity it is SEEN at and a parked
 * camera photographs a completely different sheet. */
const PACE = 32;

/** How far down the road the harness ever drives, m — the strike row runs
 * the longest and everything it can see has to reach that far. */
const RUN_M = 1700;

/** Trees to put something in front of the light. Spread over the whole run,
 * because a camera that drives out of the wood photographs an empty plain
 * and says nothing about the light. */
function plant(scene: THREE.Scene): void {
  const trunk = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
  const needle = new THREE.MeshLambertMaterial({ color: 0x2f5d3a });
  for (let i = 0; i < 420; i++) {
    const a = (i / 420) * Math.PI * 2 * 31;
    const r = 16 + ((i * 37) % 120);
    const x = Math.sin(a) * r;
    const z = ((i * 149) % (RUN_M + 120)) - 60;
    if (Math.abs(x) < 7) continue;
    const h = 7 + ((i * 13) % 9);
    const tree = new THREE.Group();
    const bole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, h * 0.35, 5), trunk);
    bole.position.y = h * 0.175;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28, h * 0.8, 6), needle);
    crown.position.y = h * 0.55;
    tree.add(bole, crown);
    tree.position.set(x, 0, z);
    scene.add(tree);
  }
}

async function main(): Promise<void> {
  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const width = CELL_W * TIMES.length;
  const height = CELL_H * ROWS.length;
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

  const camera = new THREE.PerspectiveCamera(64, CELL_W / CELL_H, 0.5, 2400);

  const scene = new THREE.Scene();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, RUN_M * 2 + 800),
    new THREE.MeshLambertMaterial({ color: 0x6f7a45 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(9, RUN_M * 2 + 800),
    new THREE.MeshLambertMaterial({ color: 0x6b5033 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  scene.add(road);
  plant(scene);

  const environment = createEnvironment(scene);
  environment.setEffects(1);

  /** The slice of `GameState` the atmosphere actually reads. */
  const state = {
    wind: { x: 0, z: 0 },
    car: { x: 0, y: 0, z: 0, heading: 0 },
  } as unknown as GameState;

  ROWS.forEach((row, r) => {
    TIMES.forEach((timeOfDay, c) => {
      const env: RaceEnv = {
        timeOfDay,
        weather: row.weather,
        season: "summer",
        windDir: 0.7,
        windSpeed: row.windSpeed,
        gustPhase: 0,
      };
      environment.apply(env);
      // A steady quartering wind, which is what the sheet leans on.
      state.wind.x = Math.sin(env.windDir) * env.windSpeed;
      state.wind.z = Math.cos(env.windDir) * env.windSpeed;

      let z = 0;
      let held = 0;
      const steps = Math.round((row.catchStrike ? HUNT_S : WARM_S) / STEP);
      for (let i = 0; i < steps; i++) {
        z += PACE * STEP;
        // The strike row can drive for a minute and a half looking for a
        // bolt; wrapping keeps it inside the wood instead of photographing
        // the far edge of the ground plane. The rain is camera-relative, so
        // a wrap moves the sheet with it and costs one frame of streak.
        if (z > RUN_M) z -= RUN_M;
        camera.position.set(0, 2.2, z);
        camera.lookAt(0, 3.4, z + 40);
        // The lamps are aimed at the CAR, which in the game is ahead of and
        // below the camera; put it there or the pools start at the lens.
        state.car.z = z + 7;
        environment.update(state, camera, STEP);
        // A flash is a fifth of a second in six seconds of sky, so the
        // strike row waits for one and photographs it at its brightest
        // rather than hoping the last frame happens to be lit.
        if (row.catchStrike) {
          const surge = environment.flash();
          if (surge > held) held = surge;
          // A stroke jumps the light up and it decays from there, so the
          // frame where the surge has just matched the running peak IS the
          // peak.
          if (held > WORTH_A_SHOT && surge >= held) break;
        }
      }

      // The strike row exists to show the CHANNEL, and a bolt is thrown on
      // a random bearing: a camera pointed down the road sees one in four
      // of them. So the shot turns to face the strike it caught.
      if (row.catchStrike && held > WORTH_A_SHOT) {
        const from = environment.flashFrom();
        camera.lookAt(
          camera.position.x + from.x * 60,
          camera.position.y + 12,
          camera.position.z + from.z * 60,
        );
      }
      const y = height - (r + 1) * CELL_H;
      renderer.setViewport(c * CELL_W, y, CELL_W, CELL_H);
      renderer.setScissor(c * CELL_W, y, CELL_W, CELL_H);
      renderer.render(scene, camera);
      if (r === 0) addLabel(timeOfDay, c, 0);
    });
    addLabel(row.name, 0, r, 20);
  });

  window.__done = true;
}

void main();
