// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The flora library: every tree, shrub and ground-cover model the scenery
// can plant, built low-poly from cones, cylinders, boxes and icosahedra,
// merged into one vertex-colored geometry per variant and drawn as one
// InstancedMesh per variant. The look follows the world's rules — chunky
// facets, saturated vertex colors under Lambert light, a nearest-filtered
// speckle map for grain — so a forest of thousands stays a handful of
// draw calls. Which variants a stage plants, and where, is the biome's
// (biome.ts) and the placement code's (world.ts, wild.ts) business; this
// module only knows how each plant is shaped.

import * as THREE from "three";
import { createRng } from "@engine";

import { detailTexture } from "./textures.ts";

// ── The taiga paint box ────────────────────────────────────────────────────
export const TRUNK_COLOR = 0x7a4f2a;
const TRUNK = new THREE.Color(TRUNK_COLOR);
const TRUNK_DARK = new THREE.Color(0x5f3d20);
const PINE_BARK = new THREE.Color(0xa5683a); // Scots pine's orange upper bark
const BIRCH_BARK = new THREE.Color(0xe8e4da);
const BIRCH_BAND = new THREE.Color(0x3a3a38);
const ASPEN_BARK = new THREE.Color(0xb4bba4);
const DEAD_WOOD = new THREE.Color(0x8f857a);
const CUT_WOOD = new THREE.Color(0xc9b892); // the pale face of a fresh cut

const SPRUCE = new THREE.Color(0x2e6b38);
const SPRUCE_DARK = new THREE.Color(0x1f4d2a);
const SPRUCE_LIGHT = new THREE.Color(0x3f8347);
const PINE_CROWN = new THREE.Color(0x4c9a52);
const FIR = new THREE.Color(0x2f6b4f); // the bluish cast firs carry
const BIRCH_LEAF = new THREE.Color(0x8cc257);
const ASPEN_LEAF = new THREE.Color(0x9cc44e);
const LARCH = new THREE.Color(0x93ac3e); // deciduous needles, yellow-green
const WILLOW = new THREE.Color(0x6da157);
const JUNIPER = new THREE.Color(0x2b5e33);
const ROWAN_LEAF = new THREE.Color(0x6fae4a);
const ROWAN_BERRY = new THREE.Color(0xe05a2b);
const OAK_LEAF = new THREE.Color(0x4e7d31);
const MAPLE_LEAF = new THREE.Color(0x74a23c);
const MOSS = new THREE.Color(0x90a84f);

const GRASS_BASE = new THREE.Color(0x4a7a28);
const GRASS_TIP = new THREE.Color(0x9ac74e);
const FERN = new THREE.Color(0x2f6b2f);
const FERN_TIP = new THREE.Color(0x529440);
const HEATH = new THREE.Color(0x5a7034);
const HEATH_BLOOM = new THREE.Color(0x6b4f56); // a heather-purple dusting

type PartOpts = {
  x?: number;
  z?: number;
  /** Spin around the part's own base, radians. */
  ry?: number;
  /** Lean from the base, radians — how trunks crook and blades splay. */
  tiltX?: number;
  tiltZ?: number;
  sx?: number;
  sy?: number;
  sz?: number;
};

/** Accumulates transformed primitives into one non-indexed vertex-colored
 * geometry. Every part gets a per-facet brightness jitter so big single
 * color fields still read as foliage, not plastic. */
class GeoBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  constructor(private readonly rand: () => number) {}

  /** Merge `geo` in (and dispose it). `color` is a single tint, or a
   * bottom→top pair blended along the part's local height. */
  add(
    geo: THREE.BufferGeometry,
    color: THREE.Color | [THREE.Color, THREE.Color],
    o: PartOpts = {},
  ): void {
    const src = geo.toNonIndexed();
    src.computeBoundingBox();
    const box = src.boundingBox as THREE.Box3;
    const spanY = Math.max(box.max.y - box.min.y, 1e-6);
    const minY = box.min.y;
    const grad = Array.isArray(color);

    this.e.set(o.tiltX ?? 0, o.ry ?? 0, o.tiltZ ?? 0);
    this.q.setFromEuler(this.e);
    this.m.compose(
      new THREE.Vector3(o.x ?? 0, 0, o.z ?? 0),
      this.q,
      new THREE.Vector3(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1),
    );

    const pos = src.getAttribute("position") as THREE.BufferAttribute;
    const preY: number[] = [];
    for (let i = 0; i < pos.count; i++) preY.push(pos.getY(i));
    src.applyMatrix4(this.m);
    const nor = src.getAttribute("normal") as THREE.BufferAttribute;
    const uv = src.getAttribute("uv") as THREE.BufferAttribute | undefined;

    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const jitter = 0.9 + this.rand() * 0.2;
      for (let k = 0; k < 3; k++) {
        const v = i + k;
        this.positions.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        this.normals.push(nor.getX(v), nor.getY(v), nor.getZ(v));
        this.uvs.push(uv ? uv.getX(v) : 0, uv ? uv.getY(v) : 0);
        if (grad) c.copy(color[0]).lerp(color[1], (preY[v] - minY) / spanY);
        else c.copy(color);
        c.multiplyScalar(jitter);
        this.colors.push(c.r, c.g, c.b);
      }
    }
    src.dispose();
    geo.dispose();
  }

  /** A cone standing on its base at local y = `baseY`. */
  cone(color: THREE.Color, r: number, h: number, baseY: number, o: PartOpts = {}, seg = 6): void {
    const geo = new THREE.ConeGeometry(r, h, seg);
    geo.translate(0, baseY + h / 2, 0);
    this.add(geo, color, o);
  }

  /** A cylinder standing on its base at local y = `baseY`. */
  cyl(
    color: THREE.Color,
    rTop: number,
    rBot: number,
    h: number,
    baseY: number,
    o: PartOpts = {},
    seg = 5,
  ): void {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    geo.translate(0, baseY + h / 2, 0);
    this.add(geo, color, o);
  }

  /** A faceted foliage blob centered at (x, y, z). Squash is baked into
   * the geometry before the lift so `sy` never scales the offset itself. */
  blob(color: THREE.Color, r: number, x: number, y: number, z: number, o: PartOpts = {}): void {
    const geo = new THREE.IcosahedronGeometry(r, 0);
    geo.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    geo.translate(0, y, 0);
    this.add(geo, color, { ...o, x, z, sx: 1, sy: 1, sz: 1 });
  }

  /** A grass/fern blade: a thin quad hinged at the ground. */
  blade(bottom: THREE.Color, top: THREE.Color, w: number, h: number, o: PartOpts = {}): void {
    const geo = new THREE.PlaneGeometry(w, h, 1, 1);
    geo.translate(0, h / 2, 0);
    this.add(geo, [bottom, top], o);
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    return geo;
  }
}

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

// ── The variant roster ─────────────────────────────────────────────────────

type VariantDef = { build: (b: GeoBuilder) => void; twoSided?: boolean };

