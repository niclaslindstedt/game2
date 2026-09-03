#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIFT LAB — every corner the generator can build, driven through by
// every technique a driver has, measured and DRAWN.
//
// A stage is a bad laboratory: its corners are whatever the seed rolled,
// they arrive at whatever speed the last one left, and two runs are never
// the same corner twice. This builds the corners instead — the generator's
// own vocabulary (soft / medium / hard, left and right, and the sequences
// that actually catch a car out) — enters each one at a fixed speed, and
// drives it once per technique: on the wheel alone, on a lift, on a
// trailed brake, on the lever, and off a Scandinavian flick.
//
// What comes back is two things, and both are the point:
//
//   previews/drift-<car>.png   one panel per corner, the car drawn every
//                              tenth of a second as an oriented body with
//                              its TRAVEL arrow — so the slip angle is the
//                              gap between where it points and where it is
//                              going, and the line it took is the line you
//                              can see it took. Tinted by speed, marked
//                              where it leaves the road.
//   the table                  entry / apex / exit speed, peak and carried
//                              slip, the tightest radius held, apex g, how
//                              long it was sideways, and how far off the
//                              crown it ran — per corner, per technique.
//
//   npm run drift                       # every car, every corner
//   npm run drift -- --car compact      # one car
//   npm run drift -- --surface asphalt  # gravel (default) or asphalt
//   npm run drift -- --entry 30         # entry speed, m/s
//   npm run drift -- --moves brake,lever
//   npm run drift -- --corners hard-left,chicane
//   npm run drift -- --table            # numbers only, no pictures
//
// The techniques are scripted rather than driven by the bot on purpose:
// the question this answers is what the CAR does when a driver asks it
// something, and a bot in the loop would answer a different question (that
// one is `make sim`). The steering is a plain pure-pursuit on the
// centreline, identical for every technique, so any difference in the line
// belongs to the pedals and the lever.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { createCanvas } from "./lib/png.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const engine = await import(join(root, "engine/index.ts"));
const { CARS, NEUTRAL_INPUT, STAGE_RULES, TUNING, compileTrack, cornerSpeed, createGame, step } =
  engine;

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const has = (name) => args.includes(`--${name}`);

const surface = flag("surface") ?? "gravel";
const entrySpeed = Number(flag("entry") ?? 30);
const deg = (rad) => (rad * 180) / Math.PI;

// ── The corners ──────────────────────────────────────────────────────────
// Straight off STAGE_RULES.turn, so the lab tests the corners the generator
// actually builds: the middle of each severity's radius band, and its
// mid-range angle. A stage's own corners are these, plus a seed's opinion.
const TURN = STAGE_RULES.turn;
const band = (severity) => ({
  radius: (TURN[severity].radius.min + TURN[severity].radius.max) / 2,
  angle: (TURN[severity].angle.min + TURN[severity].angle.max) / 2,
});

/** A corner is a run-up, one or more turns, and road to leave on. The
 * sequences are the ones that catch a car out: a car still sideways from
 * the last corner arrives at the next one with its weight in the wrong
 * place, which is the whole reason a flick works. */
const CORNERS = [
  { id: "soft-left", label: "SOFT LEFT", turns: [["soft", 1]] },
  { id: "medium-left", label: "MEDIUM LEFT", turns: [["medium", 1]] },
  { id: "hard-left", label: "HARD LEFT", turns: [["hard", 1]] },
  { id: "hard-right", label: "HARD RIGHT", turns: [["hard", -1]] },
  {
    id: "chicane",
    label: "HARD L-R",
    turns: [
      ["hard", 1],
      ["hard", -1],
    ],
    gap: 25,
  },
  {
    id: "opening",
    label: "HARD L-SOFT L",
    turns: [
      ["hard", 1],
      ["soft", 1],
    ],
    gap: 30,
  },
  {
    id: "tightening",
    label: "SOFT L-HARD L",
    turns: [
      ["soft", 1],
      ["hard", 1],
    ],
    gap: 30,
  },
  {
    id: "medium-pair",
    label: "MEDIUM L-R",
    turns: [
      ["medium", 1],
      ["medium", -1],
    ],
    gap: 40,
  },
];

function planOf(corner) {
  const plan = [{ kind: "straight", length: 260, feature: "none" }];
  corner.turns.forEach(([severity, dir], i) => {
    if (i > 0) plan.push({ kind: "straight", length: corner.gap ?? 30, feature: "none" });
    const { radius, angle } = band(severity);
    plan.push({ kind: "turn", length: radius * angle, radius, dir, severity, feature: "none" });
  });
  plan.push({ kind: "straight", length: 220, feature: "none" });
  return plan;
}

