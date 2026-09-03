// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The desert's roster: every cactus, tree, shrub, tuft and bone the scenery
// can plant in that country, each a recipe over the builder's primitives
// (flora-build.ts) exactly as the taiga's are (flora-species.ts). WHICH of
// them a stage plants, and where, is the biome's (biome-desert.ts) and the
// placement code's business; this module only knows how each is SHAPED.
//
// The layers a desert reads as, tallest first: the columnar cacti and the
// Joshua trees, which are the only things that break the horizon; the low
// trees of the washes; the spiky middle storey — ocotillo, cholla, agave,
// yucca; the knee-high scrub that is most of the country; and the tufts,
// crusts and bones on the ground. Everything is seen at eighty miles an
// hour, and what survives that is the SILHOUETTE: a saguaro is two arms
// and a column, a Joshua tree is a fist of rosettes, an ocotillo is a
// spray of whips, and each of them is built to be nothing else.

import * as THREE from "three";

import {
  AGAVE,
  AGAVE_TIP,
  BARREL,
  BARREL_SPINE,
  BONE,
  BRITTLEBUSH,
  BUNCH_BASE,
  BUNCH_TIP,
  CHOLLA,
  CHOLLA_DARK,
  CREOSOTE,
  CREOSOTE_STEM,
  DEAD_BRUSH,
  GeoBuilder,
  limb,
  onTrunk,
  swung,
  JOSHUA_BARK,
  JOSHUA_LEAF,
  MESQUITE_BARK,
  MESQUITE_LEAF,
  OCOTILLO,
  OCOTILLO_TIP,
  PALO_VERDE,
  PEAR_FRUIT,
  PINYON,
  PRICKLY_PEAR,
  SAGEBRUSH,
  SAGUARO,
  SAGUARO_DARK,
  SAGUARO_RIB,
  SAGUARO_TIP,
  SALT_CRUST,
  TRUNK_DARK,
  TUMBLEWEED,
  YUCCA,
  YUCCA_STALK,
} from "./flora-build.ts";
import type { VariantDef } from "./flora-species.ts";

// ── Shared silhouettes ─────────────────────────────────────────────────────
// The limbs are the builder's own (`limb`, hinged where they leave the
// trunk, `swung` for where their ends go): the same rule that keeps a
// bough on a spruce keeps an arm on a Joshua tree.

/** A saguaro's ARM: out from the trunk, then up. The horizontal stub is
 * what makes the silhouette — an arm that curves smoothly out of the trunk
 * reads as a branch, and a branch is a tree, and a saguaro is not one. */
function saguaroArm(
  b: GeoBuilder,
  r: number,
  at: number,
  out: number,
  up: number,
  angle: number,
): void {
  const stub = new THREE.CylinderGeometry(r, r * 0.9, out, 6);
  stub.rotateZ(-Math.PI / 2);
  stub.translate(out / 2, at, 0);
  stub.rotateY(angle);
  b.add(stub, SAGUARO_DARK);
  const rise = new THREE.CylinderGeometry(r * 0.85, r, up, 6);
  rise.translate(out, at + up / 2, 0);
  rise.rotateY(angle);
  b.add(rise, SAGUARO);
  const tip = swung(out, at + up, angle);
  b.blob(SAGUARO_TIP, r * 1.05, tip.x, tip.y, tip.z, { sy: 0.7 });
}

/** The column, with its ribs: one eight-sided cylinder, and a second,
 * narrower and darker one inside it turned half a facet round, so every
 * other rib is a shaded groove. Two draws for a fluted column. */
function saguaroColumn(b: GeoBuilder, r: number, h: number, lean = 0): void {
  b.cyl(SAGUARO, r * 0.85, r, h, 0, { tiltZ: lean }, 8);
  b.cyl(SAGUARO_DARK, r * 0.8, r * 0.96, h * 0.98, 0, { tiltZ: lean, ry: Math.PI / 8 }, 8);
  const top = swung(Math.sin(lean) * -h, Math.cos(lean) * h, 0);
  b.blob(SAGUARO_TIP, r * 1.1, top.x, top.y, 0, { sy: 0.6 });
}