const VARIANTS: Record<string, VariantDef> = {
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
      const stub = new THREE.BoxGeometry(1.6, 0.14, 0.14);
      stub.translate(0.7, 4.6, 0);
      b.add(stub, DEAD_WOOD, { tiltZ: -0.3 });
      const stub2 = new THREE.BoxGeometry(1.2, 0.12, 0.12);
      stub2.translate(-0.5, 5.8, 0.1);
      b.add(stub2, DEAD_WOOD, { tiltZ: 0.4 });
    },
  },
  stump: {
    build: (b) => {
      b.cyl(TRUNK_DARK, 0.42, 0.5, 0.9, 0);
      b.cyl(CUT_WOOD, 0.4, 0.4, 0.08, 0.9);
      b.blob(MOSS, 0.3, 0.45, 0.25, 0.2, { sy: 0.6 });
    },
  },
  fallenLog: {
    build: (b) => {
      const log = new THREE.CylinderGeometry(0.26, 0.34, 4.6, 6);
      log.translate(0, 2.3, 0);
      b.add(log, DEAD_WOOD, { tiltZ: Math.PI / 2 - 0.06 });
      b.blob(MOSS, 0.35, -2.2, 0.5, 0.1, { sy: 0.5 });
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
};

/** Every plantable variant id — what a biome's mixes may reference. */
export const FLORA_IDS: readonly string[] = Object.keys(VARIANTS);

export type FloraPlacement = {
  id: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  /** Spin around up, radians. */
  spin: number;
};

export type Flora = {
  group: THREE.Group;
  /** Zero out every planted instance whose position `hits` — how an
   * endless run retires plants that road built later runs through. */
  retire: (hits: (x: number, z: number) => boolean) => void;
};

/** How many differently-jittered builds of each variant the world keeps.
 * A plant's shape is fixed the moment its geometry is built, so every
 * instance drawn from one shares it; the variety a forest reads as comes
 * from per-instance scale, spin and tint. A handful of shapes per variant
 * is enough to break up the repeat at any distance a tree is legible from,
 * and the alternative — a fresh build per patch of ground — is a second
 * of geometry work and hundreds of buffer uploads per stage. */
const SHAPES = 3;

/** Every built shape, keyed by variant and jitter. Shared by every patch
 * of ground that plants one, so it is marked `shared` and every teardown
 * path skips it (lib/shared-gpu.ts) — freeing it with the first chunk to
 * be dropped would blank the forest still standing. */
const shapes = new Map<string, THREE.BufferGeometry>();

function shapeFor(id: string, shape: number): THREE.BufferGeometry {
  const key = `${id}#${shape}`;
  const built = shapes.get(key);
  if (built) return built;
  // Seeded from the key alone, so a shape is the same however early or
  // late the stage happens to ask for it.
  const rng = createRng((hashId(key) ^ 0x7f4a7c15) >>> 0);
  const b = new GeoBuilder(() => rng.next());
  VARIANTS[id].build(b);
  const geo = b.build();
  geo.userData.shared = true;
  shapes.set(key, geo);
  return geo;
}

function hashId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The breeze clock, shared by every leafy material in the world so the
 * whole ground cover leans the same way at the same moment. */
const uTime = { value: 0 };

/** Advance the breeze. Called ONCE a frame for the whole world — the sway
 * is one uniform, not one per patch of grass. */
export function swayFlora(dt: number): void {
  uTime.value += dt;
}

type FloraMaterials = { solid: THREE.MeshLambertMaterial; leafy: THREE.MeshLambertMaterial };
let materials: FloraMaterials | null = null;

/** The two materials the whole world's flora is drawn with. Built on first
 * use rather than at import, because the speckle map is painted on a
 * canvas and this module is read by tooling that has none. */
function floraMaterials(): FloraMaterials {
  if (materials) return materials;
  const map = detailTexture();
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true, map });
  const leafy = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map,
    side: THREE.DoubleSide,
  });
  // The breeze: each ground-cover instance leans on its own phase (from
  // its world position), displacing tips more than bases.
  leafy.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          float swayPhase = uTime * 1.9;
          #ifdef USE_INSTANCING
            swayPhase += (instanceMatrix[3].x + instanceMatrix[3].z) * 0.31;
          #endif
          float reach = max(transformed.y, 0.0);
          transformed.x += sin(swayPhase) * 0.07 * reach;
          transformed.z += cos(swayPhase * 0.63) * 0.045 * reach;
        }`,
      );
  };
  solid.userData.shared = true;
  leafy.userData.shared = true;
  materials = { solid, leafy };
  return materials;
}

/** Turn a placement list into instanced meshes — one per variant used,
 * over the world's two shared materials (solid and double-sided ground
 * cover) and its shared library of built shapes. `rand` picks which shape
 * of a variant this patch plants and jitters each instance's tint; pass
 * the stage's seeded RNG so a seed always grows the same forest. */
export function buildFlora(placements: FloraPlacement[], rand: () => number): Flora {
  const group = new THREE.Group();
  const byId = new Map<string, FloraPlacement[]>();
  for (const p of placements) {
    if (!VARIANTS[p.id]) throw new Error(`unknown flora variant: ${p.id}`);
    let list = byId.get(p.id);
    if (!list) byId.set(p.id, (list = []));
    list.push(p);
  }

  const { solid, leafy } = floraMaterials();

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();

  const planted: { mesh: THREE.InstancedMesh; list: FloraPlacement[] }[] = [];
  for (const [id, list] of byId) {
    const def = VARIANTS[id];
    const geo = shapeFor(id, Math.floor(rand() * SHAPES) % SHAPES);
    const mesh = new THREE.InstancedMesh(geo, def.twoSided ? leafy : solid, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.spin);
      // Sunk a touch below grade so no base floats off a slope.
      m.compose(v.set(p.x, p.y - 0.18 * p.scale, p.z), q, sc.set(p.scale, p.scale, p.scale));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setScalar(0.88 + rand() * 0.24));
    });
    group.add(mesh);
    planted.push({ mesh, list });
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group,
    retire: (hits) => {
      for (const { mesh, list } of planted) {
        let touched = false;
        list.forEach((p, i) => {
          if (!hits(p.x, p.z)) return;
          mesh.setMatrixAt(i, zero);
          touched = true;
        });
        if (touched) mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

/** A pooled planting: ONE instanced mesh per variant across a whole
 * population of patches of ground, rather than one per variant per patch.
 *
 * `buildFlora` above is right for a patch that is big and densely planted
 * — a chunk of road, which puts hundreds of the same tree in one mesh and
 * can be hidden as a unit when the fog swallows it. It is wrong for the
 * open country, which is planted in small cells that each hold a handful
 * of two dozen different variants: that comes out as a draw call per two
 * or three plants. The country all lives inside the fog anyway, so there
 * is nothing to hide and nothing lost by pooling it.
 *
 * A patch is replanted or cleared as a whole; every change rewrites the
 * affected meshes, which is a few hundred matrices and cheap next to the
 * geometry work that put the placements together in the first place. */
export type FloraField = {
  group: THREE.Group;
  /** Plant a patch, replacing whatever it held before. */
  plant: (patch: string, placements: readonly FloraPlacement[]) => void;
  /** Take a patch out of the ground. */
  clear: (patch: string) => void;
  /** Draw only these patches — the pool's answer to frustum culling, which
   * it has otherwise given up: one mesh spanning every patch is one object
   * to three, and the camera stands in the middle of it. Null draws
   * everything. Every call rewrites the meshes, so the caller is the one
   * that has to notice when the set has not actually changed. */
  show: (visible: ReadonlySet<string> | null) => void;
  dispose: () => void;
};

/** Instance capacity is grown in blocks, so a cell arriving one at a time
 * does not rebuild every mesh in the field on every sync. */
const POOL_BLOCK = 64;

export function buildFloraField(): FloraField {
  const group = new THREE.Group();
  const patches = new Map<string, readonly FloraPlacement[]>();
  const meshes = new Map<string, THREE.InstancedMesh>();
  let visible: ReadonlySet<string> | null = null;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();

  /** Rewrite every mesh from the patches currently in the ground. */
  const flush = (): void => {
    const byId = new Map<string, FloraPlacement[]>();
    for (const [patch, placements] of patches) {
      if (visible && !visible.has(patch)) continue;
      for (const p of placements) {
        if (!VARIANTS[p.id]) throw new Error(`unknown flora variant: ${p.id}`);
        let list = byId.get(p.id);
        if (!list) byId.set(p.id, (list = []));
        list.push(p);
      }
    }
    const { solid, leafy } = floraMaterials();
    for (const [id, list] of byId) {
      let mesh = meshes.get(id);
      if (!mesh || mesh.instanceMatrix.count < list.length) {
        if (mesh) {
          group.remove(mesh);
          mesh.dispose();
        }
        const room = Math.ceil(list.length / POOL_BLOCK) * POOL_BLOCK;
        // One shape per variant here, chosen off the variant's own name:
        // the country is background, and the shape variety that matters at
        // this distance is between SPECIES, not between builds of one.
        const geo = shapeFor(id, hashId(id) % SHAPES);
        mesh = new THREE.InstancedMesh(geo, VARIANTS[id].twoSided ? leafy : solid, room);
        group.add(mesh);
        meshes.set(id, mesh);
      }
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.spin);
        // Sunk a touch below grade so no base floats off a slope.
        m.compose(v.set(p.x, p.y - 0.18 * p.scale, p.z), q, sc.set(p.scale, p.scale, p.scale));
        (mesh as THREE.InstancedMesh).setMatrixAt(i, m);
        // Tint from the plant's own POSITION, not from a stream of random
        // numbers: a patch replanted after its neighbour was cleared has
        // to come back the same shade it was.
        (mesh as THREE.InstancedMesh).setColorAt(
          i,
          c.setScalar(0.88 + (hashId(`${p.x.toFixed(1)},${p.z.toFixed(1)}`) / 0xffffffff) * 0.24),
        );
      });
      // Only what was written is drawn — the rest of the block is capacity,
      // and an instance nobody sets would stand at the world origin.
      mesh.count = list.length;
      mesh.visible = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    // A variant with nothing left standing is HIDDEN rather than emptied:
    // an instanced mesh with a count of zero is still a draw call. It keeps
    // its mesh, though — the country ahead is the same country as the
    // country behind, and it will be asked for again within a few hundred
    // metres.
    for (const [id, mesh] of meshes) {
      if (!byId.has(id)) mesh.visible = false;
    }
  };

  return {
    group,
    plant: (patch, placements) => {
      patches.set(patch, placements);
      flush();
    },
    clear: (patch) => {
      if (!patches.delete(patch)) return;
      flush();
    },
    show: (next) => {
      visible = next;
      flush();
    },
    dispose: () => {
      for (const mesh of meshes.values()) mesh.dispose();
      meshes.clear();
      patches.clear();
      group.clear();
    },
  };
}