// ── The techniques ───────────────────────────────────────────────────────
// Each one is what the pedals and the lever do around the turn-in; the
// hands are the same pure-pursuit in all of them, and the APPROACH is the
// same too — every technique brakes to the same entry speed on the way in,
// so what the sheet compares is the move and never who arrived slowest.
// `at` is metres before the turn the move begins, `hold` how long it runs,
// and `after` the throttle the driver settles on once it is over.
const MOVES = {
  wheel: { label: "WHEEL ONLY", at: 0, hold: 0, after: 1, drive: () => ({ throttle: 1 }) },
  lift: { label: "LIFT", at: 12, hold: 0.7, after: 0.6, drive: () => ({ throttle: 0 }) },
  brake: {
    label: "TRAIL BRAKE",
    at: 10,
    hold: 1,
    after: 0.6,
    // Carried PAST the turn-in and bled off toward the apex. The approach
    // has already scrubbed the speed off; this is the pedal still being
    // there when the wheel goes on, which is the whole move.
    drive: (t, hold) => ({ throttle: 0, brake: t < hold * 0.45 ? 0.45 : 0.2 }),
  },
  lever: {
    label: "HANDBRAKE",
    at: 8,
    hold: 0.4,
    after: 0.7,
    drive: () => ({ throttle: 0, handbrake: true }),
  },
  flick: {
    label: "FLICK",
    at: 45,
    hold: 1,
    after: 0.7,
    // Wind it AWAY from the corner, then snap the hands back with the
    // weight still crossing: the steering override is what makes this a
    // flick and not a lift, and the brake is what the weight rides on.
    drive: (t, hold) =>
      t < hold * 0.5
        ? { throttle: 0, brake: 0.25, steerOverride: -1 }
        : { throttle: 0, brake: 0.5 },
  },
};

// ── The test driver ──────────────────────────────────────────────────────
// Pure pursuit on the centreline, plus a throttle that holds the entry
// speed on the run-up. Deliberately simple: it is a fixture, not a driver,
// and every technique gets exactly the same one.
function pursue(state, aheadMeters) {
  const { car, track } = state;
  const step = Math.round(aheadMeters / track.step);
  // From where the car IS, not from how far the run has got: a lab car
  // holding a slide across the road is still on the sample it is beside.
  const aim = track.samples[Math.min(track.samples.length - 1, state.nearIndex + step)];
  const desired = Math.atan2(aim.x - car.x, aim.z - car.z);
  let error = desired - car.heading;
  while (error > Math.PI) error -= 2 * Math.PI;
  while (error < -Math.PI) error += 2 * Math.PI;
  // Sideways, aim where the car is GOING and not where its nose points, or
  // the lock comes off the moment the drift starts and the lab measures a
  // car being straightened rather than one being driven.
  return Math.max(-1, Math.min(1, (error + car.slip * 0.85) * 2.4));
}

/** Every turn in the plan, as arc metres in and out plus the radius — what
 * the driver reads the road with, and what the apex is measured at. */
function turnsOf(plan) {
  const turns = [];
  let s = 0;
  for (const seg of plan) {
    if (seg.kind === "turn") turns.push({ from: s, to: s + seg.length, radius: seg.radius });
    s += seg.length;
  }
  return turns;
}

/** The grip this car has on the lab's surface — the surface's own times the
 * rubber it sits on, exactly as the handling model reads it. */
function gripOf(spec) {
  const tyre = surface === "asphalt" ? spec.tyres.sealed : spec.tyres.loose;
  return TUNING.surfaces.grip[surface] * tyre;
}

/** How fast this car may ARRIVE at a turn of this radius. Off `limits.ts` —
 * what the tyres will actually hold at that radius (`limits.ts`, which
 * needs BOTH halves of the surface: how hard it holds and how far sideways
 * it lets the car go) — times how hot the driver wants to be.
 * Reading it per turn rather than fixing one number for the sheet is what
 * makes the panels comparable: every technique is then asked the same
 * question, which is "the tyres will only just hold this — what gets it
 * round, and what does it cost?" */
/** How much of that hold the lab's driver asks for. Not all of it: the
 * hold is the very limit — the angle the car parks at, the lateral the
 * tyres give up there — and a driver arriving at exactly it has nothing
 * left for a technique to spend, so every panel on the sheet went off the
 * road and the comparison stopped being one. This is a driver arriving fast
 * and still on the road, which is the state the sheet is asking questions
 * about. `--over` is how to arrive past it on purpose. */
