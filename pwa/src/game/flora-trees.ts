// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TREES, AS DATA — every flora variant that is a TREE (the taiga's
// spruces, firs, larches, pines, birches, aspens, oaks, maples, rowans,
// alders and willows and its standing dead wood; the alpine's stone pines,
// its flagged larch and its silver snag; the desert's saguaros, organ
// pipes, Joshua trees, wash trees and pinyons), each a ROW of the numbers
// its recipe is drawn from. Three-free, so the suite, the labs and the
// Blender driver (`scripts/lib/tree-model-data.mjs`) read every one.
//
// TWO BUILDERS READ A ROW. The code's (`flora-species.ts`,
// `flora-alpine.ts`, `flora-desert.ts` over `flora-build.ts`) turns it into
// the low-poly shape it has always drawn — the numbers moved here, the
// calls unchanged, so the code-built flora is the same geometry to the
// byte. And Blender's (`scripts/blender/tree.py`, `make blender KIND=tree`)
// MODELS it, off this row and the skeleton the code's builder lays for it
// (every trunk, limb, tier and clump where the code puts it), into the
// glTF the game draws instead (`tree-models.ts`) unless a build is switched
// back (`VITE_MODEL_TREES=0`).
//
// A KIND is one glTF: a species, its variants the shapes it takes on a
// stage (the tall one, the old one, the one that leaned into a gap, the
// sapling, the rare giant). What is NOT here stays the code's alone: every
// shrub, the krummholz mat, the small cacti and the ocotillo's canes, the
// ground cover, the stumps and the logs — none of them a tree.
//
// COLOURS ARE NAMES (`TreeColour`): the paint box is `flora-build.ts`'s
// (`PAINT_BOX`), and what a colour does in a model — needles, leaves, bark,
// a berry — is `TREE_PAINT_ROLE`.

/** The species every modelled tree is one of: one glTF each. */
export const TREE_KINDS = [
  "spruce",
  "fir",
  "larch",
  "pine",
  "stonepine",
  "birch",
  "aspen",
  "oak",
  "maple",
  "rowan",
  "alder",
  "willow",
  "snag",
  "saguaro",
  "organpipe",
  "joshua",
  "mesquite",
  "paloverde",
  "ironwood",
  "pinyon",
] as const;
export type TreeKind = (typeof TREE_KINDS)[number];

/** EVERY OTHER PLANT, by the KIND its model is made with: the undergrowth
 * a car drives through and the dead wood it does not, each kind one glTF
 * (`pwa/models/flora/<kind>.glb`) as each kind of tree is. A plant has no
 * row — its recipe is a shape of its own (`flora-species.ts` and kin) — so
 * its model is made over the skeleton that recipe lays, as a tree's is. */
export const PLANT_KINDS = {
  shrub: [
    "heathShrub",
    "juniper",
    "willowShrub",
    "bogShrub",
    "berryBush",
    "alpenrose",
    "mountainPine",
  ],
  grass: [
    "tallGrass",
    "fern",
    "largeFern",
    "sedgeTuft",
    "tussock",
    "bunchGrass",
    "desertGrass",
    "alpineGrass",
  ],
  wetland: ["reeds", "cottonGrass", "bulrush", "waterLily"],
  ground: [
    "mossPatch",
    "bogMoss",
    "saltCrust",
    "cairn",
    "cowSkull",
    "gentianPatch",
    "alpineFlowers",
  ],
  scrub: ["creosote", "bursage", "brittlebush", "sagebrush", "deadBrush", "tumbleweed", "ocotillo"],
  cactus: [
    "barrelCactus",
    "pricklyPear",
    "hedgehogCactus",
    "cholla",
    "chollaChain",
    "agave",
    "agaveBloom",
    "yucca",
  ],
  deadwood: ["stump", "fallenLog", "rootLog", "fallenBranch", "driftwood", "logPile"],
} as const satisfies Record<string, readonly string[]>;
export type PlantKind = keyof typeof PLANT_KINDS;
export const PLANT_KIND_LIST = Object.keys(PLANT_KINDS) as readonly PlantKind[];

/** A plant's kind, by its flora id; undefined for a tree or anything the
 * flora does not plant. */
export const PLANT_KIND: Readonly<Record<string, PlantKind>> = Object.fromEntries(
  PLANT_KIND_LIST.flatMap((k) => PLANT_KINDS[k].map((id) => [id, k])),
);

/** Every kind a model is made of: the trees', then the plants'. */
export type FloraKind = TreeKind | PlantKind;
export const FLORA_KINDS: readonly FloraKind[] = [...TREE_KINDS, ...PLANT_KIND_LIST];

