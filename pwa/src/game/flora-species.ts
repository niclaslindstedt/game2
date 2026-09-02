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
// Nothing here is bigger than it needs to be — the silhouette does the
// work, and everything is seen at eighty miles an hour.

import * as THREE from "three";

import {
  GeoBuilder,
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

/** The spruce/larch family: a trunk with stacked cone skirts that shrink
 * toward the tip. `bare` is the leafless trunk fraction at the bottom. */
function conifer(
  b: GeoBuilder,
  h: number,
  w: number,
  layers: number,
  leaf: THREE.Color,
  trunk: THREE.Color,
  bare: number,
): void {
  b.cyl(trunk, 0.16, 0.05 + h * 0.022, h * (bare + 0.25), 0);
  const crownBase = h * bare;
  const crownH = h - crownBase;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = w * (1 - t * 0.72);
    const coneH = (crownH / layers) * 1.9;
    b.cone(leaf, r, coneH, crownBase + crownH * t, {}, 6);
  }
}

/** The birch family: one or more pale banded trunks with loose leaf blobs. */
function birchTree(b: GeoBuilder, h: number, stems: number, lean: number): void {
  for (let s = 0; s < stems; s++) {
    const tiltZ = stems === 1 ? lean : (s - (stems - 1) / 2) * 0.22 + lean;
    const o = { tiltZ, ry: s * 2.4 };
    const r = 0.14 + h * 0.008;
    b.cyl(BIRCH_BARK, r * 0.7, r, h * 0.72, 0, o);
    for (let k = 0; k < 3; k++) {
      const bandGeo = new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.14, 5);
      bandGeo.translate(0, h * (0.16 + k * 0.2), 0);
      b.add(bandGeo, BIRCH_BAND, o);
    }
    const top = Math.sin(tiltZ) * -h * 0.6;
    b.blob(BIRCH_LEAF, h * 0.22, top, h * 0.78, 0, { sy: 1.15 });
    b.blob(BIRCH_LEAF, h * 0.15, top + h * 0.12, h * 0.62, h * 0.08);
    b.blob(BIRCH_LEAF, h * 0.14, top - h * 0.1, h * 0.66, -h * 0.07);
  }
}

/** A Scots pine: tall bare trunk turning orange up high, umbrella crown. */
function pineTree(b: GeoBuilder, h: number, crook: number, crownX: number): void {
  const lowH = h * 0.42;
  b.cyl(TRUNK_DARK, 0.24, 0.34, lowH, 0, { tiltZ: crook });
  const jointX = Math.sin(crook) * -lowH;
  const upGeo = new THREE.CylinderGeometry(0.15, 0.24, h * 0.38, 5);
  upGeo.translate(0, lowH * 0.98 + (h * 0.38) / 2, 0);
  b.add(upGeo, PINE_BARK, { x: jointX, tiltZ: -crook * 1.6 });
  const cx = jointX + crownX;
  const cy = h * 0.74;
  b.cone(PINE_CROWN, h * 0.2, h * 0.16, cy, { x: cx }, 6);
  b.cone(PINE_CROWN, h * 0.15, h * 0.14, cy + h * 0.1, { x: cx + h * 0.05 }, 6);
  b.blob(PINE_CROWN, h * 0.11, cx - h * 0.09, cy + h * 0.06, h * 0.06);
}

/** A branch broken back to a stub, HINGED ON THE TRUNK.
 *
 * `GeoBuilder.add` turns a part about the model's origin, not about itself,
 * so a stub translated out to where it joins the trunk and then tilted
 * swings clean off it: at five metres up, a third of a radian throws the
 * stub two metres sideways, and what the player sees is a stick hanging in
 * the air beside the tree. (`pineTree` has always corrected for the same
 * rotation with its `jointX`; the snags did not.) Rotating the box about
 * its own inner end FIRST and translating afterwards puts the joint where
 * the joint is, whatever the angle.
 *
 * `length` is signed — negative points the stub the other way round the
 * trunk. `at` is the height it grows from and `lean` the trunk's own tilt,
 * so the stub follows a trunk that is not upright. */
