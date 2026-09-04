// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DRAWING A CRASH — the schematic half of the crash lab.
//
// A crash is four motions at once (travel, roll, yaw, pitch) and the game's
// own picture of it is a car, at speed, mostly off screen. So this draws it
// the way an accident is drawn on paper: no car, no scenery, no light — an
// outline, a ground line, an arrow, and the NUMBERS beside each frame.
//
// Three panels, each answering one question:
//
//   THE PLAN     — where did it go and which way was it pointing? Straight
//                  down the road, or did it hook off into the trees; which
//                  hand did it spin, and what did it hit on the way.
//   THE PROFILE  — did it CARRY? The body's cross-section at its own roll
//                  attitude, placed where it was down the road, so a car
//                  bouncing forward draws a line of outlines walking away
//                  and a car grinding in place draws a stack of them.
//   THE FRAMES   — one cell per sample: the body from behind, the body from
//                  above, and every number that decides the next step.
//
// Everything is in the RELEASE FRAME (`crash-stage.mjs`): `along` runs down
// the heading the car was let go on and `across` to the driver's right.

import { TUNING } from "../../engine/index.ts";

const B = TUNING.collision;

/** The body from BEHIND: the hull the roll turns on, in (across, up) from
 * the wheel plane — the same outline `game/roll.ts` stands on the ground. */
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
/** ...and from ABOVE: the collision box, nose first. */
const PLAN = [
  [-B.halfWidth, B.halfLength],
  [B.halfWidth, B.halfLength],
  [B.halfWidth, -B.halfLength],
  [-B.halfWidth, -B.halfLength],
];

export const INK = {
  paper: [16, 18, 22],
  panel: [22, 25, 31],
  rule: [46, 50, 58],
  ground: [58, 62, 70],
  shell: [225, 228, 235],
  early: [92, 128, 178],
  late: [232, 96, 72],
  pivot: [250, 206, 84],
  travel: [96, 214, 158],
  wheel: [130, 136, 148],
  solid: [122, 112, 96],
  struck: [214, 84, 74],
  label: [206, 212, 222],
  dim: [124, 130, 142],
  air: [110, 160, 226],
  hit: [244, 132, 96],
};

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const round = (v, n = 0) => v.toFixed(n);

/** An outline: `poly` fills, and every shape in this file is a shape you
 * want to see THROUGH, because they are drawn a dozen deep. */
function outline(canvas, points, ink) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    canvas.line(a[0], a[1], b[0], b[1], ink);
  }
}

/** An arrow from a point, for a velocity or a heading. */
function arrow(canvas, x, y, dx, dy, ink) {
  const len = Math.hypot(dx, dy);
  if (len < 1.5) return;
  const ux = dx / len;
  const uy = dy / len;
  canvas.line(x, y, x + dx, y + dy, ink);
  for (const s of [-1, 1]) {
    canvas.line(
      x + dx,
      y + dy,
      x + dx - ux * 4 + s * uy * 2.6,
      y + dy - uy * 4 - s * ux * 2.6,
      ink,
    );
  }
}

/** A frame of reference for a panel: metres in, pixels out, sized so the
 * whole run fits with a margin and never zoomed past `maxScale` — a crash
 * that covers eighty metres and one that covers four are then comparable
 * by eye, which is the entire point of drawing them the same way. */
function fit(box, span, mid, maxScale) {
  const scale = Math.min((box.w - box.pad * 2) / Math.max(span.x, 1e-3), maxScale);
  const vScale = Math.min((box.h - box.pad * 2) / Math.max(span.y, 1e-3), maxScale);
  const s = Math.min(scale, vScale);
  return {
    s,
    at: (a, b) => [box.x + box.w / 2 + (a - mid.x) * s, box.y + box.h / 2 - (b - mid.y) * s],
  };
}

function extent(values, pad) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return { lo: lo - pad, hi: hi + pad, span: hi - lo + pad * 2, mid: (lo + hi) / 2 };
}

