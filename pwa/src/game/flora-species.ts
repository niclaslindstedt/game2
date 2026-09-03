// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The roster: every tree, shrub, ground-cover clump and piece of dead wood
// the scenery can plant, each one a recipe over the builder's primitives
// (flora-build.ts). WHICH of them a stage plants, and where, is the biome's
// (biome.ts) and the placement code's (world.ts, wild.ts) business; this
// module only knows how each plant is SHAPED.
//
// The layers a taiga reads as, tallest first: the canopy conifers, the
// broadleaf accents, a middle storey of saplings and young stems, the shrub
// layer, the dead wood that keeps a forest honest, and the ground cover.
// Everything is authored in real metres at the size a MATURE one stands —
// a boreal canopy is twenty to thirty metres up, and a wood drawn at half
// that reads as a plantation from a car — with the engine's per-trunk scale
// spreading a stand from pole-stage to old, and one variant in each family
// that is the rare old-growth giant the rest of the wood grew up under.
// The silhouette does the work: everything is seen at eighty miles an hour.

import * as THREE from "three";

import { DESERT_VARIANTS } from "./flora-desert.ts";
import {
  GeoBuilder,
  limb,
  onTrunk,
  swung,
  type PartColor,
  ASPEN_BARK,
  BERRY,
  BERRY_LEAF,
  ALDER_BARK,
  ALDER_LEAF,
  BOG_SHRUB,
  BULRUSH_HEAD,
  COTTON,
  DROWNED,
  LILY_BLOOM,
  LILY_PAD,
  SPHAGNUM,
  SPHAGNUM_RUST,
  WILLOW_BARK,
  WILLOW_PALE,
  DRIFTWOOD,
  GROUND_MOSS,
  REED,
  REED_TIP,
  SEDGE,
  SEDGE_TIP,
  ASPEN_LEAF,
  BIRCH_BAND,
  BIRCH_BARK,
  BIRCH_LEAF,
  CUT_WOOD,
  DEAD_WOOD,
  FERN,
  FERN_TIP,
  FIR,
  FIR_DARK,
  GRASS_BASE,
  GRASS_TIP,
  HEATH,
  HEATH_BLOOM,
  JUNIPER,
  LARCH,
  MAPLE_LEAF,
  MOSS,
  OAK_LEAF,
  PINE_BARK,
  PINE_CROWN,
  ROWAN_BERRY,
  ROWAN_LEAF,
  SPRUCE,
  SPRUCE_DARK,
  SPRUCE_LIGHT,
  TRUNK,
  TRUNK_DARK,
  WILLOW,
} from "./flora-build.ts";

// ── Shared silhouettes ─────────────────────────────────────────────────────
// Three rules every tree here stands on. Its parts hinge where they grow
// from — the builder's lift for a tier or a bough, `onTrunk` for anything
// leaving a trunk that leans — so nothing hangs in the air beside the tree
// that grew it. Its shape takes a few rolls off the builder, so the handful
// of builds the world caches of one variant (flora.ts) are a handful of
// trees. And its trunk is as thick as a tree that tall would be, because
// the breakage effects cut their splinters to the drawn girth.

/** A crown's two greens: the tiers down in its own shade, and the ones up
 * in the light. */
type Shade = [low: THREE.Color, high: THREE.Color];

/** How thick a conifer's trunk is at the foot for a tree `h` metres tall. */
const boleRadius = (h: number): number => 0.14 + h * 0.012;

/** The WHORLS a conifer crown is drawn as, from `from` to `to` metres up a
 * trunk leaning `lean`: `count` cones, each taller than the gap to the
 * next so its skirt hangs below the whorl above it — which is what a
 * spruce's drooping branches read as from the road — every one set a touch
 * off the axis and turned half a facet from its neighbours, so the
 * silhouette is a ragged spire rather than one polygon stacked up. `w` is
 * the lowest tier's radius, `taper` how wide the top one still is as a
 * share of that (0 narrows to a point), `inner` the trunk's own radius
 * added to every tier so no whorl is thinner than the wood it grows on. */
function whorls(
  b: GeoBuilder,
  from: number,
  to: number,
  count: number,
  w: number,
  taper: number,
  shade: Shade,
  lean: number,
  ragged: number,
  inner: number,
): void {
  const gap = (to - from) / count;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const y = from + gap * i;
    // Full at the bottom and narrowing faster toward the top: a spire.
    const r = w * (taper + (1 - taper) * (1 - t) ** 0.85) * (0.9 + b.random() * 0.2) + inner;
    const axis = onTrunk(lean, y);
    b.cone(
      t < 0.4 ? shade[0] : shade[1],
      r,
      gap * 2.3,
      axis.y,
      {
        x: axis.x + (b.random() - 0.5) * w * ragged,
        z: (b.random() - 0.5) * w * ragged,
        ry: (i % 2) * (Math.PI / 7) + b.random() * 0.3,
        tiltZ: lean,
      },
      7,
    );
  }
}

/** The spruce and fir family: a trunk bare for `bare` of its height, a
 * stack of `tiers` hanging whorls over it, and a fine spire on top. `w` is
 * the widest tier's radius — a Norway spruce is a fifth as wide as it is
 * tall, and drawing one any fatter turns a wood into a row of tents. */
function spruce(
  b: GeoBuilder,
  h: number,
  w: number,
  tiers: number,
  bare: number,
  shade: Shade,
  trunk: THREE.Color,
  lean = 0,
  ragged = 0.1,
): void {
  const rBase = boleRadius(h);
  b.cyl(trunk, rBase * 0.45, rBase, h * (bare + 0.3), 0, { tiltZ: lean });
  const crownBase = h * bare;
  const gap = (h - crownBase) / (tiers + 1.5);
  const spireH = gap * 1.5;
  whorls(b, crownBase, h - spireH, tiers, w, 0.08, shade, lean, ragged, rBase * 0.5);
  const top = onTrunk(lean, h - spireH);
  b.cone(shade[1], w * 0.1 + rBase * 0.6, spireH, top.y, { x: top.x, tiltZ: lean }, 5);
}

