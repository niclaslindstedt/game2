// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TREES' ROWS (`flora-trees.ts` says what a row is): the taiga's — every
// spruce, fir, larch, pine, birch, aspen, oak, maple, rowan, willow and
// alder a boreal stage plants, and its standing dead wood — with the
// alpine's and the desert's folded in from `flora-tree-rows-dry.ts`, into
// the one table everything reads (`TREE_ROWS`, `TREE_ROW`). The numbers are
// the recipes' own (`flora-species.ts`), moved here so a Blender model is
// made off the very ones the code draws with.

import {
  limbEnd,
  onTrunk,
  row,
  swung,
  type Shade,
  type TreeKind,
  type TreePart,
  type TreeRow,
} from "./flora-trees.ts";
import { DRY_ROWS } from "./flora-tree-rows-dry.ts";

const SPRUCE_SHADE: Shade = ["SPRUCE_DARK", "SPRUCE"];
const FIR_SHADE: Shade = ["FIR_DARK", "FIR"];
const LARCH_SHADE: Shade = ["LARCH", "LARCH"];

// ── The bog pine, the rowan, the willow: recipes that are a list of calls,
// their hinges found off the trunk exactly as the code finds them.
const BOG_LEAN = 0.11;
const bogTop = onTrunk(BOG_LEAN, 3.4);
const bogEnd = limbEnd(onTrunk(BOG_LEAN, 2.7), 0.5, Math.PI, 1.1);
const ROWAN_LEAN = 0.08;
const rowanTop = onTrunk(ROWAN_LEAN, 4.2);
const WILLOW_LEAN = 0.22;
const willowTop = onTrunk(WILLOW_LEAN, 4.4);
const willowFork = limbEnd(onTrunk(WILLOW_LEAN, 3.2), 0.5, Math.PI, 2.4);
const GIANT_LEAN = 0.02;
const GIANT_R = 0.66;
const giantTop = onTrunk(GIANT_LEAN, 23.8);
const BROKEN_LEAN = 0.03;
const brokenTop = onTrunk(BROKEN_LEAN, 4.5);

/** Two stems from one stool, each with its own flat-topped crown. */
function alderParts(): TreePart[] {
  const stems: [lean: number, ry: number, h: number][] = [
    [0.05, 0, 12],
    [-0.16, 1.2, 9.5],
  ];
  const out: TreePart[] = [];
  for (const [lean, ry, h] of stems) {
    const r = 0.08 + h * 0.014;
    const trunkH = h * 0.7;
    out.push({
      op: "cyl",
      c: "ALDER_BARK",
      rTop: r * 0.45,
      rBot: r,
      h: trunkH,
      y: 0,
      o: { tiltZ: lean, ry },
    });
    const top = swung(-Math.sin(lean) * trunkH, Math.cos(lean) * trunkH, ry);
    const c = h * 0.16;
    out.push(
      { op: "blob", c: "ALDER_LEAF", r: c, x: top.x, y: h * 0.78, z: top.z, o: { sy: 0.72 } },
      {
        op: "blob",
        c: "ALDER_LEAF",
        r: c * 0.75,
        x: top.x + c * 0.7,
        y: h * 0.68,
        z: top.z + c * 0.3,
        o: { sy: 0.7 },
      },
      {
        op: "blob",
        c: "ALDER_LEAF",
        r: c * 0.7,
        x: top.x - c * 0.6,
        y: h * 0.7,
        z: top.z - c * 0.4,
        o: { sy: 0.7 },
      },
    );
  }
  return out;
}

/** A young willow, multi-stemmed from the base. */
function willowYoungParts(): TreePart[] {
  const out: TreePart[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    out.push({
      op: "cyl",
      c: "WILLOW_BARK",
      rTop: 0.09,
      rBot: 0.14,
      h: 1.9,
      y: 0,
      o: { x: Math.cos(a) * 0.18, z: Math.sin(a) * 0.18, tiltZ: 0.18 + (i % 2) * 0.14, ry: a },
    });
  }
  out.push(
    { op: "blob", c: "WILLOW", r: 1.2, x: 0, y: 2.2, z: 0, o: { sy: 0.7 } },
    { op: "blob", c: "WILLOW_PALE", r: 0.85, x: 0.9, y: 1.9, z: 0.4, o: { sy: 0.8 } },
  );
  return out;
}

