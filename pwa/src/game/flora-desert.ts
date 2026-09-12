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
// and a column, a Joshua tree is a fist of daggers, an ocotillo is a spray
// of whips, and each of them is built to be nothing else.
//
// Two rules run through the whole file, and neither is optional:
//
//  1. A CACTUS IS FLUTED. Its column is an accordion of ribs that swell and
//     shrink with what it is holding, and under a low sun those ribs are a
//     run of vertical shading bands. A smooth cylinder of the same colour
//     and size is a length of painted pipe. Every cactus body here is
//     `flutedGeo`/`ribbed`, never `cyl`.
//  2. A DESERT TREE IS NOT A SAVANNA TREE. The wash trees have almost no
//     leaves — a palo verde photosynthesises through its bark and casts
//     nothing but dappled shade — so their crowns are open scatters you can
//     see sky and branch through, and they grow on several thin stems out
//     of one root rather than on one bole. A dense flat-topped umbrella on
//     a single trunk is an acacia, and an acacia is the wrong continent.

import * as THREE from "three";

import {
  AGAVE,
  AGAVE_BLOOM,
  AGAVE_STALK,
  AGAVE_TIP,
  BARREL,
  BARREL_HOOK,
  BARREL_SPINE,
  BONE,
  BRITTLEBUSH,
  BUNCH_BASE,
  BUNCH_TIP,
  BURSAGE,
  CHOLLA,
  CHOLLA_DARK,
  CHOLLA_FRUIT,
  CREOSOTE,
  CREOSOTE_STEM,
  DEAD_BRUSH,
  GeoBuilder,
  HEDGEHOG,
  HEDGEHOG_BLOOM,
  IRONWOOD_BARK,
  IRONWOOD_LEAF,
  JOSHUA_BARK,
  JOSHUA_DEAD,
  JOSHUA_LEAF,
  MESQUITE_BARK,
  MESQUITE_LEAF,
  OCOTILLO,
  OCOTILLO_TIP,
  ORGAN_PIPE,
  ORGAN_PIPE_DARK,
  PALO_VERDE,
  PALO_VERDE_LEAF,
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
  limb,
  onTrunk,
  ribLimb,
  swung,
  type PartColor,
  type Point,
} from "./flora-build.ts";
import type { VariantDef } from "./flora-species.ts";

/** The golden angle: successive parts placed at multiples of it land
 * evenly round a circle without ever repeating a spoke, which is what
 * keeps a scattered crown or a ring of cactus stems from reading as the
 * regular wheel that `i / n * 2π` always does. */
const PHI = 2.39996;

// ── Shared silhouettes ─────────────────────────────────────────────────────

/** The scatter a desert tree's foliage is: blobs thrown ALONG one branch,
 * from its fork to its tip, and out to either side of it.
 *
 * Along, and not on the end. Foliage piled on the tips of the boughs puts
 * every leaf a tree owns into one thin horizontal band — and a band of
 * foliage on bare stems is a flat-topped umbrella, which is an acacia and
 * the wrong continent however open the scatter inside it is. Walking the
 * branch spends the same blobs over the whole height between the fork and
 * the tip, so the silhouette is a mound with trunks showing through it.
 *
 * How open that mound reads is `n` against `spread`, and nothing else: the
 * same eight blobs are a solid crown over two metres and a lace of leaves
 * over five. */
function crown(
  b: GeoBuilder,
  color: THREE.Color,
  from: Point,
  to: Point,
  spread: number,
  n: number,
  r: number,
  flat = 0.6,
): void {
  for (let i = 0; i < n; i++) {
    const a = i * PHI;
    // Down the branch, biased toward the outer half where the leaves
    // actually are, but never leaving the inner half bare.
    const f = 0.26 + ((i + 0.5) / n) * 0.86;
    const d = spread * (0.3 + 0.7 * ((i % 3) / 2));
    b.blob(
      color,
      r * (1.12 - (i % 3) * 0.16) * (0.82 + b.random() * 0.36),
      from.x + (to.x - from.x) * f + Math.cos(a) * d,
      from.y + (to.y - from.y) * f + (b.random() - 0.5) * spread,
      from.z + (to.z - from.z) * f + Math.sin(a) * d,
      { sy: flat },
    );
  }
}

