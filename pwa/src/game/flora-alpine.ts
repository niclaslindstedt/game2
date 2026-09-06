// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The alpine's roster: the treeline's trees, the krummholz, the alp's
// flowers and the stone the walkers stacked, each a recipe over the
// builder's primitives (flora-build.ts) exactly as the taiga's are
// (flora-species.ts). WHICH of them a stage plants, and where, is the
// biome's (biome-alpine.ts) and the placement code's business; this module
// only knows how each is SHAPED. The mountain spruce forest below the
// treeline is the taiga's own spruces and firs — a Norway spruce is a
// Norway spruce — so this file starts where that wood opens out.
//
// The layers an alp reads as, tallest first: the last trees — stone pines,
// broad and black-green, and larches flagged by the wind — with the silver
// snags of the ones that died standing; the krummholz belt of mountain pine
// lying flat on the rock; a knee-high scrub of alpenrose; and the pasture,
// which in summer is short grass FULL of flowers. Seen at eighty miles an
// hour that last layer is a colour, not a plant, and the flower clumps are
// built to be a dot of blue or yellow on bright green and nothing else.

import * as THREE from "three";

import {
  ALPENROSE_BLOOM,
  ALPENROSE_LEAF,
  ALP_GRASS_BASE,
  ALP_GRASS_TIP,
  ARNICA,
  AROLLA,
  AROLLA_BARK,
  AROLLA_DARK,
  CAIRN_DARK,
  CAIRN_LICHEN,
  CAIRN_STONE,
  FLOWER_WHITE,
  GENTIAN,
  GeoBuilder,
  LARCH,
  MUGO,
  MUGO_STEM,
  SILVER_WOOD,
  SILVER_WOOD_DARK,
  TRUNK,
  TRUNK_DARK,
  limb,
  onTrunk,
  swung,
  type Point,
} from "./flora-build.ts";
import type { VariantDef } from "./flora-species.ts";

// ── Shared silhouettes ─────────────────────────────────────────────────────
// Every part hinges where it grows from: a limb is the builder's `limb`
// (turned about its own hinge, then placed), anything off a leaning trunk
// hangs off `onTrunk`, and a stem's far end is `swung` for the tuft that
// goes there — the same rule that keeps a bough on a spruce.

/** A dense tuft of stone-pine foliage: two blobs, the darker one low and
 * inboard, so a crown of them reads as a mass with shade in it rather
 * than a bunch of balloons. */
function arollaTuft(b: GeoBuilder, p: Point, r: number): void {
  b.blob(AROLLA_DARK, r * 0.85, p.x, p.y - r * 0.15, p.z, { sy: 0.7 });
  b.blob(AROLLA, r, p.x, p.y + r * 0.25, p.z, { sy: 0.75 });
}

/** A SWISS STONE PINE (arolla): a short thick bole and a broad, irregular,
 * dark crown that starts low and reaches nearly as wide as it is tall — the
 * silhouette of the treeline everywhere in the Alps, and the opposite of a
 * spruce's spire. `limbs` heavy boughs leave the trunk from a third of the
 * way up, each carrying a dense tuft; a column of tufts up the trunk itself
 * fills the crown in between them, and the top is a few heads rather than
 * one leader, because an old cembra grows a candelabra. `spread` is the
 * crown's radius. */
