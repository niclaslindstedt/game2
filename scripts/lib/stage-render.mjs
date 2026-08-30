// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Renders a generated stage as a picture of the PLACE rather than a
// diagram of it: the landscape shaded by its own slope, the lakes and the
// streams, the forest, and the road drawn across its full width — the worn
// wheel tracks, the shoulder, the tarmac sections with their
// markings, the bridges, and the branches the route abandons at its
// junctions. Everything is read from the same engine field the game builds
// its world from, so what shows up here is what the player will drive
// through — which is the whole point of looking at it.
//
// The frame fits the ROAD, then whatever nature fills the rest of the
// picture comes along: a short stage is close in, a seven-minute one is
// high above the country it crosses.

import { createCanvas } from "./png.mjs";

/** The taiga palette, mirroring pwa/src/game/biome.ts — the preview is
 * useless if it is not the colors the game paints with. */
const GROUND = {
  grass: [0x74, 0xb2, 0x3c],
  grassDark: [0x57, 0x8f, 0x2b],
  moss: [0x8a, 0xa8, 0x48],
  heath: [0x7d, 0x74, 0x34],
  rock: [0x8d, 0x8f, 0x94],
  rockDark: [0x6f, 0x72, 0x78],
  shore: [0xc2, 0xa8, 0x78],
  water: [0x2f, 0x86, 0xe0],
  deepWater: [0x1c, 0x5a, 0xa0],
};

/** The road's own colors — the same split the renderer paints with: worn
 * down the wheel tracks, loose at the edges. */
const ROAD = {
  gravel: { loose: [0xd2, 0xb4, 0x89], worn: [0x8a, 0x70, 0x46] },
  asphalt: { loose: [0x3a, 0x3b, 0x40], worn: [0x54, 0x55, 0x5c] },
  water: { loose: [0x8f, 0xa6, 0xc6], worn: [0x8f, 0xa6, 0xc6] },
  deck: { loose: [0xb7, 0xb3, 0xa8], worn: [0xa4, 0xa0, 0x96] },
  shoulder: [0x8a, 0x73, 0x4f],
  verge: [0x6f, 0x8f, 0x3e],
  marking: [0xe6, 0xe2, 0xd2],
  rumbleRed: [0xe2, 0x3c, 0x2c],
  rumbleWhite: [0xf6, 0xf3, 0xea],
  cone: [0xff, 0x7d, 0x1f],
};

/** The route overlay: the one thing this picture has to answer before any
 * other is WHICH road is the stage. Nothing in a landscape is this color. */
const ROUTE = [0xff, 0x2f, 0x8e];

const TREE = {
  crown: [0x2f, 0x5c, 0x2a],
  crownLight: [0x46, 0x77, 0x33],
  shadow: [0x33, 0x44, 0x28],
};

