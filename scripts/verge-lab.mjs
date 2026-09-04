// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VERGE LAB — a car LEAVING THE ROAD, drawn from behind, with the
// ground it is standing on drawn under every frame.
//
// The verge is the one seam in the world the car crosses at speed: on the
// mat the ground is the road's own ribbon (`track.ts`, `locate`), out in
// the country it is the terrain lattice (`terrain.groundAt`), and the
// physics swaps readers the moment the middle of the car passes the verge
// line. Everything about a car going off — how far it drops, whether the
// wheels reach after the ground or the body leaves it, what the springs
// are handed — is decided in the handful of steps either side of that
// swap, and none of it is visible in a table of one number per stage.
//
// So this drives a car off the road and draws the crossing as an
// ELEVATION, seen from behind: across the road on the x axis, height on
// the y, the body every few hundredths of a second at the roll it is
// holding — and under each body, the ground under that body AT THAT
// MOMENT, sampled across the car's own width from both readers at once:
//
//   the ribbon      what `locate` says the road is, in road ink
//   the terrain     what `terrain.groundAt` says the country is, in green
//
// Where the two lie on top of each other the seam is honest and the car
// drives over it. Where they part — and they part by a body's height at
// the verge of some stages — the swap is a STEP in the ground, and the
// picture shows the car being thrown by it: a foot that fell tens of m/s
// in one step, a loft opening on ground that only ever went down, a body
// climbing away from a hillside it should be dropping down.
//
// Under the elevation runs the same run as numbers on the same x axis:
// the body's height over the ground, the loft, and the vertical speed the
// wheels were handed — so a spike in the picture and the number that
// caused it are read at the same place.
//
//   node scripts/verge-lab.mjs                     the standard set
//   node scripts/verge-lab.mjs --car=coupe         ...in another car
//   node scripts/verge-lab.mjs --seeds=9,1         ...off other ground
//   node scripts/verge-lab.mjs --speed=20          ...at another pace
//   node scripts/verge-lab.mjs --table             numbers only, no picture
//
// Writes previews/verge-<car>.png, and prints the steps around the
// crossing with what each reader said at each of them.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { NEUTRAL_INPUT, TUNING, createGame, locate, skipIntro, step } from "../engine/index.ts";

import { createCanvas } from "./lib/png.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "previews");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const CAR = arg("car", "compact");
const SPEED = Number(arg("speed", "28"));
const SEEDS = arg("seeds", "1,9,4")
  .split(",")
  .map((s) => Number(s.trim()));

/** Which way the car is steered off. The place it leaves from is not
 * chosen: the same stage leaves by a cut bank here and a graded shelf a
 * hundred metres on, so each side is tried from a spread of holds and the
 * first one that actually crosses the line is the one drawn. */
const SIDES = [1, -1];
const HOLDS = [3.4, 0, 1.6, 5.2, 7];

/** How far either side of the crossing the picture runs, s. The whole
 * event is over in a third of a second — the reader swaps, the foot is
 * handed a speed, the body answers — so the window is tight enough that
 * the bodies are drawn a car apart and the ground under them is legible. */
const BEFORE = 0.1;
const AFTER = 0.42;

// ── The run ───────────────────────────────────────────────────────────────

/** Drive out of the start, hold the road for `hold` seconds, then steer
 * off — recording every step from a moment before the crossing to well
 * after it. Everything the picture needs is read from OUTSIDE the engine,
 * so the lab measures the shipping model rather than a copy of it. */
