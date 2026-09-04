// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Roll-camera preview harness — the page scripts/roll-cam.mjs drives. It
// trips a car and photographs the shot it goes over in (camera-roll.ts),
// frame by frame, from each end of the camera ladder.
//
// It exists for the same reason the view-change sheet does, only more so. A
// roll is over in two or three seconds and no single frame says anything
// about it: what is being judged is whether the lens LETS GO — whether it
// comes to rest instead of whipping round with a spinning body, whether the
// car stays in the middle of the picture and a readable size while it goes
// away, and whether the shot finds its way back to the driving camera
// afterwards without a cut in it. All four are properties of one frame
// beside the next one, which is what this lays out.
//
// ...and the other half of the decision is on the sheet with it: the in-car
// rigs are NOT planted, they go over with the body, so the second row is a
// cockpit turning through a roll rather than a shot of one.
//
// The trip is STAGED rather than driven into: the car is thrown off the
// ground and given the sideways speed that `air.tripSlide` puts a body over
// on, which is the same recipe scripts/roll-lab.mjs uses. Everything after
// that is the engine's own roll, and everything under the pictures is the
// camera's own reading.

import * as THREE from "three";
import { TUNING, botInput, createGame, step, type GameState } from "@engine";

import { createRenderer } from "../game/renderer.ts";
import { DEFAULT_SETTINGS } from "../game/settings.ts";

declare global {
  interface Window {
    __done?: boolean;
  }
}

/** The stage the roll is staged on, and the seconds of bot driving under the
 * camera first — the shot plants from the view the player was driving in, so
 * the rig has to have been driving. */
const STAGE = { seed: 38, length: "short", carId: "compact" } as const;
const RUN_IN = 3;

/** THE TRIP: the climb the car is thrown off the ground with, m/s, and the
 * sideways speed pinned on through the flight. Well past `air.tripSlide`, so
 * the landing goes over rather than merely lurching. */
const TRIP = { lift: 6.5, across: -26 };

/** Which seats the roll is watched from — and the pair is the point. `chase`
 * is an outside rig, which plants and watches; `cockpit` is bolted to the
 * body and goes over with it. The two rows are the two halves of the
 * decision, side by side, and a row of upholstery under a `chase` label (or
 * a planted shot under `cockpit`) is the sheet failing loudly. */
const SEATS = ["chase", "cockpit"] as const;

/** The sheet: tile size, and the columns it wraps at — one row per half of a
 * seat's roll, so a roll is read across and the seats down. */
const TILE = { width: 320, height: 180, cols: 8 };

/** Frames rendered per seat, the ones photographed, and how many. Sixteen
 * tiles a sixth of a second apart cover two and a half seconds: the trip, the
 * roll, the beat the car is left lying, and the flight home. */
const PER_SEAT = 260;
const SHOT_EVERY = 10;
const SHOTS = TILE.cols * 2;

/** The frame the harness renders at, s. Fixed rather than wall-clock, for the
 * view sheet's reason: a software rasterizer draws this scene at a few frames
 * a second, and a shot stepped on THAT dt is a shot nobody would ever see. */
const FRAME = 1 / 60;

type Shot = { image: ImageBitmap; label: string; head: boolean };

async function main(): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = TILE.width;
  canvas.height = TILE.height;
  canvas.style.width = `${TILE.width}px`;
  canvas.style.height = `${TILE.height}px`;
  document.body.append(canvas);

  const renderer = createRenderer(canvas, DEFAULT_SETTINGS.video);
  renderer.resize();
  const shots: Shot[] = [];
  const ticks = Math.round(FRAME / TUNING.dt);
  const seat = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const toCar = new THREE.Vector3();

  for (const view of SEATS) {
    const game: GameState = createGame({
      seed: STAGE.seed,
      carId: STAGE.carId,
      length: STAGE.length,
      skipCountdown: true,
      quiet: true,
    });
    renderer.setGame(game);
    renderer.setCamera(view);
    renderer.skipIntroShot();
    const drive = (): void => {
      for (let t = 0; t < ticks; t++) step(game, botInput(game));
      renderer.render(game, FRAME);
    };
    for (let f = 0; f < Math.round(RUN_IN / FRAME); f++) drive();

    // Off the ground, and crossed up: the trip. The sideways speed is pinned
    // for as long as the car is flying, which is what `air.tripSlide` reads
    // on the way back down.
    game.car.airborne = true;
    game.car.vy = TRIP.lift;
    let was = { at: new THREE.Vector3(), had: false };
    for (let f = 0; f < PER_SEAT; f++) {
      if (game.car.airborne && !game.car.rolling) game.car.w = TRIP.across;
      drive();
      if (f % SHOT_EVERY !== 0 || f / SHOT_EVERY >= SHOTS) continue;
      const pose = renderer.cameraPose();
      seat.set(pose.x, pose.y, pose.z);
      toCar.set(game.car.x - pose.x, game.car.y - pose.y, game.car.z - pose.z);
      // The pose's yaw and pitch are the GAME's convention (z+ is forward,
      // camera-free.ts's `poseOf`), so the direction is rebuilt from them
      // rather than taken off a three.js Euler, which faces the other way.
      forward.set(
        Math.sin(pose.yaw) * Math.cos(pose.pitch),
        Math.sin(pose.pitch),
        Math.cos(pose.yaw) * Math.cos(pose.pitch),
      );
      // The three readings that say whether this is a shot: how far the lens
      // has moved since the frame before (a planted one moves in centimetres
      // and then in nothing), how far away the car is, and how far off the
      // middle of the picture it has been allowed to drift.
      const moved = was.had ? `+${seat.distanceTo(was.at).toFixed(2)}m` : "planting";
      const off = ((forward.angleTo(toCar) * 180) / Math.PI).toFixed(0);
      was = { at: seat.clone(), had: true };
      shots.push({
        image: await createImageBitmap(canvas),
        label:
          f === 0
            ? `${view}  the trip`
            : `+${(f * FRAME).toFixed(2)}s  ${moved}  ${toCar.length().toFixed(0)}m off ${off}°${
                game.car.rolling ? "  ROLLING" : ""
              }`,
        head: f === 0,
      });
    }
  }

  // THE SHEET. Drawn once at the end so the tiles are the frames themselves
  // rather than a canvas that has been drawn over since.
  const rows = Math.ceil(shots.length / TILE.cols);
  const sheet = document.createElement("canvas");
  sheet.id = "stage";
  sheet.width = TILE.cols * TILE.width;
  sheet.height = rows * (TILE.height + 22);
  const ctx = sheet.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.font = "12px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  shots.forEach((shot, i) => {
    const x = (i % TILE.cols) * TILE.width;
    const y = Math.floor(i / TILE.cols) * (TILE.height + 22);
    ctx.drawImage(shot.image, x, y, TILE.width, TILE.height);
    ctx.fillStyle = shot.head ? "#fd8" : "#8bd";
    ctx.fillText(shot.label, x + 6, y + TILE.height + 11);
  });
  canvas.remove();
  document.body.append(sheet);
  renderer.dispose();
  window.__done = true;
}

document.body.style.margin = "0";
document.body.style.background = "#111";
// After LOAD, not during it: a stage is built before the first frame, and a
// page still parsing when that starts never finishes loading.
setTimeout(() => void main(), 0);
