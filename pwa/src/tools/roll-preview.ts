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
import { TUNING, botInput, createGame, step, type GameEvent, type GameState } from "@engine";

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
 * the landing goes over rather than merely lurching. `across` is per-run
 * below, because how hard the car is tripped is exactly what decides whether
 * there is anything left to catch. */
const TRIP = { lift: 6.5 };

/** Which seats the roll is watched from — and the pair is the point. `chase`
 * is an outside rig, which plants and watches; `cockpit` is bolted to the
 * body and goes over with it. The two rows are the two halves of the
 * decision, side by side, and a row of upholstery under a `chase` label (or
 * a planted shot under `cockpit`) is the sheet failing loudly. */
const SEATS = ["chase", "cockpit"] as const;

/** ...and the two ACCIDENTS, which is the other axis of the sheet. They are
 * here to photograph the camera's TWO ENDINGS, and the camera has two because
 * the car does.
 *
 * `the trip` is the accident nobody comes back from: thrown sideways hard
 * enough to go over and over, it ends on its roof, and the lens plants at the
 * verge, holds for the beat the crew are left in, and flies home.
 *
 * `caught` is a roll the car comes out of ON ITS WHEELS, which is the ending
 * the camera treats completely differently — the frame goes back on the short
 * clock and the shot then latches itself off until `car.planted`
 * (`camera-roll.ts`). Both of those are properties of one frame beside the
 * next, which is what this sheet is.
 *
 * TWO THINGS ARE DELIBERATE HERE AND BOTH WERE WRONG ONCE.
 *
 * The LOCK opposes the roll, and its sign is the OPPOSITE of the sideways
 * speed's: a car carried to negative `w` goes over toward positive roll, and
 * the lateral force that pushes it back down is a positive one
 * (`roll_control_test.ts` pins the same convention). Steering with the sign
 * of `across` instead is the lock that finishes the job — measured on this
 * exact staging, it took the crash from 810° of roll to 1624° and a car that
 * never stopped rolling at all.
 *
 * And the trip is GENTLER on the caught run, because at `the trip`'s severity
 * there is nothing to catch: 26 m/s across the car is two and a half turns and
 * no lock in the game saves it — the right one still ended overturned. That is
 * the physics being right, not the driver being weak, and a "caught" row over
 * an uncatchable trip photographs nothing. What the driver is WORTH belongs to
 * `make crash`, which measures it; this sheet's job is the lens. */
const RUNS = [
  { id: "the trip", across: -26, catches: false },
  { id: "caught", across: -18, catches: true },
] as const;

/** The sheet: tile size, and the columns it wraps at — one row per half of a
 * seat's roll, so a roll is read across and the seats down. */
const TILE = { width: 320, height: 180, cols: 8 };

/** Frames rendered per seat, the ones photographed, and how many.
 *
 * THE WINDOW HAS TO OUTLAST THE ACCIDENT, and that is a longer event than it
 * looks. A roll the car comes out of is over at about 2.6 s, the frame goes
 * back over the half second after it, and the car is not `planted` — which is
 * what releases the camera's latch — until about 4.0 s. Sixteen tiles a sixth
 * of a second apart covered 2.67 s and stopped while the car was still
 * rolling: every hand-back this sheet exists to show happened after the last
 * picture. Spaced to cover four and a half seconds instead, which reaches past
 * the plant, the roll, the hand-back and the latch on both endings. */
const PER_SEAT = 280;
const SHOT_EVERY = 17;
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

  for (const { view, run } of SEATS.flatMap((view) => RUNS.map((run) => ({ view, run })))) {
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
    /** One rendered frame, and the sim steps under it.
     *
     * The step's EVENTS are handed to the renderer, not dropped. Half of
     * what a crash looks like is event-driven — the burst off each corner
     * of the shell as it arrives, the impact debris, a part coming off —
     * and a harness that throws the events away photographs a roll with
     * none of it, silently. This sheet spent its whole life doing that: it
     * is a picture of the CAMERA, but it can only be read against a picture
     * of the crash, and there was no crash in it. */
    const events: GameEvent[] = [];
    /** WHO IS DRIVING THIS FRAME. The bot, until the body goes over and this
     * is the run where somebody fights it — from there, full OPPOSITE lock
     * for as long as the roll owns the car. Opposite is `-sign(across)`: the
     * car is carried toward negative `w` and goes over toward positive roll,
     * so the lateral force that pushes it back down is the positive one.
     *
     * The bot keeps everything else, so the run-in and the trip are the same
     * drive in both rows and only the accident differs. */
    const hands = (): ReturnType<typeof botInput> =>
      run.catches && game.car.rolling
        ? { ...botInput(game), steer: -Math.sign(run.across), throttle: 0, brake: 0 }
        : botInput(game);
    const drive = (): void => {
      events.length = 0;
      for (let t = 0; t < ticks; t++) events.push(...step(game, hands()));
      if (events.length > 0) renderer.onEvents(game, events);
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
      if (game.car.airborne && !game.car.rolling) game.car.w = run.across;
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
            ? `${view}  ${run.id}`
            : `+${(f * FRAME).toFixed(2)}s  ${moved}  ${toCar.length().toFixed(0)}m off ${off}°${
                // WHICH STATE the car is in, because the whole reading of the
                // caught row is where it stops saying ROLLING, how long after
                // that the lens is still out in the grass, and where PLANTED
                // arrives — the frame the camera's latch is released on.
                //
                // AIR is called out separately: the trip is staged by THROWING
                // the car, so the opening frames are a flight, and labelling
                // those ON TWO reads as a car balanced on two wheels down the
                // road at 90 km/h.
                game.car.rolling
                  ? "  ROLLING"
                  : game.car.airborne
                    ? "  AIR"
                    : game.car.planted
                      ? "  PLANTED"
                      : "  ON TWO"
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
