// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The low-poly builder every plant in the world is made with, and the paint
// box it is colored from. One `GeoBuilder` accumulates cones, cylinders,
// boxes, icosahedra and quads into a single non-indexed vertex-colored
// geometry, so a whole species is one buffer and one draw call however many
// parts it took to make. WHICH plants exist is flora-species.ts; how they
// are planted and instanced is flora.ts.

import * as THREE from "three";
import type { Season } from "@engine";

// ── The taiga paint box ────────────────────────────────────────────────────
/** Bare trunk brown. Exported as a NUMBER too: the breakage effects colour
 * their splinters with it, and they have no business importing a shared
 * THREE.Color they might mutate. */
export const TRUNK_COLOR = 0x7a4f2a;
export const TRUNK = new THREE.Color(TRUNK_COLOR);
export const TRUNK_DARK = new THREE.Color(0x5f3d20);
export const PINE_BARK = new THREE.Color(0xa5683a); // Scots pine's orange upper bark
export const BIRCH_BARK = new THREE.Color(0xe8e4da);
export const BIRCH_BAND = new THREE.Color(0x3a3a38);
export const ASPEN_BARK = new THREE.Color(0xb4bba4);
export const DEAD_WOOD = new THREE.Color(0x8f857a);
/** The pale face of a fresh cut — and of a trunk snapped by a rally car,
 * which is why this one is exported as a NUMBER too (see TRUNK_COLOR). */
export const CUT_WOOD_COLOR = 0xc9b892;
export const CUT_WOOD = new THREE.Color(CUT_WOOD_COLOR);

export const SPRUCE = new THREE.Color(0x2e6b38);
export const SPRUCE_DARK = new THREE.Color(0x1f4d2a);
export const SPRUCE_LIGHT = new THREE.Color(0x3f8347);
export const PINE_CROWN = new THREE.Color(0x4c9a52);
export const FIR = new THREE.Color(0x2f6b4f); // the bluish cast firs carry
export const FIR_DARK = new THREE.Color(0x24553e); // ...and its lower tiers, in their own shade
export const BIRCH_LEAF = new THREE.Color(0x8cc257);
export const ASPEN_LEAF = new THREE.Color(0x9cc44e);
export const LARCH = new THREE.Color(0x93ac3e); // deciduous needles, yellow-green
export const WILLOW = new THREE.Color(0x6da157);
export const JUNIPER = new THREE.Color(0x2b5e33);
export const ROWAN_LEAF = new THREE.Color(0x6fae4a);
export const ROWAN_BERRY = new THREE.Color(0xe05a2b);
export const OAK_LEAF = new THREE.Color(0x4e7d31);
export const MAPLE_LEAF = new THREE.Color(0x74a23c);
export const MOSS = new THREE.Color(0x90a84f);

export const GRASS_BASE = new THREE.Color(0x4a7a28);
export const GRASS_TIP = new THREE.Color(0x9ac74e);
export const FERN = new THREE.Color(0x2f6b2f);
export const FERN_TIP = new THREE.Color(0x529440);
export const HEATH = new THREE.Color(0x5a7034);
export const HEATH_BLOOM = new THREE.Color(0x6b4f56); // a heather-purple dusting
export const GROUND_MOSS = new THREE.Color(0x7ea24a); // the cushion moss a spruce wood floors itself with
export const BERRY_LEAF = new THREE.Color(0x3d6b2e);
export const BERRY = new THREE.Color(0xc42f36); // lingonberry, the one red in a green wood
export const SEDGE = new THREE.Color(0x8a9647); // the coarse straw-green of a tussock
export const SEDGE_TIP = new THREE.Color(0xb5ad63);
export const COTTON = new THREE.Color(0xf2efe4); // bog cotton's seed head
export const REED = new THREE.Color(0x6f8a3f);
export const REED_TIP = new THREE.Color(0xa8a35c);
export const DRIFTWOOD = new THREE.Color(0xb9b2a4); // bleached by a season in the water
export const BOG_SHRUB = new THREE.Color(0x4d6136); // dwarf birch and bog myrtle, nearly grey

