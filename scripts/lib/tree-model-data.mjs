// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A KIND OF TREE — OR OF ANY OTHER PLANT — IS HANDED (`make blender
// KIND=tree`, `scripts/blender.mjs`): every variant's ROW
// (`pwa/src/game/flora-tree-rows.ts` — the numbers the code's recipe draws
// with; a shrub, a tuft or a log has none, its recipe being a shape of its
// own) and its SKELETON, the parts the code's own builder lays for it
// (`GeoBuilder`'s `trace`: every trunk, limb, tier, clump and blade as the
// code places it, shape 0's rolls — the build the world draws first), so
// `scripts/blender/tree.py` models each part where the code has it and
// never states a number of its own. And, for the stills alone, every
// colour the kind is painted with in the summer, in linear light.
//
// All in the tree's own metres, the game's frame: y up, the foot at the
// origin.

/** One kind's data. Call `aliasEngine` first: the game's modules spell the
 * engine `@engine`. */
export async function treeModelData(kind) {
  const { createRng } = await import("../../engine/index.ts");
  const { GeoBuilder, PAINT_BOX, shapeSeed } = await import("../../pwa/src/game/flora-build.ts");
  const { PLANT_KINDS, TREE_PAINT_ROLE } = await import("../../pwa/src/game/flora-trees.ts");
  const { treeRowsOf } = await import("../../pwa/src/game/flora-tree-rows.ts");
  const { VARIANTS } = await import("../../pwa/src/game/flora-species.ts");
  const names = new Map(Object.entries(PAINT_BOX).map(([n, c]) => [c, n]));
  const rows =
    kind in PLANT_KINDS
      ? PLANT_KINDS[kind].map((id) => ({ id, kind, name: id, form: "plant" }))
      : treeRowsOf(kind);
  if (rows.length === 0) throw new Error(`no kind of tree or plant "${kind}"`);
  const variants = rows.map((row) => {
    const rng = createRng(shapeSeed(row.id, 0));
    const b = new GeoBuilder(() => rng.next());
    b.trace = { parts: [], names };
    VARIANTS[row.id].build(b);
    const g = b.build();
    g.computeBoundingBox();
    const box = g.boundingBox;
    g.dispose();
    return {
      ...row,
      parts: b.trace.parts,
      bounds: { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] },
    };
  });
  const used = new Set(
    variants.flatMap((v) =>
      v.parts.flatMap((p) => (typeof p.paint === "string" ? [p.paint] : [...p.paint])),
    ),
  );
  const paint = Object.fromEntries(
    [...used].map((n) => [
      n,
      { rgb: [PAINT_BOX[n].r, PAINT_BOX[n].g, PAINT_BOX[n].b], role: TREE_PAINT_ROLE[n] },
    ]),
  );
  return { kind, variants, paint };
}