/** Where a kind's committed model is, under `pwa/models/`. */
export function floraModelFile(kind: FloraKind): string {
  return kind in PLANT_KINDS ? `flora/${kind}.glb` : `trees/${kind}.glb`;
}

/** What a colour of the paint box IS on a tree — how a model builds the
 * faces it paints. */
export type PaintRole =
  | "needle"
  | "leaf"
  | "bark"
  | "wood"
  | "mark"
  | "accent"
  | "flesh"
  | "thatch"
  | "dagger"
  // The undergrowth's own: a grass or fern BLADE, a cushion of MOSS (and
  // the flat pads and crusts that lie like one), a flower or seed HEAD, a
  // cactus's SPINES, a pile of STONE, a BONE.
  | "blade"
  | "moss"
  | "head"
  | "spine"
  | "stone"
  | "bone";

/** Every colour the flora is painted with, and what a part in it IS: the
 * trees' first, then the undergrowth's — a Blender model is built over each
 * part by its role (`scripts/blender/tree.py`). */
export const TREE_PAINT_ROLE = {
  TRUNK: "bark",
  TRUNK_DARK: "bark",
  PINE_BARK: "bark",
  BIRCH_BARK: "bark",
  BIRCH_BAND: "mark",
  ASPEN_BARK: "bark",
  DEAD_WOOD: "wood",
  CUT_WOOD: "wood",
  SPRUCE: "needle",
  SPRUCE_DARK: "needle",
  SPRUCE_LIGHT: "needle",
  PINE_CROWN: "needle",
  FIR: "needle",
  FIR_DARK: "needle",
  LARCH: "needle",
  BIRCH_LEAF: "leaf",
  ASPEN_LEAF: "leaf",
  WILLOW: "leaf",
  WILLOW_PALE: "leaf",
  ROWAN_LEAF: "leaf",
  ROWAN_BERRY: "accent",
  OAK_LEAF: "leaf",
  MAPLE_LEAF: "leaf",
  WILLOW_BARK: "bark",
  ALDER_LEAF: "leaf",
  ALDER_BARK: "bark",
  DROWNED: "wood",
  AROLLA: "needle",
  AROLLA_DARK: "needle",
  AROLLA_BARK: "bark",
  SILVER_WOOD: "wood",
  SILVER_WOOD_DARK: "wood",
  SAGUARO: "flesh",
  SAGUARO_DARK: "flesh",
  SAGUARO_TIP: "flesh",
  SAGUARO_RIB: "wood",
  ORGAN_PIPE: "flesh",
  ORGAN_PIPE_DARK: "flesh",
  JOSHUA_LEAF: "dagger",
  JOSHUA_BARK: "bark",
  JOSHUA_DEAD: "thatch",
  MESQUITE_LEAF: "leaf",
  MESQUITE_BARK: "bark",
  PALO_VERDE: "bark",
  PALO_VERDE_LEAF: "leaf",
  IRONWOOD_BARK: "bark",
  IRONWOOD_LEAF: "leaf",
  PINYON: "needle",
  // The taiga's undergrowth and its wet ground.
  JUNIPER: "leaf",
  MOSS: "moss",
  GRASS_BASE: "blade",
  GRASS_TIP: "blade",
  FERN: "blade",
  FERN_TIP: "blade",
  HEATH: "leaf",
  HEATH_BLOOM: "leaf",
  GROUND_MOSS: "moss",
  BERRY_LEAF: "leaf",
  BERRY: "accent",
  SEDGE: "blade",
  SEDGE_TIP: "blade",
  COTTON: "head",
  REED: "blade",
  REED_TIP: "blade",
  DRIFTWOOD: "wood",
  BOG_SHRUB: "leaf",
  LILY_PAD: "moss",
  LILY_BLOOM: "head",
  BULRUSH_HEAD: "head",
  SPHAGNUM: "moss",
  SPHAGNUM_RUST: "moss",
  // The desert's scrub, cacti and bones.
  BARREL: "flesh",
  BARREL_SPINE: "spine",
  BARREL_HOOK: "spine",
  PRICKLY_PEAR: "flesh",
  PEAR_FRUIT: "head",
  HEDGEHOG: "flesh",
  HEDGEHOG_BLOOM: "head",
  CHOLLA: "flesh",
  CHOLLA_DARK: "bark",
  CHOLLA_FRUIT: "head",
  OCOTILLO: "bark",
  OCOTILLO_TIP: "accent",
  CREOSOTE: "leaf",
  CREOSOTE_STEM: "bark",
  BURSAGE: "leaf",
  BRITTLEBUSH: "leaf",
  SAGEBRUSH: "leaf",
  AGAVE: "dagger",
  AGAVE_TIP: "spine",
  AGAVE_STALK: "bark",
  AGAVE_BLOOM: "head",
  YUCCA: "dagger",
  YUCCA_STALK: "bark",
  DEAD_BRUSH: "wood",
  TUMBLEWEED: "wood",
  BUNCH_BASE: "blade",
  BUNCH_TIP: "blade",
  SALT_CRUST: "moss",
  BONE: "bone",
  // The alp's mat, its flowers and its cairns.
  MUGO: "needle",
  MUGO_STEM: "bark",
  ALPENROSE_LEAF: "leaf",
  ALPENROSE_BLOOM: "head",
  GENTIAN: "head",
  ARNICA: "head",
  FLOWER_WHITE: "head",
  ALP_GRASS_BASE: "blade",
  ALP_GRASS_TIP: "blade",
  CAIRN_STONE: "stone",
  CAIRN_DARK: "stone",
  CAIRN_LICHEN: "stone",
} as const satisfies Record<string, PaintRole>;
export type TreeColour = keyof typeof TREE_PAINT_ROLE;