function driveOff(seed, side, hold) {
  const state = createGame({ seed, length: "short", carId: CAR });
  skipIntro(state);
  const car = state.car;
  const track = state.track;
  const ground = state.terrain.groundAt;
  const hz = TUNING.physicsHz;

  const drive = (steer, steps, until) => {
    for (let i = 0; i < steps; i++) {
      step(state, { ...NEUTRAL_INPUT, throttle: 0.7, steer });
      if (until && until()) return true;
    }
    return false;
  };
  // Up to pace on the road, then the hold, then the wheel.
  for (let i = 0; i < hz * 30 && car.u < SPEED; i++) {
    step(state, { ...NEUTRAL_INPUT, throttle: 1 });
  }
  if (car.u < SPEED - 4) return null;
  drive(0, Math.round(hz * hold));

  // A ring of the last few steps ON the road, so the picture opens before
  // the crossing rather than at it.
  const before = Math.round(hz * BEFORE);
  const ring = [];
  const sample = () => {
    const fix = locate(track, car.x, car.z, state.nearIndex);
    const s = track.samples[fix.index];
    // THE GROUND UNDER THIS BODY, across the car's own width and a metre
    // past it either side, on the road's own across-axis — both readers,
    // at the same points, at this instant. This is the "what is below the
    // car" that is attached to the frame.
    const rightX = Math.cos(s.heading);
    const rightZ = -Math.sin(s.heading);
    const half = TUNING.collision.halfWidth + 1.2;
    const under = [];
    for (let k = -6; k <= 6; k++) {
      const lat = fix.lateral + (half * k) / 6;
      const x = car.x + rightX * (lat - fix.lateral);
      const z = car.z + rightZ * (lat - fix.lateral);
      under.push({
        lat,
        ribbon: locate(track, x, z, fix.index).elevation,
        terrain: ground(x, z),
      });
    }
    return {
      t: state.t,
      lateral: fix.lateral,
      offRoad: fix.offRoad,
      matHalf: s.width / 2,
      vergeAt: track.width / 2 + TUNING.offTrack.verge,
      y: car.y,
      // What the RENDERER draws the body at: the springs take up the first
      // of the loft (the droop) and the whole car comes up past it.
      drawn: car.y + (car.loft - Math.min(car.loft, TUNING.suspension.droop)),
      roll: car.roll,
      pitch: car.pitch,
      loft: car.loft,
      airborne: car.airborne,
      vy: car.vy,
      wheelVy: car.wheelVy,
      foot: car.foot,
      footVy: car.footVy,
      centreRibbon: locate(track, car.x, car.z, fix.index).elevation,
      centreTerrain: ground(car.x, car.z),
      under,
    };
  };
  for (let i = 0; i < before; i++) {
    step(state, { ...NEUTRAL_INPUT, throttle: 0.7, steer: 0 });
    ring.push(sample());
    if (ring.length > before) ring.shift();
    if (locate(track, car.x, car.z, state.nearIndex).offRoad) return null;
  }

  const frames = [...ring];
  const u0 = car.u;
  let crossed = -1;
  for (let i = 0; i < hz * 1.6 && crossed < 0; i++) {
    step(state, { ...NEUTRAL_INPUT, throttle: 0.7, steer: side * 0.6 });
    frames.push(sample());
    if (frames[frames.length - 1].offRoad) crossed = frames.length - 1;
    // A car still on the mat after a second and a half of full lock is on a
    // stage that turns the way it is being steered; that is not a crossing.
    if (frames.length > ring.length + hz) return null;
  }
  if (crossed < 0) return null;
  for (let i = 0; i < Math.round(hz * AFTER); i++) {
    step(state, { ...NEUTRAL_INPUT, throttle: 0.7, steer: side * 0.6 });
    frames.push(sample());
  }
  return { seed, side, hold, u: u0, frames, crossed };
}

// ── The reading ───────────────────────────────────────────────────────────

/** The window the picture draws: the crossing, and just enough either side
 * of it. Everything the seam does, it does inside a third of a second. */
function window(run) {
  const hz = TUNING.physicsHz;
  const from = Math.max(0, run.crossed - Math.round(hz * BEFORE));
  const to = Math.min(run.frames.length, run.crossed + Math.round(hz * AFTER));
  return run.frames.slice(from, to).map((f, i) => ({ ...f, n: from + i }));
}

/** The worst single step the picture is there to show: how far the drawn
 * body JUMPED upward between two consecutive steps, and where. A body that
 * drives off a road drops; anything that puts it up in the air in one
 * hundred-and-twentieth of a second is the seam, not the ground. */
function worstJump(shown) {
  let rise = 0;
  let at = shown[0].n;
  for (let i = 1; i < shown.length; i++) {
    const d = shown[i].drawn - shown[i - 1].drawn;
    if (d > rise) {
      rise = d;
      at = shown[i].n;
    }
  }
  return { rise, at };
}

/** ...and the worst the two readers ever disagreed under the car's own
 * middle while it was still ON the road — the size of the step the swap at
 * the verge line is about to hand the physics. */
function worstSeam(shown) {
  let gap = 0;
  for (const f of shown) {
    if (f.offRoad) continue;
    gap = Math.max(gap, Math.abs(f.centreRibbon - f.centreTerrain));
  }
  return gap;
}

