// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SNOW-TRACK LAB — the page scripts/snow-tracks-lab.mjs drives. It puts a
// car through a handful of STAGED manoeuvres on snow and photographs what
// each one wrote into the ground, FROM DIRECTLY ABOVE at a known scale, with
// the chase camera's own view of the same moment beside it.
//
// WHY FROM ABOVE. What a car leaves in snow is a PLAN — four paths crossing
// each other — and the chase camera is the one angle that cannot show a
// plan. From behind, at two metres, four tracks and two tracks look the
// same: the near ones hide the far ones and the whole width of the thing
// is thirty pixels of foreshortening. So every judgement this module exists
// to support ("are all four wheels there", "does the track get wider when
// it goes sideways", "is the snow between the ruts still untouched") was
// being made off the one view that could not answer it. Overhead, at a
// fixed metres-per-pixel, all three are obvious in one glance — and the
// chase tile beside it then says whether what is correct in plan also READS
// at the speed anybody will actually see it.
//
// WHAT IS STAGED, and why each one is in the sheet:
//
//   * `straight` — the null case. A car going where it is pointing runs its
//     rear wheels in the tracks its own fronts cut, so this must come back
//     as TWO clean tracks with unbroken snow between them and the tread
//     printing along them. Two is the correct answer here; four is a bug.
//   * `curve` — the fronts take a slightly wider arc than the rears. The
//     tracks should splay and come back together, not sit as one width.
//   * `drift` — the case the old one-section model could not draw at all:
//     the car yawed, the four wheels sweeping four paths, each band wider
//     than its own tyre because the patch is being dragged across itself
//     (`bandHalf`), and the tread scrubbed out rather than printed.
//   * `handbrake` — the far end of the same thing: the rears locked and
//     smearing, the fronts still rolling and printing. The two axles should
//     NOT look alike.
//   * `road` and `field` — the same straight line on the stage's own snow
//     road and out in the blanket beside it. This is the pair that judges
//     R47's belly gate (`snowBelly`): the road's cover is a few centimetres
//     under a car whose floor is a third of a metre up, so between its tyre
//     tracks the snow must be UNTOUCHED, and only where the blanket is deep
//     enough to reach the nose may a broad pressed floor appear.
//
// It is the looking half of the loop `tests/snowpack_test.ts` measures.
// The test can say the belly gate reads zero on a road; only this can say
// whether what is drawn over it looks like a car went there.

import {
  NEUTRAL_INPUT,
  TUNING,
  createGame,
  step,
  type CarInput,
  type GameEvent,
  type GameState,
} from "@engine";

import { createRenderer } from "../game/renderer.ts";
import { DEFAULT_SETTINGS } from "../game/settings.ts";

declare global {
  interface Window {
    __done?: boolean;
  }
}

/** The stage: a taiga winter mild enough to leave the water open, so the
 * road under the car is snow rather than ice — the same climate the snow
 * tests stage, and for the same reason. */
const STAGE = {
  seed: 41,
  carId: "compact",
  length: "short",
  env: { season: "winter" as const, temperature: -6, hour: 11 },
} as const;

/** Seconds of bot driving before a manoeuvre starts — enough to be up to
 * rally pace and clear of the start control. */
const RUN_IN = 4;
/** ...and how long each manoeuvre is then held. */
const HOLD = 2.6;

/** The frame the harness renders at, s — fixed rather than wall-clock, so a
 * software rasterizer drawing at a few frames a second steps the same sim a
 * real machine would. */
const FRAME = 1 / 60;

/** How high the overhead lens stands, m, and how wide a view that makes at
 * its field of view. Fixed for every cell on the sheet ON PURPOSE: the
 * whole point of the plan view is that two cells are the same scale, so a
 * band that is wider in one of them is actually wider. */
const PLAN = { up: 26, fov: 42 };

/** A manoeuvre: what the driver does, and whether it is done on the road or
 * out in the field beside it. */
type Move = {
  name: string;
  /** What is being looked for — printed under the cell, so the sheet says
   * what it is asking rather than only showing it. */
  asks: string;
  /** The controls, given the seconds elapsed since the manoeuvre began. */
  drive: (t: number) => Partial<CarInput>;
  /** Metres to the right of the road to start from; 0 is the road itself. */
  out?: number;
};

const MOVES: Move[] = [
  {
    name: "straight",
    asks: "TWO tracks, tread printing, snow between them untouched",
    drive: () => ({ throttle: 1 }),
  },
  {
    name: "curve",
    asks: "fronts take the wider arc — the pair should splay and close",
    drive: () => ({ throttle: 1, steer: 0.32 }),
  },
  {
    name: "drift",
    asks: "FOUR tracks, each band wider than its tyre, tread scrubbed out",
    drive: (t) => (t < 0.35 ? { throttle: 0, brake: 1, steer: 0.9 } : { throttle: 1, steer: 0.75 }),
  },
  {
    name: "handbrake",
    asks: "rears smeared, fronts still rolling — the axles must differ",
    drive: (t) => ({ throttle: t < 0.3 ? 0 : 0.7, steer: 0.85, handbrake: t < 0.9 }),
  },
  {
    name: "field",
    asks: "deep blanket: a pressed floor may appear between the ruts",
    drive: () => ({ throttle: 1, steer: 0.1 }),
    out: 17,
  },
];

