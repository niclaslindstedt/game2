// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LEVEL MAP: one stage, top down, annotated — the picture to reason
// about a stage from instead of driving it.
//
// Everything on it is read straight off the compiled track and the terrain
// field the game itself builds, with nothing rendered in between: no
// three.js, no browser, no built app. The ground is tinted by HEIGHT (with
// contours, so a climb reads as a climb), the water is blue, the road is
// coloured by what it is made of, every corner call is stroked in its
// severity's colour and labelled with its number, and every jump, crest,
// ford, bridge, split board, junction and both ends of the stage are marked
// with the same id `stage-features.mjs` prints in the table. Trees, rocks
// and logs standing within reach of the road's edge are dotted in, because
// they are what a wide line costs.
//
// Under the map runs the road's ELEVATION PROFILE against distance, with
// the same marks on it — the one picture that says what a jump's ramp and
// landing look like. Down the right is the key.
//
// `focus` re-frames the same drawing around one feature at a span of a few
// hundred metres, where a solid is drawn at its real size and the road at
// its real width.

import { createCanvas } from "./png.mjs";
import { NEAR_EDGE, SEVERITY_WORD, indexAtS, solidGroup, solidsAlong } from "./stage-features.mjs";

const TITLE_H = 40;
const LEGEND_W = 330;
const PROFILE_H = 150;

const PAPER = [246, 244, 238];
const INK = [24, 24, 28];
const WHITE = [255, 255, 255];
const WATER = [78, 140, 214];

/** Ground tint by height, low to high: valley green through moor tan to
 * bare summit. The same ramp colours the profile strip's fill so a height
 * on the map and a height under it are the same colour. */
const HYPSO = [
  [0.0, [88, 140, 96]],
  [0.3, [150, 182, 104]],
  [0.55, [204, 188, 122]],
  [0.8, [176, 138, 92]],
  [1.0, [226, 214, 196]],
];

const ROAD = {
  gravel: [208, 178, 124],
  asphalt: [58, 58, 64],
  deck: [190, 186, 176],
  ford: [104, 172, 238],
  edge: [96, 76, 50],
  spur: [156, 156, 162],
  highway: [126, 126, 132],
  /** R41 — the railway: ballast brown, darker than any road. */
  railway: [92, 76, 62],
};

export const SEVERITY_COLOR = {
  soft: [64, 186, 88],
  medium: [255, 162, 0],
  hard: [226, 40, 40],
};

const MARK = {
  jump: [232, 28, 28],
  crest: [250, 200, 40],
  checkpoint: [24, 66, 160],
  start: [30, 168, 72],
  finish: INK,
  junction: [150, 70, 200],
  crossing: [150, 70, 200],
  railcrossing: [60, 40, 30],
  homestead: [178, 52, 40],
  carpark: [40, 80, 170],
  ford: WATER,
  bridge: [110, 110, 120],
  guardMound: [150, 108, 60],
  guardGrove: [60, 120, 60],
};

const SOLID = {
  tree: [24, 92, 40],
  rock: [104, 104, 112],
  wood: [132, 84, 40],
  parapet: [200, 200, 206],
  building: [178, 52, 40],
  train: [60, 40, 30],
};

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hypso(t) {
  const u = Math.min(1, Math.max(0, t));
  for (let i = 1; i < HYPSO.length; i++) {
    if (u <= HYPSO[i][0]) {
      const [t0, c0] = HYPSO[i - 1];
      const [t1, c1] = HYPSO[i];
      return mix(c0, c1, (u - t0) / (t1 - t0));
    }
  }
  return HYPSO.at(-1)[1];
}

/** A contour interval that puts eight-ish lines across a height range:
 * the nearest of 1, 2, 5, 10, 20, 50 m. */
function contourInterval(range) {
  const raw = range / 8;
  for (const step of [1, 2, 5, 10, 20, 50]) if (raw <= step) return step;
  return 100;
}

/** Text with a paper halo, so a label survives whatever it lands on.
 * Returns the width drawn. */
function label(canvas, x, y, str, color = INK, scale = 2) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx || dy) canvas.text(str, x + dx, y + dy, PAPER, scale);
    }
  }
  return canvas.text(str, x, y, color, scale);
}

/** The frame: the whole road with a margin, or a square `span` metres
 * across centred on a point. */
export function frameFor(track, focus) {
  if (focus) {
    const half = focus.span / 2;
    return {
      minX: focus.x - half,
      maxX: focus.x + half,
      minZ: focus.z - half,
      maxZ: focus.z + half,
    };
  }
  const b = track.bounds;
  const pad = Math.max(30, 0.06 * Math.max(b.maxX - b.minX, b.maxZ - b.minZ));
  return { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad };
}

/**
 * Draw the map. `title` is the line across the top; `lines` are the
 * legend's opening rows (seed, dials, conditions). Returns the canvas.
 */