/** One colour, or a bottom→top pair along a part's own height. */
export type TreePaint = TreeColour | readonly [TreeColour, TreeColour];

export type Point = { x: number; y: number; z: number };

/** A part's placement in the builder (`flora-build.ts`). */
export type PartOpts = {
  x?: number;
  /** The part's LIFT, applied after its rotation: where its own origin — a
   * cone's or cylinder's base, a blob's centre — ends up. A tilted part
   * therefore hinges on the point it grows from, which is what keeps a
   * bough on its trunk: swung about the model's foot instead, a limb ten
   * metres up moves metres sideways for a few degrees of lean and hangs in
   * the air beside the tree. */
  y?: number;
  z?: number;
  /** Spin around the part's own base, radians. */
  ry?: number;
  /** Lean from the base, radians — how trunks crook and blades splay.
   * Positive `tiltZ` leans the top toward −x. */
  tiltX?: number;
  tiltZ?: number;
  sx?: number;
  sy?: number;
  sz?: number;
};

/** Where a point at (x, y, 0) lands once its part has been swung round the
 * model's up axis by `angle` — the builder's `ry`, applied by hand for the
 * parts whose ends other parts have to find. */
export function swung(x: number, y: number, angle: number): Point {
  return { x: x * Math.cos(angle), y, z: -x * Math.sin(angle) };
}

/** Where a trunk leaning `lean` radians (the builder's `tiltZ`) actually IS
 * at `at` metres up it: the hinge for anything that grows out of it. */
export function onTrunk(lean: number, at: number): Point {
  return { x: -Math.sin(lean) * at, y: Math.cos(lean) * at, z: 0 };
}

/** The far end of a LIMB `len` long hinged at `hinge`, leaning `tilt` off
 * vertical and swung round by `angle` (`flora-build.ts`'s `limb`). */
export function limbEnd(hinge: Point, tilt: number, angle: number, len: number): Point {
  const end = swung(Math.sin(tilt) * len, Math.cos(tilt) * len, angle);
  return { x: hinge.x + end.x, y: hinge.y + end.y, z: hinge.z + end.z };
}

/** ONE CALL of the code's builder, for a recipe that is a list of parts
 * rather than a shape of its own (`replayParts` draws them in order). */
export type TreePart =
  | {
      op: "cyl";
      c: TreePaint;
      rTop: number;
      rBot: number;
      h: number;
      y: number;
      o?: PartOpts;
      seg?: number;
    }
  | { op: "cone"; c: TreePaint; r: number; h: number; y: number; o?: PartOpts; seg?: number }
  | { op: "blob"; c: TreeColour; r: number; x: number; y: number; z: number; o?: PartOpts }
  | {
      op: "limb";
      c: TreePaint;
      rTop: number;
      rBot: number;
      len: number;
      at: number | Point;
      tilt: number;
      angle: number;
      seg?: number;
    }
  | {
      op: "stub";
      c: TreeColour;
      length: number;
      thick: number;
      at: number;
      angle: number;
      lean?: number;
      swing?: number;
    }
  | {
      op: "ribbed";
      c: TreePaint;
      rTop: number;
      rBot: number;
      h: number;
      y: number;
      o?: PartOpts;
      ribs?: number;
    };

export type Shade = readonly [TreeColour, TreeColour];

/** The spruce and fir family (and the larch, drawn the same): a trunk bare
 * for `bare` of its height, `tiers` hanging whorls, a spire. */