/** A spruce that lost its top to a gale: the whorls stop two thirds of the
 * way up at a splintered break, and a side branch has turned upward to be
 * the new leader. One of these in a stand is what says the stand has been
 * standing for a while. */
function snappedSpruce(b: GeoBuilder, h: number, w: number, shade: Shade): void {
  const lean = 0.03;
  const rBase = boleRadius(h * 1.3);
  const breakAt = h * 0.7;
  b.cyl(TRUNK_DARK, rBase * 0.5, rBase, breakAt, 0, { tiltZ: lean });
  whorls(b, h * 0.14, h * 0.64, 5, w, 0.55, shade, lean, 0.14, rBase * 0.5);
  const top = onTrunk(lean, breakAt);
  b.cone(CUT_WOOD, rBase * 0.5, h * 0.06, top.y - 0.1, { x: top.x + rBase * 0.1, tiltZ: 0.2 }, 4);
  b.cone(CUT_WOOD, rBase * 0.3, h * 0.04, top.y, { x: top.x - rBase * 0.3, tiltZ: -0.35 }, 4);
  // The new leader: a branch that has been growing straight up since.
  const leader = onTrunk(lean, h * 0.58);
  b.cone(shade[1], w * 0.3, h * 0.26, leader.y, { x: leader.x + w * 0.22, tiltZ: -0.28 }, 6);
}

/** A Scots pine: a tall trunk bare for most of its height — grey at the
 * foot and orange up in the light, which is ONE cylinder with the colour
 * running up it rather than two that have to meet — a few heavy boughs
 * hinged on it, and a flat, broken crown of tufts on their ends. `crook`
 * is the trunk's lean, `spread` how wide the crown stands, `flat` how
 * squashed its tufts are: an old pine's crown is a table. */
function pine(
  b: GeoBuilder,
  h: number,
  crook: number,
  boughs: number,
  spread: number,
  flat = 0.55,
): void {
  const rBase = boleRadius(h) * 0.95;
  const trunkH = h * 0.82;
  const bark: PartColor = [TRUNK_DARK, PINE_BARK];
  b.cyl(bark, rBase * 0.4, rBase, trunkH, 0, { tiltZ: crook }, 6);
  const tuft = spread * 0.55;
  for (let i = 0; i < boughs; i++) {
    const at = h * (0.52 + (i / boughs) * 0.26 + b.random() * 0.04);
    const angle = (i / boughs) * Math.PI * 2 + b.random() * 0.8;
    const tilt = 0.85 + b.random() * 0.4;
    const len = spread * (0.5 + b.random() * 0.35);
    const end = limb(
      b,
      PINE_BARK,
      rBase * 0.16,
      rBase * 0.34,
      len,
      onTrunk(crook, at),
      tilt,
      angle,
      5,
    );
    const r = tuft * (0.8 + b.random() * 0.4);
    b.blob(PINE_CROWN, r, end.x, end.y + r * 0.3, end.z, { sy: flat });
  }
  // The head: three tufts over the top of the trunk, the biggest on the
  // leader, the other two a step down and out.
  const top = onTrunk(crook, trunkH);
  b.blob(PINE_CROWN, spread * 0.5, top.x, top.y + spread * 0.22, 0, { sy: flat + 0.1 });
  b.blob(PINE_CROWN, spread * 0.36, top.x + spread * 0.35, top.y + spread * 0.02, spread * 0.22, {
    sy: flat,
  });
  b.blob(PINE_CROWN, spread * 0.32, top.x - spread * 0.3, top.y - spread * 0.06, -spread * 0.26, {
    sy: flat,
  });
}

/** A pine forked low into two leaders — a tree that lost its top young and
 * grew two. Each leader carries its own tufts, so the crown reads as two
 * heads side by side. */
function twinPine(b: GeoBuilder, h: number): void {
  const rBase = boleRadius(h);
  const bark: PartColor = [TRUNK_DARK, PINE_BARK];
  const forkAt = h * 0.34;
  b.cyl(bark, rBase * 0.8, rBase, forkAt, 0, {}, 6);
  const leaders: [tilt: number, angle: number, len: number][] = [
    [0.2, 0.4, h * 0.5],
    [0.3, 3.4, h * 0.42],
  ];
  for (const [tilt, angle, len] of leaders) {
    const end = limb(b, bark, rBase * 0.28, rBase * 0.7, len, forkAt, tilt, angle, 6);
    const tuft = h * 0.11;
    b.blob(PINE_CROWN, tuft, end.x, end.y + tuft * 0.3, end.z, { sy: 0.6 });
    b.blob(PINE_CROWN, tuft * 0.75, end.x + tuft * 0.9, end.y - tuft * 0.3, end.z + tuft * 0.4, {
      sy: 0.55,
    });
    b.blob(PINE_CROWN, tuft * 0.7, end.x - tuft * 0.8, end.y - tuft * 0.5, end.z - tuft * 0.5, {
      sy: 0.55,
    });
  }
}

/** The birch family: pale banded trunks, thin limbs, and a crown of many
 * small blobs that HANGS — the outer ones lower than the inner, which is
 * how a birch weeps. `stems` from one stool for the pair; `lean` the whole
 * tree's tilt; `weep` how far below the crown's top its fringe hangs, as a
 * share of the height. */
