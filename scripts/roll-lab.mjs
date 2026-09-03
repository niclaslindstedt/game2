// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROLL LAB — a car going over, DRAWN, from behind.
//
// `make sim` says how often a car rolls and `make drift` says what it does
// before it gets there; neither shows the roll itself, and a roll is a
// thing you have to LOOK at. A car going over is the one manoeuvre where
// the body is a shape on the ground rather than a set of contact patches,
// and the questions it raises are all geometric: where is the pivot, does
// the car WALK over its corners or spin on a bar underneath itself, how far
// does one turn carry it, what does the nose do while it goes round.
//
// So this trips a car at a range of speeds and draws each roll from BEHIND:
// the hull's own outline (the box in `TUNING.collision` the roll turns on),
// every sixth of a second, along the ground it crossed — with the corner it
// is turning about marked on each one. A model that spins the body about a
// fixed point under its middle draws a stack of outlines in one place; one
// that turns it over its corners draws a car walking across the picture.
//
//   node scripts/roll-lab.mjs                 the standard set
//   node scripts/roll-lab.mjs --car=coupe     ...in another car
//   node scripts/roll-lab.mjs --seeds=1,2,3   ...off other ground
//
// Writes previews/roll-<car>.png, and prints what each roll cost.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  NEUTRAL_INPUT,
  TUNING,
  WHEEL_BASIN,
  compileTrack,
  createGame,
  rollTilt,
  step,
} from "../engine/index.ts";

import { createCanvas } from "./lib/png.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const CAR = arg("car", "classic");
const SEEDS = arg("seeds", "1,2,3")
  .split(",")
  .map((s) => Number(s.trim()));

/** The trips to stage: forward speed and the sideways speed pinned on
 * through the flight, m/s. Under `air.tripSlide` a landing is merely
 * sloppy; these are all past it, from the lurch that just goes over to the
 * one nobody walks away from. */
const TRIPS = [
  [24, -14],
  [32, -20],
  [40, -25],
  [50, -32],
];

const STAGE = [
  {
    kind: "straight",
    length: 700,
    feature: "jump",
    featureStart: 400,
    featureEnd: 414,
    lipHeight: 2,
  },
  { kind: "straight", length: 900, feature: "none" },
];

const B = TUNING.collision;

/** The hull the roll turns on, in the body's own frame: (across, up) from
 * the wheel contact plane under the middle of the car — the same outline
 * `game/roll.ts` stands on the ground, drawn rather than solved. */
const HULL = [
  [-B.halfWidth, B.floorY],
  [B.halfWidth, B.floorY],
  [B.halfWidth, B.roofY],
  [-B.halfWidth, B.roofY],
];
const WHEELS = [
  [-B.halfTrack, 0],
  [B.halfTrack, 0],
];

/** Trip one car and record the whole roll: where the body was and what
 * attitude it was at, every step, plus what it cost. */