export type SpruceForm = {
  form: "spruce";
  h: number;
  w: number;
  tiers: number;
  bare: number;
  shade: Shade;
  trunk: TreeColour;
  lean?: number;
  ragged?: number;
};
/** A spruce that lost its top to a gale, a side branch turned leader. */
export type SnappedForm = { form: "snapped"; h: number; w: number; shade: Shade };
/** A Scots pine: a tall bare trunk, heavy boughs, a flat crown of tufts. */
export type PineForm = {
  form: "pine";
  h: number;
  crook: number;
  boughs: number;
  spread: number;
  flat?: number;
};
/** A pine forked low into two leaders. */
export type TwinPineForm = { form: "twinPine"; h: number };
/** The birch family: banded stems and a hanging crown. */
export type BirchForm = { form: "birch"; h: number; stems: number; lean: number; weep?: number };
/** An aspen: a straight pale trunk under a narrow crown held high. */
export type AspenForm = { form: "aspen"; h: number };
/** Oak and maple: a short bole forking into three, a wide dome. */
export type BroadleafForm = {
  form: "broadleaf";
  h: number;
  spread: number;
  leaf: TreeColour;
  bark: TreeColour;
  lean: number;
};
/** A dead tree still standing: bark gone, the boughs broken to stubs. */
export type SnagForm = {
  form: "snag";
  h: number;
  r: number;
  lean: number;
  stubs: readonly (readonly [at: number, length: number, angle: number, swing: number])[];
};
/** A Swiss stone pine: a thick bole under a broad dark crown of tufts. */
export type ArollaForm = { form: "arolla"; h: number; spread: number; limbs: number; lean: number };
/** The treeline larch, flagged downwind. */
export type FlagLarchForm = { form: "flagLarch"; h: number; lean: number };
/** A saguaro: a fluted column and its elbowed arms. */
export type SaguaroForm = {
  form: "saguaro";
  h: number;
  r: number;
  arms: readonly (readonly [at: number, angle: number, up: number])[];
  reach?: number;
};
/** A saguaro that has grown no arm yet: the column alone. */
export type ColumnForm = { form: "column"; r: number; h: number; lean?: number };
/** A Joshua tree: a thatched trunk forking into fists of daggers. */
export type JoshuaForm = { form: "joshua"; h: number; r: number; tiers: number };
/** A wash tree: thin stems forking low under an open scatter of leaves. */
export type WashForm = {
  form: "wash";
  bark: TreeColour;
  leaf: TreeColour;
  h: number;
  spread: number;
  stems: number;
  leaves: number;
  size: number;
  fork: number;
  flat?: number;
  droop?: number;
};
/** A recipe that is a list of the builder's own calls. */
export type PartsForm = { form: "parts"; parts: readonly TreePart[] };

export type TreeForm =
  | SpruceForm
  | SnappedForm
  | PineForm
  | TwinPineForm
  | BirchForm
  | AspenForm
  | BroadleafForm
  | SnagForm
  | ArollaForm
  | FlagLarchForm
  | SaguaroForm
  | ColumnForm
  | JoshuaForm
  | WashForm
  | PartsForm;

/** One tree variant: the flora id a biome plants it by, its kind, what the
 * lab calls it, and its recipe's numbers. */
export type TreeRow = { id: string; kind: TreeKind; name: string } & TreeForm;

/** A row, with its id, kind and name first. */
export const row = <F extends TreeForm>(
  id: string,
  kind: TreeKind,
  name: string,
  f: F,
): TreeRow => ({
  id,
  kind,
  name,
  ...f,
});

/** ONE PART OF A TREE AS THE CODE'S BUILDER LAID IT, in the tree's own
 * metres (y up, the foot at the origin): the skeleton a Blender model is
 * made over (`GeoBuilder`'s `trace`), so every trunk, limb, tier and clump
 * stands where the code's does. A tube or a cone runs from `a` (its base,
 * `r0` across) to `b` (its top, `r1`); a clump is centred on `a` with
 * `radii`; a stub is a bar from `a` to `b`, `r0` thick. */
export type TracedPart = {
  shape: "tube" | "cone" | "fluted" | "clump" | "stub" | "blade";
  paint: TreePaint;
  a: [number, number, number];
  b: [number, number, number];
  r0: number;
  r1: number;
  /** Facets round (a tube's, a cone's) and ribs (a fluted column's). */
  seg: number;
  ribs?: number;
  radii?: [number, number, number];
  /** The primitive the code drew the part with (three's own type name),
   * and the one matrix (column-major, sixteen numbers) that carries that
   * primitive AS THREE MAKES IT — a unit box `size` across, a plane, a
   * sphere — to where the part stands: every turn the recipe gave it and
   * the placement, in one. A builder that wants the part's whole frame (a
   * box's three axes, a blade's lean) reads it here. */
  type: string;
  m: number[];
  /** A box's three sizes, a plane's two, a sphere's or a disc's radius —
   * whatever the primitive was made from, in its own frame. */
  size?: number[];
};