function saguaro(b: GeoBuilder, h: number, r: number, arms: [number, number, number][]): void {
  saguaroColumn(b, r, h);
  for (const [at, angle, up] of arms) saguaroArm(b, r * 0.72, at, r * 2.6, up, angle);
}

/** A Joshua tree: a shaggy trunk forking into limbs, each ending in a
 * fist of blades over a skirt of dead ones. The rosette is a blob and the
 * skirt a longer blob under it — from the road it is the two-tone knob on
 * the end of every branch that says Joshua tree, not the leaves. */
function joshua(b: GeoBuilder, h: number, forks: [number, number, number, boolean][]): void {
  b.cyl(JOSHUA_BARK, 0.2, 0.34, h, 0, {}, 6);
  const crown = (p: { x: number; y: number; z: number }, r: number): void => {
    b.blob(JOSHUA_BARK, r * 0.75, p.x, p.y - r * 0.2, p.z, { sy: 1.4 });
    b.blob(JOSHUA_LEAF, r, p.x, p.y + r * 0.35, p.z);
  };
  crown({ x: 0, y: h, z: 0 }, 0.6);
  for (const [at, tilt, angle, again] of forks) {
    const end = limb(b, JOSHUA_BARK, 0.13, 0.18, 1.5, at, tilt, angle);
    crown(end, 0.55);
    // Some limbs fork again: a Joshua tree is a fist of fists. The second
    // limb is hinged at the first one's END, which after the first's own
    // swing is off the trunk's axis — so it is built about the origin at
    // the right height and angle and then carried out to that end.
    if (again) {
      const geo = new THREE.CylinderGeometry(0.1, 0.13, 1, 6);
      geo.translate(0, 0.5, 0);
      geo.rotateZ(-(tilt + 0.5));
      geo.rotateY(angle + 1.2);
      geo.translate(end.x, end.y - 0.1, end.z);
      b.add(geo, JOSHUA_BARK);
      const tip = swung(Math.sin(tilt + 0.5), Math.cos(tilt + 0.5), angle + 1.2);
      crown({ x: end.x + tip.x, y: end.y - 0.1 + tip.y, z: end.z + tip.z }, 0.42);
    }
  }
}

/** The wash trees — mesquite and palo verde — share a shape: a short
 * leaning trunk, a few limbs, and a wide flat crown of small blobs, so the
 * tree is a broad umbrella you can see under. The limbs and the crown hang
 * off where the LEANING trunk actually is at their height, not off the
 * model's axis — a lean of a quarter radian puts the top of the trunk
 * half a metre from where the crown would otherwise be centred. */
function washTree(
  b: GeoBuilder,
  bark: THREE.Color,
  leaf: THREE.Color,
  h: number,
  spread: number,
  blobs: number,
): void {
  const LEAN = 0.22;
  b.cyl(bark, 0.14, 0.26, h * 0.4, 0, { tiltZ: LEAN });
  const limbs: [number, number][] = [
    [0.55, 0.3],
    [0.5, 2.4],
    [0.65, 4.3],
  ];
  const fork = onTrunk(LEAN, h * 0.36);
  const ends: { x: number; y: number; z: number }[] = [];
  for (const [tilt, angle] of limbs) {
    ends.push(limb(b, bark, 0.07, 0.12, h * 0.45, fork, tilt, angle));
  }
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + 0.4;
    const d = spread * (0.35 + (i % 3) * 0.28);
    const r = spread * (0.36 + (i % 2) * 0.1);
    b.blob(leaf, r, fork.x + Math.cos(a) * d, h * (0.72 + (i % 3) * 0.08), Math.sin(a) * d, {
      sy: 0.5,
    });
  }
  for (const end of ends) b.blob(leaf, spread * 0.3, end.x, end.y + 0.1, end.z, { sy: 0.55 });
}

/** A ring of leaning cones — an agave's rosette, a yucca's head. Cones
 * rather than blades because they are SOLID: a blade goes through the
 * ground cover's sway shader, and an agave does not sway. */
