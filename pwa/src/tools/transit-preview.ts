// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Transit preview harness — the page scripts/transit-preview.mjs drives.
// It photographs the one beat a screenshot of a RUN cannot reach: the camera
// leaving the finish line and going to a crew still out on the stage
// (camera-sweep.ts), frame by frame.
//
// The reason it has to exist is written into scripts/screenshot.mjs: the
// run-out only exists on a run that has a LEVEL, a `?start=1` link never
// passes through `startStage`, and clicking through the menu is twelve
// minutes of software-rendered driving. So this builds the same situation
// directly — a real stage, a real mass-start field, the real renderer — and
// drives the player's car home with the BOT at engine speed, with nothing
// drawn, before a single frame is rendered. Reaching the beat then costs a
// second instead of a quarter of an hour.
//
// What it lays out is a contact sheet of consecutive frames: the last of the
// flying finish, every frame of the transit, and the first of the shot it
// lands in. Nothing about a flight is judged from one picture — the whole
// question is whether the frames next to each other belong to each other.

import * as THREE from "three";
import {
  TUNING,
  botInput,
  createField,
  createGame,
  step,
  watchField,
  type GameState,
  type RivalRun,
} from "@engine";

import { createRenderer } from "../game/renderer.ts";
import { DEFAULT_SETTINGS } from "../game/settings.ts";

declare global {
  interface Window {
    __done?: boolean;
  }
}

/** The stage the beat is staged on. A short one so the bot's drive home is a
 * second of CPU, and a mass start because that is the race the transit was
 * reported on: everybody leaves on one green, so finishing means the field
 * behind is still driving. */
const SEED = 38;
const LENGTH = "short";
const FIELD = { difficulty: "medium", cars: 8, massStart: true } as const;
const STAGE = {
  seed: SEED,
  laps: 1,
  timeOfDay: "day",
  weather: "clear",
  season: "summer",
} as const;

/** How the sheet is laid out: tile size, columns, and how many frames apart
 * the tiles are. Six frames at 60 Hz is a tenth of a second — close enough
 * that a jump between two tiles is a jump the eye would have seen. */
const TILE = { width: 400, height: 225, cols: 5 };
const EVERY = 6;
/** Seconds of DRIVING rendered before the car reaches the line. The flying
 * finish plants itself wherever the camera was standing on the frame it took
 * over, so a harness that starts rendering AT the line plants the shot on a
 * camera that has never been anywhere — and photographs a transit that starts
 * from the world origin. The rig needs a stretch of real driving under it
 * before any of this means anything, and it settles in well inside this. */
const RUN_IN = 1.2;

/** Seconds of the roll-out RENDERED before the cut, against the `4.5` the
 * game holds. The plant is taken on the first frame past the line and the
 * shot settles onto it in `FINISH.settle`, so this is the whole gesture; the
 * rest of the game's beat is the player's car getting smaller, and it is
 * stepped without being drawn. Every drawn frame here is a second of
 * software rasterizing. */
const ROLLOUT = 1.6;

/** Frames held after the cut, so the sheet carries the landing and the shot
 * it lands in rather than only the flight. */
const AFTER = 132;

/** The frame the harness renders at, s. Fixed rather than wall-clock: a
 * software rasterizer draws this scene at a few frames a second, and a
 * flight stepped on THAT dt is a flight nobody would ever see. */
const FRAME = 1 / 60;

/** Roll-out seconds kept before the cut — App.tsx's own `BACKDROP_AFTER`. */
const BACKDROP_AFTER = 4.5;

type Shot = { image: ImageBitmap; label: string };

/** One race, entered fresh: the player's game and the field on the same
 * road. Deterministic per seed, which is what lets the drive below be run
 * twice and land in exactly the same place both times. */
function enter(): { player: GameState; field: ReturnType<typeof createField> } {
  const player = createGame({
    seed: SEED,
    carId: "compact",
    length: LENGTH,
    skipCountdown: true,
    quiet: true,
  });
  return { player, field: createField(player.track, FIELD, STAGE) };
}

/** Drive `steps` of the race at engine speed with nothing drawn — the bot on
 * the player's car and `watchField` on everybody else's, exactly as the game
 * steps them. Stops early at the line. Returns how many steps it actually
 * took. */
function drive(
  race: ReturnType<typeof enter>,
  steps: number,
  until: (state: GameState) => boolean,
): number {
  for (let i = 0; i < steps; i++) {
    if (until(race.player)) return i;
    step(race.player, botInput(race.player));
    watchField(race.field, 1, Infinity);
  }
  return steps;
}

/** Steps allowed for the drive up the stage. A short stage is ninety seconds
 * of race time; a bot that beaches itself must not hang the page. */
const PATIENCE = Math.round(240 / TUNING.dt);