/** A saguaro's ARM, and the only part of the plant most people could draw
 * from memory. It leaves the trunk almost horizontally, turns through an
 * ELBOW over half a metre or so, and then runs straight up — usually
 * finishing near the height of the crown it grew out of. Built as a chain
 * of short fluted segments each hinged on the last one's end, because the
 * elbow is the whole shape: a right angle reads as plumbing and a smooth
 * curve reads as the bough of a tree. */
function saguaroArm(
  b: GeoBuilder,
  r: number,
  at: number,
  angle: number,
  up: number,
  reach = 1,
): void {
  // Off vertical, segment by segment: out, turning, turned, and then the rise.
  const ELBOW: [number, number][] = [
    [1.35, 0.34],
    [0.95, 0.3],
    [0.42, 0.26],
  ];
  let hinge: Point = { x: 0, y: at, z: 0 };
  let rad = r;
  for (const [tilt, len] of ELBOW) {
    hinge = ribLimb(b, SAGUARO, rad * 0.96, rad, len * reach, hinge, tilt, angle);
    rad *= 0.97;
  }
  const top = ribLimb(b, SAGUARO, rad * 0.9, rad, up, hinge, 0.05, angle, 5, false);
  b.blob(SAGUARO_TIP, rad * 1.15, top.x, top.y, top.z, { sy: 0.75 });
}

/** The column: one fluted cylinder, tapering a little toward a domed top.
 * Twelve ribs, because that is the low end of what a real saguaro carries
 * and the count is what the light reads, not the botany. */
function saguaroColumn(b: GeoBuilder, r: number, h: number, lean = 0): void {
  b.ribbed([SAGUARO_DARK, SAGUARO], r * 0.86, r, h, 0, { tiltZ: lean }, 12);
  const top = onTrunk(lean, h);
  b.blob(SAGUARO_TIP, r * 1.02, top.x, top.y - r * 0.12, top.z, { sy: 0.8 });
}

function saguaro(
  b: GeoBuilder,
  h: number,
  r: number,
  arms: [number, number, number][],
  reach = 1,
): void {
  saguaroColumn(b, r, h);
  for (const [at, angle, up] of arms) saguaroArm(b, r * 0.7, at, angle, up, reach);
}

/** A ring of leaning cones — an agave's rosette, a yucca's head, the fist
 * of daggers on the end of a Joshua tree's every branch. Cones rather than
 * blades because they are SOLID: a blade goes through the ground cover's
 * sway shader, and nothing with a spine on it sways. */
function rosette(
  b: GeoBuilder,
  color: THREE.Color,
  tip: THREE.Color | null,
  n: number,
  r: number,
  len: number,
  at: number | Point,
  lean: number,
): void {
  const p = typeof at === "number" ? { x: 0, y: at, z: 0 } : at;
  // The black spine at the end of an agave's blade is the blade's own last
  // centimetre, so it is the cone's top colour and not a bead stuck on the
  // end of it: beads read as a swarm of flies over a tuft of grass.
  const paint: PartColor = tip ? [color, tip] : color;
  for (let i = 0; i < n; i++) {
    const a = i * PHI;
    const tilt = lean + (i % 3) * 0.18;
    b.cone(paint, r, len, p.y, { x: p.x, z: p.z, tiltZ: tilt, ry: a }, 4);
  }
}

/** The skirt of dead leaves hanging under a Joshua tree's every head, and
 * the thatch on its trunk: an inverted cone, hinged at its own WIDE end so
 * it hangs from the rosette above it. Half of what a Joshua tree looks like
 * is dead, and without that half the plant is an ordinary little broadleaf
 * tree with spiky leaves. */
function thatch(b: GeoBuilder, color: THREE.Color, r: number, h: number, at: Point): void {
  const geo = new THREE.ConeGeometry(r, h, 7);
  geo.rotateZ(Math.PI);
  geo.translate(at.x, at.y - h / 2, at.z);
  b.add(geo, color);
}

/** A spray of thin stems from one root, each leaning out its own way —
 * an ocotillo's canes, a creosote's whips, the brittle sticks of a dead
 * bush. `bend` straightens each stem's upper half, which is the difference
 * between a fountain and a bundle of sticks. */