// ── The wetlands ───────────────────────────────────────────────────────────
// Standing water reads as standing water because of what grows OUT of it,
// not because of the water itself: a flat blue plane is a texture, and a
// flat blue plane with dead trunks and reed beds standing in it is a swamp.
// These are the colours that only ever appear at a waterline.
export const WILLOW_BARK = new THREE.Color(0x6a5a48); // pale, fissured, always leaning
export const WILLOW_PALE = new THREE.Color(0x8fb168); // the underside a willow shows in wind
export const ALDER_LEAF = new THREE.Color(0x3f5c33); // darker and flatter than anything dry
export const ALDER_BARK = new THREE.Color(0x4a463f);
export const DROWNED = new THREE.Color(0x7d7468); // wood that has stood in water for years
export const LILY_PAD = new THREE.Color(0x4f7a3d);
export const LILY_BLOOM = new THREE.Color(0xf0ead8);
export const BULRUSH_HEAD = new THREE.Color(0x6b4a2c); // the brown sausage on a cattail
export const SPHAGNUM = new THREE.Color(0x93b055); // bog moss: brighter and wetter than cushion moss
export const SPHAGNUM_RUST = new THREE.Color(0xa8894a); // ...and the rust it turns where it is drying

// ── The desert's paint box (flora-desert.ts) ──────────────────────────────
// Grey-green, olive and silver, over bark that is more often green or
// bleached than brown; the saturated colours are the SPRING's and live in
// the season table below.
//
// A cactus is NOT leaf green. Its skin is a dull, slightly blue grey-green
// under a waxy bloom, and the difference between that and a tree's foliage
// is most of what tells a viewer at speed that they are looking at a desert
// and not a savanna. Every green below is pulled toward grey on purpose.
export const SAGUARO = new THREE.Color(0x5e8055);
export const SAGUARO_DARK = new THREE.Color(0x46603e); // the shaded flank of a rib
/** The crown of a saguaro: green all year, and where the blossom and then
 * the fruit sit — so this is the colour the season table moves. */
export const SAGUARO_TIP = new THREE.Color(0x6b8e5e);
export const SAGUARO_RIB = new THREE.Color(0xc9b99a); // the woody ribs a dead one leaves standing
export const ORGAN_PIPE = new THREE.Color(0x53744a); // darker and bluer than a saguaro
export const ORGAN_PIPE_DARK = new THREE.Color(0x3d5836);
export const BARREL = new THREE.Color(0x66884a); // yellower than the columns
export const BARREL_SPINE = new THREE.Color(0xd8b06a); // the yellow spines that catch the light
export const BARREL_HOOK = new THREE.Color(0xb2663a); // the red hooked central spines
export const PRICKLY_PEAR = new THREE.Color(0x6d9270); // bluer still — a pad is glaucous
export const PEAR_FRUIT = new THREE.Color(0x7d9c60); // green in summer; the season turns it purple
export const HEDGEHOG = new THREE.Color(0x4f6f42); // a clump of short dark columns
export const HEDGEHOG_BLOOM = new THREE.Color(0x6d7a52); // ...and the magenta it wears in April
export const CHOLLA = new THREE.Color(0xb4ad88); // silvery — a cholla is mostly spines
export const CHOLLA_DARK = new THREE.Color(0x6f6b50);
export const CHOLLA_FRUIT = new THREE.Color(0x8aa06a); // the green chains a chain-fruit hangs
export const OCOTILLO = new THREE.Color(0x6d5a48);
/** An ocotillo's cane tips: bare most of the year, a red flame in spring. */
export const OCOTILLO_TIP = new THREE.Color(0x8a6a4e);
export const JOSHUA_LEAF = new THREE.Color(0x55704a); // stiff dark daggers, not foliage
export const JOSHUA_BARK = new THREE.Color(0x8a7a66); // shaggy, grey, fibrous
export const JOSHUA_DEAD = new THREE.Color(0x9c8459); // the skirt of dead leaves under every head
export const MESQUITE_LEAF = new THREE.Color(0x687f43);
export const MESQUITE_BARK = new THREE.Color(0x5a4636);
/** Green BARK — a palo verde photosynthesises through its trunk, which is
 * the whole reason it has almost no leaves to speak of. */