const ENTRY_SHARE = 0.85;

function entryFor(spec, radius) {
  if (flag("entry")) return entrySpeed;
  return (
    cornerSpeed(spec, 1 / radius, gripOf(spec), TUNING.surfaces.breakaway[surface], ENTRY_SHARE) *
    Number(flag("over") ?? 1)
  );
}

function drive(spec, corner, moveId) {
  const plan = planOf(corner);
  const base = compileTrack(0, plan);
  // THE ROAD IS THE REAL WIDTH; the SURFACE under the lab is three times it.
  // A car that runs wide has to stay measurable — off the road it is being
  // measured against a tree, and the run ends in a respawn instead of a
  // number — so the lab paves the run-off and then judges the car against
  // where the road's edge really was. `half` is that edge, and it is what
  // the panels draw and the table's `road` column reads.
  const half = base.width / 2;
  const track = {
    ...base,
    width: base.width * 2.2,
    samples: base.samples.map((s) => ({ ...s, surface, bank: 0 })),
  };
  const state = createGame({ seed: 0, carId: spec.id, skipCountdown: true, track });
  const move = MOVES[moveId];
  const turns = turnsOf(plan);
  const turnAt = turns[0].from;
  const target = entryFor(spec, turns[0].radius);
  const dir = corner.turns[0][1];

  const frames = [];
  let started = null;
  let peakSlip = 0;
  let apexSlip = 0;
  let minSpeed = Infinity;
  let apexG = 0;
  let tightest = Infinity;
  let sideways = 0;
  let widest = 0;
  let offRoad = false;
  let entry = 0;
  const endAt = turns[turns.length - 1].to;
  for (let i = 0; i < 120 * 60; i++) {
    const car = state.car;
    const toTurn = turnAt - state.progressS;
    const input = { ...NEUTRAL_INPUT, steer: pursue(state, Math.max(10, car.u * 0.7)) };
    // THE APPROACH, identical for every technique: arrive at the speed the
    // turn allows, which `limits.ts` worked out from its radius. A sequence
    // brakes for each of its turns in turn, so the second corner is a
    // corner and not the wreckage of the first.
    const next = turns.find((t) => state.progressS < t.from - 2);
    const want = next ? entryFor(spec, next.radius) : Infinity;
    // The MOVE fires at its own distance from the FIRST turn-in and runs
    // for its own window; it is the technique under test, and everything
    // after it is the same driver in every panel.
    if (toTurn > move.at) {
      if (car.u > want) input.brake = 1;
      else if (car.u < want - 0.5) input.throttle = 1;
      else input.throttle = 0.35;
    } else {
      if (started === null) started = state.t;
      const t = state.t - started;
      if (t < move.hold) Object.assign(input, move.drive(t, move.hold));
      else if (car.u > want + 1) input.brake = 0.8;
      else input.throttle = move.after;
    }
    // The flick's first half winds the wheel AWAY from the corner; its
    // second half hands the hands straight back to the pursuit, which is
    // already asking for the corner.
    if (input.steerOverride) input.steer = input.steerOverride * -dir;
    delete input.steerOverride;
    step(state, input);

    if (toTurn <= move.at) entry ||= Math.hypot(car.u, car.w);
    if (state.progressS < turnAt - 70) continue;
    const speed = Math.hypot(car.u, car.w);
    const slip = Math.abs(car.slip);
    const wide = Math.abs(state.lateral);
    if (wide > half) offRoad = true;
    peakSlip = Math.max(peakSlip, slip);
    minSpeed = Math.min(minSpeed, speed);
    // The lateral g the car is actually holding ROUND a turn. Measured
    // inside the turns only: a flick's own transient throws a yaw rate at a
    // straight-line speed that reads as ten g and means nothing about how
    // hard the car is cornering.
    const inTurn = turns.some((t) => state.progressS >= t.from && state.progressS <= t.to);
    if (inTurn) apexG = Math.max(apexG, (speed * Math.abs(car.yawRate)) / 9.81);
    if (state.progressS >= turnAt) {
      tightest = Math.min(
        tightest,
        Math.abs(car.yawRate) > 1e-3 ? speed / Math.abs(car.yawRate) : Infinity,
      );
    }
    // The car's OWN answer, not a second copy of the threshold: what counts
    // as sideways is sized in the surface's breakaway, so a restated
    // `enterSlip` here reads gravel's angles onto a paved run and reports a
    // tarmac drift as no drift at all. It is also the number the dust, the
    // smoke and the HUD are lit off, which is what this column is for.
    if (car.drifting) sideways += TUNING.dt;
    widest = Math.max(widest, wide);
    // The angle at the APEX — mid-corner, where a drift either is or is not
    // doing the driver any good. The peak alone flatters a yank that spun
    // the car and gathered it up before it reached anything.
    for (const t of turns) {
      const mid = (t.from + t.to) / 2;
      if (Math.abs(state.progressS - mid) < track.step) apexSlip = Math.max(apexSlip, slip);
    }
    if (i % 18 === 0) {
      frames.push({
        x: car.x,
        z: car.z,
        heading: car.heading,
        slip: car.slip,
        roll: car.roll,
        speed,
        drifting: car.drifting,
        off: wide > half,
      });
    }
    if (state.progressS > endAt + 70) break;
  }

  return {
    corner,
    moveId,
    frames,
    entry: entry || target,
    target,
    exit: Math.hypot(state.car.u, state.car.w),
    minSpeed: minSpeed === Infinity ? 0 : minSpeed,
    peakSlip,
    apexSlip,
    apexG,
    tightest,
    sideways,
    widest,
    offRoad,
    half,
    from: turnAt,
    to: endAt,
    samples: track.samples,
    width: track.width,
  };
}

