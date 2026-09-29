// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TREES' ROWS, the dry and the high country's: the alpine's stone pines,
// its flagged larch and its silver snag (`flora-alpine.ts`), and the
// desert's columns, Joshua trees, wash trees and pinyon (`flora-desert.ts`)
// — the numbers those recipes draw with, folded into `TREE_ROWS`
// (`flora-tree-rows.ts`).

import { onTrunk, row, swung, type TreePart, type TreeRow } from "./flora-trees.ts";

/** An arolla dead for a century: silver wood, stubs, a splintered top. */
function deadArollaParts(): TreePart[] {
  const LEAN = 0.07;
  const R = 0.5;
  const out: TreePart[] = [
    {
      op: "cyl",
      c: "SILVER_WOOD",
      rTop: R * 0.18,
      rBot: R,
      h: 9,
      y: 0,
      o: { tiltZ: LEAN },
      seg: 6,
    },
    {
      op: "cyl",
      c: "AROLLA_BARK",
      rTop: R * 0.9,
      rBot: R * 1.04,
      h: 1.6,
      y: 0,
      o: { tiltZ: LEAN },
      seg: 6,
    },
  ];
  const stubs: [at: number, len: number, tilt: number, angle: number][] = [
    [3.8, 2.2, 1.25, 0.5],
    [5.2, 1.6, 0.95, 2.6],
    [6.4, 1.9, 1.1, 4.3],
    [7.6, 1.1, 0.7, 1.7],
  ];
  for (const [at, len, tilt, angle] of stubs) {
    out.push({
      op: "limb",
      c: "SILVER_WOOD_DARK",
      rTop: R * 0.1,
      rBot: R * 0.28,
      len,
      at: onTrunk(LEAN, at),
      tilt,
      angle,
      seg: 5,
    });
  }
  const top = onTrunk(LEAN, 8.9);
  out.push(
    {
      op: "cone",
      c: "SILVER_WOOD_DARK",
      r: R * 0.16,
      h: 1.2,
      y: top.y,
      o: { x: top.x + R * 0.05, tiltZ: 0.2 },
      seg: 4,
    },
    {
      op: "cone",
      c: "SILVER_WOOD",
      r: R * 0.1,
      h: 0.8,
      y: top.y,
      o: { x: top.x - R * 0.1, tiltZ: -0.3 },
      seg: 4,
    },
  );
  return out;
}

/** The golden angle: what the desert's rings are laid round by. */
export const PHI = 2.39996;

/** What a saguaro leaves: its woody ribs in a loose ring. */
function deadSaguaroParts(): TreePart[] {
  const out: TreePart[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const h = 3.2 + (i % 3) * 1.1;
    out.push({
      op: "cyl",
      c: "SAGUARO_RIB",
      rTop: 0.03,
      rBot: 0.05,
      h,
      y: 0,
      o: { x: Math.cos(a) * 0.22, z: Math.sin(a) * 0.22, tiltZ: 0.04 + (i % 2) * 0.05, ry: a },
    });
  }
  out.push({ op: "cyl", c: "TRUNK_DARK", rTop: 0.26, rBot: 0.32, h: 0.5, y: 0, seg: 8 });
  return out;
}

/** An organ pipe: a fan of columns out of one root, no trunk under them. */
function organPipeParts(): TreePart[] {
  const out: TreePart[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = i * PHI;
    const d = 0.12 + (i % 4) * 0.13;
    const lean = 0.1 + d * 0.75;
    const h = 2.7 + (i % 5) * 0.4;
    const r = 0.19 - (i % 3) * 0.015;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    out.push({
      op: "ribbed",
      c: ["ORGAN_PIPE_DARK", "ORGAN_PIPE"],
      rTop: r * 0.82,
      rBot: r,
      h,
      y: 0,
      o: { x, z, tiltZ: lean, ry: a },
      ribs: 7,
    });
    const top = swung(-Math.sin(lean) * h, Math.cos(lean) * h, a);
    out.push({
      op: "blob",
      c: "SAGUARO_TIP",
      r: r * 1.1,
      x: x + top.x,
      y: top.y - r * 0.3,
      z: z + top.z,
      o: { sy: 1 },
    });
  }
  return out;
}