export const PALO_VERDE = new THREE.Color(0x89ad64);
/** ...and the little it does carry: paler, yellower, and thin enough to
 * see the sky through. Kept apart from the bark so that spring can put the
 * tree's yellow bloom on the CROWN and leave the trunk green. */
export const PALO_VERDE_LEAF = new THREE.Color(0xa6c47c);
export const IRONWOOD_BARK = new THREE.Color(0x8d8478); // grey and shredding
export const IRONWOOD_LEAF = new THREE.Color(0x76876a); // the greyest crown in the wash
export const PINYON = new THREE.Color(0x4f6f45);
export const CREOSOTE = new THREE.Color(0x6b7a3e); // small, resinous, olive
export const CREOSOTE_STEM = new THREE.Color(0x5a4d3a);
export const BURSAGE = new THREE.Color(0x9aa27e); // the grey dome under every saguaro
export const BRITTLEBUSH = new THREE.Color(0x8c9a6e); // grey-green; the season turns the whole bush yellow
export const SAGEBRUSH = new THREE.Color(0x8e957a);
export const AGAVE = new THREE.Color(0x7f9a86); // blue-green blades
export const AGAVE_TIP = new THREE.Color(0x4a4034); // the black spine on each
export const AGAVE_STALK = new THREE.Color(0xa89060); // the mast a century plant dies putting up
export const AGAVE_BLOOM = new THREE.Color(0xcfc06a); // ...and the panicles along its arms
export const YUCCA = new THREE.Color(0x6f8f62);
export const YUCCA_STALK = new THREE.Color(0xa8916a);
export const DEAD_BRUSH = new THREE.Color(0x9a8c74);
export const TUMBLEWEED = new THREE.Color(0xb8a882);
export const BUNCH_BASE = new THREE.Color(0xb9a65c);
export const BUNCH_TIP = new THREE.Color(0xe0cf8a);
export const SALT_CRUST = new THREE.Color(0xece6d4);
export const BONE = new THREE.Color(0xe9e1cf);

// ── The alpine paint box (flora-alpine.ts) ────────────────────────────────
// The treeline's conifers are DARKER than the taiga's — a stone pine crown
// is nearly black-green against snow — over bark that is grey rather than
// brown; the ground under them is the brightest green in the game, and in
// summer it is full of flowers. The flowers and the pasture are the
// season's business (the table below); the conifers hold still.
export const AROLLA = new THREE.Color(0x2b5237); // Swiss stone pine: dense, dark, blue-green
export const AROLLA_DARK = new THREE.Color(0x1e3d29); // ...its shaded inner tufts
export const AROLLA_BARK = new THREE.Color(0x6b5b4d); // grey-brown, fissured in plates
export const MUGO = new THREE.Color(0x3d6e3a); // mountain pine: a yellower green than the arolla
export const MUGO_STEM = new THREE.Color(0x5b4b3c);
export const ALPENROSE_LEAF = new THREE.Color(0x3b5e31); // rhododendron: dark, glossy, evergreen
/** The alpenrose flower: pink-red in June and July, gone by autumn — so the
 * season table takes it back to the leaf. */