/** The sheet: one cell's pixels, and how many across. */
const TILE = { width: 420, height: 420, cols: 2 };

type Shot = { image: ImageBitmap; label: string; head: boolean };

/** Drive the car out to `out` metres beside the road before the manoeuvre —
 * the field cases need to be OFF the mat, and the only honest way there is
 * to drive, because a car teleported into a snowfield has not pressed the
 * snow it is standing in. `out` is read as a yes-or-no rather than as a
 * distance: the steer and the seconds below are what actually decide where
 * the car ends up, and they were found by driving it. */
function toField(out: number, run: (input: Partial<CarInput>) => void): void {
  if (out === 0) return;
  for (let f = 0; f < Math.round(2.2 / FRAME); f++) run({ throttle: 0.75, steer: 0.45 });
  for (let f = 0; f < Math.round(1.1 / FRAME); f++) run({ throttle: 0.75, steer: -0.45 });
}

async function main(): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = TILE.width;
  canvas.height = TILE.height;
  canvas.style.width = `${TILE.width}px`;
  document.body.append(canvas);

  const renderer = createRenderer(canvas, DEFAULT_SETTINGS.video);
  renderer.resize();
  const shots: Shot[] = [];
  const ticks = Math.round(FRAME / TUNING.dt);

  for (const move of MOVES) {
    const game: GameState = createGame({
      seed: STAGE.seed,
      carId: STAGE.carId,
      length: STAGE.length,
      env: { ...STAGE.env },
      skipCountdown: true,
      quiet: true,
    });
    renderer.setGame(game);
    renderer.setCamera("chase");
    renderer.skipIntroShot();
    const events: GameEvent[] = [];
    const tick = (input: Partial<CarInput>): void => {
      events.length = 0;
      for (let t = 0; t < ticks; t++) {
        events.push(...step(game, { ...NEUTRAL_INPUT, ...input }));
      }
      if (events.length > 0) renderer.onEvents(game, events);
      renderer.render(game, FRAME);
    };
    // ...and the same frame's worth of SIM with nothing drawn, which is how
    // the car gets to where the manoeuvre starts. The engine carves the
    // snow in `step` and the renderer only draws what was carved, so a
    // run-in that is stepped rather than rendered presses exactly the same
    // ground — it simply does not spend a software rasterizer's whole
    // afternoon photographing a straight line nobody is going to look at.
    const run = (input: Partial<CarInput>): void => {
      for (let t = 0; t < ticks; t++) step(game, { ...NEUTRAL_INPUT, ...input });
    };

    // Up to pace under the bot's own hands would be a different line every
    // time the bot changed; a flat throttle down the opening straight is
    // the same line on every run of this sheet, which is what lets two
    // sheets be compared at all.
    for (let f = 0; f < Math.round(RUN_IN / FRAME); f++) run({ throttle: 1 });
    toField(move.out ?? 0, run);

    const held = Math.round(HOLD / FRAME);
    for (let f = 0; f < held; f++) tick(move.drive(f * FRAME));

    // THE PLAN. Straight down over the middle of what was just written —
    // not over the car, which is at the END of its own track and would put
    // three quarters of the mark off the bottom of the frame.
    const car = game.car;
    const back = 0.5 * HOLD * Math.hypot(car.u, car.w);
    const overX = car.x - Math.sin(car.heading) * back;
    const overZ = car.z - Math.cos(car.heading) * back;
    renderer.setCamera("free");
    renderer.setFreeFov(PLAN.fov);
    renderer.placeCamera({
      x: overX,
      y: game.terrain.groundAt(overX, overZ) + PLAN.up,
      z: overZ,
      // Aligned with the car so the track runs UP the cell whichever way
      // the stage was pointing, and the cells can be read side by side.
      yaw: car.heading,
      pitch: -Math.PI / 2,
    });
    tick({});
    const kmh = Math.round(Math.hypot(car.u, car.w) * 3.6);
    const slip = Math.round((car.slip * 180) / Math.PI);
    shots.push({
      image: await createImageBitmap(canvas),
      label: `${move.name}  plan  ${PLAN.up} m up  ${kmh} km/h  slip ${slip}°`,
      head: true,
    });

    // ...and the same instant from where the player is actually sitting,
    // which is the tile that says whether being right in plan is worth
    // anything at racing speed.
    renderer.setCamera("chase");
    tick({});
    shots.push({
      image: await createImageBitmap(canvas),
      label: `${move.name}  chase — ${move.asks}`,
      head: false,
    });
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
