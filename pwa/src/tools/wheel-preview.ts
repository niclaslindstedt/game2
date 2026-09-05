// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WHEEL LAB — the page scripts/wheel-lab.mjs drives. It tears a wheel
// off a car at speed and photographs what the wheel does, frame by frame,
// from three seats: the chase camera the player would be watching from,
// the helicopter over the car, and a lens planted at the verge ahead that
// the wheel comes past.
//
// A wheel coming off is a beat no run screenshot can review: it needs a
// corner hit hard enough to reach the ledger's line, which the scripted
// crash scenes reach on some seeds and not others, and what it does next is
// two seconds of motion — the throw, the first bounce off the tyre, the
// landing that turns into a roll, the roll running on ahead of the car —
// that only reads as one frame beside the next. So the wheel is taken off
// HERE, by writing the ledger the way collision.ts would have, and the rest
// is the real engine and the real renderer: the car drives on three wheels
// under the bot, and loose-wheel.ts has the wheel.

import {
  TUNING,
  WHEEL_PARTS,
  botInput,
  createGame,
  step,
  type GameEvent,
  type GameState,
} from "@engine";

import type { CameraMode } from "../game/camera.ts";
import { createRenderer } from "../game/renderer.ts";
import { DEFAULT_SETTINGS } from "../game/settings.ts";

declare global {
  interface Window {
    __done?: boolean;
  }
}

/** The stage, and the seconds of bot driving before the wheel goes: enough
 * to be up to rally pace on the opening straight. */
const STAGE = { seed: 38, length: "short", carId: "compact" } as const;
const RUN_IN = 3.5;
/** Which wheel goes: the rear right, which is the one the chase camera can
 * see whole. */
const WHEEL = 3;

/** The seats. `chase` and `heli` are the game's own cameras and follow the
 * car; `free` is planted where a spectator would stand, at the verge ahead,
 * looking back up the road the wheel is about to come down. */
const SEATS: CameraMode[] = ["chase", "heli", "free"];
/** Where the planted lens stands: metres ahead of the car along its heading
 * at the moment the wheel goes, metres off to the wheel's side, its height,
 * and the point on the road it is aimed at — where the car will be a second
 * on, so the car and the wheel beside it both cross the middle of the frame
 * at a distance the wheel is a readable size at. */
const VERGE = { ahead: 42, aside: 14, up: 1.8, aimAhead: 30, fov: 70 };

/** The sheet: tile size, and the columns it wraps at. */
const TILE = { width: 320, height: 180, cols: 8 };
/** Frames rendered per seat, and one photographed every this many: sixteen
 * tiles a fifth of a second apart, which covers the throw, both bounces and
 * the first seconds of the roll. */
const SHOT_EVERY = 12;
const SHOTS = TILE.cols * 2;
const PER_SEAT = SHOT_EVERY * SHOTS;

/** The frame the harness renders at, s — fixed rather than wall-clock, so a
 * software rasterizer drawing at a few frames a second steps the same sim
 * a real machine would. */
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

  for (const seat of SEATS) {
    const game: GameState = createGame({
      seed: STAGE.seed,
      carId: STAGE.carId,
      length: STAGE.length,
      skipCountdown: true,
      quiet: true,
    });
    renderer.setGame(game);
    renderer.setCamera(seat === "free" ? "chase" : seat);
    renderer.skipIntroShot();
    // The step's events reach the renderer: the burst off the arch as the
    // wheel leaves is event-driven, and a harness that drops them
    // photographs a wheel leaving in silence.
    const events: GameEvent[] = [];
    const drive = (): void => {
      events.length = 0;
      for (let t = 0; t < ticks; t++) events.push(...step(game, botInput(game)));
      if (events.length > 0) renderer.onEvents(game, events);
      renderer.render(game, FRAME);
    };
    for (let f = 0; f < Math.round(RUN_IN / FRAME); f++) drive();

    // THE WHEEL GOES. The ledger is written the way `dealWheel` writes it —
    // the wheel at 1, the part on the broken list, the version bumped — and
    // the two events it would have raised are handed to the renderer, so
    // the car drives on from here exactly as it would after the hit that
    // did this.
    const car = game.car;
    car.damage.wheels[WHEEL] = 1;
    car.damage.broken.push(WHEEL_PARTS[WHEEL]);
    car.damage.version += 1;
    if (seat === "free") {
      const sinH = Math.sin(car.heading);
      const cosH = Math.cos(car.heading);
      const x = car.x + sinH * VERGE.ahead + cosH * VERGE.aside;
      const z = car.z + cosH * VERGE.ahead - sinH * VERGE.aside;
      const aimX = car.x + sinH * VERGE.aimAhead;
      const aimZ = car.z + cosH * VERGE.aimAhead;
      renderer.setCamera("free");
      renderer.setFreeFov(VERGE.fov);
      renderer.placeCamera({
        x,
        y: game.terrain.groundAt(x, z) + VERGE.up,
        z,
        yaw: Math.atan2(aimX - x, aimZ - z),
        pitch: -0.05,
      });
    }
    renderer.onEvents(game, [
      { type: "wheelFail", wheel: WHEEL, off: true },
      { type: "partBreak", part: WHEEL_PARTS[WHEEL] },
    ]);

    for (let f = 0; f < PER_SEAT; f++) {
      drive();
      if (f % SHOT_EVERY !== 0) continue;
      const kmh = Math.round(Math.hypot(car.u, car.w) * 3.6);
      shots.push({
        image: await createImageBitmap(canvas),
        label:
          f === 0
            ? `${seat}  wheel off at ${kmh} km/h`
            : `+${(f * FRAME).toFixed(2)}s  ${kmh} km/h`,
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