export const ALPENROSE_BLOOM = new THREE.Color(0xd8485f);
export const GENTIAN = new THREE.Color(0x2c56c6); // the one true blue in any biome
export const ARNICA = new THREE.Color(0xe9b62d); // the yellow half of an alp in flower
export const FLOWER_WHITE = new THREE.Color(0xf3f1e6); // the white half: yarrow, daisy, edelweiss
export const ALP_GRASS_BASE = new THREE.Color(0x5c9a2c); // pasture grass, grazed short
export const ALP_GRASS_TIP = new THREE.Color(0xaad456);
export const CAIRN_STONE = new THREE.Color(0x9c9e9a); // grey limestone and gneiss, stacked
export const CAIRN_DARK = new THREE.Color(0x74787a);
export const CAIRN_LICHEN = new THREE.Color(0xa3a87a); // the green-grey crust on the older stones
export const SILVER_WOOD = new THREE.Color(0xbfbab0); // an arolla dead for a century: bleached silver
export const SILVER_WOOD_DARK = new THREE.Color(0x8f8b82);

// ── The seasons ────────────────────────────────────────────────────────────
// What a boreal forest actually does over a year, and — just as important —
// what it does NOT do. The conifers are evergreen: a spruce in September is
// the same spruce it was in June, and that is exactly why a taiga autumn
// reads the way it does. The dark spires hold the silhouette still while
// everything BETWEEN them changes colour, so the yellow has something to
// burn against. Change the spruces too and the picture just goes muddy.
//
// The colours below are the boreal phenology of Fennoscandia, roughly
// 60–64°N:
//
//   SPRING (May)   Birch breaks bud late and comes out translucent
//                  yellow-green; aspen and rowan follow. Larch — the one
//                  conifer that sheds — puts out the brightest green in
//                  the forest. Rowan carries white flower corymbs, not
//                  berries. Bilberry breaks bud bright. On the ground,
//                  last year's straw is still the loudest thing there.
//   SUMMER         Everything saturated and deep. The authored baseline.
//   AUTUMN (Sept)  "Ruska", the north's colour peak. Birch goes pure
//                  YELLOW — it carries carotenoids and almost no
//                  anthocyanin, so it never goes red. Aspen and maple go
//                  gold, rowan goes orange-scarlet and hangs its berries,
//                  oak goes bronze, larch goes gold before dropping. The
//                  floor is the other half of it: bilberry turns crimson,
//                  ferns rust, sedges and dwarf birch on the bogs go
//                  copper, and heather is still in purple flower.
//
//   WINTER (Jan)   The broadleaves are BARE — a birch crown from the road
//                  is a grey-brown haze of twigs, and that is what its
//                  leaf colour becomes — the larch has dropped, and the
//                  ground layer is dead straw and bleached sedge under the
//                  snow the terrain lays over it. The rowan hangs its
//                  berries into the cold. The conifers hold their
//                  silhouette still, exactly as in autumn, and only the
//                  light greens on their tips go a shade greyer under the
//                  frost. The desert's winter runs the other way: it is the
//                  rainy season, and the creosote, the brittlebush and the
//                  bunch grass go GREENER — the ocotillo puts out leaves
//                  within days of rain — a little, not a lot.
//
// A colour not on this table does not change: every bark, every conifer
// green, all the dead wood, the driftwood, the stone.

/** One authored colour and where the year takes it. */
type SeasonalColor = { summer: THREE.Color; spring: number; autumn: number; winter: number };