function branchStub(
  b: GeoBuilder,
  color: THREE.Color,
  length: number,
  thick: number,
  at: number,
  angle: number,
  lean = 0,
  z = 0,
): void {
  const geo = new THREE.BoxGeometry(Math.abs(length), thick, thick);
  geo.translate(length / 2, 0, 0);
  geo.rotateZ(angle);
  // Where the trunk's axis actually is at that height: `add` swings the
  // trunk about the origin too, so a leaning one is no longer at x = 0.
  geo.translate(-Math.tan(lean) * at, at, z);
  b.add(geo, color);
}

// ── The variant roster ─────────────────────────────────────────────────────

export type VariantDef = { build: (b: GeoBuilder) => void; twoSided?: boolean };

export const VARIANTS: Record<string, VariantDef> = {
  // Spruces — the taiga's backbone, dark spires at every height.
  spruceTall: { build: (b) => conifer(b, 12, 2.3, 4, SPRUCE, TRUNK, 0.16) },
  spruceOld: { build: (b) => conifer(b, 16, 2.5, 5, SPRUCE_DARK, TRUNK_DARK, 0.24) },
  spruceYoung: { build: (b) => conifer(b, 4.5, 1.5, 3, SPRUCE_LIGHT, TRUNK, 0.08) },
  spruceSquat: { build: (b) => conifer(b, 6.5, 3.1, 4, SPRUCE, TRUNK_DARK, 0.1) },
  spruceDark: { build: (b) => conifer(b, 10, 2.1, 4, SPRUCE_DARK, TRUNK_DARK, 0.18) },

  // Pines — bare orange trunks holding their green up in the light.
  pineTall: { build: (b) => pineTree(b, 13, 0.03, 0) },
  pineCrooked: { build: (b) => pineTree(b, 10, 0.2, 0.7) },
  pineYoung: {
    build: (b) => {
      b.cyl(TRUNK_DARK, 0.14, 0.2, 2.6, 0);
      b.cone(PINE_CROWN, 1.3, 1.8, 2.2, {}, 6);
      b.blob(PINE_CROWN, 0.7, 0.3, 4.2, 0.2);
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
      b.cyl(TRUNK_DARK, 0.1, 0.19, 3.1, 0, { tiltZ: 0.11 });
      b.cyl(TRUNK_DARK, 0.07, 0.1, 0.9, 2.9, { x: -0.34, tiltZ: -0.22 });
      b.blob(SPRUCE_DARK, 0.75, -0.5, 3.5, 0.1, { sy: 0.6 });
      b.blob(SPRUCE_DARK, 0.5, 0.35, 3, -0.3, { sy: 0.6 });
      b.blob(SPRUCE_DARK, 0.42, -0.2, 4, 0.4, { sy: 0.55 });
    },
  },

  // Firs — tighter, bluer spires than the spruces.
  firSlim: { build: (b) => conifer(b, 11, 1.6, 6, FIR, TRUNK_DARK, 0.12) },
  firDense: { build: (b) => conifer(b, 8, 2.6, 5, FIR, TRUNK, 0.06) },

  // Broadleaves — the bright accents along water and clearings.
  birch: { build: (b) => birchTree(b, 7, 1, 0.05) },
  birchPair: { build: (b) => birchTree(b, 6, 2, 0) },
  birchYoung: { build: (b) => birchTree(b, 3.8, 1, 0.12) },
  aspen: {
    build: (b) => {
      b.cyl(ASPEN_BARK, 0.16, 0.26, 5.2, 0);
      b.blob(ASPEN_LEAF, 2.1, 0, 6.1, 0, { sy: 1.2 });
      b.blob(ASPEN_LEAF, 1.2, 0.9, 7.6, 0.5);
    },
  },
  larch: { build: (b) => conifer(b, 9, 2, 4, LARCH, TRUNK, 0.14) },
  larchOld: { build: (b) => conifer(b, 13, 2.4, 5, LARCH, TRUNK_DARK, 0.22) },
  oak: {
    build: (b) => {
      b.cyl(TRUNK_DARK, 0.3, 0.46, 3.4, 0);
      b.cyl(TRUNK_DARK, 0.14, 0.22, 2.2, 2.8, { x: 0.2, tiltZ: 0.55 });
      b.cyl(TRUNK_DARK, 0.14, 0.22, 2, 3, { x: -0.2, tiltZ: -0.5 });
      b.blob(OAK_LEAF, 2.4, 0, 5.6, 0, { sy: 0.8 });
      b.blob(OAK_LEAF, 1.7, 2, 4.8, 0.6, { sy: 0.8 });
      b.blob(OAK_LEAF, 1.7, -1.9, 5, -0.5, { sy: 0.8 });
      b.blob(OAK_LEAF, 1.3, 0.4, 6.8, -0.9);
    },
  },
  maple: {
    build: (b) => {
      b.cyl(TRUNK, 0.18, 0.3, 3.2, 0, { tiltZ: 0.04 });
      b.blob(MAPLE_LEAF, 2, 0, 5, 0, { sy: 1.05 });
      b.blob(MAPLE_LEAF, 1.4, 1.3, 4.2, 0.5);
      b.blob(MAPLE_LEAF, 1.3, -1.2, 4.4, -0.6);
    },
  },
  rowan: {
    build: (b) => {
      b.cyl(TRUNK, 0.12, 0.18, 2.8, 0, { tiltZ: 0.08 });
      b.blob(ROWAN_LEAF, 1.5, -0.2, 3.6, 0, { sy: 0.9 });
      b.blob(ROWAN_BERRY, 0.28, 0.7, 3.9, 0.5);
      b.blob(ROWAN_BERRY, 0.22, -0.9, 3.4, -0.4);
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
    build: (b) => {
      b.cyl(DEAD_WOOD, 0.05, 0.38, 8, 0, { tiltZ: 0.04 });
      branchStub(b, DEAD_WOOD, 1.6, 0.14, 4.6, -0.3, 0.04);
      branchStub(b, DEAD_WOOD, -1.2, 0.12, 5.8, 0.4, 0.04, 0.1);
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
      b.cyl(DEAD_WOOD, 0.3, 0.44, 2.9, 0, { tiltZ: 0.03 });
      b.cone(CUT_WOOD, 0.28, 0.8, 2.8, { x: 0.06, tiltZ: 0.16 }, 4);
      b.cone(CUT_WOOD, 0.16, 0.5, 2.85, { x: -0.16, tiltZ: -0.3 }, 4);
    },
  },
  /** A dead stem that came down and never reached the ground — it is
   * leaning on whatever caught it. Reads as depth: one diagonal through a
   * wood of verticals. */
  leaningSnag: {
    build: (b) => {
      b.cyl(DEAD_WOOD, 0.11, 0.3, 9, 0, { tiltZ: 0.42 });
      branchStub(b, DEAD_WOOD, 1.3, 0.13, 3.6, -0.1, 0.42);
    },
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
      b.cyl(WILLOW_BARK, 0.34, 0.55, 3.4, 0, { tiltZ: 0.22 });
      b.cyl(WILLOW_BARK, 0.16, 0.26, 1.8, 2.6, { x: -0.8, tiltZ: 0.5 });
      b.blob(WILLOW, 2.5, -0.5, 4.1, 0, { sy: 0.62 });
      b.blob(WILLOW_PALE, 1.7, 1.5, 3.5, 0.6, { sy: 0.7 });
      b.blob(WILLOW, 1.5, -2.1, 3.2, -0.5, { sy: 0.75 });
      // The hanging fringe: the lowest leaves are nearly at head height.
      b.blob(WILLOW, 1.1, 2.4, 2.4, 0, { sy: 0.95 });
      b.blob(WILLOW_PALE, 0.9, -2.6, 2.2, 0.8, { sy: 1 });
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
      b.cyl(ALDER_BARK, 0.16, 0.24, 5.5, 0, { tiltZ: 0.05 });
      b.cyl(ALDER_BARK, 0.12, 0.19, 4.6, 0, { x: 0.5, tiltZ: -0.16 });
      b.blob(ALDER_LEAF, 1.7, 0.1, 5.6, 0, { sy: 0.72 });
      b.blob(ALDER_LEAF, 1.3, 1.1, 4.9, 0.5, { sy: 0.7 });
      b.blob(ALDER_LEAF, 1.1, -0.9, 5.1, -0.4, { sy: 0.7 });
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