/** The fastest the FOOT — the mean ground under the four wheels, which is
 * what the body's momentum is measured against — was ever told it moved,
 * m/s. A verge is a shape a car drives over, and the ground under a car at
 * rally pace moves at single figures; a reader swap is a teleport, and it
 * shows up here as a speed no hillside could produce. */
const peakFootVy = (shown) => Math.max(...shown.map((f) => Math.abs(f.footVy)));

// ── The picture ───────────────────────────────────────────────────────────

const INK = {
  paper: [16, 18, 22],
  terrain: [86, 138, 92],
  ribbon: [176, 150, 96],
  seam: [232, 96, 72],
  early: [92, 128, 178],
  late: [236, 232, 240],
  air: [232, 96, 72],
  wheel: [130, 136, 148],
  label: [206, 212, 222],
  dim: [110, 116, 128],
  rule: [46, 50, 58],
  over: [150, 200, 230],
  loft: [232, 176, 72],
  foot: [214, 120, 200],
};

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const PANEL = { w: 1180, h: 386, strip: 118, pad: 54 };
/** Every third step. A car at rally pace covers a fifth of its own length
 * in that, so the bodies overlap enough to read as one motion and not so
 * much that the ground under them is hidden. */
const EVERY = 3;
const BODY = { half: TUNING.collision.halfWidth, high: 0.72, sill: 0.16 };
/** Vertical exaggeration. The event is fourteen centimetres in one step
 * against a verge tens of metres wide, and drawn true to scale it is one
 * pixel. The factor is stated on the panel, because a slope drawn at the
 * wrong aspect is a different slope and the picture must not pretend
 * otherwise. */
const EXAG = Number(arg("exag", "5"));