function birch(b: GeoBuilder, h: number, stems: number, lean: number, weep = 0.12): void {
  for (let s = 0; s < stems; s++) {
    const tiltZ = stems === 1 ? lean : (s - (stems - 1) / 2) * 0.2 + lean;
    const ry = s * 2.4;
    const o = { tiltZ, ry };
    const r = 0.1 + h * 0.011;
    const trunkH = h * 0.74;
    b.cyl(BIRCH_BARK, r * 0.4, r, trunkH, 0, o);
    for (let k = 0; k < 4; k++) {
      const band = new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.12, 5);
      band.translate(0, h * (0.1 + k * 0.16), 0);
      b.add(band, BIRCH_BAND, o);
    }
    /** Where this stem's axis is at a height, after its lean and its spin. */
    const axis = (at: number): { x: number; y: number; z: number } =>
      swung(-Math.sin(tiltZ) * at, Math.cos(tiltZ) * at, ry);
    const top = axis(trunkH);
    const c = h * 0.13;
    b.blob(BIRCH_LEAF, c, top.x, h * 0.8, top.z, { sy: 1.25 });
    b.blob(BIRCH_LEAF, c * 0.5, top.x + c * 0.3, h * 0.92, top.z - c * 0.3, { sy: 1.1 });
    // Two limbs off the upper trunk, each ending in its own hanging blob.
    for (const [at, angle] of [
      [0.58, ry + 0.9],
      [0.66, ry + 3.6],
    ]) {
      const end = limb(b, BIRCH_BARK, r * 0.25, r * 0.45, h * 0.22, axis(h * at), 0.55, angle, 4);
      b.blob(BIRCH_LEAF, c * 0.75, end.x, end.y - h * weep * 0.4, end.z, { sy: 1.1 });
    }
    // The weeping fringe: the lowest leaves hang well under the crown.
    const drop = h * (0.68 - weep);
    b.blob(BIRCH_LEAF, c * 0.6, top.x + c * 0.9, drop, top.z + c * 0.5, { sy: 1.2 });
    b.blob(BIRCH_LEAF, c * 0.55, top.x - c * 0.8, drop + h * 0.03, top.z - c * 0.7, { sy: 1.2 });
  }
}

/** An aspen: a straight pale trunk and a narrow rounded crown held high —
 * the tree that stands over a birch grove. */
function aspen(b: GeoBuilder, h: number): void {
  const r = 0.12 + h * 0.012;
  const lean = 0.03;
  const trunkH = h * 0.68;
  b.cyl(ASPEN_BARK, r * 0.4, r, trunkH, 0, { tiltZ: lean }, 6);
  const top = onTrunk(lean, trunkH);
  const c = h * 0.13;
  b.blob(ASPEN_LEAF, c * 1.15, top.x, h * 0.8, 0, { sy: 1.3 });
  b.blob(ASPEN_LEAF, c * 0.85, top.x + c * 0.8, h * 0.72, c * 0.3, { sy: 1.1 });
  b.blob(ASPEN_LEAF, c * 0.8, top.x - c * 0.7, h * 0.7, -c * 0.5, { sy: 1.1 });
  b.blob(ASPEN_LEAF, c * 0.7, top.x + c * 0.2, h * 0.6, -c * 0.7);
  b.blob(ASPEN_LEAF, c * 0.55, top.x, h * 0.94, 0);
}

/** The broadleaves with a spreading crown — oak and maple: a short thick
 * bole forking into three limbs, and a wide dome of foliage over them, one
 * blob on each limb's end so the crown is lumpy the way a real one is. */
function broadleaf(
  b: GeoBuilder,
  h: number,
  spread: number,
  leaf: THREE.Color,
  bark: THREE.Color,
  lean: number,
): void {
  const r = 0.14 + h * 0.02;
  const boleH = h * 0.32;
  b.cyl(bark, r * 0.6, r, boleH, 0, { tiltZ: lean }, 6);
  const fork = onTrunk(lean, boleH * 0.95);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + b.random() * 0.7;
    const tilt = 0.45 + b.random() * 0.35;
    const len = h * (0.3 + b.random() * 0.12);
    const end = limb(b, bark, r * 0.22, r * 0.45, len, fork, tilt, angle, 5);
    b.blob(leaf, spread * 0.4, end.x, end.y + spread * 0.1, end.z, { sy: 0.8 });
  }
  b.blob(leaf, spread * 0.55, fork.x, h * 0.68, 0, { sy: 0.8 });
  b.blob(leaf, spread * 0.3, fork.x + spread * 0.15, h * 0.88, -spread * 0.1, { sy: 0.85 });
}

/** A branch broken back to a stub, hinged on the trunk: the box is turned
 * about its own inner end first and carried out to where the trunk's axis
 * actually is at that height (`onTrunk`), whatever the trunk's `lean`.
 * `length` is signed — negative points the stub the other way round the
 * trunk — and `swing` turns it round the trunk. */
function branchStub(
  b: GeoBuilder,
  color: THREE.Color,
  length: number,
  thick: number,
  at: number,
  angle: number,
  lean = 0,
  swing = 0,
): void {
  const geo = new THREE.BoxGeometry(Math.abs(length), thick, thick);
  geo.translate(length / 2, 0, 0);
  geo.rotateZ(angle);
  geo.rotateY(swing);
  const hinge = onTrunk(lean, at);
  geo.translate(hinge.x, hinge.y, hinge.z);
  b.add(geo, color);
}

/** A dead tree still standing: bark gone, tapering to a spike, the branches
 * broken back to stubs. `stubs` is what is left of them — how far up, how
 * long (signed), how steeply, and which way round the trunk. */
function snag(
  b: GeoBuilder,
  h: number,
  r: number,
  lean: number,
  stubs: readonly [at: number, length: number, angle: number, swing: number][],
): void {
  b.cyl(DEAD_WOOD, r * 0.12, r, h, 0, { tiltZ: lean }, 6);
  for (const [at, length, angle, swing] of stubs) {
    branchStub(b, DEAD_WOOD, length, r * 0.3, at, angle, lean, swing);
  }
}

// ── The variant roster ─────────────────────────────────────────────────────

export type VariantDef = { build: (b: GeoBuilder) => void; twoSided?: boolean };