function stageRoll(seed, u, w) {
  const state = createGame({
    seed,
    carId: CAR,
    skipCountdown: true,
    track: compileTrack(0, STAGE),
  });
  let thrown = false;
  for (let i = 0; !thrown && i < TUNING.physicsHz * 60; i++) {
    state.car.u = u;
    thrown = step(state, { ...NEUTRAL_INPUT, throttle: 0.5 }).some((e) => e.type === "takeoff");
  }
  let landed = false;
  for (let i = 0; !landed && i < TUNING.physicsHz * 6; i++) {
    state.car.w = w;
    landed = step(state, { ...NEUTRAL_INPUT }).some((e) => e.type === "landing");
  }
  // The heading the trip left the car on: the picture is drawn in that
  // frame, so "across" is across the car at the moment it went over.
  const heading = state.car.heading;
  const x0 = state.car.x;
  const z0 = state.car.z;
  const roll0 = state.car.roll;
  // The DATUM is the ground the car was tripped over; everything is drawn
  // as a height above it, and the ground itself is drawn as the line the
  // body's own contacts trace out rather than assumed flat — over the
  // fifteen metres a big roll covers the terrain moves enough to matter.
  const datum = state.car.y;
  const frames = [];
  let rolled = false;
  for (let i = 0; i < TUNING.physicsHz * 12; i++) {
    step(state, { ...NEUTRAL_INPUT });
    const car = state.car;
    if (car.rolling) rolled = true;
    const dx = car.x - x0;
    const dz = car.z - z0;
    frames.push({
      across: Math.cos(heading) * dx - Math.sin(heading) * dz,
      up: car.y - datum,
      // The ground, where the body is actually touching it: the origin
      // less however far the hull is standing off it. Null in the air,
      // where the body says nothing about what is underneath it.
      ground: car.airborne ? null : car.y - datum - hullStandAt(car),
      tilt: rollTilt(car.roll),
      rolling: car.rolling,
    });
    if (rolled && !car.rolling) break;
  }
  const damage = state.car.damage;
  return {
    u,
    w,
    frames,
    rolled,
    turns: Math.abs(state.car.roll - roll0) / (Math.PI * 2),
    across: frames.length ? frames[frames.length - 1].across : 0,
    upright: Math.abs(rollTilt(state.car.roll)) < WHEEL_BASIN,
    broken: damage.broken.length,
    wear: damage.wear,
    roof: damage.roof,
  };
}

/** How far the hull is standing off the ground at this attitude, m — the
 * deepest any of its corners reaches below the wheel plane. `game/roll.ts`
 * solves the same thing to place the car; this is the picture's half of
 * it, and the only thing it is used for is finding the GROUND under a body
 * whose height is being read off `car.y`. */
function hullStandAt(car) {
  if (!car.rolling) return 0;
  const tilt = rollTilt(car.roll);
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  let lowest = 0;
  for (const [a, h] of [...WHEELS, ...HULL]) {
    const y = h * cos + a * sin;
    if (y < lowest) lowest = y;
  }
  return -lowest;
}

const INK = {
  paper: [16, 18, 22],
  ground: [58, 62, 70],
  shell: [225, 228, 235],
  early: [92, 128, 178],
  late: [232, 96, 72],
  pivot: [250, 206, 84],
  wheel: [130, 136, 148],
  label: [206, 212, 222],
  dim: [124, 130, 142],
};

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** One roll, drawn from behind: the ground it crossed along the bottom and
 * the hull every `EVERY` steps standing on it. */
const EVERY = Math.round(TUNING.physicsHz / 6);
const PANEL = { w: 900, h: 230 };

