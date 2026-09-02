// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// View-change preview harness — the page scripts/views-preview.mjs drives.
// It photographs the camera key being pressed, frame by frame: the move from
// one seat on the ladder to the next (camera-change.ts), on a car that is
// driving rather than parked.
//
// It has to exist for the same reason the transit's sheet does. A change of
// view is over in a third of a second, so a single screenshot can only ever
// show one of its frames, and the failure worth catching is not in any one
// frame — it is a frame that does not belong beside the one before it. What
// this lays out is CONSECUTIVE frames, four to a step, with the lens's own
// reading under each: where it stands relative to the car, how far it has
// moved since the frame before, and how far it has turned. A cut shows up in
// that column as one enormous number in a row of small ones.

import * as THREE from "three";
import { TUNING, botInput, createGame, step, type GameState } from "@engine";

import { createRenderer } from "../game/renderer.ts";
import { DEFAULT_SETTINGS, PLAY_CAMERAS } from "../game/settings.ts";

declare global {
  interface Window {
    __done?: boolean;
  }
}

/** The stage the walk is driven on, and the seconds of bot driving under the
 * camera before the first press. A short stage keeps the drive to a second
 * of CPU; the run-in is what settles the rig being LEFT, so the first tile
 * of every step is a shot somebody was actually looking at. */
const STAGE = { seed: 38, length: "short", carId: "compact" } as const;
const RUN_IN = 2.5;

/** How the sheet is laid out: tile size, and the columns it wraps at — one
 * row per step of the ladder, so a step is read across and the ladder down. */
const TILE = { width: 320, height: 180, cols: 8 };

/** Frames rendered per step, and the ones photographed. A move takes a third
 * of a second to two thirds, so eight tiles a twelfth of a second apart cover
 * the longest one end to end and a short one twice over. The rest of the step
 * is rendered but not kept, and it is what settles the rig for the next
 * press. */
const PER_STEP = 60;
const SHOT_EVERY = 5;
const SHOTS = TILE.cols;

/** The frame the harness renders at, s. Fixed rather than wall-clock: a
 * software rasterizer draws this scene at a few frames a second, and a move
 * stepped on THAT dt is a move nobody would ever see. */
const FRAME = 1 / 60;

type Shot = { image: ImageBitmap; label: string; head: boolean };

async function main(): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = TILE.width;
  canvas.height = TILE.height;
  canvas.style.width = `${TILE.width}px`;
  canvas.style.height = `${TILE.height}px`;
  document.body.append(canvas);

  const game: GameState = createGame({
    seed: STAGE.seed,
    carId: STAGE.carId,
    length: STAGE.length,
    skipCountdown: true,
    quiet: true,
  });
  const renderer = createRenderer(canvas, DEFAULT_SETTINGS.video);
  renderer.resize();
  renderer.setGame(game);

  const ladder = PLAY_CAMERAS.map((cam) => cam.id);
  renderer.setCamera(ladder[0]);
  renderer.skipIntroShot();

  const shots: Shot[] = [];
  const ticks = Math.round(FRAME / TUNING.dt);
  const drive = (): void => {
    for (let t = 0; t < ticks; t++) step(game, botInput(game));
    renderer.render(game, FRAME);
  };

  /** Where the lens stands relative to the CAR, which is the frame a move
   * happens in — both of its ends ride the car, so a world reading would
   * only report the road going past. */
  const seat = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const was = { at: new THREE.Vector3(), aim: new THREE.Vector3(), had: false };
  const readout = (): string => {
    const pose = renderer.cameraPose();
    seat.set(pose.x - game.car.x, pose.y - game.car.y, pose.z - game.car.z);
    aim.set(0, 0, -1).applyEuler(new THREE.Euler(pose.pitch, pose.yaw, 0, "YXZ"));
    const where = `${seat.y.toFixed(1)}m up ${Math.hypot(seat.x, seat.z).toFixed(1)}m back`;
    // The first tile of a step is the frame the key was pressed on, and it
    // has no frame before it to have moved from — naming the step is what
    // that tile is for, and a delta of zero beside it only runs the label
    // into its neighbour.
    const since = was.had
      ? `  +${seat.distanceTo(was.at).toFixed(2)}m ${((aim.angleTo(was.aim) * 180) / Math.PI).toFixed(1)}°`
      : "";
    was.at.copy(seat);
    was.aim.copy(aim);
    was.had = true;
    return where + since;
  };

  for (let f = 0; f < Math.round(RUN_IN / FRAME); f++) drive();

  // THE WALK: every step of the ladder in the order the camera key takes it,
  // including the one that wraps the top back onto the nose.
  for (let s = 0; s < ladder.length; s++) {
    const to = ladder[(s + 1) % ladder.length];
    renderer.setCamera(to);
    was.had = false;
    for (let f = 0; f < PER_STEP; f++) {
      drive();
      if (f % SHOT_EVERY !== 0 || f / SHOT_EVERY >= SHOTS) continue;
      shots.push({
        image: await createImageBitmap(canvas),
        label: `${f === 0 ? `${ladder[s]} → ${to}` : `+${(f * FRAME).toFixed(2)}s`}  ${readout()}`,
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