/** A scale bar, so a distance in the picture is a distance in metres. */
function scaleBar(canvas, x, y, s, metres) {
  canvas.line(x, y, x + metres * s, y, INK.dim);
  canvas.line(x, y - 3, x, y + 3, INK.dim);
  canvas.line(x + metres * s, y - 3, x + metres * s, y + 3, INK.dim);
  canvas.text(`${metres}M`, x + metres * s + 5, y - 2, INK.dim, 1);
}

/** PANEL 1 — THE PLAN. Where the body went and which way it faced, with
 * everything standing in its way drawn where it stood. */
export function drawPlan(canvas, run, box, shown) {
  canvas.text("PLAN — WHERE IT WENT, AND WHICH WAY IT POINTED", box.x, box.y - 9, INK.label, 1);
  // `across` grows to the driver's RIGHT, and a plan is read looking DOWN
  // with the travel running left to right — so right-of-car is DOWN the
  // page. `fit`'s second axis already grows upward, so the axis is NEGATED,
  // and it has to be negated in the extent too or the picture is centred on
  // the mirror of itself and walks off the top of its panel.
  const alongs = [...run.frames.map((f) => f.along), ...run.props.map((p) => p.along), 0];
  const acrosses = [...run.frames.map((f) => -f.across), ...run.props.map((p) => -p.across), 0];
  const a = extent(alongs, 4);
  const c = extent(acrosses, 4);
  const view = fit(box, { x: a.span, y: c.span }, { x: a.mid, y: c.mid }, 14);
  const at = (f, along, across) => view.at(along, -across);

  // The ground line the car was let go on, and the release mark.
  const [ox, oy] = at(null, 0, 0);
  canvas.line(box.x + 4, oy, box.x + box.w - 4, oy, INK.rule);
  canvas.line(ox, oy - 7, ox, oy + 7, INK.dim);

  for (const p of run.props) {
    const [px, py] = at(null, p.along, p.across);
    // Struck is what the body REACHED; felled is what left the world for
    // it. A rooted thing the car folded itself against is neither missed
    // nor gone, and the picture has to be able to say so.
    const ink = run.felled.has(p.id) ? INK.struck : run.touched.has(p.id) ? INK.hit : INK.solid;
    const r = Math.max(2, p.radius * view.s);
    for (let k = 0; k < 16; k++) {
      const t0 = (k / 16) * Math.PI * 2;
      const t1 = ((k + 1) / 16) * Math.PI * 2;
      canvas.line(
        px + Math.cos(t0) * r,
        py + Math.sin(t0) * r,
        px + Math.cos(t1) * r,
        py + Math.sin(t1) * r,
        ink,
      );
    }
  }

  // The path itself, every step, so the shape between the drawn bodies is
  // visible: a roll walks a scallop, a spin draws a hook.
  for (let i = 1; i < run.frames.length; i++) {
    const p = at(null, run.frames[i - 1].along, run.frames[i - 1].across);
    const q = at(null, run.frames[i].along, run.frames[i].across);
    canvas.line(p[0], p[1], q[0], q[1], INK.rule);
  }

  shown.forEach((f, i) => {
    const t = shown.length > 1 ? i / (shown.length - 1) : 0;
    const ink = mix(INK.early, INK.late, t);
    const sin = Math.sin(f.yaw);
    const cos = Math.cos(f.yaw);
    // The box, turned by how far the nose has come round from the release.
    const corners = PLAN.map(([r, fwd]) =>
      at(null, f.along + (fwd * cos + r * sin), f.across + (r * cos - fwd * sin)),
    );
    outline(canvas, corners, ink);
    // The NOSE, so the hand of a spin is readable: a bar across the front.
    canvas.line(corners[0][0], corners[0][1], corners[1][0], corners[1][1], INK.shell);
    // ...and the TRAVEL, which is a different arrow entirely once the car
    // is sideways — the gap between the two IS the slip.
    const [cx, cy] = at(null, f.along, f.across);
    const vAlong = f.u * cos + f.w * sin;
    const vAcross = f.u * sin - f.w * cos;
    arrow(canvas, cx, cy, vAlong * 0.55, vAcross * 0.55, INK.travel);
    canvas.text(String(i), cx + 3, cy + 3, INK.dim, 1);
  });
  scaleBar(canvas, box.x + 8, box.y + box.h - 8, view.s, 10);
}