/** The alpine's and the desert's tree variants. */
export const DRY_ROWS: readonly TreeRow[] = [
  row("larchAlpine", "larch", "flagged", { form: "flagLarch", h: 12, lean: 0.12 }),

  // ── The stone pines of the treeline.
  row("arolla", "stonepine", "arolla", {
    form: "arolla",
    h: 14,
    spread: 3.4,
    limbs: 5,
    lean: 0.03,
  }),
  row("arollaOld", "stonepine", "old", {
    form: "arolla",
    h: 17,
    spread: 4.6,
    limbs: 7,
    lean: 0.05,
  }),
  row("arollaYoung", "stonepine", "young", {
    form: "parts",
    parts: [
      { op: "cyl", c: "AROLLA_BARK", rTop: 0.09, rBot: 0.15, h: 2.2, y: 0, o: {}, seg: 6 },
      { op: "blob", c: "AROLLA_DARK", r: 1.2, x: 0, y: 2.4, z: 0, o: { sy: 1.1 } },
      { op: "blob", c: "AROLLA", r: 1, x: 0.3, y: 3.6, z: 0.2, o: { sy: 1.2 } },
      { op: "blob", c: "AROLLA", r: 0.75, x: -0.25, y: 4.7, z: -0.2, o: { sy: 1.3 } },
      { op: "blob", c: "AROLLA", r: 0.4, x: 0, y: 5.6, z: 0, o: { sy: 1.4 } },
    ],
  }),

  row("deadArolla", "snag", "silver", { form: "parts", parts: deadArollaParts() }),

  // ── The desert's trees: the columns, the Joshua trees, the wash trees.
  row("saguaro", "saguaro", "saguaro", {
    form: "saguaro",
    h: 7,
    r: 0.27,
    arms: [
      [3.1, 0.4, 3.2],
      [4.0, 3.7, 2.3],
    ],
    reach: 1.15,
  }),
  row("saguaroOld", "saguaro", "old", {
    form: "saguaro",
    h: 11,
    r: 0.33,
    arms: [
      [3.6, 0.2, 5.8],
      [4.8, 2.2, 4.4],
      [5.4, 4.1, 3.6],
      [6.9, 5.4, 2.4],
    ],
    reach: 1.45,
  }),
  row("saguaroYoung", "saguaro", "young", { form: "column", r: 0.21, h: 2.8, lean: 0.03 }),
  row("deadSaguaro", "saguaro", "dead", { form: "parts", parts: deadSaguaroParts() }),
  row("organPipe", "organpipe", "organ pipe", { form: "parts", parts: organPipeParts() }),
  row("joshuaTree", "joshua", "joshua", { form: "joshua", h: 3.1, r: 0.26, tiers: 2 }),
  row("joshuaYoung", "joshua", "young", { form: "joshua", h: 1.5, r: 0.17, tiers: 1 }),
  row("mesquite", "mesquite", "mesquite", {
    form: "wash",
    bark: "MESQUITE_BARK",
    leaf: "MESQUITE_LEAF",
    h: 5.9,
    spread: 5.6,
    stems: 4,
    leaves: 6,
    size: 0.44,
    fork: 0.26,
    flat: 0.72,
    droop: 0.5,
  }),
  row("paloVerde", "paloverde", "palo verde", {
    form: "wash",
    bark: "PALO_VERDE",
    leaf: "PALO_VERDE_LEAF",
    h: 6,
    spread: 5,
    stems: 3,
    leaves: 6,
    size: 0.4,
    fork: 0.44,
    flat: 0.78,
  }),
  row("ironwood", "ironwood", "ironwood", {
    form: "wash",
    bark: "IRONWOOD_BARK",
    leaf: "IRONWOOD_LEAF",
    h: 8.2,
    spread: 6,
    stems: 3,
    leaves: 8,
    size: 0.48,
    fork: 0.36,
    flat: 0.7,
    droop: 0.3,
  }),
  row("pinyon", "pinyon", "pinyon", {
    form: "parts",
    parts: [
      { op: "cyl", c: "TRUNK_DARK", rTop: 0.14, rBot: 0.26, h: 1.8, y: 0 },
      { op: "blob", c: "PINYON", r: 1.5, x: 0, y: 2.9, z: 0, o: { sy: 0.85 } },
      { op: "blob", c: "PINYON", r: 1.1, x: 0.85, y: 2.4, z: 0.55 },
      { op: "blob", c: "PINYON", r: 0.95, x: -0.75, y: 2.5, z: -0.65 },
      { op: "blob", c: "PINYON", r: 0.75, x: 0, y: 3.9, z: 0 },
    ],
  }),
];
