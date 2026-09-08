// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Air-camera preview harness — the page scripts/air-cam.mjs drives. It puts
// the car in the air and photographs THE CAMERA WHILE THE CAR IS FLYING,
// frame by frame, from an outside rig near the road and one flown well over
// it.
//
// It exists because the camera's flight reading (`flight` in camera-feel.ts)
// is a GESTURE rather than a pose: the rod the lens stands on the end of
// turns to lie along the car's own path, dipping under a car coming off a
// lip and swinging over one that is falling. No single frame says anything
// about that. What is being judged is whether the tilt arrives with weight
// instead of snapping on, whether the car stays the same size in the frame
// the whole way down a mountain, and whether the rod comes back through the
// horizontal with a bounce when the wheels are down again — all three
// properties of one frame beside the next one, which is what this lays out.
//
// The two situations are STAGED rather than driven into, the way the roll
// sheet stages its trip: the car is thrown, and everything after that is the
// engine's own flight over the stage's own ground.
//
//   a jump — thrown straight up off the road at a designed lip's speed and
//            landed back on it. The frame must barely change size, the tilt
//            must go up and then over, and the landing must settle.
//   the drop — thrown sideways off the shoulder at the one place on this
//            stage where the country falls a long way away from the road.
//            The camera must GO WITH the car. A shot that stays up at the
//            lip is the failure this row is here to catch, and it reads as
//            the car shrinking down the row.

import * as THREE from "three";
import { TUNING, botInput, createGame, step, type GameEvent, type GameState } from "@engine";

import { createRenderer } from "../game/renderer.ts";
import { DEFAULT_SETTINGS } from "../game/settings.ts";

declare global {
  interface Window {
    __done?: boolean;
  }
}

/** The car and the stage length both situations are driven with. The seed
 * is the one the other camera sheets drive; what changes between the two
 * runs is the COUNTRY, which is a dial (R40/R47). */
const STAGE = { seed: 38, length: "short", carId: "compact" } as const;

/** THE TWO SITUATIONS.
 *
 * `at` is where each is staged, in seconds of bot driving — stepped without
 * a frame being drawn, because twenty seconds of software rasterizer is four
 * minutes of nothing being looked at. `seconds` is how long the sheet then
 * watches for, and the two are deliberately different: a designed jump is
 * over in a second and a half and settled a second after that, where a
 * mountainside takes seven.
 *
 * `lift` and `across` are the throw itself, m/s, and both were chosen by
 * measuring rather than by eye — a throw that looks reasonable mostly buys a
 * car that lands on the shoulder, rolls down it and is put back on the road
 * by the respawn, which photographs three different events and none of them
 * this one.
 *
 *   a jump — the taiga the campaign opens in, at the seed's own dials. The
 *            car leaves the ground at ten, peaks three metres up and lands
 *            within a metre of the height it left: a designed lip. The frame
 *            must barely change size, the tilt must go up and then over, and
 *            the landing must settle.
 *   the drop — THE ALPINE ROW, and the reason the country is a dial here.
 *            `altitude` at the top of its travel is not a bigger hill, it is
 *            six thousand metres of rock with the road blasted along one
 *            ledge of it and the green a mile below (R47) — which is the one
 *            place in the game where a camera that stays at the lip loses
 *            the car completely. Thrown off the ledge, this car bounces down
 *            the flank for three seconds and then falls, freely, for a
 *            hundred and ten metres at sixty metres a second. The camera
 *            must GO WITH it: a car shrinking down the row is the failure
 *            this sheet exists to catch. */
const RUNS = [
  { id: "a jump", knobs: {}, at: 12, seconds: 3, lift: 10, across: 0 },
  {
    id: "the drop — alpine, altitude at the top",
    knobs: { biome: "alpine", altitude: 1 },
    at: 15,
    seconds: 7.5,
    lift: 5,
    across: 22,
  },
] as const;