/** PANEL 2 — THE PROFILE. The body's cross-section at its roll attitude,
 * placed where it was DOWN THE ROAD: the picture that says whether the car
 * carried its momentum through the crash or ground to a halt inside it.
 *
 * It mixes two axes on purpose — a rear view placed on a side view — and it
 * is the standard way an accident sequence is drawn, because the thing you
 * have to see is the attitude AND the distance in one line. */
export function drawProfile(canvas, run, box, shown) {
  canvas.text(
    "PROFILE — THE ATTITUDE, PLACED WHERE IT WAS DOWN THE ROAD",
    box.x,
    box.y - 9,
    INK.label,
    1,
  );
  const a = extent([...run.frames.map((f) => f.along), 0], 3);
  const ups = run.frames.map((f) => f.up);
  const u = extent([...ups, ...run.frames.map((f) => f.ground), 0], 1.6);
  const view = fit(box, { x: a.span, y: u.span }, { x: a.mid, y: u.mid }, 13);

  // The ground, traced by the body's own contacts — never a flat line
  // assumed under a crash that covered eighty metres of country.
  const floor = run.frames.filter((f) => !f.airborne);
  for (let i = 1; i < floor.length; i++) {
    const p = view.at(floor[i - 1].along, floor[i - 1].ground);
    const q = view.at(floor[i].along, floor[i].ground);
    canvas.line(p[0], p[1], q[0], q[1], INK.ground);
  }

  shown.forEach((f, i) => {
    const t = shown.length > 1 ? i / (shown.length - 1) : 0;
    const ink = mix(INK.early, INK.late, t);
    const sin = Math.sin(f.tilt);
    const cos = Math.cos(f.tilt);
    // The outline is turned by the roll and then laid on the ALONG axis:
    // its width is drawn down the road. That is a schematic and says so —
    // the hull has no length in it, and what the picture is for is the
    // attitude AT A DISTANCE, which no single true projection shows.
    const at = ([across, up]) => {
      const [px, py] = view.at(f.along, f.up + (up * cos + across * sin));
      return [px + (across * cos - up * sin) * view.s, py];
    };
    outline(canvas, HULL.map(at), ink);
    for (const wheel of WHEELS) canvas.disk(...at(wheel), 1.8, INK.wheel);
    if (f.airborne) {
      const [x, y] = view.at(f.along, f.up + B.roofY + 0.6);
      canvas.disk(x, y, 1.6, INK.air);
    }
  });
  scaleBar(canvas, box.x + 8, box.y + box.h - 8, view.s, 10);
}

/** PANEL 3 — THE FRAMES. One cell per sample: the body from behind on its
 * own ground line, the body from above against the release heading, and the
 * numbers that decide what the next step does. */
export function drawFrames(canvas, run, box, shown) {
  canvas.text("FRAMES — EVERY SIXTH OF A SECOND, WITH ITS NUMBERS", box.x, box.y - 9, INK.label, 1);
  const CELL = { w: 168, h: 128 };
  const cols = Math.max(1, Math.floor(box.w / CELL.w));
  shown.forEach((f, i) => {
    const cx = box.x + (i % cols) * CELL.w;
    const cy = box.y + Math.floor(i / cols) * CELL.h;
    drawCell(canvas, run, f, i, cx, cy, CELL);
  });
  return Math.ceil(shown.length / cols) * CELL.h;
}