function arolla(b: GeoBuilder, h: number, spread: number, limbs: number, lean: number): void {
  const rBase = 0.24 + h * 0.022;
  b.cyl(AROLLA_BARK, rBase * 0.5, rBase, h * 0.8, 0, { tiltZ: lean }, 7);
  for (let i = 0; i < limbs; i++) {
    const at = h * (0.3 + (i / limbs) * 0.45 + b.random() * 0.05);
    const angle = (i / limbs) * Math.PI * 2 + b.random() * 0.9;
    // The lower boughs stand out nearly level; the upper ones climb.
    const tilt = 1.15 - (i / limbs) * 0.5 + b.random() * 0.2;
    const len = spread * (0.55 + b.random() * 0.35) * (1 - (i / limbs) * 0.3);
    const hinge = onTrunk(lean, at);
    const end = limb(b, AROLLA_BARK, rBase * 0.18, rBase * 0.38, len, hinge, tilt, angle, 5);
    arollaTuft(b, end, spread * (0.4 + b.random() * 0.12));
    // A second tuft halfway along the bough: the crown is a MASS, and a
    // bough with foliage only at its tip reads as a lollipop.
    arollaTuft(
      b,
      {
        x: (hinge.x + end.x) / 2,
        y: (hinge.y + end.y) / 2 + spread * 0.08,
        z: (hinge.z + end.z) / 2,
      },
      spread * 0.3,
    );
  }
  // The core: tufts hugging the trunk from the lowest bough up, wide enough
  // to meet the boughs' own, so the crown has no hole in the middle where
  // the trunk would show through.
  for (let k = 0; k < 5; k++) {
    const y = h * (0.4 + k * 0.12);
    const axis = onTrunk(lean, y);
    const r = spread * (0.58 - k * 0.06);
    b.blob(
      k < 2 ? AROLLA_DARK : AROLLA,
      r,
      axis.x + (b.random() - 0.5) * r * 0.5,
      y,
      (b.random() - 0.5) * r * 0.5,
      {
        sy: 0.75,
      },
    );
  }
  // The heads over the top of the bole.
  const top = onTrunk(lean, h * 0.8);
  arollaTuft(b, { x: top.x, y: h * 0.88, z: 0 }, spread * 0.36);
  arollaTuft(b, { x: top.x + spread * 0.35, y: h * 0.8, z: spread * 0.2 }, spread * 0.28);
  arollaTuft(b, { x: top.x - spread * 0.3, y: h * 0.82, z: -spread * 0.28 }, spread * 0.26);
}

/** A flag-form LARCH at the treeline: the wind off the ridge kills every
 * bud on the windward side, so the whole crown grows on the lee — the tree
 * is a trunk with a flag on it, and every one on a slope points the same
 * way. The trunk leans downwind too (positive `tiltZ` is toward −x, so the
 * boughs are all swung to π); the tiers get shorter toward the top. */
function flagLarch(b: GeoBuilder, h: number, lean: number): void {
  const rBase = 0.12 + h * 0.014;
  b.cyl(TRUNK, rBase * 0.35, rBase, h * 0.96, 0, { tiltZ: lean }, 6);
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const at = h * (0.28 + t * 0.62);
    const len = h * (0.26 - t * 0.12) * (0.85 + b.random() * 0.3);
    const angle = Math.PI + (b.random() - 0.5) * 0.9;
    const end = limb(
      b,
      TRUNK_DARK,
      rBase * 0.12,
      rBase * 0.3,
      len,
      onTrunk(lean, at),
      1.2 - t * 0.25,
      angle,
      4,
    );
    const r = len * 0.45;
    b.blob(LARCH, r, end.x, end.y + r * 0.2, end.z, { sy: 0.5 });
    // A second, smaller tuft halfway along, so the flag is a wedge of
    // foliage and not a row of lollipops.
    const mid = onTrunk(lean, at);
    b.blob(
      LARCH,
      r * 0.7,
      (mid.x + end.x) / 2,
      (mid.y + end.y) / 2 + r * 0.1,
      (mid.z + end.z) / 2,
      {
        sy: 0.5,
      },
    );
  }
  // The leader, bent over downwind.
  const top = onTrunk(lean, h * 0.96);
  b.cone(LARCH, rBase * 2.2, h * 0.1, top.y, { x: top.x, tiltZ: lean + 0.35 }, 5);
}

/** A ring of blades round one root — the alp's short grass, and the stems
 * the flowers stand in. `spread` is how far off the centre they root. */
function shortGrass(b: GeoBuilder, n: number, h: number, spread: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.blade(ALP_GRASS_BASE, ALP_GRASS_TIP, 0.07, h + (i % 3) * h * 0.3, {
      ry: a + i * 0.8,
      tiltZ: 0.35 + (i % 2) * 0.25,
      x: Math.cos(a) * spread,
      z: Math.sin(a) * spread,
    });
  }
}

/** A flower head on a thin stem: the stem so the dot of colour is standing
 * over the grass rather than lying in it. */
function flower(
  b: GeoBuilder,
  color: THREE.Color,
  x: number,
  z: number,
  h: number,
  r: number,
): void {
  b.cyl(ALP_GRASS_BASE, 0.008, 0.012, h, 0, { x, z }, 3);
  b.blob(color, r, x, h + r * 0.4, z);
}

// ── The variant roster ─────────────────────────────────────────────────────