function stems(
  b: GeoBuilder,
  color: THREE.Color,
  n: number,
  rTop: number,
  rBot: number,
  h: number,
  lean: number,
  bend = 0,
  tipOf?: (top: Point, i: number, tilt: number, angle: number) => void,
): void {
  for (let i = 0; i < n; i++) {
    const a = i * PHI;
    const tilt = lean + (i % 4) * 0.07;
    const len = h * (0.74 + (i % 3) * 0.15);
    if (bend <= 0) {
      const top = limb(b, color, rTop, rBot, len, 0, tilt, a, 4);
      tipOf?.(top, i, tilt, a);
      continue;
    }
    const mid = limb(b, color, (rTop + rBot) / 2, rBot, len * 0.45, 0, tilt, a, 4);
    const up = tilt * (1 - bend);
    const top = limb(b, color, rTop, (rTop + rBot) / 2, len * 0.55, mid, up, a, 4);
    tipOf?.(top, i, up, a);
  }
}

/** One pad of a prickly pear: a flat oval standing on edge, hinged where
 * it joins the pad below. A blob cannot be this — the whole plant is the
 * fact that it is made of PLATES, and a squashed icosahedron reads as a
 * rock. Returns the point on its upper rim where the next pad grows. */
function pad(b: GeoBuilder, r: number, at: Point, yaw: number, tilt: number): Point {
  const geo = new THREE.CylinderGeometry(r * 0.94, r * 0.66, r * 0.3, 7);
  geo.rotateX(Math.PI / 2); // lay the disc's face across the model's x/y
  geo.scale(1, 1.3, 1); // ...and stand it up: a pad is taller than it is wide
  geo.rotateZ(tilt);
  geo.rotateY(yaw);
  geo.translate(at.x, at.y, at.z);
  b.add(geo, PRICKLY_PEAR);
  const rise = r * 1.3;
  const out = swung(-Math.sin(tilt) * rise, Math.cos(tilt) * rise, yaw);
  return { x: at.x + out.x, y: at.y + out.y, z: at.z + out.z };
}

/** The wash trees, which is what the desert calls a tree: several thin
 * stems out of one root, forking low, carrying an OPEN scatter of small
 * leaves down the length of every branch.
 *
 * `fork` is the height the stems split at as a fraction of the tree, and it
 * is what separates the three: a mesquite breaks up near the ground and is
 * a mound of foliage with dark trunks inside it, an ironwood carries a
 * rounded crown higher, and a palo verde holds the most bare green stem of
 * the three. Fork them all high and they are the same tree wearing three
 * colours. */
function washTree(
  b: GeoBuilder,
  bark: THREE.Color,
  leaf: THREE.Color,
  h: number,
  spread: number,
  opts: {
    stems: number;
    leaves: number;
    leaf: number;
    fork: number;
    flat?: number;
    droop?: number;
  },
): void {
  const droop = opts.droop ?? 0;
  for (let i = 0; i < opts.stems; i++) {
    const a = i * PHI;
    const lean = 0.14 + (i % 3) * 0.09;
    const stem = limb(b, bark, h * 0.026, h * 0.042, h * opts.fork, 0, lean, a, 5);
    for (let k = 0; k < 2; k++) {
      // Each fork its own length, so the tips finish at half a dozen
      // different heights rather than on one plane.
      const reach = h * (0.3 + ((i + k * 2) % 4) * 0.08);
      const end = limb(
        b,
        bark,
        h * 0.012,
        h * 0.024,
        reach,
        stem,
        lean + 0.2 + k * 0.3,
        a + (k ? 0.8 : -0.7),
        4,
      );
      crown(
        b,
        leaf,
        { x: stem.x, y: stem.y - droop, z: stem.z },
        { x: end.x, y: end.y - droop, z: end.z },
        spread * 0.26,
        opts.leaves,
        opts.leaf,
        opts.flat ?? 0.6,
      );
    }
  }
}

/** A Joshua tree, trunk and all: a shaggy grey column thatched in the dead
 * leaves it never sheds, forking into stiff crooked limbs, each ending in a
 * fist of dark daggers over a skirt of more dead ones. Every tier halves
 * the head size and doubles the head COUNT, so `tiers` is the difference
 * between a young one and a five-metre candelabra — and the reason it stops
 * at two is that the third would quadruple the rosettes for a shape nobody
 * can read at forty metres a second. */
