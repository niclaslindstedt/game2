// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH KINDS OF PROP ARE MODELLED, and where each kind's file is — stated
// apart from the loader (`prop-models.ts`) because the build that packs
// the files (`pwa/models-plugin.ts`) and the labs' scripts read this
// without the engine, three or the page. The ids each kind carries are the
// loader's (`PROP_KINDS`), read off the engine's own tables.

export const PROP_KIND_LIST = [
  "traffic",
  "train",
  "farm",
  "livestock",
  "energy",
  "stone",
  "crowd",
  "roadside",
] as const;
export type PropKind = (typeof PROP_KIND_LIST)[number];

/** Where a kind's committed model is, under `pwa/models/`. */
export function propModelFile(kind: PropKind): string {
  return `props/${kind}.glb`;
}
