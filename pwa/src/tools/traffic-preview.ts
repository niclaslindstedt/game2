// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// High-traffic preview harness — the page scripts/traffic-preview.mjs
// drives. One row per sky, one column per MOMENT IN A RACE: the grid, then
// twenty seconds in, then a minute, then the flag. The camera drives down a
// road at rally pace with its eyes up, because what is being reviewed is
// the thing a player only sees by looking up.
//
// It exists because no screenshot of a run can review this. The claim the
// change makes — you see a few aircraft per race, and the trails they leave
// build a sky over the course of one — is a claim about a CLOCK, and a
// still frame carries no clock. Four frames of the same sky at four times
// do, and put side by side they answer the two questions that matter: is
// the grid already under a used sky, and has an hour's worth of traffic
// piled up by the finish. The last row is the control: under an overcast
// deck the lanes are above the ceiling and there is nothing to see.
//
// Sets window.__done so the screenshot tool knows the sheet is on screen.

import * as THREE from "three";
import type { GameState, RaceEnv, TimeOfDay, Weather } from "@engine";

import { createAmbientLife } from "../game/ambient-life.ts";
import { createEnvironment } from "../game/environment.ts";

declare global {
  interface Window {
    __done?: boolean;
  }
}

type Row = { name: string; timeOfDay: TimeOfDay; weather: Weather; windSpeed: number };

const ROWS: Row[] = [
  { name: "day", timeOfDay: "day", weather: "clear", windSpeed: 2 },
  { name: "day — hard wind aloft", timeOfDay: "day", weather: "clear", windSpeed: 9 },
  { name: "dusk", timeOfDay: "dusk", weather: "clear", windSpeed: 2 },
  { name: "night", timeOfDay: "night", weather: "clear", windSpeed: 2 },
  { name: "rain — under the deck", timeOfDay: "day", weather: "rain", windSpeed: 5 },
];

/** Where in a race each column stands, s. The last is a two-minute stage's
 * finish line (docs/simulation.md), which is the sky the player has been
 * driving under for the whole run. */
const MOMENTS = [0, 20, 60, 120];

const CELL_W = 460;
const CELL_H = 300;

const STEP = 1 / 60;
/** How fast the camera travels, m/s — rally pace. It matters: the traffic
 * rides the camera in x/z the way the clouds do, and a parked camera would
 * never show whether that reads as sky or as a decal. */
const PACE = 32;
/** How far up the camera looks, rad. Deliberately modest: with a 64-degree
 * lens this frames the skyline and the thirty-odd degrees above it, which
 * is the sky a DRIVER has. Pointing it at the zenith would photograph the
 * traffic at its most flattering and answer the wrong question — what is
 * being reviewed is whether any of this is visible from a rally car. */
const PITCH = 0.34;

async function main(): Promise<void> {
  const width = CELL_W * MOMENTS.length;
  const height = CELL_H * ROWS.length;

  // ONE CELL AT A TIME, copied into a 2D mosaic — not a viewport into one
  // big drawing buffer, which is how a contact sheet is normally cut and
  // which would make this one LIE about the only thing it is for. A point
  // sprite's size in pixels is `size * (drawingBufferHeight / 2) / depth`,
  // so a scissored cell in a canvas five rows tall draws every contrail
  // five times as wide as the game ever will, and tuning a particle
  // against that picture tunes it to a fifth of what it should be.
  const gl = document.createElement("canvas");
  gl.width = CELL_W;
  gl.height = CELL_H;
  const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true });
  renderer.setSize(CELL_W, CELL_H, false);

  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  canvas.width = width;
  canvas.height = height;
  const sheet = canvas.getContext("2d") as CanvasRenderingContext2D;

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
    new THREE.PlaneGeometry(2400, 12000),
    new THREE.MeshLambertMaterial({ color: 0x6f7a45 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const environment = createEnvironment(scene);
  environment.setEffects(1);

  /** The slice of `GameState` the atmosphere actually reads. */
  const state = {
    wind: { x: 0, z: 0 },
    car: { x: 0, y: 0, z: 0, heading: 0 },
  } as unknown as GameState;

  ROWS.forEach((row, r) => {
    const env: RaceEnv = {
      timeOfDay: row.timeOfDay,
      weather: row.weather,
      season: "summer",
      windDir: 0.7,
      windSpeed: row.windSpeed,
      gustPhase: 0,
    };
    environment.apply(env);
    state.wind.x = Math.sin(env.windDir) * env.windSpeed;
    state.wind.z = Math.cos(env.windDir) * env.windSpeed;

    // ONE sky per row, photographed four times as it runs — the columns are
    // moments in a single race and not four separate ones, which is the
    // only way the sheet can show a sky FILLING UP.
    const life = createAmbientLife();
    scene.add(life.group);
    life.setSky(environment.carTint(), environment.ceiling());

    let z = 0;
    // One frame before the first shot, because the sky it opens on is laid
    // by the first update rather than by the constructor — so this IS the
    // grid, and photographing an untouched instance would only show that a
    // pool starts empty.
    life.update(0, 0, state.wind.x, state.wind.z, STEP);
    let clock = STEP;
    MOMENTS.forEach((moment, c) => {
      while (clock < moment) {
        clock += STEP;
        z += PACE * STEP;
        camera.position.set(0, 2.2, z);
        state.car.z = z + 7;
        environment.update(state, camera, STEP);
        life.update(0, z, state.wind.x, state.wind.z, STEP);
      }
      camera.position.set(0, 2.2, z);
      camera.lookAt(0, 2.2 + Math.sin(PITCH) * 100, z + Math.cos(PITCH) * 100);
      renderer.render(scene, camera);
      sheet.drawImage(gl, c * CELL_W, r * CELL_H);
      if (r === 0) addLabel(moment === 0 ? "the grid" : `${moment}s in`, c, 0);
    });

    scene.remove(life.group);
    life.dispose();
    addLabel(row.name, 0, r, 20);
  });

  window.__done = true;
}

void main();