export const ALPINE_VARIANTS: Record<string, VariantDef> = {
  // The stone pines — SOLID trunks the engine places. Authored at the
  // height a mature one stands on a treeline (twelve to eighteen metres;
  // the engine's per-trunk scale spreads a stand round that).
  arolla: { build: (b) => arolla(b, 14, 3.4, 5, 0.03) },
  /** The old one: broader than it is tall wants to be, the boughs heavier
   * and the top gone to several heads. Four or five hundred years old. */
  arollaOld: { build: (b) => arolla(b, 17, 4.6, 7, 0.05) },
  /** A young cembra: a dense dark egg on a stub of trunk, which is what a
   * stone pine is for its first fifty years. */
  arollaYoung: {
    build: (b) => {
      b.cyl(AROLLA_BARK, 0.09, 0.15, 2.2, 0, {}, 6);
      b.blob(AROLLA_DARK, 1.2, 0, 2.4, 0, { sy: 1.1 });
      b.blob(AROLLA, 1, 0.3, 3.6, 0.2, { sy: 1.2 });
      b.blob(AROLLA, 0.75, -0.25, 4.7, -0.2, { sy: 1.3 });
      b.blob(AROLLA, 0.4, 0, 5.6, 0, { sy: 1.4 });
    },
  },
  /** What an arolla leaves when it dies standing: the wood is so resinous
   * it stands for a century after, bleached silver, twisted, the boughs
   * broken back to thick stubs. Solid — it is a post of hardwood. */
  deadArolla: {
    build: (b) => {
      const LEAN = 0.07;
      const R = 0.5;
      b.cyl(SILVER_WOOD, R * 0.18, R, 9, 0, { tiltZ: LEAN }, 6);
      // The bark's last plates still clinging to the foot.
      b.cyl(AROLLA_BARK, R * 0.9, R * 1.04, 1.6, 0, { tiltZ: LEAN }, 6);
      const stubs: [at: number, len: number, tilt: number, angle: number][] = [
        [3.8, 2.2, 1.25, 0.5],
        [5.2, 1.6, 0.95, 2.6],
        [6.4, 1.9, 1.1, 4.3],
        [7.6, 1.1, 0.7, 1.7],
      ];
      for (const [at, len, tilt, angle] of stubs) {
        limb(b, SILVER_WOOD_DARK, R * 0.1, R * 0.28, len, onTrunk(LEAN, at), tilt, angle, 5);
      }
      // The top, splintered where the leader broke out.
      const top = onTrunk(LEAN, 8.9);
      b.cone(SILVER_WOOD_DARK, R * 0.16, 1.2, top.y, { x: top.x + R * 0.05, tiltZ: 0.2 }, 4);
      b.cone(SILVER_WOOD, R * 0.1, 0.8, top.y, { x: top.x - R * 0.1, tiltZ: -0.3 }, 4);
    },
  },
  /** The treeline larch, flagged downwind. Solid — the trunk is a trunk
   * however the crown grew. */
  larchAlpine: { build: (b) => flagLarch(b, 12, 0.12) },

  // The krummholz and the scrub — all of it SOFT: a mountain pine is two
  // metres of springy stems lying on the ground, and a rally car goes over
  // it, not into it.
  /** MOUNTAIN PINE (Pinus mugo): a prostrate mat — a dozen stems leaving
   * one root nearly flat and turning up at the ends, five metres across
   * and knee-to-chest high. The whole krummholz belt is this one plant. */
  mountainPine: {
    build: (b) => {
      const STEMS = 9;
      for (let i = 0; i < STEMS; i++) {
        const a = (i / STEMS) * Math.PI * 2 + b.random() * 0.4;
        const tilt = 1.05 + b.random() * 0.25;
        const len = 1.7 + b.random() * 0.7;
        b.cyl(MUGO_STEM, 0.05, 0.1, len, 0.1, { tiltZ: tilt, ry: a }, 4);
        const end = swung(Math.sin(tilt) * -len, 0.1 + Math.cos(tilt) * len, a);
        const r = 0.65 + b.random() * 0.25;
        // The tips turn up: the foliage sits ABOVE the stem's end.
        b.blob(MUGO, r, end.x, end.y + r * 0.45, end.z, { sy: 0.7 });
        const mid = swung(Math.sin(tilt) * -len * 0.55, 0.1 + Math.cos(tilt) * len * 0.55, a);
        b.blob(MUGO, r * 0.7, mid.x, mid.y + r * 0.3, mid.z, { sy: 0.6 });
      }
      // The centre, where the stems cross: the highest point of the mat.
      b.blob(MUGO, 0.9, 0, 1.2, 0, { sy: 0.75 });
      b.blob(AROLLA_DARK, 0.7, 0.3, 0.7, -0.3, { sy: 0.7 });
    },
  },
  /** ALPENROSE: a knee-high dome of dark evergreen leaves, and in early
   * summer a dome of pink-red flowers — whole hillsides of it, which is why
   * the bloom is a lot of small blobs over the top and not one. */
  alpenrose: {
    build: (b) => {
      b.blob(ALPENROSE_LEAF, 0.55, 0, 0.36, 0, { sy: 0.65 });
      b.blob(ALPENROSE_LEAF, 0.4, 0.45, 0.28, 0.25, { sy: 0.65 });
      b.blob(ALPENROSE_LEAF, 0.36, -0.4, 0.3, -0.28, { sy: 0.65 });
      const heads: [number, number, number][] = [
        [0.05, 0.68, 0.05],
        [0.35, 0.58, -0.15],
        [-0.3, 0.6, 0.2],
        [0.55, 0.5, 0.3],
        [-0.5, 0.52, -0.3],
        [0.1, 0.55, 0.45],
        [-0.15, 0.56, -0.45],
      ];
      for (const [x, y, z] of heads) b.blob(ALPENROSE_BLOOM, 0.11, x, y, z, { sy: 0.8 });
    },
  },
  /** A cairn: the stones walkers stack to mark a path over the scree,
   * waist-high. Soft — it is a heap, and a car going through it is a
   * heap spread wider. Every stone is turned and shoved a little off the
   * one under it, or it is a cone. */
  cairn: {
    build: (b) => {
      const courses = 7;
      let y = 0.05;
      for (let i = 0; i < courses; i++) {
        const t = i / (courses - 1);
        const r = 0.46 - t * 0.28;
        const thick = r * 0.55;
        const color = i % 3 === 1 ? CAIRN_DARK : i === 2 || i === 5 ? CAIRN_LICHEN : CAIRN_STONE;
        b.blob(color, r, (b.random() - 0.5) * 0.12, y + thick * 0.5, (b.random() - 0.5) * 0.12, {
          sy: 0.55,
          sx: 1.15,
          ry: i * 0.9 + b.random() * 0.5,
        });
        y += thick * 0.85;
      }
      b.blob(CAIRN_STONE, 0.12, 0, y + 0.08, 0, { sy: 1.3 });
    },
  },

  // The ground — the two-sided, wind-swayed set. The alp's grass is SHORT:
  // it is grazed, and a knee-high tussock here would read as a hay meadow
  // nobody cut.
  /** A short sparse tuft of pasture grass. */
  alpineGrass: {
    twoSided: true,
    build: (b) => shortGrass(b, 6, 0.28, 0.1),
  },
  /** A patch of gentians: short grass with the blue in it. */
  gentianPatch: {
    twoSided: true,
    build: (b) => {
      shortGrass(b, 7, 0.22, 0.16);
      const spots: [number, number][] = [
        [0.05, 0.08],
        [-0.18, -0.12],
        [0.2, -0.2],
        [-0.1, 0.24],
        [0.28, 0.14],
      ];
      for (const [x, z] of spots) flower(b, GENTIAN, x, z, 0.14 + Math.abs(x) * 0.3, 0.055);
    },
  },
  /** The mixed flowers of an alp in July — arnica's yellow and the white
   * of yarrow and daisies — standing a little over the grass. */
  alpineFlowers: {
    twoSided: true,
    build: (b) => {
      shortGrass(b, 7, 0.26, 0.18);
      const heads: [number, number, number, THREE.Color][] = [
        [0.1, 0.05, 0.36, ARNICA],
        [-0.22, 0.12, 0.3, FLOWER_WHITE],
        [0.18, -0.24, 0.33, FLOWER_WHITE],
        [-0.12, -0.2, 0.4, ARNICA],
        [0.3, 0.2, 0.28, FLOWER_WHITE],
        [-0.3, -0.02, 0.34, ARNICA],
      ];
      for (const [x, z, h, color] of heads) flower(b, color, x, z, h, 0.05);
    },
  },
};