const TAIGA_VARIANTS: Record<string, VariantDef> = {
  // Spruces — the taiga's backbone: dark spires twenty metres and more,
  // and most of what closes the road in on both sides. The mature ones are
  // authored at 19–26 m, so the engine's per-trunk scale (0.5–1.35) stands
  // a wood from ten-metre poles to thirty-metre canopy.
  spruceTall: { build: (b) => spruce(b, 22, 2.8, 7, 0.14, [SPRUCE_DARK, SPRUCE], TRUNK) },
  spruceOld: {
    build: (b) => spruce(b, 26, 3.4, 8, 0.24, [SPRUCE_DARK, SPRUCE], TRUNK_DARK, 0.02, 0.16),
  },
  spruceDark: {
    build: (b) => spruce(b, 20, 2.6, 7, 0.1, [SPRUCE_DARK, SPRUCE_DARK], TRUNK_DARK),
  },
  /** One that grew on the edge of a gap and leaned into the light. */
  spruceLean: {
    build: (b) => spruce(b, 19, 2.5, 6, 0.12, [SPRUCE_DARK, SPRUCE], TRUNK, 0.09, 0.14),
  },
  spruceSnapped: { build: (b) => snappedSpruce(b, 17, 2.6, [SPRUCE_DARK, SPRUCE]) },
  spruceYoung: { build: (b) => spruce(b, 9, 1.9, 5, 0.04, [SPRUCE, SPRUCE_LIGHT], TRUNK) },
  /** The highland spruce: wind-cut, half the height and nearly as wide. */
  spruceSquat: {
    build: (b) => spruce(b, 8.5, 3.2, 5, 0.06, [SPRUCE_DARK, SPRUCE], TRUNK_DARK, 0.05, 0.2),
  },
  /** THE OLD ONE. A spruce nobody ever cut, twice the height of the wood
   * that grew up under it — near forty metres, and up to fifty at the
   * engine's biggest scale. Rare on purpose: every community that carries
   * it does so at a weight of one in a hundred, because a wood that is all
   * giants is just a tall wood, and it is the ONE that makes the rest read
   * as the size they are. */
  spruceGiant: {
    build: (b) => spruce(b, 38, 4.2, 9, 0.3, [SPRUCE_DARK, SPRUCE], TRUNK_DARK, 0.015, 0.14),
  },

  // Pines — bare trunks going orange up high, holding a flat crown up in
  // the light. A mature Scots pine is as tall as the spruces beside it and
  // twice as open.
  pineTall: { build: (b) => pine(b, 24, 0.03, 4, 4.5) },
  pineCrooked: { build: (b) => pine(b, 17, 0.16, 3, 4) },
  /** The old pine of a heath: a table of a crown on six heavy boughs. */
  pineOld: { build: (b) => pine(b, 26, 0.05, 6, 6, 0.45) },
  pineTwin: { build: (b) => twinPine(b, 20) },
  /** The pine that was old when the heath around it was cut for the first
   * time — the spruce giant's counterpart, and as rare. */
  pineGiant: { build: (b) => pine(b, 40, 0.02, 7, 7.5, 0.5) },
  pineYoung: {
    build: (b) => {
      b.cyl(TRUNK_DARK, 0.14, 0.22, 3.6, 0);
      b.cone(PINE_CROWN, 1.7, 2.6, 2.8, {}, 6);
      b.cone(PINE_CROWN, 1.1, 2, 4.4, { ry: 0.4 }, 6);
      b.blob(PINE_CROWN, 0.7, 0.3, 6.2, 0.2);
    },
  },

  // The middle storey. A taiga without it is a lawn with poles on it: the
  // eye needs something between the ground cover's knee height and the
  // canopy's ten metres, and a knee-to-shoulder conifer is the cheapest
  // thing that reads as forest regenerating rather than forest planted.
  spruceSapling: {
    build: (b) => {
      b.cyl(TRUNK, 0.05, 0.08, 0.5, 0);
      b.cone(SPRUCE_LIGHT, 0.55, 1.1, 0.25, {}, 5);
      b.cone(SPRUCE_LIGHT, 0.34, 0.8, 0.85, {}, 5);
    },
  },
  pineSapling: {
    build: (b) => {
      b.cyl(TRUNK_DARK, 0.06, 0.09, 0.7, 0, { tiltZ: 0.06 });
      b.blob(PINE_CROWN, 0.55, 0, 1, 0, { sy: 0.85 });
      b.blob(PINE_CROWN, 0.3, 0.25, 1.45, 0.1);
    },
  },
  /** The bog's own pine: a century old and four metres tall, because
   * nothing grows fast standing in peat. Thin, crooked, mostly bare. */
  bogPine: {
    build: (b) => {
      const LEAN = 0.11;
      b.cyl(TRUNK_DARK, 0.1, 0.19, 3.4, 0, { tiltZ: LEAN });
      const top = onTrunk(LEAN, 3.4);
      const end = limb(b, TRUNK_DARK, 0.06, 0.1, 1.1, onTrunk(LEAN, 2.7), 0.5, Math.PI, 5);
      b.blob(SPRUCE_DARK, 0.75, top.x - 0.15, top.y + 0.3, 0.1, { sy: 0.6 });
      b.blob(SPRUCE_DARK, 0.5, end.x, end.y, end.z, { sy: 0.6 });
      b.blob(SPRUCE_DARK, 0.42, top.x + 0.4, top.y - 0.2, -0.4, { sy: 0.55 });
    },
  },

  // Firs — tighter, bluer spires than the spruces, skirted to the ground.
  firSlim: { build: (b) => spruce(b, 21, 2.6, 9, 0.06, [FIR_DARK, FIR], TRUNK_DARK) },
  firDense: { build: (b) => spruce(b, 16, 2.8, 8, 0.03, [FIR_DARK, FIR], TRUNK, 0, 0.08) },
  firOld: {
    build: (b) => spruce(b, 27, 3.4, 10, 0.2, [FIR_DARK, FIR], TRUNK_DARK, 0.02, 0.12),
  },

  // Broadleaves — the bright accents along water and clearings.
  birch: { build: (b) => birch(b, 16, 1, 0.04) },
  birchPair: { build: (b) => birch(b, 14, 2, 0) },
  birchYoung: { build: (b) => birch(b, 7, 1, 0.1) },
  /** An old birch: taller, and weeping far lower than a young one. */
  birchOld: { build: (b) => birch(b, 20, 1, 0.03, 0.2) },
  /** A birch bent over by a winter's snow load and never straightened —
   * the tree that leans out over every lake and every bank in the north. */
  birchLean: { build: (b) => birch(b, 13, 1, 0.3, 0.1) },
  aspen: { build: (b) => aspen(b, 18) },
  aspenTall: { build: (b) => aspen(b, 24) },
  // Larches — the sparse, pale conifer, its whorls open enough to see the
  // trunk through.
  larch: { build: (b) => spruce(b, 20, 2.6, 5, 0.14, [LARCH, LARCH], TRUNK, 0.02, 0.22) },
  larchOld: {
    build: (b) => spruce(b, 27, 3.6, 6, 0.28, [LARCH, LARCH], TRUNK_DARK, 0.04, 0.24),
  },
  oak: { build: (b) => broadleaf(b, 15, 7, OAK_LEAF, TRUNK_DARK, 0.03) },
  maple: { build: (b) => broadleaf(b, 13, 6, MAPLE_LEAF, TRUNK, 0.04) },
  rowan: {
    build: (b) => {
      const LEAN = 0.08;
      b.cyl(TRUNK, 0.1, 0.17, 4.2, 0, { tiltZ: LEAN });
      const top = onTrunk(LEAN, 4.2);
      b.blob(ROWAN_LEAF, 2, top.x, 5.6, 0, { sy: 0.95 });
      b.blob(ROWAN_LEAF, 1.3, top.x + 1.2, 4.9, 0.6);
      b.blob(ROWAN_LEAF, 1.2, top.x - 1.1, 5.1, -0.7);
      b.blob(ROWAN_BERRY, 0.32, top.x + 0.9, 6.2, 0.6);
      b.blob(ROWAN_BERRY, 0.26, top.x - 1.2, 5.6, -0.5);
      b.blob(ROWAN_BERRY, 0.22, top.x + 0.2, 4.6, 1.3);
    },
  },

  // Shrub layer and the dead wood that keeps a forest honest.
  willowShrub: {
    build: (b) => {
      b.blob(WILLOW, 1.1, 0, 1, 0, { sy: 0.85 });
      b.blob(WILLOW, 0.8, 1, 0.7, 0.5);
      b.blob(WILLOW, 0.7, -0.9, 0.75, -0.4);
      b.blob(WILLOW, 0.6, 0.2, 0.6, -1);
    },
  },
  juniper: {
    build: (b) => {
      b.blob(JUNIPER, 0.9, 0, 0.7, 0, { sy: 0.9 });
      b.cone(JUNIPER, 0.6, 1.4, 0.4, { x: 0.7, tiltZ: 0.2 }, 5);
      b.blob(JUNIPER, 0.55, -0.7, 0.5, 0.3);
    },
  },
  deadSnag: {
    build: (b) =>
      snag(b, 16, 0.42, 0.04, [
        [8.2, 1.9, -0.3, 0.3],
        [10.5, -1.5, 0.35, 2.4],
        [12.4, 1.2, 0.1, 4.2],
      ]),
  },
  /** A giant that died standing: the bark still clinging to its lower
   * third, the top broken out, stubs of boughs as thick as a young tree.
   * The old-growth stands carry one for the same reason they carry the
   * living giant — it is what says how long this wood has been here. */
  deadGiant: {
    build: (b) => {
      const LEAN = 0.02;
      const R = 0.66;
      snag(b, 24, R, LEAN, [
        [9, 2.8, -0.2, 0.6],
        [12.5, -2.2, 0.3, 2.1],
        [15, 2.4, 0.15, 3.9],
        [18, -1.6, 0.5, 5.2],
        [20.5, 1.3, -0.1, 1.4],
      ]);
      b.cyl(TRUNK_DARK, R * 0.86, R * 1.03, 8, 0, { tiltZ: LEAN }, 6);
      const top = onTrunk(LEAN, 23.8);
      b.cone(CUT_WOOD, R * 0.24, 1.4, top.y, { x: top.x + R * 0.1, tiltZ: 0.25 }, 4);
      b.cone(CUT_WOOD, R * 0.16, 0.9, top.y + 0.1, { x: top.x - R * 0.1, tiltZ: -0.3 }, 4);
    },
  },
  stump: {
    build: (b) => {
      b.cyl(TRUNK_DARK, 0.42, 0.5, 0.9, 0);
      b.cyl(CUT_WOOD, 0.4, 0.4, 0.08, 0.9);
      b.blob(MOSS, 0.3, 0.45, 0.25, 0.2, { sy: 0.6 });
    },
  },
  /** A trunk rotted off its stump and lying where it fell. It is CENTRED on
   * its own origin, and that is not cosmetic: the engine plants this one as
   * a solid whose collision circle is the length the trunk covers, centred
   * on the same point (`solidShape`'s `log`). A model hung off one end
   * would put half the wood outside its own collider — a log the car drives
   * through — and the other half of the circle over bare grass. The same
   * goes for `rootLog` below. */
  fallenLog: {
    build: (b) => {
      const log = new THREE.CylinderGeometry(0.26, 0.34, 4.6, 6);
      log.translate(0, 2.3, 0);
      b.add(log, DEAD_WOOD, { x: 2.3, tiltZ: Math.PI / 2 - 0.06 });
      b.blob(MOSS, 0.35, 0.1, 0.5, 0.1, { sy: 0.5 });
    },
  },
  /** The same trunk, but blown over rather than rotted off: the root plate
   * came up with it and stands on end at the butt. That disc is the whole
   * point — a flat circle two metres across, side-on to a car coming past,
   * is a silhouette a scattering of small props can never buy. */
  rootLog: {
    build: (b) => {
      const log = new THREE.CylinderGeometry(0.24, 0.4, 5.2, 6);
      log.translate(0, 2.6, 0);
      // Centred on the trunk, so the bole fills the collision circle it was
      // planted with (see fallenLog) and the plate stands at the butt end of
      // it rather than in the middle of the road.
      b.add(log, DEAD_WOOD, { x: 2.6, tiltZ: Math.PI / 2 - 0.1 });
      // The plate's top has to stay under the engine's collision height for
      // a rooted trunk (1.9 × size), or a car clears the prop and drives
      // through the disc it can see.
      const plate = new THREE.CylinderGeometry(0.95, 1.05, 0.34, 7);
      plate.rotateZ(Math.PI / 2);
      plate.translate(0, 0.8, 0);
      b.add(plate, TRUNK_DARK, { x: 2.7, tiltZ: 0.2 });
      b.cyl(TRUNK_DARK, 0.07, 0.11, 0.8, 0.7, { x: 2.9, tiltZ: -0.9 });
      b.cyl(TRUNK_DARK, 0.06, 0.1, 0.7, 1.2, { x: 2.8, tiltZ: 1.1 });
      b.blob(MOSS, 0.3, 0.2, 0.45, 0.15, { sy: 0.5 });
    },
  },
  /** Snapped off in a gale at chest height, splinters still standing. */
  brokenTrunk: {
    build: (b) => {
      const LEAN = 0.03;
      b.cyl(DEAD_WOOD, 0.34, 0.5, 4.6, 0, { tiltZ: LEAN });
      const top = onTrunk(LEAN, 4.5);
      b.cone(CUT_WOOD, 0.3, 1.1, top.y, { x: top.x + 0.06, tiltZ: 0.16 }, 4);
      b.cone(CUT_WOOD, 0.18, 0.7, top.y + 0.05, { x: top.x - 0.16, tiltZ: -0.3 }, 4);
    },
  },
  /** A dead stem that came down and never reached the ground — it is
   * leaning on whatever caught it. Reads as depth: one diagonal through a
   * wood of verticals. */
  leaningSnag: {
    build: (b) =>
      snag(b, 13, 0.34, 0.42, [
        [5.5, 1.5, -0.1, 0.8],
        [8, -1.1, 0.3, 3.9],
      ]),
  },
  /** A branch down in the moss — the litter a real forest floor is made
   * of, and the one piece of dead wood small enough to plant in numbers. */
  fallenBranch: {
    build: (b) => {
      const stick = new THREE.CylinderGeometry(0.06, 0.09, 2.4, 4);
      stick.translate(0, 1.2, 0);
      b.add(stick, DEAD_WOOD, { tiltZ: Math.PI / 2 - 0.05 });
      b.cyl(DEAD_WOOD, 0.03, 0.05, 0.7, 0.1, { x: 0.4, ry: 0.9, tiltZ: 1.2 });
      b.cyl(DEAD_WOOD, 0.03, 0.04, 0.5, 0.08, { x: -0.5, ry: -0.7, tiltZ: -1.3 });
    },
  },

  // The water's edge. A lake that stops at a line is the tell that it was
  // drawn on; these are what turn that line into a bank.
  reeds: {
    twoSided: true,
    build: (b) => {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + (i % 3) * 0.4;
        b.blade(REED, REED_TIP, 0.09, 1.5 + (i % 4) * 0.35, {
          ry: a,
          tiltZ: 0.1 + (i % 3) * 0.12,
          x: Math.cos(a) * 0.22,
          z: Math.sin(a) * 0.22,
        });
      }
    },
  },
  sedgeTuft: {
    twoSided: true,
    build: (b) => {
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        b.blade(SEDGE, SEDGE_TIP, 0.07, 0.55 + (i % 3) * 0.2, {
          ry: a,
          tiltZ: 0.55 + (i % 4) * 0.22,
          x: Math.cos(a) * 0.16,
          z: Math.sin(a) * 0.16,
        });
      }
    },
  },
  /** Bog cotton: the seed heads are the read, not the stems — a scatter of
   * white dots over dark peat says wet ground from a hundred metres. */
  cottonGrass: {
    twoSided: true,
    build: (b) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const x = Math.cos(a) * 0.2;
        const z = Math.sin(a) * 0.2;
        b.blade(SEDGE, SEDGE, 0.03, 0.6, { ry: a, tiltZ: 0.12, x, z });
        b.blob(COTTON, 0.09, x, 0.62, z, { sy: 1.3 });
      }
    },
  },
  /** Bleached wood washed up at the waterline. */
  driftwood: {
    build: (b) => {
      const limb = new THREE.CylinderGeometry(0.1, 0.16, 3, 5);
      limb.translate(0, 1.5, 0);
      b.add(limb, DRIFTWOOD, { tiltZ: Math.PI / 2 - 0.14 });
      b.cyl(DRIFTWOOD, 0.05, 0.09, 1, 0.15, { x: 1.1, ry: 0.6, tiltZ: -1 });
      b.cyl(DRIFTWOOD, 0.04, 0.07, 0.8, 0.1, { x: 0.7, ry: -1.2, tiltZ: 1.15 });
    },
  },

  /** The cut timber a forestry block leaves stacked at the roadside for the
   * lorry. Drawn for the engine's `timber` prop, which is why it is solid —
   * a two-metre wall of butt ends is exactly the kind of thing a rally car
   * should not be able to drive through. Everything here is posed in
   * GEOMETRY space and added with no opts: the builder's `ry`/`tiltZ` pivot
   * a part around its own base and compose as one Euler, which is right for
   * a leaning trunk and wrong for laying a cylinder on its side and then
   * placing it — that comes out as a single slab.
   *
   * The dimensions answer to the engine's prop: a stack has to sit inside a
   * collision circle of 2.6 × size and stand no taller than 1.9 × size, or
   * the car drives through timber it can see. */
  logPile: {
    build: (b) => {
      const R = 0.25;
      const LEN = 4.4;
      const ROWS = 4;
      const RISE = R * 1.7;
      /** A log lying along X — the axis the stack runs down. */
      const log = (radius: number, len: number, y: number, z: number): THREE.CylinderGeometry => {
        const geo = new THREE.CylinderGeometry(radius, radius * 1.05, len, 6);
        geo.rotateZ(Math.PI / 2);
        geo.translate(0, y, z);
        return geo;
      };
      // Two bearers ACROSS the stack, holding the bottom course off the wet
      // ground the way a real stack is built.
      for (const x of [-1.5, 1.5]) {
        const bearer = new THREE.CylinderGeometry(0.15, 0.15, 2.9, 5);
        bearer.rotateX(Math.PI / 2);
        bearer.translate(x, 0.15, 0);
        b.add(bearer, TRUNK_DARK);
      }
      for (let row = 0; row < ROWS; row++) {
        // One log narrower each course, so it reads as a pile rather than
        // as a crate.
        const across = 5 - row;
        const y = 0.3 + row * RISE;
        for (let k = 0; k < across; k++) {
          const z = (k - (across - 1) / 2) * R * 2.05;
          b.add(log(R, LEN, y, z), row % 2 === 0 ? TRUNK : TRUNK_DARK);
          // The sawn ends, which is what a stack is READ by: pale discs in
          // a rough grid, facing whoever comes past.
          for (const end of [-1, 1]) {
            const face = new THREE.CylinderGeometry(R * 0.94, R * 0.94, 0.06, 6);
            face.rotateZ(Math.PI / 2);
            face.translate((end * LEN) / 2, y, z);
            b.add(face, CUT_WOOD);
          }
        }
      }
    },
  },

  // Ground cover — drawn double-sided, the blades are single quads.
  tallGrass: {
    twoSided: true,
    build: (b) => {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.blade(GRASS_BASE, GRASS_TIP, 0.1, 0.75 + (i % 3) * 0.18, {
          ry: a + i * 0.7,
          tiltZ: 0.35 + (i % 2) * 0.2,
          x: Math.cos(a) * 0.12,
          z: Math.sin(a) * 0.12,
        });
      }
    },
  },
  fern: {
    twoSided: true,
    build: (b) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.blade(FERN, FERN_TIP, 0.22, 0.9, {
          ry: a,
          tiltZ: 0.9 + (i % 2) * 0.25,
          x: Math.cos(a) * 0.05,
          z: Math.sin(a) * 0.05,
        });
      }
    },
  },
  largeFern: {
    twoSided: true,
    build: (b) => {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + (i % 2) * 0.3;
        b.blade(FERN, FERN_TIP, 0.4, 2, {
          ry: a,
          tiltZ: 0.8 + (i % 3) * 0.2,
          x: Math.cos(a) * 0.08,
          z: Math.sin(a) * 0.08,
        });
      }
      b.blade(FERN, FERN_TIP, 0.34, 1.6, { tiltZ: 0.15 });
    },
  },
  heathShrub: {
    build: (b) => {
      b.blob(HEATH, 0.4, 0, 0.3, 0, { sy: 0.7 });
      b.blob(HEATH, 0.3, 0.45, 0.22, 0.2, { sy: 0.7 });
      b.blob(HEATH_BLOOM, 0.22, -0.35, 0.28, -0.15, { sy: 0.7 });
    },
  },
  /** A cushion of moss over a stone or a root. Ankle-high and wide — it is
   * not meant to be looked at, it is meant to stop the ground between the
   * trunks being a bare colour field. */
  mossPatch: {
    build: (b) => {
      b.blob(GROUND_MOSS, 0.75, 0, 0.16, 0, { sy: 0.22 });
      b.blob(GROUND_MOSS, 0.5, 0.7, 0.13, 0.35, { sy: 0.22 });
      b.blob(MOSS, 0.42, -0.55, 0.12, -0.45, { sy: 0.22 });
    },
  },
  /** Lingonberry: dark evergreen leaves and the one saturated red the
   * forest floor has to offer. */
  berryBush: {
    build: (b) => {
      b.blob(BERRY_LEAF, 0.34, 0, 0.26, 0, { sy: 0.8 });
      b.blob(BERRY_LEAF, 0.26, 0.36, 0.22, -0.2, { sy: 0.8 });
      b.blob(BERRY, 0.1, 0.1, 0.44, 0.22);
      b.blob(BERRY, 0.08, -0.24, 0.38, -0.1);
    },
  },
  /** Dwarf birch and bog myrtle: knee-high, grey-green, and the only thing
   * standing over most of a bog. */
  bogShrub: {
    build: (b) => {
      b.blob(BOG_SHRUB, 0.45, 0, 0.34, 0, { sy: 0.75 });
      b.blob(BOG_SHRUB, 0.32, 0.5, 0.26, 0.28, { sy: 0.75 });
      b.blob(BOG_SHRUB, 0.28, -0.42, 0.3, -0.3, { sy: 0.75 });
    },
  },

  // ── The wetlands ────────────────────────────────────────────────────────
  // What makes a sheet of water read as a swamp rather than as a blue plane.
  // The water itself carries almost none of it: what says "wet" is the stuff
  // standing IN it and leaning OVER it, and every one of these exists only
  // at a waterline.

  /** WILLOW: the tree of wet ground everywhere in the north. Short, thick,
   * always leaning out over the water, with a crown that hangs rather than
   * stands — the droop is the whole silhouette, so the crown blobs sit low
   * and wide and the outer ones hang below the ones inboard of them. */
  willow: {
    build: (b) => {
      const LEAN = 0.22;
      b.cyl(WILLOW_BARK, 0.3, 0.55, 4.4, 0, { tiltZ: LEAN });
      const top = onTrunk(LEAN, 4.4);
      // The second stem forks off the leaning trunk and leans further
      // still, the way a willow follows the light over the water.
      const fork = limb(b, WILLOW_BARK, 0.14, 0.26, 2.4, onTrunk(LEAN, 3.2), 0.5, Math.PI, 5);
      b.blob(WILLOW, 2.8, top.x - 0.4, top.y + 0.6, 0, { sy: 0.62 });
      b.blob(WILLOW_PALE, 1.9, top.x + 2, top.y - 0.2, 0.6, { sy: 0.7 });
      b.blob(WILLOW, 1.7, fork.x, fork.y + 0.2, fork.z - 0.5, { sy: 0.75 });
      // The hanging fringe: the lowest leaves are nearly at head height.
      b.blob(WILLOW, 1.2, top.x + 2.8, 2.6, 0, { sy: 0.95 });
      b.blob(WILLOW_PALE, 1, fork.x - 0.8, 2.4, 0.8, { sy: 1 });
    },
  },
  /** A young willow, or one cut back: multi-stemmed from the base, which is
   * what a willow does when it is browsed or coppiced. */
  willowYoung: {
    build: (b) => {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.cyl(WILLOW_BARK, 0.09, 0.14, 1.9, 0, {
          x: Math.cos(a) * 0.18,
          z: Math.sin(a) * 0.18,
          tiltZ: 0.18 + (i % 2) * 0.14,
          ry: a,
        });
      }
      b.blob(WILLOW, 1.2, 0, 2.2, 0, { sy: 0.7 });
      b.blob(WILLOW_PALE, 0.85, 0.9, 1.9, 0.4, { sy: 0.8 });
    },
  },
  /** ALDER: the other wet-ground tree, and the one that actually stands in
   * the water rather than beside it. Dark, flat-topped, several stems from
   * one stool — a black alder carr is a wall of them along a shore. */
  alder: {
    build: (b) => {
      // Two stems from one stool, each with its own flat-topped crown.
      const stems: [lean: number, ry: number, h: number][] = [
        [0.05, 0, 12],
        [-0.16, 1.2, 9.5],
      ];
      for (const [lean, ry, h] of stems) {
        const r = 0.08 + h * 0.014;
        const trunkH = h * 0.7;
        b.cyl(ALDER_BARK, r * 0.45, r, trunkH, 0, { tiltZ: lean, ry });
        const top = swung(-Math.sin(lean) * trunkH, Math.cos(lean) * trunkH, ry);
        const c = h * 0.16;
        b.blob(ALDER_LEAF, c, top.x, h * 0.78, top.z, { sy: 0.72 });
        b.blob(ALDER_LEAF, c * 0.75, top.x + c * 0.7, h * 0.68, top.z + c * 0.3, { sy: 0.7 });
        b.blob(ALDER_LEAF, c * 0.7, top.x - c * 0.6, h * 0.7, top.z - c * 0.4, { sy: 0.7 });
      }
    },
  },
  /** A DROWNED TRUNK: a tree the water rose around and killed, still
   * standing in it years later, bark gone and branches broken back to
   * stubs. One of these in open water is worth more than any amount of
   * reed — it is the single thing that says this water is OLD. */
  drownedTrunk: {
    build: (b) => {
      b.cyl(DROWNED, 0.11, 0.3, 4.2, 0, { tiltZ: 0.09 });
      branchStub(b, DROWNED, 1.1, 0.11, 2.9, -0.42, 0.09);
      branchStub(b, DROWNED, -0.8, 0.09, 3.6, 0.5, 0.09, 0.08);
    },
  },
  /** BULRUSH / cattail: reeds with the brown seed head. Taller and stiffer
   * than the reed bed and read from much further off, because the heads are
   * a colour nothing else at a waterline has. */
  bulrush: {
    twoSided: true,
    build: (b) => {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + (i % 2) * 0.5;
        const x = Math.cos(a) * 0.2;
        const z = Math.sin(a) * 0.2;
        const h = 1.7 + (i % 3) * 0.3;
        b.blade(REED, REED_TIP, 0.08, h, { ry: a, tiltZ: 0.07 + (i % 3) * 0.08, x, z });
        if (i % 2 === 0) b.blob(BULRUSH_HEAD, 0.075, x, h * 0.92, z, { sy: 2.6 });
      }
    },
  },
  /** A TUSSOCK: the raised hummock of sedge a bog surface is actually made
   * of. Standing water between them, a foot of dry-ish peat on top of each,
   * and a car crossing a bog rides the tussocks rather than the water. */
  tussock: {
    twoSided: true,
    build: (b) => {
      b.blob(SPHAGNUM_RUST, 0.55, 0, 0.2, 0, { sy: 0.5 });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        b.blade(SEDGE, SEDGE_TIP, 0.055, 0.5 + (i % 3) * 0.18, {
          ry: a,
          tiltZ: 0.7 + (i % 4) * 0.2,
          x: Math.cos(a) * 0.24,
          z: Math.sin(a) * 0.34,
        });
      }
    },
  },
  /** SPHAGNUM: the bog moss carpet — brighter, wetter and yellower than the
   * cushion moss of a spruce wood, and rusting to orange wherever the bog
   * is drying out. Laid flat and wide: this is a floor, not an object. */
  bogMoss: {
    build: (b) => {
      b.blob(SPHAGNUM, 0.95, 0, 0.13, 0, { sy: 0.16 });
      b.blob(SPHAGNUM_RUST, 0.6, 0.8, 0.11, 0.4, { sy: 0.16 });
      b.blob(SPHAGNUM, 0.55, -0.7, 0.12, -0.5, { sy: 0.16 });
    },
  },
  /** WATER LILY pads: flat discs on the surface with the odd bloom. They
   * only work on still water, which is exactly the point — a scatter of
   * these says the water is not going anywhere. */
  waterLily: {
    twoSided: true,
    build: (b) => {
      b.blob(LILY_PAD, 0.42, 0, 0.03, 0, { sy: 0.06 });
      b.blob(LILY_PAD, 0.3, 0.7, 0.03, 0.35, { sy: 0.06 });
      b.blob(LILY_PAD, 0.26, -0.55, 0.03, 0.6, { sy: 0.06 });
      b.blob(LILY_BLOOM, 0.11, 0.2, 0.08, -0.5, { sy: 0.7 });
    },
  },
};

/** Everything plantable, every country's roster in one table: the ids a
 * biome's mixes name, and the one place `buildFlora` looks them up. Two
 * countries may not spell a species the same way — a `yucca` is a yucca —
 * so the merge is checked for collisions at import. */
export const VARIANTS: Record<string, VariantDef> = { ...TAIGA_VARIANTS, ...DESERT_VARIANTS };
for (const id of Object.keys(DESERT_VARIANTS)) {
  if (id in TAIGA_VARIANTS) throw new Error(`flora variant "${id}" is in two rosters`);
}
