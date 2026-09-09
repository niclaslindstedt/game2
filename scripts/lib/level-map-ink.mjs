// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE INK a level map is drawn in: the paper and the ink, the hypsometric
// ramp the ground is tinted up, the road's own weights, the mark colours
// every feature is flagged with, and the small helpers — the mix, the
// contour interval, the bitmap label — every part of the drawing goes
// through. `level-map-render.mjs` draws with them, and so do the legend
// and the profile beside it.

export const TITLE_H = 40;
export const LEGEND_W = 330;
export const PROFILE_H = 150;

export const PAPER = [246, 244, 238];
export const INK = [24, 24, 28];
export const WHITE = [255, 255, 255];
export const WATER = [78, 140, 214];

/** Ground tint by height, low to high: valley green through moor tan to
 * bare summit. The same ramp colours the profile strip's fill so a height
 * on the map and a height under it are the same colour. */
export const HYPSO = [
  [0.0, [88, 140, 96]],
  [0.3, [150, 182, 104]],
  [0.55, [204, 188, 122]],
  [0.8, [176, 138, 92]],
  [1.0, [226, 214, 196]],
];

export const ROAD = {
  gravel: [208, 178, 124],
  asphalt: [58, 58, 64],
  /** R47 — packed snow above the snowline, and the lining of a bore. */
  snow: [238, 241, 246],
  tunnel: [80, 76, 72],
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

/** R45 — the grid's own two numbers, in metres: how far either side of the
 * line the wayleave is cut, and how long a tower's crossarm is.
 *
 * RESTATED rather than imported, because this module is loaded statically
 * by `level-map.mjs` — before that file registers the `@engine` alias, so
 * a static import of the engine here would resolve against nothing. They
 * are EXPORTED so the restatement is testable: `tests/powerline_test.ts`
 * holds both against `STAGE_RULES.powerline`, which is what makes a map
 * drawing a corridor the forest is not actually kept off a failure rather
 * than a thing somebody notices in a picture a year later. */
export const WAYLEAVE = 24;
export const ARM = 20;

export const MARK = {
  jump: [232, 28, 28],
  crest: [250, 200, 40],
  /** R47 — a bore's two portals. */
  tunnel: [40, 36, 34],
  checkpoint: [24, 66, 160],
  start: [30, 168, 72],
  finish: INK,
  junction: [150, 70, 200],
  crossing: [150, 70, 200],
  railcrossing: [60, 40, 30],
  homestead: [178, 52, 40],
  carpark: [40, 80, 170],
  windfarm: [70, 74, 80],
  powerline: [116, 78, 152],
  solarfarm: [28, 45, 79],
  ford: WATER,
  bridge: [110, 110, 120],
  guardMound: [150, 108, 60],
  guardGrove: [60, 120, 60],
};

export const SOLID = {
  tree: [24, 92, 40],
  rock: [104, 104, 112],
  wood: [132, 84, 40],
  parapet: [200, 200, 206],
  building: [178, 52, 40],
  train: [60, 40, 30],
};

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function hypso(t) {
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
export function contourInterval(range) {
  const raw = range / 8;
  for (const step of [1, 2, 5, 10, 20, 50]) if (raw <= step) return step;
  return 100;
}

/** Text with a paper halo, so a label survives whatever it lands on.
 * Returns the width drawn. */
export function label(canvas, x, y, str, color = INK, scale = 2) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx || dy) canvas.text(str, x + dx, y + dy, PAPER, scale);
    }
  }
  return canvas.text(str, x, y, color, scale);
}