function drawRoll(canvas, run, y0) {
  const shown = run.frames.filter((_, i) => i % EVERY === 0);
  if (shown.length === 0) return;
  let minA = Infinity;
  let maxA = -Infinity;
  for (const f of shown) {
    minA = Math.min(minA, f.across);
    maxA = Math.max(maxA, f.across);
  }
  // The picture is to SCALE, and capped: a roll that walks three metres and
  // one that is thrown sixty are drawn with the same car in them, so the
  // eye is comparing distance rather than being handed a zoom.
  const span = Math.max(6, maxA - minA + 4);
  const scale = Math.min((PANEL.w - 40) / span, 26);
  const groundY = y0 + PANEL.h - 26;
  const mid = (minA + maxA) / 2;
  // ...and the vertical window sits on the MIDDLE of the ground the roll
  // covered, so a car that rolled down a bank stays in its panel.
  const floors = run.frames.map((f) => f.ground).filter((g) => g !== null);
  const sink = floors.length ? (Math.min(...floors) + Math.max(...floors)) / 2 : 0;
  const px = (across, up) => [PANEL.w / 2 + (across - mid) * scale, groundY - (up - sink) * scale];
  const inPanel = ([, y]) => y > y0 + 24 && y < y0 + PANEL.h - 2;

  // THE GROUND, traced by the contacts themselves — never a flat line
  // assumed under a body that covered fifteen metres of hillside.
  const floor = run.frames.filter((f) => f.ground !== null);
  for (let i = 1; i < floor.length; i++) {
    const a = px(floor[i - 1].across, floor[i - 1].ground);
    const b = px(floor[i].across, floor[i].ground);
    canvas.line(a[0], a[1], b[0], b[1], INK.ground);
  }

  shown.forEach((f, i) => {
    const t = shown.length > 1 ? i / (shown.length - 1) : 0;
    const ink = mix(INK.early, INK.late, t);
    const sin = Math.sin(f.tilt);
    const cos = Math.cos(f.tilt);
    // The hull at this attitude, standing where the body actually is.
    const at = ([a, h]) => px(f.across + (a * cos - h * sin), f.up + (h * cos + a * sin));
    const corners = HULL.map(at);
    if (!corners.every(inPanel)) return;
    canvas.poly(corners, ink);
    for (let k = 0; k < corners.length; k++) {
      const b = corners[(k + 1) % corners.length];
      canvas.line(corners[k][0], corners[k][1], b[0], b[1], INK.shell);
    }
    for (const wheel of WHEELS) canvas.disk(...at(wheel), 2, INK.wheel);
    // THE AXLE: the corner of the body the roll is turning about right now,
    // which is the lowest point of the hull — largest y, because the
    // picture's y grows downward. A model spinning the car about a bar
    // under its own middle marks the same place in every frame; one that
    // turns it over its corners walks the mark along the ground.
    let low = -Infinity;
    let mark = null;
    for (const point of [...WHEELS, ...HULL]) {
      const p = at(point);
      if (p[1] <= low) continue;
      low = p[1];
      mark = p;
    }
    if (mark) canvas.disk(mark[0], mark[1], 2.6, INK.pivot);
  });

  const head = `${Math.round(run.u * 3.6)}KM/H  ${run.w.toFixed(0)}M/S ACROSS`;
  canvas.text(head, 20, y0 + 6, INK.label, 1);
  const sum = run.rolled
    ? `${run.turns.toFixed(2)} TURNS  ${run.across.toFixed(1)}M ACROSS  ` +
      `${run.broken} PARTS  ROOF ${(run.roof * 100).toFixed(0)}CM  ` +
      `WEAR ${(run.wear * 100).toFixed(0)}%  ${run.upright ? "ON ITS WHEELS" : "LYING"}`
    : "DID NOT GO OVER";
  canvas.text(sum, 20, y0 + 18, run.rolled ? INK.dim : INK.late, 1);
}

const runs = [];
for (const seed of SEEDS) {
  for (const [u, w] of TRIPS) runs.push({ seed, ...stageRoll(seed, u, w) });
}

const canvas = createCanvas(PANEL.w, 22 + runs.length * PANEL.h, INK.paper);
canvas.text(
  `THE ROLL — ${CAR.toUpperCase()}, FROM BEHIND, EVERY SIXTH OF A SECOND`,
  20,
  6,
  INK.label,
  2,
);
runs.forEach((run, i) => drawRoll(canvas, run, 22 + i * PANEL.h));
const file = join(outDir, `roll-${CAR}.png`);
writeFileSync(file, canvas.toPng());

console.log(` seed  entry        turns  across   parts   roof   wear  ended`);
for (const run of runs) {
  const entry = `${Math.round(run.u * 3.6)}km/h ${run.w}m/s`;
  console.log(
    `  ${String(run.seed).padStart(3)}  ${entry.padEnd(13)}` +
      `${run.turns.toFixed(2).padStart(5)}  ${run.across.toFixed(1).padStart(6)}m  ` +
      `${String(run.broken).padStart(5)}  ${(run.roof * 100).toFixed(0).padStart(3)}cm  ` +
      `${(run.wear * 100).toFixed(0).padStart(4)}%  ${run.upright ? "on its wheels" : "lying"}`,
  );
}
console.log(`\n${file}`);