function drawRun(canvas, run, y0) {
  const shown = window(run);
  const bodies = shown.filter((f) => f.n % EVERY === 0 || f.n === run.crossed);
  let minL = Infinity;
  let maxL = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const f of shown) {
    minL = Math.min(minL, f.lateral - BODY.half - 1.4);
    maxL = Math.max(maxL, f.lateral + BODY.half + 1.4);
    for (const u of f.under) minY = Math.min(minY, u.terrain, u.ribbon);
    maxY = Math.max(maxY, f.drawn + BODY.high + BODY.sill);
    minY = Math.min(minY, f.drawn);
  }
  const top = y0 + 36;
  const floor = y0 + PANEL.h - PANEL.strip - 16;
  // The picture fills its panel ACROSS and is stretched UP to whatever the
  // room allows, capped at `EXAG`; the ratio that came out is stated on the
  // panel, because a slope drawn at the wrong aspect is a different slope.
  const scaleX = (PANEL.w - PANEL.pad - 20) / Math.max(1e-3, maxL - minL);
  const scaleY = Math.min(scaleX * EXAG, (floor - top) / Math.max(1e-3, maxY - minY + 0.2));
  const exag = scaleY / scaleX;
  const px = (lat, y) => [PANEL.pad + (lat - minL) * scaleX, floor - (y - minY) * scaleY];

  // The mat's edge and the verge line — the rule the reader swaps on.
  const side = Math.sign(shown[shown.length - 1].lateral) || 1;
  for (const [lat, ink, tag] of [
    [shown[0].matHalf * side, INK.rule, "MAT"],
    [shown[0].vergeAt * side, INK.seam, "VERGE"],
  ]) {
    const [x] = px(lat, 0);
    for (let y = top; y < floor; y += 4) canvas.set(x, y, ink);
    canvas.text(tag, x - 8, floor + 3, ink, 1);
  }

  // THE GROUND UNDER EVERY FRAME, both readers, drawn first and behind the
  // bodies: the terrain the country is made of, and the ribbon the road
  // says is there. Where the two lie on each other the seam is honest.
  for (const f of bodies) {
    for (let i = 1; i < f.under.length; i++) {
      const a = f.under[i - 1];
      const b = f.under[i];
      canvas.line(...px(a.lat, a.terrain), ...px(b.lat, b.terrain), INK.terrain);
      // The ribbon is only drawn where it PARTS from the terrain: laid over
      // it everywhere else it is the same line twice, and the whole point of
      // the picture is the places where the two are not the same ground.
      if (Math.abs(a.terrain - a.ribbon) > 0.02) {
        canvas.line(...px(a.lat, a.ribbon), ...px(b.lat, b.ribbon), INK.ribbon);
      }
    }
  }

  // THE BODY, at the roll it is holding, over the ground it is standing on.
  bodies.forEach((f, i) => {
    const t = bodies.length > 1 ? i / (bodies.length - 1) : 0;
    const ink = f.airborne ? INK.air : mix(INK.early, INK.late, t);
    const sin = Math.sin(f.roll);
    const cos = Math.cos(f.roll);
    // The roll is drawn at the exaggeration too, or a body over stretched
    // ground sits at an angle the ground it is on never had.
    const at = (a, h) => px(f.lateral + a * cos - (h * sin) / exag, f.drawn + h * cos + a * sin);
    const shell = [
      at(-BODY.half, BODY.sill),
      at(BODY.half, BODY.sill),
      at(BODY.half, BODY.sill + BODY.high),
      at(-BODY.half, BODY.sill + BODY.high),
    ];
    for (let k = 0; k < shell.length; k++) {
      const b = shell[(k + 1) % shell.length];
      canvas.line(shell[k][0], shell[k][1], b[0], b[1], ink);
    }
    // The wheels are left on the ground the body lifted off: the first of
    // the loft is the springs' droop, and past that the whole car is up.
    for (const a of [-BODY.half, BODY.half]) {
      const [wx, wy] = at(a, BODY.sill - Math.min(f.loft, TUNING.suspension.droop));
      canvas.disk(wx, wy, 2, f.airborne ? INK.air : INK.wheel);
    }
    // THE NUMBER ON THE FRAME — the step it is, so the picture and the
    // table below it are read at the same place.
    const [lx, ly] = at(0, BODY.sill + BODY.high);
    canvas.text(String(f.n), lx - 5, ly - 9, f.airborne ? INK.air : INK.dim, 1);
  });

  // The step the middle of the car crossed the verge line on.
  const cross = shown.find((f) => f.n === run.crossed);
  if (cross) {
    const [cx, cy] = px(cross.lateral, cross.drawn + BODY.sill + BODY.high);
    canvas.text("OFF", cx - 6, cy - 21, INK.seam, 1);
    canvas.line(cx, cy - 14, cx, cy - 4, INK.seam);
  }

  // ── The strip: the same run as numbers, against the STEP ──────────────
  const sTop = floor + 22;
  const sBot = y0 + PANEL.h - 8;
  const nx = (n) =>
    PANEL.pad + ((n - shown[0].n) / Math.max(1, shown.length - 1)) * (PANEL.w - PANEL.pad - 20);
  // The three things that can put a body above the ground under its middle,
  // read apart: the SEAT (the car's own corners, straddling a break it is
  // too long to follow), the LOFT (the body up off its wheels), and the
  // FOOT's speed, which is what opens the loft. Their sum is the body's
  // height over the country, and which of them is carrying it is the whole
  // diagnosis — a seat is a car standing on its tail, a loft is a car in
  // the air, and a foot moving at a speed no hillside could is a seam.
  const traces = [
    { key: "seat", ink: INK.over, name: "SEAT OVER THE MIDDLE", unit: "M" },
    { key: "loft", ink: INK.loft, name: "LOFT", unit: "M" },
    { key: "footVy", ink: INK.foot, name: "FOOT VY", unit: "M/S" },
  ];
  const rows = traces.length;
  traces.forEach((tr, r) => {
    const rowTop = sTop + (r * (sBot - sTop)) / rows;
    const rowBot = sTop + ((r + 1) * (sBot - sTop)) / rows - 4;
    const value = (f) => (tr.key === "seat" ? f.y - f.centreTerrain : f[tr.key]);
    let lo = Infinity;
    let hi = -Infinity;
    for (const f of shown) {
      lo = Math.min(lo, value(f));
      hi = Math.max(hi, value(f));
    }
    const span = Math.max(1e-3, hi - lo);
    const vy = (v) => rowBot - ((v - lo) / span) * (rowBot - rowTop);
    canvas.line(PANEL.pad, rowBot, PANEL.w - 20, rowBot, INK.rule);
    for (let i = 1; i < shown.length; i++) {
      canvas.line(
        nx(shown[i - 1].n),
        vy(value(shown[i - 1])),
        nx(shown[i].n),
        vy(value(shown[i])),
        tr.ink,
      );
    }
    canvas.text(
      `${tr.name}  ${lo.toFixed(2)}..${hi.toFixed(2)}${tr.unit}`,
      PANEL.pad + 2,
      rowTop - 1,
      tr.ink,
      1,
    );
  });
  // ...and the crossing, drawn through all three so the spike and the step
  // that caused it line up on the eye.
  const cx = nx(run.crossed);
  for (let y = sTop; y < sBot; y += 3) canvas.set(cx, y, INK.seam);

  // ── The heading ───────────────────────────────────────────────────────
  const jump = worstJump(shown);
  const seam = worstSeam(shown);
  const bad = jump.rise > 0.05 || seam > 0.05;
  canvas.text(
    `SEED ${run.seed}  ${run.side > 0 ? "RIGHT" : "LEFT"}  ${Math.round(run.u * 3.6)}KM/H  ` +
      `HELD ${run.hold.toFixed(1)}S  ${exag.toFixed(1)}X VERTICAL`,
    20,
    y0 + 8,
    INK.label,
    1,
  );
  canvas.text(
    `ONE-STEP RISE ${(jump.rise * 100).toFixed(0)}CM AT ${jump.at}  ` +
      `READERS APART UNDER THE CAR ${(seam * 100).toFixed(0)}CM  ` +
      `PEAK FOOT VY ${peakFootVy(shown).toFixed(0)}M/S`,
    20,
    y0 + 21,
    bad ? INK.seam : INK.dim,
    1,
  );
}