const SEASONAL: SeasonalColor[] = [
  // Broadleaves. The birch is the one that matters — half the accent trees
  // in the biome are birch, and its yellow IS a Nordic autumn.
  { summer: BIRCH_LEAF, spring: 0xb8d977, autumn: 0xf0c22e, winter: 0x7a6f66 },
  { summer: ASPEN_LEAF, spring: 0xc2d98a, autumn: 0xe8a02c, winter: 0x7d746a },
  { summer: OAK_LEAF, spring: 0x86a855, autumn: 0x9c6a2c, winter: 0x6e5f4c },
  { summer: MAPLE_LEAF, spring: 0xa2c065, autumn: 0xe0921f, winter: 0x75695f },
  { summer: ROWAN_LEAF, spring: 0x97c467, autumn: 0xd4552b, winter: 0x7a6d62 },
  // Rowan's accent is a white flower head in May and a scarlet berry
  // cluster in September — the same blobs, doing opposite jobs.
  { summer: ROWAN_BERRY, spring: 0xe8e4d2, autumn: 0xd41f22, winter: 0xb8302a },
  { summer: WILLOW, spring: 0x93b96a, autumn: 0xb8a24e, winter: 0x8a7d66 },
  // The larch: deciduous needles, so it is the only conifer on this table.
  { summer: LARCH, spring: 0xa8c94a, autumn: 0xd9b13a, winter: 0x8a7860 },
  // The spruces' and pines' NEW shoots in May are visibly paler than the
  // old needles behind them. Only the light greens move; the dark ones,
  // which carry the silhouette, do not.
  { summer: SPRUCE_LIGHT, spring: 0x529b4e, autumn: 0x3d7d45, winter: 0x4d6e5c },
  { summer: PINE_CROWN, spring: 0x5aa757, autumn: 0x4a9450, winter: 0x557863 },
  // The ground layer.
  { summer: GRASS_BASE, spring: 0x63822f, autumn: 0x8a7a35, winter: 0x8f8a70 },
  { summer: GRASS_TIP, spring: 0xb4d165, autumn: 0xcbb45c, winter: 0xc9c4ae },
  { summer: FERN, spring: 0x4a8138, autumn: 0x8a5a24, winter: 0x8a7a5a },
  { summer: FERN_TIP, spring: 0x76a84e, autumn: 0xb07a2e, winter: 0xa89a78 },
  { summer: HEATH, spring: 0x5f7a38, autumn: 0x7d5c2c, winter: 0x5c5a48 },
  // Calluna flowers August into September — the purple is an AUTUMN thing,
  // not a summer one.
  { summer: HEATH_BLOOM, spring: 0x6b6046, autumn: 0x8a4a5c, winter: 0x5c5a48 },
  // Bilberry: the loudest red on an autumn forest floor, and pale green
  // bells in spring where the berries will be.
  { summer: BERRY_LEAF, spring: 0x62914a, autumn: 0xb0342a, winter: 0x6b5a4c },
  { summer: BERRY, spring: 0xd8dfc8, autumn: 0xb01f26, winter: 0x6b5a4c },
  // Moss is evergreen and barely moves — a token shift, so it does not sit
  // dead still while everything around it turns.
  { summer: MOSS, spring: 0x93ad52, autumn: 0x8a9448, winter: 0x7d8a6a },
  { summer: GROUND_MOSS, spring: 0x82a54e, autumn: 0x7c9247, winter: 0x738064 },
  // The wet ground. Sedge and dwarf birch turn a bog copper in September,
  // which is the single most distinctive thing the biome does all year.
  { summer: SEDGE, spring: 0x8fa04a, autumn: 0xb07b34, winter: 0xb0a27a },
  { summer: SEDGE_TIP, spring: 0xb8b167, autumn: 0xd2a355, winter: 0xd2c8a0 },
  { summer: REED, spring: 0x7d9448, autumn: 0xa8934a, winter: 0xb5a878 },
  { summer: REED_TIP, spring: 0xafa863, autumn: 0xc9b06a, winter: 0xd6ccaa },
  { summer: BOG_SHRUB, spring: 0x5a7040, autumn: 0xa04a2c, winter: 0x6a5a48 },
  // Bog cotton heads are a June thing; by September they have blown.
  { summer: COTTON, spring: 0xf7f4ea, autumn: 0xe8e2d0, winter: 0xe8e2d0 },

  // THE DESERT. Its year is the opposite shape: spring is the loud one —
  // a wet winter puts a yellow hillside of brittlebush, white saguaro
  // crowns and red ocotillo tips on a country that is grey-green the rest
  // of the time — and autumn is a small drying and reddening. Every cactus
  // body, every bark and the dead wood hold still, as the conifers do.
  { summer: SAGUARO_TIP, spring: 0xf4efdc, autumn: 0xc23a2e, winter: 0x6b8e5e },
  { summer: PEAR_FRUIT, spring: 0xd9c85a, autumn: 0x8e2f52, winter: 0x7d9c60 },
  { summer: OCOTILLO_TIP, spring: 0xd23c2c, autumn: 0x8a6a4e, winter: 0x5f8a4a },
  { summer: BRITTLEBUSH, spring: 0xe6c93a, autumn: 0x9a9268, winter: 0x86a468 },
  { summer: CREOSOTE, spring: 0x7d8f43, autumn: 0x6b7038, winter: 0x5f7f3e },
  // A blooming palo verde is a yellow cloud on a GREEN trunk — the bark
  // does not flower, so only the crown's colour is on this table.
  { summer: PALO_VERDE_LEAF, spring: 0xdcc94c, autumn: 0xa8bc78, winter: 0xa2c47a },
  { summer: MESQUITE_LEAF, spring: 0x86a04e, autumn: 0x9a9048, winter: 0x6f8f48 },
  { summer: IRONWOOD_LEAF, spring: 0x9a8ab0, autumn: 0x80876e, winter: 0x76876a },
  // Bursage greens up with the winter rain and is grey straw by June — the
  // whole Sonoran ground layer doing it at once is what makes the spring.
  { summer: BURSAGE, spring: 0x8fa858, autumn: 0xa39a7c, winter: 0x84a05c },
  { summer: HEDGEHOG_BLOOM, spring: 0xc4407a, autumn: 0x6d7a52, winter: 0x6d7a52 },
  { summer: AGAVE_BLOOM, spring: 0xe4d266, autumn: 0xb8a25c, winter: 0xbfae60 },
  { summer: SAGEBRUSH, spring: 0x98a27e, autumn: 0x8a8a6c, winter: 0x8aa088 },
  { summer: YUCCA_STALK, spring: 0xf3eedd, autumn: 0xa8916a, winter: 0xa8916a },
  { summer: BUNCH_BASE, spring: 0x9aa858, autumn: 0xc0a24e, winter: 0x8ea852 },
  { summer: BUNCH_TIP, spring: 0xcfcf7e, autumn: 0xe8d08c, winter: 0xc8cf7c },

  // THE ALPINE. The larch's gold is the taiga row's, shared. What is this
  // country's own is the ALP: in June it is flowers over fresh green, in
  // October it is cured straw and the flowers are seed heads — the blue
  // and the yellow go to straw, the white to a dry grey — while the
  // alpenrose, which flowers early summer, goes back to its own leaf. The
  // arolla, the mountain pine and the stone hold still.
  { summer: ALPENROSE_BLOOM, spring: 0xd4607c, autumn: 0x3b5e31, winter: 0x3b5e31 },
  { summer: GENTIAN, spring: 0x3a62d2, autumn: 0x9a9060, winter: 0x9a9060 },
  { summer: ARNICA, spring: 0xecc247, autumn: 0xb8a25c, winter: 0xb8a25c },
  { summer: FLOWER_WHITE, spring: 0xf6f4ea, autumn: 0xb8b09a, winter: 0xb8b09a },
  { summer: ALP_GRASS_BASE, spring: 0x66a534, autumn: 0x9a8d3c, winter: 0x9a9684 },
  { summer: ALP_GRASS_TIP, spring: 0xb4dc62, autumn: 0xd2bc5e, winter: 0xcac4ae },
];