function joshua(b: GeoBuilder, h: number, r: number, tiers: number): void {
  // The trunk is thatched to about half its height in the dead leaves it
  // has never shed, so it is a shaggy grey column, not a pole.
  b.cyl(JOSHUA_BARK, r * 0.78, r, h, 0, {}, 7);
  for (let i = 0; i < 8; i++) {
    // Barely proud of the trunk and overlapping by half their length, so
    // the column reads as one continuous shag with a ragged edge. Wider
    // cones, or gaps between them, and the same parts are a pagoda's eaves.
    thatch(b, JOSHUA_DEAD, r * (1.34 - i * 0.025) * (0.94 + b.random() * 0.14), h * 0.2, {
      x: 0,
      y: h * (0.24 + i * 0.093),
      z: 0,
    });
  }
  const head = (p: Point, scale: number): void => {
    thatch(b, JOSHUA_DEAD, 0.42 * scale, 0.62 * scale, { x: p.x, y: p.y + 0.12 * scale, z: p.z });
    rosette(b, JOSHUA_LEAF, null, 9, 0.06 * scale, 0.72 * scale, p, 0.75);
  };
  let forks: Point[] = [{ x: 0, y: h, z: 0 }];
  let rad = r * 0.72;
  for (let t = 0; t < tiers; t++) {
    const next: Point[] = [];
    const branches = t === 0 ? 3 : 2;
    for (const at of forks) {
      for (let i = 0; i < branches; i++) {
        const a = i * PHI + t * 1.1 + at.x * 2;
        next.push(
          limb(b, JOSHUA_BARK, rad * 0.8, rad, 1.15 - t * 0.22, at, 0.62 + (i % 2) * 0.2, a, 6),
        );
      }
    }
    forks = next;
    rad *= 0.76;
  }
  for (const f of forks) head(f, 1 - (tiers - 1) * 0.1);
}

// ── The variant roster ─────────────────────────────────────────────────────