export function renderLevelMap({
  track,
  terrain,
  features,
  title,
  lines,
  size = 1200,
  focus = null,
}) {
  const W = size;
  const H = size;
  const canvas = createCanvas(W + LEGEND_W, TITLE_H + H + PROFILE_H, PAPER);
  const frame = frameFor(track, focus);
  const spanX = frame.maxX - frame.minX;
  const spanZ = frame.maxZ - frame.minZ;
  const scale = Math.min(W / spanX, H / spanZ);
  const midX = (frame.minX + frame.maxX) / 2;
  const midZ = (frame.minZ + frame.maxZ) / 2;
  const top = TITLE_H;
  // THE DRIVER'S HAND. North (+z) is up, and east (+x) is to the LEFT: the
  // engine's heading grows from +z toward +x, and the game reads that as a
  // LEFT turn (the three.js frame is right-handed with y up, so seen from
  // above with north up, +x lies to the left). A conventional east-right
  // map mirrors every corner — a LEFT call would draw as a right-hander —
  // and the whole point of the labels is that `T3 HARD L` bends the way the
  // driver will find it bending.
  const px = (x) => W / 2 - (x - midX) * scale;
  const pz = (z) => top + H / 2 - (z - midZ) * scale;
  const worldX = (sx) => midX - (sx - W / 2) / scale;
  const worldZ = (sy) => midZ - (sy - top - H / 2) / scale;
  /** Unit vectors along and to the LEFT of travel at a sample: travel is
   * (sin h, cos h), and the left is where the nose goes as h grows. */
  const along = (s) => [Math.sin(s.heading), Math.cos(s.heading)];
  const leftOf = (s) => [Math.cos(s.heading), -Math.sin(s.heading)];
  const inMap = (sx, sy) => sx >= 0 && sx < W && sy >= top && sy < top + H;
  const { samples } = track;

  // ── The ground: height tint, water, contours ──────────────────────────
  const LAT = 2;
  const cols = Math.ceil(W / LAT) + 2;
  const rows = Math.ceil(H / LAT) + 2;
  const heights = new Float32Array(cols * rows);
  const wet = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = worldX(i * LAT);
      const z = worldZ(top + j * LAT);
      heights[j * cols + i] = terrain.heightAt(x, z);
      if (terrain.waterAt(x, z) != null) wet[j * cols + i] = 1;
    }
  }
  // The ramp is the ROAD's climb, with a quarter of it to spare each way:
  // the country around a stage runs from lake beds to summits the road
  // never visits, and a ramp stretched over those flattens the forty
  // metres the driver actually feels into one shade. Ground beyond the
  // ramp clamps to its ends.
  let roadLo = Infinity;
  let roadHi = -Infinity;
  for (const s of samples) {
    if (s.elevation < roadLo) roadLo = s.elevation;
    if (s.elevation > roadHi) roadHi = s.elevation;
  }
  const spare = Math.max(2, (roadHi - roadLo) * 0.25);
  const lo = roadLo - spare;
  const hi = roadHi + spare;
  const range = Math.max(1, hi - lo);
  const interval = contourInterval(range);
  const heightAt = (sx, sy) => {
    const gx = sx / LAT;
    const gy = (sy - top) / LAT;
    const i = Math.min(cols - 2, Math.max(0, Math.floor(gx)));
    const j = Math.min(rows - 2, Math.max(0, Math.floor(gy)));
    const fx = gx - i;
    const fy = gy - j;
    const h00 = heights[j * cols + i];
    const h10 = heights[j * cols + i + 1];
    const h01 = heights[(j + 1) * cols + i];
    const h11 = heights[(j + 1) * cols + i + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  };
  const band = new Int32Array(W);
  for (let sy = top; sy < top + H; sy++) {
    let leftBand = null;
    for (let sx = 0; sx < W; sx++) {
      const h = heightAt(sx, sy);
      const i = Math.min(cols - 1, Math.round(sx / LAT));
      const j = Math.min(rows - 1, Math.round((sy - top) / LAT));
      const thisBand = Math.floor(h / interval);
      let color;
      if (wet[j * cols + i]) color = WATER;
      else {
        color = hypso((h - lo) / range);
        const edge =
          (leftBand !== null && thisBand !== leftBand) || (sy > top && thisBand !== band[sx]);
        if (edge) color = mix(color, INK, thisBand % 5 === 0 ? 0.5 : 0.28);
      }
      canvas.set(sx, sy, color);
      leftBand = thisBand;
      band[sx] = thisBand;
    }
  }

  // ── Roads that are not the stage: the public tarmac and the branches ──
  for (const highway of track.highways) {
    const r = Math.max(1, (highway.width / 2) * scale);
    const ink = highway.kind === "rail" ? ROAD.railway : ROAD.highway;
    for (const p of highway.points) {
      const sx = px(p.x);
      const sy = pz(p.z);
      if (inMap(sx, sy)) canvas.disk(sx, sy, r, ink);
    }
  }
  /** A road that is not the stage, as a run of overlapping disks: the
   * branch and drive samples are metres apart, which a close-up spreads
   * into a dotted line unless the gaps are filled. */
  const strokeRoad = (points, width, color) => {
    const r = Math.max(1, (width / 2) * scale);
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[Math.min(i + 1, points.length - 1)];
      const fill = Math.max(1, Math.ceil((Math.hypot(b.x - a.x, b.z - a.z) * scale) / r));
      for (let k = 0; k < fill; k++) {
        const t = k / fill;
        const sx = px(a.x + (b.x - a.x) * t);
        const sy = pz(a.z + (b.z - a.z) * t);
        if (inMap(sx, sy)) canvas.disk(sx, sy, r, color);
      }
    }
  };
  for (const spur of track.spurs) strokeRoad(spur.samples, spur.width, ROAD.spur);

  // ── Corner guards: ground, not road, so under it ──────────────────────
  for (const guard of terrain.guards) {
    const sx = px(guard.x);
    const sy = pz(guard.z);
    if (!inMap(sx, sy)) continue;
    const r = Math.max(1.5, guard.radius * scale);
    const color = guard.kind === "mound" ? MARK.guardMound : MARK.guardGrove;
    canvas.disk(sx, sy, r, mix(color, PAPER, focus ? 0.55 : 0.25));
  }

  // ── The homesteads (R37): the yard, the drive and the house ───────────
  for (const home of track.homesteads ?? []) {
    const yx = px(home.yard.x);
    const yz = pz(home.yard.z);
    if (inMap(yx, yz))
      canvas.disk(yx, yz, Math.max(2, home.yard.radius * scale), mix(ROAD.gravel, PAPER, 0.35));
    strokeRoad(home.drive.samples, home.drive.width, ROAD.spur);
    // The house as its footprint, a rectangle turned to its heading: the
    // plan's width runs across the front, the depth back from it.
    const { plan } = home.house;
    const hx = Math.sin(home.house.heading);
    const hz = Math.cos(home.house.heading);
    const corners = [
      [-plan.width / 2, -plan.depth / 2],
      [plan.width / 2, -plan.depth / 2],
      [plan.width / 2, plan.depth / 2],
      [-plan.width / 2, plan.depth / 2],
    ].map(([w, d]) => [px(home.house.x + hz * w + hx * d), pz(home.house.z - hx * w + hz * d)]);
    if (corners.some(([x, y]) => inMap(x, y))) canvas.poly(corners, SOLID.building);
  }

  // ── The towns (R39): every lot's pad and its building's footprint ─────
  for (const town of track.towns ?? []) {
    for (const lot of town.lots) {
      const { pad, building } = lot;
      const lx = px(pad.x);
      const lz = pz(pad.z);
      if (inMap(lx, lz)) {
        canvas.disk(lx, lz, Math.max(2, pad.radius * scale), mix(ROAD.gravel, PAPER, 0.35));
      }
      const { plan } = building;
      const hx = Math.sin(building.heading);
      const hz = Math.cos(building.heading);
      const corners = [
        [-plan.width / 2, -plan.depth / 2],
        [plan.width / 2, -plan.depth / 2],
        [plan.width / 2, plan.depth / 2],
        [-plan.width / 2, plan.depth / 2],
      ].map(([w, d]) => [px(building.x + hz * w + hx * d), pz(building.z - hx * w + hz * d)]);
      if (corners.some(([x, y]) => inMap(x, y))) canvas.poly(corners, SOLID.building);
    }
  }

  // ── The car parks (R42): the pad, the road in, the trails out to the
  // stands and the boards along them ────────────────────────────────────
  for (const park of terrain.carParks ?? []) {
    const cx = px(park.pad.x);
    const cz = pz(park.pad.z);
    if (inMap(cx, cz)) {
      canvas.disk(cx, cz, Math.max(2, park.pad.radius * scale), mix(ROAD.gravel, PAPER, 0.35));
    }
    strokeRoad(park.road.samples, park.road.width, ROAD.spur);
    for (const car of park.cars) {
      const sx = px(car.x);
      const sy = pz(car.z);
      if (inMap(sx, sy)) canvas.disk(sx, sy, Math.max(1, 1.1 * scale), INK);
    }
    for (const trail of park.trails) {
      for (let i = 0; i < trail.samples.length; i += 2) {
        const p = trail.samples[i];
        const sx = px(p.x);
        const sy = pz(p.z);
        if (inMap(sx, sy)) canvas.disk(sx, sy, Math.max(0.8, 0.9 * scale), MARK.carpark);
      }
      for (const sign of trail.signs) {
        const sx = px(sign.x);
        const sy = pz(sign.z);
        if (inMap(sx, sy)) canvas.disk(sx, sy, Math.max(1.5, 1.4 * scale), WHITE);
      }
    }
  }

  // ── The road, at its width, by surface ────────────────────────────────
  const finishS = track.finishS ?? Infinity;
  const quad = (a, b, halfA, halfB) => {
    const off = (s, half, sign) => {
      // The mat is shifted RIGHT by `shift` (R17's mouths), so its centre
      // moves the other way in left-positive terms.
      const [lx, lz] = leftOf(s);
      const lateral = sign * half - (s.shift ?? 0);
      return [px(s.x + lx * lateral), pz(s.z + lz * lateral)];
    };
    return [off(a, halfA, 1), off(b, halfB, 1), off(b, halfB, -1), off(a, halfA, -1)];
  };
  const surfaceColor = (s) =>
    s.deck != null
      ? ROAD.deck
      : s.surface === "water"
        ? ROAD.ford
        : s.surface === "asphalt"
          ? ROAD.asphalt
          : ROAD.gravel;
  const minHalf = 1.6 / scale;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i + 1 < samples.length; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      const ax = px(a.x);
      const ay = pz(a.z);
      if (!inMap(ax, ay) && !inMap(px(b.x), pz(b.z))) continue;
      const halfA = Math.max(minHalf, a.width / 2);
      const halfB = Math.max(minHalf, b.width / 2);
      if (pass === 0) {
        canvas.poly(quad(a, b, halfA + 0.8, halfB + 0.8), ROAD.edge);
      } else {
        let color = surfaceColor(a);
        if (a.s > finishS) color = mix(color, PAPER, 0.5);
        canvas.poly(quad(a, b, halfA, halfB), color);
      }
    }
  }
  // The road's half-width in pixels sets how big a mark is drawn — up to a
  // cap in a close-up, where the road is forty pixels wide and a mark that
  // size would hide the thing it marks.
  const roadHalf = (track.width / 2) * scale;
  const roadR = Math.max(2, Math.min(roadHalf, focus ? 9 : Infinity));

  // ── The calls: a stroke down the road in the severity's colour ────────
  for (const turn of features.filter((f) => f.kind === "turn")) {
    const from = indexAtS(samples, turn.s);
    const to = indexAtS(samples, turn.endS);
    const r = Math.max(1.5, roadR * 0.4);
    // Disks close enough to overlap, so the stroke stays a line when a
    // close-up spreads the samples ten pixels apart.
    const fill = Math.max(1, Math.ceil((track.step * scale) / r));
    for (let i = from; i <= to; i++) {
      const a = samples[i];
      const b = samples[Math.min(i + 1, to)];
      for (let k = 0; k < fill; k++) {
        const t = k / fill;
        const sx = px(a.x + (b.x - a.x) * t);
        const sy = pz(a.z + (b.z - a.z) * t);
        if (inMap(sx, sy)) canvas.disk(sx, sy, r, SEVERITY_COLOR[turn.severity]);
      }
    }
  }

  // ── Direction arrows and distance ticks along the route ───────────────
  const arrowEvery = focus ? 40 : Math.max(150, Math.round(track.length / 30 / 50) * 50);
  const tickEvery = focus ? 50 : 500;
  const arrow = (s, size, color) => {
    const i = indexAtS(samples, s);
    const at = samples[i];
    const [dx, dz] = along(at);
    const [lx, lz] = leftOf(at);
    const m = size / scale;
    const pts = [
      [at.x + dx * m, at.z + dz * m],
      [at.x - dx * m * 0.6 + lx * m * 0.7, at.z - dz * m * 0.6 + lz * m * 0.7],
      [at.x - dx * m * 0.6 - lx * m * 0.7, at.z - dz * m * 0.6 - lz * m * 0.7],
    ].map(([x, z]) => [px(x), pz(z)]);
    if (pts.some(([x, y]) => inMap(x, y))) canvas.poly(pts, color);
  };
  for (let s = arrowEvery / 2; s < track.length; s += arrowEvery) {
    arrow(s, Math.max(5, roadR * 1.1) + 1.5, INK);
    arrow(s, Math.max(5, roadR * 1.1), WHITE);
  }
  for (let s = tickEvery; s < track.length; s += tickEvery) {
    const at = samples[indexAtS(samples, s)];
    const [lx, lz] = leftOf(at);
    const reach = at.width / 2 + 2.5 / scale;
    const x0 = px(at.x + lx * reach);
    const y0 = pz(at.z + lz * reach);
    const x1 = px(at.x - lx * reach);
    const y1 = pz(at.z - lz * reach);
    if (!inMap(x0, y0) && !inMap(x1, y1)) continue;
    canvas.line(x0, y0, x1, y1, INK);
    const text = focus ? `${s}M` : `${(s / 1000).toFixed(1)}`;
    const tx = px(at.x - lx * (reach + 3 / scale));
    const ty = pz(at.z - lz * (reach + 3 / scale));
    if (inMap(tx, ty)) label(canvas, tx < x1 ? tx - 8 * text.length : tx, ty - 5, text, INK, 2);
  }

  // ── The solids within reach of the road ───────────────────────────────
  const drawSolid = (ob, near) => {
    const sx = px(ob.x);
    const sy = pz(ob.z);
    if (!inMap(sx, sy)) return;
    const group = solidGroup(ob);
    const color = near ? SOLID[group] : mix(SOLID[group], PAPER, 0.55);
    if (focus) {
      if (group === "tree") {
        canvas.disk(
          sx,
          sy,
          Math.max(2, 1.6 * ob.size * scale),
          mix(color, PAPER, near ? 0.6 : 0.8),
        );
      }
      canvas.disk(sx, sy, Math.max(1.5, ob.radius * scale), color);
    } else {
      canvas.disk(sx, sy, Math.max(2.2, 1.2 * scale), color);
    }
  };
  if (focus) {
    // Everything in the frame, at its own size; what is within reach of the
    // edge in full colour, the rest of the forest faded behind it.
    const near = solidsAlong(track, terrain, focus.s - focus.span, focus.s + focus.span);
    const nearKeys = new Set(near.map((p) => `${p.ob.x.toFixed(2)},${p.ob.z.toFixed(2)}`));
    const seen = new Set();
    const cell = 60;
    for (let x = frame.minX - cell; x < frame.maxX + cell; x += cell) {
      for (let z = frame.minZ - cell; z < frame.maxZ + cell; z += cell) {
        const found = terrain
          .treesNear(x + cell / 2, z + cell / 2, cell * 0.75)
          .concat(terrain.obstaclesNear(x + cell / 2, z + cell / 2, cell * 0.75))
          .concat(terrain.fixturesNear(x + cell / 2, z + cell / 2, cell * 0.75));
        for (const ob of found) {
          const key = `${ob.x.toFixed(2)},${ob.z.toFixed(2)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          drawSolid(ob, nearKeys.has(key));
        }
      }
    }
  } else {
    for (const placed of solidsAlong(track, terrain, 0, track.length, NEAR_EDGE)) {
      drawSolid(placed.ob, true);
    }
  }

  // ── The marks ─────────────────────────────────────────────────────────
  const placedLabels = [];
  const placeLabel = (feature, text, color) => {
    const sx = px(feature.x);
    const sy = pz(feature.z);
    if (!inMap(sx, sy)) return;
    const [lx, lz] = leftOf(feature);
    // A turn's label sits on the OUTSIDE of the bend; anything else on the
    // left of travel, where the distance ticks are not.
    const side = feature.kind === "turn" ? (feature.dir === "left" ? -1 : 1) : 1;
    const width = 4 * text.length * 2 + 8;
    // Walk outward on the preferred side, then the other, until the label
    // lands in the frame clear of every label already placed; failing all
    // of that, the last spot in the frame it found.
    let fallback = null;
    for (const sign of [side, -side]) {
      for (let step = 0; step < 6; step++) {
        const reach = (roadHalf + 14 + step * 14) / scale;
        const ax = px(feature.x + lx * reach * sign);
        const ay = pz(feature.z + lz * reach * sign);
        if (!inMap(ax, ay)) continue;
        // The text runs away from the road: to the right of the anchor
        // when the anchor is on the screen's right of the feature.
        const x0 = ax >= sx ? ax + 2 : ax - width;
        const y0 = ay - 5;
        if (x0 < 0 || x0 + width > W || y0 < top || y0 + 12 > top + H) continue;
        const box = { x0, y0, x1: x0 + width, y1: y0 + 12, ax, ay };
        const clash = placedLabels.some(
          (b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1,
        );
        if (clash) {
          fallback = fallback ?? box;
          continue;
        }
        return draw(box);
      }
    }
    if (fallback) draw(fallback);

    function draw(box) {
      placedLabels.push(box);
      canvas.line(sx, sy, box.ax, box.ay, INK);
      canvas.poly(
        [
          [box.x0, box.y0],
          [box.x0 + 6, box.y0],
          [box.x0 + 6, box.y0 + 10],
          [box.x0, box.y0 + 10],
        ],
        color,
      );
      label(canvas, box.x0 + 8, box.y0, text, INK, 2);
    }
  };
  for (const f of features) {
    const sx = px(f.x);
    const sy = pz(f.z);
    if (!inMap(sx, sy)) continue;
    switch (f.kind) {
      case "jump": {
        canvas.disk(sx, sy, roadR + 3, MARK.jump);
        arrow(f.s, roadR * 0.9, WHITE);
        if (focus && f.rampFrom != null) {
          // The ramp's start and the lip as bars across the road.
          for (const s of [f.rampFrom, f.s]) {
            const at = samples[indexAtS(samples, s)];
            const [lx, lz] = leftOf(at);
            const r = at.width / 2 + 1;
            canvas.line(
              px(at.x + lx * r),
              pz(at.z + lz * r),
              px(at.x - lx * r),
              pz(at.z - lz * r),
              MARK.jump,
            );
          }
        }
        break;
      }
      case "crest":
        canvas.disk(sx, sy, roadR + 3, INK);
        canvas.disk(sx, sy, roadR + 1.5, MARK.crest);
        break;
      case "ford":
      case "bridge":
        canvas.disk(sx, sy, roadR + 3, MARK[f.kind]);
        canvas.disk(sx, sy, roadR, f.kind === "ford" ? ROAD.ford : ROAD.deck);
        break;
      case "culvert":
        // The water goes UNDER: a ring of water round ordinary road.
        canvas.disk(sx, sy, roadR + 3, MARK.ford);
        canvas.disk(sx, sy, roadR, ROAD.gravel);
        break;
      case "checkpoint":
        canvas.disk(sx, sy, roadR + 3, MARK.checkpoint);
        canvas.disk(sx, sy, roadR, WHITE);
        break;
      case "start":
        canvas.disk(sx, sy, roadR + 5, MARK.start);
        arrow(0.5, roadR * 1.2, WHITE);
        break;
      case "finish":
        canvas.disk(sx, sy, roadR + 5, INK);
        canvas.disk(sx, sy, roadR + 2.5, WHITE);
        canvas.disk(sx, sy, roadR, INK);
        break;
      case "carpark": {
        // R42 — the car park's own sign: the blue square with the white
        // disc in it, stood on the pad itself rather than on the road.
        const r = roadR + 3;
        const cx = px(f.x);
        const cy = pz(f.z);
        canvas.poly(
          [
            [cx - r, cy - r],
            [cx + r, cy - r],
            [cx + r, cy + r],
            [cx - r, cy + r],
          ],
          MARK.carpark,
        );
        canvas.disk(cx, cy, r * 0.5, WHITE);
        break;
      }
      case "railcrossing": {
        // R41 — a level crossing's own sign: the cross, in the railway's
        // ink, over a white disc.
        const r = roadR + 4;
        canvas.disk(sx, sy, r, MARK.railcrossing);
        canvas.disk(sx, sy, r - 1.5, WHITE);
        canvas.line(sx - r + 1, sy - r + 1, sx + r - 1, sy + r - 1, MARK.railcrossing);
        canvas.line(sx - r + 1, sy + r - 1, sx + r - 1, sy - r + 1, MARK.railcrossing);
        break;
      }
      case "junction":
      case "crossing": {
        const r = roadR + 3;
        canvas.poly(
          [
            [sx - r, sy - r],
            [sx + r, sy - r],
            [sx + r, sy + r],
            [sx - r, sy + r],
          ],
          MARK.junction,
        );
        canvas.poly(
          [
            [sx - r + 2, sy - r + 2],
            [sx + r - 2, sy - r + 2],
            [sx + r - 2, sy + r - 2],
            [sx - r + 2, sy + r - 2],
          ],
          WHITE,
        );
        break;
      }
      default:
        break;
    }
  }
  for (const f of features) {
    const color = f.kind === "turn" ? SEVERITY_COLOR[f.severity] : (MARK[f.kind] ?? INK);
    const text =
      focus && f.kind === "turn"
        ? `${f.id} ${SEVERITY_WORD[f.severity]} ${f.dir.toUpperCase()}`
        : f.label;
    let anchor = f;
    if (f.kind === "turn" && !inMap(px(f.x), pz(f.z))) {
      // A call whose middle is off the frame is still in it somewhere:
      // label the part that is, at the sample nearest the frame's centre.
      const from = indexAtS(samples, f.s);
      const to = indexAtS(samples, f.endS);
      let best = null;
      let bestD = Infinity;
      for (let i = from; i <= to; i++) {
        const s = samples[i];
        if (!inMap(px(s.x), pz(s.z))) continue;
        const d = Math.hypot(s.x - midX, s.z - midZ);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (!best) continue;
      anchor = { ...f, x: best.x, z: best.z, heading: best.heading };
    }
    placeLabel(anchor, text, color);
  }

  // ── The title, the key, the profile ───────────────────────────────────
  label(canvas, 10, 12, title, INK, 3);
  const scaleBar = focus ? 50 : 500;
  {
    // A scale bar under the title's right end: this many metres.
    const w = scaleBar * scale;
    const x0 = W - 16 - w;
    const y0 = 24;
    canvas.line(x0, y0, x0 + w, y0, INK);
    canvas.line(x0, y0 - 4, x0, y0 + 4, INK);
    canvas.line(x0 + w, y0 - 4, x0 + w, y0 + 4, INK);
    label(canvas, x0 + w / 2 - 12, y0 - 16, `${scaleBar} M`, INK, 2);
    canvas.line(x0 + w + 12, y0 + 4, x0 + w + 12, y0 - 6, INK);
    canvas.poly(
      [
        [x0 + w + 12, y0 - 10],
        [x0 + w + 9, y0 - 4],
        [x0 + w + 15, y0 - 4],
      ],
      INK,
    );
    label(canvas, x0 + w + 20, y0 - 8, "N", INK, 2);
  }
  drawLegend(canvas, W + 12, TITLE_H + 8, { lines, lo, hi, interval });
  drawProfile(canvas, { track, features, top: TITLE_H + H, width: W, lo, range, focus });
  return canvas;
}

/** The key down the right-hand column. */
function drawLegend(canvas, x, y, { lines, lo, hi, interval }) {
  const row = (text, color) => {
    if (color)
      canvas.poly(
        [
          [x, y],
          [x + 10, y],
          [x + 10, y + 10],
          [x, y + 10],
        ],
        color,
      );
    canvas.text(text, x + (color ? 14 : 0), y, INK, 2);
    y += 15;
  };
  const gap = (h = 8) => {
    y += h;
  };
  for (const line of lines) row(line);
  row("NORTH UP - EAST LEFT, AS DRIVEN", null);
  gap();
  canvas.line(x, y, x + LEGEND_W - 24, y, INK);
  gap(6);
  row("ROAD", null);
  row("GRAVEL", ROAD.gravel);
  row("TARMAC", ROAD.asphalt);
  row("BRIDGE DECK", ROAD.deck);
  row("FORD - WATER ON THE ROAD", ROAD.ford);
  row("RUN-OUT PAST THE FINISH", mix(ROAD.gravel, PAPER, 0.5));
  row("BRANCH / PUBLIC ROAD", ROAD.spur);
  gap();
  row("CALLS - TN E/M/H L/R", null);
  row("EASY TURN", SEVERITY_COLOR.soft);
  row("MEDIUM TURN", SEVERITY_COLOR.medium);
  row("HARD TURN", SEVERITY_COLOR.hard);
  gap();
  row("MARKS", null);
  row("JN  JUMP LIP", MARK.jump);
  row("CRN BLIND CREST", MARK.crest);
  row("FN / BN  FORD / BRIDGE", MARK.ford);
  row("CPN SPLIT BOARD", MARK.checkpoint);
  row("START", MARK.start);
  row("FINISH", MARK.finish);
  row("JNN JUNCTION", MARK.junction);
  row("CORNER GUARD MOUND", mix(MARK.guardMound, PAPER, 0.25));
  row("CORNER GUARD GROVE", mix(MARK.guardGrove, PAPER, 0.25));
  gap();
  row(`SOLIDS WITHIN ${NEAR_EDGE} M OF EDGE`, null);
  row("TREE TRUNK", SOLID.tree);
  row("ROCK / BOULDER", SOLID.rock);
  row("LOG / STUMP / TIMBER", SOLID.wood);
  row("HN HOUSE, YARD, PARKED CAR / VN TOWN LOT", SOLID.building);
  gap();
  row("GROUND HEIGHT", null);
  {
    const w = LEGEND_W - 24;
    for (let i = 0; i < w; i++) {
      canvas.line(x + i, y, x + i, y + 10, hypso(i / w));
    }
    y += 13;
    canvas.text(`${lo.toFixed(0)} M`, x, y, INK, 2);
    const highText = `${hi.toFixed(0)} M`;
    canvas.text(highText, x + w - 8 * highText.length, y, INK, 2);
    y += 15;
    row(`CONTOURS EVERY ${interval} M`, null);
  }
  row("LAKE / STREAM", WATER);
}

/** The road's height against distance, with the marks on it. */
function drawProfile(canvas, { track, features, top, width, lo, range, focus }) {
  const { samples } = track;
  const left = 44;
  const right = width - 12;
  const plotTop = top + 22;
  const plotBottom = top + PROFILE_H - 40;
  const fromS = focus ? Math.max(0, focus.s - focus.span) : 0;
  const toS = focus ? Math.min(track.length, focus.s + focus.span) : track.length;
  const from = indexAtS(samples, fromS);
  const to = indexAtS(samples, toS);
  // The strip's own height axis is the road IN VIEW, so a close-up on a
  // jump shows the ramp rather than the stage's whole climb in one pixel.
  let eLo = Infinity;
  let eHi = -Infinity;
  for (let i = from; i <= to; i++) {
    eLo = Math.min(eLo, samples[i].elevation);
    eHi = Math.max(eHi, samples[i].elevation);
  }
  const eSpare = Math.max(1, (eHi - eLo) * 0.1);
  eLo -= eSpare;
  eHi += eSpare;
  const sx = (s) => left + ((s - fromS) / (toS - fromS)) * (right - left);
  const sy = (e) => plotBottom - ((e - eLo) / (eHi - eLo)) * (plotBottom - plotTop);
  canvas.line(left, plotBottom, right, plotBottom, INK);
  canvas.line(left, plotTop, left, plotBottom, INK);
  canvas.text(`${eHi.toFixed(0)}`, 4, plotTop - 4, INK, 2);
  canvas.text(`${eLo.toFixed(0)}`, 4, plotBottom - 5, INK, 2);
  canvas.text("M", 4, (plotTop + plotBottom) / 2 - 5, INK, 2);
  const finishS = track.finishS ?? Infinity;
  // Column by column: the tallest sample in the column, filled in the
  // ground ramp's colour so the strip and the map agree.
  let lastX = -1;
  for (let i = from; i <= to; i++) {
    const s = samples[i];
    const x = Math.round(sx(s.s));
    if (x === lastX) continue;
    lastX = x;
    const y = sy(s.elevation);
    let color = hypso((s.elevation - lo) / range);
    if (s.s > finishS) color = mix(color, PAPER, 0.5);
    canvas.line(x, y, x, plotBottom - 1, color);
    canvas.set(x, y, INK);
    // The surface, as a band under the axis.
    const surface =
      s.deck != null
        ? ROAD.deck
        : s.surface === "water"
          ? ROAD.ford
          : s.surface === "asphalt"
            ? ROAD.asphalt
            : ROAD.gravel;
    canvas.line(x, plotBottom + 2, x, plotBottom + 5, surface);
  }
  // The calls, as a second band, and the marks over the line.
  for (const f of features) {
    if (f.s < fromS || f.s > toS) continue;
    const x = sx(f.s);
    const e = samples[indexAtS(samples, f.s)].elevation;
    switch (f.kind) {
      case "turn": {
        const x1 = sx(Math.min(f.endS, toS));
        for (let px = Math.round(x); px <= x1; px++) {
          canvas.line(px, plotBottom + 7, px, plotBottom + 10, SEVERITY_COLOR[f.severity]);
        }
        if (focus || x1 - x > 18)
          label(canvas, (x + x1) / 2 - 4 * f.id.length, plotBottom + 13, f.id, INK, 2);
        break;
      }
      case "jump":
        canvas.poly(
          [
            [x, sy(e) - 3],
            [x - 5, sy(e) - 12],
            [x + 5, sy(e) - 12],
          ],
          MARK.jump,
        );
        label(canvas, x - 4 * f.id.length, sy(e) - 24, f.id, MARK.jump, 2);
        break;
      case "crest":
        canvas.disk(x, sy(e) - 6, 3, MARK.crest);
        label(canvas, x - 4 * f.id.length, sy(e) - 22, f.id, INK, 2);
        break;
      case "ford":
      case "bridge":
        for (let px = Math.round(x); px <= sx(Math.min(f.endS, toS)); px++)
          canvas.line(px, sy(e) - 3, px, sy(e), WATER);
        label(canvas, x - 4 * f.id.length, sy(e) - 18, f.id, INK, 2);
        break;
      case "culvert":
        // Under the road, so the water is drawn under the profile's line.
        for (let px = Math.round(x); px <= sx(Math.min(f.endS, toS)); px++)
          canvas.line(px, sy(e) + 1, px, sy(e) + 4, WATER);
        label(canvas, x - 4 * f.id.length, sy(e) - 18, f.id, INK, 2);
        break;
      case "checkpoint":
        canvas.line(x, plotTop, x, plotBottom, MARK.checkpoint);
        label(canvas, x + 3, plotTop, f.id, MARK.checkpoint, 2);
        break;
      case "finish":
        for (let y = plotTop; y < plotBottom; y += 4) canvas.line(x, y, x, y + 2, INK);
        label(canvas, x + 3, plotTop, "FIN", INK, 2);
        break;
      default:
        break;
    }
  }
  // Distance along the axis.
  const tick = focus ? 50 : 500;
  for (let s = Math.ceil(fromS / tick) * tick; s <= toS; s += tick) {
    const x = sx(s);
    canvas.line(x, plotBottom, x, plotBottom + 1, INK);
    const text = focus ? `${s}` : `${(s / 1000).toFixed(1)}`;
    canvas.text(text, x - 4 * text.length, plotBottom + 26, INK, 2);
  }
  canvas.text(focus ? "M" : "KM", right - 16, plotBottom + 26, INK, 2);
}