/** Which seats it is watched from, and the pair is the point. `chase` is the
 * shot the game is driven in and the one a fall happens TO; `heli` already
 * looks down from eighteen metres back and ten up, so it takes a fraction of
 * the read — a row where the two are indistinguishable is the per-rig share
 * having stopped working. */
const SEATS = ["chase", "heli"] as const;

/** The sheet: tile size, and the columns it wraps at. */
const TILE = { width: 320, height: 180, cols: 8 };

/** How many frames of each run are photographed — two rows of the sheet,
 * spread evenly over that run's own window (`seconds`), because the two
 * situations are different lengths and a fixed spacing would either stop
 * partway down the mountain or spend eight tiles on a car sitting still. */
const SHOTS = TILE.cols * 2;

/** The frame the harness renders at, s. Fixed rather than wall-clock, for
 * the other sheets' reason: a software rasterizer draws this scene at a few
 * frames a second, and a gesture stepped on THAT dt is one nobody would ever
 * see. */
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

  for (const { view, run } of SEATS.flatMap((view) => RUNS.map((run) => ({ view, run })))) {
    const game: GameState = createGame({
      seed: STAGE.seed,
      carId: STAGE.carId,
      length: STAGE.length,
      skipCountdown: true,
      quiet: true,
      knobs: { ...run.knobs },
    });
    // The run-in the camera never sees: the bot drives to the staging point
    // with nothing drawn under it.
    for (let t = 0; t < Math.round((run.at - 1.2) / TUNING.dt); t++) step(game, botInput(game));
    renderer.setGame(game);
    renderer.setCamera(view);
    renderer.skipIntroShot();
    const events: GameEvent[] = [];
    const drive = (): void => {
      events.length = 0;
      for (let t = 0; t < ticks; t++) events.push(...step(game, botInput(game)));
      if (events.length > 0) renderer.onEvents(game, events);
      renderer.render(game, FRAME);
    };
    for (let f = 0; f < Math.round(1.2 / FRAME); f++) drive();

    // THE THROW. Off the ground, and — for the drop — moving toward the
    // shoulder. The sideways speed is pinned for as long as the wheels are
    // off the ground, so the car actually clears the verge instead of
    // being pulled back onto the road by the first contact.
    const takeoff = game.car.y;
    game.car.airborne = true;
    game.car.vy = run.lift;
    const frames = Math.round(run.seconds / FRAME);
    const every = Math.max(1, Math.round(frames / SHOTS));
    let was = { at: new THREE.Vector3(), had: false };
    for (let f = 0; f < frames; f++) {
      if (game.car.airborne && run.across !== 0) game.car.w = run.across;
      drive();
      if (f % every !== 0 || f / every >= SHOTS) continue;
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
      // The four readings that say whether this is a shot. How far the lens
      // moved since the frame before (a rig going with the car moves as far
      // as the car does), how far AWAY the car is — the column the whole
      // sheet turns on, because a rod that turns instead of stretching
      // leaves it near the standoff the car was driven at — how far off the
      // middle of the picture it drifted, and where the lens is POINTING,
      // which is the gesture itself.
      const moved = was.had ? `+${seat.distanceTo(was.at).toFixed(2)}m` : "opening";
      const off = ((forward.angleTo(toCar) * 180) / Math.PI).toFixed(0);
      const tilt = ((pose.pitch * 180) / Math.PI).toFixed(0);
      was = { at: seat.clone(), had: true };
      shots.push({
        image: await createImageBitmap(canvas),
        label:
          f === 0
            ? `${view}  ${run.id}`
            : `+${(f * FRAME).toFixed(2)}s  ${moved}  ${toCar.length().toFixed(0)}m off ${off}°  lens ${tilt}°  ${
                game.car.airborne
                  ? `AIR ${(game.car.y - takeoff).toFixed(0)}m`
                  : game.car.planted
                    ? "PLANTED"
                    : "DOWN"
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