/** What one season does to the paint box: authored colour → this season's.
 * A colour absent from the map is a colour the year does not touch. */
export type FloraPalette = ReadonlyMap<THREE.Color, THREE.Color>;

const palettes = new Map<Season, FloraPalette>();

export function floraPalette(season: Season): FloraPalette {
  const built = palettes.get(season);
  if (built) return built;
  const map = new Map<THREE.Color, THREE.Color>();
  if (season !== "summer") {
    for (const row of SEASONAL) map.set(row.summer, new THREE.Color(row[season]));
  }
  palettes.set(season, map);
  return map;
}

/** A single tint, or a bottom→top pair blended along the part's own height
 * — a pine's trunk going from grey at the foot to orange up in the light is
 * one cylinder, not two that have to be lined up. */
export type PartColor = THREE.Color | [THREE.Color, THREE.Color];

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

export type Point = { x: number; y: number; z: number };

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

/** A LIMB: a cylinder leaning `tilt` radians off vertical toward +x, hinged
 * at `at` — a height on the model's own axis, or a point off it (where a
 * leaning trunk's axis is at that height, `onTrunk`) — and then swung round
 * the up axis by `angle`. Rotated about its own hinge BEFORE it is placed,
 * so it stays on the trunk whatever the angle. Returns where its far end
 * is, for the foliage or the fork that goes there. */