function drawCell(canvas, run, f, index, x, y, cell) {
  const t = run.shownCount > 1 ? index / (run.shownCount - 1) : 0;
  const ink = mix(INK.early, INK.late, t);
  outline(
    canvas,
    [
      [x + 1, y + 1],
      [x + cell.w - 3, y + 1],
      [x + cell.w - 3, y + cell.h - 3],
      [x + 1, y + cell.h - 3],
    ],
    INK.rule,
  );
  const tag = eventTag(f.events);
  canvas.text(`${index}  ${round(f.t, 2)}S`, x + 6, y + 6, INK.dim, 1);
  if (tag) canvas.text(tag, x + cell.w - 6 - tag.length * 4, y + 6, INK.hit, 1);

  // ── From BEHIND: the hull on its ground line, the pivot corner marked ──
  const rearX = x + 44;
  const rearY = y + 52;
  const s = 15;
  canvas.line(x + 6, rearY + 2, x + 82, rearY + 2, INK.ground);
  const sin = Math.sin(f.tilt);
  const cos = Math.cos(f.tilt);
  const lift = f.airborne ? Math.min(0.9, Math.max(0, f.up - f.ground)) : 0;
  const rear = ([across, up]) => [
    rearX + (across * cos - up * sin) * s,
    rearY + 2 - (up * cos + across * sin + lift) * s,
  ];
  outline(canvas, HULL.map(rear), ink);
  for (const wheel of WHEELS) canvas.disk(...rear(wheel), 1.6, INK.wheel);
  // THE AXLE: the lowest corner of the hull, which is what the body is
  // turning about. In the air there is none, and none is drawn.
  if (!f.airborne) {
    let low = -Infinity;
    let mark = null;
    for (const point of [...WHEELS, ...HULL]) {
      const p = rear(point);
      if (p[1] <= low) continue;
      low = p[1];
      mark = p;
    }
    if (mark) canvas.disk(mark[0], mark[1], 2.2, INK.pivot);
  }

  // ── From ABOVE: the nose against the release heading, and the travel ──
  const planX = x + 126;
  const planY = y + 48;
  const ps = 9;
  const ysin = Math.sin(f.yaw);
  const ycos = Math.cos(f.yaw);
  const plan = ([across, fwd]) => [
    planX + (across * ycos - fwd * ysin) * ps,
    planY - (fwd * ycos + across * ysin) * ps,
  ];
  const corners = PLAN.map(plan);
  outline(canvas, corners, ink);
  canvas.line(corners[0][0], corners[0][1], corners[1][0], corners[1][1], INK.shell);
  const vAlong = f.u * ycos + f.w * ysin;
  const vAcross = f.u * ysin - f.w * ycos;
  arrow(canvas, planX, planY, vAcross * 0.42, -vAlong * 0.42, INK.travel);

  // ── ...and the numbers, which are the point of the whole panel ────────
  const rows = [
    `${round(f.speed * 3.6)}KM/H  U${round(f.u, 1)} W${round(f.w, 1)}`,
    `ROLL ${round(deg(f.tilt))} ${round(f.rollRate, 1)}R/S VY${round(f.vy, 1)}`,
    `YAW ${round(deg(f.yaw))} ${round(f.yawRate, 1)}R/S PIT ${round(deg(f.pitch))}`,
    `${f.airborne ? "AIR " : "DOWN"} ${f.rolling ? "ROLLING" : ""} ` +
      `W${round(f.wear * 100)}% P${f.parts}`,
  ];
  rows.forEach((row, i) => canvas.text(row, x + 6, y + cell.h - 34 + i * 8, INK.label, 1));
}

const deg = (rad) => (rad * 180) / Math.PI;

/** What happened on this step, as a tag for the corner of its cell. The
 * ordering is worst-first: a step that both landed and broke a part is a
 * step that broke a part. */
function eventTag(events) {
  for (const want of ["partBreak", "rollover", "impact", "landing", "spin", "takeoff"]) {
    if (events.some((e) => e.type === want)) return want.toUpperCase().slice(0, 9);
  }
  return null;
}