// ── The picture ──────────────────────────────────────────────────────────
const INK = {
  paper: [16, 18, 22],
  verge: [34, 38, 34],
  road: [58, 56, 54],
  edge: [96, 92, 86],
  crown: [70, 68, 64],
  path: [120, 128, 140],
  travel: [250, 240, 120],
  off: [220, 70, 60],
  label: [225, 225, 230],
  dim: [130, 130, 138],
};

/** Slow is cold, fast is hot — the same ramp on every panel, so a car's
 * colour means the same thing across the sheet. */
function speedInk(speed) {
  const t = Math.max(0, Math.min(1, (speed - 8) / 34));
  return [Math.round(60 + 190 * t), Math.round(150 - 60 * t), Math.round(230 - 190 * t)];
}

function renderPanel(canvas, run, box) {
  const { x0, y0, w, h } = box;
  // Fit THE CORNER, not the plan: the run-up is a quarter of a kilometre of
  // straight whose only job was to get the car up to speed, and framing it
  // renders the corner as eight pixels. A margin either side of the turns
  // is what a driver would call the corner.
  const shown = run.samples.filter((s) => s.s > run.from - 45 && s.s < run.to + 70);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of shown) {
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    minZ = Math.min(minZ, s.z);
    maxZ = Math.max(maxZ, s.z);
  }
  const pad = run.width * 0.6;
  const scale = Math.min((w - 16) / (maxX - minX + pad * 2), (h - 26) / (maxZ - minZ + pad * 2));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const px = (x, z) => [x0 + w / 2 + (x - cx) * scale, y0 + h / 2 + 8 + (z - cz) * scale];

  // The run-off first, then the road itself on top of it: what the car is
  // allowed is the inner band, and everything outside it is a verge the lab
  // paved so a wide car stays a measurement instead of becoming a crash.
  const band = (halfWidth, color) => {
    for (let i = 1; i < shown.length; i++) {
      const a = shown[i - 1];
      const b = shown[i];
      const an = [Math.cos(a.heading), -Math.sin(a.heading)];
      const bn = [Math.cos(b.heading), -Math.sin(b.heading)];
      canvas.poly(
        [
          px(a.x + an[0] * halfWidth, a.z + an[1] * halfWidth),
          px(b.x + bn[0] * halfWidth, b.z + bn[1] * halfWidth),
          px(b.x - bn[0] * halfWidth, b.z - bn[1] * halfWidth),
          px(a.x - an[0] * halfWidth, a.z - an[1] * halfWidth),
        ],
        color,
      );
    }
  };
  band(run.width / 2, INK.verge);
  band(run.half, INK.road);
  for (let i = 6; i < shown.length; i += 6) {
    canvas.disk(...px(shown[i].x, shown[i].z), 0.6, INK.crown);
  }

  // The line the car took, then the car itself along it.
  for (let i = 1; i < run.frames.length; i++) {
    const a = px(run.frames[i - 1].x, run.frames[i - 1].z);
    const b = px(run.frames[i].x, run.frames[i].z);
    canvas.line(a[0], a[1], b[0], b[1], INK.path);
  }
  const bodyLen = 4.3 * scale;
  const bodyWide = 1.85 * scale;
  for (const f of run.frames) {
    const [fx, fy] = px(f.x, f.z);
    // The body, drawn on the HEADING: a rectangle whose long axis is where
    // the nose points. Rolled cars are drawn narrower on the loaded side,
    // which at this scale is the only honest way to show lean from above.
    const sin = Math.sin(f.heading);
    const cos = Math.cos(f.heading);
    const lean = Math.max(0.55, 1 - Math.abs(f.roll) * 1.4);
    const corners = [
      [bodyLen / 2, (bodyWide / 2) * (f.roll > 0 ? lean : 1)],
      [bodyLen / 2, (-bodyWide / 2) * (f.roll < 0 ? lean : 1)],
      [-bodyLen / 2, (-bodyWide / 2) * (f.roll < 0 ? lean : 1)],
      [-bodyLen / 2, (bodyWide / 2) * (f.roll > 0 ? lean : 1)],
    ].map(([along, across]) => [fx + sin * along + cos * across, fy + cos * along - sin * across]);
    canvas.poly(corners, f.drifting ? [235, 175, 70] : speedInk(f.speed));
    // ...and the TRAVEL arrow, drawn on heading + slip. The angle between
    // the two IS the drift: a gripped car's arrow lies along its own body,
    // a sideways one's points off it by the slip angle, and that gap is the
    // thing this whole sheet exists to let you see.
    const dir = f.heading + f.slip;
    const reach = bodyLen * 1.15;
    canvas.line(
      fx,
      fy,
      fx + Math.sin(dir) * reach,
      fy + Math.cos(dir) * reach,
      Math.abs(f.slip) > TUNING.drift.enterSlip ? INK.travel : INK.dim,
    );
  }

  const caption = `${run.corner.label}  ${MOVES[run.moveId].label}`;
  canvas.text(caption, x0 + 8, y0 + 6, INK.label, 1);
  const numbers =
    `${deg(run.peakSlip).toFixed(0)}° PEAK  ${run.tightest.toFixed(0)}M  ` +
    `${run.minSpeed.toFixed(0)}-${run.exit.toFixed(0)}M/S  ${run.sideways.toFixed(1)}S`;
  canvas.text(numbers, x0 + 8, y0 + h - 10, run.offRoad ? INK.off : INK.dim, 1);
}