export const DESERT_VARIANTS: Record<string, VariantDef> = {
  // ── The columnar cacti: SOLID trunks the engine places, and the only
  // things in this country that break the horizon. A saguaro grows an arm
  // a century, so the young one is a post, the ordinary one has two, and
  // the old one is a candelabra.
  saguaro: {
    build: (b) =>
      saguaro(
        b,
        7,
        0.27,
        [
          [3.1, 0.4, 3.2],
          [4.0, 3.7, 2.3],
        ],
        1.15,
      ),
  },
  saguaroOld: {
    build: (b) =>
      saguaro(
        b,
        11,
        0.33,
        [
          [3.6, 0.2, 5.8],
          [4.8, 2.2, 4.4],
          [5.4, 4.1, 3.6],
          [6.9, 5.4, 2.4],
        ],
        1.45,
      ),
  },
  saguaroYoung: { build: (b) => saguaroColumn(b, 0.21, 2.8, 0.03) },
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
  /** An organ pipe: not one column but a dozen, all rising together out of
   * one root with no trunk under them. From the road it is a fan, where a
   * saguaro is a post — which is the only reason to carry both. Solid. */
  organPipe: {
    build: (b) => {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = i * PHI;
        const d = 0.12 + (i % 4) * 0.13;
        const lean = 0.1 + d * 0.75;
        const h = 2.7 + (i % 5) * 0.4;
        const r = 0.19 - (i % 3) * 0.015;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        b.ribbed([ORGAN_PIPE_DARK, ORGAN_PIPE], r * 0.82, r, h, 0, { x, z, tiltZ: lean, ry: a }, 7);
        const top = swung(-Math.sin(lean) * h, Math.cos(lean) * h, a);
        b.blob(SAGUARO_TIP, r * 1.1, x + top.x, top.y - r * 0.3, z + top.z, { sy: 1 });
      }
    },
  },
  /** A barrel: a squat fluted drum under a dome, wearing a cage of yellow
   * spines and the red hooks that give it its name. Soft — it is knee-high
   * and the car goes over it. It leans, and it always leans the same way:
   * a barrel cactus grows toward the low southern sun, which is why the
   * old prospectors called it the compass cactus. */
  barrelCactus: {
    build: (b) => {
      const LEAN = 0.16;
      // Widest at two thirds and closing to a dome. A straight-sided drum
      // under a flat lid is a paint tin, whatever colour it is painted.
      b.ribbed(BARREL, 0.32, 0.26, 0.5, 0, { tiltZ: LEAN }, 11, true);
      const waist = onTrunk(LEAN, 0.5);
      b.ribbed(BARREL, 0.23, 0.32, 0.3, waist.y, { x: waist.x, z: waist.z, tiltZ: LEAN }, 11, true);
      const top = onTrunk(LEAN, 0.8);
      b.blob(BARREL, 0.23, top.x, top.y - 0.04, top.z, { sy: 0.62 });
      b.blob(BARREL_SPINE, 0.12, top.x, top.y + 0.07, top.z, { sy: 0.5 });
      for (let i = 0; i < 8; i++) {
        const a = i * PHI;
        const at = onTrunk(LEAN, 0.16 + (i % 4) * 0.18);
        const r = 0.3 - Math.max(0, at.y - 0.5) * 0.5;
        b.cone(
          i % 2 ? BARREL_SPINE : BARREL_HOOK,
          0.02,
          0.15,
          at.y,
          { x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r, tiltZ: -1.1, ry: a },
          3,
        );
      }
    },
  },
  /** Prickly pear: a clump of flat paddles growing rim to rim, each one
   * standing on edge and facing its own way, with the tunas along the top
   * rims — green in summer, wine-red by October. */
  pricklyPear: {
    build: (b) => {
      for (let i = 0; i < 5; i++) {
        const yaw = i * PHI;
        let r = 0.38 - (i % 3) * 0.05;
        // Each chain leans away from the clump's middle and keeps leaning,
        // so the pads walk outward and the plant sprawls the way a real one
        // does. Stacked upright instead, the same pads are a totem pole.
        let tilt = 0.62 + (i % 3) * 0.16;
        let at: Point = { x: Math.cos(yaw) * 0.3, y: r * 0.78, z: Math.sin(yaw) * 0.3 };
        for (let k = 0; k < 3; k++) {
          const rim = pad(b, r, at, yaw, tilt);
          if (k % 2 === 0) b.blob(PEAR_FRUIT, r * 0.19, rim.x, rim.y - r * 0.08, rim.z);
          r *= 0.82;
          at = { x: rim.x, y: rim.y - r * 0.1, z: rim.z };
          tilt = tilt * 0.55 + (k % 2 ? -0.42 : 0.42);
        }
      }
    },
  },
  /** Hedgehog: a tight clump of short fluted columns down among the
   * stones, and in April the loudest magenta in the desert. */
  hedgehogCactus: {
    build: (b) => {
      for (let i = 0; i < 6; i++) {
        const a = i * PHI;
        const h = 0.22 + (i % 3) * 0.11;
        const d = 0.05 + (i % 3) * 0.05;
        const lean = 0.1 + (i % 4) * 0.08;
        b.ribbed(
          HEDGEHOG,
          0.07,
          0.08,
          h,
          0,
          {
            x: Math.cos(a) * d,
            z: Math.sin(a) * d,
            tiltZ: lean,
            ry: a,
          },
          6,
        );
        const top = swung(-Math.sin(lean) * h, Math.cos(lean) * h, a);
        b.blob(HEDGEHOG_BLOOM, 0.065, Math.cos(a) * d + top.x, top.y, Math.sin(a) * d + top.z, {
          sy: 0.6,
        });
      }
    },
  },
  /** Teddy bear cholla: a short black trunk of dead joints under a dense
   * fist of live ones, every one of them so thickly furred with spines
   * that from any distance the plant is a pale fuzzy lump lit from
   * inside. The silver is the spines, and it is the whole reason the thing
   * is visible against sand at all. */
  cholla: {
    build: (b) => {
      b.cyl(CHOLLA_DARK, 0.07, 0.1, 0.34, 0, {}, 5);
      for (let i = 0; i < 18; i++) {
        const a = i * PHI + b.random() * 0.5;
        // The joints lie back as they go up, so the mass is a blunt club and
        // not a bottlebrush: nearly out at the bottom, nearly up at the top.
        // Every one of them jittered, because the plant is a THICKET of
        // joints — walked up in an exact spiral it comes out a fir cone.
        const t = (i % 6) / 5 + (b.random() - 0.5) * 0.22;
        const at = 0.24 + t * 0.5;
        const tilt = 1.2 - t * 1;
        const len = 0.22 - (i % 3) * 0.03;
        const end = limb(b, CHOLLA, 0.055, 0.062, len, at, tilt, a, 4);
        b.blob(CHOLLA, 0.085 + b.random() * 0.012, end.x, end.y, end.z);
      }
    },
  },
  /** Chain-fruit cholla: the big one, a proper spiny tree with drooping
   * joints and the chains of green fruit that hang off them for years.
   * Soft, like the rest of the chollas — it is spines on sticks. */
  chollaChain: {
    build: (b) => {
      b.cyl(CHOLLA_DARK, 0.09, 0.14, 1.1, 0, {}, 6);
      for (let i = 0; i < 6; i++) {
        const a = i * PHI;
        const at = 0.95 + (i % 3) * 0.32;
        const arm = limb(b, CHOLLA, 0.06, 0.08, 0.62, at, 0.75 + (i % 3) * 0.15, a, 5);
        b.blob(CHOLLA, 0.11, arm.x, arm.y, arm.z);
        // The joints droop off the arm's end, and the fruit hangs under them.
        const hang = limb(b, CHOLLA, 0.05, 0.06, 0.42, arm, 2.3, a, 5);
        b.blob(CHOLLA, 0.09, hang.x, hang.y, hang.z);
        for (let k = 1; k <= 3; k++) {
          b.blob(CHOLLA_FRUIT, 0.05, hang.x, hang.y - k * 0.11, hang.z, { sy: 1.1 });
        }
      }
    },
  },
  /** Ocotillo: not a cactus at all but a spray of woody whips four or five
   * metres tall out of one root, bare and grey most of the year, tipped
   * with flame in spring. Each cane flares out of the base and then runs
   * nearly straight — a fountain, not a bundle. Soft: a whip is a whip. */
  ocotillo: {
    build: (b) =>
      stems(b, OCOTILLO, 11, 0.016, 0.06, 4.6, 0.5, 0.5, (top, _i, tilt, angle) => {
        limb(b, OCOTILLO_TIP, 0.004, 0.018, 0.42, top, tilt, angle, 4);
      }),
  },
  // ── The Joshua trees — solid trunks, and the Mojave's whole skyline.
  /** A Joshua tree: a shaggy grey trunk forking into stiff crooked limbs,
   * each one ending in a fist of dark daggers over a skirt of the dead
   * ones it has not dropped. Half of the plant is dead thatch, and it is
   * that two-tone knob on the end of every branch — never the leaves —
   * that says Joshua tree from four hundred metres. */
  joshuaTree: { build: (b) => joshua(b, 3.1, 0.26, 2) },
  joshuaYoung: { build: (b) => joshua(b, 1.5, 0.17, 1) },
  // ── The wash trees — solid, and the only shade in the country.
  /** Mesquite: low, wide and gnarled, on four or five dark stems, its fine
   * foliage hanging almost to the ground. The densest of the three. */
  mesquite: {
    build: (b) =>
      washTree(b, MESQUITE_BARK, MESQUITE_LEAF, 5.9, 5.6, {
        stems: 4,
        leaves: 6,
        leaf: 0.44,
        // Breaking up at a quarter of its height, which is what makes a
        // mesquite a thicket you cannot see over rather than a shade tree
        // you can walk under.
        fork: 0.26,
        flat: 0.72,
        droop: 0.5,
      }),
  },
  /** Palo verde — the green stick. Bark green from the ground to the
   * finest twig, because that is where the tree does its photosynthesis;
   * leaves so few and so small that the crown is a haze you can see the
   * sky through, and a yellow cloud for three weeks in April. */
  paloVerde: {
    build: (b) =>
      washTree(b, PALO_VERDE, PALO_VERDE_LEAF, 6, 5, {
        stems: 3,
        leaves: 6,
        leaf: 0.4,
        fork: 0.44,
        flat: 0.78,
      }),
  },
  /** Ironwood: the biggest and the oldest thing that grows in a wash, on a
   * heavy grey trunk, carrying the greyest crown in the desert — and for a
   * fortnight in May, a lavender one. */
  ironwood: {
    build: (b) =>
      washTree(b, IRONWOOD_BARK, IRONWOOD_LEAF, 8.2, 6, {
        stems: 3,
        leaves: 8,
        leaf: 0.48,
        fork: 0.36,
        flat: 0.7,
        droop: 0.3,
      }),
  },
  /** A pinyon pine: the one conifer up here, squat and round-headed. */
  pinyon: {
    build: (b) => {
      b.cyl(TRUNK_DARK, 0.14, 0.26, 1.8, 0);
      b.blob(PINYON, 1.5, 0, 2.9, 0, { sy: 0.85 });
      b.blob(PINYON, 1.1, 0.85, 2.4, 0.55);
      b.blob(PINYON, 0.95, -0.75, 2.5, -0.65);
      b.blob(PINYON, 0.75, 0, 3.9, 0);
    },
  },
  // ── The scrub — all of it soft, and most of the country.
  /** Creosote: a dozen thin whips and a scrap of olive foliage at the end
   * of each — an airy bush you can see straight through, which is what a
   * creosote flat looks like: bushes, and the ground between them. */
  creosote: {
    build: (b) =>
      stems(b, CREOSOTE_STEM, 8, 0.012, 0.03, 1.8, 0.4, 0.35, (top, i) => {
        b.blob(CREOSOTE, 0.19 + (i % 3) * 0.04, top.x, top.y, top.z, { sy: 0.85 });
        if (i % 2 === 0)
          b.blob(CREOSOTE, 0.14, top.x * 0.7, top.y - 0.28, top.z * 0.7, { sy: 0.85 });
      }),
  },
  /** Bursage: the grey dome that is actually the commonest plant in the
   * Sonoran desert, and the nurse plant half the saguaros in it started
   * under. Unremarkable on purpose — it is the ground between the things
   * worth looking at, and a desert without it is a stage set. */
  bursage: {
    build: (b) =>
      stems(b, CREOSOTE_STEM, 9, 0.007, 0.018, 0.55, 0.6, 0.3, (top, i) => {
        b.blob(BURSAGE, 0.1 - (i % 3) * 0.015, top.x, top.y - 0.02, top.z, { sy: 0.8 });
        if (i % 2 === 0)
          b.blob(BURSAGE, 0.075, top.x * 0.55, top.y - 0.16, top.z * 0.55, { sy: 0.8 });
      }),
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
  agave: { build: (b) => rosette(b, AGAVE, AGAVE_TIP, 13, 0.2, 1.2, 0.05, 0.6) },
  /** ...and the century plant's one flowering, which kills it: a mast six
   * metres up out of the rosette, with a candelabra of yellow panicles
   * along the top of it. The tallest thing for a kilometre, and worth
   * every triangle for that alone. */
  agaveBloom: {
    build: (b) => {
      rosette(b, AGAVE, AGAVE_TIP, 15, 0.24, 1.6, 0.05, 0.66);
      b.cyl(AGAVE_STALK, 0.05, 0.14, 6, 0, {}, 6);
      for (let i = 0; i < 9; i++) {
        const a = i * PHI;
        const at = 3.5 + i * 0.3;
        const end = limb(b, AGAVE_STALK, 0.014, 0.03, 0.44 + (i % 3) * 0.14, at, 1.25, a, 4);
        b.blob(AGAVE_BLOOM, 0.16, end.x, end.y, end.z, { sy: 0.8 });
      }
      b.blob(AGAVE_BLOOM, 0.13, 0, 6.05, 0, { sy: 1.1 });
    },
  },
  /** Yucca: a rosette of bayonets on a short thatched trunk, with a panicle
   * of cream bells out of the middle of it. The panicle has to be a TAPERING
   * PLUME of small ones: a single capsule on a stalk is a bulrush, which is
   * a plant from a bog a thousand miles north of here. */
  yucca: {
    build: (b) => {
      b.cyl(YUCCA_STALK, 0.13, 0.18, 0.9, 0, {}, 6);
      thatch(b, JOSHUA_DEAD, 0.3, 0.55, { x: 0, y: 1.02, z: 0 });
      rosette(b, YUCCA, null, 15, 0.07, 1.05, 0.95, 0.55);
      b.cyl(YUCCA_STALK, 0.028, 0.05, 1.5, 1.4, {}, 4);
      for (let i = 0; i < 12; i++) {
        const a = i * PHI;
        const t = i / 12;
        b.blob(
          YUCCA_STALK,
          0.115 * (1 - t * 0.6),
          Math.cos(a) * 0.15 * (1 - t * 0.85),
          2.3 + t * 1,
          Math.sin(a) * 0.15 * (1 - t * 0.85),
          { sy: 1.1 },
        );
      }
    },
  },
  /** Dead brush: what half the scrub is, most years. */
  deadBrush: {
    build: (b) =>
      stems(b, DEAD_BRUSH, 6, 0.01, 0.025, 0.9, 0.45, 0, (top, i) => {
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
  // ── The ground: the two grasses are the two-sided, wind-swayed set.
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