// ── Drive them ────────────────────────────────────────────────────────────

const runs = [];
for (const seed of SEEDS) {
  for (const side of SIDES) {
    for (const hold of HOLDS) {
      const run = driveOff(seed, side, hold);
      if (run) {
        runs.push(run);
        break;
      }
    }
  }
}
if (runs.length === 0) {
  console.error("no run left the road — try other --seeds or a lower --speed");
  process.exit(1);
}

if (!has("table")) {
  mkdirSync(outDir, { recursive: true });
  const canvas = createCanvas(PANEL.w, 28 + runs.length * PANEL.h, INK.paper);
  canvas.text(
    `THE VERGE — ${CAR.toUpperCase()}, FROM BEHIND, EVERY ${EVERY} STEPS`,
    20,
    6,
    INK.label,
    2,
  );
  canvas.text("TERRAIN", 700, 10, INK.terrain, 1);
  canvas.text("RIBBON", 780, 10, INK.ribbon, 1);
  canvas.text("AIRBORNE", 856, 10, INK.air, 1);
  runs.forEach((run, i) => drawRun(canvas, run, 28 + i * PANEL.h));
  const file = join(outDir, `verge-${CAR}.png`);
  writeFileSync(file, canvas.toPng());
  console.log(`${file}\n`);
}

// The steps either side of the crossing, as the numbers behind the picture.
for (const run of runs) {
  const shown = window(run);
  console.log(
    `seed ${run.seed}  ${run.side > 0 ? "right" : "left"}  ` +
      `${Math.round(run.u * 3.6)}km/h  held ${run.hold.toFixed(1)}s`,
  );
  console.log(
    "  step  lat     ribbon   terrain   apart      y     drawn    seat   over   loft  pitch  wheelVy  footVy  air",
  );
  for (const f of shown) {
    if (f.n < run.crossed - 6 || f.n > run.crossed + 9) continue;
    console.log(
      `  ${String(f.n).padStart(4)}${f.n === run.crossed ? "*" : " "} ` +
        `${f.lateral.toFixed(2).padStart(6)} ` +
        `${f.centreRibbon.toFixed(3).padStart(8)} ${f.centreTerrain.toFixed(3).padStart(9)} ` +
        `${(f.centreRibbon - f.centreTerrain).toFixed(3).padStart(7)} ` +
        `${f.y.toFixed(3).padStart(8)} ${f.drawn.toFixed(3).padStart(8)} ` +
        `${(f.y - f.centreTerrain).toFixed(2).padStart(6)} ` +
        `${(f.drawn - f.centreTerrain).toFixed(2).padStart(6)} ` +
        `${f.loft.toFixed(3).padStart(6)} ` +
        `${((f.pitch * 180) / Math.PI).toFixed(0).padStart(5)} ` +
        `${f.wheelVy.toFixed(1).padStart(7)} ` +
        `${f.footVy.toFixed(1).padStart(7)}  ${f.airborne ? "AIR" : "-"}`,
    );
  }
  const jump = worstJump(shown);
  console.log(
    `  worst one-step rise ${(jump.rise * 100).toFixed(1)}cm at step ${jump.at}; ` +
      `readers apart under the car ${(worstSeam(shown) * 100).toFixed(1)}cm; ` +
      `peak foot vy ${peakFootVy(shown).toFixed(1)}m/s\n`,
  );
}