// ── Run it ───────────────────────────────────────────────────────────────
const cars = flag("car") ? [flag("car")] : CARS.map((c) => c.id);
const moveIds = flag("moves") ? flag("moves").split(",") : Object.keys(MOVES);
const cornerIds = flag("corners") ? flag("corners").split(",") : CORNERS.map((c) => c.id);
const corners = CORNERS.filter((c) => cornerIds.includes(c.id));
const outDir = join(root, "previews");
if (!has("table")) mkdirSync(outDir, { recursive: true });

for (const carId of cars) {
  const spec = CARS.find((c) => c.id === carId);
  const runs = [];
  for (const corner of corners) for (const id of moveIds) runs.push(drive(spec, corner, id));

  console.log(`\n${spec.name} (${spec.drive.toUpperCase()}) — ${surface}, in at ${entrySpeed} m/s`);
  console.log(
    "corner          move          peak°  held°   min  exit  radius   apexG  sideways  wide  road",
  );
  for (const run of runs) {
    const held = deg(run.apexSlip);
    console.log(
      `${run.corner.label.padEnd(15)} ${MOVES[run.moveId].label.padEnd(12)} ` +
        `${deg(run.peakSlip).toFixed(1).padStart(5)}  ${held.toFixed(1).padStart(5)}  ` +
        `${run.minSpeed.toFixed(1).padStart(4)}  ${run.exit.toFixed(1).padStart(4)}  ` +
        `${(run.tightest === Infinity ? 999 : run.tightest).toFixed(0).padStart(5)}m  ` +
        `${run.apexG.toFixed(2).padStart(5)}  ${run.sideways.toFixed(2).padStart(7)}s  ` +
        `${run.widest.toFixed(1).padStart(4)}m  ${run.offRoad ? "OFF" : "ok"}`,
    );
  }

  if (has("table")) continue;
  const cols = moveIds.length;
  const rows = corners.length;
  const cell = { w: 300, h: 230 };
  const canvas = createCanvas(cols * cell.w, rows * cell.h + 18, INK.paper);
  canvas.text(`${spec.name} ${spec.drive} ${surface} ${entrySpeed}M/S`, 8, 6, INK.label, 2);
  runs.forEach((run, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    renderPanel(canvas, run, { x0: col * cell.w, y0: 18 + row * cell.h, w: cell.w, h: cell.h });
  });
  const file = join(outDir, `drift-${carId}.png`);
  writeFileSync(file, canvas.toPng());
  console.log(`\n  → ${file}`);
}