/** The taiga's tree variants. */
const TAIGA_ROWS: readonly TreeRow[] = [
  // ── The spruces — the taiga's backbone, authored mature at 19–26 m.
  row("spruceTall", "spruce", "tall", {
    form: "spruce",
    h: 22,
    w: 2.8,
    tiers: 7,
    bare: 0.14,
    shade: SPRUCE_SHADE,
    trunk: "TRUNK",
  }),
  row("spruceOld", "spruce", "old", {
    form: "spruce",
    h: 26,
    w: 3.4,
    tiers: 8,
    bare: 0.24,
    shade: SPRUCE_SHADE,
    trunk: "TRUNK_DARK",
    lean: 0.02,
    ragged: 0.16,
  }),
  row("spruceDark", "spruce", "dark", {
    form: "spruce",
    h: 20,
    w: 2.6,
    tiers: 7,
    bare: 0.1,
    shade: ["SPRUCE_DARK", "SPRUCE_DARK"],
    trunk: "TRUNK_DARK",
  }),
  row("spruceLean", "spruce", "leaning", {
    form: "spruce",
    h: 19,
    w: 2.5,
    tiers: 6,
    bare: 0.12,
    shade: SPRUCE_SHADE,
    trunk: "TRUNK",
    lean: 0.09,
    ragged: 0.14,
  }),
  row("spruceSnapped", "spruce", "snapped", {
    form: "snapped",
    h: 17,
    w: 2.6,
    shade: SPRUCE_SHADE,
  }),
  row("spruceYoung", "spruce", "young", {
    form: "spruce",
    h: 9,
    w: 1.9,
    tiers: 5,
    bare: 0.04,
    shade: ["SPRUCE", "SPRUCE_LIGHT"],
    trunk: "TRUNK",
  }),
  row("spruceSquat", "spruce", "highland", {
    form: "spruce",
    h: 8.5,
    w: 3.2,
    tiers: 5,
    bare: 0.06,
    shade: SPRUCE_SHADE,
    trunk: "TRUNK_DARK",
    lean: 0.05,
    ragged: 0.2,
  }),
  row("spruceGiant", "spruce", "giant", {
    form: "spruce",
    h: 38,
    w: 4.2,
    tiers: 9,
    bare: 0.3,
    shade: SPRUCE_SHADE,
    trunk: "TRUNK_DARK",
    lean: 0.015,
    ragged: 0.14,
  }),
  row("spruceSapling", "spruce", "sapling", {
    form: "parts",
    parts: [
      { op: "cyl", c: "TRUNK", rTop: 0.05, rBot: 0.08, h: 0.5, y: 0 },
      { op: "cone", c: "SPRUCE_LIGHT", r: 0.55, h: 1.1, y: 0.25, o: {}, seg: 5 },
      { op: "cone", c: "SPRUCE_LIGHT", r: 0.34, h: 0.8, y: 0.85, o: {}, seg: 5 },
    ],
  }),

  // ── The firs — tighter, bluer spires, skirted to the ground.
  row("firSlim", "fir", "slim", {
    form: "spruce",
    h: 21,
    w: 2.6,
    tiers: 9,
    bare: 0.06,
    shade: FIR_SHADE,
    trunk: "TRUNK_DARK",
  }),
  row("firDense", "fir", "dense", {
    form: "spruce",
    h: 16,
    w: 2.8,
    tiers: 8,
    bare: 0.03,
    shade: FIR_SHADE,
    trunk: "TRUNK",
    lean: 0,
    ragged: 0.08,
  }),
  row("firOld", "fir", "old", {
    form: "spruce",
    h: 27,
    w: 3.4,
    tiers: 10,
    bare: 0.2,
    shade: FIR_SHADE,
    trunk: "TRUNK_DARK",
    lean: 0.02,
    ragged: 0.12,
  }),

  // ── The larches — sparse and pale, the trunk seen through the whorls.
  row("larch", "larch", "larch", {
    form: "spruce",
    h: 20,
    w: 2.6,
    tiers: 5,
    bare: 0.14,
    shade: LARCH_SHADE,
    trunk: "TRUNK",
    lean: 0.02,
    ragged: 0.22,
  }),
  row("larchOld", "larch", "old", {
    form: "spruce",
    h: 27,
    w: 3.6,
    tiers: 6,
    bare: 0.28,
    shade: LARCH_SHADE,
    trunk: "TRUNK_DARK",
    lean: 0.04,
    ragged: 0.24,
  }),
  // ── The pines — bare trunks going orange up high under a flat crown.
  row("pineTall", "pine", "tall", { form: "pine", h: 24, crook: 0.03, boughs: 4, spread: 4.5 }),
  row("pineCrooked", "pine", "crooked", { form: "pine", h: 17, crook: 0.16, boughs: 3, spread: 4 }),
  row("pineOld", "pine", "old", {
    form: "pine",
    h: 26,
    crook: 0.05,
    boughs: 6,
    spread: 6,
    flat: 0.45,
  }),
  row("pineTwin", "pine", "twin", { form: "twinPine", h: 20 }),
  row("pineGiant", "pine", "giant", {
    form: "pine",
    h: 40,
    crook: 0.02,
    boughs: 7,
    spread: 7.5,
    flat: 0.5,
  }),
  row("pineYoung", "pine", "young", {
    form: "parts",
    parts: [
      { op: "cyl", c: "TRUNK_DARK", rTop: 0.14, rBot: 0.22, h: 3.6, y: 0 },
      { op: "cone", c: "PINE_CROWN", r: 1.7, h: 2.6, y: 2.8, o: {}, seg: 6 },
      { op: "cone", c: "PINE_CROWN", r: 1.1, h: 2, y: 4.4, o: { ry: 0.4 }, seg: 6 },
      { op: "blob", c: "PINE_CROWN", r: 0.7, x: 0.3, y: 6.2, z: 0.2 },
    ],
  }),
  row("pineSapling", "pine", "sapling", {
    form: "parts",
    parts: [
      { op: "cyl", c: "TRUNK_DARK", rTop: 0.06, rBot: 0.09, h: 0.7, y: 0, o: { tiltZ: 0.06 } },
      { op: "blob", c: "PINE_CROWN", r: 0.55, x: 0, y: 1, z: 0, o: { sy: 0.85 } },
      { op: "blob", c: "PINE_CROWN", r: 0.3, x: 0.25, y: 1.45, z: 0.1 },
    ],
  }),
  row("bogPine", "pine", "bog", {
    form: "parts",
    parts: [
      { op: "cyl", c: "TRUNK_DARK", rTop: 0.1, rBot: 0.19, h: 3.4, y: 0, o: { tiltZ: BOG_LEAN } },
      {
        op: "limb",
        c: "TRUNK_DARK",
        rTop: 0.06,
        rBot: 0.1,
        len: 1.1,
        at: onTrunk(BOG_LEAN, 2.7),
        tilt: 0.5,
        angle: Math.PI,
        seg: 5,
      },
      {
        op: "blob",
        c: "SPRUCE_DARK",
        r: 0.75,
        x: bogTop.x - 0.15,
        y: bogTop.y + 0.3,
        z: 0.1,
        o: { sy: 0.6 },
      },
      {
        op: "blob",
        c: "SPRUCE_DARK",
        r: 0.5,
        x: bogEnd.x,
        y: bogEnd.y,
        z: bogEnd.z,
        o: { sy: 0.6 },
      },
      {
        op: "blob",
        c: "SPRUCE_DARK",
        r: 0.42,
        x: bogTop.x + 0.4,
        y: bogTop.y - 0.2,
        z: -0.4,
        o: { sy: 0.55 },
      },
    ],
  }),

  // ── The broadleaves — the bright accents along water and clearings.
  row("birch", "birch", "birch", { form: "birch", h: 16, stems: 1, lean: 0.04 }),
  row("birchPair", "birch", "pair", { form: "birch", h: 14, stems: 2, lean: 0 }),
  row("birchYoung", "birch", "young", { form: "birch", h: 7, stems: 1, lean: 0.1 }),
  row("birchOld", "birch", "old", { form: "birch", h: 20, stems: 1, lean: 0.03, weep: 0.2 }),
  row("birchLean", "birch", "bent", { form: "birch", h: 13, stems: 1, lean: 0.3, weep: 0.1 }),
  row("aspen", "aspen", "aspen", { form: "aspen", h: 18 }),
  row("aspenTall", "aspen", "tall", { form: "aspen", h: 24 }),
  row("oak", "oak", "oak", {
    form: "broadleaf",
    h: 15,
    spread: 7,
    leaf: "OAK_LEAF",
    bark: "TRUNK_DARK",
    lean: 0.03,
  }),
  row("maple", "maple", "maple", {
    form: "broadleaf",
    h: 13,
    spread: 6,
    leaf: "MAPLE_LEAF",
    bark: "TRUNK",
    lean: 0.04,
  }),
  row("rowan", "rowan", "rowan", {
    form: "parts",
    parts: [
      { op: "cyl", c: "TRUNK", rTop: 0.1, rBot: 0.17, h: 4.2, y: 0, o: { tiltZ: ROWAN_LEAN } },
      { op: "blob", c: "ROWAN_LEAF", r: 2, x: rowanTop.x, y: 5.6, z: 0, o: { sy: 0.95 } },
      { op: "blob", c: "ROWAN_LEAF", r: 1.3, x: rowanTop.x + 1.2, y: 4.9, z: 0.6 },
      { op: "blob", c: "ROWAN_LEAF", r: 1.2, x: rowanTop.x - 1.1, y: 5.1, z: -0.7 },
      { op: "blob", c: "ROWAN_BERRY", r: 0.32, x: rowanTop.x + 0.9, y: 6.2, z: 0.6 },
      { op: "blob", c: "ROWAN_BERRY", r: 0.26, x: rowanTop.x - 1.2, y: 5.6, z: -0.5 },
      { op: "blob", c: "ROWAN_BERRY", r: 0.22, x: rowanTop.x + 0.2, y: 4.6, z: 1.3 },
    ],
  }),
  row("willow", "willow", "willow", {
    form: "parts",
    parts: [
      {
        op: "cyl",
        c: "WILLOW_BARK",
        rTop: 0.3,
        rBot: 0.55,
        h: 4.4,
        y: 0,
        o: { tiltZ: WILLOW_LEAN },
      },
      {
        op: "limb",
        c: "WILLOW_BARK",
        rTop: 0.14,
        rBot: 0.26,
        len: 2.4,
        at: onTrunk(WILLOW_LEAN, 3.2),
        tilt: 0.5,
        angle: Math.PI,
        seg: 5,
      },
      {
        op: "blob",
        c: "WILLOW",
        r: 2.8,
        x: willowTop.x - 0.4,
        y: willowTop.y + 0.6,
        z: 0,
        o: { sy: 0.62 },
      },
      {
        op: "blob",
        c: "WILLOW_PALE",
        r: 1.9,
        x: willowTop.x + 2,
        y: willowTop.y - 0.2,
        z: 0.6,
        o: { sy: 0.7 },
      },
      {
        op: "blob",
        c: "WILLOW",
        r: 1.7,
        x: willowFork.x,
        y: willowFork.y + 0.2,
        z: willowFork.z - 0.5,
        o: { sy: 0.75 },
      },
      { op: "blob", c: "WILLOW", r: 1.2, x: willowTop.x + 2.8, y: 2.6, z: 0, o: { sy: 0.95 } },
      {
        op: "blob",
        c: "WILLOW_PALE",
        r: 1,
        x: willowFork.x - 0.8,
        y: 2.4,
        z: 0.8,
        o: { sy: 1 },
      },
    ],
  }),
  row("willowYoung", "willow", "young", { form: "parts", parts: willowYoungParts() }),
  row("alder", "alder", "alder", { form: "parts", parts: alderParts() }),

  // ── The dead wood still standing.
  row("deadSnag", "snag", "snag", {
    form: "snag",
    h: 16,
    r: 0.42,
    lean: 0.04,
    stubs: [
      [8.2, 1.9, -0.3, 0.3],
      [10.5, -1.5, 0.35, 2.4],
      [12.4, 1.2, 0.1, 4.2],
    ],
  }),
  row("deadGiant", "snag", "giant", {
    form: "parts",
    parts: [
      {
        op: "cyl",
        c: "DEAD_WOOD",
        rTop: GIANT_R * 0.12,
        rBot: GIANT_R,
        h: 24,
        y: 0,
        o: { tiltZ: GIANT_LEAN },
        seg: 6,
      },
      ...(
        [
          [9, 2.8, -0.2, 0.6],
          [12.5, -2.2, 0.3, 2.1],
          [15, 2.4, 0.15, 3.9],
          [18, -1.6, 0.5, 5.2],
          [20.5, 1.3, -0.1, 1.4],
        ] as const
      ).map(([at, length, angle, swing]): TreePart => ({
        op: "stub",
        c: "DEAD_WOOD",
        length,
        thick: GIANT_R * 0.3,
        at,
        angle,
        lean: GIANT_LEAN,
        swing,
      })),
      {
        op: "cyl",
        c: "TRUNK_DARK",
        rTop: GIANT_R * 0.86,
        rBot: GIANT_R * 1.03,
        h: 8,
        y: 0,
        o: { tiltZ: GIANT_LEAN },
        seg: 6,
      },
      {
        op: "cone",
        c: "CUT_WOOD",
        r: GIANT_R * 0.24,
        h: 1.4,
        y: giantTop.y,
        o: { x: giantTop.x + GIANT_R * 0.1, tiltZ: 0.25 },
        seg: 4,
      },
      {
        op: "cone",
        c: "CUT_WOOD",
        r: GIANT_R * 0.16,
        h: 0.9,
        y: giantTop.y + 0.1,
        o: { x: giantTop.x - GIANT_R * 0.1, tiltZ: -0.3 },
        seg: 4,
      },
    ],
  }),
  row("leaningSnag", "snag", "leaning", {
    form: "snag",
    h: 13,
    r: 0.34,
    lean: 0.42,
    stubs: [
      [5.5, 1.5, -0.1, 0.8],
      [8, -1.1, 0.3, 3.9],
    ],
  }),
  row("brokenTrunk", "snag", "broken", {
    form: "parts",
    parts: [
      { op: "cyl", c: "DEAD_WOOD", rTop: 0.34, rBot: 0.5, h: 4.6, y: 0, o: { tiltZ: BROKEN_LEAN } },
      {
        op: "cone",
        c: "CUT_WOOD",
        r: 0.3,
        h: 1.1,
        y: brokenTop.y,
        o: { x: brokenTop.x + 0.06, tiltZ: 0.16 },
        seg: 4,
      },
      {
        op: "cone",
        c: "CUT_WOOD",
        r: 0.18,
        h: 0.7,
        y: brokenTop.y + 0.05,
        o: { x: brokenTop.x - 0.16, tiltZ: -0.3 },
        seg: 4,
      },
    ],
  }),
  row("drownedTrunk", "snag", "drowned", {
    form: "parts",
    parts: [
      { op: "cyl", c: "DROWNED", rTop: 0.11, rBot: 0.3, h: 4.2, y: 0, o: { tiltZ: 0.09 } },
      { op: "stub", c: "DROWNED", length: 1.1, thick: 0.11, at: 2.9, angle: -0.42, lean: 0.09 },
      {
        op: "stub",
        c: "DROWNED",
        length: -0.8,
        thick: 0.09,
        at: 3.6,
        angle: 0.5,
        lean: 0.09,
        swing: 0.08,
      },
    ],
  }),
];

/** Every tree variant the flora can plant. */
export const TREE_ROWS: readonly TreeRow[] = [...TAIGA_ROWS, ...DRY_ROWS];

/** Every tree row by its flora id. */
export const TREE_ROW: Readonly<Record<string, TreeRow>> = Object.fromEntries(
  TREE_ROWS.map((r) => [r.id, r]),
);

/** A kind's variants, in the order the rows are written. */
export function treeRowsOf(kind: TreeKind): readonly TreeRow[] {
  return TREE_ROWS.filter((r) => r.kind === kind);
}
