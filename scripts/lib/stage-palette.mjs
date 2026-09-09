// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE INK a stage preview is drawn in: the ground and road palettes each
// country is painted from, the tree and house colours, the route's own
// magenta, and the two helpers every one of them is mixed and shaded
// through. `stage-render.mjs` draws with them.

/** The taiga palette, as the picture paints it when nobody hands it a
 * country (`paletteFor` below builds one from the game's own biome table,
 * which is what the preview tools do — the preview is useless if it is not
 * the colours the game paints with). */
export const TAIGA_GROUND = {
  grass: [0x74, 0xb2, 0x3c],
  grassDark: [0x57, 0x8f, 0x2b],
  moss: [0x8a, 0xa8, 0x48],
  heath: [0x6f, 0x5f, 0x30],
  rock: [0x8d, 0x8f, 0x94],
  rockDark: [0x6f, 0x72, 0x78],
  shore: [0xc2, 0xa8, 0x78],
  water: [0x2f, 0x86, 0xe0],
  deepWater: [0x1c, 0x5a, 0xa0],
  /** The snow over a country's snowline — the game's own off-white
   * (terrain.ts), the one ground every country paints alike. */
  snow: [0xee, 0xf2, 0xf7],
};

/** R40 — where the ground goes to rock and where the rock goes under snow,
 * m: the taiga's zones, for a picture that is handed no engine to ask. */
export const TAIGA_ZONES = { treeline: 46, rock: { from: 26, to: 52 }, snow: null };

/** The road's own colors — the same split the renderer paints with: worn
 * down the wheel tracks, loose at the edges. */
export const ROAD = {
  gravel: { loose: [0xd2, 0xb4, 0x89], worn: [0x8a, 0x70, 0x46] },
  sand: { loose: [0xf2, 0xe2, 0xb4], worn: [0xd6, 0xbf, 0x8a] },
  /** R47 — packed snow over the road above the snowline: white, with the
   * wheel tracks worn to grey ice. */
  snow: { loose: [0xf1, 0xf3, 0xf6], worn: [0xc4, 0xcc, 0xd6] },
  /** R47 — a bored run: the road's colour is the lining's. */
  tunnel: { loose: [0x5c, 0x58, 0x54], worn: [0x48, 0x45, 0x42] },
  asphalt: { loose: [0x3a, 0x3b, 0x40], worn: [0x54, 0x55, 0x5c] },
  water: { loose: [0x8f, 0xa6, 0xc6], worn: [0x8f, 0xa6, 0xc6] },
  deck: { loose: [0xb7, 0xb3, 0xa8], worn: [0xa4, 0xa0, 0x96] },
  shoulder: [0x8a, 0x73, 0x4f],
  verge: [0x6f, 0x8f, 0x3e],
  marking: [0xe6, 0xe2, 0xd2],
  rumbleRed: [0xe2, 0x3c, 0x2c],
  rumbleWhite: [0xf6, 0xf3, 0xea],
  cone: [0xff, 0x7d, 0x1f],
  /** R41 — the railway's ballast, and the rails on it. */
  ballast: [0x7c, 0x6e, 0x60],
  rail: [0x3a, 0x36, 0x34],
};

/** R37 — the three paints a house comes in, as the map shows them. */
export const HOUSE_PAINT = {
  red: [0x8c, 0x2f, 0x24],
  yellow: [0xd8, 0xb2, 0x5a],
  white: [0xe9, 0xe4, 0xd6],
  grey: [0xa3, 0xa4, 0x9e],
  brick: [0xb6, 0x87, 0x5a],
  green: [0x4f, 0x6a, 0x4b],
};

/** The route overlay: the one thing this picture has to answer before any
 * other is WHICH road is the stage. Nothing in a landscape is this color. */
export const ROUTE = [0xff, 0x2f, 0x8e];

export const TAIGA_TREE = {
  crown: [0x2f, 0x5c, 0x2a],
  crownLight: [0x46, 0x77, 0x33],
  shadow: [0x33, 0x44, 0x28],
};

/** R40 — the desert's trunks are saguaros, Joshua trees and mesquite:
 * grey-green over sand, with a warm shadow. */
export const DESERT_TREE = {
  crown: [0x5f, 0x8a, 0x4a],
  crownLight: [0x8f, 0xb8, 0x6a],
  shadow: [0x8a, 0x70, 0x4a],
};

/** The picture's palette for a country, from the game's own ground table
 * (`Biome.ground` in pwa/src/game/biome.ts) — so a preview of a desert
 * stage is sand, and a change to the game's paint reaches the preview
 * without a copy of it here going stale. */
export function paletteFor(ground, biome) {
  const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  return {
    ground: {
      grass: rgb(ground.base),
      grassDark: rgb(ground.baseDark),
      moss: rgb(ground.damp),
      heath: rgb(ground.scrub),
      rock: rgb(ground.bedrock),
      rockDark: rgb(ground.bedrockDark),
      shore: rgb(ground.shore),
      water: TAIGA_GROUND.water,
      deepWater: TAIGA_GROUND.deepWater,
      snow: TAIGA_GROUND.snow,
    },
    tree: biome === "desert" ? DESERT_TREE : TAIGA_TREE,
  };
}

export function mix(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

export function shade(color, light) {
  return [
    Math.max(0, Math.min(255, Math.round(color[0] * light))),
    Math.max(0, Math.min(255, Math.round(color[1] * light))),
    Math.max(0, Math.min(255, Math.round(color[2] * light))),
  ];
}