/** How many steps the bot needs to reach the line, measured on a race that is
 * then thrown away — so the one that gets photographed can be stopped SHORT
 * of it and driven the rest of the way with the camera up.
 *
 * Measured rather than watched for, because there is no reading on the state
 * that says "nearly there": `progressS` tops out about a hundred metres short
 * of `track.length`, so a drive waiting for it to reach the line waits for
 * something that never comes — and renders a car that has been parked past
 * the finish for three minutes instead. */
function stepsToTheLine(): number {
  return drive(enter(), PATIENCE, (state) => state.phase !== "racing");
}

async function main(): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = TILE.width;
  canvas.height = TILE.height;
  canvas.style.width = `${TILE.width}px`;
  canvas.style.height = `${TILE.height}px`;
  document.body.append(canvas);

  // Driven up the stage with nothing drawn, and stopped `RUN_IN` seconds
  // short of the line: everything from there is rendered.
  const line = stepsToTheLine();
  const race = enter();
  drive(race, Math.max(0, line - Math.round(RUN_IN / TUNING.dt)), () => false);
  const { player, field } = race;

  const renderer = createRenderer(canvas, DEFAULT_SETTINGS.video);
  renderer.resize();
  renderer.setGame(player);
  renderer.field.set(field.runs);
  renderer.setCamera(DEFAULT_SETTINGS.camera);

  const shots: Shot[] = [];
  const grab = async (label: string): Promise<void> => {
    shots.push({ image: await createImageBitmap(canvas), label });
  };

  /** The lens's own reading of the frame it just drew — where it stands, how
   * far off the ground, which way it points and how wide. Under each tile,
   * because a flight is judged on the numbers moving smoothly as much as on
   * the pictures doing. */
  const readout = (t: number, state: GameState): string => {
    const pose = renderer.cameraPose();
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(pose.pitch, pose.yaw, 0, "YXZ"),
    );
    const air = pose.y - state.terrain.groundAt(pose.x, pose.z);
    const gap = Math.hypot(pose.x - state.car.x, pose.z - state.car.z);
    return `${t.toFixed(2)}s  air ${air.toFixed(0)}m  car ${gap.toFixed(0)}m  pitch ${((Math.asin(-fwd.y) * 180) / Math.PI).toFixed(0)}°`;
  };

  // THE RUN IN AND THE FLYING FINISH, driven under the camera so the shot
  // plants where the player actually was. `t` is zero at the line, so the
  // labels read the beat the way the game's own clock does.
  const ticks = Math.round(FRAME / TUNING.dt);
  let t = 0;
  for (let f = 0; f < Math.round((RUN_IN + ROLLOUT) / FRAME); f++) {
    if (player.phase !== "finished") step(player, botInput(player));
    watchField(field, ticks, Infinity);
    renderer.render(player, FRAME);
    t = player.phase === "racing" ? -0.001 : player.rollout;
    if (player.phase !== "racing" && f % EVERY === 0) {
      await grab(`finish ${readout(t, player)}`);
    }
  }
  // …and the rest of the game's own hold, stepped rather than drawn: the
  // plant is taken and the shot is settled, and what is left is the player's
  // car receding.
  const rest = Math.round((BACKDROP_AFTER - ROLLOUT) / TUNING.dt);
  for (let i = 0; i < rest; i++) {
    if (player.phase !== "finished") step(player, botInput(player));
    watchField(field, 1, Infinity);
  }

  // THE CUT — App.tsx's `cutTo(leader, "backdrop")`, in the same order: the
  // camera first, the crew second.
  const leader: RivalRun = field.runs.find((run) => !run.done) ?? field.runs[0];
  renderer.setCamera("chase");
  renderer.spectate(leader);
  t = 0;

  for (let f = 0; f < AFTER; f++) {
    watchField(field, ticks, Infinity);
    renderer.render(leader.state, FRAME);
    t += FRAME;
    if (f % EVERY === 0) await grab(`transit ${readout(t, leader.state)}`);
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
  ctx.font = "13px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  shots.forEach((shot, i) => {
    const x = (i % TILE.cols) * TILE.width;
    const y = Math.floor(i / TILE.cols) * (TILE.height + 22);
    ctx.drawImage(shot.image, x, y, TILE.width, TILE.height);
    ctx.fillStyle = shot.label.startsWith("finish") ? "#8bd" : "#fd8";
    ctx.fillText(shot.label, x + 6, y + TILE.height + 11);
  });
  canvas.remove();
  document.body.append(sheet);
  renderer.dispose();
  window.__done = true;
}

document.body.style.margin = "0";
document.body.style.background = "#111";
// After LOAD, not during it: the bot drives a whole stage before the first
// frame, and a page still parsing when that starts never finishes loading.
setTimeout(() => void main(), 0);