export function limb(
  b: GeoBuilder,
  color: PartColor,
  rTop: number,
  rBot: number,
  len: number,
  at: number | Point,
  tilt: number,
  angle: number,
  seg = 6,
): Point {
  const hinge = typeof at === "number" ? { x: 0, y: at, z: 0 } : at;
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, seg);
  geo.translate(0, len / 2, 0);
  geo.rotateZ(-tilt);
  geo.rotateY(angle);
  geo.translate(hinge.x, hinge.y, hinge.z);
  b.add(geo, color);
  const end = swung(Math.sin(tilt) * len, Math.cos(tilt) * len, angle);
  return { x: hinge.x + end.x, y: hinge.y + end.y, z: hinge.z + end.z };
}

/** A FLUTED cylinder: a column whose cross-section alternates rib and
 * groove, every other facet pulled in to `depth` of the radius. It is the
 * one primitive that separates a CACTUS from a green pipe — a saguaro, an
 * organ pipe and a barrel are all the same accordion of ribs, and a smooth
 * cylinder of the same colour and size reads as plumbing. Cheap: the ribs
 * cost only the extra facets, and the smooth normals a cylinder already
 * carries turn the alternation into a run of soft vertical shading bands
 * rather than a row of hard edges.
 *
 * Standing on its own base, like everything else here, so it drops
 * straight into `cyl`'s and `limb`'s place. */
export function flutedGeo(
  rTop: number,
  rBot: number,
  h: number,
  ribs = 8,
  depth = 0.84,
  open = false,
): THREE.BufferGeometry {
  const seg = ribs * 2;
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const step = (Math.PI * 2) / seg;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (x * x + z * z < 1e-12) continue;
    // three.js lays a cylinder's rim out at theta = k·step measured from
    // +z toward +x, so this recovers the facet's own index — and it is the
    // PARITY of that index, not the angle, that says rib or groove.
    const k = Math.round(Math.atan2(x, z) / step);
    if (((k % 2) + 2) % 2 === 0) continue;
    pos.setXYZ(i, x * depth, pos.getY(i), z * depth);
  }
  geo.computeVertexNormals();
  geo.translate(0, h / 2, 0);
  return geo;
}

/** `limb`, but fluted: the arm of a saguaro rather than the bough of a
 * tree. Same hinge, same returned far end — the arms of a candelabra are
 * a chain of these, each hinged on the last one's end. */
export function ribLimb(
  b: GeoBuilder,
  color: PartColor,
  rTop: number,
  rBot: number,
  len: number,
  at: number | Point,
  tilt: number,
  angle: number,
  ribs = 5,
  open = true,
): Point {
  const hinge = typeof at === "number" ? { x: 0, y: at, z: 0 } : at;
  const geo = flutedGeo(rTop, rBot, len, ribs, 0.84, open);
  geo.rotateZ(-tilt);
  geo.rotateY(angle);
  geo.translate(hinge.x, hinge.y, hinge.z);
  b.add(geo, color);
  const end = swung(Math.sin(tilt) * len, Math.cos(tilt) * len, angle);
  return { x: hinge.x + end.x, y: hinge.y + end.y, z: hinge.z + end.z };
}