function mix(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

function shade(color, light) {
  return [
    Math.max(0, Math.min(255, Math.round(color[0] * light))),
    Math.max(0, Math.min(255, Math.round(color[1] * light))),
    Math.max(0, Math.min(255, Math.round(color[2] * light))),
  ];
}

/**
 * Render one stage.
 *
 * @param {object} opts
 * @param {object} opts.track    compiled track
 * @param {object} opts.terrain  its terrain field (already synced)
 * @param {object} opts.engine   the engine module (constants + helpers)
 * @param {number} opts.width    image width, px
 * @param {number} opts.height   image height, px
 */
export function renderStage({ track, terrain, engine, width = 1280, height = 800 }) {
  const {
    LAKE_Y,
    ROAD_CROSS,
    corridorOffset,
    wearAt,
    junctionDust,
    junctionFlat,
    junctionMainEdge,
  } = engine;
  const canvas = createCanvas(width, height, GROUND.grass);

  // ── Frame: the road, then as much country as the picture has room for ──
  const b = track.bounds;
  // Country around the road, m. A SHARE of what is being framed rather than
  // a fixed sixty: at a whole stage's scale sixty metres is a margin, and
  // at a junction's it is three times the thing being looked at — so every
  // close-up came out at the same hundred and sixty metres across whatever
  // `--span` asked for, which is how a mouth can look fine in the picture
  // meant to show it and wrong to anybody who zooms in.
  const pad = Math.max(6, 0.08 * Math.max(b.maxX - b.minX, b.maxZ - b.minZ));
  const spanX = b.maxX - b.minX + pad * 2;
  const spanZ = b.maxZ - b.minZ + pad * 2;
  const scale = Math.min(width / spanX, height / spanZ);
  const midX = (b.minX + b.maxX) / 2;
  const midZ = (b.minZ + b.maxZ) / 2;
  const px = (x) => width / 2 + (x - midX) * scale;
  // Screen y grows downward; world z grows "north" — flip so north is up.
  const pz = (z) => height / 2 - (z - midZ) * scale;
  const worldX = (sx) => midX + (sx - width / 2) / scale;
  const worldZ = (sy) => midZ - (sy - height / 2) / scale;

  // ── The land ───────────────────────────────────────────────────────────
  // Heights on a lattice every other pixel, then bilinear per pixel: the
  // field costs microseconds a call and the picture is a million pixels.
  const LAT = 2;
  const cols = Math.ceil(width / LAT) + 2;
  const rows = Math.ceil(height / LAT) + 2;
  const H = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      H[j * cols + i] = terrain.heightAt(worldX(i * LAT), worldZ(j * LAT));
    }
  }
  const heightAtPixel = (sx, sy) => {
    const gx = sx / LAT;
    const gy = sy / LAT;
    const i = Math.min(cols - 2, Math.floor(gx));
    const j = Math.min(rows - 2, Math.floor(gy));
    const fx = gx - i;
    const fy = gy - j;
    const h00 = H[j * cols + i];
    const h10 = H[j * cols + i + 1];
    const h01 = H[(j + 1) * cols + i];
    const h11 = H[(j + 1) * cols + i + 1];
    return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
  };

  // The sun comes over the viewer's left shoulder, which is the convention
  // every relief map on earth uses because the eye reads it as raised.
  const metersPerPixel = 1 / scale;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h = heightAtPixel(x, y);
      const dx = (heightAtPixel(Math.min(width - 1, x + 1), y) - h) / metersPerPixel;
      const dy = (heightAtPixel(x, Math.min(height - 1, y + 1)) - h) / metersPerPixel;
      let color;
      if (h < LAKE_Y) {
        // Under the water table: the deeper it goes the darker it reads.
        color = mix(GROUND.water, GROUND.deepWater, Math.min(1, (LAKE_Y - h) / 12));
        canvas.set(x, y, color);
        continue;
      }
      const slope = Math.hypot(dx, dy);
      color = mix(GROUND.grass, GROUND.grassDark, Math.min(1, h / 40));
      if (h < LAKE_Y + 3) color = mix(color, GROUND.shore, 0.7);
      else if (h > 26) color = mix(color, GROUND.rock, Math.min(1, (h - 26) / 30));
      if (slope > 0.35) color = mix(color, GROUND.rockDark, Math.min(0.85, (slope - 0.35) / 0.9));
      else if (slope > 0.12) color = mix(color, GROUND.moss, (slope - 0.12) * 1.2);
      // Hillshade: the lambert term against a sun low in the north-west.
      const light = 0.72 + 0.55 * (-dx * 0.55 - dy * 0.55 + 0.45) * (1 / Math.hypot(dx, dy, 1));
      canvas.set(x, y, shade(color, Math.max(0.35, Math.min(1.45, light))));
    }
  }

  // ── Streams: the water that runs into the road ─────────────────────────
  for (const stream of terrain.streams) {
    for (let i = 0; i < stream.points.length - 1; i++) {
      const a = stream.points[i];
      const c = stream.points[i + 1];
      let nx = c.z - a.z;
      let nz = -(c.x - a.x);
      const len = Math.hypot(nx, nz) || 1;
      nx /= len;
      nz /= len;
      const w = a.w;
      canvas.poly(
        [
          [px(a.x + nx * w), pz(a.z + nz * w)],
          [px(c.x + nx * w), pz(c.z + nz * w)],
          [px(c.x - nx * w), pz(c.z - nz * w)],
          [px(a.x - nx * w), pz(a.z - nz * w)],
        ],
        stream.bridged ? GROUND.deepWater : GROUND.water,
      );
    }
  }

  // ── The roads ──────────────────────────────────────────────────────────
  /** Lateral stations across a road, in meters from its centerline: the
   * mat sampled finely enough for the wheel tracks to show, then the
   * shoulder and the grassed slope past it (R16 — no ditch). */
  const stationsOf = (roadWidth) => {
    const half = roadWidth / 2;
    const mat = [0, 0.2, 0.34, 0.44, 0.54, 0.7, 0.86, 1].map((t) => t * half);
    const out = [
      ROAD_CROSS.chamfer,
      ROAD_CROSS.verge.bareTo,
      (ROAD_CROSS.verge.bareTo + ROAD_CROSS.reach) / 2,
      ROAD_CROSS.reach,
    ].map((d) => half + d);
    return [
      ...out.map((d) => -d).reverse(),
      ...mat.map((v) => -v).reverse(),
      ...mat.slice(1),
      ...out,
    ];
  };

  /** R17 — how far past the MAIN road's edge a point lies at the nearest
   * junction, m; null where none reaches it. The tarmac stops at that
   * line, and the gravel road that meets it starts there. */
  const pastMainEdge = (x, z) => {
    let best = null;
    for (const j of track.junctions) {
      const out = junctionMainEdge(j, x, z);
      if (out === null) continue;
      if (best === null || out < best) best = out;
    }
    return best;
  };
  /** R17 — CUT a polygon at the main road's edge, keeping the part OUTSIDE
   * the sealed mat; null where nothing of it is left. The dirt road stops
   * at that line, and a cut made by dropping whole bands is quantised to
   * the band's own size — a metre across, two along — which is a staircase
   * where a junction wants an edge. Clipping puts the boundary exactly on
   * the line.
   *
   * The edge is `|across| = width / 2` in the junction's own frame, so each
   * side of the main road is one half-plane and Sutherland-Hodgman does it
   * in four points. Only junctions the polygon actually reaches along the
   * road are asked, which is what makes this cheap enough per band. */
  const cutAtMain = (world) => {
    let poly = world;
    for (const j of track.junctions) {
      const sin = Math.sin(j.heading);
      const cos = Math.cos(j.heading);
      const half = j.width / 2;
      let side = 0;
      let reaches = false;
      for (const [x, z] of poly) {
        const dx = x - j.x;
        const dz = z - j.z;
        if (Math.abs(dx * sin + dz * cos) > j.reach) continue;
        reaches = true;
        const across = dx * cos - dz * sin;
        if (Math.abs(across) < half) side += across >= 0 ? 1 : -1;
      }
      if (!reaches || side === 0) continue;
      const keep = side >= 0 ? 1 : -1;
      // Inside the kept half-plane means out past the main road's edge, on
      // this polygon's own side of it.
      const depth = ([x, z]) => keep * ((x - j.x) * cos - (z - j.z) * sin) - half;
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const dp = depth(p);
        const dq = depth(q);
        if (dp >= 0) out.push(p);
        if (dp >= 0 !== dq >= 0) {
          const t = dp / (dp - dq);
          out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      }
      if (out.length < 3) return null;
      poly = out;
    }
    return poly;
  };

  /** How much gravel the tarmac wears at the mouth — the
   * smear every car turning out of the dirt road drops on the seal, which
   * goes the OTHER way and is the only thing that crosses the edge. */
  const DRAG_ON = 0.42;

  /** R17 — inside a junction neither road wears a border: the shoulder and
   * the edge lines are cut away, and a minor road has none at all where it
   * stands on the mat of the road it meets. */
  const inJunction = (x, z) => {
    if (track.junctions.some((j) => junctionFlat(j, x, z) > 0.25)) return true;
    const past = pastMainEdge(x, z);
    return past !== null && past < 1.5;
  };

  const bandColor = (sample, lat, roadWidth, x, z) => {
    const half = roadWidth / 2;
    const out = Math.abs(lat) - half;
    const bridge = sample.deck != null;
    const kind = bridge
      ? "deck"
      : sample.surface === "water"
        ? "water"
        : sample.surface === "asphalt"
          ? "asphalt"
          : "gravel";
    if (out <= 0) {
      // Inside a junction the wear flattens: two roads' wheel tracks
      // crossing is the tell that two ribbons were laid over one another.
      const flat = sample.flat ?? 0;
      const wear = wearAt(lat, roadWidth) * (1 - flat) + 0.55 * flat;
      const own = mix(ROAD[kind].loose, ROAD[kind].worn, wear);
      if (kind === "asphalt") {
        // The gravel every car drags onto the seal as it turns out.
        const dust = Math.max(0, ...track.junctions.map((j) => junctionDust(j, x, z)));
        if (dust <= 0) return own;
        return mix(own, mix(ROAD.gravel.loose, ROAD.gravel.worn, 0.5), dust * DRAG_ON);
      }
      if (kind !== "gravel") return own;
      // R17 — the dirt road STOPS at the main road's edge, cut at that
      // angle, and nothing of it carries on past. Not its surfacing, not
      // its verge, not its marking: past that line the ground is the road
      // that runs through, and the through road draws it. Anything of the
      // minor road drawn out there is the two roads MERGING, which is the
      // one thing a junction must not look like.
      const past = pastMainEdge(x, z);
      if (past !== null && past < 0) return null;
      return own;
    }
    if (bridge) return null; // nothing beside a deck but the drop
    // R17 — a minor road has NO BORDER where it crosses the road it meets.
    // Its shoulder and its verge stop dead at the main road's edge, because
    // past that line the ground belongs to the road running through: a band
    // of grass drawn there is a lawn on the carriageway, which is what the
    // mouth's outer corner had.
    const pastEdge = pastMainEdge(x, z);
    if (pastEdge !== null && pastEdge < 0) return null;
    if (inJunction(sample.x, sample.z)) return null; // the junction is all road
    if (out < ROAD_CROSS.verge.bareTo) return ROAD.shoulder;
    return mix(
      ROAD.shoulder,
      ROAD.verge,
      Math.min(1, (out - ROAD_CROSS.verge.bareTo) / (ROAD_CROSS.reach - ROAD_CROSS.verge.bareTo)),
    );
  };

  const drawRoad = (samples, roadWidth) => {
    const lat = stationsOf(roadWidth);
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const c = samples[i];
      const ar = { x: Math.cos(a.heading), z: -Math.sin(a.heading) };
      const cr = { x: Math.cos(c.heading), z: -Math.sin(c.heading) };
      // The station list is built once at the nominal width and SCALED by
      // the road's own width HERE, exactly as the game's ribbon does — a
      // picture drawn at the nominal width cannot show a mouth flaring
      // (R17) or the gravel road wandering wider (R33), which are two of
      // the things this picture exists to judge.
      const wideC = (c.width ?? roadWidth) / roadWidth;
      const wideA = (a.width ?? roadWidth) / roadWidth;
      // R17 — where the MAT's centre is, which a junction's mouth moves off
      // the centerline: the mouth opens on one side only.
      const shiftC = c.shift ?? 0;
      const shiftA = a.shift ?? 0;
      for (let k = 0; k < lat.length - 1; k++) {
        const l0 = lat[k];
        const l1 = lat[k + 1];
        const lm = ((l0 + l1) / 2) * wideC + shiftC;
        const color = bandColor(c, lm, c.width ?? roadWidth, c.x + cr.x * lm, c.z + cr.z * lm);
        if (!color) continue;
        // Shade the band by its own cross-fall, so the crown, the ruts and
        // the corner's bank are visible as SHAPE and not only as color.
        const fall =
          corridorOffset(c, l1 + shiftC, roadWidth) - corridorOffset(c, l0 + shiftC, roadWidth);
        const light = 1 + Math.max(-0.28, Math.min(0.28, fall * 1.6));
        const a0 = l0 * wideA + shiftA;
        const a1 = l1 * wideA + shiftA;
        const c0 = l0 * wideC + shiftC;
        const c1 = l1 * wideC + shiftC;
        const quad = [
          [a.x + ar.x * a0, a.z + ar.z * a0],
          [c.x + cr.x * c0, c.z + cr.z * c0],
          [c.x + cr.x * c1, c.z + cr.z * c1],
          [a.x + ar.x * a1, a.z + ar.z * a1],
        ];
        // R17 — the dirt road is CUT at the sealed road's edge, on the line
        // itself rather than at whichever band happened to straddle it.
        const cut = c.surface === "gravel" ? cutAtMain(quad) : quad;
        if (!cut) continue;
        canvas.poly(
          cut.map(([x, z]) => [px(x), pz(z)]),
          shade(color, light),
        );
      }
    }
  };

  /** The paint: rally red-and-white on gravel, edge lines and a broken
   * centre on tarmac. Below about a meter per pixel none of it resolves,
   * so it is only drawn when it would actually read. */
  /** R17 — is this piece of road the MINOR one at a crossing? The paint
   * belongs to the road that runs THROUGH, and at a junction the route is
   * only that road on one side of the meeting point: joining, it is the
   * tarmac from the meeting point on; leaving, up to it. On the other side
   * it is the dirt road turning off, whose mat is still sealed for the
   * width of the crossing and carries no line at all — painted from there,
   * the tarmac's edge line runs round the outside of the gravel road's
   * mouth, which is a white line where there is no road edge. */
  const onMinorSide = (j, sample) => (j.joining ? sample.s < j.s : sample.s > j.s);
  const minorAt = (sample) =>
    track.junctions.some((j) => junctionFlat(j, sample.x, sample.z) > 0 && onMinorSide(j, sample));

  /** How far past the minor road's own mat the break in the through road's
   * edge line still reaches, m. The opening is the mat plus the ground
   * either side of it that a car turning in crosses; a break cut to the mat
   * exactly leaves a stub of line inside the mouth at each corner. */
  const MOUTH_PAD = 2.5;

  /** The MINOR road's own mat at each junction: its samples, near enough to
   * the crossing to be the mouth. */
  const mouthMats = track.junctions.map((j) =>
    track.samples.filter((s) => Math.abs(s.s - j.s) < j.reach * 2 && onMinorSide(j, s)),
  );

  /** R17 — is this point in the MOUTH the minor road opens in the through
   * road's edge? A side road's opening interrupts the edge line it crosses,
   * and nothing else does: the break is as long as the opening and no
   * longer, and it is on the side the opening is on.
   *
   * Asked of the minor road's own MAT rather than of the platform and a
   * side. The platform is tens of metres longer than the opening, so a
   * break measured against it takes the line away for half a junction —
   * and which side is "the mouth's" is a question the geometry answers
   * badly and the mat answers exactly. */
  const inMouth = (x, z) =>
    mouthMats.some((mat) =>
      mat.some(
        (s) =>
          Math.hypot(s.x - x, s.z - z) <
          Math.abs(s.shift ?? 0) + (s.width ?? track.width) / 2 + MOUTH_PAD,
      ),
    );

  const drawMarkings = (samples, roadWidth, branch = false) => {
    if (scale < 0.55) return;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const c = samples[i];
      const half = (c.width ?? roadWidth) / 2;
      if (c.surface === "water" || c.deck != null) continue;
      const ar = { x: Math.cos(a.heading), z: -Math.sin(a.heading) };
      const cr = { x: Math.cos(c.heading), z: -Math.sin(c.heading) };
      const band = (l0, l1, color, cut = false) => {
        const quad = [
          [a.x + ar.x * l0, a.z + ar.z * l0],
          [c.x + cr.x * l0, c.z + cr.z * l0],
          [c.x + cr.x * l1, c.z + cr.z * l1],
          [a.x + ar.x * l1, a.z + ar.z * l1],
        ];
        // The rally's own marking is the dirt road's, so it is cut where
        // the dirt road is: on the sealed road's edge, at that angle.
        const poly = cut ? cutAtMain(quad) : quad;
        if (poly)
          canvas.poly(
            poly.map(([x, z]) => [px(x), pz(z)]),
            color,
          );
      };
      if (c.surface === "asphalt") {
        if (!branch && minorAt(c)) continue;
        for (const side of [-1, 1]) {
          const lat = (half - 0.475) * side;
          // The edge line stops for the side road's MOUTH, on that side
          // only: a driver turning in crosses the through road's edge, and
          // a line ruled across the opening is a kerb that is not there.
          if (inMouth(c.x + cr.x * lat, c.z + cr.z * lat)) continue;
          band((half - 0.65) * side, (half - 0.3) * side, ROAD.marking);
        }
        if (c.s % 9 < 3) band(-0.2, 0.2, ROAD.marking);
      } else {
        const stripe = Math.floor(c.s / 4) % 2 === 0 ? ROAD.rumbleRed : ROAD.rumbleWhite;
        // R17 — the rally's own marking stops at the seal with the road it
        // belongs to: a striped edge running on across the tarmac is the
        // stage marking somebody else's carriageway. Cut on the line, so it
        // ends where the road does rather than a marker short of it.
        for (const side of [-1, 1]) band((half - 0.9) * side, half * side, stripe, true);
      }
    }
  };

  // Every road's MAT first and every road's PAINT after, because at a
  // junction the two carriageways overlap: painting each road as it is laid
  // puts the route's mat over the branch's lines, and the through road's
  // paint then stops dead at the crossing it is supposed to run past.
  for (const spur of track.spurs) drawRoad(spur.samples, spur.width);
  drawRoad(track.samples, track.width);
  // A branch IS the main road continued past the crossing, so its paint
  // runs the whole way to the meeting point.
  for (const spur of track.spurs) drawMarkings(spur.samples, spur.width, true);
  drawMarkings(track.samples, track.width);
  // The tape and cones across every abandoned branch: the stage does not
  // go this way. Drawn LAST, because a closure the road is painted over is
  // no closure at all — and set past the junction's own platform, where a
  // marshal would actually stand it rather than in the middle of the
  // crossing. Deliberately over-scale: at a whole stage's zoom a real
  // traffic cone is a fifth of a pixel, and what this picture has to
  // answer is "which way does the route go", not "how big is a cone".
  for (const spur of track.spurs) {
    const at =
      spur.samples.find((sample) => sample.flat <= 0) ?? spur.samples[spur.samples.length - 1];
    const r = { x: Math.cos(at.heading), z: -Math.sin(at.heading) };
    const arm = spur.width / 2 + 1;
    canvas.poly(
      [
        [px(at.x + r.x * arm), pz(at.z + r.z * arm)],
        [px(at.x - r.x * arm), pz(at.z - r.z * arm)],
        [
          px(at.x - r.x * arm + Math.sin(at.heading) * 2),
          pz(at.z - r.z * arm + Math.cos(at.heading) * 2),
        ],
        [
          px(at.x + r.x * arm + Math.sin(at.heading) * 2),
          pz(at.z + r.z * arm + Math.cos(at.heading) * 2),
        ],
      ],
      ROAD.rumbleRed,
    );
    for (let k = -2; k <= 2; k++) {
      const l = (k / 2.4) * (spur.width / 2);
      canvas.disk(px(at.x + r.x * l), pz(at.z + r.z * l), Math.max(2, scale * 1.4), ROAD.cone);
    }
  }

  // ── The forest, and the boulders in it ─────────────────────────────────
  const treeR = Math.max(1, scale * 3.2);
  const seen = new Set();
  const cell = 120;
  for (let x = b.minX - 200; x < b.maxX + 200; x += cell) {
    for (let z = b.minZ - 200; z < b.maxZ + 200; z += cell) {
      for (const tree of terrain.treesNear(x + cell / 2, z + cell / 2, cell * 0.75)) {
        const key = `${tree.x.toFixed(1)},${tree.z.toFixed(1)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const sx = px(tree.x);
        const sy = pz(tree.z);
        if (sx < -8 || sy < -8 || sx > width + 8 || sy > height + 8) continue;
        canvas.disk(sx + treeR * 0.5, sy + treeR * 0.5, treeR * tree.size, TREE.shadow);
        canvas.disk(
          sx,
          sy,
          treeR * tree.size,
          tree.roll !== undefined && tree.roll > 0.5 ? TREE.crownLight : TREE.crown,
        );
      }
      for (const ob of terrain.obstaclesNear(x + cell / 2, z + cell / 2, cell * 0.75)) {
        const key = `b${ob.x.toFixed(1)},${ob.z.toFixed(1)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        canvas.disk(px(ob.x), pz(ob.z), Math.max(1, scale * ob.radius), GROUND.rock);
      }
    }
  }

  // ── The route ──────────────────────────────────────────────────────────
  // The stage and the branches it abandons are the same kind of road, and
  // at a whole stage's zoom they look it. So the racing line is called out
  // directly: a stripe down the middle of the road the run actually takes,
  // with arrowheads to say which way round it goes.
  {
    const lineHalf = Math.max(0.6, 1.2 / scale);
    const samples = track.samples;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const c = samples[i];
      const ar = { x: Math.cos(a.heading), z: -Math.sin(a.heading) };
      const cr = { x: Math.cos(c.heading), z: -Math.sin(c.heading) };
      canvas.poly(
        [
          [px(a.x + ar.x * lineHalf), pz(a.z + ar.z * lineHalf)],
          [px(c.x + cr.x * lineHalf), pz(c.z + cr.z * lineHalf)],
          [px(c.x - cr.x * lineHalf), pz(c.z - cr.z * lineHalf)],
          [px(a.x - ar.x * lineHalf), pz(a.z - ar.z * lineHalf)],
        ],
        ROUTE,
      );
    }
    const every = Math.max(40, Math.round(70 / scale));
    const arm = Math.max(3, 6 / scale);
    for (let i = every; i < samples.length; i += every) {
      const s = samples[i];
      const f = { x: Math.sin(s.heading), z: Math.cos(s.heading) };
      const r = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
      canvas.poly(
        [
          [px(s.x + f.x * arm), pz(s.z + f.z * arm)],
          [
            px(s.x - f.x * arm * 0.5 + r.x * arm * 0.8),
            pz(s.z - f.z * arm * 0.5 + r.z * arm * 0.8),
          ],
          [
            px(s.x - f.x * arm * 0.5 - r.x * arm * 0.8),
            pz(s.z - f.z * arm * 0.5 - r.z * arm * 0.8),
          ],
        ],
        ROUTE,
      );
    }
  }

  // ── Where it starts and where it ends ──────────────────────────────────
  const first = track.samples[0];
  const last = track.samples[track.samples.length - 1];
  const markR = Math.max(3, (track.width / 2) * scale + 3);
  canvas.disk(px(first.x), pz(first.z), markR, [0x28, 0xa8, 0x4c]);
  canvas.disk(px(last.x), pz(last.z), markR, [0x1e, 0x1e, 0x22]);
  return canvas;
}