function rosette(
  b: GeoBuilder,
  color: THREE.Color,
  tip: THREE.Color | null,
  n: number,
  r: number,
  len: number,
  at: number,
  lean: number,
): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 2) * 0.2;
    const tilt = lean + (i % 3) * 0.18;
    b.cone(color, r, len, at, { tiltZ: tilt, ry: a }, 4);
    if (tip) {
      const end = swung(Math.sin(tilt) * -len, at + Math.cos(tilt) * len, a);
      b.blob(tip, r * 0.5, end.x, end.y, end.z);
    }
  }
}

/** A spray of thin stems from one root, each leaning out its own way. */
function stems(
  b: GeoBuilder,
  color: THREE.Color,
  n: number,
  rTop: number,
  rBot: number,
  h: number,
  lean: number,
  tipOf?: (top: { x: number; y: number; z: number }, i: number) => void,
): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.35;
    const tilt = lean + (i % 4) * 0.08;
    const len = h * (0.75 + (i % 3) * 0.14);
    b.cyl(color, rTop, rBot, len, 0, { tiltZ: tilt, ry: a }, 4);
    tipOf?.(swung(Math.sin(tilt) * -len, Math.cos(tilt) * len, a), i);
  }
}

// ── The variant roster ─────────────────────────────────────────────────────