/** Accumulates transformed primitives into one non-indexed vertex-colored
 * geometry. Every part gets a per-facet brightness jitter so big single
 * color fields still read as foliage, not plastic. */
export class GeoBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  /** `palette` is the season's, applied as each part goes in: the species
   * recipes name the summer colour they mean and the year does the rest,
   * so nothing in the roster has to know what month it is. */
  constructor(
    private readonly rand: () => number,
    private readonly palette: FloraPalette = new Map(),
  ) {}

  /** A seeded roll, 0–1, for a recipe that varies its SHAPE between builds
   * — which tier leans which way, where a bough grows. The same stream
   * the facet jitter draws from, so a variant's handful of cached builds
   * (flora.ts) are a handful of different trees rather than one tree in
   * three lightings. */
  random(): number {
    return this.rand();
  }

  /** This season's shade of an authored colour. */
  private inSeason(c: THREE.Color): THREE.Color {
    return this.palette.get(c) ?? c;
  }

  /** Merge `geo` in (and dispose it). The part is scaled, then turned
   * about the model origin, then lifted by `o.x/y/z` — so a primitive
   * built standing on the origin pivots on its own base. */
  add(geo: THREE.BufferGeometry, color: PartColor, o: PartOpts = {}): void {
    const tint = Array.isArray(color)
      ? ([this.inSeason(color[0]), this.inSeason(color[1])] as [THREE.Color, THREE.Color])
      : this.inSeason(color);
    const src = geo.toNonIndexed();
    src.computeBoundingBox();
    const box = src.boundingBox as THREE.Box3;
    const spanY = Math.max(box.max.y - box.min.y, 1e-6);
    const minY = box.min.y;
    const grad = Array.isArray(tint);

    this.e.set(o.tiltX ?? 0, o.ry ?? 0, o.tiltZ ?? 0);
    this.q.setFromEuler(this.e);
    this.m.compose(
      new THREE.Vector3(o.x ?? 0, o.y ?? 0, o.z ?? 0),
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
        if (grad) c.copy(tint[0]).lerp(tint[1], (preY[v] - minY) / spanY);
        else c.copy(tint as THREE.Color);
        c.multiplyScalar(jitter);
        this.colors.push(c.r, c.g, c.b);
      }
    }
    src.dispose();
    geo.dispose();
  }

  /** A cone standing on its base at local y = `baseY`, and tilting ABOUT
   * that base: a tier of a spruce leans with the trunk it sits on. */
  cone(color: PartColor, r: number, h: number, baseY: number, o: PartOpts = {}, seg = 6): void {
    const geo = new THREE.ConeGeometry(r, h, seg);
    geo.translate(0, h / 2, 0);
    this.add(geo, color, { ...o, y: baseY });
  }

  /** A cylinder standing on its base at local y = `baseY`, tilting about
   * that base — a bough hinged where it leaves the trunk. */
  cyl(
    color: PartColor,
    rTop: number,
    rBot: number,
    h: number,
    baseY: number,
    o: PartOpts = {},
    seg = 5,
  ): void {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    geo.translate(0, h / 2, 0);
    this.add(geo, color, { ...o, y: baseY });
  }

  /** `cyl`, but fluted (`flutedGeo`): the ribbed column a cactus is. */
  ribbed(
    color: PartColor,
    rTop: number,
    rBot: number,
    h: number,
    baseY: number,
    o: PartOpts = {},
    ribs = 8,
    open = false,
  ): void {
    this.add(flutedGeo(rTop, rBot, h, ribs, 0.84, open), color, { ...o, y: baseY });
  }

  /** A faceted foliage blob centered at (x, y, z). Squash is baked into
   * the geometry before the lift so `sy` never scales the offset itself. */
  blob(color: THREE.Color, r: number, x: number, y: number, z: number, o: PartOpts = {}): void {
    const geo = new THREE.IcosahedronGeometry(r, 0);
    geo.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    this.add(geo, color, { ...o, x, y, z, sx: 1, sy: 1, sz: 1 });
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