export const DESERT_VARIANTS: Record<string, VariantDef> = {
  // The columnar cacti — SOLID trunks the engine places. A saguaro grows an
  // arm a century, so the young one is a post, the ordinary one has two,
  // and the old one is a candelabra.
  saguaro: {
    build: (b) =>
      saguaro(b, 7, 0.34, [
        [3.2, 0.4, 2.4],
        [3.9, 3.7, 1.8],
      ]),
  },
  saguaroOld: {
    build: (b) =>
      saguaro(b, 10.5, 0.42, [
        [3.4, 0.2, 3.6],
        [4.6, 2.2, 2.9],
        [5.2, 4.1, 2.2],
        [6.4, 5.4, 1.5],
      ]),
  },
  saguaroYoung: { build: (b) => saguaroColumn(b, 0.28, 3.2, 0.03) },
  /** What a saguaro leaves: the woody ribs standing in a loose ring, the
   * flesh gone from between them. Solid — it is a post of hardwood. */
  deadSaguaro: {
    build: (b) => {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const h = 3.2 + (i % 3) * 1.1;
        b.cyl(SAGUARO_RIB, 0.03, 0.05, h, 0, {
          x: Math.cos(a) * 0.22,
          z: Math.sin(a) * 0.22,
          tiltZ: 0.04 + (i % 2) * 0.05,
          ry: a,
        });
      }
      b.cyl(TRUNK_DARK, 0.26, 0.32, 0.5, 0, {}, 8);
    },
  },
  /** A barrel: a ribbed drum with a crown of yellow spines. Soft — it is
   * knee-high and the car goes over it. */
  barrelCactus: {
    build: (b) => {
      b.cyl(BARREL, 0.36, 0.3, 0.8, 0, {}, 8);
      b.cyl(SAGUARO_DARK, 0.34, 0.29, 0.78, 0, { ry: Math.PI / 8 }, 8);
      b.blob(BARREL_SPINE, 0.24, 0, 0.82, 0, { sy: 0.45 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cone(BARREL_SPINE, 0.03, 0.18, 0.7, { x: Math.cos(a) * 0.3, z: Math.sin(a) * 0.3 }, 3);
      }
    },
  },
  /** Prickly pear: a clump of flat paddles standing on edge, the fruit
   * along their top rims. */
  pricklyPear: {
    build: (b) => {
      const pads: [number, number, number, number][] = [
        [0, 0.42, 0, 0.5],
        [1.1, 0.36, 0.3, 0.42],
        [-1.4, 0.34, -0.25, 0.4],
        [2.6, 0.3, 0.55, 0.32],
        [0.6, 0.28, -0.6, 0.3],
      ];
      for (const [ry, r, x, y] of pads) {
        b.blob(PRICKLY_PEAR, r, x, y, x * 0.4, { sz: 0.28, sy: 1.15, ry });
        b.blob(PEAR_FRUIT, r * 0.22, x, y + r * 1.05, x * 0.4, { ry });
      }
    },
  },
  /** Cholla: a trunk of dead joints with a mop of silver ones on top. The
   * silver is the spines, and it is the whole reason the thing is visible
   * against sand at all. */
  cholla: {
    build: (b) => {
      b.cyl(CHOLLA_DARK, 0.06, 0.1, 1.1, 0, {}, 5);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const at = 0.7 + (i % 3) * 0.28;
        const tilt = 0.4 + (i % 4) * 0.2;
        b.cyl(CHOLLA, 0.09, 0.11, 0.5, at, { tiltZ: tilt, ry: a }, 5);
        const end = swung(Math.sin(tilt) * -0.5, at + Math.cos(tilt) * 0.5, a);
        b.blob(CHOLLA, 0.12, end.x, end.y, end.z);
      }
    },
  },
  /** Ocotillo: a spray of whips three or four metres tall from one root,
   * bare all year and flame-tipped in spring. Soft — a whip is a whip. */
  ocotillo: {
    build: (b) =>
      stems(b, OCOTILLO, 9, 0.02, 0.05, 3.6, 0.3, (top) =>
        b.blob(OCOTILLO_TIP, 0.09, top.x, top.y, top.z, { sy: 2.2 }),
      ),
  },
  // The Joshua trees — solid trunks.
  joshuaTree: {
    build: (b) =>
      joshua(b, 2.6, [
        [1.6, 0.7, 0.5, true],
        [2.0, 0.55, 2.7, false],
        [2.3, 0.8, 4.6, true],
      ]),
  },
  joshuaYoung: { build: (b) => joshua(b, 1.4, [[1.1, 0.75, 1.8, false]]) },
  // The wash trees — solid.
  mesquite: { build: (b) => washTree(b, MESQUITE_BARK, MESQUITE_LEAF, 4.4, 2.4, 6) },
  paloVerde: { build: (b) => washTree(b, PALO_VERDE, PALO_VERDE, 5, 2.2, 8) },
  /** A pinyon pine: the one conifer up here, squat and round-headed. */
  pinyon: {
    build: (b) => {
      b.cyl(TRUNK_DARK, 0.12, 0.22, 1.6, 0);
      b.blob(PINYON, 1.4, 0, 2.6, 0, { sy: 0.85 });
      b.blob(PINYON, 1, 0.8, 2.2, 0.5);
      b.blob(PINYON, 0.9, -0.7, 2.3, -0.6);
      b.blob(PINYON, 0.7, 0, 3.5, 0);
    },
  },
  // The scrub — all of it soft, and most of the country.
  /** Creosote: a dozen thin stems and a little olive foliage on the end of
   * each — an airy bush you can see straight through, which is what a
   * creosote flat looks like: bushes, and the ground between them. */
  creosote: {
    build: (b) =>
      stems(b, CREOSOTE_STEM, 7, 0.012, 0.028, 1.3, 0.38, (top, i) =>
        b.blob(CREOSOTE, 0.26 + (i % 2) * 0.06, top.x, top.y, top.z, { sy: 0.8 }),
      ),
  },
  /** Brittlebush: a grey-green mound, and in spring a yellow one. */
  brittlebush: {
    build: (b) => {
      b.blob(BRITTLEBUSH, 0.48, 0, 0.36, 0, { sy: 0.75 });
      b.blob(BRITTLEBUSH, 0.34, 0.42, 0.3, 0.2, { sy: 0.75 });
      b.blob(BRITTLEBUSH, 0.3, -0.38, 0.28, -0.24, { sy: 0.75 });
    },
  },
  sagebrush: {
    build: (b) => {
      b.cyl(CREOSOTE_STEM, 0.03, 0.06, 0.4, 0, {}, 4);
      b.blob(SAGEBRUSH, 0.55, 0, 0.7, 0, { sy: 0.8 });
      b.blob(SAGEBRUSH, 0.4, 0.45, 0.55, 0.25, { sy: 0.8 });
      b.blob(SAGEBRUSH, 0.36, -0.4, 0.6, -0.3, { sy: 0.8 });
    },
  },
  /** Agave: a rosette of stiff blue blades, each with a black spine. */
  agave: { build: (b) => rosette(b, AGAVE, AGAVE_TIP, 11, 0.13, 1.1, 0.05, 0.55) },
  /** Yucca: a rosette on a short trunk with a flower stalk out of the top
   * — cream in spring, a dry stick the rest of the year. */
  yucca: {
    build: (b) => {
      b.cyl(YUCCA_STALK, 0.12, 0.17, 1.1, 0, {}, 6);
      rosette(b, YUCCA, null, 14, 0.07, 0.95, 1.05, 0.5);
      b.cyl(YUCCA_STALK, 0.03, 0.05, 1.7, 1.5, {}, 4);
      b.blob(YUCCA_STALK, 0.16, 0, 2.9, 0, { sy: 2 });
    },
  },
  /** Dead brush: what half the scrub is, most years. */
  deadBrush: {
    build: (b) =>
      stems(b, DEAD_BRUSH, 6, 0.01, 0.025, 0.9, 0.45, (top, i) => {
        if (i % 2 === 0) b.blob(DEAD_BRUSH, 0.07, top.x, top.y, top.z);
      }),
  },
  /** A tumbleweed, caught against whatever stopped it. */
  tumbleweed: {
    build: (b) => {
      b.blob(TUMBLEWEED, 0.5, 0, 0.48, 0);
      b.blob(TUMBLEWEED, 0.36, 0.3, 0.42, 0.25, { ry: 0.7 });
      b.blob(DEAD_BRUSH, 0.3, -0.28, 0.5, -0.2, { ry: 1.9 });
    },
  },
  // The ground: the two grasses are the two-sided, wind-swayed set.
  /** Bunch grass: a fountain of dry blades, the one soft thing on a dune. */
  bunchGrass: {
    twoSided: true,
    build: (b) => {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        b.blade(BUNCH_BASE, BUNCH_TIP, 0.07, 0.55 + (i % 3) * 0.16, {
          ry: a + i * 0.5,
          tiltZ: 0.5 + (i % 2) * 0.3,
          x: Math.cos(a) * 0.1,
          z: Math.sin(a) * 0.1,
        });
      }
    },
  },
  desertGrass: {
    twoSided: true,
    build: (b) => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.blade(BUNCH_BASE, BUNCH_TIP, 0.06, 0.3 + (i % 2) * 0.1, {
          ry: a + i * 0.9,
          tiltZ: 0.4 + (i % 3) * 0.2,
          x: Math.cos(a) * 0.08,
          z: Math.sin(a) * 0.08,
        });
      }
    },
  },
  /** The crust on a pan: plates of salt lying flat, a floor and not an
   * object. */
  saltCrust: {
    build: (b) => {
      b.blob(SALT_CRUST, 0.9, 0, 0.05, 0, { sy: 0.07 });
      b.blob(SALT_CRUST, 0.6, 0.85, 0.04, 0.4, { sy: 0.07, ry: 0.5 });
      b.blob(SALT_CRUST, 0.5, -0.7, 0.05, -0.5, { sy: 0.07, ry: 1.3 });
    },
  },
  /** A skull, bleached, horns and all. Every desert has one. */
  cowSkull: {
    build: (b) => {
      b.blob(BONE, 0.22, 0, 0.16, 0, { sy: 0.7, sz: 1.3 });
      b.cone(BONE, 0.04, 0.38, 0.18, { x: 0.18, tiltZ: -1.2, ry: 0.2 }, 4);
      b.cone(BONE, 0.04, 0.38, 0.18, { x: -0.18, tiltZ: 1.2, ry: -0.2 }, 4);
    },
  },
};
